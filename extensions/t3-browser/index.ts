import { StringEnum } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type ExtensionAPI,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const T3_BROWSER_OPERATIONS = [
  "status",
  "open",
  "navigate",
  "resize",
  "set_appearance",
  "snapshot",
  "click",
  "type",
  "press",
  "scroll",
  "evaluate",
  "wait_for",
  "recording_start",
  "recording_stop",
] as const;

type T3BrowserOperation = (typeof T3_BROWSER_OPERATIONS)[number];

const MCP_TOOL_BY_OPERATION = {
  status: "preview_status",
  open: "preview_open",
  navigate: "preview_navigate",
  resize: "preview_resize",
  set_appearance: "preview_set_appearance",
  snapshot: "preview_snapshot",
  click: "preview_click",
  type: "preview_type",
  press: "preview_press",
  scroll: "preview_scroll",
  evaluate: "preview_evaluate",
  wait_for: "preview_wait_for",
  recording_start: "preview_recording_start",
  recording_stop: "preview_recording_stop",
} satisfies Record<T3BrowserOperation, string>;

const T3BrowserParameters = Type.Object({
  operation: StringEnum(T3_BROWSER_OPERATIONS, {
    description: "Browser operation to run in T3 Code's collaborative preview",
  }),
  input: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description:
        "Arguments for the operation. Common fields: tabId; open uses open/reuseExistingTab; navigate uses url or target; resize uses mode/width/height/preset/orientation; click/type/wait_for use locator or selector; type uses text/clear; press uses key/modifiers; scroll uses deltaX/deltaY; evaluate uses expression.",
    }),
  ),
});

export type T3BrowserInput = Static<typeof T3BrowserParameters>;

interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

interface McpTextContent {
  readonly type: "text";
  readonly text: string;
}

interface McpImageContent {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
}

interface McpOtherContent {
  readonly type: string;
  readonly [key: string]: unknown;
}

type McpContent = McpTextContent | McpImageContent | McpOtherContent;

export interface McpToolResult {
  readonly isError?: boolean;
  readonly content?: readonly McpContent[];
  readonly structuredContent?: unknown;
}

interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

class McpSessionExpiredError extends Error {}

export interface T3BrowserClient {
  readonly call: (
    operation: T3BrowserOperation,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<McpToolResult>;
}

const parseJsonRpcBody = async (response: Response, requestId: number) => {
  const body = await response.text();
  if (body.trim().length === 0) {
    throw new Error("T3 browser MCP returned an empty response.");
  }

  const candidates = response.headers
    .get("content-type")
    ?.includes("text/event-stream")
    ? body
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
    : [body];

  for (const candidate of candidates) {
    if (!candidate || candidate === "[DONE]") continue;
    const message = JSON.parse(candidate) as JsonRpcResponse;
    if (message.id === requestId) return message;
  }
  throw new Error(
    `T3 browser MCP did not return response ${String(requestId)}.`,
  );
};

export class T3BrowserMcpClient implements T3BrowserClient {
  private readonly endpoint: string;
  private readonly bearerToken: string;
  private readonly fetchImpl: typeof fetch;
  private sessionId: string | undefined;
  private initialization: Promise<string> | undefined;
  private nextRequestId = 1;

  constructor(
    endpoint: string,
    bearerToken: string,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.endpoint = endpoint;
    this.bearerToken = bearerToken;
    this.fetchImpl = fetchImpl;
  }

  private headers(sessionId?: string) {
    return {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${this.bearerToken}`,
      "content-type": "application/json",
      ...(sessionId
        ? {
            "mcp-protocol-version": MCP_PROTOCOL_VERSION,
            "mcp-session-id": sessionId,
          }
        : {}),
    };
  }

  private async post(
    payload: object,
    signal: AbortSignal | undefined,
    sessionId?: string,
  ) {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: this.headers(sessionId),
      body: JSON.stringify(payload),
      signal,
    });
    if (response.status === 404 && sessionId)
      throw new McpSessionExpiredError();
    if (response.status === 401) {
      throw new Error(
        "T3 rejected the browser credential. Start a new T3 Pi session.",
      );
    }
    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new Error(
        `T3 browser MCP request failed (${String(response.status)})${detail ? `: ${detail}` : "."}`,
      );
    }
    return response;
  }

  private async initialize(signal?: AbortSignal) {
    if (this.sessionId) return this.sessionId;
    if (this.initialization) return this.initialization;

    this.initialization = (async () => {
      const requestId = this.nextRequestId++;
      const response = await this.post(
        {
          jsonrpc: "2.0",
          id: requestId,
          method: "initialize",
          params: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "pi-t3-browser", version: "1.0.0" },
          },
        },
        signal,
      );
      const message = await parseJsonRpcBody(response, requestId);
      if (message.error)
        throw new Error(`T3 browser MCP: ${message.error.message}`);
      const sessionId = response.headers.get("mcp-session-id")?.trim();
      if (!sessionId)
        throw new Error("T3 browser MCP did not issue a session id.");

      const initialized = await this.post(
        { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
        signal,
        sessionId,
      );
      await initialized.body?.cancel();
      this.sessionId = sessionId;
      return sessionId;
    })().finally(() => {
      this.initialization = undefined;
    });

    return this.initialization;
  }

  async call(
    operation: T3BrowserOperation,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sessionId = await this.initialize(signal);
      const requestId = this.nextRequestId++;
      try {
        const response = await this.post(
          {
            jsonrpc: "2.0",
            id: requestId,
            method: "tools/call",
            params: {
              name: MCP_TOOL_BY_OPERATION[operation],
              arguments: input,
            },
          },
          signal,
          sessionId,
        );
        const message = await parseJsonRpcBody(response, requestId);
        if (message.error)
          throw new Error(`T3 browser MCP: ${message.error.message}`);
        return message.result as McpToolResult;
      } catch (error) {
        if (!(error instanceof McpSessionExpiredError) || attempt === 1)
          throw error;
        this.sessionId = undefined;
      }
    }
    throw new Error("T3 browser MCP session could not be restored.");
  }

  async close() {
    const sessionId = this.sessionId;
    this.sessionId = undefined;
    if (!sessionId) return;
    await this.fetchImpl(this.endpoint, {
      method: "DELETE",
      headers: this.headers(sessionId),
    }).catch(() => undefined);
  }
}

const formatToolResult = (
  operation: T3BrowserOperation,
  result: McpToolResult,
) => {
  const text = (result.content ?? []).flatMap((content) =>
    content.type === "text" ? [content.text] : [],
  );
  if (result.isError) {
    throw new Error(
      text.join("\n").trim() || `T3 browser ${operation} failed.`,
    );
  }

  const fallback =
    text.length === 0 && result.structuredContent !== undefined
      ? JSON.stringify(result.structuredContent)
      : "";
  const truncation = truncateHead(
    [...text, fallback].filter(Boolean).join("\n"),
    {
      maxLines: DEFAULT_MAX_LINES,
      maxBytes: DEFAULT_MAX_BYTES,
    },
  );
  const content: Array<McpTextContent | McpImageContent> = [];
  if (truncation.content) {
    content.push({
      type: "text",
      text: truncation.truncated
        ? `${truncation.content}\n\n[Output truncated to ${String(DEFAULT_MAX_LINES)} lines or ${String(DEFAULT_MAX_BYTES)} bytes.]`
        : truncation.content,
    });
  }
  for (const item of result.content ?? []) {
    if (
      item.type === "image" &&
      typeof item.data === "string" &&
      typeof item.mimeType === "string"
    ) {
      content.push({ type: "image", data: item.data, mimeType: item.mimeType });
    }
  }
  if (content.length === 0)
    content.push({ type: "text", text: `${operation} completed.` });

  return {
    content,
    details: {
      operation,
      structuredContent: result.structuredContent,
      truncated: truncation.truncated,
    },
  };
};

export const createT3BrowserTool = (client: T3BrowserClient) => ({
  name: "t3_browser",
  label: "T3 Browser",
  description:
    "Control the browser preview attached to this T3 Code thread. One call performs one allowlisted operation: status, open, navigate, resize, set_appearance, snapshot, click, type, press, scroll, evaluate, wait_for, recording_start, or recording_stop. Use snapshot before interacting. Output is truncated to 2000 lines or 50KB.",
  promptSnippet:
    "Inspect and control this T3 Code thread's collaborative browser preview",
  promptGuidelines: [
    "Use t3_browser instead of other browser tools when working inside a T3 Code-hosted Pi session.",
    "Use t3_browser with operation snapshot before clicking, typing, pressing keys, scrolling, or evaluating code.",
  ],
  parameters: T3BrowserParameters,
  async execute(
    _toolCallId: string,
    params: T3BrowserInput,
    signal: AbortSignal | undefined,
  ) {
    const result = await client.call(
      params.operation,
      params.input ?? {},
      signal,
    );
    return formatToolResult(params.operation, result);
  },
});

export default function t3Browser(pi: ExtensionAPI) {
  const endpoint = process.env.T3_BROWSER_MCP_ENDPOINT?.trim();
  const bearerToken = process.env.T3_BROWSER_MCP_BEARER_TOKEN?.trim();
  if (!endpoint || !bearerToken) return;

  const client = new T3BrowserMcpClient(endpoint, bearerToken);
  pi.registerTool(createT3BrowserTool(client));
  pi.on("session_shutdown", async () => {
    await client.close();
  });
}
