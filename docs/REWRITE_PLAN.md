# Rewrite plan

`AGENTS.md` is the contract. This file is how the repository gets there: the milestones
expanded into files, gates and definitions of done; a verdict on every path that exists today;
what seven spikes measured; and the places where those measurements contradict the contract.

Everything numbered here was run. Where a number is a projection rather than a measurement it
says so. Where I could not settle a question, it is in [Open questions](#open-questions)
rather than resolved by assumption.

Spike work happened in a throwaway worktree. Nothing from it is committed.

---

## 1. The seven spikes

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

### Spike 7 — every piece swappable with every piece

The goal is that a figure is assembled from parts that can come from anywhere, with cosmetic
overlays that do not clip through it. Two questions, both measurable.

**Do body parts from different sheets already compose?** Mostly yes, and by construction: the
rig already canonicalises joints (`CANONICAL_REST`) and part sizes (`CANONICAL_ART_HEIGHT`), so
a thigh is 25 units tall whoever drew it. Nine chimeras were built from parts belonging to
different atlases with no retouching and all nine read as figures.

Coverage at the joint, measured for **all 36 cross-sheet pairings** of the four in-line joints:

| joint | parent reaches past | child starts above | overlap |
| --- | ---: | ---: | ---: |
| knee | 2.5–3.0 | 0.0–0.7 | **1.7–3.0** |
| elbow | 2.4–3.0 | 0.0–0.6 | **1.8–3.0** |

**No gaps anywhere.** A cross-sheet pairing overlaps as much as a same-sheet one (1.8 against
1.9 at the knee). Background never shows through.

What does vary is the *width* at the joint. The child paints over the parent, so a narrower
child leaves the parent's end showing:

| joint | narrowest | widest | worst cross-sheet step |
| --- | ---: | ---: | ---: |
| knee | 8.5 (yuliya) | 14.1 (barst) | **5.6 units** |
| elbow | 5.7 (kiran) | 11.1 (kiran) | **5.4 units** |

That reads as a taper rather than damage — barst's own elbow already steps 3.3 units inside one
sheet — but it is the thing to declare and guard rather than discover.

**Do cosmetics transfer?** No, and the reason is structural. A prop is bound in the sidecar as a
raw offset in the *source sheet's atlas pixels*, multiplied at build time by the *target bone's*
scale. The same authored offset `(0, -19)`:

| figure | torso scale | lands at | art scale |
| --- | ---: | ---: | ---: |
| yuliya | 0.966 | (0, −18.35) | 0.966 |
| kiran | 0.737 | (0, −14.00) | 0.737 |
| barst | 0.459 | (0, −8.72) | 0.459 |

Three places, three sizes. Rendered side by side the piece sits at yuliya's neck, buried in
kiran's chest and floating over barst's ribs. Bound instead to a **named anchor** with a height
declared in rig units, the same art lands at `(0, −31)` at scale `0.412` on all three.

**The same place is already spelled three ways.** The forearm carries `CANONICAL_WRIST` `[0,18]`
(where hand art goes), `LEAF_TIPS` `[0,23]` (the BVH End Site), and a hardcoded `22` in
`weapons.ts` (the IK's lower link) — in three files, with nothing saying which is which. They
are three different concepts that drifted into three unrelated constants.

**Splitting a figure into per-part files is nearly free**, measured at the proposed trace
profile:

| | barst | kiran | yuliya |
| --- | ---: | ---: | ---: |
| one document | 64,790 | 81,791 | 114,371 |
| eleven part files | 64,100 | 81,101 | 113,690 |
| eleven part files, gzip | 20,549 | 25,693 | 35,681 |
| largest single part | — | — | 51,711 (head) |

Raw is ~1% *smaller* split (the per-bone wrappers cost less than the nesting they replace);
gzip is ~4% worse because each file compresses alone. yuliya lands at 35,681 against a 35,840
gzip budget — inside it, with 159 bytes to spare, which is too tight to call comfortable.

## 2. Contracts these findings contradict

Five, named rather than worked around. The evidence for each is in section 1; this is only the
decision.

**C7 — the 60 KB catalog is reachable only with the studies out of it.** They are 59,523 bytes
compact, 97% of the budget, and they are also *referenced*: `UNARMED_MOVESET.clips.study` and
`SWORD_MOVESET.clips.study` both point at one. They are authoring aids — `bnrStrikeNormal` was
cut from the punch study, the three sword clips from the slash study — so they need to be
derived but not shipped, and C3 has only two categories today.

> **C3** gains a third: a clip may be *derived and not shipped*. It rebuilds deterministically
> like any generated clip and is written to `out/` on every build, where `export:motions`
> already puts it and where a Blender project can be pointed at it, but it is not in the
> catalog C7 measures. The manifest declares which lane each clip is in.
>
> **C7** says what the 60 KB measures: the shipped catalog, raw bytes, studies excluded.

**C4 — "no more precision than that justifies" cannot be one number.** Reduction is 1° *and*
0.15 units. One `round()` at 1dp fails the exchange gate on the pelvis channel; at 3dp it
stores two digits of noise on every rotation.

> **C4** states precision per channel: rotation to one decimal, position to two.

**C7 — the 120 KB character needs the knobs to be per slot.** M1 says "Coordinate precision and
simplification tolerance are declared knobs", singular. One global setting fits and takes
yuliya's face with it.

> **M1** declares the knobs *per slot* in the atlas sidecar, with a default and overrides, and
> adds coordinate precision to the list — it is a constant inside the tracer today.

**M5 — the Worker write-back endpoint cannot exist.** `workerd` gives `nodejs_compat` an
in-memory filesystem that reports success and drops the bytes.

> **M5** has the Worker proxy `/dev/*` to a dev sidecar that owns disk. The sidecar watches
> `motions/authored/` and `out/`, rebuilds, and pushes over SSE. The Worker never touches the
> filesystem.

**C1 — art carries a skeleton, and the contract says it must not.** All four art files restate
eleven rest offsets. They currently *agree* with the contract, so this is duplication rather
than drift — but the tracer regenerates it on every build.

> **No amendment: C1 is right and the code is the bug.** M1 and M3 emit art carrying only
> `data-bone`; the renderer takes offsets from the contract.

**C1 — the rig has to carry four things it does not name today.** "Every piece of every character
swappable with every piece of every other character" is a contract, not a feature, and spike 7
found the parts of it that are missing.

> **C1 gains named anchors.** Points on a bone, in that bone's own frame, in rig units:
> `torso.neck`, `torso.belt`, `torso.shoulder-front`, `head.crown`, `head.face`,
> `forearm-front.grip`, `shin-front.foot`, and so on — 19 across 11 bones in the draft. A
> cosmetic binds to an anchor. Nothing binds to a pixel offset in the sheet it was drawn on.
> Every anchor is derived from the skeleton or from a constant that already exists: a joint
> anchor *is* the child bone's offset, and `grip` *is* `CANONICAL_WRIST`.
>
> **C1 gains depth slots.** `["under", "part", "over", "outer"]`, ordered, per bone. A cosmetic
> names one. The `under` boolean in the sidecar today is two layers where four are needed, and a
> boolean cannot say that a cloak goes outside a pauldron.
>
> **C1 gains sockets.** Each part declares the overlap it provides at each joint it touches and
> its width there. The guard asserts every part pairs with every other at or above the minimum
> overlap (measured: 1.7 units today, so declare 1.5) and reports width steps past a tolerance
> (measured worst: 5.6 units, so declare 6). The guard reports; it never resizes art.
>
> **C1 gains a `hides` list on a cosmetic.** A full helm names `head`, and that part's own art
> is not drawn rather than painted over. This is what stops hair poking through a helmet, and
> it is the only mechanism here that addresses clipping directly.
>
> **A new concept: a figure.** Today "character" means both a set of art and a thing you play.
> Splitting them is what makes every piece swappable: `figures/<name>.json` is a *manifest of
> choices* — which part fills each slot, which cosmetics are worn, which rig it targets — and
> the art it names may come from any number of sheets. A character becomes one possible figure
> rather than the only unit of assembly.
>
> **Every contract file carries `"contract": 1`** and a loader refuses a major it does not know.
> The rig path is `rigs/<name>.rig.json` and a figure names its rig, so a second skeleton costs
> a file rather than a fork.

**C7 — "one character" stops being a meaningful unit.** As eleven part files a figure is
64,100 / 81,101 / 113,690 raw and 20,549 / 25,693 / 35,681 gzip. yuliya clears the 35,840 gzip
budget by 159 bytes.

> **C7** measures *a figure* — the set of parts and cosmetics that assemble one — not a file,
> and states both a per-figure bound (120 KB raw, 35 KB gzip) and a per-part bound so no single
> part can be pathological. The measured largest part is yuliya's head at 51,711 bytes; a 64 KB
> per-part bound leaves room without inviting it.

One more worth naming, though it contradicts nothing: gate 7's cost is 1.72 s, while building a
reviewable `.blend` per clip is 13.97 s. Those stay two commands — `check:blender` is the gate,
`npm run blender` is the authoring aid.

## 3. The milestone plan

One commit per milestone, `verify` green before merge, no starting the next until the previous
is in. Every milestone turns on a gate, and once on, a gate never goes off.

### M0 — clean head

**Creates.** Orphan branch. `AGENTS.md` (amended per section 2). `rigs/fighter.rig.json` —
bones, anchors, depth slots, sockets, paint order, depth profiles, axis map, BVH layout,
`"contract": 1`. `src/rig/contract.ts` (reads and validates it), `src/rig/types.ts`,
`src/rig/sample.ts` (the one sampler), `src/rig/fk.ts` (forward kinematics, shared by the
renderer and gate 7). `src/clips/types.ts`, `src/clips/index.ts` with an empty catalog.
`pipelines/guards/rig.ts`. `package.json`, `tsconfig.json` (nodenext /
`allowImportingTsExtensions` / `erasableSyntaxOnly`), `vitest.config.ts`.
`tests/rig/{contract,sample,anchors}.test.ts`.

The sampler is already split out and catalog-free — see the bug list — so M0 moves it rather
than writing it.

**Gate on.** `check:rig`, `typecheck`, `test`.

**Done when.** An empty catalog builds; `check:rig` rejects all seven mutations from spike 6
with a message naming the bone, and rejects an anchor on an unknown bone, a depth slot outside
the declared list, and an unknown `"contract"` major; a test samples a clip through
`src/rig/sample.ts` from both a `pipelines/` script and a `tests/` file and asserts the same
numbers — C2 held by construction from the first commit.

**Defers.** All art, all clips, the kernel, the Worker. No figure exists yet.

### M1 — parts and figures

The milestone that makes everything swappable. It stops emitting one document per character.

**Creates.** `pipelines/sprite/{png,segment,trace,fit,part,build}.ts`.
`characters/<id>/parts/<slot>.svg` — one file per part, the swappable unit, carrying
`data-bone` and no skeleton. `figures/<name>.json` — the manifest of choices.
Per-slot `trace` profiles in each `characters/<id>/atlas.json`.
`pipelines/guards/{footprint,sockets}.ts`. `tests/sprite/{trace,parts,sockets}.test.ts`.

**Gate on.** `check:sprites`, `check:sockets`, and the figure half of `check:footprint`.

**Done when.** A rebuild reproduces every committed part byte for byte; each figure is inside
120 KB raw and 35 KB gzip and no single part exceeds the per-part bound — measured 64,100 /
81,101 / 113,690 raw, largest part 51,711; emitted parts carry `data-bone` and no
`data-x`/`data-y`; and **`check:sockets` assembles every part with every other part in its slot
across every sheet and asserts the overlap at each joint**, which is 36 pairings per joint
today and is the gate that makes the swap claim true rather than hoped for.

**Defers.** Cosmetics — M6. A figure at this point is body parts only.

### M2 — clips

**Creates.** `pipelines/motion/{bvh-parse,retarget,reduce,catalog,build}.ts`.
`motions/bandai-namco-motiondataset-1.json` with the lane split and per-channel precision.
`src/clips/generated/{bandai-namco,authored}.ts`. `src/clips/movesets.ts`,
`src/clips/playback.ts`. `tests/clips/*`.

**Gate on.** `check:motions`, and the catalog half of `check:footprint`.

**Done when.** Every kept clip is reproduced byte-identically; contact ticks are asserted
against their move's active window; loop seams close; the shipped catalog is ≤ 60 KB —
measured 37,710 — and every build also writes the studies to `out/`, where a Blender project
is pointed and where nothing in the bundle can reach them.

**Defers.** Blender, the exchange, and anything that reads a clip on a page.

### M3 — Blender exchange

**Creates.** `pipelines/exchange/{bvh-write,bvh-read,art,export,import}.ts`.
`pipelines/blender/{setup,joints}.py`. `pipelines/guards/{exchange,blender}.ts`.
`pipelines/dev/find-blender.ts`. `tests/exchange/*`.

**Gate on.** `check:exchange`, `check:blender`.

**Done when.** A clip opens in Blender as a posed figure; an edit lands in
`motions/authored/`; an untouched round trip is a table of zeros; gate 7's forward-kinematics
assertion passes (measured worst 1.841×10⁻⁵ against a 0.001 threshold over 19,503 comparisons)
in 1.72 s; and the guard includes a **real** Blender export rather than only the synthetic
reframe. (The dropped-work false positive that export exposed is already fixed — see
[Bugs found and fixed while planning](#bugs-found-and-fixed-while-planning).)

**Defers.** Any browser involvement. This milestone is entirely CLI and Blender.

### M4 — frame data

**Creates.** `src/kernel/**` — ported, not rewritten. `tests/kernel/*`.

**Gate on.** The kernel-seal assertion inside `test` (C6: `src/kernel/**` imports nothing from
animation, SVG, the shell or the Worker, and touches no DOM or wall clock).

**Done when.** A move's active window and its clip's contact tick are asserted against each
other, and the seal test fails if anything in `src/kernel/**` reaches outward.

**Defers.** Rendering. The kernel is stepped only by tests.

### M5 — preview loop

**Creates.** `src/render/{assemble,place,arena,skeleton-overlay}.ts`,
`src/render/art/fighter.svg`. `src/shell/{stage,preview,worker,keyboard,debug-panel}.ts` and
their CSS. `index.html`, `preview.html`. `pipelines/dev/{lifecycle,sidecar}.ts`.
`vite.config.ts`, `wrangler.local.jsonc`. `tests/shell/*`,
`tests/guards/architecture.test.ts`.

`assemble.ts` is new and is the point of M1: it takes a figure manifest, fetches the parts it
names, and builds the posable node. Swapping a part is re-fetching one file.

**Gate on.** The shell half of `check:footprint`; `assert-local-only`; the production build.

**Done when.** An edit saved in Blender shows up in the browser with no hand-run command
(measured 185 ms save → page); the sidecar also serves the study clips out of `out/`, so the
same file is reviewable in Blender and in the live preview without entering the catalog; parts
are fetched on demand and no raster and no part SVG reaches the bundle; a part can be swapped
in the preview without a reload; the shell chunk is ≤ 150 KB raw and ≤ 50 KB gzip — measured
44,427 / 9,589, against a 1,497,551 / 408,778 baseline.

**Defers.** Editing poses in the page. The loop is Blender → disk → page; the sidecar's
disk-write path exists and is proved but nothing in the page uses it yet.

### M6 — wardrobe

Cosmetics as their own production line, because they are authored, budgeted and reviewed
differently from body parts and because nothing before this milestone can show one.

**Creates.** `cosmetics/<set>/atlas.png` + `cosmetics/<set>/set.json`.
`pipelines/wardrobe/{build,place}.ts` emitting `cosmetics/<set>/<piece>.svg`.
`pipelines/guards/wardrobe.ts`. `tests/wardrobe/*`. A cosmetic section in
`figures/<name>.json`.

A cosmetic declares `{ anchor, layer, height, align?, rotate?, hides? }` — an anchor name and a
height in rig units, never a pixel offset in the sheet it was drawn on.

**Gate on.** `check:wardrobe`.

**Done when.** One cosmetic set renders correctly on every shipped figure without per-figure
tuning — the measured failure it replaces is the same piece landing at −18.35, −14.00 and −8.72
on three bodies; `hides` removes the part underneath rather than painting over it; the guard
rejects an unknown anchor, an unknown depth slot, a `hides` naming a slot the figure does not
have, and a cosmetic whose drawn extent does not cover what it claims to hide.

**Defers.** Rigid props. Weapons stay out of scope; `forearm.grip` exists so they can return
without reshaping anything.

### M7 — agent surface

**Creates.** `pipelines/render/clip.ts` (contact sheets), `pipelines/render/figure.ts` (a
figure sheet: every part, every cosmetic, assembled and posed),
`rigs/authored-clip.schema.json`, `rigs/figure.schema.json`, `docs/AUTHORING.md`, and a
`--check` plus machine-readable report on every pipeline that lacks one.

**Gate on.** No new gate. Every existing gate gains a machine-readable failure report naming
what changed and by how much.

**Done when.** A clip *and a figure* can be authored end to end without opening an editor:
write JSON against the schema, validate, render a sheet, look, iterate — and each step prints a
report an agent can act on.

**Defers.** Nothing downstream; this is the last feature milestone.

### M8 — cruft gate

**Creates.** `pipelines/guards/cruft.ts`. A final section in `README.md`.

**Gate on.** `check:cruft` — no orphan docs, no unreferenced files, no dead scripts, zero
runtime dependencies.

**Done when.** The final line count, shipped byte count and the purpose of each directory are
stated, and every tracked path is reachable from something.

**Defers.** Nothing. This is the end.

## 4. Order of work

The milestones are already ordered, and the dependencies are real rather than conventional:

1. **M0 before everything.** The rig contract is the input to the part builder (M1), the
   retarget (M2), the Blender armature (M3), the renderer (M5) and every cosmetic (M6). Spikes
   6 and 7 found it restated in five files, with three different numbers for one place on the
   forearm; every milestone after M0 removes one of those restatements.
2. **M1 before M2** only because `check:footprint` is easier to land one budget at a time.
   They are otherwise independent and could be swapped.
3. **M3 needs M2** — there is nothing to export until clips exist.
4. **M4 is independent of M1–M3** and could be done at any point after M0. It is placed fourth
   because M5 wants a kernel to drive.
5. **M5 needs M1, M2, M3 and M4** — it is the first milestone where anything is on a page.
6. **M6 needs M5.** A cosmetic that cannot be looked at on a figure cannot be judged, and the
   failure it fixes — a piece landing in three different places on three bodies — is only
   visible once something assembles and draws one.
7. **M7 needs every pipeline to exist** before it can give them all the same surface.
8. **M8 last**, by definition.

The plan grew from eight milestones to nine. M1 changed from "sprite sheets" to "parts and
figures" and M6 is new, because "every piece of every character swappable with every piece of
every other character" is a gate (`check:sockets`, `check:wardrobe`) rather than a property
that emerges from tracing art well.

Within M0, one ordering matters: write `rigs/fighter.rig.json` and `check:rig` *before*
`src/rig/sample.ts`, so the sampler is written against a validated contract rather than
alongside a draft.

---

## 5. Purge manifest

Every path tracked in the repository today, with a verdict. The list is generated from
`git ls-files` and asserted complete — 112 paths, **52 port, 55 rewrite, 5 delete**. Nothing is
unlisted. "in place" means the path does not move.

*port* — moves with its reasoning intact; translated to TypeScript where it is a `.mjs` script,
but not redesigned. *rewrite* — the behaviour survives, the code is written again against the
new contracts. *delete* — goes away.



**`(root)`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `.gitattributes` | port | in place | The BVH trailing-whitespace rule still protects the vendored capture bytes. |
| `.gitignore` | rewrite | in place | Same idea, new names: out/ and .runtime/ stay ignored, rigs/ must stay tracked. |
| `AGENTS.md` | port | in place | This is the contract. It is amended by this plan, not replaced. |
| `README.md` | rewrite | in place | Describes today's commands and layout; both change wholesale. |
| `index.html` | rewrite | in place | The stage page is rebuilt against the new shell. |
| `package-lock.json` | rewrite | in place | Regenerated; vite/vitest/wrangler/typescript survive as devDependencies. |
| `package.json` | rewrite | in place | New pipeline entry points, no build step for them, and the dev sidecar. |
| `preview.html` | rewrite | in place | Becomes the M5 preview: character, clip, scrub, skeleton, kernel. |
| `tsconfig.json` | rewrite | in place | Must become nodenext + allowImportingTsExtensions + erasableSyntaxOnly (spike 1). |
| `vite.config.ts` | rewrite | in place | Must stop inlining character art; that is 93% of today's shell chunk (spike 3). |
| `vitest.config.ts` | port | in place | Four lines, and vitest resolves .ts-extension imports unchanged (spike 1). |
| `wrangler.local.jsonc` | port | in place | Local-only config is already right; it gains nothing but a dev proxy route. |

**`characters/<id>`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `characters/barst/atlas.json` | rewrite | in place | Gains the per-slot trace profile the budget needs, and its prop bindings become anchor-bound cosmetics. |
| `characters/barst/atlas.png` | port | in place | Build-time input, untouched. |
| `characters/kiran/atlas.json` | rewrite | in place | Same. Its six pixel-offset props move to cosmetics/ bound by anchor. |
| `characters/kiran/atlas.png` | port | in place | Build-time input, untouched. |
| `characters/yuliya/atlas.json` | rewrite | in place | Same, and this is the figure the budget is set by. Its nine props are 53% of the sheet. |
| `characters/yuliya/atlas.png` | port | in place | Build-time input, untouched. |

**`docs`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `CHARACTER_ATLAS.md` | rewrite | in place | Still the atlas author's guide, but the knobs and the budget are new. |
| `HEXFRAME_COMBAT_AUDIT.md` | port | in place | Provenance record for the kernel's origin. Deleting it loses why the boundary is where it is. |
| `MOTION_IMPORT.md` | rewrite | in place | The measured-import reasoning and the sword doctrine are kept; the commands and the study lane change. |
| `REWRITE_PLAN.md` | delete | — | The plan is scaffolding. At M7 the milestones are done and AGENTS.md plus the commit log say everything it says. |

**`motions/authored`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `README.md` | port | in place | Still exactly what that directory is. |

**`motions`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `bandai-namco-motiondataset-1.json` | rewrite | in place | Gains per-channel precision and a shipped/study lane split (spike 2). |

**`scripts`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `assert-local-only.mjs` | rewrite | `pipelines/guards/local-only.ts` | Same invariants, TypeScript, machine-readable report. |
| `build-characters.mjs` | rewrite | `pipelines/sprite/build.ts` | CLI shape survives; becomes TypeScript with a machine-readable report. |
| `build-motions.mjs` | rewrite | `pipelines/motion/build.ts` | Emits compact catalogs and the study lane separately. |
| `check-motion-exchange.mjs` | rewrite | `pipelines/guards/exchange.ts` | Keeps every rejection case and adds the real Blender export the synthetic reframe stands in for. |
| `export-motions.mjs` | rewrite | `pipelines/exchange/export.ts` | Bakes through the runtime sampler (C2/C4) rather than a copy of it. |
| `import-motions.mjs` | rewrite | `pipelines/exchange/import.ts` | Same reporting, corrected dropped-work measurement. |
| `lifecycle.mjs` | port | `pipelines/dev/lifecycle.ts` | Hard-won port reaping and process-tree teardown. Ported, then extended with the sidecar. |

**`scripts/atlas`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `model.mjs` | rewrite | `pipelines/sprite/character.ts` | Emits art with no data-x/data-y (C1) and resolves knobs per slot. |
| `png.mjs` | port | `pipelines/sprite/png.ts` | A correct PNG decoder with no opinions. Translate to TypeScript, change nothing. |
| `preview.mjs` | delete | — | It exists to duplicate rig.ts's transform for a script that cannot import it. Under C2 it can. |
| `segment.mjs` | port | `pipelines/sprite/segment.ts` | Island finding and slot assignment by band and reading order. |
| `skeleton.mjs` | rewrite | `pipelines/sprite/fit.ts` | Its constants become rigs/fighter.rig.json; what is left is the fitting itself. |
| `trace.mjs` | port | `pipelines/sprite/trace.ts` | The layering strategy is not to be redesigned. Ported with its reasoning; only `places` and per-slot knobs are added. |

**`scripts/blender`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `setup.py` | port | `pipelines/blender/setup.py` | Measured calibration against Blender's importers. Not to be redesigned. |

**`scripts/motion`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `art.mjs` | port | `pipelines/exchange/art.ts` | The calibration corner is a measured-calibration step and must not be redesigned. |
| `bvh-read.mjs` | port | `pipelines/exchange/bvh-read.ts` | The measured-axis reader is the best thing in the repo. Ported, with the rest-offset bug fixed (spike 5). |
| `bvh-write.mjs` | port | `pipelines/exchange/bvh-write.ts` | Channel layout and sign conventions move to the rig contract; the writer is unchanged. |
| `bvh.mjs` | port | `pipelines/motion/bvh-parse.ts` | The comment about Blender's reference importer doubling limb lengths is the whole value. |
| `catalog.mjs` | rewrite | `pipelines/motion/catalog.ts` | Gains the shipped/study split and compact emission. |
| `clip.mjs` | rewrite | `pipelines/motion/reduce.ts` | simplify() and keyframesFromChannels() are all that is left in it; the duplicate sampler is already gone. |
| `retarget.mjs` | port | `pipelines/motion/retarget.ts` | Projection, unwrapping, loop-seam closing and contact assertion are hard-won. |
| `rig.mjs` | rewrite | `src/rig/contract.ts` | Reads rigs/fighter.rig.json instead of parsing a drawing. Proven byte-identical in spike 6. |

**`src/animation`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `clips.ts` | rewrite | `src/clips/index.ts` | Two lanes survive; the catalog becomes fetchable rather than only imported. |
| `movesets.ts` | rewrite | `src/clips/movesets.ts` | The `study` slot must stop pointing at a clip the catalog no longer ships (spike 2). |
| `preview-playback.ts` | port | `src/clips/playback.ts` | Eight lines that say what the preview does at a loop seam. |
| `sample.ts` | rewrite | `src/rig/sample.ts` | Already THE sampler both the runtime and the pipelines import; moves to src/rig/ and keeps its freedom from the catalog. |
| `snapshot.ts` | rewrite | `src/render/clip-for-state.ts` | Picking a clip from combat state is presentation, not sampling. Split out so the sampler stays importable by a pipeline. |
| `types.ts` | rewrite | `src/clips/types.ts` | Clip and keyframe types, unchanged in meaning. |

**`src/animation/generated`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `authored.ts` | rewrite | `src/clips/generated/authored.ts` | Regenerated in the same shape. |
| `bandai-namco.ts` | rewrite | `src/clips/generated/bandai-namco.ts` | Regenerated compact, per-channel precision, studies excluded: 231 KB -> 37.7 KB. |

**`src/app`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `main.ts` | rewrite | `src/shell/stage.ts` | The stage entry point, rebuilt. |
| `preview.css` | rewrite | `src/shell/preview.css` | Rebuilt with the preview page. |
| `preview.ts` | rewrite | `src/shell/preview.ts` | Becomes the M5 preview with the dev event stream. |
| `skeleton-debug.css` | rewrite | `src/shell/skeleton-overlay.css` | Rebuilt with the overlay. |
| `skeleton-debug.ts` | rewrite | `src/shell/skeleton-overlay.ts` | Draws the contract's bones rather than the document's groups. |
| `styles.css` | rewrite | `src/shell/stage.css` | Also stops being the place bone paint is defined (pipelines/exchange/art.ts reads it today). |

**`src/combat`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `collision/aabb.ts` | port | `src/kernel/collision/aabb.ts` | Integer AABB intersection. |
| `collision/boxes.ts` | port | `src/kernel/collision/boxes.ts` | Active hitbox windows and hurtbox selection. |
| `collision/pushbox.ts` | port | `src/kernel/collision/pushbox.ts` | Symmetric separation. |
| `commands/attack.ts` | port | `src/kernel/commands/attack.ts` | Input edge to move start. |
| `constants.ts` | port | `src/kernel/constants.ts` | Integer world units and the 60 Hz tick. |
| `content.ts` | port | `src/kernel/content.ts` | Two transparent frame-data contracts and their validator. |
| `hit-resolution.ts` | port | `src/kernel/hit-resolution.ts` | Single-hit gating, hitstop, hitstun, pushback. |
| `index.ts` | port | `src/kernel/index.ts` | The kernel's one public surface. |
| `movement/physics.ts` | port | `src/kernel/movement/physics.ts` | Gravity, friction, stage bounds. |
| `simulation.ts` | port | `src/kernel/simulation.ts` | Deterministic stepping. The thing C6 seals. |
| `state/machine.ts` | port | `src/kernel/state/machine.ts` | Mode transitions and frame counters. |
| `types.ts` | port | `src/kernel/types.ts` | The frame-data vocabulary. C6 says this is first class. |

**`src/debug`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `panel.ts` | rewrite | `src/shell/debug-panel.ts` | Rebuilt against the new toggles and the fetched-skin flow. |

**`src/input`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `keyboard.ts` | rewrite | `src/shell/keyboard.ts` | Its constructor parameter property is not erasable syntax (spike 1). |

**`src/svg/characters`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `barst.svg` | rewrite | `characters/barst/parts/<slot>.svg` | Splits into eleven fetched part files. 288,054 bytes today, 64,100 across eleven parts. |
| `index.ts` | delete | — | Its ?raw imports are the C7 violation: they inline 1.4 MB of art into the shell chunk. |
| `kiran.svg` | rewrite | `characters/kiran/parts/<slot>.svg` | Same. 488,032 bytes today, 81,101 across eleven parts. |
| `yuliya.svg` | rewrite | `characters/yuliya/parts/<slot>.svg` | Same. 620,401 bytes today, 113,690 across eleven parts; its head is the largest single part at 51,711. |

**`src/svg`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `fighter.svg` | rewrite | `characters/fighter/parts/<slot>.svg` | Becomes a figure like any other — eleven part files, no data-x/data-y. The readable reference rig stops being a special case, which is the universality claim applied to itself. |
| `renderer.ts` | rewrite | `src/render/arena.ts` | Same job; parameter properties must go (spike 1) and skins are fetched. |
| `rig.ts` | rewrite | `src/rig/pose.ts + src/render/assemble.ts` | Split: the pure bone tree and pose maths a pipeline can import, and the DOM assembly that fetches a figure's parts and places them. |
| `weapons.ts` | delete | — | Weapons are explicitly out of scope. What survives is forearm.grip in the rig contract — the anchor whose value this file hardcoded as 22. |

**`src`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `worker.ts` | rewrite | `src/shell/worker.ts` | Gains the dev-only /dev/* proxy to the sidecar (spike 4); it can never touch disk itself. |

**`tests`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `aabb.test.ts` | port | `tests/kernel/aabb.test.ts` | Pure integer geometry; nothing about it changes. |
| `animation.test.ts` | rewrite | `tests/rig/sample.test.ts` | Becomes the one sampler's test, asserted from both a pipeline and the runtime. |
| `architecture.test.ts` | rewrite | `tests/guards/architecture.test.ts` | Keeps the no-raster guard; gains C6's kernel-import seal. |
| `character-preview.test.ts` | rewrite | `tests/shell/preview.test.ts` | Rebuilt against the fetched-skin flow. |
| `characters.test.ts` | rewrite | `tests/sprite/characters.test.ts` | Drops the rig.ts/preview.mjs duplication assertion, which no longer has two copies to compare. |
| `content.test.ts` | port | `tests/kernel/content.test.ts` | Frame-data validation. |
| `motion-exchange.test.ts` | rewrite | `tests/exchange/exchange.test.ts` | Rebuilt, and the Blender case stops being synthetic. |
| `motion-import.test.ts` | rewrite | `tests/exchange/import.test.ts` | Rebuilt against the corrected dropped-work report. |
| `movesets.test.ts` | rewrite | `tests/clips/movesets.test.ts` | Rebuilt without the study slot. |
| `preview-playback.test.ts` | port | `tests/clips/playback.test.ts` | Loop-seam behaviour of the preview. |
| `simulation.test.ts` | port | `tests/kernel/simulation.test.ts` | The kernel's determinism and boundary test. |
| `skeleton-debug.test.ts` | rewrite | `tests/shell/skeleton-overlay.test.ts` | Rebuilt against the contract-driven overlay. |
| `weapon-alignment.test.ts` | delete | — | Tests src/svg/weapons.ts, which is out of scope. |

**`third_party/bandai-namco-motiondataset-1`**

| path | verdict | becomes | why |
| --- | --- | --- | --- |
| `LICENSE` | port | in place | C8: the vendored licence and notice stay beside the source subset. |
| `NOTICE.md` | port | in place | C8: the vendored licence and notice stay beside the source subset. |
| `cfg/content_label.txt` | port | in place | Upstream annotation tables the manifest checks each clip against. |
| `cfg/style_label.txt` | port | in place | Upstream annotation tables the manifest checks each clip against. |
| `data/dataset-1_bow_normal_001.bvh` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_bow_normal_001.json` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_dash_normal_001.bvh` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_dash_normal_001.json` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_punch_normal_001.bvh` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_punch_normal_001.json` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_run_normal_001.bvh` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_run_normal_001.json` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_slash_normal_001.bvh` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_slash_normal_001.json` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_walk_normal_002.bvh` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |
| `data/dataset-1_walk_normal_002.json` | port | in place | Pinned capture subset. Never regenerated, never edited (C8). |

---

## Open questions

None outstanding. Everything the spikes raised has been decided; see below.

The nearest thing to an open question is a risk rather than a decision: **a cosmetic landing in
the right place is not the same as a cosmetic looking right.** Anchors make placement
consistent and `hides` stops a part poking through, but whether a collar drawn for a narrow
neck reads on a broad one is a judgement no guard makes. M6's gate checks that a cosmetic
covers what it claims to hide; it cannot check that it suits the silhouette. Expect a wardrobe
to need art per body type eventually, and expect that to be a drawing problem rather than a
contract problem.

## Decided

**The flat-colour look is accepted.** Per-slot knobs at head c12/e1.2 and everything else
c3/e3.0, 1dp coordinates. Figures land at 64,790 / 81,791 / 114,371 bytes with faces intact;
body shading gradients flatten and that reads as a deliberate style. C7's 120 KB stands.

**Grip points are declared separately from bone tips.** `forearm-front.grip` and
`forearm-back.grip` are anchors at `[0, 18]` — the value `CANONICAL_WRIST` already holds, where
a hand closes on a prop. That is a different thing from the bone's `tip` at `[0, 23]`, which is
the BVH End Site, and from the `22` `weapons.ts` hardcodes for its IK link. Three files, three
numbers, three concepts that had drifted into unrelated constants. The contract names all
three; the IK reads the anchor.

**Study clips live in `out/`, generated on every build.** They are derived and not shipped:
`export:motions` already writes all eleven clips there, so a Blender project can be pointed at
`out/blender/` and `build → import → review` works in Blender today. The live preview reaches
the same files through the dev sidecar, so a study is reviewable on both surfaces without
entering the catalog C7 measures. This is why `reset` must leave `out/` alone — see the bug
fixed below.

**A figure is a manifest, not a document.** `figures/<name>.json` names which part fills each
slot, which cosmetics are worn and which rig it targets. The art it names may come from any
number of sheets. This is the change that makes everything swappable, and it is why M1 emits
`characters/<id>/parts/<slot>.svg` rather than one document per character. Measured cost of
the split: about 1% smaller raw, about 4% worse gzip.

**`docs/SWORD-MOTION-REFERENCE.md` is gone.** Its live content — the "motion comes from a
recording or it does not ship" doctrine, and the Touché and SFU Kendo candidate sources — is a
section of `docs/MOTION_IMPORT.md`. What was dropped described `src/svg/weapons.ts`, which is
itself scheduled for deletion, and duplicated the provenance `MOTION_IMPORT.md` already states.

**`docs/EXPERIMENTS.md` is gone.** It told you to hand-edit `src/animation/clips.ts`, which is
a re-export of generated catalogs; the rest restated AGENTS.md's working rules.

## Bugs found and fixed while planning

None of these were the object of a spike. They turned up while reading the code the spikes ran
through, and all five are fixed on `main` with a regression test that fails without the fix.

1. **`reset` deleted `out/`.** `npm run dev` runs `reset`, so it destroyed any `.blend` being
   edited — against AGENTS.md line 125 ("never wiped by reset") and the scope rule "never a
   `.blend` someone is editing". This is also a precondition for the study-clip decision above.
2. **The exchange reported a static rest offset as dropped work.** Blender writes every joint's
   `OFFSET` into its position channels, and the reader measured their magnitude against zero:
   a clean Blender export reported *31 units of depth translation* when nothing had moved. Now
   measured against the bone's own rest offset; the same export reports 0.0000.
3. **The pipeline kept a second, linear-only sampler.** On a `smoothstep` clip it disagreed with
   the runtime by 8.64° at tick 2 — and `validateAuthoredClip` accepts `smoothstep`, so an
   authored clip could have exported a BVH that played what the lab never drew. The copy is
   deleted; `scripts/motion/clip.mjs` re-exports the runtime sampler, which node runs directly.
   This is C2 held rather than asserted, one milestone early.
4. **`ease()` treated an absent easing as a curve.** Exposed by fixing 3: several call sites
   build clip-shaped objects without an `easing` field. Now linear unless a clip explicitly
   asks for smoothstep, and the round-trip call sites pass the clip's own easing.
5. **The sampler interpolated out of a value nobody wrote.** A channel first keyed after tick 0
   was swung from an implied zero — a torso authored as a constant 40 from tick 4 read 20 at
   tick 2. It now holds the first authored value.

Fixing 3 split `src/animation/sample.ts` into the sampler (which imports only its own types,
so a pipeline can run it) and `src/animation/snapshot.ts` (which picks a clip from combat
state). That split is what M0 wants anyway, so it is done early rather than twice.

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
- **`check:sockets` is quadratic in the number of sheets.** Three sheets is 36 pairings per
  joint and runs instantly. Ten sheets is 400 per joint. The guard will need to compare each
  part against the declared socket bounds rather than against every other part, with the
  all-pairs sweep kept as a slower full check. I have not written either.
- **yuliya clears the gzip budget by 159 bytes as eleven separate files.** Splitting costs ~4%
  gzip because each file compresses alone, and that is the whole remaining margin. A tenth
  cosmetic or a busier sheet crosses it. Either the budget counts a figure's parts compressed
  together as they would be over one connection, or 35 KB is the wrong number.
- **Cosmetic fit is unproven beyond placement.** I showed one piece landing identically on
  three bodies. I did not show that a cosmetic drawn for one silhouette reads on another, and
  no guard in the plan checks it.
- **I have not run the whole `verify` chain end to end in the proposed shape**, only each gate
  against today's code. The interactions — particularly `check:footprint` reading a catalog
  that `check:motions` has just rebuilt — are planned, not measured.
