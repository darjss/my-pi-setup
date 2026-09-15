import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const actions = [
  "annotate",
  "annotate-last",
  "plan-review",
  "review-status",
  "code-review",
  "archive",
  "plan-mode",
] as const;

type PlannotatorResponse =
  | { status: "handled"; result: unknown }
  | { status: "unavailable"; error?: string }
  | { status: "error"; error: string };

function localPath(value: string, cwd: string) {
  const path = value.startsWith("@") ? value.slice(1) : value;
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function source(value: string, cwd: string) {
  const normalized = value.startsWith("@") ? value.slice(1) : value;
  return /^https?:\/\//i.test(normalized)
    ? normalized
    : localPath(normalized, cwd);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "plannotator",
    label: "Plannotator",
    description:
      "Open Plannotator for file/URL annotation, the last assistant message, plan review, review status, code review, the archive, or plan-mode control. plan-review requires path; review-status requires reviewId; annotate requires path.",
    promptSnippet:
      "Open Plannotator annotations and reviews, or control Plannotator plan mode",
    parameters: Type.Object({
      action: StringEnum(actions),
      path: Type.Optional(
        Type.String({
          description:
            "File or URL for annotate; file for plan-review; optional archive plan path",
        }),
      ),
      reviewId: Type.Optional(
        Type.String({ description: "Review ID for review-status" }),
      ),
      mode: Type.Optional(
        StringEnum(["enter", "exit", "toggle", "status"] as const, {
          description: "Control for plan-mode",
        }),
      ),
      markdown: Type.Optional(
        Type.String({
          description: "Optional text for annotate or annotate-last",
        }),
      ),
      gate: Type.Optional(
        Type.Boolean({
          description: "Show Approve, Annotate, and Close controls",
        }),
      ),
      diffType: Type.Optional(
        Type.String({
          description: "Official Plannotator diff type for code-review",
        }),
      ),
      defaultBranch: Type.Optional(Type.String()),
      vcsType: Type.Optional(
        StringEnum(["auto", "git", "gitbutler", "jj", "p4"] as const),
      ),
      useLocal: Type.Optional(Type.Boolean()),
      cwd: Type.Optional(
        Type.String({
          description: "Working directory for code-review; defaults to Pi cwd",
        }),
      ),
      prUrl: Type.Optional(
        Type.String({ description: "Pull request URL for code-review" }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      let payload: object;

      switch (params.action) {
        case "annotate": {
          if (!params.path) throw new Error("annotate requires path");
          payload = {
            filePath: source(params.path, ctx.cwd),
            markdown: params.markdown,
            gate: params.gate,
          };
          break;
        }
        case "annotate-last":
          payload = {
            filePath: "last-message",
            markdown: params.markdown,
            gate: params.gate,
          };
          break;
        case "plan-review": {
          if (!params.path) throw new Error("plan-review requires path");
          const planFilePath = localPath(params.path, ctx.cwd);
          const planContent = await readFile(planFilePath, {
            encoding: "utf8",
            signal,
          });
          payload = { planFilePath, planContent, origin: "pi-tool" };
          break;
        }
        case "review-status":
          if (!params.reviewId)
            throw new Error("review-status requires reviewId");
          payload = { reviewId: params.reviewId };
          break;
        case "code-review":
          payload = {
            diffType: params.diffType,
            defaultBranch: params.defaultBranch,
            vcsType: params.vcsType,
            useLocal: params.useLocal,
            cwd: params.cwd ? localPath(params.cwd, ctx.cwd) : ctx.cwd,
            prUrl: params.prUrl,
          };
          break;
        case "archive":
          payload = {
            customPlanPath: params.path
              ? localPath(params.path, ctx.cwd)
              : undefined,
          };
          break;
        case "plan-mode":
          payload = { mode: params.mode ?? "status" };
          break;
      }

      const response = await new Promise<PlannotatorResponse>(
        (accept, reject) => {
          const abort = () =>
            reject(
              signal?.reason ?? new DOMException("Cancelled", "AbortError"),
            );
          if (signal?.aborted) {
            abort();
            return;
          }

          signal?.addEventListener("abort", abort, { once: true });
          pi.events.emit("plannotator:request", {
            requestId: crypto.randomUUID(),
            action: params.action,
            payload,
            respond(result: PlannotatorResponse) {
              signal?.removeEventListener("abort", abort);
              accept(result);
            },
          });
        },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { action: params.action, ...response },
              null,
              2,
            ),
          },
        ],
        details: { action: params.action, response },
      };
    },
  });
}
