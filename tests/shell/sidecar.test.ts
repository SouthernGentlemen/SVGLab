import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RuntimeCatalog } from "../../src/clips/runtime.ts";
import worker from "../../src/shell/worker.ts";
import { startDevSidecar } from "../../pipelines/dev/sidecar.ts";
import type { DevSidecar } from "../../pipelines/dev/sidecar.ts";

const sandboxes: string[] = [];
const sidecars: DevSidecar[] = [];

afterEach(async () => {
  for (const sidecar of sidecars.splice(0)) await sidecar.close();
  for (const sandbox of sandboxes.splice(0)) rmSync(sandbox, { recursive: true, force: true });
});

function emptyCatalog(): RuntimeCatalog {
  return { contract: 1, clips: {}, origins: {}, lanes: {} };
}

describe("dev sidecar and Worker proxy", () => {
  it("writes through the Worker to the real host filesystem and streams SSE", async () => {
    const root = mkdtempSync(join(tmpdir(), "svglab-sidecar-")); sandboxes.push(root);
    const sidecar = await startDevSidecar({ root, port: 0, debounceMs: 5, watchFiles: false, rebuild: () => emptyCatalog() });
    sidecars.push(sidecar);
    const env = { SIDECAR_ORIGIN: `http://127.0.0.1:${sidecar.port}`, ASSETS: { fetch } };
    const response = await worker.fetch(new Request("http://lab/dev/motions/authored/labProbe.json", { method: "POST", body: "real disk" }) as never, env as never);
    expect(response.status).toBe(202);
    expect(readFileSync(join(root, "motions", "authored", "labProbe.json"), "utf8")).toBe("real disk");

    const events = await worker.fetch(new Request("http://lab/dev/events") as never, env as never);
    const reader = events.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("event: catalog");
    await reader.cancel();
  });

  it("pushes the real rebuild error and never replaces the last good catalog", async () => {
    const root = mkdtempSync(join(tmpdir(), "svglab-sidecar-")); sandboxes.push(root);
    const rebuild = (directory: string): RuntimeCatalog => {
      const authored = join(directory, "motions", "authored");
      const files = existsSync(authored) ? readdirSync(authored) : [];
      for (const file of files) {
        if (readFileSync(join(authored, file), "utf8").includes("invalid")) throw new Error("a lab* clip must set derivedFrom to null");
      }
      return emptyCatalog();
    };
    const sidecar = await startDevSidecar({ root, port: 0, debounceMs: 5, watchFiles: false, rebuild }); sidecars.push(sidecar);
    const before = sidecar.catalog().revision;
    const events = await fetch(`http://127.0.0.1:${sidecar.port}/dev/events`); const reader = events.body!.getReader();
    await reader.read();
    await fetch(`http://127.0.0.1:${sidecar.port}/dev/motions/authored/labBad.json`, { method: "PUT", body: "invalid" });
    const next = await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("no SSE error event")), 500)),
    ]);
    const message = new TextDecoder().decode(next.value);
    expect(message).toContain("event: error");
    expect(message).toContain("a lab* clip must set derivedFrom to null");
    expect(sidecar.catalog().revision).toBe(before);
    await reader.cancel();
  });

  it("returns 404 for dev routes when no sidecar origin exists", async () => {
    const response = await worker.fetch(new Request("http://lab/dev/catalog") as never, { ASSETS: { fetch } } as never);
    expect(response.status).toBe(404);
  });
});
