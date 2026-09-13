import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The exchange guards are CPU-bound; parallel files turn their measured 2–3 second
    // cases into 7–8 second timeout failures on the supported local workstation.
    fileParallelism: false,
  },
});
