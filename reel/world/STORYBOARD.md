# The Lab — storyboard v1

Real hardware, on one working bench and its surrounding lab, that visitors can operate.

This is the authoring handoff for the next Blender grey-box pass. `world.json` owns station placement, camera poses, scroll intervals, reading rests, source assets and copy. `storyboard.html` reads that file and presents the chosen concept frames in order. The camera coordinates are proposals for blockout, not solved camera animation or surveyed dimensions. The continuity gate remains open until an animatic demonstrates the route.

The first Blender movement study is now rendered: open [motion.html](motion.html) for forward/reverse playback, station jumps and the exported camera map. [ANIMATIC.md](ANIMATIC.md) records the closer cameras, provisional proxy dimensions, checks and remaining review. The one-place gate is `rendered-for-review`, not owner-approved; the concept stills remain the reference for later materials and lighting.

## Direction carried into this draft

- Hero A: cool morning. Use `concepts/world-02-hero-a.jpg`; the loader is the composite made from that exact hero.
- The bench-to-floor move follows the coax. The vehicle stays on the floor.
- The final wide reveal gets 8% of the scroll: 4% to travel, 4% to read and act.
- Use existing models, boards and photos. The room is an authored presentation of the work, not documentary evidence that the devices were built together in this exact lab.
- The homepage is an Experience surface. Its artifacts lead; readable copy, project access, resume and contact remain immediate.

The final scene will fix the rough frames' changing bench scale, generated portrait and logos, extra key ring and dark Companion screen. Copy comes from the site; "Matched." is the agreed visual-direction headline. Project measurements remain as written in `src/data/projects.ts`, including **95 W forward power**, rather than upgrading that claim from the earlier conversation.

## One room

Author an 8 × 6.5 × 3.6 m room using meters, Z up. Origin is the southwest floor corner; +X runs east and +Y runs north. These are set dimensions chosen for the camera path. Validate real device dimensions against source geometry before final assembly.

The RF bench sits in the northwest part of the room. Below its front edge is the vehicle tape lane; to the east is the robot tile grid. The personal desk sits behind the robot lane and the corkboard occupies the north wall behind it. The robot picks up a bottle on its grid and carries it a short distance. The open aisle joins all five stations.

The large west window is fixed in world space. The window need not remain screen-left when the camera turns: changing the actual light direction per shot would break the room. Keep the bench legs, laminate thickness, green mat, yellow tape and desk lamp consistent in every view. At least one known landmark should survive each handoff.

The path is A → B → C → D → E → A. A has three compositions: the opening, the operating rest, and the wide closing reveal. The devices never rescale to fit a shot. Move the camera or adjust the authored room instead.

## Scroll and film clocks

The enhanced stage has **11 viewport heights of travel**, plus its one-viewport sticky stage. Scroll percentages describe that travel, independently of document content in fallback mode. Visitors control their own reading time; there is no autoplay scroll or deadline at a rest.

The reference film uses 30 fps and 795 frames: 26.5 seconds when played straight through. That is an animatic timing proposal, not a target visit length. Frame ranges in `world.json` are half-open: `[start, end)`. Adjacent ranges must touch exactly. Each rest freezes one camera/scene sample while its copy is readable; extra time in the scroll budget must not make the camera drift or replay an action.

Movement gets 36% of the travel and locked reading rests get 64%. Approach and departure movement live inside their station's total budget. The loader sits outside the scroll clock. There are **nine timed beats plus the loader**, using nine chosen concept images; the wide image illustrates both the return move and the final rest.

## Loader — outside the scroll

Frame: `concepts/world-01-loader.jpg`. Lock to the hero camera and layer an ivory veil with the exact Smith chart. An illustrative trace converges toward the center as initial media becomes ready; the veil clears directly into the same bench view.

The loader must not block headings, project links, resume or contact. Reduced motion and failed media bypass it; a return from a case study must not replay it. Do not promise a pixel-perfect chart-to-notebook morph: the notebook and centered loading chart have different positions. It is a camera-registered reveal with a recurring motif.

## 0–8% — A: the working bench

Frame: `concepts/world-02-hero-a.jpg`. Pose `hero`, reading rest 0–8%, reference frames 0–30. Near-overhead, with the matcher on the right, notebook on the left, coax, probes and mug. Cool window fill and warm laminate bounce make the actual hardware tactile.

Set **Hardware & firmware.** in the upper-left. Support: "I'm Miguel, an electrical & computer engineer at Carnegie Mellon." Keep "Available for full-time roles after May 2027." visible, with Explore my work and Resume access. Preserve the matcher at a useful scale and keep the notebook chart in progress.

The notebook leads the eye toward the capacitor plates for the next move.

## 8–18% — A: operate the matcher

Frame: `concepts/world-03-matcher.jpg`. Move from `hero` to `matcher` during 8–10%, frames 30–90. Lower to roughly 30° above the plates and stop. Hold during 10–18%, frames 90–120, sampling frame 90.

Left copy: **Automated impedance matcher.** "A closed-loop RF matcher that automates manual capacitor tuning." Retain the three exact results: ~1.2 VSWR; 95 W forward power; $636 build. Keep Machine, Inspect and Tune as operable native controls and the project link visible.

The live tuner must inherit the exported rest camera, scale, lighting and scene surroundings. Transfer visible ownership only after a complete frame is ready. An active demo gets a stable camera; native scroll and a clear exit must remain available. Leave Tune cleanly before traveling away. Treat the present VSWR field honestly: a Smith chart requires a real impedance-to-reflection-coefficient mapping, not a relabeling of the existing plot.

The coax slack at the bench front becomes the carrier.

## 18–24% — A → B: follow the coax

Frame: `concepts/world-04-tilt.jpg`. Reference frames 120–210. Path: `matcher` → `bench-edge` → `floor-entry`.

Use a controlled, eased tilt and dolly out into the aisle before descending. Keep a steady northwest viewing direction, following the attached coax into the vehicle composition without pausing at the intermediate floor waypoint. A free loop of coax settles beside the parked vehicle; the matcher end stays attached. The connected instrument must not be yanked off the bench. Keep the wheels clear of the cable. The rough frame's implied two-ended falling cable is not the final action.

No reading panel here. Avoid the rough frame's whip-blur treatment: the move must remain legible when scrubbed backward. Bake the cable action and drive it from the same scroll clock; do not run a new physics simulation in the browser.

## 24–39% — B: real-time control

Frame: `concepts/world-05-vehicle.jpg`. Arrive at wheel height during 24–27%, frames 210–255. Hold during 27–35%, frames 255–285, sampling frame 255. The bench legs remain full size in the background and the tape lane leads toward the robot grid.

Upper-left copy: **Real-Time Embedded Vehicle.** "An embedded vehicle with a custom preemptive RTOS, carrier PCB, and PID motor control." Keep STM32 Cortex-M4, RMS scheduler and <10% average speed error. The operable RTOS demo remains on the project route; the homepage drive is a presentation of the device, not new measured test footage.

During 35–39%, frames 285–345, follow the vehicle along the tape and park it outside the robot sweep. Its departure prepares the handoff to the bottle lane. Keep it parked and visible where appropriate in later views.

## 39–56% — C: vision into motion

Frame: `concepts/world-06-robot.jpg`. Arrive at `robot` during 39–43%, frames 345–405. Hold during 43–51%, frames 405–435, sampling frame 405. The tile grid adjoins the tape lane in the same floor plane.

Right copy: **Trash Collection Robot.** "An autonomous bottle-collection robot with computer vision, motor control, and custom power delivery." Keep Raspberry Pi CV, Arduino control and 9V quad H-bridge. Preserve the team attribution and Miguel's electronics/power contribution on the project route; the scene does not imply he solely authored the vision stack. Keep the existing CV demo reachable there.

During 51–56%, frames 435–495, lift a reachable bottle while stationary, then drive a short distance while holding it. The current proxy lifts 12 cm, then drives 30 cm. There is no drop-off, release or collection box. Verify the rig's real reach before final keyframing. The bottle rises a little; the camera supplies the rest of the crane to the desk.

## 56–75% — D: independent builds

Frame: `concepts/world-07-desk.jpg`. Rise from `bottle-lift` to `desk` during 56–60%, frames 495–555. Hold throughout 60–75%, frames 555–585, sampling frame 555. The Companion and actual keychain PCB sit beneath a warm lamp. The room outside the light falls toward cool dusk.

Copy: **Independent builds.** "Personal projects in embedded systems and circuit design." Both projects get their own headings, summaries, project links and live controls. Let the same camera hold while the document progresses from Companion at 60–67.5% to keychain at 67.5–75%. This avoids making the visitor choose between two tiny targets or hiding one project behind the other.

Wake up Kirby runs the existing touch UI on the actual screen; Run the LED chase drives the board's real LED positions. Stage 1 uses exported screen projections; Stage 2 uses textures and emissive materials. The draft's `null` screen quads are intentional: Blender must supply measured projections after the models and final camera exist. Touch UI, mute and LED controls keep separate keyboard-accessible targets.

The lamp pool leads to the board behind the desk.

## 75–92% — E: meet the engineer

Frame: `concepts/world-08-wall.jpg`. Pan from `desk` to `wall` during 75–79%, frames 585–645. Hold during 79–92%, frames 645–675, sampling frame 645.

Use the real portrait and exact Ford, CMU and Hacker Fab logo files as textures. The generated likeness, invented seal and approximate marks in the concept frame are only compositional references. Label the real portrait as a photograph. Draw the pinned Smith-chart print mathematically rather than using the rough sketch.

The camera stays locked while the HTML moves through two reading steps: **I'm Miguel.** at 79–84%, then **Experience.** at 84–92%. Preserve the biography, skills, role dates, outcomes and expandable details from `src/pages/index.astro`. Keep this as real document content; do not bake paragraphs into the board texture or squeeze all three jobs into a narrow caption. The viewer shows representative headings; the production document must retain the full content.

Email, LinkedIn, GitHub and resume remain usable. The pinned chart provides the visual callback for the return.

## 92–96% — E → A: reveal the room

Reference: `concepts/world-09-close.jpg`. Frames 675–765. Path: `wall` → `return-corner` → `close`. The rough still shows the destination, not intermediate proof of this camera move.

Arc through the open aisle, revealing the desk, lane and original RF bench as one place. Never cut, dissolve between separate rooms, pass through the desk or change bench scale to force the composition. Stay inside the room and below the ceiling. Validate the route in the animatic; moving waypoints is expected.

Maintain the same dusk state as the desk and wall. The rough close frame's brighter daylight is reference drift, not a reason to reset time to morning.

## 96–100% — A: matched

Frame: `concepts/world-09-close.jpg`, with real HTML lettering rather than the titled raster. Pose `close`, frames 765–795, sampling frame 765. Hold the high wide reveal with the bench in the foreground and the other stations behind.

Upper-left copy: **Matched.** "Embedded systems & hardware." "Available for full-time roles after May 2027." Actions: Email Miguel and View resume. The notebook trace is centered. This is a visual ending, not a claim that the real matcher achieved a perfect measured match.

Contact is available before this shot as well. The visitor should not need to complete the journey to get in touch.

## Composition, reading and fallbacks

- Use Archivo for the scene copy and IBM Plex Mono for measurements. Use the existing four core color roles. The orange trace is a restrained object material, not a second global UI accent.
- Copy has real contrast against a quiet part of the scene or a solid panel. Its safe area must be evaluated at each rest; no fake glass is required to rescue bad composition.
- Camera movement and reading are separate. Scroll is native, and keyboard station links land directly at reading rests. A user can leave or skip an interaction without completing it.
- Keep the current light/dark control, reduced transparency, higher contrast and forced-colors paths. Theme changes affect readable UI surfaces; they do not replace the day's physical light sequence.
- Compact and short windows, reduced motion, failed media, no JavaScript and forced colors get ordinary document flow. Use real documentary photos now, then authored rest posters when rendered. Both personal projects retain independent images, links and controls.
- Use portrait compositions authored from the same room for production mobile posters. A center crop of the landscape concept frame is not the mobile design.
- No generated concept image goes under `public/assets/world/`. Final production media comes from the actual models and exact photos.

## Next gate: the grey-box animatic

Build a simple room, five fixed station volumes, device proxies at verified relative scale and one camera. Use `world.json` for the initial coordinates, actor paths and intervals. Render a low-cost MP4 before materials or detailed props. In the first pass, use a fixed neutral light so spatial continuity can be judged independently from the day-to-dusk effect.

The pass is ready for review when:

1. Every transition is recognizable as a move within the same room, including the return arc.
2. Camera and actors clear the room, furniture and each other; the robot action fits its source rig.
3. The bench, vehicles and floor never change size or teleport between shots.
4. Each reading rest holds completely still and leaves room for the entire device and intended HTML copy.
5. Forward and reverse playback preserve the physical handoffs and reversible staged actions.
6. The chosen station posters remain understandable without travel, with project, resume and contact access.

Do not mark the one-place gate passed based on these concept stills. The animatic supplies that evidence. After it passes, link the actual device collections, build the personal devices from the existing sources and start the Cycles still gate.

## Review and validation

Run `python3 reel/world/validate_world.py` to check ranges, references and existing source assets. Serve the repository locally, for example with `python3 -m http.server 8741 --bind 127.0.0.1`, and open `http://127.0.0.1:8741/reel/world/storyboard.html`. The viewer reads `world.json` directly; it is a sequence of concept stills, not the Blender animatic.

The text specification, validator and viewer are versionable. Large scenes, renders and the concept images remain in the existing local render workspace; they are not deployment inputs.
