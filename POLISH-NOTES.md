# Whole-site polish — 3 October 2026

The established workshop identity, composition, factual content, five projects, May 2027 availability, static hero CAD, card FLIP transitions, continuous hardware journey, and existing demonstrations remain intact. This pass refined shared reading and utility details and repaired input/lifecycle defects.

## Shipped refinements

- Search now has the same five project destinations on every page, including Resume and 404. Its field has an accessible name, a 44px close control, result feedback, and a useful empty state with “Show all results.” Tab/Shift-Tab reaches the controls; arrows still select results. Reopening or navigating away cancels a pending selection.
- Search uses an opaque themed surface and plain Archivo category labels. Clipboard failure exposes the email address instead of opening an unrelated application; stale feedback is discarded after navigation.
- Case studies and Resume identify their position in the main navigation. Compact chapter menus show the current section beside “In this build,” clear it outside the article, and retain native disclosure/anchor behavior. The chevron seats with the existing exponential easing.
- Phone case-study prose and leads are now 16px; role attribution is 13px. Resume highlights and recovery text are 16px. Existing heading hierarchy, measures, spacing, evidence framing, and captions remain coherent.
- Short Matcher mode labels, footer/contact links, and PCB source actions have at least 44px targets. Next-project links give keyboard focus the same color/arrow response as hover.
- Alarm and timer steppers work through Enter/Space as well as pointer input. Their names identify hours, minutes, or seconds, and their groups expose the selected value. Pointer activation steps once; cancellation, blur, pausing, and leaving the demo stop held repeats.
- Stepper targets are 44 logical pixels high (48.125px at the tested 390px layout) while the original drawn controls retain their proportions. AM/PM and alarm arming expose proper names and pressed states.
- Inactive Kirby apps and departing views are inert. Focus returns to the display when its current control leaves. Internal display apertures use non-scrolling clipping, preventing keyboard focus from shifting the simulated screen and hiding its labels.
- Resume replacements render offscreen while the last complete page stays visible. Busy state, cancelled renders, returning to an earlier width, late library loading, navigation teardown, and real failure are handled explicitly. Failure opens truthful HTML highlights and retains PDF actions; those highlights remain printable on preview failure.
- Initial-paint and scroll-restoration covers now use the actual paper/charcoal tokens. The 404 heading also reads correctly as one accessible sentence.

## Reference relationship

The existing motion direction remains seat → travel → exact rest. These refinements support Gil Huybrecht’s clear labels and persistent small controls, Jesper Landberg’s registration between controls and evidence, and Léo Parpeix’s understandable local interactions. They do not introduce another signature scene. Actual reference URLs, observed triggers, timing limits, and earlier motion mappings are in [REFERENCE-NOTES.md](REFERENCE-NOTES.md#distributed-craft--overdrive-3-october-2026).

## Review and validation

A batched inspection and confirmation covered the homepage, all five case studies, Resume, 404, and the legacy redirect. Desktop viewport emulation used 1440×1000 and 390×844 across the main routes, with 834×1112 coverage of shared homepage, reading, and resume surfaces. Light mode was reviewed throughout; dark search, resume, PCB, and reading states were inspected. The final compact repair prevents the demo’s inner screen from scrolling on focus.

Live controls exercised: search recovery, keyboard focus/close, chapter links, all three project-card transitions with Back, Matcher detune/auto-tune, Kirby wake/sleep, homepage LED chase, alarm keyboard adjustment, companion app navigation, PID compute time 60→65, robot bottle placement, keychain sequencing, PCB viewer loading, and responsive PDF rendering. Existing motion and reduced-motion regression checks pass. No JavaScript-disabled, forced-colors, screen-reader, physical-device, or Safari session was run in this pass.

- **97/97 tests passed**, including new interruption, keyboard, repeat-cancellation, and PDF lifecycle cases.
- **Astro check:** 38 files, zero errors, warnings, or hints.
- **Production build:** all 9 pages succeeded.
- **Diff whitespace check:** passed. The final browser error log was empty.
- The recorded layout samples report zero horizontal page overflow and no broken loaded images. This is targeted inspection, not a complete automated accessibility audit.

[Regression output](screenshots/polish-2026-10-03/regression-tests.log) · [Astro output](screenshots/polish-2026-10-03/astro-check.log) · [Build output](screenshots/polish-2026-10-03/production-build.log) · [Layout samples](screenshots/polish-2026-10-03/layout-audit.json)

## Evidence

Full before/after screenshots are in `screenshots/polish-2026-10-03/`. Useful final views:

- [Desktop homepage](screenshots/polish-2026-10-03/after/home-desktop-top.jpg) and [phone homepage](screenshots/polish-2026-10-03/after/home-phone-top.jpg).
- [Phone search recovery](screenshots/polish-2026-10-03/after/search-empty-phone.jpg) and [dark desktop search](screenshots/polish-2026-10-03/after/search-empty-desktop.jpg).
- [Phone alarm keyboard focus](screenshots/polish-2026-10-03/after/alarm-keyboard-phone.jpg), [desktop alarm](screenshots/polish-2026-10-03/after/alarm-keyboard-desktop.jpg), and [intermediate dark reading](screenshots/polish-2026-10-03/after/case-study-dark-intermediate.jpg).
- [Resume highlights and PDF](screenshots/polish-2026-10-03/after/resume-phone.jpg), [scheduler](screenshots/polish-2026-10-03/after/scheduler-desktop.jpg), [robot](screenshots/polish-2026-10-03/after/robot-demo-desktop.jpg), and [keychain](screenshots/polish-2026-10-03/after/keychain-demo-desktop.jpg).

Earlier sampled motion recordings and their timing limitations remain indexed in [the motion review](screenshots/bench-details/REVIEW.md). No new continuous video recording was captured during this polish pass.

## Performance and remaining weaknesses

No dependencies or permanent render loops were added. Chapter updates reuse the existing coalesced scroll frame. PDF rendering cancels obsolete work, avoids rendering again at an unchanged width, and releases loading/render tasks and observers on navigation. Production gzip sizes are 1,647 bytes for the resume controller and 9,848 bytes for the existing shared navigation/search bundle; these are total bundle sizes, not growth figures. [Raw bundle evidence](screenshots/polish-2026-10-03/performance-evidence.json) is available. The earlier motion CPU sample remains documented separately; no new whole-site FPS, LCP, GPU, or real-device performance claim is made.

Physical touch, mobile Safari, and desktop Safari still need a human feel check. The original photographs retain their varied lighting, and the existing hardware films remain 30fps sources. KiCanvas still produces warnings for original teardrop attributes and exposes some unnamed internal toolbar controls in the observed accessibility tree; its bundled viewer was not rewritten. PDF failure and cancellation recovery were tested with controlled unit failures, not a browser-level network outage.
