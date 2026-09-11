# Experiment guide

Use a short branch for one hypothesis at a time. Keep combat changes and animation changes separable so a result answers one question.

## Change a combat timeline

Edit `BASIC_STRIKE` in `src/combat/content.ts`. Startup, active, and recovery are authoritative simulation frames. The renderer reads the resulting phase; it does not feed timing back into combat.

## Change a pose

Edit the sparse keyframes in `src/animation/clips.ts`. Bone values are local translation and clockwise SVG rotation deltas. The SVG part hierarchy stays visible in `src/svg/fighter.svg`.

Useful first studies:

1. Add anticipation by rotating the torso and drawing the front hand backward during startup.
2. Make the strike overshoot on its first active frame and settle during recovery.
3. Compare linear interpolation with eased interpolation in `src/animation/sample.ts`.
4. Add an animation event at the first active frame without letting it decide whether the hit connects.
5. Add a second move only after its command, boxes, timeline, and animation can remain independent.

Run `npm run verify` before merging an experiment to `main`.
