import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        stage: resolve(root, "index.html"),
        preview: resolve(root, "preview.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
  },
});
