# Hexframe combat dependency audit

Audit source: `Wizard-Gang/Hexframe` at commit `d519945b5e6a60291f63916c4580619a697c75e3`.

This is a provenance and boundary record, not an instruction to keep the projects in sync. SVGLab is a rewrite around a reduced interface, not a Hexframe fork.

## 1. Current Hexframe fighting execution path

```text
src/client/lab-main.ts
  → src/lab/app.ts
  → src/input/controller/{keyboard,gamepad}.ts
  → src/combat/simulation/simulation.ts
      → input/buffer/history.ts + input/parser/*
      → combat/commands/resolve.ts
      → combat/state/machine.ts
      → combat/movement/physics.ts
      → combat/collision/{aabb,boxes,pushbox}.ts
      → combat/hit-resolution/resolve.ts
      → combat/status/debuffs.ts + combat/entities/resolve.ts
  → FrameReport + SimState
  → renderer/animation/animator.ts
  → renderer/character/rig.ts
  → renderer/svg/{renderer,debug-overlay,stage,move-effects}.ts
```

One `Simulation.step()` accepts frame inputs, stores them, resolves commands, advances state and movement, resolves facing and pushboxes, checks active hitboxes against hurtboxes, applies the contact result, emits a frame report, and increments the authoritative tick. Presentation consumes state and events but never decides a hit.

## 2–7. Module disposition

| Hexframe area | Direct combat role | Dependencies found | Decision |
| --- | --- | --- | --- |
| `combat/constants.ts` | fixed tick/scale/stage values | none | Extract the fixed-point scale and fixed 60 Hz tick; reduce the constant set. |
| `combat/collision/aabb.ts` | overlap, intersection, facing-relative mirroring | combat types | Preserve essentially unchanged. It is already a small general primitive. |
| `combat/state/machine.ts` | actionability, state entry, stun/hitstop timers | large fighter state union | Refactor to four initial states: idle, walk, attack, hitstun. |
| `combat/movement/physics.ts` | deterministic ground motion and knockback decay | input directions, state machine, status stacks, jump/stamina | Refactor to ground movement and reaction friction only. Remove jump, stamina, dash, chill, and landing. |
| `combat/collision/boxes.ts` | runtime push/hurt/hit boxes and invulnerability | state, command lookup, authored move windows | Refactor around one move definition and an explicit dummy invulnerability flag. |
| `combat/collision/pushbox.ts` | fighter separation and stage clamping | character definitions, stage state | Preserve the deterministic split/tie idea; reduce to two local fighters and fixed arena bounds. |
| `combat/commands/resolve.ts` | move start, move frame, hit gate, cancels | content catalog, stamina, dash, stance | Refactor to one edge-triggered attack and phase advancement. Defer command motions and cancels. |
| `combat/hit-resolution/resolve.ts` | contact, damage, hitstop, stun, pushback | guarding, armor, debuffs, teams, input history | Refactor to strike contact only while preserving single-hit gating and reaction ordering. |
| `combat/simulation/simulation.ts` | authoritative fixed-step order | all combat/input modules plus status/entities | Rewrite as the small composition root. Preserve ordering and integer state. |
| `input/controller/keyboard.ts` | browser input collection | key maps and 16-button layout | Replace with a three-action local controller and on-screen pulse input. |
| `content/{loader,validate,raw-types}` | authored content conversion/validation | schemas, move catalogs, equipment modifiers | Replace with a typed local fighter and one authored move. Reintroduce data validation when multiple authored moves justify it. |
| `renderer/animation/animator.ts` | maps state to clips and interpolates sparse poses | combat state, content raw types | Preserve the separation and sparse interpolation; rewrite against the reduced state. |
| `renderer/character/rig.ts` | nested SVG rig and transforms | raw rig, DOM | Replace with a smaller readable inline SVG rig using `data-bone` pivots. |
| `renderer/svg/*` | stage, fighters, effects, debug geometry | combat, animation, DOM | Replace with a purpose-built arena renderer and selectable overlays. |
| `lab/app.ts` | runtime orchestration and tools | nearly every Hexframe product subsystem | Replace completely. This is the largest accidental dependency hub. |
| `lab/dummy/dummy.ts` | training target behaviors | recording, state/input | Replace with a stationary local dummy plus damageable/invulnerable toggle. |
| `rollback/*` | rewind/network prediction support | serialized full game state | Discard for the first laboratory slice. It is useful technology but not required to prove fighting. |
| `game/*`, `campaign/*`, `player/*` | sessions, AI party, bosses, saves | product state and progression | Discard. |
| status, armor, equipment, elemental move catalog | build/progression-specific combat extensions | content, saves, UI | Discard. Reintroduce only as isolated experiments. |
| worker auth/routes/Durable Objects | accounts, saves, product routing | secrets and Cloudflare persistence | Discard. The replacement Worker only serves built assets locally. |
| release/deploy/history/security infrastructure | production operation | Cloudflare accounts, secrets, tags | Discard. |

No directory was copied wholesale. The AABB behavior is the only implementation intentionally kept near-source; all other code is reduced or new.

---

This is a provenance record and it stops here. What SVGLab *is* — its layout, its contracts,
its gates and its plan — is `AGENTS.md`, not this file. The architecture sketch, dev lifecycle
and first-slice definition that used to follow were written before that contract existed and
had begun to contradict it.
