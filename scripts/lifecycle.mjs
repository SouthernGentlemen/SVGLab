import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoName = basename(root);
const runtime = join(root, ".runtime");
const pidFile = join(runtime, "wrangler.pid");
const generatedPaths = [join(root, "dist"), join(root, "out"), join(root, ".wrangler"), join(runtime, "cloudflare"), join(runtime, "cache")];

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

function processRows() {
  if (process.platform === "win32") return [];
  try {
    return execFileSync("ps", ["-axo", "pid=,ppid=,pgid=,command="], { encoding: "utf8" })
      .split("\n")
      .flatMap((row) => {
        const match = row.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
        if (!match) return [];
        return [{
          pid: Number.parseInt(match[1], 10),
          ppid: Number.parseInt(match[2], 10),
          pgid: Number.parseInt(match[3], 10),
          command: match[4],
        }];
      });
  } catch {
    return [];
  }
}

function svglabRuntimePids(rows = processRows()) {
  return rows.flatMap(({ pid, command }) => {
    if (pid === process.pid || !command.includes(repoName)) return [];
    return /(?:wrangler|workerd|lifecycle\.mjs)/i.test(command) ? [pid] : [];
  });
}

function descendantsOf(seedPids, rows) {
  const descendants = new Set(seedPids);
  let added = true;
  while (added) {
    added = false;
    for (const row of rows) {
      if (!descendants.has(row.pid) && descendants.has(row.ppid)) {
        descendants.add(row.pid);
        added = true;
      }
    }
  }
  return [...descendants];
}

function currentProcessGroup(rows = processRows()) {
  return rows.find((row) => row.pid === process.pid)?.pgid ?? null;
}

function signalPid(pid, force = false) {
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
    // The process may already be gone or may require higher OS permissions.
  }
}

function signalGroup(pgid, force = false) {
  if (process.platform === "win32" || !Number.isInteger(pgid) || pgid <= 1) return;
  try {
    process.kill(-pgid, force ? "SIGKILL" : "SIGTERM");
  } catch {
    // The group may already be gone or may require higher OS permissions.
  }
}

async function signalTrees(seedPids, label, force = false) {
  const rows = processRows();
  const currentPgid = currentProcessGroup(rows);
  const targets = descendantsOf([...new Set(seedPids)].filter((pid) => pid !== process.pid), rows)
    .filter((pid) => pid !== process.pid);
  if (targets.length === 0) return;

  const groups = new Set();
  for (const pid of targets) {
    const pgid = rows.find((row) => row.pid === pid)?.pgid;
    if (Number.isInteger(pgid) && pgid > 1 && pgid !== currentPgid) groups.add(pgid);
  }

  console.log(`teardown: ${force ? "force killing" : "terminating"} ${label}: ${targets.join(", ")}`);
  for (const pgid of groups) signalGroup(pgid, force);
  for (const pid of targets) signalPid(pid, force);
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

function recordedRuntimePid() {
  if (!existsSync(pidFile)) return null;
  const pid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
  if (!Number.isInteger(pid) || pid <= 1 || !isRunning(pid)) return null;
  const command = commandFor(pid);
  return /(?:wrangler|workerd)/i.test(command) ? pid : null;
}

async function reclaimLocalRuntime(port, label = "local lab runtime") {
  const deadline = Date.now() + 6_000;
  let pass = 0;
  let touched = false;

  while (Date.now() < deadline) {
    pass += 1;
    const rows = processRows();
    const listeners = listenerPids(port);
    const runtimes = svglabRuntimePids(rows);
    const recorded = recordedRuntimePid();
    const seeds = new Set([...listeners, ...runtimes]);
    if (recorded) seeds.add(recorded);

    if (seeds.size === 0 && await portFree(port)) {
      // A stale supervisor can respawn workerd after the first child dies. Require the port
      // to stay clear for a beat before declaring teardown complete.
      await wait(200);
      if (listenerPids(port).length === 0 && svglabRuntimePids().length === 0 && await portFree(port)) {
        if (!touched) console.log(`teardown: nothing running on local port ${port}`);
        console.log(`teardown: local port ${port} is clear`);
        return;
      }
    }

    touched = true;
    const description = `${label} reap pass ${pass} on port ${port}`;
    if (seeds.size > 0) {
      await signalTrees([...seeds], description, false);
      await wait(250);
    }

    const survivors = new Set([...listenerPids(port), ...svglabRuntimePids()]);
    const stillRecorded = recordedRuntimePid();
    if (stillRecorded) survivors.add(stillRecorded);
    if (survivors.size > 0) {
      await signalTrees([...survivors], description, true);
      await wait(250);
    }
  }

  const remaining = listenerPids(port);
  const remainingRuntime = svglabRuntimePids();
  const details = [...new Set([...remaining, ...remainingRuntime])].map((pid) => {
    const command = commandFor(pid);
    return command ? `${pid}: ${command}` : String(pid);
  });
  fail([
    `teardown: could not reclaim local port ${port} after repeated process-tree reaping`,
    details.length > 0 ? `remaining processes: ${details.join(" | ")}` : "the port is still occupied",
    "The remaining process may be protected by higher OS permissions.",
  ]);
}

async function teardown() {
  const port = Number(process.env.SVGLAB_PORT ?? "8787");
  await reclaimLocalRuntime(port);
  rmSync(pidFile, { force: true });
}

function reset() {
  for (const target of generatedPaths) {
    if (!resolve(target).startsWith(`${resolve(root)}/`)) throw new Error(`Unsafe reset target: ${target}`);
    rmSync(target, { recursive: true, force: true });
  }
  mkdirSync(runtime, { recursive: true });
  console.log("reset: cleared dist, tool exports, Wrangler state, and disposable runtime state");
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
  const port = Number(process.env.SVGLAB_PORT ?? "8787");

  if (!(await portFree(port)) || listenerPids(port).length > 0 || svglabRuntimePids().length > 0) {
    await reclaimLocalRuntime(port, "pre-launch local runtime");
  }

  const child = spawn(executable, [
    "dev",
    "--local",
    "--config",
    join(root, "wrangler.local.jsonc"),
    "--persist-to",
    join(runtime, "cloudflare"),
    "--port",
    String(port),
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
