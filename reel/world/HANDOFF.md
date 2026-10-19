# Oryzo rebuild — agent handoff

Read this file first. It is the status of the one-world lab rebuild as of 18 October 2026. The Cursor plan files under `~/.cursor/plans/` are historical. Do not edit them. `world.json` is the scene specification. This file says what is already decided, what is built, and what to do next.

The owner asked for this handoff so another agent can continue without the chat. The immediate open task is at the bottom.

## What this is

Rebuild the homepage as one continuous lab, in the spirit of [oryzo.ai](https://oryzo.ai) (Lusion). The premise in `reel/render_story_world.py` is "the page is the world." The new premise is **"the lab is the world."** One 8 × 6.5 × 3.6 m room, five stations, one camera, no cuts. Scroll scrubs a continuous film first. Real-time WebGL is a later upgrade of that same camera path.

Stations, in camera order:

- **A. RF bench.** Impedance matcher, coax, ESD mat, notebook. The opening, the operable tuner, and the closing "Matched." all happen here.
- **B. Vehicle floor.** The vehicle stays on the epoxy floor. It does not drive off the bench.
- **C. Robot lane.** The robot lifts one bottle, then drives 30 cm while holding it. No collection box.
- **D. Personal desk.** Kirby Companion and the LED keychain, evening lamp.
- **E. Pinboard.** Real portrait and the Ford, CMU, and Hacker Fab marks. About and Career stay real HTML.

Each move is carried by an object. Time of day runs from cool morning at A to dusk at D, and the return stays at dusk.

## Borrow the method, not the site

Oryzo is the quality bar for continuity, light, contact shadows, material texture, and one motif that returns. It is not a layout, asset, or code source.

Do:

- Keep one camera and one scale. A landmark from the previous shot survives every handoff.
- Let an object carry each move.
- Repeat one motif. Here that motif is a real Smith chart: loader trace, notebook trace, Tune plot, pinned print, centered trace at the close.
- Use few typefaces and few colors. Archivo for copy, IBM Plex Mono for measurements. Ivory, graphite, ESD green, one steel accent. The orange trace is a material, not a second UI accent.
- Spend the effort on offline-authored assets: CAD, photographed materials, baked cameras, cloth or curve cables. That is why clones of Oryzo fail.

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
| Motion study | Corrected animatic is the spatial reference: southeast hero camera, matcher yaw +5°, controller toward the lower-left of the capacitor bank, one continuous descent, robot lifts then drives. |
| Opening frame | Authorized after that animatic. It is not accepted yet. See the open task. |

`world.json` → `decisions` records the same choices. `STORYBOARD.md` is the beat-by-beat copy, scroll, and camera contract. Where the rough frames disagree with the storyboard, follow the storyboard. Known rough-frame drift: the bench changes size, the tilt is a whip with a two-ended cable, the close is daylight, the portrait and CMU seal are generated, the keychain grew a key ring, the Companion screen is dark.

## What is already built

| Piece | State | Where |
|---|---|---|
| Concept frames | Done. Direction only. Local, gitignored. | `reel/world/concepts/`, index in `concepts/INDEX.md` |
| Storyboard and scene spec | Done. | `STORYBOARD.md`, `world.json`, `storyboard.html`, `validate_world.py` |
| Grey-box animatic | Rendered and corrected. Spatial review used it to start the opening frame. `world.json` still says `storyboard-draft`; treat the film as the camera reference, not as a passed production gate. | `build_animatic.py`, `ANIMATIC.md`, `motion.html`, local `animatic/` |
| Opening bench still | Cycles stills exist for desktop and phone. Five earlier review notes were addressed (portrait notebook, window light, oak grain, tool silhouettes, full-resolution link). The owner then saw the pencil floating. | `build_hero.py`, `HERO.md`, `hero.html`, local `hero/` |
| Production homepage | Unchanged. Do not restructure `src/pages/index.astro` until the opening frame is accepted and the other rests exist. | `src/` |

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
```

`build_hero.py` links the matcher by executing `reel/build_matcher_exhibit.py` and stopping before its presentation-unit rescale. It does not modify that file, the studio `.blend`, or `public/`.

## Open task — seat the pencil, then stop for review

The owner said the pencil in the opening frame looks like it is floating. The current images in `hero/landscape.png` and `hero/portrait.png` still show that. `build_hero.py` has an **unrendered** edit:

- The pencil used to sit at z = 0.914, the coax height. The mat top is z = 0.906, so the barrel cleared the mat by about 5 mm and the shadow detached.
- The pencil now rests on a hexagonal flat: center z = mat top + radius × cos(30°), then rolled 30° so a flat faces down. A check prints `PENCIL_GAP_MM` and raises if the gap is outside −0.15 mm to +0.2 mm.
- The probes were lowered with it. Their center is mat top + 4.2 mm, and the finger guard radius went from 7.5 mm to 4.5 mm so the guard no longer holds the body in the air. Confirm they touch. Do not redesign the lead curves unless they intersect the bench after the drop.

Do this, in order:

1. Run `--draft`. If `PENCIL_GAP_MM` fails, fix the seating before any beauty render. The 30° roll assumes the cylinder's local +X is vertical for this axis. If a vertex is still down, the check is supposed to catch a few tenths of a millimetre of intersection.
2. Crop the pencil and both probes in the draft. The barrel casts a shadow that meets it. The sharpened tip may stay a hair off the mat. That is a real pencil. A gap under the whole barrel is not.
3. Run `--final` only after the draft contact looks right. This rewrites `hero/landscape.png`, `hero/portrait.png`, the WebP previews, `opening-bench.blend`, and `hero/render.json`.
4. Reload `hero.html` at desktop and phone width. Hide text and look at the pencil. Check the notebook is still in the phone crop and the hardware is not under the headline.
5. Add one sentence to `HERO.md` that the pencil and probes rest on the mat, and that the previous stills were replaced. Leave owner acceptance open.
6. Stop. Do not start the other stations, `build_lab.py`, or the homepage until the owner accepts this frame.

## After the opening frame is accepted

Carry the same materials, window, and bench into the other rests. Do not restyle each station separately.

1. **One lab scene.** `build_lab.py` and `lab.blend` should absorb the opening bench instead of growing a second room. Link vehicle and robot collections. The animatic proxies are not measured hardware: vehicle and robot source files are presentation-scaled (see `ANIMATIC.md` and `animatic/source-bounds.json`). Verify real size before final cameras.
2. **Personal devices.** Keychain from the KiCad board, no invented key ring. Companion enclosure from `src/assets/companion-cover.jpg` and `companion-ui.jpg`, screen actually lit.
3. **One Cycles still per rest**, landscape and a portrait composed in the same room. Judge contact, light, and continuity against the opening frame. The storyboard names the pose, copy, and scroll for each.
4. **Continuous lighting** from `world.json` `lighting.states`. The close stays at dusk.
5. **Then** the film, `world-stage.js`, and the homepage. Stage 2 splats come after the film works. The phase list in the old plan is still the right sequence: film, loader, station demos, design-token reduction, real-time upgrade, verification. None of that web work has started.

## Rules that already cost a retry

- Generated images will not draw a Smith chart. `concepts/smith_chart.py` draws one. The opening notebook chart is built the same way, in mesh. Keep it mathematical, and label the trace illustrative.
- The hero camera is the corrected southeast view, not a new composition. Phone framing translates and shifts that camera. It does not orbit.
- Matcher yaw is +5°. Do not rescale the matcher to match the concept frames. Move the camera. Source bounds are about 185 × 196 × 83 mm.
- Window light is a real opening on the west wall. Do not paint a gobo in screen space.
- "Matched." is HTML in Archivo, not text inside the render. The titled concept JPEG is not the production frame.
