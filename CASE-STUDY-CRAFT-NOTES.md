# Case-study craft — 3 October 2026

**Current follow-up:** the user subsequently removed the Kirby greeting and repeated browser-recreation captions. The RTOS diagram now follows the supplied lab4 implementation, including its return to the same PendSV wrapper and per-thread kernel stacks. Project resources now precede a smaller next-project preview; engineering evidence is visible only for the active desktop chapter, IC explanations are resized and search uses an underline. `screenshots/feedback-refinement/REVIEW.md` records the current state and 143 passing tests. The greeting inventory and recordings below document the earlier implementation.

All four authorized additions are implemented within the existing Engineering Catalogue. The simplified hero, continuous opaque hardware journey, three integrated photo FLIPs, standalone Tune surface, five projects, career information, links, original CAD and May 2027 availability remain intact.

## Shipped details and references

### 1. Documentary photographs and editorial pacing

All five case-study cover photographs and five inline photographs have an Inspect image control. It opens the original image in a native modal dialog, with its caption and an Open original image link. Escape closes the dialog and restores focus to the trigger. Modified clicks retain ordinary link behavior; without dialog support or scripts, the trigger still opens the original image. The dialog has loading and failure feedback, and navigation tears it down completely. Original-image links bypass page transitions and hover prefetch.

The image seats over 320ms from 12px below, with cubic-bezier(.16,1,.3,1). The photograph stays inside a stable aperture. The small control moves only 3px on hover or keyboard focus; touch gets a persistent 44px target. Reduced motion presents the image directly. Section spacing, unframed photographs and connected factual captions give the case studies a calmer evidence-to-explanation rhythm.

Mapping: [Gil Huybrecht](https://gilhuybrecht.com/) keeps labels outside stable media apertures with quiet surrounding margins. [Jesper Landberg](https://jesperlandberg.com/) keeps media and their labels registered through travel. These relationships were observed on the live portfolios; the local dialog and its 320ms timing are authored here, not copied or measured reference behavior. The preceding observations and their limits are in REFERENCE-NOTES.md.

### 2. Visitor-paced RTOS context switch

The vehicle case study retains its complete existing diagram and adds seven explicit steps: Thread A's process stack; SysTick requesting PendSV; the handler's main stack; saved context and the current TCB; selection of the next runnable thread; restoration of Thread B; and exception return to its process stack. Thread B is the illustrative next thread in this diagram, not a fabricated scheduler measurement.

Previous, Next step, Replay and Show all keep the sequence under visitor control. An active connection traces for 420ms using the established easing; its neighboring node receives a quiet static highlight. Repeated input cancels the old trace and immediately applies the latest step. Show all returns the full diagram. There is no autoplay, timer queue or rendering loop. Reduced motion retains the steps and their state without drawing motion.

The phone diagram uses its existing vertical arrangement with tighter row spacing. When the entire figure fits the available viewport but is clipped, explicit step activation seats the complete figure below the sticky navigation. Oversized figures keep ordinary document scrolling. At 390×844, the complete 691px figure fits from approximately y118 to y809.

Mapping: this is an original detail derived from Miguel's RTOS work. Its local trigger, persistent labels and calm resting state use the established reference language; no reference is credited with an unobserved RTOS widget.

### 3. Live Matcher lighting and materials

The original CAD now uses Three's AgX tone mapping to agree more closely with the existing Blender AgX hero render. Its studio lights follow the original four-light arrangement in `reel/render_monograph.py`: broad warm key, restrained cool fill, narrow rear edge and a quiet front strip. Reflections, roughness and contact-shadow opacity are tuned together; existing roughness detail also contributes a very small metal bump.

The static hero render and its complete central capacitor are unchanged. Machine and Inside use the same demand-driven renderer, modes and passive exploration; Tune continues to show the separate interactive VSWR surface. There are no replacement meshes or new render loops.

Mapping: the source of the material direction is the portfolio's original studio render. [Léo Parpeix](https://www.leoparpeix.com/) supports the broader relationship between a carefully lit object and quiet nearby reading; its flower scene is not copied. The live renderer still has simpler reflections and surface detail than the offline Cycles render, so the transition is closer rather than identical.

### 4. A finite Kirby greeting

Say hello to Kirby sits directly beneath Explore the touch display, close enough to keep Kirby visible while activating the control on a phone. A native button alternates the existing wave sprites for 720ms, then returns him to his exact resting position. Repeated activation restarts a single greeting. Leaving Clock, firing an alarm, pausing the demo, navigation or a motion-preference change cancels it. Outside the Clock view the control is disabled with a Return to Clock explanation.

Reduced motion uses one held wave pose before returning to rest. The former automatic actor bobbing, random waving and blinking scheduling are removed. The existing finite hop, touch/keyboard app navigation, alarms, and Star Catcher behavior remain available. Unique actor animation keys prevent the clock and game actors from overwriting each other's finite animations.

Mapping: [Jesper Landberg](https://jesperlandberg.com/)'s activated Profile opens personal imagery and copy, then returns to the gallery. [Léo Parpeix](https://www.leoparpeix.com/)'s feed-the-bee cue sits beside its subject. The former Profile interaction was exercised; the bee cue was observed as an available control and was not activated. This greeting follows the optional, subject-local personality relationship using Miguel's existing Kirby sprites, with independently authored timing.

## Bounded browser review

The result was checked in the Codex in-app browser at **1440×1000, 834×1112 and 390×844**, including production-preview checks. These are desktop viewport emulations, not physical phone or tablet tests. A separate native desktop Safari check covered the RTOS sequence and original-image dialog in dark mode, including Escape and restored focus. Safari captures include the browser's surrounding UI and Retina scaling; they are not a physical-mobile claim.

The material repair batch made the complete phone RTOS figure visible during step activation and placed the greeting directly below its demo title so its response stays visible. Final scoped captures confirm those repairs. No new aesthetic pass or signature scene was added.

Regression interactions checked in the browser include RTOS stepping/back/replay/reset, enlarged original photographs and Escape, Companion greeting and app navigation, Matcher Machine/Inside, the hero handoff, and Tune detuning/autotuning from 1.35 to matched 1.00. The existing scheduler's PID input changed 60→65 and utilization .713→.763, then returned to its original values. The homepage Kirby wake/sleep and finite LED chase still work. The requested layouts have no observed horizontal overflow. No warn/error console entries were retained in the reviewed final production session; this is limited to that session.

## Screenshots and motion evidence

All evidence lives in `screenshots/case-study-craft/`. Selected final captures:

- [Desktop context-switch sequence](screenshots/case-study-craft/desktop-context-final.png), [phone full diagram](screenshots/case-study-craft/phone-context-final.png), [phone saved context](screenshots/case-study-craft/phone-context-save.png), [intermediate diagram](screenshots/case-study-craft/intermediate-context.png).
- [Desktop original photograph](screenshots/case-study-craft/desktop-photo.png), [phone Companion photograph](screenshots/case-study-craft/phone-photo.png), [phone keychain photograph](screenshots/case-study-craft/phone-keychain-photo.png), [intermediate robot case study](screenshots/case-study-craft/intermediate-robot-final.png).
- [Static hero](screenshots/case-study-craft/hero-final.png), [opaque handoff](screenshots/case-study-craft/handoff-final.png), [live Machine](screenshots/case-study-craft/desktop-machine-live-final.png), [Matcher](screenshots/case-study-craft/desktop-matcher-final.png), [phone Matcher](screenshots/case-study-craft/phone-matcher-final.png), [intermediate Tune](screenshots/case-study-craft/intermediate-tune-final.png).
- [Phone greeting control and resting Kirby](screenshots/case-study-craft/phone-companion-final.png), [intermediate Companion](screenshots/case-study-craft/intermediate-companion-final.png), [native Safari dark diagram](screenshots/case-study-craft/safari-context-dark.png), [native Safari dark photograph](screenshots/case-study-craft/safari-photo-dark.png).
- [RTOS sampled motion](screenshots/case-study-craft/context-sampled.mp4) follows select→restore→Thread B→Replay→SysTick→Show all. [Kirby sampled greeting](screenshots/case-study-craft/greeting-sampled.mp4) shows a visitor-triggered wave returning to rest.

The recordings are assembled from actual browser captures using their recorded timestamp intervals, with a final hold for readability. Their 25fps containers duplicate held frames and quantize timing; they do not contain 25 distinct captures per second. The RTOS sample captures about 2–3 positions per second; the greeting samples have variable intervals of roughly 37–105ms. They establish trigger, sequence and resting state, not full-rate smoothness or a 60fps benchmark. Raw PNGs, timestamps and concat manifests are retained alongside them. Screenshots establish framing, not motion feel.

## Validation and performance evidence

- **142/142 regression tests pass**, including 11 new behavioral tests for interrupted/reduced-motion context tracing, cleanup, fitting-figure scroll registration, finite greetings, actor-key isolation, photo failure/reopening and focus restoration.
- **Astro check: 41 files; 0 errors, 0 warnings, 0 hints.**
- **Production build: all 9 pages, 4.04s** in the final warm local run. This duration is not a cold-build benchmark.
- `git diff --check` passes. All **10 original-image destinations** exist in the production output.
- No dependency or permanent animation loop was added. The Matcher retains demand-only rendering; Kirby's idle actor scheduling is removed. Route navigation owns and cancels the new listeners, dialog and finite transitions.

[performance-evidence.json](screenshots/case-study-craft/performance-evidence.json) records the final production entry sizes: homepage main entry **39,911 bytes / 12,497 gzip**, unchanged in raw size from the preceding integrated-project build; shared project-reading entry **7,251 / 2,897 gzip**; lazy Matcher module **6,972 / 3,165 gzip**; lazy Companion module **45,536 / 13,795 gzip**. These are individual entry/chunk sizes, excluding their full import graph. No LCP, GPU time, whole-site frame rate or physical-device performance result is inferred from them. Validation logs and the reviewed console inventory are in the evidence directory.

## Remaining weaknesses

The live CAD still cannot reproduce every offline-render reflection or fine surface detail. The original documentary photographs retain varied source lighting. A real mid-range phone and mobile Safari still need a human feel check; the desktop emulation cannot establish touch latency, pinch behavior, thermal behavior or GPU limits. Reduced-motion interruption and cleanup are verified through behavioral tests and source review, not an actual changed operating-system motion preference in this pass. The sampled recordings cannot prove the exact feel of every easing curve.
