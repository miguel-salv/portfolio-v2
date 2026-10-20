# Oryzo rebuild — agent handoff

Read this file first. It is the status of the one-world lab rebuild as of 20 October 2026. The Cursor plan files under `~/.cursor/plans/` are historical. Do not edit them. `world.json` is the scene specification. This file says what is already decided, what is built, and what to do next.

The owner asked for this handoff so another agent can continue without the chat. The immediate open task is at the bottom.

## What this is

Rebuild the homepage as one continuous lab, in the spirit of [oryzo.ai](https://oryzo.ai) (Lusion). The premise in `reel/render_story_world.py` is "the page is the world." The new premise is **"the lab is the world."** One 8 × 6.5 × 3.6 m room, five stations, one camera, no cuts. Scroll scrubs a continuous film first. Real-time WebGL is a later upgrade of that same camera path.

The room is the spatial foundation of the homepage, not the complete experience. On 20 October the owner explicitly reaffirmed Oryzo's whole-site quality bar: authored typography, primary and secondary object motion, varied compositions, distinctive interactions and continuous transitions across the entire page. The existing portfolio identity remains the UI reference.

Stations, in camera order:

- **A. RF bench.** Impedance matcher, coax, ESD mat, notebook. The opening, the operable tuner, and the closing "Matched." all happen here.
- **B. Vehicle floor.** The vehicle stays on the epoxy floor. It does not drive off the bench.
- **C. Robot lane.** The arms close against the bottle surface, then the robot drives 30 cm with it sliding on the floor. The bottle never rises. No collection box.
- **D. Personal desk.** Kirby Companion and the LED keychain, evening lamp.
- **E. Pinboard.** Real portrait and the Ford, CMU, and Hacker Fab marks. About and Career stay real HTML.

Each move is carried by an object. Time of day runs from cool morning at A to dusk at D, and the return stays at dusk.

## Borrow the method, not the site

Oryzo is the quality bar for continuity, light, contact shadows, material texture, and one motif that returns. It is not a layout, asset, or code source.

Do:

- Keep one camera and one scale. A landmark from the previous shot survives every handoff.
- Let an object carry each move.
- Repeat one motif. Here that motif is a real Smith chart: loader trace, notebook trace, Tune plot, pinned print, centered trace at the close.
- Use the existing website identity for HTML: Montserrat for body/navigation/opening, Newsreader for editorial project/closing headings, IBM Plex Mono for measurements, and shared paper/ink/blue UI tokens. The owner requested this after the first desktop preview; it supersedes the earlier Archivo/green UI proposal. Physical room colors and the orange trace material stay fixed.
- Author the assets carefully: CAD, photographed materials, baked cameras, cloth or curve cables. Give the text, interactions and transitions the same attention; asset fidelity alone does not meet the reference.

Do not:

- Copy Oryzo assets, code, copy, layouts, or screenshots. Never pass an Oryzo image into an image generator or a material reference.
- Ship AI concept frames, generated likenesses, invented logos, or invented instrument readings. `PRODUCT.md` forbids generated stand-ins. Renders are labeled as renders. Real photos stay captioned photographs.
- Put anything from `reel/world/concepts/` under `public/`.
- Change project claims. Measurements stay as written in `src/data/projects.ts`, including **95 W forward power**.
- Autoplay the scroll, hide Email / Resume / project links behind the journey, or drop the reduced-motion, compact, forced-colors, and no-JavaScript document flow. The current switch is `documentFlow` in `src/scripts/project-journey.js`.
- Let a frame take over the display before it is complete. That is the existing validated-owner rule in the journey controller.

## Locked decisions

The owner made these. Do not reopen them unless they ask.

| Decision | Choice |
|---|---|
| Delivery | Staged. Scroll-scrubbed film first, real-time WebGL second. |
| Capture | None. Existing CAD, KiCad, and photos only. No photogrammetry. |
| Opening light | Hero A, cool morning. `concepts/world-02-hero-a.jpg`. The day warms toward the desk. |
| Bench-to-floor carrier | The coax drops off the bench. The matcher end stays attached. The vehicle is already on the floor. |
| Ending | Wide pull-back of the whole room, about 8% of the scroll (4% travel, 4% read). Headline is **Matched.** |
| Motion study | Corrected animatic is the spatial reference: southeast hero camera, matcher yaw +5°, controller toward the lower-left of the capacitor bank, one continuous descent. The later detailed rig correction keeps the bottle on the floor while the arms close and the robot drives. |
| Opening frame | Good enough for now. The pencil and both probes rest on the mat, and the camera sits closer on the same southeast heading. |

`world.json` → `decisions` records the same choices. `STORYBOARD.md` is the beat-by-beat copy, scroll, and camera contract. Where the rough frames disagree with the storyboard, follow the storyboard. Known rough-frame drift: the bench changes size, the tilt is a whip with a two-ended cable, the close is daylight, the portrait and CMU seal are generated, the keychain grew a key ring, the Companion screen is dark.

## What is already built

| Piece | State | Where |
|---|---|---|
| Concept frames | Done. Direction only. Local, gitignored. | `reel/world/concepts/`, index in `concepts/INDEX.md` |
| Storyboard and scene spec | Done. | `STORYBOARD.md`, `world.json`, `storyboard.html`, `validate_world.py` |
| Grey-box animatic | Rendered and corrected. Spatial review used it to start the opening frame. `world.json` still says `storyboard-draft`; treat the film as the camera reference, not as a passed production gate. | `build_animatic.py`, `ANIMATIC.md`, `motion.html`, local `animatic/` |
| Opening bench still | Accepted for now. Cycles stills for desktop and phone. The pencil and both probes rest on the mat. | `build_hero.py`, `HERO.md`, `hero.html`, local `hero/` |
| Shared lab | The opening bench, lane, grid, desk, and pinboard are one room. The vehicle and robot are the current models at the provisional size. Their cameras are not re-authored. | `build_lab.py`, local `lab/lab.blend` |
| Draft film | One continuous Cycles pass of that lab. 26.5 s, 960×540, 8 samples. Local only. | `build_film.py`, `lab/film/lab-film.mp4` |
| Production homepage | Unchanged. Do not restructure `src/pages/index.astro` until the other rests exist. | `src/` |

These files exist on disk and are allowlisted in `.gitignore`. They were missing from the "One world test" commit, which is why a checkout of that commit fails `validate_world.py` and shows blank storyboard, hero, and motion pages:

- `concepts/` — the direction frames, `INDEX.md`, and `smith_chart.py`
- `hero/landscape.png`, `hero/portrait.png`, the WebP previews, `hero/render.json`, and `hero/textures/` (the CC0 oak maps)
- `animatic/lab-greybox.mp4`, the reverse movie, `lab-greybox.blend`, `camera.json`, `audit.json`, `source-bounds.json`, and `animatic/posters/`
- `reel/models/impedance-studio.blend` — the matcher the opening frame is built from

Oak is Poly Haven [Oak Veneer 01](https://polyhaven.com/a/oak_veneer_01) by Jenelle van Heerden, CC0. `animatic/frames/`, draft renders, `*.blend1` backups, and `hero/opening-bench.blend` stay local. The opening scene is rebuilt by `build_hero.py`.

## How to look

From the repo root:

```sh
python3 reel/world/validate_world.py
python3 -m http.server 8741 --bind 127.0.0.1
```

- Storyboard: `http://127.0.0.1:8741/reel/world/storyboard.html`
- Movement study: `http://127.0.0.1:8741/reel/world/motion.html`
- Opening frame: `http://127.0.0.1:8741/reel/world/hero.html`

Blender is `/Applications/Blender.app/Contents/MacOS/Blender`.

```sh
# Grey-box film. Prefer --stills before a full --render.
Blender --background --python reel/world/build_animatic.py -- --stills

# Opening frame. Draft is 40 samples. Final is 192 samples, 1920×1200 and 1000×1600.
Blender --background --python reel/world/build_hero.py -- --draft
Blender --background --python reel/world/build_hero.py -- --final

# Shared lab, then the film. The film opens lab/lab.blend; it does not rebuild the stills.
Blender --background --python reel/world/build_lab.py
Blender --background --python reel/world/build_film.py
```

`build_hero.py` links the matcher by executing `reel/build_matcher_exhibit.py` and stopping before its presentation-unit rescale. It does not modify that file, the studio `.blend`, or `public/`.

## Whole-experience direction — 20 October reference review

Reviewed the website-cloning chapter of the owner's [video, from 33:19](https://www.youtube.com/watch?v=Rifw9OpXtjo&t=1999s), its transcript and selected recreation frames, then traversed [Oryzo's live site](https://oryzo.ai/) through the footer. Exercised the flip control, material-view drag and product variants. No reference media or code was copied into the project.

The weak recreations approximate the visible ingredients while losing the behavior between them: crude hand/packaging substitutes, abrupt section changes, a missing mug arrival, inconsistent return compositions and static imagery where an object should act. Even the stronger recreation misses some of these handoffs. Our still-layout preview does not yet demonstrate that broader motion quality either.

Carry these requirements into the next authoring pass:

- Choreograph headings, supporting copy, measurements and controls with the object's arrival and departure. Define masks, order, overlap, easing and exit behavior for each beat rather than applying one generic reveal everywhere. Keep copy stable and legible once its reading rest begins.
- Give every project a specific demonstration and composition. Candidate treatments use the existing matcher trace/tuner, vehicle scheduler/PID demo, robot detection-to-grip sequence, Companion touch UI and keychain LED chase. These are proposals, not newly implemented or measured results; retain actual project claims and team attribution.
- Specify secondary motion where it has a physical or functional reason: cable slack and settling, wheel roll, control feedback, screen wake and LED timing. Avoid constant motion across every prop. Existing grounded contacts and locked reading cameras remain requirements.
- Design the handoffs as carefully as the resting shots: outgoing text clears, the visual carrier continues, the next composition resolves, then controls become active. Test reverse scroll, direct section entry and leaving a demo midway. Keep the room route, scale and agreed close intact.
- Include original technical drawings, close details and deliberate typographic changes in scale/layout where they explain the work. The whole page needs variety while retaining the portfolio's Montserrat / Newsreader / IBM Plex Mono identity and immediate project/contact access.

Lusion's [3D production account](https://blog.lusion.co/oryzo-bts-part-2-7-3d-design-and-motion-graphics) describes a hybrid of authored animation, splats and texture mapping; its [UI account](https://blog.lusion.co/oryzo-bts-part-3-7-website-ux-ui-and-illustrations) describes restrained typography, seamless transitions and custom illustrations. These inform the craft target, not a requirement to adopt their tools or copy their scenes. The agreed film-first delivery remains in place.

**Next gate:** author the text/object/interaction beats across the journey, then prove one complete opening-to-matcher sequence in an inexpensive local motion prototype before spreading the treatment across the page. Reuse current stills/media and HTML/SVG for timing; use Blender scrubbing for physical motion. No full render, phone pass, production homepage integration or new rendering pipeline is implied by this reference review.

## Current desktop layout baseline

The owner found the first preview's UI too different from the existing website. The current revision imports the actual `src/styles/workshop-identity.css` tokens and uses its Montserrat / Newsreader hierarchy, real monogram, navigation order, search/theme icons, blue underlined links, mode-tab underlines, and labeled matcher readings. The initial green panels, Archivo headings, numbered eyebrows and filled action buttons have been replaced. The generator reads navigation from `src/data/site.ts` and icons from `SiteHeader.astro`; only the local preview and contracts changed. Search filters the local reading steps and closes with Escape. Theme follows the saved/OS preference and keeps the site's icon toggle. Fresh 27-layout evidence is in `.impeccable/review/desktop-site-identity/`; the previous evidence folder describes the superseded first UI. Tall desktop windows contain the whole still rather than cropping devices. No 3D rebuild, render or production edit was needed.

The local desktop layout check is implemented in `desktop.html`, `desktop.css` and `desktop.js`; `DESKTOP.md` records the scope and evidence. Open `http://127.0.0.1:8762/reel/world/desktop.html` with a repo-root server on port 8762. Previous / Next visits nine reading steps over the seven current grounded stills. Scroll below the frame for Hide text, the step selector, document view and the full-resolution still link.

All nine reading steps were captured and visually checked at 1920×1080, 1440×900 and 1366×768. All 27 have complete images and no horizontal or collapsed-copy overflow. Desk copy clears the keyring, and the wide close uses separate headline/contact fields so its small devices remain visible. About/Experience retain the photograph, employer marks, full biography, twelve skills, three role summaries/dates/outcomes and expandable details. Expanding the details keeps the camera fixed. Light/dark UI, keyboard focus, reversible Hide text, search, mode footprints, paired desk steps and document view were exercised. Current evidence and contrast measurements are in `.impeccable/review/desktop-site-identity/`; see `DESKTOP.md`.

`build_desktop_preview.py` regenerates the local HTML from `world.json` and the existing role details/skills in `src/pages/index.astro`. The matcher modes check HTML/control footprints; the tuner and personal demo links open existing pages. Live scene registration, scroll-film ownership and a loader are not implemented here. This is a local composition review, not production homepage integration. No scene rebuild, still/movie render, phone framing, project-claim change or Cursor-plan edit was performed.

The owner called the revised identity "alright" and redirected attention to the broader experience above. Treat these layouts as a provisional composition baseline, not approval of the finished motion or whole-site design. Keep full movie rendering, phone framing, `world-stage.js` and production integration on hold until requested.

### Preceding correction — bearing contacts

The owner spotted the robot floating in the seven stills. Its actual tread vertices were 12.7969 mm above the floor; the vehicle rubber also had a 0.3864 mm gap. Whole-assembly bounds had allowed the separate grounded bottle to mask the robot's wheel gap. `lab_geometry.ground_floor_device` now seats the evaluated tire/tread geometry at each roll phase. The bottle stays at floor height and the arm pivots remain centered on its label. Camera poses, travel in X/Y, wheel rotation, gripper closure and lighting remain unchanged. `build_lab.py` and `build_film.py` use the same contact rule for future builds.

The same pass seats the bins, shelf books, manuals and spare leads, joins the stool legs to their rubber feet, extends the shelf uprights and worktop into their supports, seats the desk paper stack, and places four small rubber pads under the matcher without moving its coax connection. Bin labels and manual index strips now meet their backing surfaces. The curtain rings meet the top of their rail. Spool cheeks rest on the service worktop rather than cutting into it.

`lab/review/grounding/repairs.json` records 121 static bearing checks in both saved blends and a maximum 0.067 micrometre difference in the protected camera/travel/bottle/gripper/light samples. The earlier geometry and pose digests below describe the material-only revision before this contact correction. The corrected current stills remain in `lab/review/desktop-rests/`; use the refreshed seven-image set for the next layout check. Movies and project claims remain unchanged.

`grounding/audit.json` passes 8,288 evaluated wheel-contact samples across all 795 frames and quarter-frame samples during both drives. `build_film.bake_floor_subframes` adds 360 fractional-frame height keys so rolling tread phases remain supported between integer frames too. Wheel gaps are below 0.00001 mm; the bottle remains at floor height within floating-point tolerance, both grippers have zero intersections in 241 sampled poses, and all seven reading rests remain still. `review_film.py` now includes wheel and static-bearing contacts in its default audit. Inspection frames include the open-arm rest, closed grip/slide and wide view. `seven-desktop-stills-grounded.zip` contains the refreshed seven 1920×1080 images.

The owner authorized three small material/light refinements and a fresh set of **all seven desktop reading stills**. `lab/review/desktop-rests/` is the current image source for the next layout check, rather than the older hero preview or animatic posters:

- `frame-0000.png` — opening / hero.
- `frame-0090.png` — matcher.
- `frame-0255.png` — vehicle.
- `frame-0405.png` — robot.
- `frame-0555.png` — personal desk, shared by the Companion and keychain reading steps.
- `frame-0645.png` — pinboard, shared by the About and Experience reading steps.
- `frame-0765.png` — wide close / Matched.

All seven are 1920×1080 Cycles stills, up to 128 samples, without an HTML overlay. `review_film.py -- --reading-stills` reproduces just these images from the saved film and records their camera matrices, lens, shift, rest IDs and scroll ranges in `desktop-rests/render.json`. These are the inputs used by the subsequent desktop layout checks in `DESKTOP.md`.

`lab_look.refinements` raises matcher cast-aluminum roughness from 0.24 to 0.34 and capacitor-aluminum roughness from 0.16 to 0.24. Only the personal desk top gets a satin copy of the photographed oak: its roughness map spans 0.42–0.62 with specular IOR level 0.38; the original grain, color, normals, height and UVs remain. `lab_details.wear` also supports this desk variant. The dusk contribution to the broad floor fill rises from 24 W to 40 W, making its total dusk power 81.6 W. Other light powers and the opening light state remain fixed.

Both saved blends contain these refinements; the film still opens at frame 765 for scrubbing. `desktop-rests/refinements.json` confirms identical mesh coordinates and the same 27-pose camera/device/coax digest before and after the changes. All seven light rests still have zero drift. Movies and `src/data/projects.ts` remain unchanged. No movie, phone frames or homepage integration were produced.

### Preceding room detail pass

The owner authorized the remaining window and workshop refinements, still **without a complete render**. `lab_details.py`, called by `lab_context.furnish`, adds the details to both saved blends. The film remains ready to scrub at frame 765. Review `lab/review/room-details/frame-0000.png`, `frame-0555.png`, and `frame-0765.png`; `window-detail.png` is a separate inspection view of the window, not a new film camera pose.

- A sill-length ivory linen sheer covers 0.85 m of the 2.4 m west window, leaving its center open. It has folds, hems, hanging tabs, properly threaded rings, a brass rail and mounting screws. The window has thin reflective glazing, gaskets, a latch and hinges. Original geometry supplies a modest exterior building, leafy tree silhouettes and ground; no image backdrop is used. The sill is 40 mm deeper to support the plant saucer.
- The ESD mat has a snap, a coiled grounding lead and a frame bond. The task lamp connects to the desk power strip; the floor lamp cord follows the wall to its outlet. A small open tray holds three spare coax connectors. The old solid repair-tray block is replaced by an open tray containing a partly fitted generic PCB and loose components.
- Nine bin labels agree with their contents. The bins are partly filled with connectors, headers, board offcuts, capacitors, fasteners and wire; a few whole bins and the top book have small supported placement variations. Three pots sit in saucers, with varied leaves and uneven soil. Brackets and fixings remain visible. Handle, worktop-edge and caster wear changes roughness only.
- Dusk ceiling fill rises from 28 W to 36 W in the lighting formula, and a 24 W dusk contribution is added to the floor fill; opening light powers stay the same. Exterior sky emission follows the same keyed day-to-dusk clock. The task-lamp diffuser is moved 4 mm clear of its head hinge, removing the dark triangle, and the shade's duplicate pole geometry is removed.

`room-details/build.json` confirms the same 27-pose camera/device/coax digest before and after the edit. `room-details/audit.json` checks all 795 camera frames and seven held light states, 241 gripper poses, the grounded bottle and coax plug, and contact for the new cords, sockets and saucers. The nearest new detail remains 965 mm from the film camera. The pot bases meet their saucer basins, the coil meets the bench, and the lamp hinge no longer intersects its diffuser. Protected movie files and `src/data/projects.ts` are unchanged. The four review images are 1920×1080 Cycles stills, up to 128 samples; the inspection camera is not saved into the film.

These are targeted desktop stills only. The existing movies predate this static room revision. **Do not start a full movie render, phone frames or homepage integration without new owner authorization.**

### Preceding floor refinement

The latest owner-approved change refines the chair rug and robot floor area. Review `lab/review/floor-refinement/frame-0405.png` (robot rest), `frame-0483.png` (floor slide and chair area), and `frame-0765.png` (wide close). These are three 1920×1080 Cycles stills, up to 128 samples. No movie was rendered or re-encoded.

- The 1.25×1.36 m chair rug has a tightly woven taupe finish, an 8 mm bound edge and no fringe. It is 2.5 mm thick and stops 55 mm before the drawer cabinet. The chair moves into the desk's open knee space at `[5.35, 4.10, 0.4725]`, with its throw following it. All casters meet the rug and retain at least 198 mm to its edge. All cabinet feet now sit on bare floor.
- The robot's isolated joint grid is removed. Four short alignment tape corners identify the test area on the same continuous epoxy as the vehicle lane. The `robot-grid` spec ID is historical; there is no separate tiled patch or raised mat.
- `lab_room.seating_area`, `lab_look.rug_finish`, `lab_geometry.robot_alignment_marks`, and `lab_context.storage_supports` author this change in both saved blends. The new rug and chair placement are in `world.json`. `floor-refinement/audit.json` records contacts, no chair/furniture intersections, 220 mm minimum robot-to-rug clearance, and 146 mm minimum camera/chair clearance over all 795 frames. A 27-pose comparison with the previous blend confirms unchanged camera/device motion, coax and lighting. The film still opens at frame 765.

Next is the owner's review of these stills. **Do not start a full movie render, phone frames or homepage integration without new owner authorization.** The existing movies predate the latest static furniture/floor refinements.

### Preceding desktop quality check

The owner authorized the desktop quality check **without a complete render**. Only four checkpoints were rendered at 1920×1080, up to 128 Cycles samples with adaptive sampling and OptiX denoising: `lab/review/desktop-quality/frame-0190.png` (cable landing), `frame-0325.png` (vehicle handoff), `frame-0483.png` (robot grip/slide), and `frame-0765.png` (wide close).

The quality pass exposed the unsupported low bin shelf. `lab_context.storage_supports` adds four steel legs and rubber feet to that rack, plus four recessed leveling feet to the desk pedestal. The later floor refinement moves the rug clear of the cabinet, so all cabinet feet now sit on bare floor. The four stills were rechecked after the original support correction. `support-audit.json` records those twelve supports before the rug revision; `render.json` records those stills and unchanged movie files. Pre-correction stills stay in `before-supports/` for comparison.

Use `Blender --background --python reel/world/review_film.py -- --quality-stills` to repeat only these four stills, without rebuilding the scene, encoding video or saving render settings into the blend. Review these images before further work. **Do not start a full movie render, phone frames or homepage integration without new owner authorization.**

Open `reel/world/lab/film/lab-film.blend` in Blender and scrub frames 0–794. Camera, vehicle, robot, coax, and the day-to-dusk light are keyed, so the timeline shows them without a script. Material Preview is the fast shading. A full Cycles movie is now explicit: `build_film.py -- --render`.

The current revision opens at the wide frame 765 with Material Preview, scene lights/world enabled, and named timeline markers. Frames 172–190 show the cable fall, 405 the robot, 555 the desk and 645 the pinboard. `lab/film/lab-film.mp4` is the older review copy. The new small desktop motion review is `lab/review/motion/desktop-motion.mp4`; no production movie or phone frames were rendered for this pass.

The desktop motion pass fixes the contact, pause-lighting and framing defects found in the saved scene:

- The light had continued changing during the first four reading rests, particularly at the robot. `build_film.light_scroll_at` now holds each rest's sampled light state and eases between those states during travel. Window, fill, practicals, world and shade emissions all hold still at the seven rests. Dusk remains fixed through the close.
- The free coax plug's mesh had penetrated the floor by about 2 mm because the solver supported only the cable endpoint. `coax_bake.plug_floor_height` now supports the whole tilted sleeve. The cable still releases at 172 and lands at 190; settling ends at 255 so it is stationary throughout the vehicle rest. Sampled keys use linear interpolation to prevent overshoot between baked contacts.
- The vehicle's rear wheels briefly left the picture because the camera aimed ahead on a different easing curve. Departure aim now uses the same `vehicle_progress` clock as travel and wheel roll, and the handoff aims at the parked vehicle. The robot/bottle aim is slightly lower and nearer so the bottle base stays in view until the desk crane starts. Only aim changes; camera positions, lenses, travel timing and reading poses remain fixed. Conservative mesh bounds retain at least 10% frame margin during both actions.

`review_film.py` audits the saved blend without rebuilding devices or rerunning the cable simulation. It checks all 795 frames, 241 gripper poses and 381 plug-contact poses including quarter frames. The bottle bottom stays at zero, neither gripper intersects the body or label, the metal plug stays above the floor, and no moving vehicle frame has stopped wheels. The board-to-wide path still has one speed peak and no intermediate stop; camera positions remain identical to the spec. Evidence is in `lab/review/motion/audit.json`.

Run `Blender --background --python reel/world/review_film.py -- --preview` for the inexpensive review: 640×360, 8 samples, 15 fps motion updates and 30 fps during the cable fall. Held poses reuse one image. The encoded review retains all 795 frames / 26.5 seconds; `preview.json` records the rendered frame count and elapsed time. It is a motion check; use the existing 1920×1080 Cycles stills in `lab/review/cozy/` for fine materials and small details.

For a change confined to known frame intervals, append `--refresh 285 405 --refresh 435 555` to replace just those intervals and reuse the remaining images. The default preview refreshes everything. This pass needed 314 distinct 3D frames instead of 795; the initial preview took about 3 minutes 44 seconds, and the camera corrections refreshed only their two sections.

The owner asked to make the room cozier before motion polish. `lab_room.py`, called from `lab_context.py`, now adds an original personal-workshop layer:

- Warm ivory plaster, shallow sage paneling, oak capping and window casings give the room a more enclosed backdrop. A ceiling and south wall close the existing 8×6.5×3.6 m volume; room and device scale stay fixed.
- A 2.5 mm woven rug and a draped chair throw add textile surfaces at the desk. The later floor refinement replaces the fringe with a bound edge and puts the chair in the open knee space. Neither project vehicle drives on the rug.
- Three native-mesh plants, clay pots, a small oak book ledge and plain cloth-bound books add personal context. These are original authored geometry; no Oryzo assets, layouts, screenshots or generated images enter the scene.
- A 3000 K shelf strip and 2700 K linen floor lamp make two background pools of warm light. They fade in with the same dusk clock as the desk lamp. The cooler broad room bounce is reduced at dusk; floor devices remain readable.
- Latest review: `lab/review/cozy/`, six targeted 1920×1080 Cycles stills at 32 samples, plus audits. All 795 camera positions still match the spec, and minimum camera/furniture clearance remains 0.284 m. Camera, device motion and cable points match the preceding scene at the 27 audit poses. The corner lamp, shelf strip and shade glow stay constant from the desk rest through the close.

The underlying desktop lighting/material revision is in `lab_look.py`, applied by both builders:

- The fixed broad room fill follows daylight through dusk. The closing room and floor devices stay readable, with cool ambient light and a warm desk pool. The 3000 K desk key is reduced from 14 W to 1.8 W and uses a larger diffuser; a soft area bounce replaces the 90 W pinboard spotlight. The lighting stays constant from the desk rest through the close.
- Mineral paint, satin epoxy with fine roughness scuffs, cork, powder coat and printed polymer have metre-scale surface finishes. Worktops and room joinery have metric UVs for the existing photographed CC0 oak; the worktops' missing UVs had made the wood look flat. Device scale and the camera route remain fixed.
- The Companion LCD uses the existing demo's clock renderer and original sprites, rendered directly at 320×240 by `export_companion_screen.mjs`, then packed into the blend. It is not a crop of the photographed LCD. The fixed 11:45 clock echoes the documentary reference. The paper-eye outlines and detail still come from the original photo, with the baked warm tint removed from their material albedo.
- Targeted desktop Cycles stills and audits are in `lab/review/look/`. The final checks cover the robot, desk, board, pull-back midpoint and wide at 1920×1080, 32 samples. All 795 camera positions match the authored path; the light energies stay constant from frame 555 through 794. A separate 27-pose check confirmed camera/actor matrices and cable points were unchanged by the look pass. The movie is deliberately unchanged; use the blend for scrubbing. Source rebuild: export the clean UI with Node/Playwright when the local texture is missing, then run `build_film.py` without `--render`.

Latest owner corrections:

- Both original 15.875 mm rear connector cutouts now have bulkhead sockets. Their centres come from the circular boundaries in the CAD mesh. The cable plugs into the socket nearest its right-side route; its cable attachment is `[1.971631, 4.599314, 0.951326]`. The other socket remains open. The previous connector on solid panel beside the holes is removed. A supported route passes behind and around the matcher, held by bench guides. Only the hanging U of slack moves. The old drop happened below the camera frame; the camera now backs away and widens before the release at frame 172, keeping the free connector visible through landing at 190. Settling ends at 255. The U relaxes offline before release to remove the old initial spring; the simulation uses a physical 30 fps clock over that authored interval, with a separate smooth render curve and a metal free plug. Its latest physical length drift is below 0.1%.
- Vehicle wheel keys never stopped; the ten-spoke pattern aliased near one spoke per frame at peak speed. A short acceleration ramp and constant cruise avoid that lock. Wheels are still tied to travelled distance and have valve stems and small asymmetric tire marks. Every moving frame was checked; no zero-rotation frames, and travel/spin error is under one micrometre.
- `lab_context.py` adds north-wall service cabinets/shelves, parts bins, blank instrument housings, a cart, under-bench storage, a stool, a desk chair and tool tray. The desk now has a top, frame, pedestal and knee space. Camera clearance from that furniture was sampled across the journey; minimum 0.284 m, no reported near contacts. Floor lanes remain clear.
- The empty wall above the cart now has a rail with coiled leads. Desk-wall outlet raceways, an east-wall ventilation grille and two flush 2 mm floor sealant joints add building detail. Wall paint, epoxy roughness and wear are finished; keep the open driving areas open.
- The latest rear attachment close-up and centering/visibility audit are in `lab/review/rear-ports/`. Earlier room evidence is in `lab/review/revision/`; its rear connector close-up predates the correction to the original holes. The daylight room views are diagnostics; the saved film still ends at dusk.

- Gripper stops are solved against the label surface, with 0.15 mm clearance. The bottle bottom remains at floor height. Sampled closure meshes have no tip/body or tip/label intersections.
- The Companion eyes are flat silhouettes sampling the actual paper eyes from `src/assets/companion-cover.jpg`. Both oversized pupil spheres are removed. Each decal is about 8 × 26 mm, with 0.08 mm paper thickness.
- The 23 mm split ring has 1 mm wire threaded through the 4.5 mm mounting hole. It clears the PCB mesh. Two front rubber feet and a small folded rear support seat the tilted keychain on the desk.
- The keychain no longer stretches a rectangular photograph over its face. Native KiCad mask, copper and silk meshes carry purple solder mask, a silver star and white face artwork, with dark purple feet registered from the existing cover photo. The five optical windows use their actual footprint offsets `(0, 2.5 mm)` and cover the previously exposed circles. Their pale lenses have restrained emission. The desktop light pass preserves those finishes under the lower-power lamp.
- The coax is an offline contact bake with a fixed rear attachment, rounded bench lip, drawer and floor collisions, and self-contact. It is 2.132 m long; maximum physical length drift is below 0.1%. Curve points and the free plug are keyed, so no runtime simulation is needed.
- Raised lane/grid slabs are removed. The vehicle follows thin yellow tape, and the robot test area uses four short tape alignment corners on the same epoxy floor.
- The task lamp has a weighted base, connected twin links, three hinges, a hollow shade, reflector and recessed 42 mm diffuser. Its 40 mm light source fits inside the shade. It stays at 3000 K with the smooth day-to-dusk schedule.
- The board-to-wide move remains the single `wall` to `close` move already reviewed.

The latest appearance checkpoints are `lab/review/floor-refinement/`. `lab/review/desktop-quality/` precedes the rug revision and includes the grounded storage supports. `lab/review/cozy/` has the earlier room stills; `lab/review/look/` is the cooler room. Earlier geometry checks are in `lab/review/next/`, `lab/review/rear-ports/` and `lab/review/pass1/`. Hardware geometry code remains `lab_geometry.py` and `coax_bake.py`, called by the existing lab/film builders. Scene-lit Material Preview is the fast scrub view; Cycles stills are the reference for the room review.

Do not start `world-stage.js` or the homepage until the owner asks. Next is the owner's review of the floor-refinement stills. The small motion preview predates the latest stationary storage supports, rug/chair placement and floor marks. Full movie rendering and phone framing wait for new authorization.

## After the opening frame is accepted

Carry the same materials, window, and bench into the other rests. Do not restyle each station separately.

1. **One lab scene.** Done as a block-in. `build_lab.py` opens the accepted bench and adds the other station shells in that room. Vehicle and robot are linked. Real size is still unverified, so their rest cameras are not authored.
2. **Personal devices.** Placed. Companion is `Kirby.step` with photographed paper eye decals. Keychain is the KiCad board with a threaded split ring and three desk supports. LED packages and the CR2032 holder remain stand-ins.
3. **One Cycles still per rest**, landscape and a portrait composed in the same room. Judge contact, light, and continuity against the opening frame. The storyboard names the pose, copy, and scroll for each.
4. **Continuous lighting** from `world.json` `lighting.states`. The close stays at dusk.
5. **The film** is a draft at `lab/film/lab-film.mp4`. `world-stage.js` and the homepage wait until the owner asks. Stage 2 splats come after the film works. The phase list in the old plan is still the right sequence: film, loader, station demos, design-token reduction, real-time upgrade, verification. None of that web work has started.

## Rules that already cost a retry

- Generated images will not draw a Smith chart. `concepts/smith_chart.py` draws one. The opening notebook chart is built the same way, in mesh. Keep it mathematical, and label the trace illustrative.
- The hero camera is the corrected southeast view, not a new composition. Phone framing translates and shifts that camera. It does not orbit.
- Matcher yaw is +5°. Do not rescale the matcher to match the concept frames. Move the camera. Source bounds are about 185 × 196 × 83 mm.
- Window light is a real opening on the west wall. Do not paint a gobo in screen space.
- "Matched." is HTML in the site's Newsreader editorial face, not text inside the render. The titled concept JPEG is not the production frame.
