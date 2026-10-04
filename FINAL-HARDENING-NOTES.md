# Final hardening and mobile pass — 3 October 2026

**Subsequent user-directed simplification:** removed the “Before blaming the firmware…” note, reduced Contact to its single Email Miguel action plus View resume, and removed the animated horizontal rule beneath Selected engineering. The removed note/copy-control code and styles were cleaned up. Desktop and phone framing, all 119 tests, Astro checks, and the production build were confirmed again. Earlier inventories below describe the preceding pass; its personal-note and email-copy details are no longer shipped. Updated captures are under `screenshots/final-hardening-2026-10-03/simplified/`.

The portfolio's established identity and distributed motion remain intact. This pass addressed concrete reliability and accessibility defects found in narrow layouts, native Safari, interrupted input, and real failed requests. All five projects, factual results, career information, links, May 2027 availability, original CAD, static hero, card FLIP transitions, continuous hardware journey, Matcher exploration, and Tune's 3D surface remain available.

## Changes

- **Narrow scheduler controls:** compute and period controls stack beside each task at small widths. Values fit fully at 320px; inputs use 16px text and 44px height. Empty or invalid edits retain the last valid value; valid values respect their step and bounds. PID 60→65 updates utilization to .763 in the live demo.
- **Navigation and theme:** closed mobile links become inert immediately, Search participates in the focus cycle, and closing Search restores focus to the compact menu when its original trigger is hidden. Cancelling an opening frame prevents rapid open→close input from leaving a ghost menu. System dark mode now survives Astro page swaps; a session choice also survives unavailable storage. Browser theme color follows the actual displayed theme.
- **CAD controls:** the bundled viewer stays intact, with names, 44×44px hit areas, visible focus, and forced-colors borders added to its open shadow controls. Inactive views are inert and hidden from accessibility. The latest view selection wins when preparation or an exit is interrupted; stale completions cannot overwrite it.
- **CAD recovery:** the original schematic remains available while loading and after failure. A failed library request exposes working Retry and View static schematic actions. Static recovery removes the dimming and places Load viewer in the corner, leaving the circuit readable. Retrying uses a fresh module URL after failure, avoiding the browser's cached failed module. Busy/status feedback belongs to the current request.
- **Demo lifecycle and Kirby gestures:** detached or obsolete imports cannot mount after navigation; duplicate mounts are prevented. Visibility and intersection agree about pausing. Pointer cancellation, lost capture, and a second pointer cannot accidentally commit an app change. Drag and velocity use the same logical display scale. Pausing cancels held steppers and settles interrupted movement.
- **Content without scripts:** static demo captions describe the visible hardware instead of unavailable controls. Unbound video facades expose an ordinary YouTube link. Script-dependent search, wake/chase, chapter controls, and CAD loader controls stay hidden until initialized; native content and links remain usable.

## Reference relationship

The existing **seat → travel → exact rest** language is retained. These repairs strengthen the details already mapped in [REFERENCE-NOTES.md](REFERENCE-NOTES.md#distributed-craft--overdrive-3-october-2026):

- [Gil Huybrecht](https://gilhuybrecht.com/): readable persistent labels and small controls; supported here by current navigation, correctly named CAD controls, and stable selection.
- [Jesper Landberg](https://jesperlandberg.com/): evidence remains identifiable through changing context; supported here by retained CAD/static media and interruption-safe view selection.
- [Léo Parpeix](https://www.leoparpeix.com/): local playful interaction beside quiet personal content; supported here by usable Kirby gestures, wake/chase controls, and truthful local instructions.

These are relationship mappings to earlier live observations, not newly measured reference timings. No additional signature scene, unrelated idle animation, or invented instrumentation was added.

## Verification

Desktop viewport emulation covered 1440×1000, 834×1112, and 390×844, plus a narrow 320×740 inspection across the homepage, all five case studies, Resume, and 404. The narrow initial DOM samples showed zero page overflow, no broken loaded images, and no visible unnamed ordinary buttons. Lazy viewer controls were inspected separately after mounting; this is targeted inspection, not a complete accessibility audit.

Live confirmation exercised phone menu/Search focus, Kirby alarm minutes 0→1 and Weather navigation, wake/LED controls, scheduler values, named CAD toolbar keyboard activation, rapid schematic/layout selection and resizing, chapter navigation, project-card routing with Back, and Tune detune/auto-tune. The modeled tuner finished at **VSWR 1.00**, while its deployed-result statement remains ~1.2 VSWR.

**Native desktop Safari** was tested separately: dark home, hardware chapters, Tune's painted surface, search and layout at a verified 200% browser zoom, successful PDF preview, and dark-theme persistence across Home→Resume. Safari screenshots include the native window and browser chrome; they are not phone emulation.

A temporary local server served built production files with deliberate faults. It returned 503 for the first CAD library request and then 200 for the fresh retry URL. Both direct Retry and static recovery followed by Load viewer recovered in the browser. A real PDF request returned 503 and opened the truthful HTML highlights while retaining the native PDF actions. A CSP script-blocked production page retained its static schematic, hardware evidence, and video link. CSP script blocking differs from disabling JavaScript in browser settings. These fault views used a 1280×720 desktop viewport. The temporary server and test tab were closed after verification.

- **119/119 regression tests passed**, including 22 additional hardening cases.
- **Astro check:** 38 files, zero errors, warnings, or hints.
- **Production build:** 9 pages, successful in 2.49 seconds.
- **Whitespace check:** clean. Final normal-page browser error log: empty.

[Tests](screenshots/final-hardening-2026-10-03/regression-tests.log) · [Astro check](screenshots/final-hardening-2026-10-03/astro-check.log) · [Build](screenshots/final-hardening-2026-10-03/production-build.log) · [Narrow samples](screenshots/final-hardening-2026-10-03/narrow-before.json) · [Actual fault requests](screenshots/final-hardening-2026-10-03/fault-requests.json)

## Visual evidence

- Home framing: [desktop](screenshots/final-hardening-2026-10-03/home-desktop.jpg), [intermediate](screenshots/final-hardening-2026-10-03/home-intermediate.jpg), [phone](screenshots/final-hardening-2026-10-03/home-phone.jpg).
- Scheduler at 320px: [before](screenshots/final-hardening-2026-10-03/scheduler-320-before.jpg), [after](screenshots/final-hardening-2026-10-03/scheduler-320-after.jpg). [Phone Kirby alarm](screenshots/final-hardening-2026-10-03/companion-phone.jpg).
- CAD: [phone controls](screenshots/final-hardening-2026-10-03/pcb-controls-phone.jpg), [failure](screenshots/final-hardening-2026-10-03/pcb-failure.jpg), [static recovery](screenshots/final-hardening-2026-10-03/pcb-static-recovery.jpg), [successful retry](screenshots/final-hardening-2026-10-03/pcb-retry-success.jpg).
- [Script-blocked content](screenshots/final-hardening-2026-10-03/script-blocked-case-study.jpg) and [PDF failure recovery](screenshots/final-hardening-2026-10-03/pdf-failure-recovery.jpg).
- Native Safari: [Tune](screenshots/final-hardening-2026-10-03/safari-tune-native.png), [200% search](screenshots/final-hardening-2026-10-03/safari-search-200-percent.png), [theme persistence](screenshots/final-hardening-2026-10-03/safari-theme-persistence.png).

Earlier sampled motion recordings remain indexed in [the distributed motion review](screenshots/bench-details/REVIEW.md). No new continuous recording was captured in this hardening pass; screenshots establish framing and state, not frame-rate smoothness.

## Performance and remaining limits

No dependencies or permanent render loops were added. Missing schematic/board targets no longer start the wrong 30-second fitting polls; detached embeds stop fitting, and navigation disconnects observers and prevents late demo mounts. The shared navigation/search entry is **9,963 bytes gzip**, **115 bytes** above the previous polish measurement. Other measured entry files and their scope are in [performance evidence](screenshots/final-hardening-2026-10-03/performance-evidence.json). Entry-file sizes exclude imported chunks. No new whole-site FPS, GPU, LCP, or physical-device benchmark is claimed.

Physical iPhone/Android, mobile Safari, actual finger gestures, device performance, a screen-reader session, and OS forced-colors mode remain unverified. No installed iOS simulator was available. Reduced motion, gesture cancellation, forced-colors styles, and teardown have source/behavioral coverage, not new OS-level browser sessions. The original photographs still vary in lighting, hardware films remain 30fps sources, and original CAD teardrop metadata still produces parser warnings. The fault fixture also observed the bundled viewer requesting its existing internal `$$:0:$$` path; the original files load and the view recovers, but the vendor request was not rewritten.
