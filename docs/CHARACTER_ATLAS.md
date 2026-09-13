# Character atlases

A character is drawn as a sheet of loose body parts, traced into vectors and fitted to the
eleven bones in `rigs/fighter.rig.json`. Each traced part is its own SVG so a figure can choose
the matching slot from any sheet.

```bash
npm run build:parts                  # rebuild every character
npm run check:sprites                # fail if a checked-in part no longer matches its atlas
node pipelines/sprite/build.ts barst # rebuild one sheet
```

```
characters/<id>/atlas.png          source art          — you draw this
characters/<id>/atlas.json         trace decisions     — you write this
characters/<id>/parts/<slot>.svg   one body part       — generated
figures/<name>.json                rig + part choices  — you write this
```

The generated SVGs are build output. Editing one is pointless, because the next build overwrites
the change, and `check:sprites` fails the moment a checked-in file stops matching its atlas.

## The atlas never reaches the game

Everything the stage draws is vector. The atlases are build-time input: they live outside
`src/`, nothing in the app imports them, and no raster follows a character into the bundle —
`check:footprint` fails if one ever does, whether by an import, an `<image>` element or a
`data:` URI pasted into an SVG.

That is not tidiness. A traced character scales to any stage size, stays legible under the
debug overlay, and is a set of paths the rig can pose — which is the entire difference between
a fighter and a picture of one.

## Why the output is one file per part

The tracer emits eleven SVG documents. Each one names its `data-bone`, but carries no
`data-x`/`data-y`: rest offsets belong only to the rig contract. A figure manifest selects one
file for each slot, and those files may come from different sheets.

That is the whole design. The renderer assembles the manifest against the same rig every
clip uses, while the combat kernel — which must never learn what a fighter looks like — learns
nothing. Swap one part and the simulation cannot tell.

All parts therefore share the same hips, knees, shoulders, elbows, neck, and overall height.
The build scales each cut body part to fit that canonical rig while preserving the source
part's aspect ratio and silhouette. `check:sockets` exhaustively assembles all 36 elbow and
knee combinations across the three shipped sheets.

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
  "trace": {
    "default": { "colours": 3, "epsilon": 3.0, "places": 1, "minRegionArea": 48 },
    "bySlot": { "head": { "colours": 12, "epsilon": 1.2, "places": 1, "minRegionArea": 12 } }
  },
  "pivots": { "head": [0.5, 1.0] }      // where a joint really is, as a fraction of the part
}
```

**Proportions are not a sidecar option.** They live once in
`rigs/fighter.rig.json`: a 104-unit canonical rig plus standard display heights for the
cut parts. Allowing a skin to move its own shoulders or lengthen its own thighs makes shared
animation cease to be shared. If the common body needs improvement, tune that one rig and
visually check every skin and both facings.

**`pivots`** override the joint for a part whose bounding box lies about it: a hood hangs well
below the neck it pivots on. Most parts need nothing here.

**`trace`** declares the default colour cap, simplification tolerance, coordinate precision
and minimum flat-colour region area. An entry in `bySlot` overrides only the values it names.
Heads keep more colours and a tighter curve because that is where the face lives; the body uses
three colours because that is where the bytes live. That split is measured: one global
four-colour profile brought the largest figure under the old 120 KB target but erased its blue
eyes and mouth. Keeping heads at 12 colours / epsilon 1.2 and bodies at 3 / 3.0 produced
64,790-, 81,791- and 114,371-byte figures with the faces intact. Five rebuilds agreed byte for
byte on the three source atlases; a new palette may still justify a different authored profile.

Costume islands in band 3 are source candidates, not part bindings. The part build reports and
leaves them unused. Selected art is copied into `cosmetics/<set>/atlas.png`; its authored
`set.json` gives every island a kind and a height in rig units. The wardrobe build traces that
island once, while the renderer gets its anchor, depth slot and mirroring rule from the rig.
No character sidecar accepts the old atlas-pixel `x`/`y` placement format.

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
2. Write `atlas.json` with the trace profile above and genuine crop-specific pivot corrections.
   Do not introduce skin-specific proportions; move selected costume art into a wardrobe set.
3. `node pipelines/sprite/build.ts <id>` and inspect an assembled render; a pivot a few pixels
   out is invisible on a neutral stand and obvious on a bent elbow.
4. Add `figures/<id>.json`, naming the rig and one part file for all eleven slots.
5. `npm run verify`.
