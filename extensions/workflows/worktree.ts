import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { writeFileAtomic } from "./serialization.ts";

const MAX_SETUP_COMMANDS = 8;
const MAX_SETUP_COMMAND_LENGTH = 4_096;
const MAX_ENV_FILES = 16;
const SETUP_TIMEOUT_MS = 10 * 60 * 1_000;
const OUTPUT_MAX_BYTES = 64 * 1_024;

export interface WorktreeOptions {
  type: "worktree";
  setup: string[];
  envFiles: string[];
}

export interface WorktreeDetails {
  type: "worktree";
  path: string;
  branch: string;
  baseCommit: string;
  headCommit?: string;
  changedFiles?: string[];
  setupLog?: string;
  preserved: boolean;
}

export interface PreparedWorktree {
  cwd: string;
  root: string;
  details: WorktreeDetails;
}

export class WorktreePreparationError extends Error {
  readonly workspace?: WorktreeDetails;

  constructor(message: string, workspace?: WorktreeDetails) {
    super(message);
    this.name = "WorktreePreparationError";
    this.workspace = workspace;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, name: string, limit: number) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`workspace.${name} must be an array of strings`);
  }
  if (value.length > limit) {
    throw new Error(`workspace.${name} may contain at most ${limit} entries`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export function parseWorktreeOptions(value: unknown) {
  if (value === undefined) return undefined;
  if (value === "worktree") {
    return {
      type: "worktree",
      setup: [],
      envFiles: [],
    } satisfies WorktreeOptions;
  }
  if (!isRecord(value) || value.type !== "worktree") {
    throw new Error(
      'workspace must be "worktree" or an object with type "worktree"',
    );
  }
  const setup = stringArray(value.setup, "setup", MAX_SETUP_COMMANDS);
  if (setup.some((command) => command.length > MAX_SETUP_COMMAND_LENGTH)) {
    throw new Error(
      `workspace.setup commands may not exceed ${MAX_SETUP_COMMAND_LENGTH} characters`,
    );
  }
  return {
    type: "worktree",
    setup,
    envFiles: stringArray(value.envFiles, "envFiles", MAX_ENV_FILES),
  } satisfies WorktreeOptions;
}

function outputText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function appendBounded(current: string, chunk: unknown) {
  const next = current + String(chunk);
  const bytes = Buffer.byteLength(next, "utf8");
  if (bytes <= OUTPUT_MAX_BYTES) return next;
  const buffer = Buffer.from(next, "utf8");
  return `[earlier output truncated]\n${buffer.subarray(bytes - OUTPUT_MAX_BYTES).toString("utf8")}`;
}

function killProcess(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  } else {
    child.kill("SIGTERM");
  }
}

function runProcess(options: {
  command: string;
  args?: string[];
  cwd: string;
  shell?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      shell: options.shell ?? false,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve({ stdout, stderr });
    };
    const stop = (error: Error) => {
      killProcess(child);
      const forceTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          if (process.platform !== "win32" && child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          } else {
            child.kill("SIGKILL");
          }
        }
      }, 1_000);
      forceTimer.unref?.();
      finish(error);
    };
    const onAbort = () => stop(new Error("Worktree setup was aborted"));
    const timer = setTimeout(
      () => stop(new Error("Worktree setup timed out")),
      options.timeoutMs ?? SETUP_TIMEOUT_MS,
    );
    timer.unref?.();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    child.stdout?.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on("error", (error) => finish(error));
    child.on("exit", (code, exitSignal) => {
      if (settled) return;
      if (code === 0) finish();
      else {
        finish(
          new Error(
            `Command failed (${exitSignal ?? code ?? "unknown"})${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
          ),
        );
      }
    });
  });
}

async function git(cwd: string, args: string[], signal?: AbortSignal) {
  return runProcess({ command: "git", args, cwd, signal, timeoutMs: 60_000 });
}

function resolveInside(base: string, relativePath: string, name: string) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${name} must be a non-empty relative path`);
  }
  const resolved = path.resolve(base, relativePath);
  const prefix = `${path.resolve(base)}${path.sep}`;
  if (!resolved.startsWith(prefix)) {
    throw new Error(`${name} must stay inside the project directory`);
  }
  return resolved;
}

export class WorkflowWorktreeManager {
  private initialized?: Promise<{
    repoRoot: string;
    relativeCwd: string;
    baseCommit: string;
  }>;
  private gitQueue: Promise<unknown> = Promise.resolve();
  private readonly options: {
    cwd: string;
    runDir: string;
    runId: string;
  };

  constructor(options: { cwd: string; runDir: string; runId: string }) {
    this.options = options;
  }

  private serializeGit<T>(operation: () => Promise<T>) {
    const running = this.gitQueue.then(operation, operation);
    this.gitQueue = running.then(
      () => undefined,
      () => undefined,
    );
    return running;
  }

  private getRepository() {
    this.initialized ??= this.serializeGit(async () => {
      const root = await git(this.options.cwd, [
        "rev-parse",
        "--show-toplevel",
      ]);
      const repoRoot = root.stdout.trim();
      if (!repoRoot)
        throw new Error("Workflow worktrees require a Git repository");
      const status = await git(repoRoot, [
        "status",
        "--porcelain",
        "--untracked-files=no",
      ]);
      if (status.stdout.trim()) {
        throw new Error(
          "Workflow worktrees require a checkout with no tracked modifications",
        );
      }
      const head = await git(repoRoot, ["rev-parse", "HEAD"]);
      return {
        repoRoot,
        relativeCwd: path.relative(repoRoot, this.options.cwd),
        baseCommit: head.stdout.trim(),
      };
    });
    return this.initialized;
  }

  async prepare(
    index: number,
    config: WorktreeOptions,
    signal: AbortSignal,
  ): Promise<PreparedWorktree> {
    const repository = await this.getRepository();
    const branch = `pi-workflow/${this.options.runId}/${index}`;
    const root = path.join(this.options.runDir, "worktrees", String(index));
    const details: WorktreeDetails = {
      type: "worktree",
      path: root,
      branch,
      baseCommit: repository.baseCommit,
      preserved: true,
    };

    try {
      await this.serializeGit(async () => {
        fs.mkdirSync(path.dirname(root), { recursive: true });
        await git(
          repository.repoRoot,
          ["worktree", "add", "-b", branch, root, repository.baseCommit],
          signal,
        );
      });

      const cwd = path.join(root, repository.relativeCwd);
      for (const relativePath of config.envFiles) {
        const source = resolveInside(
          this.options.cwd,
          relativePath,
          "env file",
        );
        const destination = resolveInside(cwd, relativePath, "env file");
        const stat = fs.lstatSync(source);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new Error(`env file must be a regular file: ${relativePath}`);
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
        fs.chmodSync(destination, stat.mode);
        const relativeDestination = path.relative(root, destination);
        const status = await git(
          root,
          [
            "status",
            "--porcelain",
            "--untracked-files=all",
            "--",
            relativeDestination,
          ],
          signal,
        );
        if (status.stdout.trim()) {
          throw new Error(
            `env file must be tracked unchanged or ignored: ${relativePath}`,
          );
        }
      }

      if (config.setup.length > 0) {
        let log = "";
        const relativeLog = path.join("setup", `${index}.log`);
        details.setupLog = relativeLog;
        for (const command of config.setup) {
          log += `$ ${command}\n`;
          try {
            const result = await runProcess({
              command,
              cwd,
              shell: true,
              signal,
            });
            log += `${result.stdout}${result.stderr}`;
          } catch (error) {
            log += `${outputText(error)}\n`;
            throw error;
          } finally {
            log = appendBounded("", log);
            writeFileAtomic(path.join(this.options.runDir, relativeLog), log);
          }
        }
      }

      return { cwd, root, details };
    } catch (error) {
      throw new WorktreePreparationError(
        `Failed to prepare worktree for agent ${index}: ${outputText(error)}`,
        fs.existsSync(root) ? details : undefined,
      );
    }
  }

  async finish(worktree: PreparedWorktree) {
    const repository = await this.getRepository();
    const branchResult = await git(worktree.root, ["branch", "--show-current"]);
    if (branchResult.stdout.trim() !== worktree.details.branch) {
      throw new Error("Writer switched away from its assigned branch");
    }
    const status = await git(worktree.root, [
      "status",
      "--porcelain",
      "--untracked-files=all",
    ]);
    if (status.stdout.trim()) {
      throw new Error("Writer finished with uncommitted changes");
    }
    const headResult = await git(worktree.root, ["rev-parse", "HEAD"]);
    const headCommit = headResult.stdout.trim();
    if (headCommit === worktree.details.baseCommit) {
      throw new Error("Writer finished without creating a commit");
    }
    const changed = await git(worktree.root, [
      "diff",
      "--name-only",
      `${worktree.details.baseCommit}...${headCommit}`,
    ]);
    worktree.details.headCommit = headCommit;
    worktree.details.changedFiles = changed.stdout
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean);

    await this.serializeGit(() =>
      git(repository.repoRoot, [
        "worktree",
        "remove",
        "--force",
        worktree.root,
      ]),
    );
    worktree.details.preserved = false;
    return worktree.details;
  }
}
