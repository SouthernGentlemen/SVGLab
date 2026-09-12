# Authored clips

Hand edits that came back from an animation tool through `npm run import:motions`, one JSON
per clip. This is tracked source: the manifest lane is rebuilt from the Bandai Namco captures
on every build and cannot hold a hand edit, so anything shaped by hand lives here.

A `bnr*` clip is still an adaptation of Bandai Namco material under CC BY-NC 4.0 and names the
manifest clip it was derived from. A `lab*` clip was authored here on SVGLab's eleven-bone rig
and sets `derivedFrom` to null. A clip that keeps a manifest clip's key replaces what the lab
plays while the manifest keeps deriving the original beside it.

Edit these files by hand if you prefer — `npm run build:motions` validates every field, bone
name, frame order, and loop seam before it ships anything. See `docs/MOTION_IMPORT.md`.
