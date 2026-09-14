import { createReadStream, existsSync, cpSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { BONEYARD_ROOT } from "boneyard/paths";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

/** The prefixes the shell fetches at runtime, all of them owned by Boneyard. */
const ASSET_PREFIXES = ["rigs", "characters", "cosmetics", "figures", "catalog"] as const;

const TYPES: Readonly<Record<string, string>> = {
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/**
 * Boneyard's directories also hold its own working files — the atlases its pipelines trace, the
 * schemas an author validates against, its byte ratchet. The page fetches none of them.
 */
function shippable(path: string): boolean {
  return !/(?:atlas\.(?:png|json)|\.schema\.json|footprint\.baseline\.json)$/.test(path);
}

function copyShippable(from: string, to: string): void {
  if (statSync(from).isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) copyShippable(join(from, entry), join(to, entry));
  } else if (shippable(from)) cpSync(from, to);
}

/**
 * Serve and ship the art Boneyard owns.
 *
 * The shell fetches these paths at runtime and never imports them, which is what keeps raster
 * atlases and SVG part payloads out of a shell chunk. In development the middleware reads them
 * straight out of the installed package, so an edit in Boneyard is visible on reload; in a build
 * they are copied beside `index.html`. Neither path reshapes anything — Boneyard's directories
 * are already the served shape, and a copy with an opinion would be a second source of truth.
 */
function boneyardAssets() {
  return {
    name: "svglab-boneyard-assets",
    configureServer(server: { middlewares: { use: (handler: (request: { url?: string }, response: { statusCode: number; setHeader: (name: string, value: string) => void }, next: () => void) => void) => void } }): void {
      server.middlewares.use((request, response, next) => {
        const pathname = (request.url ?? "/").split("?")[0];
        const prefix = ASSET_PREFIXES.find((name) => pathname.startsWith(`/${name}/`));
        if (!prefix) return next();
        const path = join(BONEYARD_ROOT, decodeURIComponent(pathname.slice(1)));
        if (!path.startsWith(BONEYARD_ROOT) || !existsSync(path) || !shippable(path)) return next();
        response.setHeader("Content-Type", TYPES[extname(path)] ?? "application/octet-stream");
        response.setHeader("Cache-Control", "no-store");
        createReadStream(path).pipe(response as unknown as NodeJS.WritableStream);
      });
    },
    closeBundle(): void {
      if (!existsSync(join(BONEYARD_ROOT, "catalog", "clips.json"))) {
        throw new Error("boneyard has no built catalog — run npm run build in the Boneyard repository");
      }
      for (const prefix of ASSET_PREFIXES) {
        copyShippable(join(BONEYARD_ROOT, prefix), join(ROOT, "dist", prefix));
      }
    },
  };
}

export default defineConfig({
  plugins: [boneyardAssets()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { stage: resolve(ROOT, "index.html"), preview: resolve(ROOT, "preview.html") } },
  },
  server: { host: "127.0.0.1", fs: { allow: [ROOT, BONEYARD_ROOT] } },
});
