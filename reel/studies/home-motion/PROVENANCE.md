# Home motion study: asset production

This directory produces only the isolated `/studies/home-motion/` proof. Original workbench sources, public hero assets, documentary photographs, CAD, PCB exports and existing project media are read-only inputs.

## Sources and reconstruction boundaries

- Matcher: `reel/workbench/matcher-workbench.blend`, original Onshape-derived assembly, `reel/build_matcher_exhibit.py`, `reel/matcher_geometry.py`, and the existing studio configuration. Source CAD provides the enclosure and mounting envelopes. Capacitor outlines, plate counts/thickness and some internal wire routes retain their documented photographic-estimation status.
- Vehicle: unchanged `reel/workbench/vehicle-spatial-library.blend`, generated from `reel/vehicle/model.py`, cross-checked against `src/assets/vehicle-cover.jpg` and `vehicle-pcb.jpg`. It is a photograph-referenced chassis reconstruction, not a recovered manufacturer CAD assembly. The new presentation uses a continuous concrete laboratory floor, not the former assembly fixture or mat.
- Robot: unchanged `reel/workbench/robot-spatial-library.blend` and captured mechanism matrices, `reel/render_robot.py`, `reel/robot_finish.py`, and `src/assets/robot-cover.jpg`. The cream tile scale, narrow joints and darker band reference the documentary floor; the floor material is procedural, not a cropped or altered photograph. Hidden dimensions and wiring remain inferred.
- Bottle: the existing modeled bottle with a thin PET wall, transmissive material, opaque cap and unbranded label. This is an illustrative collection target, not documentary evidence of a specific bottle.

No purchases, external textures, generative imagery or new photography are used. Original documentary images retain their identity.

## Camera and mechanism continuity

The opening points directly to the existing source hero assets. Daylight and task-light variants retain the original composition. `timelines.py` generates49 exact orthographic camera states, with the same camera direction throughout; translating and scaling either the occupied or empty raster is mathematically equivalent to rendering that unchanged scene from the corresponding orthographic camera. This is neither optical-flow interpolation nor invented motion. Dedicated64-sample full-resolution seat plates prevent softness at rest.

The landscape seat uses target `[-1.8,-1,0]`, offset `[8,-12,9]`, span11.8, keeping quiet bench space on the left. Portrait and phone use target `[0,0,.4]`, offset `[8,-12,10]`, with a6.9-unit horizontal hardware aperture. The metadata exposes exact camera position, target, rotation, horizontal/vertical spans and source projection.

The macro camera travels over the capacitor and enters the enclosure, ending at `[-1.756322,2.32,-.243362]` toward the actual rear shaft bearing. Its .008 near plane avoids clipping nearby hardware. A small inspection bounce grows from0 after logical17; its position, power, color and target are recorded per frame for the live renderer.

C1 rotor motion is an actual0–18° turn over logical20–44 about+Y at `[-1.7563223839,1.1671882868,-.2433621138]`. The source rotor1 plates, continuous shaft and corresponding coupler move; stators, bearing and locknut remain fixed. `camera.rotorOffset` allows the live renderer to add this to the selected capacitor state and stop passive movement after explicit user tuning.

The contiguous mechanism motion study begins at logical20 so the rotating plates and shaft are visible before the camera reaches the rear bearing. The final graphic match is framed by the fixed bearing/locknut; that fastener is not portrayed as rotating.

The rear bearing and wheel washer use a deliberate graphic match cut. Measured projected X bounds at the cut are44: `[.1696887,.8303123]`,45: `[.1700648,.8305605]`; circles share center and diameter to substantially below one viewport pixel at1280px. These independent projects are not portrayed as mechanically connected.

Wheel sidewall, rim and hub families use their actual centers. Circumferential rolling uses the transformed tire radius, with restrained front steering and chassis yaw. Non-rotating knuckles and axle components are excluded from wheel roll. The vehicle supplies an opaque physical tire foreground before the bottle scene. The robot foreground uses that same reconstructed vehicle wheel, not a decorative masking plane. The collector closes around the bottle; bottle and chassis then travel together while the bottle stays grounded. All these actions are modeled behavior, not measured telemetry.

The final vehicle departure preserves all camera and body states through logical94. Shape-preserving cubic camera channels pass through94/100/106/112/116/119, remaining alongside the approaching vehicle before the near wheel crosses toward frame-left. The first perspective poses converge to the exact orthographic start; no closing orthographic aperture or display platform supplies the transition. A continuous cubic body translation maintains positive wheel rolling while the front steering straightens. The final lens is placed .020 world units outside a ray-located point on the actual scaled, cambered and rolled front-left rubber surface. Twenty-five viewport corner/interior rays, in both orientations, hit only that opaque tire exterior beyond the .008 near plane. The earlier fixed-at104 camera produced a visible exit/return and is retained only as historical review evidence, not the final source path.

The robot prefix carries the same complete vehicle pose, camera projection and source light rig through a rigid yaw/translation onto the robot tile plane. Matching camera height above each actual floor preserves wheel contact. The car continues rolling across the foreground and clears before logical18; the camera and focal attention settle onto the bottle. Receiver-linked source lights retain the foreground vehicle illumination while the robot station keeps its own lighting. The ambient environment transitions continuously to the existing robot scene. Robot logical18 onward is unchanged and its native frames are retained. The reused covered frame0 therefore has a geometrically matching occluder prefix, rather than jumping to an unrelated wheel.

The fully covered first robot frame reuses the genuinely rendered final vehicle tire frame exactly. Film metadata records its source frame and camera as `endpointReuse`, and the full-resolution endpoint posters share the same source image. Its following prefix retains the same physical vehicle pose and source light rig as that tire departs. The scene change therefore occurs behind actual opaque hardware. This one shared endpoint is distinct from duplicated-frame rate conversion; every intermediate moving frame is independently rendered at its native source time.

## Rendering and reproducibility

Use the installed Blender with Metal access:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python reel/studies/home-motion/produce_stills.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python reel/studies/home-motion/produce_films.py -- --gates
python3 reel/studies/home-motion/run_benchmark.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python reel/studies/home-motion/produce_films.py -- --films
/Applications/Blender.app/Contents/MacOS/Blender --background --python reel/studies/home-motion/refresh_motion_stills.py
python3 reel/studies/home-motion/timelines.py
python3 reel/studies/home-motion/catalogue.py
```

Moving landscape media is1280×800 at native60fps,239 rendered frames corresponding to logical0–119 at30fps. Portrait is900×1250 at native30fps,120 frames. Macro-only empty plates cover logical0–44:89 native landscape frames or45 portrait frames. All encoded motion frames come from genuine Cycles world renders, including every half-step. No repeated-frame rate conversion or optical-flow frames are used. Identical theme-independent vehicle suffix frames may be reused byte-for-byte from their already-rendered daylight source. The dark matcher prefix and dark empty background are independently rendered.

Final occupied stills use64 samples; films use48 samples with denoising, AgX Medium High Contrast, eight maximum bounces, .035 adaptive threshold and stable noise seed. Empty films use40 samples. WebP stills use quality96 and contain XMP provenance plus JSON camera/material/source sidecars. Films are opaque, silent H.264/VP9, with six-frame GOPs for bounded seeking. Browser display pacing is a separate measurement from encoded media rate.

The vehicle and robot station rigs each use disk emitters at local `[-4,-6,9]` (1700W, size7, color `[.86,.92,1]`), `[7,3,7]` (950W, size6, `[1,.86,.69]`) and `[0,8,3]` (580W, size3, `[.90,.94,1]`), aimed at the station origin. Vehicle ambient is the original `matcher_studio.json` world `[.72,.76,.80]` at strength.11; robot ambient is `[.66,.69,.72]` at.18. The robot's covered vehicle prefix rigidly transports those source lights, including the distant original bench emitters, with receiver links limited to the foreground car. Its ambient converges smoothly to the robot world by logical18. These settings, both floor geometries and the evolving camera intrinsics are encoded by the source scripts and packed editable anchors rather than supplied by external HDRIs.

The isolated Apple M2 eight-core Metal benchmark at48 samples/1280×800 took26.21,25.44 and22.97 seconds for logical38/38.5/39; steady mean24.21s/frame. These are offline production timings, not browser performance claims. Later rendering profiles are saved beside their frame sequences.

`catalogue.json` is the stable consumption API. Its pointers resolve hero light/dark opening/empty opening/seat/empty seat/timeline, then progressive landscape/portrait drive, robot and macro-empty films. Dark drive and macro-empty entries preserve task-light continuity until the wheel cut.

`launch.py` starts one finite detached `pipeline.py` host so cancelling a chat tool cannot discard the batch. It runs exactly one fresh Blender child per film, then the still and editable-scene passes, releasing Metal caches between jobs. Its host PID/log are recorded in `.impeccable/renders/home-motion/render-process.json`; current child, completed jobs and checkpoints are in `pipeline-status.json`. Resume skips existing complete native frames and completed jobs; it neither restarts the whole sequence nor reduces render quality. `commit_pass_revision.py` invalidates only drive source94.5–119 and robot source0–17.5, preserving every valid earlier drive, later collection, portrait cache and theme-independent source frame. Reviewed native-size gate PNGs are reused at their exact times. Source hashes and script snapshots record the production inputs.

`refresh_motion_stills.py` regenerates the dedicated drive camera plates after the final rotor, positive wheel-roll and foreground-pass audit. It owns only those still PNG/WebP files; the native producer owns film frames and the shared119/0 endpoint. This prevents a full-resolution resting plate from showing an earlier spoke or rotor phase. Run it after the native batch and retain its checkpointed completed plates. An attempted overlap caused severe M2 memory/GPU contention and was stopped after its first plate; timings from that overlap are not isolated render benchmarks.

Full-resolution keyframe sheets and contiguous native motion studies live in `.impeccable/renders/home-motion/`. Intermediate PNG frames remain there, outside the public asset directory. Geometry or lighting changes require regenerating affected frames and encoded outputs; a previously completed frame file must not be treated as current after such changes.

## Final delivery audit

After the native queue reports `renders-complete`, run `python3 reel/studies/home-motion/finalize.py`. The finite CPU-only `await_finalization.py` watch performs this automatically for the detached queue. It embeds provenance only in `public/assets/studies/home-motion`, runs the Impeccable raster scan on that directory, records final source and packed-anchor hashes, probes every encoded stream, and checks both exact endpoint reuse and identical theme-independent vehicle suffixes. It never changes the original workbench hero files or launches Blender.

`review_packet.py` exports the final landscape and portrait keyframe sheets, the single foreground vehicle pass, and the robot occlusion/bottle reveal directly from completed native frames. Half-speed companions change playback cadence and are labeled accordingly; no extra intermediate images are generated. Their JSON records identify the source frames and camera metadata. Dedicated full-resolution camera stills remain available separately from those downscaled review sheets.

The four packed `.blend` files are final editable single-frame anchors, each with a source logical frame, generation script and render revision in its sidecar and scene properties. They are not keyed cinematic timelines. `render.py` plus the immutable source libraries reproduce the complete motion; `save_scenes.py` recreates the anchors. Earlier composition-anchor hashes remain historical, while the final anchor hashes are labeled explicitly.

The technical audit and native frame rates establish reproducibility and delivery integrity. Visual acceptance remains the parent's review of the complete preview and recorded motion. Browser frame pacing, operating-system capture limitations and device coverage belong to that independent runtime review.
