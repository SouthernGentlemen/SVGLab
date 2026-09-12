#!/usr/bin/env node
/**
 * Build traced SVGLab characters from their atlases.
 *
 *   node scripts/build-characters.mjs           # rebuild every character
 *   node scripts/build-characters.mjs barst     # rebuild one
 *   node scripts/build-characters.mjs --check   # verify the checked-in files match
 *   node scripts/build-characters.mjs --out DIR # build somewhere else
 *   node scripts/build-characters.mjs --preview DIR  # also write posed previews there
 *
 * A character is `characters/<id>/atlas.png` — a sheet of loose body parts in the layout
 * `docs/CHARACTER_ATLAS.md` describes — plus an optional `atlas.json` beside it. The build
 * writes `src/svg/characters/<id>.svg`, which is an authored fighter in the same shape as
 * `src/svg/fighter.svg` and is read by the same `src/svg/rig.ts`.
 *
 * The output is generated. Edit the atlas or the sidecar, never the SVG.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCharacter, toCharacterSvg } from "./atlas/model.mjs";
import { poseCharacterSvg } from "./atlas/preview.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ATLASES = join(ROOT, "characters");
const OUTPUT = join(ROOT, "src", "svg", "characters");

/** The authored fighter's frame, so a traced character shares its ground line and headroom. */
const VIEW_BOX = "-55 -110 110 115";

export function characterIds() {
  if (!existsSync(ATLASES)) return [];
  return readdirSync(ATLASES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ATLASES, entry.name, "atlas.png")))
    .map((entry) => entry.name)
    .sort();
}

export function sidecarFor(id) {
  const path = join(ATLASES, id, "atlas.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

/** Builds one character and returns its SVG text alongside what the build measured. */
export function renderCharacter(id) {
  const sidecar = sidecarFor(id);
  const name = sidecar.name ?? id;
  const character = buildCharacter(join(ATLASES, id, "atlas.png"), { ...sidecar, name });
  return { svg: toCharacterSvg(character, { id, name, viewBox: VIEW_BOX }), character };
}

export const outputPath = (id, outputRoot = OUTPUT) => join(outputRoot, `${id}.svg`);

function main(argv) {
  const check = argv.includes("--check");
  const outFlag = argv.indexOf("--out");
  const outputRoot = outFlag === -1 ? OUTPUT : resolve(argv[outFlag + 1] ?? "");
  const previewFlag = argv.indexOf("--preview");
  const previewRoot = previewFlag === -1 ? undefined : resolve(argv[previewFlag + 1] ?? "");
  const consumed = new Set([outFlag + 1, previewFlag + 1]);
  const ids = argv.filter((argument, index) => !argument.startsWith("--") && !consumed.has(index));
  const targets = ids.length > 0 ? ids : characterIds();

  if (targets.length === 0) {
    console.error("no characters: expected at least one characters/<id>/atlas.png");
    return 2;
  }

  let failed = false;
  for (const id of targets) {
    try {
      const { svg, character } = renderCharacter(id);
      const path = outputPath(id, outputRoot);
      if (check) {
        // A generated file that no longer matches its atlas is either a hand-edit or a
        // tracer that stopped being deterministic. Both drift silently until a character
        // quietly changes shape, so the check is part of the build rather than a chore.
        const current = existsSync(path) ? readFileSync(path, "utf8") : "";
        if (current === svg) console.log(`${id.padEnd(10)} up to date`);
        else {
          failed = true;
          console.error(`${id}: src/svg/characters/${id}.svg is stale — run npm run build:characters`);
        }
        continue;
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, svg);
      if (previewRoot) {
        // Previews are an authoring aid, never a build output: they go wherever the caller
        // asks and nowhere near src/.
        mkdirSync(previewRoot, { recursive: true });
        writeFileSync(join(previewRoot, `${id}.svg`), poseCharacterSvg(svg, sidecarFor(id).pose));
      }
      console.log(`${id.padEnd(10)} ${character.palette} colours, ${character.props} costume pieces, `
        + `${character.height}px canonical rig`
        + (character.unused.length ? `, ${character.unused.length} atlas islands unused` : ""));
    } catch (error) {
      failed = true;
      console.error(`${id}: ${error.message}`);
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
