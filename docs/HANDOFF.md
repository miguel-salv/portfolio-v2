# Current handoff

## Drive-by-Wire · 2026-11-23

The working tree on `dev` at `2155b0d` has modified shared site files and untracked Drive-by-Wire source, tests, and assets. Keep them together when reviewing the change. No commit or deployment was made at this checkpoint.

### Current implementation

- **Project placement.** Drive-by-Wire is in Selected Work and has its own case study. Bare-Metal RTOS is a separate project that links to it. [Project data](../src/data/projects.ts) · [Selected Work](../src/components/SelectedWork.astro) · [RTOS page](../src/pages/project-vehicle.astro)
- **Demo and evidence.** The two-jumper test runs with the front STM32 leading. With both jumpers pulled, the Pi relays between CAN A and CAN B and the demo opens the single collapsible scope photo showing 15.5 µs maximum skew across ten edges. The separate cockpit test starts with the Pi leading. Stop and restart show their actual scope photos in sequence, from about 2 Hz to 4 Hz hazards and then to lamps off. The circuit diagram simulates the tests. The photos are bench evidence. [Case study](../src/pages/project-drive-by-wire.astro) · [Demo](../src/scripts/demos/drive-by-wire.js) · [Styles](../src/styles/demo-drive-by-wire.css) · [Tests](../tests/drive-by-wire.test.mjs)
- **Hardware media.** The homepage uses a 1440 × 1080 transparent CAD turntable. KiCanvas uses basic controls with sheet tabs and copper toggles. Coordinate readouts are hidden. The writeup identifies the Raft breadboard as a bench setup and attributes the timing results to the lab kit. [Render manifest](../public/assets/stories/moments/catalogue/drive-by-wire-render.json) · [PCB viewer](../src/components/PcbViewer.astro) · [KiCanvas configuration](../src/scripts/kicanvas-config.js) · [KiCanvas accessibility](../src/scripts/kicanvas-accessibility.js)

### Checks

- Reran `npm run check`, `npm test`, `npm run build`, and `npm run verify` on this working tree. All passed. Astro reported zero diagnostics, 326 tests passed, and the verifier checked 11 HTML pages and 964 local references.
- Prior local Chromium checks covered both jumper orders, cockpit stop and restart, keyboard and mobile layouts, and full-size scope photo inspection. The split photo's disclosure was also tested without JavaScript. These browser checks were not rerun for the docs update.
- **Unverified here.** First-time visitor comprehension, live deployment, and powered testing or physical fit of the custom PCB.

### Next step

Preview `/project-drive-by-wire.html` as a first-time visitor. The owner flagged the different capture controls and confusing setup for readers new to distributed systems. The proposed change is to use one consistent bench-capture panel after each fault, give each test a plain-language goal before its first action, and state who leads at the start. Check the sequence on desktop and mobile before calling the usability issue resolved. This refinement is pending.

Use [reel/world/HANDOFF.md](../reel/world/HANDOFF.md) for reel-specific work. The source lab notes and scope originals are in the local course folder at `/Users/miguelsalvacion/Documents/School/4-fall/18449/lab5/`.
