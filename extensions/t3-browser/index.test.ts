import assert from "node:assert/strict";
import test from "node:test";

import { createT3BrowserTool, T3BrowserMcpClient } from "./index.ts";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });

test("initializes one MCP session and calls only the selected preview tool", async () => {
  const requests: Array<{
    body?: Record<string, unknown>;
    headers: Headers;
    method: string;
  }> = [];
  const responses = [
    jsonResponse(
      {
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          serverInfo: {},
        },
      },
      { headers: { "mcp-session-id": "mcp-session" } },
    ),
    new Response(null, { status: 202 }),
    jsonResponse({
      jsonrpc: "2.0",
      id: 2,
      result: {
        isError: false,
        structuredContent: { url: "https://example.com" },
        content: [{ type: "text", text: '{"url":"https://example.com"}' }],
      },
    }),
  ];
  const fetchImpl: typeof fetch = async (_input, init) => {
    requests.push({
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      headers: new Headers(init?.headers),
      method: init?.method ?? "GET",
    });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch");
    return response;
  };

  const client = new T3BrowserMcpClient(
    "http://127.0.0.1:13773/mcp",
    "secret",
    fetchImpl,
  );
  const result = await client.call("status", { tabId: "tab-1" });

  assert.equal(requests.length, 3);
  assert.equal(requests[0]?.headers.get("authorization"), "Bearer secret");
  assert.equal(requests[0]?.body?.method, "initialize");
  assert.equal(requests[1]?.body?.method, "notifications/initialized");
  assert.equal(requests[2]?.headers.get("mcp-session-id"), "mcp-session");
  assert.deepEqual(requests[2]?.body, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "preview_status", arguments: { tabId: "tab-1" } },
  });
  assert.deepEqual(result.structuredContent, { url: "https://example.com" });
});

test("the Pi tool keeps the MCP surface behind one allowlisted tool", async () => {
  const client = {
    call: async () => ({
      isError: false,
      content: [
        { type: "text" as const, text: "Page ready" },
        { type: "image" as const, data: "cG5n", mimeType: "image/png" },
      ],
      structuredContent: { title: "Page" },
    }),
  };
  const tool = createT3BrowserTool(client);
  const result = await tool.execute(
    "call-1",
    { operation: "snapshot", input: {} },
    undefined,
  );

  assert.equal(tool.name, "t3_browser");
  assert.deepEqual(result.content, [
    { type: "text", text: "Page ready" },
    { type: "image", data: "cG5n", mimeType: "image/png" },
  ]);
  assert.deepEqual(result.details.structuredContent, { title: "Page" });
});
