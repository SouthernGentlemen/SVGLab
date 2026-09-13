import { accessSync, constants, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

export interface BlenderLocation {
  readonly executable: string | null;
  readonly source: "environment" | "path" | "known" | null;
  readonly looked: readonly string[];
  readonly suggested: string;
}

export interface FindBlenderOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
  readonly executable?: (path: string) => boolean;
  readonly windowsInstallations?: readonly string[];
}

function canExecute(path: string, platform: NodeJS.Platform): boolean {
  try {
    accessSync(path, platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function knownLocations(platform: NodeJS.Platform, home: string, windowsInstallations?: readonly string[]): string[] {
  if (platform === "darwin") {
    return [
      "/Applications/Blender.app/Contents/MacOS/Blender",
      join(home, "Applications", "Blender.app", "Contents", "MacOS", "Blender"),
    ];
  }
  if (platform === "win32") {
    const foundation = "C:\\Program Files\\Blender Foundation";
    let installations = windowsInstallations;
    if (!installations && existsSync(foundation)) {
      installations = readdirSync(foundation, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("Blender "))
        .map((entry) => entry.name)
        .sort().reverse();
    }
    return (installations ?? ["Blender 5.2", "Blender 5.1", "Blender 5.0", "Blender 4.5"])
      .map((directory) => join(foundation, directory, "blender.exe"));
  }
  return ["/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender"];
}

/** Resolve Blender in the measured order: explicit environment, PATH, known installations. */
export function findBlender(options: FindBlenderOptions = {}): BlenderLocation {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const executable = options.executable ?? ((path: string) => canExecute(path, platform));
  const looked: string[] = [];
  const remember = (path: string): string => {
    if (!looked.includes(path)) looked.push(path);
    return path;
  };

  if (env.SVGLAB_BLENDER !== undefined && env.SVGLAB_BLENDER !== "") {
    const chosen = remember(resolve(env.SVGLAB_BLENDER));
    if (!executable(chosen)) {
      throw new Error(`SVGLAB_BLENDER points to '${chosen}', which is not executable; refusing to fall back`);
    }
    return { executable: chosen, source: "environment", looked, suggested: chosen };
  }

  const pathName = platform === "win32" ? "blender.exe" : "blender";
  for (const directory of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = remember(join(directory, pathName));
    if (executable(candidate)) {
      return { executable: candidate, source: "path", looked, suggested: candidate };
    }
  }

  const known = knownLocations(platform, home, options.windowsInstallations);
  for (const path of known) {
    const candidate = remember(path);
    if (executable(candidate)) {
      return { executable: candidate, source: "known", looked, suggested: candidate };
    }
  }
  return { executable: null, source: null, looked, suggested: known[0] ?? pathName };
}

export function blenderFix(path: string): string {
  const quoted = /\s/.test(path) ? `"${path}"` : path;
  return `SVGLAB_BLENDER=${quoted} npm run verify`;
}
