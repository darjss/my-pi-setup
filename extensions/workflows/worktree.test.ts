import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { parseWorktreeOptions, WorkflowWorktreeManager } from "./worktree.ts";

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-worktree-"));
  const repo = path.join(directory, "repo");
  const runDir = path.join(directory, "artifacts");
  fs.mkdirSync(repo);
  git(repo, "init", "-q");
  git(repo, "config", "user.name", "Workflow Test");
  git(repo, "config", "user.email", "workflow@example.test");
  fs.writeFileSync(path.join(repo, ".gitignore"), ".env.local\n");
  fs.writeFileSync(path.join(repo, "app.txt"), "base\n");
  fs.writeFileSync(path.join(repo, ".env.local"), "TOKEN=fixture\n");
  git(repo, "add", ".gitignore", "app.txt");
  git(repo, "commit", "-qm", "base");
  const manager = new WorkflowWorktreeManager({
    cwd: repo,
    runDir,
    runId: "wf_test",
  });
  return { directory, repo, runDir, manager };
}

test("worktree writers receive setup and env files, then publish a clean commit", async (t) => {
  const { directory, repo, runDir, manager } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const worktree = await manager.prepare(
    1,
    {
      type: "worktree",
      setup: [
        `node -e "require('node:fs').writeFileSync('setup-marker.txt', 'ready')"`,
      ],
      envFiles: [".env.local"],
    },
    new AbortController().signal,
  );

  assert.equal(
    fs.readFileSync(path.join(worktree.cwd, ".env.local"), "utf8"),
    "TOKEN=fixture\n",
  );
  assert.equal(
    fs.readFileSync(path.join(worktree.cwd, "setup-marker.txt"), "utf8"),
    "ready",
  );
  fs.writeFileSync(path.join(worktree.cwd, "app.txt"), "writer\n");
  git(worktree.cwd, "add", "app.txt", "setup-marker.txt");
  git(worktree.cwd, "commit", "-qm", "writer change");

  const details = await manager.finish(worktree);
  assert.equal(details.preserved, false);
  assert.equal(fs.existsSync(worktree.root), false);
  assert.ok(details.headCommit);
  assert.deepEqual(details.changedFiles, ["app.txt", "setup-marker.txt"]);
  assert.equal(git(repo, "rev-parse", details.branch), details.headCommit);
  assert.match(
    fs.readFileSync(path.join(runDir, details.setupLog!), "utf8"),
    /setup-marker/,
  );
});

test("worktree verification preserves uncommitted writer changes", async (t) => {
  const { directory, manager } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const worktree = await manager.prepare(
    2,
    { type: "worktree", setup: [], envFiles: [] },
    new AbortController().signal,
  );
  fs.writeFileSync(path.join(worktree.cwd, "app.txt"), "dirty\n");

  await assert.rejects(
    manager.finish(worktree),
    /finished with uncommitted changes/,
  );
  assert.equal(fs.existsSync(worktree.root), true);
  assert.equal(worktree.details.preserved, true);
});

test("worktree options accept shorthand and reject unsafe setup shapes", () => {
  assert.deepEqual(parseWorktreeOptions("worktree"), {
    type: "worktree",
    setup: [],
    envFiles: [],
  });
  assert.throws(
    () => parseWorktreeOptions({ type: "worktree", setup: "vp install" }),
    /array of strings/,
  );
  assert.throws(
    () =>
      parseWorktreeOptions({
        type: "worktree",
        envFiles: [
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
          "g",
          "h",
          "i",
          "j",
          "k",
          "l",
          "m",
          "n",
          "o",
          "p",
          "q",
        ],
      }),
    /at most 16/,
  );
});
