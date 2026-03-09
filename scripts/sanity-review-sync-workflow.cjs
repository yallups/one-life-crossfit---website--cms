#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const command = process.argv[2];
const passthroughArgs = process.argv.slice(3);

const usage = () => {
  console.log(`Usage:
  node scripts/sanity-review-sync-workflow.cjs prepare
  node scripts/sanity-review-sync-workflow.cjs apply [--dry-run] [--skip-faqs] [--skip-pages] [--skip-navbar]

Workflow:
  prepare  Require a clean git tree, pull Sanity drafts into local markdown, then stop for review.
  apply    Require a clean git tree, then push local markdown content back to Sanity drafts.
`);
};

const IGNORED_STATUS_PREFIXES = ["content-backups/"];

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const capture = (cmd, args) => {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status || 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
};

const normalizeStatusPath = (line) => {
  const raw = line.slice(3).trim();
  if (!raw) return "";
  const renamed = raw.split(" -> ");
  return renamed[renamed.length - 1].trim();
};

const getMeaningfulStatusLines = () => {
  const status = capture("git", ["status", "--short"]);
  if (status.status !== 0) {
    process.stderr.write(status.stderr);
    process.exit(status.status);
  }
  return status.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => {
      const filePath = normalizeStatusPath(line);
      return !IGNORED_STATUS_PREFIXES.some((prefix) => filePath.startsWith(prefix));
    });
};

const ensureCleanTree = () => {
  const lines = getMeaningfulStatusLines();
  if (!lines.length) return;

  console.error("Working tree must be clean before running this workflow.");
  console.error("Commit or stash your local changes first.");
  console.error("");
  console.error(lines.join("\n"));
  process.exit(1);
};

const showDiffSummary = () => {
  const lines = getMeaningfulStatusLines();
  if (!lines.length) {
    console.log("Sanity pull completed. No local markdown changes were produced.");
    console.log("If that looks right, you can run `pnpm sanity:apply-sync`.");
    return;
  }

  console.log("Sanity pull updated local files. Review the diff before applying anything back to Sanity.");
  console.log("");
  console.log(lines.join("\n"));
  console.log("");
  console.log("Next steps:");
  console.log("1. Review `git diff`.");
  console.log("2. Commit the pulled changes you want to keep.");
  console.log("3. Run `pnpm sanity:apply-sync` to push approved local content to Sanity drafts.");
};

const main = () => {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    usage();
    return;
  }

  if (command === "prepare") {
    ensureCleanTree();
    run(process.execPath, [path.join(rootDir, "scripts/sanity-sync-md-from-drafts.cjs")]);
    showDiffSummary();
    return;
  }

  if (command === "apply") {
    ensureCleanTree();
    run(process.execPath, [
      path.join(rootDir, "scripts/sanity-sync-drafts.cjs"),
      ...passthroughArgs,
    ]);
    return;
  }

  usage();
  process.exit(1);
};

main();
