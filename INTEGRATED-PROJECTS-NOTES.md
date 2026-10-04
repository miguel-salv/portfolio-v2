# Integrated engineering projects — 3 October 2026

The homepage now pairs each engineering model with its original real-build photograph, results, context, and case-study link. The repeated three-card gallery has been removed. The resulting order is **hero → three integrated engineering chapters → independent builds → About → career → contact**. All five projects, factual results, career information, original CAD, demos, and May 2027 availability remain available.

## Details and reference mappings

- **One complete project at a time.** Each engineering chapter combines its 3D presentation with a compact documentary photograph below the copy/results. The photograph retains the original project-card FLIP handoff, route, and source image. This restores the model/evidence pairing used by `ProjectJourney.astro` on `main` at commit `6470ae8`, within the current continuous journey. It also continues the media/label registration observed on [Jesper Landberg](https://jesperlandberg.com/) and the quiet captions outside apertures observed on [Gil Huybrecht](https://gilhuybrecht.com/). These are relationships from the existing live research, not new timing measurements.
- **Small, finite responses.** The evidence arrow travels 3px diagonally over 250ms; its photograph enlarges to 1.025 over 450ms. Both use cubic-bezier(.16,1,.3,1), respond to keyboard focus as well as hover, and settle when input leaves. Reduced motion retains ordinary static links. There is no idle movement added. The arrow, original image, and metadata form one native link with a project-specific accessible name.
- **Matcher evidence belongs to Machine.** Its photo disappears with the Machine panel when Inside, Tune, or In the lab is selected. Tune retains its interactive 3D VSWR surface without a separate model/photo beside it. At phone widths, the Machine sequence is copy/controls → model → photograph. A short desktop grid repair keeps the model caption above the chapter rail.
- **Quiet hero.** The hero contains its headline, a short personal introduction, one Explore my work action, and May 2027 availability. The repeated degree line, second project action, and duplicate scroll invitation are removed. Degree details remain on Resume; the case-study destination remains in the integrated Matcher. The fully visible static hardware, including the central capacitor, and the continuous handoff remain intact. This follows the expressive-scene/quiet-personal-copy relationship observed on [Léo Parpeix](https://www.leoparpeix.com/).
- **Interrupted navigation.** A cancelled Astro preparation cannot commit a deferred stale project swap after Back changes the address. Cancelled loading resumes the source page's controllers; leaving a case study releases its flying image. Late image callbacks do not restart a detached handoff. Same-page links now let Astro maintain its own history index while the existing native-scroll chapter behavior remains in use. The repair uses public lifecycle hooks, adds no dependency, and schedules at most one cancellation-recovery frame.

The references' registration, subject-local response, and quiet surrounding space remain the judgment criteria. This pass adds no new signature scene or unrelated motion trick. The earlier firmware note, duplicate contact email actions, and decorative Selected engineering rule remain removed.

## Bounded browser review

Desktop viewport emulation covered **1440×1000, 834×1112, and 390×844**, plus the **1440×760** short desktop edge. The repair batch addressed phone Matcher photo order and the short desktop caption overlapping the rail. Scoped confirmation covered these layouts, all three integrated project entries, keyboard Enter, immediate Back, Forward, the independent-build shortcut, and the simplified hero at all requested widths. Horizontal overflow was zero in the reviewed compact layouts.

Matcher Machine/Inside/Tune switching, detuning, and auto-tuning were exercised. Detune changed the modeled VSWR from 1.00 to 1.67; auto-tuning moved it toward matched before a deliberate mode interruption. Existing demo lifecycle and interaction regression coverage passes. Native **desktop Safari** additionally verified a regular Back return and Back during Matcher entry, with the homepage address and body agreeing. This is not mobile Safari or physical phone/tablet testing. No live reduced-motion OS preference switch was performed in this pass; existing fallback logic and behavioral coverage remain the evidence for that mode.

## Validation and performance evidence

- **131/131 tests pass**, including six new behavioral checks for deferred-swap cancellation, source-page resumption, newer navigation, late aborts, and recovery-frame release.
- **Astro check:** 39 files, zero errors, warnings, and hints.
- **Production build:** all nine pages pass. The exact build duration is recorded in `screenshots/integrated-projects/build.log`; it is a local warm build, not a runtime performance score.
- **Browser console:** no errors or warnings in the scoped in-app browser review. Whitespace checks pass.
- **Payload:** the homepage controller entry is 39,911 bytes / 12,529 gzip bytes. Its shared application chunk is separately measured at 33,219 bytes / 10,167 gzip bytes. The previous homepage-entry figure excluded that shared chunk, so it cannot establish the navigation repair's total byte delta. Direct imports and measurement limits are recorded in `performance-evidence.json`.
- **Images and scheduling:** integrated photos use `sizes="128px"`, lazy loading, and the existing 480px minimum image variant to keep the enlarged FLIP sharp. No dependency or permanent render loop was added. No new FPS, LCP, GPU, or physical-device benchmark is claimed.

## Evidence and remaining limits

Files are under `screenshots/integrated-projects/`:

- `hero-desktop-final.jpg`, `hero-intermediate-final.jpg`, `hero-phone-final.jpg`: final simplified hero.
- `desktop-matcher-final.jpg`, `desktop-vehicle.jpg`, `desktop-robot.jpg`, `desktop-tune.jpg`: integrated chapters and Tune's independent surface.
- `intermediate-vehicle.jpg`, `phone-vehicle.jpg`, `phone-matcher-final.jpg`, `phone-matcher-evidence.jpg`: compact evidence and ordering.
- `desktop-short-matcher-final.jpg`: repaired short desktop caption/rail separation.
- `safari-navigation-restored.jpg`: native desktop Safari homepage after interrupted entry.
- `tests.log`, `astro-check.log`, `build.log`, `performance-evidence.json`: validation and payload evidence.

`phone-matcher.jpg` and `desktop-short-matcher.jpg` are historical pre-repair captures; the final-suffixed/ordering captures above supersede them. The prior `screenshots/hero-journey-handoff/handoff-clear-lane-sampled.mp4` remains available as sampled continuity evidence for the unchanged hardware handoff. Its old hero labels are superseded, and its approximately three screenshots/second do not establish full-rate motion feel. No new full-rate recording was available in this pass.

Remaining weaknesses are the visible lighting/material difference when the studio render yields to live CAD, varying lighting in the original photographs, and unverified physical-device performance. The reviewed layouts and scoped browser navigation showed no remaining material issue requiring another polish cycle.
