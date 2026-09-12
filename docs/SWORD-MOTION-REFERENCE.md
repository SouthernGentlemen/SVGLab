# Sword motion reference

SVGLab does not vendor or trace any third-party sword animation. External material is used only to study timing, silhouette, and mechanics; the canonical joint coordinates live in `src/animation/sword-reference.ts` and are original SVGLab data.

## Internet study set

- Shadow Fight strike-animation guideline: https://80.lv/articles/separation-compensation-principle-in-strikes-animation/
  - Best animation reference found for the body-mechanics problem.
  - The body accumulates/redirects momentum before the fast weapon phase; center-of-mass motion should stay smooth while the strike becomes sharp.
- Stick Nodes sword slash: https://sticknodes.com/sticks/sword-slash-nodes/
  - Useful stick-figure silhouette and frame-progression reference, but not a reliable numerical rig source.
- Stick Nodes sword-fight tutorial: https://www.youtube.com/watch?v=qSCwEh8o7Yw
  - Useful for frame spacing and readable stick-figure combat staging.
- Pivot Animator positioning documentation: https://pivotanimator.net/pivothelp/positioning_figures.htm
  - Reinforces the invariant we need: connected segments pivot while figure proportions remain constant.
- Keith Farrell, longsword Oberhaw mechanics: https://www.keithfarrell.net/hema/videos/2018-cutting-mechanics-longsword-oberhaw/
  - Practical reference for a descending two-handed cut and body involvement.
- HEMA 101 longsword guide: https://www.hema101.com/post/beginner-s-guide-to-fencing-with-the-longsword
  - Useful mechanical cue: the blade point should get in front instead of the hands leading an exposed, collapsing swing.
- GDQuest attack-animation guide: https://www.gdquest.com/library/juicy_attack/
  - Useful timing language for anticipation, fast attack spacing, smear/trail treatment, and easing.
- Public stick-figure flipbook example surfaced during search:
  - https://4.bp.blogspot.com/_JGWd5B4HcY0/S-ohL5k07II/AAAAAAAAACY/bloanPeQ70Y/s1600/epic%2Bflipbook2.jpg
  - Useful as a literal frame-by-frame example, but too crude and inconsistently proportioned to drive our joints directly.
- Overcrafted Stickman Fighter Spine 2D pack: https://overcrafted.itch.io/stickman-fighter-spine-2d-game-character-sprites
  - Closest structured third-party asset found: vector rig, Spine JSON/source, 24 fps PNG sequences, and a dedicated sword-slash animation.
  - Useful comparison material, but paywalled and externally authored, so it is not imported or treated as canonical joint data.
- 2D Stickman Swordsman asset: https://dannyv3.itch.io/2d-stickman-swordsman
  - Includes idle/run/jump and multiple sword attacks. Useful visual comparison, but not a better rig contract than owning our reference coordinates.

## Rejected as canonical input

Search results contain many AI-generated sprite sheets and isolated sword-VFX sheets. They can be useful for ideation, but they are poor joint references: limb lengths drift, grip contact changes, and the blade often changes size between frames. They must not drive the rig.

The Stick Nodes/Pivot/itch.io examples are also not copied into the repository. Even when their silhouettes are useful, they are presentation assets rather than a stable, auditable joint specification for SVGLab's eleven-bone rig.

## SVGLab canonical constraints

1. The sword is a rigid body. Blade, guard, handle, and grip spacing never scale during animation.
2. Neutral guard points the blade straight up.
3. The body loads first. The sword's fast phase starts after the torso/stance has begun to organize the strike.
4. The blade leads the hands through acceleration.
5. The primary descending cut resolves into longpoint instead of continuing through the floor.
6. Center-of-mass movement stays small and smooth; impact comes from timing and rotation, not a teleporting pelvis.
7. Both hands are solved to fixed points on the handle with fixed upper-arm and forearm lengths.
8. Torso lean changes shoulder/elbow geometry, not the sword trajectory. The sword translation and rotation are inverse-transformed out of torso space.
9. The same reference must remain reachable for longsword, katana, and greatsword previews and for both visual facings.

## Primary reference sequence

`swordOberhauReference` is the first canonical move. It is intentionally small and readable so we can tune it by eye before adding more attacks.

| Frame | Pose | Blade | Body intent |
| ---: | --- | --- | --- |
| 0 | guard | vertical | stable two-hand guard |
| 4 | load | slightly behind vertical | torso coils without moving the weapon shape |
| 8 | point leads | begins forward | point gets ahead of the hands |
| 11 | hips turn | accelerating diagonal | body rotation transfers into the weapon |
| 13 | impact | steep diagonal | fastest phase; stance stays planted |
| 15 | longpoint | horizontal | controlled extension, point threatening forward |
| 19 | recover | rising diagonal | energy decays without snapping the center of mass |
| 24 | guard | vertical | returns to the exact starting weapon pose |

`swordOberhauStudyReference` is the same pose sequence at half speed so every joint can be scrubbed and inspected without inventing a second animation.

## Next moves

Do not add another sword attack by improvising rotations directly in `weapons.ts`. Add the next move as another explicit stick-figure reference sequence first, then make the rigid sword and joint solver consume it. Good next candidates are a horizontal Mittelhau and a rising Unterhau so the moveset covers clearly different attack planes.
