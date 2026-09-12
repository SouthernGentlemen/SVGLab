# Bandai-Namco-Research-Motiondataset-1 notice

The BVH, JSON, and label files in this directory are an unmodified subset of
Bandai-Namco-Research-Motiondataset-1 by Bandai Namco Research Inc.:

- Source: https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset
- Pinned revision: `74ead3ba1ae4696404e6086233779f60de8bf9ef`
- Copyright: 2022 Bandai Namco Research Inc. All Rights Reserved.
- License: Creative Commons Attribution-NonCommercial 4.0 International; see `LICENSE`.

SVGLab's generated clips are adapted material. The build selects and trims source frames,
projects the 3D motion into a 2D side view, collapses the source joints into SVGLab's
eleven-bone rig, removes horizontal root motion, resamples from 30 FPS to 60 Hz, and reduces
the result to sparse linear keyframes. Generated files retain this provenance in their header.

This repository is a local-only laboratory. The Bandai Namco source material and adaptations
may not be used for commercial purposes under CC BY-NC 4.0.
