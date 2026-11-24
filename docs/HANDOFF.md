# Current handoff

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
