# Current handoff

## Updated catalogue media · 2026-11-24

The Drive-by-Wire and collection robot videos and posters are installed in `public/assets/stories/moments/catalogue/` from the reviewed 32-sample frame sequences. Drive-by-Wire uses 84 frames at 24 fps. The robot uses 62 frames at 30 fps in both landscape and portrait. The original phone crop fits the robot throughout the updated clip. The encoded WebM and Safari MOV files retain transparency and a keyframe on every frame for seeking. The updated Drive-by-Wire render manifest records the matching archived controller hash.

Astro reported zero diagnostics, all 326 tests passed, and the fresh build verified 11 pages and 964 local references. All 13 updated catalogue files matched their copies in the build.

## Collection robot material review · 2026-11-24

The new catalogue scene is saved at `.impeccable/renders/robot-realism/robot-realism.blend`. The photo informed the deeper yellow molded plastic, neutral tire rubber and black plastics, and reduced PCB glare. The Pi has a separate laminate edge, brushed connector plating, and satin aluminum on the processor lid. [Build photo](../src/assets/robot-cover.jpg) · [Finish source](../reel/robot_finish.py)

Blender built the scene and verified the Pi face and connector material assignments. The catalogue camera, geometry, and animation come from the existing builder. The 90-frame scene includes the return motion. The published forward clip uses frames 1–62 at 30 fps.

Rendered frame 1 at 1080 × 810 and 16 Cycles samples to `.impeccable/renders/robot-realism/robot-review-0001.png`. It matches the current poster's opening pose. The deeper wheel yellow and neutral dark parts are visible, and a broad highlight remains on the Pi board.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background \
  "$PWD/.impeccable/renders/robot-realism/robot-realism.blend" \
  --render-output "$PWD/.impeccable/renders/robot-realism/robot-review-" \
  --render-frame 1
```

### Full sequence review · 2026-11-24

Rendered frames 1–62 from the prepared scene at 1080 × 810, 30 fps, and 32 Cycles samples. The outputs are local in `.impeccable/renders/robot-animation-full-20261124/`:

- `frame-0001.png` through `frame-0062.png` are contiguous transparent RGBA PNGs. The opening pose and final grip around the bottle were inspected.
- `robot-animation-preview.mp4` is the compact playback copy (62 frames, 2.07 seconds).
- `robot-animation-preview-alpha.mov` is a transparent ProRes 4444 copy at 30 fps (62 frames, 2.07 seconds).
- The blend's 16-sample still settings were overridden to 32 for the render. The saved scene and portfolio assets were left unchanged.

## Drive-by-Wire Raspberry Pi and chassis finish · 2026-11-24

The updated Blender scene is prepared at `.impeccable/renders/drive-by-wire-pi/drive-by-wire.blend`, with the camera at the higher end pose. [Render source](../reel/render_drive_by_wire.py)

- The existing Pi 4 CAD follows the connector layout in the [Raft bench photograph](../src/assets/drive-by-wire-raft-bench.jpg). The 19 imported Pi meshes now use separate finishes for solder mask, stamped steel, the CPU lid, molded plastic, contacts, and markings. A narrow area light is linked to the Pi metal meshes for the reflection.
- Reopened the saved scene in Blender and compared it to the original builder. All 684 mesh geometries, transforms, and the end camera matched. Material changes were confined to 19 Pi meshes, and the reflection light had nine receivers.
- Source directory is `/Users/miguelsalvacion/Documents/School/4-fall/18449/outputs/lab4-working-archive-2026-11-03/pcb/renders/current/chassis-data`. The original 84-frame render log and byte-identical encoded poster and videos confirm the archived controller GLB's SHA-256 is `56fe5fd69d4263597dc980e9ffea02010043f6be86bf2bc0ade34933f1b47818`. Use this hash when updating the public manifest with new media.
- The opening review at `.impeccable/renders/drive-by-wire-pi/opening-0001.png` showed clear reflections on the Pi connectors and a pale green PCB. The latest saved scene reduces the solder mask's coat and specular response, with a slightly rougher finish. The opening review predates this adjustment.
- Reviewed `.impeccable/renders/drive-by-wire-pi/final-0084.png` with the lower-sheen PCB. The board stays green from the higher angle, and sampled highlights on the Ethernet and USB shells retain tonal detail.
- The black sheet metal layer now uses one satin finish across both plates and its brackets. The tires, wheel hubs, motor housings, and other black chassis hardware use neutral base colors with roughness appropriate to each material. See `.impeccable/renders/drive-by-wire-pi/neutral-chassis-0084.png` and the previous plates-only pass at `.impeccable/renders/drive-by-wire-pi/satin-plates-0084.png`. [Physical RTOS chassis photo](../src/assets/vehicle-cover.jpg)

### Full sequence review · 2026-11-24

The approved scene and archived chassis data rendered all 84 frames at 32 Cycles samples. Review files are local in `.impeccable/renders/drive-by-wire-full-20261124/`:

- `frame-0001.png` through `frame-0084.png` are contiguous 1440 × 1080 RGBA frames. The frame 1 opening and frame 84 end pose were inspected; the Pi finish and neutral black chassis remain consistent with the approved reference.
- `drive-by-wire-preview.mp4` is the compact 24 fps playback copy (84 frames, 3.5 seconds).
- `drive-by-wire-preview-alpha.mov` is a transparent ProRes 4444 copy at 24 fps (84 frames, 3.5 seconds).
- The render used the default full-sequence mode and `--samples 32`; the still-review blend and portfolio assets were left unchanged.

On this Mac, command-line Blender 5.2.1 crashed during Metal backend startup. Running the renderer from the interactive Blender Python console completed the sequence.

The saved blend defaults to the higher end pose. Reproduce the frame 84 review at 1440 × 1080 and 16 Cycles samples from the prepared file.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background \
  "$PWD/.impeccable/renders/drive-by-wire-pi/drive-by-wire.blend" \
  --render-output "$PWD/.impeccable/renders/drive-by-wire-pi/neutral-chassis-" \
  --render-frame 84
```

If the finish needs adjustment, rebuild from the source directory with `reel/render_drive_by_wire.py --prepare-only --samples 16`. Once the still looks good, the source renderer's `--sample --samples 16` mode reviews the opening, steering sweep, and higher end pose.

## Drive-by-Wire · 2026-11-23

The Drive-by-Wire case study, tests, and assets are committed at `afc5b79`. The first-visit usability refinement is in the working tree on `dev`.

### Current implementation

- **Project placement.** Drive-by-Wire is in Selected Work and has its own case study. Bare-Metal RTOS is a separate project that links to it. [Project data](../src/data/projects.ts) · [Selected Work](../src/components/SelectedWork.astro) · [RTOS page](../src/pages/project-vehicle.astro)
- **Demo and evidence.** Both simulated tests introduce the goal and starting leader. The front STM32 leads the two-jumper test. With both jumpers pulled, the Pi relays between CAN A and CAN B, and the bench scope capture shows 15.5 µs maximum skew across ten edges. The Pi starts as leader in the cockpit test. Stopping it changes the lamps from a roughly 2 Hz turn signal to 4 Hz hazards. Restarting it clears the hazards. All three results use the same auto-opening disclosure and full-image inspection control. Without JavaScript, all three disclosures are available below the static CAD render. [Case study](../src/pages/project-drive-by-wire.astro) · [Demo](../src/scripts/demos/drive-by-wire.js) · [Styles](../src/styles/demo-drive-by-wire.css) · [Tests](../tests/drive-by-wire.test.mjs)
- **Hardware media.** The homepage uses a 1440 × 1080 transparent CAD turntable. KiCanvas uses basic controls with sheet tabs and copper toggles. Coordinate readouts are hidden. The writeup identifies the Raft breadboard as a bench setup and attributes the timing results to the lab kit. [Render manifest](../public/assets/stories/moments/catalogue/drive-by-wire-render.json) · [PCB viewer](../src/components/PcbViewer.astro) · [KiCanvas configuration](../src/scripts/kicanvas-config.js) · [KiCanvas accessibility](../src/scripts/kicanvas-accessibility.js)

### Checks

- The lockfile install, Astro check, unit tests, fresh build, and static verification passed locally. Astro reported zero diagnostics, 326 tests passed, and the verifier checked 11 pages and 964 local references.
- Local Chromium checks at 1440 px, 390 px, and 320 px covered both jumper orders, cockpit stop and restart, reset, keyboard and touch interaction, reduced motion, and inspection of all three original photos. All three disclosures and original-image links also worked with JavaScript disabled.
- Checked the six KiCanvas schematic sheets in Chromium at 1440 px, 820 px, 390 px, and 320 px. All six center above the controls on narrower viewers. The three Drive-by-Wire child sheets fit on wide viewers as well. [Viewer framing](../src/scripts/kicanvas-config.js)
- **Pending verification.** Feedback from a first-time visitor, live deployment, and powered testing or physical fit of the custom PCB.

### Next step

Have a first-time visitor try `/project-drive-by-wire.html` without coaching. Check whether they can identify the starting leader in each test, finish both fault sequences, and find the original bench photos.

Use [reel/world/HANDOFF.md](../reel/world/HANDOFF.md) for reel-specific work. The source lab notes and scope originals are in the local course folder at `/Users/miguelsalvacion/Documents/School/4-fall/18449/lab5/`.
