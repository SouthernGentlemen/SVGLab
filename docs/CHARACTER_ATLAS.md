# Character atlases

The hand-drawn fighter in `src/svg/fighter.svg` exists to be read: eleven bones, a few dozen
path commands, and a comment explaining the pivots. It is a good teaching rig and a poor
character. This is the other route — a character drawn as a sheet of loose body parts, traced
into vectors and fitted to the same eleven bones.

```bash
npm run build:characters        # rebuild every character
npm run check:characters        # fail if a checked-in SVG no longer matches its atlas
node scripts/build-characters.mjs barst --preview /tmp/preview   # posed, for authoring
```

```
characters/<id>/atlas.png       source art          — you draw this
characters/<id>/atlas.json      placement decisions — you write this, if needed
src/svg/characters/<id>.svg     the character       — generated
```

The generated SVG is build output. Editing it is pointless, because the next build overwrites
the change, and `tests/characters.test.ts` fails the moment a checked-in file stops matching
its atlas.

## The atlas never reaches the game

Everything the stage draws is vector. The atlases are build-time input: they live outside
`src/`, nothing in the app imports them, and no raster follows a character into the bundle —
`tests/architecture.test.ts` fails if one ever does, whether by an import, a `url()`, an
`<image>` element or a `data:` URI pasted into an SVG.

That is not tidiness. A traced character scales to any stage size, stays legible under the
debug overlay, and is a set of paths the rig can pose — which is the entire difference between
a fighter and a picture of one.

## Why the output is an authored fighter

The tracer emits exactly the document `src/svg/fighter.svg` is: a `data-model="fighter"` group
of nested `data-bone` groups with `data-x`/`data-y` rest offsets. Not a format of its own.

That is the whole design. `src/svg/rig.ts` reads a traced character without knowing it was
traced, every clip in `src/animation/clips.ts` plays on it unaltered, the debug overlay's bone
pivots land in the right places, and the combat kernel — which must never learn what a fighter
looks like — learns nothing. A skin is eleven bones with different art on them. Switch one
mid-fight from the debug overlay and the simulation cannot tell.

Those eleven bones also use identical rest offsets in every file: all skins share the same
hips, knees, shoulders, elbows, neck, and overall height. The build scales each cut body part
to fit that canonical rig while preserving the source part's aspect ratio and silhouette.

## The atlas layout

The cutter finds islands of opaque pixels and names them by where they sit. There is no
per-character table of coordinates: the layout *is* the contract, and an atlas that breaks it
fails the build naming the band that went wrong rather than quietly producing a character
whose forearm is a boot.

| band | y range | contents, left to right |
|---|---|---|
| 0 | above 128 | three face expressions, then the torso and the hips stacked in the last column |
| 1 | 128–224 | far upper arm, far forearm, near upper arm, near forearm, far thigh, far shin, near thigh, near shin |
| 2 | 224–292 | hands: the pair in use first, then unposed alternates |
| 3 | below 292 | costume pieces, in reading order, named `prop_01`, `prop_02`, … |

Within a pair the **far** side comes first: it draws behind the body, the near side in front.
Islands must not touch — two parts sharing a pixel are read as one part.

Eleven bones, fifteen cut parts. The difference is deliberate: this skeleton has no hand or
foot bones, so a hand is drawn into the forearm that ends where it begins, and a boot the art
has already drawn onto its shin needs no bone at all. A hand that moves with its forearm is
what a hand does; giving it a joint nobody animates would be inventing a bone to hold art.

## The sidecar

`atlas.json` holds the decisions the pixels cannot make. Every field is optional; a plain
character with no costume builds from the PNG alone.

```jsonc
{
  "name": "Yuliya",
  "pivots": { "head": [0.5, 1.0] },     // where a joint really is, as a fraction of the part
  "props": [                            // costume islands, bound to a bone
    { "slot": "prop_07", "bone": "torso", "x": -14, "y": 34 },
    { "slot": "prop_10", "bone": "head", "x": -10, "y": -24, "under": true }
  ],
  "pose": { "arm-front": { "rotation": 18 } }   // preview pose only, never shipped
}
```

**Proportions are not a sidecar option.** They live once in
`scripts/atlas/skeleton.mjs`: a 104-unit canonical rig plus standard display heights for the
cut parts. Allowing a skin to move its own shoulders or lengthen its own thighs makes shared
animation cease to be shared. If the common body needs improvement, tune that one rig and
visually check every skin and both facings.

**`pivots`** override the joint for a part whose bounding box lies about it: a hood hangs well
below the neck it pivots on. Most parts need nothing here.

**`props`** bind a costume island to a bone. `x` and `y` are written in **atlas pixels**,
because that is the frame you are looking at when lining a cape up against a torso; the build
scales them along with the art. `under` paints the piece behind the bone's own art.

There is no draw-order control and there does not need to be one. Paint order is document
order: the torso covers the legs, while both arms draw above torso art so a coat or breastplate
cannot swallow them. The back arm remains behind the head and front arm to preserve depth.

## What the tracer is doing

Posterise, then draw each patch of flat colour as a path. The interesting decisions are the
ones that stop that from looking like mush.

- **Quantisation runs over distinct colours, not over pixels.** Weighting by area spends the
  whole palette on whatever covers most of the part — every slot goes to hair — and folds the
  eyebrows and the mouth into skin.
- **Specks are absorbed only when they are low contrast.** Banding noise is by definition a
  near-neighbour of what surrounds it. A pupil is the sharpest contrast on the part, and
  merging by size alone wipes a character's face off while leaving the hair looking fine.
- **Patches are painted by nesting depth, not by area.** Area gets the easy case right — a
  two-pixel pupil lands on top of the face — and the hard one wrong, because two large
  neighbours that merely touch have no depth relationship, and sorting them by size paints one
  across the other.
- **Simplification is scaled to the shape being simplified.** A tolerance that reads as a
  clean curve across a shoulder is most of an eye.
- **Layers are welded, not stacked.** Each region is stroked with a hairline of its own fill,
  closing the seams two simplified neighbours would otherwise leave. Stacking unions instead —
  layer *k* holding every colour from *k* onward — reproduces the source exactly and dissolves
  under simplification, because a one-pixel hair strand then belongs to six boundaries at once.

Every stage is deterministic, so the same atlas always produces the same bytes and a rebuild
that changes a file means the art changed.

## Adding a character

1. Cut the atlas to the layout above, save it as `characters/<id>/atlas.png`.
2. `node scripts/build-characters.mjs <id> --preview /tmp/preview`, then open the preview. The
   generated SVG itself stacks every bone on the origin — `data-x`/`data-y` are inert until
   `rig.ts` turns them into transforms — so the preview is what you judge.
3. Write `atlas.json` for costume pieces and genuine crop-specific pivot corrections. Give it
   a `pose`; a pivot a few pixels out is invisible on a neutral stand and obvious on a bent
   elbow. Do not introduce skin-specific proportions.
4. Add it to `SKINS` in `src/svg/characters/index.ts` and to `IDS` in
   `tests/characters.test.ts`.
5. `npm run verify`.
