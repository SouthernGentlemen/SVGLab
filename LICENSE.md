# Licences and attribution for what this repository distributes

The full provenance index — every dataset, its pinned revision, rights holder, licence and
covered paths — lives in [Boneyard's `LICENSE.md`](../Boneyard/LICENSE.md), because that is
where the material itself lives. Read it before adding source material or distributing an
adaptation.

This file covers the narrower question: what SVGLab itself distributes, and under what terms.
It is not a blanket licence for SVGLab's source code, and it does not create a licence where an
upstream source supplied none.

## Clips baked into this repository

`npm run build:motions` writes Boneyard's clip catalog into `src/clips/generated/`, and those
files are tracked here. The shipped lane is adapted Bandai Namco material and carries its terms
across the repository line unchanged.

- **Upstream URL:** <https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset>
- **Pinned revision:** `74ead3ba1ae4696404e6086233779f60de8bf9ef`
- **Copyright holder:** Copyright 2022 Bandai Namco Research Inc. All Rights Reserved.
- **Licence:** [Creative Commons Attribution-NonCommercial 4.0 International
  (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/legalcode)
- **Repository paths covered:**
  - `src/clips/generated/bandai-namco.ts`
  - any `bnr*` entry in `src/clips/generated/authored.ts`

These clips are adapted material: Boneyard selects and trims source frames, projects the 3D
motion into a 2D side view, collapses the source joints into the eleven-bone rig, removes
horizontal root motion, resamples from 30 FPS to 60 Hz, and reduces the result to sparse linear
keyframes. **This material may not be used for commercial purposes under CC BY-NC 4.0.** That
applies to a build of this repository that contains it, not only to the source file.

`lab*` entries in `src/clips/generated/authored.ts` are original to these repositories and claim
no third-party origin. They are not covered by the Bandai Namco licence merely because both
kinds of clip share a generated file.

## Art served from `dist/`

The production build copies Boneyard's rig, character parts, cosmetics, figure manifests and
clip catalog beside `index.html`. Serving or publishing that directory distributes that material,
and several parts of it carry no redistribution licence at all — the Fire Emblem Heroes–derived
character and royal-guard art has none established, and the field kit atlas has no identified
source. Boneyard's index states each case, including the ones that remain unresolved rather than
guessed at.

Do not infer permission to redistribute any of it from its presence in a `dist/` directory.
