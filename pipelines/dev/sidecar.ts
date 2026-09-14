#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, watch, writeFileSync } from "node:fs";
import type { FSWatcher } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { RuntimeCatalog } from "../../src/clips/runtime.ts";
import type { Clip } from "boneyard";
import type { Rig } from "boneyard";
import { buildCatalog } from "boneyard/motion";
import { BONEYARD_ROOT } from "boneyard/paths";
import { buildWardrobeIndex } from "boneyard/wardrobe/index";
import { writeGenerated } from "../motion/generate.ts";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Two roots, one disk owner.
 *
 * Motion source, studies and wardrobe manifests live in Boneyard; the typed clip modules this
 * lab compiles live here. The sidecar reads and watches the first and writes the second, so an
 * authored clip edited in either repository reaches the page without a build.
 */

function validateStudyClip(value: unknown, rig: Rig, file: string): Clip {
  const artifact = value as { generatedBy?: unknown; clip?: Partial<Clip> } | null;
  const candidate = artifact?.clip;
  const fail = (message: string): never => { throw new Error(`${file}: ${message}`); };
  if (!artifact || artifact.generatedBy !== "pipelines/motion/build.ts" || !candidate) fail("is not a study clip artifact");
  const clip = candidate as Partial<Clip>;
  if (typeof clip.name !== "string" || !clip.name) fail("clip has no name");
  if (!Number.isInteger(clip.duration) || clip.duration! <= 0) fail("duration must be a positive whole tick count");
  if (clip.easing !== "linear" && clip.easing !== "smoothstep") fail("easing must be linear or smoothstep");
  if (!Array.isArray(clip.keyframes) || clip.keyframes.length === 0) fail("clip has no keyframes");
  const keyframes = clip.keyframes as Clip["keyframes"];
  let previous = -1;
  for (const keyframe of keyframes) {
    if (!Number.isInteger(keyframe.frame) || keyframe.frame <= previous) fail(`keyframe ${keyframe.frame} is out of order`);
    previous = keyframe.frame;
    for (const [bone, pose] of Object.entries(keyframe.bones ?? {})) {
      if (!rig.byName.has(bone)) fail(`keyframe ${keyframe.frame} poses unknown bone '${bone}'`);
      for (const [property, number] of Object.entries(pose)) {
        if (!(["x", "y", "rotation"] as const).includes(property as "x" | "y" | "rotation") || !Number.isFinite(number)) {
          fail(`keyframe ${keyframe.frame} has invalid ${bone}.${property}`);
        }
      }
    }
  }
  return clip as Clip;
}

function studiesFromOut(root: string, rig: Rig): Readonly<Record<string, Clip>> {
  const directory = join(root, "out");
  if (!existsSync(directory)) return {};
  const studies: Record<string, Clip> = {};
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".json")).sort()) {
    const clip = validateStudyClip(JSON.parse(readFileSync(join(directory, file), "utf8")), rig, `out/${file}`);
    studies[clip.name] = clip;
  }
  return studies;
}

export function rebuildRuntimeCatalog(assetRoot: string, persist = true): RuntimeCatalog {
  const source = buildCatalog(assetRoot);
  if (persist) writeGenerated();
  const studies = studiesFromOut(assetRoot, source.rig);
  return {
    contract: 1,
    clips: { ...source.clips, ...studies },
    origins: source.origins,
    lanes: Object.fromEntries([
      ...Object.keys(source.bandaiNamco).map((name) => [name, "shipped"]),
      ...Object.keys(source.authored).map((name) => [name, "authored"]),
      ...Object.keys(studies).map((name) => [name, "study"]),
    ]) as RuntimeCatalog["lanes"],
  };
}

export interface SidecarOptions {
  readonly root?: string;
  /** Where the motion source, studies and wardrobe manifests are. Defaults to the installed Boneyard. */
  readonly assetRoot?: string;
  readonly port?: number;
  readonly debounceMs?: number;
  readonly rebuild?: (root: string, persist: boolean) => RuntimeCatalog;
  readonly watchFiles?: boolean;
}

export interface DevSidecar {
  readonly server: Server;
  readonly port: number;
  readonly catalog: () => RuntimeCatalog;
  readonly close: () => Promise<void>;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(`${JSON.stringify(value)}\n`);
}

async function requestBody(request: IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const data = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk as Uint8Array;
    bytes += data.byteLength;
    if (bytes > 5_000_000) throw new Error("request body is larger than 5 MB");
    chunks.push(data);
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(joined);
}

export async function startDevSidecar(options: SidecarOptions = {}): Promise<DevSidecar> {
  const root = resolve(options.root ?? DEFAULT_ROOT);
  const assetRoot = resolve(options.assetRoot ?? BONEYARD_ROOT);
  const rebuild = options.rebuild ?? rebuildRuntimeCatalog;
  const debounceMs = options.debounceMs ?? 40;
  let revision = 0;
  let current = { ...rebuild(assetRoot, true), revision };
  const clients = new Set<ServerResponse>();
  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const publish = (event: "catalog" | "error", data: unknown): void => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) client.write(message);
  };
  const refresh = (persist: boolean): void => {
    try {
      const next = rebuild(assetRoot, persist);
      revision += 1;
      current = { ...next, revision };
      publish("catalog", { revision, clips: Object.keys(current.clips).length });
    } catch (error) {
      publish("error", (error as Error).message);
      console.error(`sidecar: ${(error as Error).message}`);
    }
  };
  const schedule = (persist: boolean): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; refresh(persist); }, debounceMs);
  };

  for (const directory of [join(assetRoot, "motions", "authored"), join(assetRoot, "out")]) mkdirSync(directory, { recursive: true });
  if (options.watchFiles !== false) {
    watchers.push(watch(join(assetRoot, "motions", "authored"), (_event, file) => { if (file?.endsWith(".json")) schedule(true); }));
    watchers.push(watch(join(assetRoot, "out"), (_event, file) => { if (file?.endsWith(".json")) schedule(false); }));
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/dev/health") return sendJson(response, 200, { ok: true, revision });
      if (request.method === "GET" && url.pathname === "/dev/catalog") return sendJson(response, 200, current);
      if (request.method === "GET" && url.pathname === "/dev/wardrobe") {
        return sendJson(response, 200, buildWardrobeIndex(assetRoot));
      }
      if (request.method === "GET" && url.pathname === "/dev/events") {
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        response.write(`event: catalog\ndata: ${JSON.stringify({ revision, clips: Object.keys(current.clips).length })}\n\n`);
        clients.add(response); request.once("close", () => clients.delete(response)); return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/dev/out/")) {
        const name = basename(decodeURIComponent(url.pathname.slice("/dev/out/".length)));
        const path = join(assetRoot, "out", name);
        if (!name || !existsSync(path)) return sendJson(response, 404, { error: "study artifact not found" });
        response.writeHead(200, { "Content-Type": name.endsWith(".json") ? "application/json" : "application/octet-stream", "Cache-Control": "no-store" });
        response.end(readFileSync(path)); return;
      }
      const writeMatch = url.pathname.match(/^\/dev\/(motions\/authored|out)\/([^/]+\.json)$/);
      if ((request.method === "PUT" || request.method === "POST") && writeMatch) {
        const directory = writeMatch[1]; const name = decodeURIComponent(writeMatch[2]);
        if (basename(name) !== name) return sendJson(response, 400, { error: "invalid file name" });
        const path = resolve(assetRoot, directory, name); const allowed = resolve(assetRoot, directory);
        if (!path.startsWith(`${allowed}${sep}`)) return sendJson(response, 400, { error: "path escapes writable directory" });
        writeFileSync(path, await requestBody(request), "utf8");
        schedule(directory === "motions/authored");
        return sendJson(response, 202, { ok: true, path: `${directory}/${name}` });
      }
      return sendJson(response, 404, { error: "unknown dev sidecar route" });
    } catch (error) {
      sendJson(response, 400, { error: (error as Error).message });
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 8790, "127.0.0.1", () => { server.off("error", reject); resolveListen(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("sidecar did not bind a TCP port");
  console.log(`sidecar: watching ${relative(root, assetRoot) || assetRoot} motions/authored and out on http://127.0.0.1:${address.port}`);
  return {
    server,
    port: address.port,
    catalog: () => current,
    close: async () => {
      if (timer) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
      for (const client of clients) client.end();
      await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.SVGLAB_SIDECAR_PORT ?? "8790");
  await startDevSidecar({ port });
}
