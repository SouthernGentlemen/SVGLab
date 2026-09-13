import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const kernel = join(root, "src", "kernel");

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function importSpecifiers(source: string): string[] {
  const staticImports = source.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g);
  const dynamicImports = source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g);
  return [...staticImports, ...dynamicImports].map((match) => match[1]);
}

describe("kernel seal", () => {
  it("keeps every kernel import inside src/kernel", () => {
    for (const path of filesUnder(kernel).filter((file) => file.endsWith(".ts"))) {
      const source = readFileSync(path, "utf8");
      for (const specifier of importSpecifiers(source)) {
        expect(specifier, `${relative(root, path)} imports a bare or absolute module`).toMatch(/^\.{1,2}\//);
        const destination = resolve(dirname(path), specifier);
        const escape = relative(kernel, destination);
        expect(escape, `${relative(root, path)} imports outside src/kernel via ${specifier}`)
          .not.toSatisfy((path: string) => path === ".." || path.startsWith(`..${sep}`));
      }
    }
  });

  it("keeps DOM APIs and wall clocks out of src/kernel", () => {
    const forbidden = /\b(?:document|window)\s*\.|\b(?:DOMParser|requestAnimationFrame|HTMLElement|SVGElement)\b|\b(?:Date|performance)\s*\.\s*now\s*\(|\b(?:setTimeout|setInterval|Math\s*\.\s*random)\s*\(/;
    for (const path of filesUnder(kernel).filter((file) => file.endsWith(".ts"))) {
      expect(readFileSync(path, "utf8"), `${relative(root, path)} touches the DOM or a wall clock`).not.toMatch(forbidden);
    }
  });
});
