# Rewrite plan

`AGENTS.md` is the contract. This file is how the repository gets there: the milestones
expanded into files, gates and definitions of done; a verdict on every path that exists today;
what six spikes measured; and the places where those measurements contradict the contract.

Everything numbered here was run. Where a number is a projection rather than a measurement it
says so. Where I could not settle a question, it is in [Open questions](#open-questions)
rather than resolved by assumption.

Spike work happened in a throwaway worktree. Nothing from it is committed.

---

## 1. The six spikes

### Spike 1 — TypeScript pipelines with no build step

Node v26.7.0, TypeScript 5.9.3.

Type stripping is on by default; `node pipelines/foo.ts` simply runs. **There is no
`--experimental-transform-types` any more** — Node 26 answers it with `node: bad option`. Strip
only is the only mode there is, so the dialect is fixed, not chosen:

| construct | verdict |
| --- | --- |
| `interface`, `type`, generics, `as`, `satisfies`, `declare`, `!`, `abstract` | accepted |
| `enum`, `const enum`, `namespace`, constructor parameter properties | `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, at the right line and column |

Relative imports **must carry an explicit `.ts` extension**. Extensionless resolution fails
with `ERR_MODULE_NOT_FOUND`; so does `./x.js` (Node does not remap it to `./x.ts`); so does a
directory import, which means `./characters` has to be spelled `./characters/index.ts`. Stack
traces keep original line and column (`throws.ts:3:9` for a throw at line 3, column 9).

The tsconfig that makes `tsc` validate exactly the dialect Node runs:

```jsonc
"module": "nodenext", "moduleResolution": "nodenext",
"allowImportingTsExtensions": true, "erasableSyntaxOnly": true,
"verbatimModuleSyntax": true, "isolatedModules": true, "noEmit": true
```

I mechanically rewrote every relative import in all 34 `src/` and `tests/` files to carry
`.ts`, and under that config the **entire existing repository typechecks with three errors**,
all `TS1294` from `erasableSyntaxOnly`, all in browser-only code:

- `src/input/keyboard.ts:8` — `constructor(private readonly target: Window)`
- `src/svg/renderer.ts:45-46` — `private readonly svg`, `private readonly definitions`

`?raw` still typechecks under `nodenext` (`vite/client` declares it) — zero errors from it.
`vitest` runs 77/78 with `.ts`-extension imports (the one failure was my own rewrite touching a
*generated* file, so `build-motions --check` correctly called it stale). `vite build` succeeds.

**C2 is provable.** A pipeline imported `src/animation/sample.ts` and `src/animation/clips.ts`
directly and sampled `bnrSwordSlashNormal` at tick 15: 11 bones, `torso` −0.1957°,
`arm-front` −51.197°. No build step, no loader flag, no second sampler.

**C2 has a limit the layout does not currently respect.** The sampler chain is Node-clean, but
`src/svg/rig.ts` is not: it imports `src/svg/characters/index.ts`, which uses four Vite-only
`?raw` imports, and it needs `DOMParser` and `document`. A pipeline can import the sampler
today; it cannot import the rig. So the rewrite must split the rig in two — the pure bone
tree, pose maths and sampler that both sides import, and the DOM placement only the browser
does — and art must arrive as a string argument, never as a module import.

Cost: `node plain.mjs` 62.9 ms/run against `node typed.ts` 113.3 ms/run — about 50 ms of
stripping per process. A pipeline that imports the 231 KB catalog and the sampler runs in
137.6 ms. Fine for a gate.

### Spike 2 — clip catalog under 60 KB

Budget 61,440 bytes. Every row is the real generated file, same header, measured:

| option | raw | gzip | |
| --- | ---: | ---: | --- |
| A — today: pretty, 3dp, all 11 clips | 231,304 | 16,717 | over by 169,864 |
| B — compact, 3dp, all 11 | 102,387 | 14,900 | over by 40,947 |
| C — compact, flat 1dp, all 11 | 96,942 | 11,090 | over by 35,502 |
| D — pretty, 3dp, 9 clips | 87,615 | 7,124 | over by 26,175 |
| H — compact, 1dp, 10 clips (one study kept) | 69,957 | 8,288 | over by 8,517 |
| E — compact, 3dp, 9 clips | 39,705 | 6,587 | **pass** |
| **K — compact, rotation 1dp / position 2dp, 9 clips** | **37,710** | **5,115** | **pass, 23,730 headroom** |

**The answer is 37,710 bytes raw and 5,115 gzip** — 61% under the gate.

The reduction the brief expected does not do the work. Pretty-printing is the whole problem:
compacting alone is −56% (128,917 bytes). Going 3dp → 1dp saves only 5,445 bytes, 5.3%.

The two study clips are decisive: compact and quantised they are **59,523 bytes by
themselves**, 97% of the entire budget. `bnrSlashStudyNormal` is 802 ticks and 279 keyframes;
`bnrPunchStudyNormal` is 446 ticks and 213 keyframes. No serialization choice rescues them.

**A flat one decimal place does not work**, and this is measured, not reasoned:
`node scripts/check-motion-exchange.mjs` with `round()` at 1dp fails with

> `bnrPunchStudyNormal: round trip moved the pelvis 0.150 units, past the 0.15 tolerance`

Flat 2dp passes. Rotation 1dp with position 2dp passes all eleven clips. That split is what C4
actually implies — reduction is *both* 1° *and* 0.15 units, so rotation justifies one decimal
and position justifies two, and a single `round()` cannot say that.

The cost of 1dp rotation, measured in joint space through full forward kinematics including
leaf tips, across all clips and every tick: worst joint displacement **0.1138 units on a
104-unit character, 0.109% of body height**. Invisible. (2dp would be 0.0132 units.)

### Spike 3 — character SVG under 120 KB

The riskiest budget, and the one that needed pictures. Today:

| | raw | gzip | paths | distinct fills |
| --- | ---: | ---: | ---: | ---: |
| barst | 288,054 | 79,830 | 900 | 258 |
| kiran | 488,032 | 136,247 | 1,618 | 401 |
| yuliya | 620,401 | 173,959 | 2,512 | 458 |

87–89% of every file is `<path d="…">` payload. For yuliya, `torso` is 226,504 bytes and
`head` is 178,549 — two bones are 65.5% of the character — and her nine costume props are
325,848 bytes, 53% of the file, two of them hair pieces bound to the head at 48,289 and 46,337.

Sweeping one global setting finds the frontier: yuliya only reaches budget at four colours per
part (`c4 eps2.5 1dp mra40`, 108,316 raw / 33,071 gzip). **And at four colours her face is
gone** — the blue eyes become dark smudges, the mouth disappears, skin and hair merge into one
beige. That is precisely the failure `trace.mjs`'s own despeckle comment warns about.

The way through is that the face needs *colours* and the body carries the *bytes*, so the knobs
have to be declared per slot:

```jsonc
"trace": {
  "default": { "colours": 3,  "epsilon": 3.0, "places": 1, "minRegionArea": 48 },
  "bySlot":  { "head": { "colours": 12, "epsilon": 1.2, "places": 1, "minRegionArea": 12 } }
}
```

| | raw | gzip | verdict |
| --- | ---: | ---: | --- |
| barst | 64,790 | 19,468 | pass |
| kiran | 81,791 | 24,369 | pass |
| **yuliya** | **114,371** | **34,148** | **pass, face intact** |

**120 KB is reachable — 114,371 bytes raw and 34,148 gzip for the worst character — but only
with per-slot knobs.** A single global setting cannot do it without losing the face.

The visible cost is real and should be looked at before it is agreed to: body shading
gradients flatten. Yuliya's skirt becomes flat panels; kiran's cloak flattens. It reads as a
deliberate flat-colour style rather than as damage, and the face — the thing that makes a
character legible at fighting-game scale — survives. The before/after, including head crops at
each setting, is reproducible from the spike and is the artefact this decision should be made
against.

Determinism holds at those settings: three in-process runs and two separate processes produce
byte-identical SHA-256 for all three characters.

The other half of C7 is even more clear-cut, measured by rebuilding:

| shell chunk | raw | gzip |
| --- | ---: | ---: |
| today, characters inlined via `?raw` | 1,497,551 | 408,778 |
| characters not inlined | 101,064 | 18,072 |
| characters not inlined **and** studies dropped | 44,427 | 9,589 |

The traced characters are **93% of the shell chunk**. "Art is never inlined into the bundle" is
the single change that fixes the shell budget, and it fixes it by an order of magnitude.

To measure any of this I had to add two knobs, both behaviour-preserving —
`build-characters --check` still reproduces all three committed SVGs byte for byte with the
defaults: a `places` option on `tracePart` (coordinate precision was hardcoded at
`round(n, 2)`), and per-slot resolution of the knob bag in `model.mjs`.

### Spike 4 — the Blender ⇄ preview loop

The dev flow today is `teardown → reset → vite build → wrangler dev --local` serving `dist/` as
static assets. There is no watch, no HMR, no rebuild on change; any source edit needs a full
`npm run dev`. M5 needs new machinery whatever is chosen.

**The Worker cannot write to disk, and it fails in the worst possible way.** A worker with
`nodejs_compat` calling `writeFileSync("/tmp/x")` reports:

```
write: ok            existsSync: true       readBack: written-by-worker
host file readable:  FAILED no such file or directory, readAll '/etc/hosts'
ls /tmp/x on the host:  No such file or directory
```

`workerd` gives `nodejs_compat` an **in-memory virtual filesystem**. A write-back endpoint
inside the Worker would report success on every request and silently lose every edit. It does
not error. It lies.

What does work, measured: the Worker can `fetch()` a localhost sidecar, and that reaches real
disk. A `POST` proxied through the Worker wrote 24 bytes to a real file. Server-sent events
stream through the proxy intact — a POST at t=9.582 reached the client at t=9.638, **56 ms**.

A full catalog rebuild from source BVH costs **80/91/101 ms** for all eleven clips (parsing the
501 KB slash BVH alone is 12 ms), so no incremental machinery is needed.

End to end, with a watcher on `motions/authored/` and `out/`, a 40 ms debounce and an SSE push:

- a valid clip written → `catalog` event **185 ms** later, 12 clips, `authored: [labSpikeProbe]`
- an invalid clip written → an `error` event carrying the real validator message
  (`a lab* clip must set derivedFrom to null`), and the catalog is **not** replaced
- the clip deleted → `catalog` event, back to 11 clips

**Decision: a dev sidecar that contains the watcher, with the Worker proxying `/dev/*`.**

The two options in the brief collapse into one. A watcher has to live in some process, and
that process cannot be the Worker; the only question left is whether the page reaches it
through the Worker (one origin — proved working) or directly (two origins, needs CORS).
Proxying wins: one origin, no CORS, and it is dev-only by construction — don't start the
sidecar and `/dev/*` simply 404s.

Rejected: the Worker write-back endpoint, because it is impossible and silently wrong.
`@cloudflare/vite-plugin` would give one process and real HMR, but it adds a dependency and
changes what is being tested — dev would serve a module graph while the gate builds a bundle;
the sidecar keeps the served artefact identical to the shipped one. Polling a version endpoint
works but a 185 ms push is already there for about fifteen more lines.

One design consequence: to swap a clip without reloading the page, the catalog has to be
**fetchable** in dev, not only a static ES import. That is the same treatment C7 already
demands for characters.

### Spike 5 — Blender as a gate

Blender 5.2.1 LTS (build date 2026-08-25) at `/Applications/Blender.app/Contents/MacOS/Blender`,
not on `PATH`.

Detection, in order, all branches measured: `$SVGLAB_BLENDER` first — and if it points at
something that is not executable the gate **errors** rather than falling back, because an
explicit choice that is wrong is a mistake and not a hint; then `blender` on `PATH`; then known
install locations per platform. Found here via "known install location", version parsed as 5.2.

When absent the gate prints every path it looked at, the exact `SVGLAB_BLENDER=… npm run verify`
fix, and the line **"This gate did NOT pass. It was not run."** It exits 0 so `verify`
continues, and exits 1 under `SVGLAB_REQUIRE_BLENDER=1`. Both measured.

Wall clock:

| | |
| --- | ---: |
| `export:motions` — 11 clips + 11 bone art files | 0.42 s |
| a `.blend` per clip, one process each, with artwork | **13.97 s** |
| **gate 7's actual workload** — all 11 clips in one process, armature + pose + joint dump, no artwork | **1.72 s** |

The floor is ~1.07 s per clip and almost all of it is process startup plus SVG art import; the
803-frame slash study only costs 1.95 s. **So gate 7 costs 1.72 s, not 14 s.** The 14 s is
building reviewable `.blend` files, which is `npm run blender`, an authoring aid, not the gate.

Gate 7's first half — "every joint of every sampled tick within 0.001 units of the sampler's
own forward kinematics" — was run, not estimated: **19,503 joint comparisons across 11 clips,
worst deviation 1.841×10⁻⁵ units** (`bnrSlashStudyNormal` tick 111, `forearm-front`). Passes
with 54× margin. The residual is the BVH writer's six-decimal fixed point, not a rig mismatch.
The comparator imports `src/animation/sample.ts` directly, so gate 7 re-proves C2 by
construction.

Gate 7's second half — "an export back reports zero deltas" — was run through Blender's own
`bpy.ops.export_anim.bvh`, not a synthetic reframe. Blender writes the skeleton **z-up**
(`shin-front OFFSET 0 0 -22` where SVGLab writes `0 -22 0`) with six channels on every joint.
The measured-axis reader accepted it: scale 1, duration 20 = original, 21 keyframes = original,
worst deviation **0.0000° and 0.0000 units**. Exact. This is the real case that
`check-motion-exchange.mjs`'s synthetic `reframe()` stands in for.

**A bug the real export exposed.** The dropped-work report says *"depth translation: 31.0000
units"* for a file in which nothing moved in depth. Blender writes each joint's **static rest
offset** into its position channels, and `bvh-read.mjs` measures non-root joint position as
`hypot(point)/scale` — against zero, not against the bone's own rest offset. Measured per
joint: `head` reports `|position| 31.000` while it moves by 0.000012; `arm-front` 24.597 while
it moves by 0.000012. SVGLab's own writer emits only three rotation channels on non-root
joints, so the existing guard cannot see this. C4 promises dropped work is "measured … and
reported"; today the report would tell an animator it discarded 31 units of their work when it
discarded none. The fix is to subtract the bone's rest offset before measuring.

`--factory-startup` works — the SVG importer is available under it — and the gate should use it
so a user's add-ons cannot change the result.

### Spike 6 — the rig contract

Drafted `rigs/fighter.rig.json`: 372 lines, 7,270 bytes, generated from every place the rig is
currently restated and then cross-validated, so no number was transcribed by hand.

It carries all nine things C1 names: eleven bones as `{ name, parent, offset, tip, length }` in
SVG units with y down; the parent tree; leaf tips (shins `[0,21]`, forearms `[0,23]`, head
`[0,-16]`); a paint order that is a permutation of the bones
(`leg-front > shin-front > leg-back > shin-back > pelvis > arm-front > forearm-front > torso >
arm-back > forearm-back > head`); per-bone document order; the four depth profiles with how
`far`/`near` resolve against facing and the inheritance rule; the `weapon-grip` attachment on
`torso` at `[0,0]` aiming `[0,-1]`; the axis map (`svg+x → +X`, `svg+y → −Z`, depth `→ +Y`,
unit scale 1, roll 0); and the BVH layout (60 fps, root channels
`Xposition Yposition Zposition Zrotation Xrotation Yrotation`, joint channels
`Zrotation Xrotation Yrotation`, planar channel `Zrotation`, sign −1, root offset `[0,0,0]`,
root rest height 42, six decimals). It also carries an `atlas` block so the tracer stops
restating the rig as well.

The rig is stated in **five** places today: `src/svg/fighter.svg`, `scripts/motion/rig.mjs`,
`scripts/atlas/skeleton.mjs`, `src/svg/rig.ts` and `scripts/motion/bvh-write.mjs`, plus
`scripts/blender/setup.py` for the axes.

**Proven by rewriting a consumer.** `scripts/motion/rig.mjs`'s `readRig` now reads the JSON
instead of parsing the drawing. It feeds catalog → retarget → bvh-write → bvh-read →
export/import/check, so that is the whole motion lane:

- `build:motions --check` — passed, catalog byte-identical
- `check:exchange` — "11 clips round trip inside the reduction tolerance"
- `export:motions` — `diff -r` of the before and after trees found no differences in any file;
  content-only digest `6cc25ebbbfcddb2739633c122eb34069582a0d7c47463b6ecba900a303e78967` on both sides

Gate 1's behaviours, each measured against a deliberately mutated contract: duplicate bone,
unknown parent, two roots, leaf with no tip, illegal name, non-finite offset, and a declared
root that is not the parentless bone — all rejected, each with a message naming the bone.

The draft exposed two things:

1. **C1 says "Art references bones by id and carries no skeleton of its own", and all four art
   files violate it.** `fighter.svg` and all three traced characters each carry eleven
   `data-x`/`data-y` offsets. They all currently *agree* with the contract — checked bone by
   bone — so this is duplication rather than drift, but it is exactly the duplication C1
   forbids, and the tracer regenerates it on every build.
2. **An off-by-one the duplication is already hiding.** The forearm's declared tip is `[0,23]`,
   so the forearm is 23 units long. `src/svg/weapons.ts`'s `constrainArm()` solves the arm IK
   with `solveTwoBoneArm(shoulder, target, upperLength, 22, bend)` — a hardcoded 22. It reads
   the upper arm correctly (`|forearm data-y|` = 21) and guesses the forearm. Every two-handed
   grip has been solved against a forearm one unit shorter than the rig declares.

---

## 2. Contracts these findings contradict

Five, named explicitly, each with a proposed amendment. None of them is worked around quietly.

### C7 — "Generated clip catalog ≤ 60 KB" is reachable only if the studies are not in it

The studies are 59,523 bytes compact — 97% of the budget by themselves. They are also
*referenced*: `UNARMED_MOVESET.clips.study = bnrPunchStudyNormal` and
`SWORD_MOVESET.clips.study = bnrSlashStudyNormal` in `src/animation/movesets.ts`, and both show
up in the preview list. Excluding them is a functional change, not a free one.

They are authoring aids — `bnrStrikeNormal` was cut from the punch study, and the three sword
clips from the slash study — so they need a home that is *derived but not shipped*, and C3
currently has only two categories: generated output and authored source.

> **Amendment, C3.** Add a third category: a clip may be *derived and not shipped*. It is
> rebuilt deterministically like any generated clip and is available to `export:motions`,
> `render:clip` and the dev preview, but it is not part of the catalog C7 measures. The
> manifest declares which lane each clip is in.
>
> **Amendment, C7.** Say what the 60 KB measures: the shipped catalog, raw bytes, studies
> excluded. Measured achievable value 37,710 bytes.

### C4 — "no value is stored to more precision than that justifies" cannot be one number

Reduction is 1° *and* 0.15 units. A single `round()` at 1dp fails the exchange gate on the
pelvis channel at 0.150 against a 0.15 tolerance; at 3dp it stores two digits of noise on every
rotation.

> **Amendment, C4.** State the precision per channel: rotation to one decimal (tolerance 1°),
> position to two (tolerance 0.15 units). Both measured to pass `check:exchange` on all eleven
> clips.

### C7 — "One character ≤ 120 KB raw" needs the knobs to be per slot

M1 says "Coordinate precision and simplification tolerance are declared knobs", in the
singular. One global setting reaches 108,316 bytes for yuliya and destroys her face. Per-slot
knobs reach 114,371 with the face intact.

> **Amendment, M1.** The knobs are declared *per slot*, in the atlas sidecar, with a default
> and per-slot overrides. Coordinate precision joins colour cap, simplification tolerance and
> minimum region area as a declared knob rather than a constant in the tracer.

### M5 — the Worker write-back endpoint cannot exist

M5 specifies "a write-back endpoint that lands an edit in `motions/authored/`" served by the
Worker. `workerd` gives `nodejs_compat` an in-memory virtual filesystem: the write succeeds,
reads back, and never reaches disk.

> **Amendment, M5.** The Worker proxies `/dev/*` to a dev sidecar that owns disk. The sidecar
> watches `motions/authored/` and `out/`, rebuilds the catalog and pushes the result over SSE
> (measured: 185 ms from save to the page). The Worker never touches the filesystem, in dev or
> otherwise.

### C1 — art carries a skeleton today, and the contract says it must not

All four art files restate eleven rest offsets that `rigs/fighter.rig.json` will own.

> **Amendment, none needed — C1 is right and the code is the bug.** Note it explicitly: M1 and
> M3 must emit art carrying only `data-bone`, and the renderer must take offsets from the
> contract. `AGENTS.md`'s own rule applies — "When code and this file disagree, one of them is
> a bug — say which." This is the code.

### One more worth naming, though it contradicts nothing

Gate 7's "Skips loudly when Blender is absent; never silently passes" is satisfiable and cheap
(1.72 s), but the contract does not say what a *reviewable* Blender artefact costs. Building a
`.blend` per clip is 13.97 s. Those are two different commands and the plan keeps them
separate: `check:blender` is the gate, `npm run blender` is the authoring aid.

---

## 3. The milestone plan

One commit per milestone, `verify` green before merge, no starting the next until the previous
is in. Every milestone turns on a gate, and once on, a gate never goes off.

### M0 — clean head

**Creates.** Orphan branch. `AGENTS.md` (amended per section 2). `rigs/fighter.rig.json`.
`src/rig/contract.ts` (reads and validates it), `src/rig/types.ts`, `src/rig/sample.ts` (the one
sampler), `src/rig/fk.ts` (forward kinematics, shared by the renderer and gate 7).
`src/clips/types.ts`, `src/clips/index.ts` with an empty catalog. `pipelines/guards/rig.ts`.
`package.json`, `tsconfig.json` (nodenext / `allowImportingTsExtensions` / `erasableSyntaxOnly`),
`vitest.config.ts`. `tests/rig/contract.test.ts`, `tests/rig/sample.test.ts`.

**Gate on.** `check:rig`, `typecheck`, `test`.

**Done when.** An empty catalog builds; `check:rig` rejects all seven mutations from spike 6
with a message naming the bone; a test samples a clip through `src/rig/sample.ts` from both a
`pipelines/` script and a `tests/` file and asserts the same numbers — C2 held by construction
from the first commit rather than asserted later.

**Defers.** All art, all clips, the kernel, the Worker. No character exists yet.

### M1 — sprite sheets

**Creates.** `pipelines/sprite/{png,segment,trace,fit,character,build}.ts`.
`characters/<id>/character.svg` for all three. Per-slot `trace` profiles in each
`characters/<id>/atlas.json`. `pipelines/guards/footprint.ts`.
`tests/sprite/{trace,characters}.test.ts`.

**Gate on.** `check:sprites`, and the character half of `check:footprint`.

**Done when.** A rebuild reproduces all three committed characters byte for byte (spike 3
confirmed determinism across processes), each inside 120 KB raw and 35 KB gzip — measured
64,790 / 81,791 / 114,371 — and the emitted art carries `data-bone` and no `data-x`/`data-y`.

**Defers.** The shell chunk half of `check:footprint` (nothing is bundled yet). Any use of the
characters — they are files on disk that nothing imports.

### M2 — clips

**Creates.** `pipelines/motion/{bvh-parse,retarget,reduce,catalog,build}.ts`.
`motions/bandai-namco-motiondataset-1.json` with the lane split and per-channel precision.
`src/clips/generated/{bandai-namco,authored}.ts`. `src/clips/movesets.ts`,
`src/clips/playback.ts`. `tests/clips/*`.

**Gate on.** `check:motions`, and the catalog half of `check:footprint`.

**Done when.** Every kept clip is reproduced byte-identically; contact ticks are asserted
against their move's active window; loop seams close; the shipped catalog is ≤ 60 KB —
measured 37,710 — and the studies build into the derived-not-shipped lane.

**Defers.** Blender, the exchange, and anything that reads a clip on a page.

### M3 — Blender exchange

**Creates.** `pipelines/exchange/{bvh-write,bvh-read,art,export,import}.ts`.
`pipelines/blender/{setup,joints}.py`. `pipelines/guards/{exchange,blender}.ts`.
`pipelines/dev/find-blender.ts`. `tests/exchange/*`.

**Gate on.** `check:exchange`, `check:blender`.

**Done when.** A clip opens in Blender as a posed character; an edit lands in
`motions/authored/`; an untouched round trip is a table of zeros; gate 7's forward-kinematics
assertion passes (measured worst 1.841×10⁻⁵ against a 0.001 threshold over 19,503 comparisons)
in 1.72 s; the guard includes a **real** Blender export rather than only the synthetic reframe;
the dropped-work report no longer counts a static rest offset as depth translation.

**Defers.** Any browser involvement. This milestone is entirely CLI and Blender.

### M4 — frame data

**Creates.** `src/kernel/**` — ported, not rewritten. `tests/kernel/*`.

**Gate on.** The kernel-seal assertion inside `test` (C6: `src/kernel/**` imports nothing from
animation, SVG, the shell or the Worker, and touches no DOM or wall clock).

**Done when.** A move's active window and its clip's contact tick are asserted against each
other, and the seal test fails if anything in `src/kernel/**` reaches outward.

**Defers.** Rendering. The kernel is stepped only by tests.

### M5 — preview loop

**Creates.** `src/render/{place,arena,skeleton-overlay}.ts`, `src/render/art/fighter.svg`.
`src/shell/{stage,preview,worker,keyboard,debug-panel}.ts` and their CSS. `index.html`,
`preview.html`. `pipelines/dev/{lifecycle,sidecar}.ts`. `vite.config.ts`,
`wrangler.local.jsonc`. `tests/shell/*`, `tests/guards/architecture.test.ts`.

**Gate on.** The shell half of `check:footprint`; `assert-local-only`; the production build.

**Done when.** An edit saved in Blender shows up in the browser with no hand-run command
(measured 185 ms save → page); characters are fetched on demand and no raster and no character
SVG reaches the bundle; the shell chunk is ≤ 150 KB raw and ≤ 50 KB gzip — measured 44,427 /
9,589 with characters fetched and studies excluded, against a 1,497,551 / 408,778 baseline.

**Defers.** Editing poses in the page. The loop is Blender → disk → page; the sidecar's
disk-write path exists and is proved but nothing in the page uses it yet.

### M6 — agent surface

**Creates.** `pipelines/render/clip.ts` (contact sheets), `rigs/authored-clip.schema.json`,
`docs/AUTHORING.md`, and a `--check` plus machine-readable report on every pipeline that lacks
one.

**Gate on.** No new gate. Every existing gate gains a machine-readable failure report naming
what changed and by how much.

**Done when.** A clip can be authored end to end without opening an editor: write JSON against
the schema, validate, render a contact sheet, look, iterate — and each step prints a report an
agent can act on.

**Defers.** Nothing downstream; this is the last feature milestone.

### M7 — cruft gate

**Creates.** `pipelines/guards/cruft.ts`. A final section in `README.md`.

**Gate on.** `check:cruft` — no orphan docs, no unreferenced files, no dead scripts, zero
runtime dependencies.

**Done when.** The final line count, shipped byte count and the purpose of each directory are
stated, and every tracked path is reachable from something.

**Defers.** Nothing. This is the end.

---

## 4. Order of work

The milestones are already ordered, and the dependencies are real rather than conventional:

1. **M0 before everything.** The rig contract is the input to the tracer (M1), the retarget
   (M2), the Blender armature (M3) and the renderer (M5). Spike 6 showed it is currently
   restated in five places; every milestone after M0 removes one of them.
2. **M1 before M2** only because `check:footprint` is easier to land one budget at a time.
   They are otherwise independent and could be swapped.
3. **M3 needs M2** — there is nothing to export until clips exist.
4. **M4 is independent of M1–M3** and could be done at any point after M0. It is placed fourth
   because M5 wants a kernel to drive.
5. **M5 needs M1, M2, M3 and M4** — it is the first milestone where anything is on a page.
6. **M6 needs every pipeline to exist** before it can give them all the same surface.
7. **M7 last**, by definition.

Within M0, one ordering matters: write `rigs/fighter.rig.json` and `check:rig` *before*
`src/rig/sample.ts`, so the sampler is written against a validated contract rather than
alongside a draft.

---

## 5. Purge manifest

Every path tracked in the repository today, with a verdict. The list is generated from
`git ls-files` and asserted complete — 112 paths, **53 port, 54 rewrite, 5 delete**. Nothing is
unlisted.

*port* — moves with its reasoning intact; translated to TypeScript where it is a `.mjs` script,
but not redesigned. *rewrite* — the behaviour survives, the code is written again against the
new contracts. *delete* — goes away.

This file is not in the table: it did not exist when the table was generated. It is itself
*delete* at M7 — once the milestones are done the plan is history, and `AGENTS.md` plus the
commit log say everything it says.

**`(root)`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `.gitattributes` | port | `.gitattributes` | The BVH trailing-whitespace rule still protects the vendored capture bytes. |
| `.gitignore` | rewrite | `.gitignore` | Same idea, new names: out/ and .runtime/ stay ignored, rigs/ must stay tracked. |
| `AGENTS.md` | port | `AGENTS.md` | This is the contract. It is amended by this plan, not replaced. |
| `README.md` | rewrite | `README.md` | Describes today's commands and layout; both change wholesale. |
| `index.html` | rewrite | `index.html` | The stage page is rebuilt against the new shell. |
| `package-lock.json` | rewrite | `package-lock.json` | Regenerated; vite/vitest/wrangler/typescript survive as devDependencies. |
| `package.json` | rewrite | `package.json` | New pipeline entry points, no build step for them, and the dev sidecar. |
| `preview.html` | rewrite | `preview.html` | Becomes the M5 preview: character, clip, scrub, skeleton, kernel. |
| `tsconfig.json` | rewrite | `tsconfig.json` | Must become nodenext + allowImportingTsExtensions + erasableSyntaxOnly (spike 1). |
| `vite.config.ts` | rewrite | `vite.config.ts` | Must stop inlining character art; that is 93% of today's shell chunk (spike 3). |
| `vitest.config.ts` | port | `vitest.config.ts` | Four lines, and vitest resolves .ts-extension imports unchanged (spike 1). |
| `wrangler.local.jsonc` | port | `wrangler.local.jsonc` | Local-only config is already right; it gains nothing but a dev proxy route. |

**`characters/<id>`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `characters/barst/atlas.json` | rewrite | `characters/barst/atlas.json` | Gains the per-slot trace profile the 120 KB budget needs (spike 3). |
| `characters/barst/atlas.png` | port | `characters/barst/atlas.png` | Build-time input, untouched. |
| `characters/kiran/atlas.json` | rewrite | `characters/kiran/atlas.json` | Same: per-slot trace profile alongside its prop bindings. |
| `characters/kiran/atlas.png` | port | `characters/kiran/atlas.png` | Build-time input, untouched. |
| `characters/yuliya/atlas.json` | rewrite | `characters/yuliya/atlas.json` | Same, and this is the character the budget is set by. |
| `characters/yuliya/atlas.png` | port | `characters/yuliya/atlas.png` | Build-time input, untouched. |

**`docs`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `docs/CHARACTER_ATLAS.md` | rewrite | `docs/CHARACTER_ATLAS.md` | Still the atlas author's guide, but the knobs and the budget are new. |
| `docs/EXPERIMENTS.md` | delete | — | Every path it names disappears; M6's authoring loop replaces it. |
| `docs/HEXFRAME_COMBAT_AUDIT.md` | port | `docs/HEXFRAME_COMBAT_AUDIT.md` | Provenance record for the kernel's origin. Deleting it loses why the boundary is where it is. |
| `docs/MOTION_IMPORT.md` | rewrite | `docs/MOTION_IMPORT.md` | The measured-import reasoning is kept; the commands and the study lane change. |
| `docs/SWORD-MOTION-REFERENCE.md` | port | `docs/SWORD-MOTION-REFERENCE.md` | C8 provenance for the four sword clips, and the doctrine for when the attachment point is used again. See open question 3. |

**`motions/authored`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `motions/authored/README.md` | port | `motions/authored/README.md` | Still exactly what that directory is. |

**`motions`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `motions/bandai-namco-motiondataset-1.json` | rewrite | `motions/bandai-namco-motiondataset-1.json` | Gains per-channel precision and a shipped/study lane split (spike 2). |

**`scripts`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `scripts/assert-local-only.mjs` | rewrite | `pipelines/guards/local-only.ts` | Same invariants, TypeScript, machine-readable report. |
| `scripts/build-characters.mjs` | rewrite | `pipelines/sprite/build.ts` | CLI shape survives; becomes TypeScript with a machine-readable report. |
| `scripts/build-motions.mjs` | rewrite | `pipelines/motion/build.ts` | Emits compact catalogs and the study lane separately. |
| `scripts/check-motion-exchange.mjs` | rewrite | `pipelines/guards/exchange.ts` | Keeps every rejection case and adds the real Blender export the synthetic reframe stands in for. |
| `scripts/export-motions.mjs` | rewrite | `pipelines/exchange/export.ts` | Bakes through the runtime sampler (C2/C4) rather than a copy of it. |
| `scripts/import-motions.mjs` | rewrite | `pipelines/exchange/import.ts` | Same reporting, corrected dropped-work measurement. |
| `scripts/lifecycle.mjs` | port | `pipelines/dev/lifecycle.ts` | Hard-won port reaping and process-tree teardown. Ported, then extended with the sidecar. |

**`scripts/atlas`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `scripts/atlas/model.mjs` | rewrite | `pipelines/sprite/character.ts` | Emits art with no data-x/data-y (C1) and resolves knobs per slot. |
| `scripts/atlas/png.mjs` | port | `pipelines/sprite/png.ts` | A correct PNG decoder with no opinions. Translate to TypeScript, change nothing. |
| `scripts/atlas/preview.mjs` | delete | — | It exists to duplicate rig.ts's transform for a script that cannot import it. Under C2 it can. |
| `scripts/atlas/segment.mjs` | port | `pipelines/sprite/segment.ts` | Island finding and slot assignment by band and reading order. |
| `scripts/atlas/skeleton.mjs` | rewrite | `pipelines/sprite/fit.ts` | Its constants become rigs/fighter.rig.json; what is left is the fitting itself. |
| `scripts/atlas/trace.mjs` | port | `pipelines/sprite/trace.ts` | The layering strategy is not to be redesigned. Ported with its reasoning; only `places` and per-slot knobs are added. |

**`scripts/blender`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `scripts/blender/setup.py` | port | `pipelines/blender/setup.py` | Measured calibration against Blender's importers. Not to be redesigned. |

**`scripts/motion`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `scripts/motion/art.mjs` | port | `pipelines/exchange/art.ts` | The calibration corner is a measured-calibration step and must not be redesigned. |
| `scripts/motion/bvh-read.mjs` | port | `pipelines/exchange/bvh-read.ts` | The measured-axis reader is the best thing in the repo. Ported, with the rest-offset bug fixed (spike 5). |
| `scripts/motion/bvh-write.mjs` | port | `pipelines/exchange/bvh-write.ts` | Channel layout and sign conventions move to the rig contract; the writer is unchanged. |
| `scripts/motion/bvh.mjs` | port | `pipelines/motion/bvh-parse.ts` | The comment about Blender's reference importer doubling limb lengths is the whole value. |
| `scripts/motion/catalog.mjs` | rewrite | `pipelines/motion/catalog.ts` | Gains the shipped/study split and compact emission. |
| `scripts/motion/clip.mjs` | rewrite | `pipelines/motion/reduce.ts` | simplify() and keyframesFromChannels() survive; samplePose() is deleted under C2. |
| `scripts/motion/retarget.mjs` | port | `pipelines/motion/retarget.ts` | Projection, unwrapping, loop-seam closing and contact assertion are hard-won. |
| `scripts/motion/rig.mjs` | rewrite | `src/rig/contract.ts` | Reads rigs/fighter.rig.json instead of parsing a drawing. Proven byte-identical in spike 6. |

**`src/animation`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `src/animation/clips.ts` | rewrite | `src/clips/index.ts` | Two lanes survive; the catalog becomes fetchable rather than only imported. |
| `src/animation/movesets.ts` | rewrite | `src/clips/movesets.ts` | The `study` slot must stop pointing at a clip the catalog no longer ships (spike 2). |
| `src/animation/preview-playback.ts` | port | `src/clips/playback.ts` | Eight lines that say what the preview does at a loop seam. |
| `src/animation/sample.ts` | rewrite | `src/rig/sample.ts` | Becomes THE sampler both the runtime and every pipeline import (C2, proven in spike 1). |
| `src/animation/types.ts` | rewrite | `src/clips/types.ts` | Clip and keyframe types, unchanged in meaning. |

**`src/animation/generated`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `src/animation/generated/authored.ts` | rewrite | `src/clips/generated/authored.ts` | Regenerated in the same shape. |
| `src/animation/generated/bandai-namco.ts` | rewrite | `src/clips/generated/bandai-namco.ts` | Regenerated compact, per-channel precision, studies excluded: 231 KB -> 37.7 KB. |

**`src/app`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `src/app/main.ts` | rewrite | `src/shell/stage.ts` | The stage entry point, rebuilt. |
| `src/app/preview.css` | rewrite | `src/shell/preview.css` | Rebuilt with the preview page. |
| `src/app/preview.ts` | rewrite | `src/shell/preview.ts` | Becomes the M5 preview with the dev event stream. |
| `src/app/skeleton-debug.css` | rewrite | `src/shell/skeleton-overlay.css` | Rebuilt with the overlay. |
| `src/app/skeleton-debug.ts` | rewrite | `src/shell/skeleton-overlay.ts` | Draws the contract's bones rather than the document's groups. |
| `src/app/styles.css` | rewrite | `src/shell/stage.css` | Also stops being the place bone paint is defined (pipelines/exchange/art.ts reads it today). |

**`src/combat`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `src/combat/collision/aabb.ts` | port | `src/kernel/collision/aabb.ts` | Integer AABB intersection. |
| `src/combat/collision/boxes.ts` | port | `src/kernel/collision/boxes.ts` | Active hitbox windows and hurtbox selection. |
| `src/combat/collision/pushbox.ts` | port | `src/kernel/collision/pushbox.ts` | Symmetric separation. |
| `src/combat/commands/attack.ts` | port | `src/kernel/commands/attack.ts` | Input edge to move start. |
| `src/combat/constants.ts` | port | `src/kernel/constants.ts` | Integer world units and the 60 Hz tick. |
| `src/combat/content.ts` | port | `src/kernel/content.ts` | Two transparent frame-data contracts and their validator. |
| `src/combat/hit-resolution.ts` | port | `src/kernel/hit-resolution.ts` | Single-hit gating, hitstop, hitstun, pushback. |
| `src/combat/index.ts` | port | `src/kernel/index.ts` | The kernel's one public surface. |
| `src/combat/movement/physics.ts` | port | `src/kernel/movement/physics.ts` | Gravity, friction, stage bounds. |
| `src/combat/simulation.ts` | port | `src/kernel/simulation.ts` | Deterministic stepping. The thing C6 seals. |
| `src/combat/state/machine.ts` | port | `src/kernel/state/machine.ts` | Mode transitions and frame counters. |
| `src/combat/types.ts` | port | `src/kernel/types.ts` | The frame-data vocabulary. C6 says this is first class. |

**`src/debug`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `src/debug/panel.ts` | rewrite | `src/shell/debug-panel.ts` | Rebuilt against the new toggles and the fetched-skin flow. |

**`src/input`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `src/input/keyboard.ts` | rewrite | `src/shell/keyboard.ts` | Its constructor parameter property is not erasable syntax (spike 1). |

**`src/svg/characters`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `src/svg/characters/barst.svg` | rewrite | `characters/barst/character.svg` | Regenerated at the per-slot knobs; becomes a fetched asset, not a module. |
| `src/svg/characters/index.ts` | delete | — | Its ?raw imports are the C7 violation: they inline 1.4 MB of art into the shell chunk. |
| `src/svg/characters/kiran.svg` | rewrite | `characters/kiran/character.svg` | Same. |
| `src/svg/characters/yuliya.svg` | rewrite | `characters/yuliya/character.svg` | Same. 620,401 bytes today, 114,371 at the proposed knobs. |

**`src/svg`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `src/svg/fighter.svg` | rewrite | `src/render/art/fighter.svg` | Keeps its art and its comment; loses the 11 data-x/data-y offsets C1 forbids. |
| `src/svg/renderer.ts` | rewrite | `src/render/arena.ts` | Same job; parameter properties must go (spike 1) and skins are fetched. |
| `src/svg/rig.ts` | rewrite | `src/rig/pose.ts + src/render/place.ts` | Split: the pure bone tree/pose maths a pipeline can import, and the DOM placement it cannot. |
| `src/svg/weapons.ts` | delete | — | Weapons are explicitly out of scope. The named attachment point in the rig contract is what survives. |

**`src`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `src/worker.ts` | rewrite | `src/shell/worker.ts` | Gains the dev-only /dev/* proxy to the sidecar (spike 4); it can never touch disk itself. |

**`tests`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `tests/aabb.test.ts` | port | `tests/kernel/aabb.test.ts` | Pure integer geometry; nothing about it changes. |
| `tests/animation.test.ts` | rewrite | `tests/rig/sample.test.ts` | Becomes the one sampler's test, asserted from both a pipeline and the runtime. |
| `tests/architecture.test.ts` | rewrite | `tests/guards/architecture.test.ts` | Keeps the no-raster guard; gains C6's kernel-import seal. |
| `tests/character-preview.test.ts` | rewrite | `tests/shell/preview.test.ts` | Rebuilt against the fetched-skin flow. |
| `tests/characters.test.ts` | rewrite | `tests/sprite/characters.test.ts` | Drops the rig.ts/preview.mjs duplication assertion, which no longer has two copies to compare. |
| `tests/content.test.ts` | port | `tests/kernel/content.test.ts` | Frame-data validation. |
| `tests/motion-exchange.test.ts` | rewrite | `tests/exchange/exchange.test.ts` | Rebuilt, and the Blender case stops being synthetic. |
| `tests/motion-import.test.ts` | rewrite | `tests/exchange/import.test.ts` | Rebuilt against the corrected dropped-work report. |
| `tests/movesets.test.ts` | rewrite | `tests/clips/movesets.test.ts` | Rebuilt without the study slot. |
| `tests/preview-playback.test.ts` | port | `tests/clips/playback.test.ts` | Loop-seam behaviour of the preview. |
| `tests/simulation.test.ts` | port | `tests/kernel/simulation.test.ts` | The kernel's determinism and boundary test. |
| `tests/skeleton-debug.test.ts` | rewrite | `tests/shell/skeleton-overlay.test.ts` | Rebuilt against the contract-driven overlay. |
| `tests/weapon-alignment.test.ts` | delete | — | Tests src/svg/weapons.ts, which is out of scope. |

**`third_party/bandai-namco-motiondataset-1`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `third_party/bandai-namco-motiondataset-1/LICENSE` | port | `third_party/bandai-namco-motiondataset-1/LICENSE` | C8: the vendored licence and notice stay beside the source subset. |
| `third_party/bandai-namco-motiondataset-1/NOTICE.md` | port | `third_party/bandai-namco-motiondataset-1/NOTICE.md` | C8: the vendored licence and notice stay beside the source subset. |
| `third_party/bandai-namco-motiondataset-1/cfg/content_label.txt` | port | `third_party/bandai-namco-motiondataset-1/cfg/content_label.txt` | Upstream annotation tables the manifest checks each clip against. |
| `third_party/bandai-namco-motiondataset-1/cfg/style_label.txt` | port | `third_party/bandai-namco-motiondataset-1/cfg/style_label.txt` | Upstream annotation tables the manifest checks each clip against. |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_bow_normal_001.bvh` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_bow_normal_001.bvh` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_bow_normal_001.json` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_bow_normal_001.json` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_dash_normal_001.bvh` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_dash_normal_001.bvh` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_dash_normal_001.json` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_dash_normal_001.json` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_punch_normal_001.bvh` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_punch_normal_001.bvh` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_punch_normal_001.json` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_punch_normal_001.json` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_run_normal_001.bvh` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_run_normal_001.bvh` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_run_normal_001.json` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_run_normal_001.json` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_slash_normal_001.bvh` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_slash_normal_001.bvh` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_slash_normal_001.json` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_slash_normal_001.json` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_walk_normal_002.bvh` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_walk_normal_002.bvh` | Pinned capture subset. Never regenerated, never edited (C8). |
| `third_party/bandai-namco-motiondataset-1/data/dataset-1_walk_normal_002.json` | port | `third_party/bandai-namco-motiondataset-1/data/dataset-1_walk_normal_002.json` | Pinned capture subset. Never regenerated, never edited (C8). |

---

## Open questions

Places where a decision is still a person's to make, or where I am not confident enough to
plan around my own answer.

**1. The flat-colour look is a taste decision, not a budget decision.** Per-slot knobs reach
114,371 bytes with the face intact, but yuliya's skirt and kiran's cloak lose their shading
gradients. I think it reads as a deliberate flat-colour style. Someone who drew these atlases
should look at the before/after — particularly the head crops — and either accept it, or say
that 120 KB is the wrong number and name the one that is. Both are reasonable; the spike makes
it a decision instead of a surprise. If the answer is "keep the shading", the measured
face-preserving cost is 140,242 raw / 42,206 gzip for yuliya, and C7 wants amending
instead of the art.

**2. Where the study clips live.** I have proposed a derived-but-not-shipped lane, but not
where the preview gets them from. Two options I did not choose between: the dev sidecar serves
them from `out/` on demand (they exist only while a sidecar is running), or they become a
second fetchable catalog the page loads when a study slot is selected (they exist in
production too, just not in the shell chunk). The first is simpler and matches "studies are an
authoring aid"; the second keeps the preview identical in dev and in a build. This needs
someone to say which the preview is *for*.

**3. `docs/SWORD-MOTION-REFERENCE.md` versus M7.** I marked it *port*, because it is C8
provenance for four shipped clips and it records the doctrine for when the attachment point is
used again. But weapons are explicitly out of scope, and M7's cruft gate forbids orphan docs —
a document describing code that does not exist is exactly what that gate is for. Either M7's
rule needs an exception for provenance and doctrine records, or this file should be folded
into `docs/MOTION_IMPORT.md` as a paragraph. I lean towards folding it in, but commit
`fb5c819` ("Restore the sword motion doctrine to main") suggests it was deliberately kept, and
I do not know why.

**4. `length` is ambiguous for branching bones.** In the draft, `pelvis` gets `length: 6` from
its offset to `torso`, but it also parents both legs at its own origin. Either drop `length`
for branching bones, or define it as "distance to the bone that continues the chain" and say
which child that is. It matters because the arm IK reads it — see the forearm off-by-one in
spike 6 — so it should not stay vague.

**5. The forearm off-by-one is a behaviour change, not just a fix.** Setting the IK's lower
link to the declared 23 rather than the hardcoded 22 will move every two-handed grip solution
slightly. Since weapons are being deleted this milestone the question is deferred, not
answered — but if the attachment point is ever used, the rig's number should win and someone
should look at the result.

## What I am not sure about

- **The 185 ms save-to-page figure is from a synthetic write**, not from Blender actually
  saving. Blender's exporter may write in several steps that the 40 ms debounce coalesces
  differently. The debounce window is a guess that should be re-measured against a real Blender
  export the first time M5 runs.
- **I did not measure the tracer at per-slot knobs on an atlas it has never seen.** The three
  committed characters are the whole sample. A fourth atlas with a different colour palette
  could need different knobs, which is an argument for the profile living in the sidecar — as
  proposed — rather than in the tracer.
- **`check:sprites` asserts a byte-identical rebuild, and the tracer's determinism is only
  verified on this machine, this Node.** Median cut and Lloyd relaxation are deterministic by
  construction and five runs agreed, but floating-point summation order across architectures is
  the classic way that promise breaks. Worth one check on a second machine before relying on
  it.
- **I have not run the whole `verify` chain end to end in the proposed shape**, only each gate
  against today's code. The interactions — particularly `check:footprint` reading a catalog
  that `check:motions` has just rebuilt — are planned, not measured.
