# Hero to hardware journey — 3 October 2026

This records the earlier card-relocation stage. The integrated engineering chapters and simplified hero in **INTEGRATED-PROJECTS-NOTES.md** supersede its separate-gallery order, hero caption/scroll cue, card shortcut, and validation totals. The hardware handoff itself remains in use.

The shipped homepage order is **hero → three-model journey → engineering cards → independent builds → About → career → contact**. All three original engineering cards retain their photographs, metadata, routes, and FLIP behavior. The five projects, original CAD, factual results, career information, and May 2027 availability are unchanged.

## Details and reference relationships

- The static hero matcher travels into the first exhibit aperture during native desktop scrolling. The same original studio render spans both contexts; cubic ease-out controls its position and scale from current scroll geometry. It stays fully opaque, holds still at the exhibit entrance, then yields to the existing interactive CAD as exploration begins. The complete static hero, including its central capacitor, remains visible at rest. This extends the recognizable-media-across-context relationship observed on [Jesper Landberg](https://jesperlandberg.com/) and the opaque hardware continuity studied on [Seasats](https://www.seasats.com/). These are existing reference relationships recorded in REFERENCE-NOTES.md, not newly measured animation timings.
- Hero caption, availability, and scroll cue occupy the desktop left column, outside the moving hardware's right lane. Their geometry is the same at rest and during travel; there are no foreground label masks or rules cutting across the object. Quiet stationary copy beside expressive evidence continues the relationship observed on [Gil Huybrecht](https://gilhuybrecht.com/).
- A native **View project cards** link in the hero and chapter rail reaches the relocated catalogue directly. Project links, keyboard activation, browser Back, and the existing card transitions retain their established behavior.
- Intermediate/phone widths, short desktop heights, and reduced motion use native document flow without the floating handoff. Explicit Matcher mode input cancels the handoff; failed images leave original evidence visible. Resize remeasures geometry. Reverse/fast travel reads the present coordinate without an animation queue. Cleanup removes the temporary layer and aborts late image callbacks.

The earlier firmware note and duplicated contact email actions were removed at the user's request. Contact now has Email Miguel and View resume. Selected engineering has no decorative animated rule. These changes supersede the older distributed-motion inventory describing the note and email-copy actions.

## Bounded review and validation

The first browser pass used **1440×1000, 834×1112, and 390×844**. Repairs addressed outgoing label overlap and the studio-render-to-CAD size/vertical registration. The user's observation of cutout-looking foreground overlaps led to a final desktop composition repair: move the small labels into a clear left column and remove the backing masks. Scoped confirmation covered forward/reverse travel, Machine/Tune selection, chapter selection, the project-card shortcut, a vehicle case-study route, and Back restoration to the catalogue. The final browser console contained no errors. Native **desktop Safari** additionally confirmed the dark-theme handoff, interruption by Inside, the relocated card shortcut, and the final clear-lane repair.

Compact viewport results are **desktop emulation, not physical-device or mobile-Safari testing**. Reduced-motion behavior is covered by the existing controller/fallback logic and regression coverage; a live OS preference switch was not exercised in this pass.

- **125/125 tests pass**, including six new tests for handoff endpoint geometry, reverse/fast travel, failed images, explicit mode input, resize/visibility reset, and teardown.
- Astro check: **38 files, 0 errors, 0 warnings, 0 hints**.
- Final production build: **9 pages in 1.72 seconds**. Diff whitespace check is clean.
- No dependencies or permanent render loops added. The handoff runs inside the existing coalesced journey frame. The built homepage controller entry is **39,911 bytes / 12,528 gzip bytes**, compared with 12,080 gzip bytes in the preceding hardening evidence: **+448 gzip bytes** across the latest changes. Imported chunks are excluded; this is payload evidence, not FPS/LCP or GPU benchmarking.

## Evidence

Saved under `screenshots/hero-journey-handoff/`:

- `desktop-rest-clear-lane.jpg`: complete static hero with the final desktop left-column labels.
- `desktop-entry-clear-lane.jpg`, `desktop-middle-clear-lane.jpg`: final unobstructed handoff. Earlier entry images record the superseded label-backing repair.
- `motion-frames/09.jpg` and `motion-frames/10.jpg`: final handoff-to-CAD framing.
- `desktop-cards-final.jpg`: catalogue and restored browser location.
- `intermediate-matcher.jpg`, `phone-rest.jpg`, `phone-cards.jpg`: responsive native-flow evidence.
- `safari-clear-lane.jpg`: final native desktop Safari handoff. `safari-interrupted.jpg` and `safari-cards.jpg` record the mode/route checks before the final layout repair.
- `handoff-clear-lane-sampled.mp4`, `clear-lane-samples.json`: sixteen actual browser screenshots from forward and reverse scrolling after the final repair, encoded with their recorded intervals. Approximately three samples per second; this illustrates state continuity and ordering, **not frame-rate smoothness**. The earlier recording is historical.
- `tests.log`, `astro-check.log`, `build.log`, `performance-evidence.json`: validation and payload evidence.

Remaining weakness: the studio render and live CAD still have different lighting/material reflections, so their takeover remains perceptible even with matched framing. Physical-device performance and full-rate motion capture remain unverified. The bounded pass found no further material layout or navigation defect requiring repair.
