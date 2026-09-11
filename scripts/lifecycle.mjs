import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function teardown() {
  if (!existsSync(pidFile)) {
    console.log("teardown: no previous local runtime");
    return;
  }

  const pid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
  if (!Number.isInteger(pid) || pid <= 1 || !isRunning(pid)) {
    rmSync(pidFile, { force: true });
    console.log("teardown: removed stale runtime marker");
    return;
  }

  const command = commandFor(pid);
  if (!command.includes(root) || !command.includes("wrangler")) {
    throw new Error(`Refusing to stop PID ${pid}: it is not this repository's Wrangler process`);
  }

  console.log(`teardown: stopping local Wrangler process ${pid}`);
  process.kill(process.platform === "win32" ? pid : -pid, "SIGTERM");
  await wait(750);
  if (isRunning(pid)) process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL");
  rmSync(pidFile, { force: true });
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

function launch() {
  mkdirSync(runtime, { recursive: true });
  const executable = join(root, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  if (!existsSync(executable)) throw new Error("Dependencies are missing. Run npm install first.");
  const port = process.env.SVGLAB_PORT ?? "8787";
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
  console.log(`launch: local Cloudflare runtime starting at http://127.0.0.1:${port}`);

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
}

const command = process.argv[2];
if (command === "teardown") await teardown();
else if (command === "reset") reset();
else if (command === "launch") launch();
else if (command === "dev") {
  console.log("dev: teardown → reset → rebuild → local Cloudflare launch");
  await teardown();
  reset();
  build();
  launch();
} else {
  throw new Error("Usage: node scripts/lifecycle.mjs <teardown|reset|launch|dev>");
}
