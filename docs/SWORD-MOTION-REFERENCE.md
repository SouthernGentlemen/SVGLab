# Sword motion reference

SVGLab does not vendor or trace any third-party sword animation. External material is used only to study timing, silhouette, and mechanics; the canonical joint coordinates live in `src/animation/sword-reference.ts` and are original SVGLab data.

## Internet study set

- Game Developer — Art of War: Animating Realistic Sword Combat: https://www.gamedeveloper.com/art/art-of-war-animating-realistic-sword-combat
  - Most useful whole-system reference found.
  - Shows real photographed guard/strike sequences and explicitly recommends letting the weapon lead an IK rig.
  - Its strike examples move between biomechanically useful guards instead of continuing into arbitrary spins; the article explicitly criticizes incessant spinning and whirling.
- Shadow Fight strike-animation guideline: https://80.lv/articles/separation-compensation-principle-in-strikes-animation/
  - Best timing reference found for separating body load from the fast weapon phase.
  - The body accumulates/redirects momentum before the weapon accelerates; center-of-mass motion stays smooth while the strike gets sharp.
- Keith Farrell, longsword Oberhaw mechanics: https://www.keithfarrell.net/hema/videos/2018-cutting-mechanics-longsword-oberhaw/
  - Practical reference for a descending two-handed cut and body involvement.
- HEMA 101 longsword guide: https://www.hema101.com/post/beginner-s-guide-to-fencing-with-the-longsword
  - Useful mechanical cue: the blade point gets in front rather than the hands leading an exposed, collapsing swing.
- Science and Fiction sword-cut measurement: https://www.science-and-fiction.org/swordfighting/cuts.html
  - High-speed-video reference for acceleration into the cutting arc followed by deliberate deceleration rather than endless rotation.
- Stick Nodes sword slash: https://sticknodes.com/sticks/sword-slash-nodes/
  - Useful stick-figure silhouette and frame-progression reference, but not a reliable numerical rig source.
- Stick Nodes sword-fight tutorial: https://www.youtube.com/watch?v=qSCwEh8o7Yw
  - Useful for frame spacing and readable stick-figure combat staging.
- Pivot Animator positioning documentation: https://pivotanimator.net/pivothelp/positioning_figures.htm
  - Reinforces the invariant we need: connected segments pivot while figure proportions remain constant.
- GDQuest attack-animation guide: https://www.gdquest.com/library/juicy_attack/
  - Useful timing language for anticipation, fast attack spacing, trail treatment, and easing.
- Overcrafted Stickman Fighter Spine 2D pack: https://overcrafted.itch.io/stickman-fighter-spine-2d-game-character-sprites
  - Closest structured third-party asset found: vector rig, Spine JSON/source, 24 fps PNG sequences, and a dedicated sword-slash animation.
  - Useful comparison material, but paywalled and externally authored, so it is not imported or treated as canonical joint data.
- 2D Stickman Swordsman asset: https://dannyv3.itch.io/2d-stickman-swordsman
  - Includes idle/run/jump and multiple sword attacks. Useful visual comparison, but not a better rig contract than owning our reference coordinates.

## Rejected as canonical input

Search results contain many AI-generated sprite sheets and isolated sword-VFX sheets. They can be useful for ideation, but they are poor joint references: limb lengths drift, grip contact changes, and the blade often changes size between frames. They must not drive the rig.

The Stick Nodes/Pivot/itch.io examples are also not copied into the repository. Even when their silhouettes are useful, they are presentation assets rather than a stable, auditable joint specification for SVGLab's eleven-bone rig.

The previous SVGLab 360-degree recovery is explicitly rejected. It confused "follow-through" with "keep rotating the sword." Realistic follow-through is the body continuing to travel after the blade has begun braking.

## SVGLab canonical constraints

1. The sword is a rigid body. Blade, guard, handle, and grip spacing never scale during animation.
2. Neutral guard points the blade straight up.
3. The body loads first. The sword's fast phase starts only after the stance, pelvis, and torso visibly coil.
4. The blade leads the hands through acceleration.
5. Contact is not the end of the animation. The sword reaches longpoint and begins braking while the pelvis and torso continue through the target.
6. Body follow-through must outlast blade acceleration: hips, chest, head counter-rotation, and stance continue changing after impact even when sword rotation changes only slightly.
7. A normal cut does not windmill. The primary oberhau must stay below 120 degrees of forward sword rotation before recovery begins.
8. Recovery is a distinct withdrawal/re-chamber phase after the braked finish. It may move the sword back toward guard; it must not masquerade as additional strike follow-through.
9. Center-of-mass movement stays continuous and readable; forward drive should communicate commitment without teleporting.
10. Both hands are solved to fixed points on the handle with fixed upper-arm and forearm lengths.
11. Torso lean changes shoulder/elbow geometry, not the sword trajectory. The sword translation and rotation are inverse-transformed out of torso space.
12. The same reference must remain reachable for longsword, katana, and greatsword previews and for both visual facings.

## Primary reference sequence

`swordOberhauReference` is the first canonical move. It is intentionally readable enough for a fighting-game silhouette, but its mechanics follow the photographed/filmed references above: compact load, sharp acceleration, longpoint, sword braking, continued body travel, then recovery.

| Frame | Pose | Blade | Body intent |
| ---: | --- | --- | --- |
| 0 | guard | vertical | stable two-hand guard |
| 4 | coil | behind vertical | pelvis shifts back, knees load, chest coils away |
| 7 | loaded | high/back | deepest anticipation before release |
| 9 | release | starts forward | stored rotation begins unwinding |
| 11 | drive | fast diagonal | rear side drives pelvis and torso toward target |
| 13 | cut | steep diagonal | blade speed is high; body is still accelerating |
| 14 | impact | near horizontal | contact occurs before body motion is finished |
| 16 | longpoint | slightly past horizontal | sword starts braking in a useful forward line |
| 18 | body follows | ~110 degrees | blade advances only slightly while chest/hips continue |
| 21 | braked finish | ~112 degrees | maximum blade rotation; body has caught up underneath it |
| 24 | settle | low-forward | momentum decays without freezing or spinning |
| 29 | withdraw | retracting | recovery begins as a separate action |
| 35 | re-chamber | rising toward guard | stance and hands rebuild the high guard |
| 42 | guard | vertical | exact starting weapon pose restored after recovery |

`swordOberhauStudyReference` is the same pose sequence at half speed so every joint can be scrubbed and inspected without inventing a second animation.

## Next moves

Do not add another sword attack by improvising rotations directly in `weapons.ts`. Add the next move as another explicit stick-figure reference sequence first, then make the rigid sword and joint solver consume it. Good next candidates are a horizontal Mittelhau and a rising Unterhau so the moveset covers clearly different attack planes.
