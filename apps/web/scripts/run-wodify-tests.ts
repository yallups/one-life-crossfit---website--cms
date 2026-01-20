#!/usr/bin/env node

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT_CANDIDATES = [3000, 3001, 3002];
const STARTUP_RETRIES = 45;
const RETRY_DELAY_MS = 2000;

function log(msg: string) {
  console.log(`[wodify:test] ${msg}`);
}

function buildUrl(port: number) {
  return `http://localhost:${port}/api/test-wodify`;
}

async function ping(port: number): Promise<boolean> {
  try {
    const res = await fetch(buildUrl(port), { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(port: number): Promise<void> {
  for (let i = 0; i < STARTUP_RETRIES; i += 1) {
    if (await ping(port)) return;
    await delay(RETRY_DELAY_MS);
  }
  throw new Error(`Timed out waiting for Next.js dev server on port ${port}.`);
}

async function waitForServerOrExit(
  port: number,
  proc: ReturnType<typeof spawn>,
): Promise<void> {
  const exitPromise = new Promise<void>((_, reject) => {
    proc.once("exit", () =>
      reject(new Error("Dev server exited before ready.")),
    );
  });

  await Promise.race([waitForServer(port), exitPromise]);
}

async function main() {
  for (const port of PORT_CANDIDATES) {
    if (await ping(port)) {
      log(`Using existing dev server on port ${port}.`);
      await runTests(port);
      return;
    }
  }

  for (const port of PORT_CANDIDATES) {
    log(`Starting Next.js dev server on port ${port}...`);
    const dev = spawn("pnpm", ["-C", "apps/web", "dev"], {
      stdio: "inherit",
      env: { ...process.env, PORT: String(port) },
    });

    const shutdown = () => {
      if (!dev.killed) dev.kill("SIGINT");
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("exit", shutdown);

    try {
      await waitForServerOrExit(port, dev);
      await runTests(port);
      return;
    } catch (err) {
      shutdown();
      await delay(500);
      continue;
    }
  }

  throw new Error("Unable to start Next.js dev server on any candidate port.");
}

async function runTests(port: number) {
  log("Running Wodify API tests...");
  const res = await fetch(buildUrl(port), { method: "GET" });
  if (!res.ok) throw new Error(`Test endpoint failed: ${res.status}`);
  const data = await res.json();

  const summary = data?.summary ?? {};
  const diagnosis = data?.diagnosis ?? [];
  const failed = Number(summary.failed ?? 0);

  log(`Summary: ${JSON.stringify(summary)}`);
  if (diagnosis.length) {
    log(`Diagnosis: ${diagnosis.join(" | ")}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  log(`Fatal error: ${err?.message ?? err}`);
  process.exit(1);
});
