# Site optimization and hardening — October 15, 2026

Implemented and verified locally. The existing portfolio appearance, factual copy, photographs, model films, project routes, and hardware interactions are preserved. No deployment was made.

## Results

- Later native-flow project films now load as their artwork approaches the viewport. The original 998×976 homepage visit fetched the 1,522,579-byte vehicle film and 3,115,728-byte robot film immediately. The final fresh visit requests neither: **4,638,307 bytes (4.64 MB) deferred**, while both still load during exploration. Below-fold independent-build covers and chase frames are lazy, and the unused timeline request is removed.
- Save-Data starts the chapter films paused; the visitor can explicitly enable motion. Preference changes stop robot/keychain animation, and offscreen scheduler/heatmap demos cannot restart themselves when reduced motion is disabled.
- Astro is updated from 5.18.2 to 7.4.0, with compatible security patches throughout its dependency tree. The final online npm audit reports **zero known vulnerabilities**, down from 11 affected packages. Node's minimum is now 22.22.0. HTML whitespace behavior is pinned to preserve the incumbent copy spacing, and development binds to localhost.
- Demo and tuner imports have 12-second loading deadlines. Explicit retries use a fresh, validated, same-origin module URL when the browser has cached a failed import; browsers that do not identify that URL retain page-reload recovery. Late or obsolete imports cannot mount. A real 503 followed by recovery and Retry successfully mounted the robot demo in the browser.
- Cancelling navigation releases the search overlay, background inert states, scroll lock, and header spacer. The tuner remounts its open disclosure, and the matcher retains the selected mode/component. These paths were exercised with the real page lifecycle as well as regression tests.
- Clicking outside the journey after Skip/About/Contact cannot restore an unfinished decoder's scroll restriction. Project navigation and browser Back remain functional.
- Search leaves Enter/arrow keys to active input-method composition and accepts long multilingual queries. Empty-result recovery, Escape, focus return, and mobile menu/Search flows were checked.
- Resume highlights are available through a native disclosure even when the visual PDF succeeds. Failed or stalled previews reveal the readable highlights and PDF actions; rendering is cancelled on timeout. Printing a ready PDF omits the highlights disclosure.
- Scheduler fields restore empty edits on blur and use the last valid number when stepping an empty field. The skills group has a valid accessible role. The homepage's sole h1 remains available to screen readers during the visual copy handoff.
- Mobile navigation and homepage play controls appear as enhanced controls only after their handlers initialize. With external site scripts deliberately blocked, ordinary navigation, project links, photographs, and resume actions remain available.
- Structured-data JSON escapes HTML delimiters. CI now runs the regression suite and validates the built site's local links, fragments, asset references, heading/landmark counts, image alternatives, and duplicate IDs.

## Verification

- **307/307 regression tests pass**, including 18 additional cases for deadlines, obsolete imports, fresh-URL retry, composition input, empty scheduler fields, navigation cancellation, retained matcher selection, Save-Data, and lazy chapter loading.
- Astro diagnostics: **43 files, zero errors/warnings/hints**.
- Production build: **10 HTML pages**, successful.
- Built-site verification: **820 local references**, no missing files/fragments, duplicate IDs, unnamed images, or incorrect top-level heading/landmark counts.
- All nine content/recovery pages inspected at **1440×1000 and 320×740**. Dark-theme checks cover the same pages; additional homepage checks cover **834×1112**, **1280×720**, and phone interactions at **390×844**. Final inspected states have no horizontal overflow or broken loaded images. One transient avatar decode sample was rechecked successfully.
- Axe checks cover WCAG A/AA, WCAG 2.1 AA, and best-practice rules. Confirmed findings were fixed. The scrolling homepage was rechecked with its h1 available. Some SVG text, non-text stepper glyphs, and animated overlap produce manual contrast checks rather than automatic verdicts; those are not represented as automated passes.
- Browser interaction checks include all six hardware demos, PCB schematic/layout loading, original-image inspection/Escape, detune/auto-tune, search, native career disclosures, independent-build controls, early/current comparison endpoints, and project/Back navigation.
- Deliberate faults include external script blocking, a 503 PDF, and a 503 dynamic demo import followed by a successful explicit retry. Stalled-import/render deadlines and late completions have deterministic regression coverage.
- **Native desktop Safari** successfully renders the dark homepage, opens Search with Cmd+K, navigates to Resume through Search, and finishes the PDF preview. This is a desktop Safari spot-check, not mobile Safari emulation.

## Measurements and limits

The fresh-visit comparison is recorded under `screenshots/optimize-harden-2026-10-15/`: `baseline-home.json` and `after-home-final.json`. The final local sample records LCP 392 ms, CLS 0.0028, no long tasks, and no video requests. The initial local sample records LCP 328 ms and CLS 0. These are single local browser samples with different cache histories, so they do **not** establish a latency improvement or field Core Web Vitals. The deferred film bytes are directly verified.

A separate restored-scroll session is retained as `restored-home-session.json`; it includes the visible matcher's film and aggregate layout shifts of 0.122. It is not a fresh-visit comparison or a field CLS measurement. Physical-phone performance, real slow mobile networks, a full screen-reader session, native Windows forced colors, and complete browser/version coverage remain unverified. Reduced-motion change checks use the actual controllers with a local media-query fixture; existing native CSS paths are preserved.

The bundled KiCanvas viewer still makes its pre-existing optional `$$:0:$$` lookup; its real schematic and PCB sources load and operate correctly. The viewer's internals were not replaced. The separately vendored PDF.js 4.10.38 was checked against Mozilla's published advisories: the 2024 issue is fixed before that version, and the July 2026 issue affects a later range. No claim of an exhaustive vendor security audit is made.

The existing design-context files were preserved. Their typography inventory still names Archivo while the incumbent CSS uses Montserrat; this pre-existing documentation difference was not repaired as a side effect of refinement.

## Evidence and maintenance

Screenshots and detailed browser reports are in `screenshots/optimize-harden-2026-10-15/` (local, ignored evidence). They include desktop/phone page views, dark theme, blocked modules, PDF recovery, confirmed demo retry, tuner cancellation recovery, and native Safari. Screenshots with fixture controls are test-only; those controls are not in the production build.

Run `npm test`, `npm run check`, `npm run build`, and `npm run verify` for future changes. The deployment workflow now runs these checks before publishing.

Security/migration references: [Astro 7 migration](https://docs.astro.build/en/guides/upgrade-to/v7/), [Astro image-processing advisory](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2), [PDF.js 2024 advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq), [PDF.js July 2026 advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j).
