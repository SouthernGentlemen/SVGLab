import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { buildCatalog } from "./pipelines/motion/catalog.ts";
import { buildWardrobeIndex } from "./pipelines/wardrobe/index.ts";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

function copyRuntimeAssets() {
  return {
    name: "svglab-runtime-assets",
    closeBundle(): void {
      const dist = join(ROOT, "dist");
      const figureDirectory = join(ROOT, "figures");
      const figures = readdirSync(figureDirectory).filter((name) => name.endsWith(".json")).sort().map((file) => {
        const manifest = JSON.parse(readFileSync(join(figureDirectory, file), "utf8")) as { name: string };
        return { id: basename(file, ".json"), name: manifest.name, path: `figures/${file}` };
      });
      mkdirSync(join(dist, "figures"), { recursive: true });
      for (const entry of figures) cpSync(join(ROOT, entry.path), join(dist, entry.path));
      writeFileSync(join(dist, "figures", "index.json"), `${JSON.stringify({ contract: 1, figures })}\n`);

      mkdirSync(join(dist, "rigs"), { recursive: true });
      cpSync(join(ROOT, "rigs", "fighter.rig.json"), join(dist, "rigs", "fighter.rig.json"));
      for (const character of readdirSync(join(ROOT, "characters"), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
        cpSync(join(ROOT, "characters", character.name, "parts"), join(dist, "characters", character.name, "parts"), { recursive: true });
      }
      const wardrobeIndex = buildWardrobeIndex(ROOT);
      mkdirSync(join(dist, "cosmetics"), { recursive: true });
      for (const wardrobe of wardrobeIndex.sets) {
        const target = join(dist, "cosmetics", wardrobe.id);
        mkdirSync(target, { recursive: true });
        cpSync(join(ROOT, "cosmetics", wardrobe.id, "set.json"), join(target, "set.json"));
        for (const file of readdirSync(join(ROOT, "cosmetics", wardrobe.id)).filter((name) => name.endsWith(".svg"))) {
          cpSync(join(ROOT, "cosmetics", wardrobe.id, file), join(target, file));
        }
      }
      writeFileSync(join(dist, "cosmetics", "index.json"), `${JSON.stringify(wardrobeIndex)}\n`);

      const source = buildCatalog(ROOT);
      const lanes = Object.fromEntries([
        ...Object.keys(source.bandaiNamco).map((name) => [name, "shipped"]),
        ...Object.keys(source.authored).map((name) => [name, "authored"]),
      ]);
      mkdirSync(join(dist, "catalog"), { recursive: true });
      writeFileSync(join(dist, "catalog", "clips.json"), `${JSON.stringify({ contract: 1, clips: source.clips, origins: source.origins, lanes })}\n`);
    },
  };
}

export default defineConfig({
  plugins: [copyRuntimeAssets()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { stage: resolve(ROOT, "index.html"), preview: resolve(ROOT, "preview.html") } },
  },
  server: { host: "127.0.0.1" },
});
