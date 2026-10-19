# The Lab — Blender movement study

The first continuous Blender animatic is rendered and ready for spatial review. Open `motion.html` through the existing local server at `http://127.0.0.1:8741/reel/world/motion.html`, or play `animatic/lab-greybox.mp4` directly. The reverse video uses the same source frames in the exact opposite order.

The study is **26.5 seconds, 795 frames, 30 fps, 960 × 540**. It is a grey-box camera study with fixed neutral world-space studio lighting. Detailed devices, photographs, final materials, the Smith chart artwork and day-to-dusk lighting are later work. There is no introductory loader in this spatial test.

## What is built

One 8 × 6.5 × 3.6 m room contains a fixed RF bench, vehicle lane, robot grid, personal desk and pinboard. One camera follows the path recorded in `world.json`, without cuts or per-shot changes to furniture scale. The camera path is sampled from cubic splines and eases to zero velocity at the reading rests. The bench descent and vehicle arrival share one uninterrupted move; the other travel segments ease at their boundaries. The saved scene contains the baked per-frame camera and actor keys, so opening the `.blend` reproduces the animation without a runtime script.

The reading samples are frame 0 (bench), 90 (matcher), 255 (vehicle), 405 (robot), 555 (desk), 645 (wall) and 765 (wide close). Camera pose, lens, shift and staged actors remain fixed for the whole corresponding reading segment. The movie gives each rest one reference second; the planned scroll gives visitors control over reading time.

The coax loop lowers from the bench while its proxy connector stays attached. The vehicle drives toward the robot lane and parks. The robot first lifts the bottle 12 cm while stationary, then drives 30 cm while holding it. It never releases the bottle, and there is no collection box. The camera completes the rise to the desk, then visits the board and returns to the wide view. These are deterministic keyframed actions that reverse with the film. The coax action is a kinematic study, not the final cloth simulation.

The owner's first motion review corrected the opening matcher orientation, the bench-to-vehicle transition and the robot action. The opening now looks from the southeast, with the controller toward the lower-left of its capacitor bank as in Hero A; the device has a fixed 5° tabletop rotation. The descent clears the bench into the aisle with a steady northwest heading. Its two timeline intervals share one continuous spline, avoiding an intermediate stop before the vehicle rest. The pickup camera stays on the same side of the robot while the bottle is lifted and carried.

`motion.html` provides forward and reverse playback, a scroll-position control, station jumps, seven still views and a floor-plan dot driven by the exported camera samples. Direction changes continue from the inspected frame; playing forward at the end or reverse at the start restarts in that direction. Playback is manual, silent and non-looping; it pauses when the page is hidden. The video and notes remain accessible without the enhanced controls.

The review page caches each small movie as a local browser Blob when needed. This makes the native scrubber and frame jumps work even with Python's basic local server, which does not provide video byte-range responses. This is review-tool behavior; it is not the future production streaming strategy.

## Changes discovered in blockout

The actual matcher source is much smaller than the rough concepts implied. Its source bounds are about **185 × 195.72 × 82.97 mm** at metric scale. The hero and matcher cameras move closer instead of enlarging that device.

The vehicle and robot source files declare metric units but use presentation dimensions. Their inspected extents are approximately 7.045 × 4.976 × 2.743 and 5.508 × 8.113 × 2.210 source units. Their proxies retain these proportions, using provisional long-axis envelopes of 0.32 m and 0.82 m respectively. Those envelopes are authored size assumptions, **not measured hardware dimensions**. They stay constant throughout the sequence. The full inspection and conversion factors are in `animatic/source-bounds.json`.

The Companion is a simple 0.14 × 0.11 × 0.17 m stand-in and the keychain is a 0.07 × 0.065 m board envelope tilted on a small holder for visibility. Their final enclosure and PCB shapes have not been modeled in this milestone. The pinboard uses labeled placement volumes for the real portrait and employer marks.

The desk composition moves closer so both small devices remain visible. The closing camera uses a **24 mm establishing view** from inside the room to keep all five devices visible at once; the closer rests retain longer lenses. Intermediate waypoints retain the same room layout.

## Checks and their scope

The build audits every camera sample for room containment and distance from the furniture's modeled solid boxes. The resulting minimum clearance is recorded in `animatic/audit.json` and must exceed the 0.04 m guard used for this blockout. There are no reported camera clearance failures.

All seven reading rests are checked for identical camera and staged actor values throughout their frame intervals. Required device envelopes fit inside their reading views, and all five devices fit in the wide closing view. The pickup check verifies lift before travel, a 30 cm drive, a constant held bottle offset after lifting, and no collection box. The proxy arm's endpoint remains within its two 0.18 m links; the real source rig and detailed collision checks remain pending.

This audit is deliberately narrower than a production physics check. It does not certify the reconstructed devices' physical dimensions, detailed articulated hardware, lens-to-near-plane clearances for final meshes, final copy-safe areas, portrait compositions, or final lighting. `world.json` records this milestone as `rendered-for-review`; the owner has not approved the one-place gate yet.

## Files

- `build_animatic.py` builds the scene, measures source bounds, bakes the path, audits it and renders the outputs.
- `animatic/lab-greybox.blend` is the saved animated grey-box scene.
- `animatic/lab-greybox.mp4` and `animatic/lab-greybox-reverse.mp4` are the rendered previews.
- `animatic/camera.json` contains every sampled pose, lens, segment and actor position. This is a study export, separate from the future production `public/assets/world/camera.json`.
- `animatic/audit.json` contains the camera checks, frozen rests, device aperture bounds and render count.
- `animatic/posters/` contains seven reading views and nine intermediate move frames.
- `animatic/frames/` contains all 795 original render frames in order.

Scene files, frames, source inspection and videos remain in the local ignored render workspace. The authoring script, notes and review page are versionable alongside the scene specification. All imagery in this study is authored Blender geometry; no generated concept pixels are used in the film.

## Reproduce

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python reel/world/build_animatic.py -- --render
```

Use `--stills` instead of `--render` to build and audit the scene and inspect the seven rests plus intermediate views before encoding the full sequence. Workbench is the default preview engine. `--engine BLENDER_EEVEE` selects the same geometry and fixed scene lights for an optional lighting-aware preview; the delivered film uses Workbench.

Run `python3 reel/world/validate_world.py` to check the scene specification and required study outputs. The local viewer reads the same specification as the Blender script.

## Review decision

The concrete question for this pass is whether the moves make the bench, floor, desk and wall read as one believable place, and whether the travel is worth the attention it asks for. Judge the coax descent, floor handoff, rise to the desk and closing arc in both directions. Use the reading-view buttons to separate composition from motion.

After that direction is settled, the next work is linking the detailed device collections, completing the two personal-device models and producing one Cycles still per rest. The real portrait and exact marks replace their placement volumes there. The final room's day-to-dusk lighting stays continuous through the return; the neutral study does not test that effect.
