import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = join(root, ".runtime");
const pidFile = join(runtime, "wrangler.pid");
const generatedPaths = [join(root, "dist"), join(root, ".wrangler"), join(runtime, "cloudflare"), join(runtime, "cache")];

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function commandFor(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function parsePids(output) {
  return [...new Set(output.split(/\s+/).map((value) => Number.parseInt(value, 10)).filter((value) => Number.isInteger(value) && value > 1))];
}

function listenerPids(port) {
  try {
    if (process.platform === "win32") {
      const script = `(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ' '`;
      return parsePids(execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }));
    }

    return parsePids(execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }));
  } catch {
    return [];
  }
}

function repoWranglerPids() {
  if (process.platform === "win32") return [];
  try {
    const rows = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" }).split("\n");
    return rows.flatMap((row) => {
      const match = row.trim().match(/^(\d+)\s+(.+)$/);
      if (!match) return [];
      const pid = Number.parseInt(match[1], 10);
      const command = match[2];
      return pid !== process.pid && command.includes(root) && command.includes("wrangler") ? [pid] : [];
    });
  } catch {
    return [];
  }
}

function killPid(pid, force = false) {
  if (!isRunning(pid)) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])], { stdio: "ignore" });
    } catch {
      // The process may already be gone by the time taskkill runs.
    }
    return;
  }

  try {
    process.kill(pid, force ? "SIGKILL" : "SIGTERM");
  } catch {
    // The process may already be gone.
  }
}

async function killPids(pids, label) {
  const live = [...new Set(pids)].filter((pid) => isRunning(pid));
  if (live.length === 0) return;

  console.log(`teardown: terminating ${label}: ${live.join(", ")}`);
  for (const pid of live) killPid(pid, false);
  await wait(400);

  const survivors = live.filter((pid) => isRunning(pid));
  if (survivors.length > 0) {
    console.log(`teardown: force killing ${label}: ${survivors.join(", ")}`);
    for (const pid of survivors) killPid(pid, true);
    await wait(150);
  }
}

function portFree(port, host = "127.0.0.1") {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.once("listening", () => probe.close(() => done(true)));
    probe.listen(port, host);
  });
}

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function runtimeResponding(url) {
  return new Promise((done) => {
    const request = get(url, (response) => {
      response.resume();
      done(true);
    });
    request.setTimeout(500, () => {
      request.destroy();
      done(false);
    });
    request.once("error", () => done(false));
  });
}

async function waitForRuntime(url, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await runtimeResponding(url)) return;
    await wait(100);
  }
  throw new Error(`Local Cloudflare runtime did not become reachable at ${url}`);
}

function openBrowser(url) {
  if (process.env.SVGLAB_NO_OPEN === "1") {
    console.log(`browser: skipped (SVGLAB_NO_OPEN=1); open ${url}`);
    return;
  }

  let command;
  let args;
  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  const opener = spawn(command, args, { detached: true, stdio: "ignore" });
  opener.unref();
  console.log(`browser: opened ${url}`);
}

async function teardown() {
  const port = Number(process.env.SVGLAB_PORT ?? "8787");
  const pids = new Set(repoWranglerPids());

  if (existsSync(pidFile)) {
    const recordedPid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
    if (Number.isInteger(recordedPid) && recordedPid > 1) {
      const command = commandFor(recordedPid);
      if (command.includes(root) && command.includes("wrangler")) pids.add(recordedPid);
    }
  }

  for (const pid of listenerPids(port)) pids.add(pid);

  if (pids.size === 0) {
    console.log(`teardown: nothing running on local port ${port}`);
  } else {
    await killPids([...pids], `local lab processes on port ${port}`);
  }

  rmSync(pidFile, { force: true });

  if (!(await portFree(port))) {
    const remaining = listenerPids(port);
    fail([
      `teardown: could not reclaim local port ${port}`,
      remaining.length > 0 ? `remaining listener PIDs: ${remaining.join(", ")}` : "the port is still occupied",
      "This lab is intentionally destructive, but the remaining process may require higher OS permissions.",
    ]);
  }

  console.log(`teardown: local port ${port} is clear`);
}

function reset() {
  for (const target of generatedPaths) {
    if (!resolve(target).startsWith(`${resolve(root)}/`)) throw new Error(`Unsafe reset target: ${target}`);
    rmSync(target, { recursive: true, force: true });
  }
  mkdirSync(runtime, { recursive: true });
  console.log("reset: cleared dist, Wrangler state, and disposable runtime state");
}

function build() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", "build"], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function launch({ open = false } = {}) {
  mkdirSync(runtime, { recursive: true });
  const executable = join(root, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  if (!existsSync(executable)) throw new Error("Dependencies are missing. Run npm install first.");
  const port = process.env.SVGLAB_PORT ?? "8787";

  if (!(await portFree(Number(port)))) {
    await killPids(listenerPids(Number(port)), `unexpected listeners on port ${port}`);
  }
  if (!(await portFree(Number(port)))) {
    fail([`launch: local port ${port} is still occupied after destructive cleanup`]);
  }

  const child = spawn(executable, [
    "dev",
    "--local",
    "--config",
    join(root, "wrangler.local.jsonc"),
    "--persist-to",
    join(runtime, "cloudflare"),
    "--port",
    port,
  ], {
    cwd: root,
    detached: process.platform !== "win32",
    stdio: "inherit",
  });

  writeFileSync(pidFile, String(child.pid), "utf8");
  const url = `http://127.0.0.1:${port}/`;
  console.log(`launch: local Cloudflare runtime starting at ${url}`);

  const stop = (signal) => {
    if (child.exitCode === null) child.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  child.once("close", (code) => {
    rmSync(pidFile, { force: true });
    process.exit(code ?? 0);
  });
  child.once("error", (error) => {
    rmSync(pidFile, { force: true });
    throw error;
  });

  if (open) {
    await waitForRuntime(url);
    openBrowser(url);
  }
}

const command = process.argv[2];
if (command === "teardown") await teardown();
else if (command === "reset") reset();
else if (command === "launch") await launch();
else if (command === "dev") {
  console.log("dev: destructive teardown → reset → rebuild → local Cloudflare launch → browser");
  await teardown();
  reset();
  build();
  await launch({ open: true });
} else {
  throw new Error("Usage: node scripts/lifecycle.mjs <teardown|reset|launch|dev>");
}
