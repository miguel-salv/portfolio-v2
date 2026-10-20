# Desktop reading-rest layout review

20 October 2026. Local review at `http://127.0.0.1:8762/reel/world/desktop.html`. This is a still-and-HTML composition check, separate from the production homepage and film controller.

```powershell
python reel/world/build_desktop_preview.py
python -m http.server 8762 --bind 127.0.0.1
```

Use Previous / Next to move through nine reading steps over the seven current grounded stills in `lab/review/desktop-rests/`. Scroll below the frame for the reading-step selector, reversible Hide text, document view and full-resolution image link. The UI follows the saved/OS light or dark preference and uses the site's sun/moon control. Room lighting remains authored into each still.

## Existing site identity

The owner found the first preview too different from the existing website. The current revision imports `src/styles/workshop-identity.css` directly instead of defining a green UI palette. It uses Montserrat for body, navigation and the opening, Newsreader for editorial project/About/closing headings, and IBM Plex Mono for measurements. This owner revision supersedes the storyboard's earlier Archivo proposal. The existing monogram, five navigation labels/order, search and theme icon markup come from the source assets, `src/data/site.ts` and `SiteHeader.astro`.

Links use the same blue accent, fine underline and horizontal arrow as the site. Matcher modes use its unfilled tabs and blue active underline, with the existing labeled measurement hierarchy. Native role summaries use its blue plus/close treatment. The numbered section counters and filled action buttons are removed. Search is operable within the local review: it filters reading steps, supports keyboard navigation, and closes with Escape. The production site's CSS and components remain unchanged.

`build_desktop_preview.py` takes headings, summaries, measurements, dates and links from `world.json`, and the full role details and twelve technical skills from the existing `src/pages/index.astro`. Rebuild the HTML after those sources change. No project claims are rewritten. The room remains captioned as a rendered presentation; the portrait remains a photograph.

## Composition

- Opening, matcher and vehicle copy sit left; robot and personal-project copy sit right. Solid paper/ink reading fields provide contrast over the rendered scene. The 56px header uses the existing site's brand/navigation arrangement. The small review footer remains distinct from the project controls.
- Companion and keychain have independent headings, summaries, project/demo links and paired navigation over exactly the same desk image and crop. “Independent builds.” uses the existing site's small blue metadata treatment, leaving clearance above the keyring. The parent description remains visible in document flow.
- About and Experience share the same pinboard image and crop. The full biography, all twelve skills, all three role summaries, organizations, dates and native expandable details remain HTML. Expanded details scroll within the reading field while the camera and navigation stay fixed. The portrait and employer marks remain unobscured. The field deliberately covers part of the decorative Smith-chart print; Hide text reveals it.
- The closing headline and contact actions occupy separate upper-left and lower-left fields so the small matcher, both floor devices and personal builds remain visible in the wide shot.
- A newly selected reading step keeps the previous complete image until its own image has decoded. Inactive or hidden text is inert. Compact/short windows, reduced motion, forced colors and image failure use document flow. No JavaScript gets the complete static document. Those fallback paths are implemented; browser emulation of media preferences was outside this desktop check.

## Verification

Nine steps were captured and visually inspected at **1920×1080, 1440×900 and 1366×768 CSS pixels**. Normal browser scrollbars remain enabled. The 27 final captures have complete images, no horizontal overflow, no overflow in the collapsed reading fields, and an image origin of `[0, 0]`. The 16:10 crop was checked as well as the two approximately 16:9 windows; no rest camera or image was edited.

Tall desktop windows below a 4:3 aspect ratio contain the whole image to preserve the devices; this is not a new phone composition.

The browser check exercised both themes, reversible Hide text, visible keyboard focus, search filtering and Escape, all matcher mode footprints, paired desk navigation, all three expanded role details and document view. Document view retains nine sections, three role details and twelve skills. Local asset references and fragment targets exist, IDs are unique, and `node --check reel/world/desktop.js` and `git diff --check` pass. Current contrast values are recorded in the audit beside the new screenshots.

Current evidence stays local in `.impeccable/review/desktop-site-identity/`: the 27 viewport JPEGs, three contact sheets, light/search/expanded captures, `measurements.json`, `interactions.json` and `audit.json`. `.impeccable/review/desktop-layout/` describes the superseded first UI. The inspection is a desktop still-layout gate for owner review, not approval of motion, mobile framing or production integration.

Matcher Machine / Inspect / Tune switch real HTML text and controls here. Tune links to the existing homepage exhibit; the personal demo links lead to their existing case-study demos. There is no newly registered live tuner, screen projection or LED layer on these stills. Those integrations need a separate implementation step after this layout review.

The current blend, seven source stills, both movies, production homepage/styles/components, `public/`, `world.json`, project data and Cursor plans were not changed. Only the local preview, its generator and the UI contracts changed. Hashes of both existing movies and `src/data/projects.ts` still match the preceding handoff.
