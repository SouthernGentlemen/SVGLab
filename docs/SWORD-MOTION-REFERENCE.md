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
3. The body loads first. The sword's fast phase starts only after the stance, pelvis, and torso visibly coil.
4. The blade leads the hands through acceleration.
5. Contact is not the end of the animation. The sword passes through longpoint and the body continues rotating and translating after impact.
6. Follow-through must visibly carry the hips, chest, head counter-rotation, and stance beyond the contact pose before recovery begins.
7. Recovery follows momentum instead of reversing the attack path. A committed cut finishes low, circles the blade around, then rebuilds guard.
8. Center-of-mass movement stays continuous and readable; forward drive is allowed and should communicate commitment, but must never teleport.
9. Both hands are solved to fixed points on the handle with fixed upper-arm and forearm lengths.
10. Torso lean changes shoulder/elbow geometry, not the sword trajectory. The sword translation and rotation are inverse-transformed out of torso space.
11. The same reference must remain reachable for longsword, katana, and greatsword previews and for both visual facings.

## Primary reference sequence

`swordOberhauReference` is the first canonical move. The pass is deliberately exaggerated enough to read as a committed fighting-game strike rather than a technical sword-position demo. The blade continuously advances through the entire attack/recovery cycle instead of rotating backward after contact.

| Frame | Pose | Blade | Body intent |
| ---: | --- | --- | --- |
| 0 | guard | vertical | stable two-hand guard |
| 4 | coil | slightly behind vertical | pelvis shifts back, knees load, chest coils away |
| 8 | loaded | high and back | deepest anticipation before release |
| 10 | release | starts forward | stored body rotation begins unwinding |
| 12 | drive | fast diagonal | pelvis travels forward and torso crosses neutral |
| 14 | impact / longpoint | near horizontal | contact happens while the body is still accelerating |
| 16 | follow through | past horizontal | chest, hips, and stance continue through the target |
| 19 | overshoot | steep finishing arc | maximum forward commitment occurs after contact |
| 23 | low finish | almost blade-down | the cut completes below the target instead of freezing at impact |
| 28 | circle recover | continues around body | remaining sword momentum is redirected into recovery, not reversed |
| 34 | return | rising around the far side | torso unwinds while the blade completes the recovery circle |
| 40 | guard | full 360° back to vertical | exact guard is rebuilt only after the motion completes |

`swordOberhauStudyReference` is the same pose sequence at half speed so every joint can be scrubbed and inspected without inventing a second animation.

## Next moves

Do not add another sword attack by improvising rotations directly in `weapons.ts`. Add the next move as another explicit stick-figure reference sequence first, then make the rigid sword and joint solver consume it. Good next candidates are a horizontal Mittelhau and a rising Unterhau so the moveset covers clearly different attack planes.
