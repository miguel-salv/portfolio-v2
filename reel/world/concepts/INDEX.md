# One-world lab: rough concept frames

Direction-only frames for the one-world lab storyboard. They are AI-generated from Miguel's own renders and photos as reference images, so device details drift. These frames never ship on the site (see `PRODUCT.md`: no generated stand-ins). They are local direction references, now allowlisted so a fresh checkout can open the storyboard.

`contact-sheet.jpg` shows all ten frames in scroll order on one image.

## Shared look brief

Appended to every prompt so the frames read as one room:

- **Room:** an engineer's electronics lab. A laminate workbench with a muted green ESD mat, a grey epoxy floor with yellow tape lanes, a corkboard wall, and a personal desk in the corner.
- **Light:** a large window on camera-left is the key light, casting soft gobo bars. Each station has its own practical lamp. Low-key and warm, with soft contact shadows and real material texture.
- **Grade:** ivory, graphite, ESD green and a steel-blue accent, with warmer evening tones at the desk.
- **Lens:** a photographic 35–50mm look with shallow but readable depth of field.
- **Format:** 16:9 cinematic product photography. No UI text in the image unless the frame calls for its headline.

Prompt suffix used verbatim:

> Setting: one engineer's electronics lab. Laminate workbench with a muted green ESD mat, grey epoxy floor with yellow tape lanes, corkboard wall, personal desk in the corner. Lighting: large window on camera-left is the key light, casting soft bars of window light (gobo shadows); each station has a small practical lamp; low-key, warm, soft contact shadows, real material texture. Color grade: ivory, graphite, muted ESD green, steel-blue accent. Photographic 35-50mm lens look, shallow but readable depth of field. Cinematic product photography, 16:9, photoreal, no text, no logos, no watermarks.

## Frames in scroll order

Scroll percentages assume about 11 screens of travel and are a first budget, not final.

| # | File | Beat | Scroll | Camera | Carrier into next beat | Text placement |
|---|------|------|--------|--------|------------------------|----------------|
| 1 | `world-01-loader.jpg` | Loader | before 0% | Locked on the hero pose, behind an ivory veil | The orange trace reaching center dissolves the veil into the hero | None. The chart is the loader. |
| 2 | `world-02-hero-a.jpg` / `world-02-hero-b.jpg` | Station A, hero | 0–8% | Top-down over the bench | The notebook's half-finished trace leads the eye to the matcher | Headline on the open mat, upper-left |
| 3 | `world-03-matcher.jpg` | Station A, matcher | 8–18% | Descends to about 30°, closes in on the capacitor plates | Coax cable slides off the bench edge | Left third, over the dark out-of-focus bench |
| 4 | `world-04-tilt.jpg` | Move A to B | 18–24% | Whip-tilt past the bench edge to the floor | The falling coax lands by the vehicle | None, it's a move |
| 5 | `world-05-vehicle.jpg` | Station B, vehicle floor | 24–39% | Wheel height on the epoxy floor, tracking along the tape lane | The vehicle drives out of frame toward the tile grid | Upper-left, over the floor and window glow |
| 6 | `world-06-robot.jpg` | Station C, robot lane | 39–56% | Knee height, three-quarter on the tile grid | The lifted bottle; the camera cranes up with it | Right third, over the empty floor |
| 7 | `world-07-desk.jpg` | Station D, personal desk (evening) | 56–75% | Desk height, lamp-lit, the room behind at dusk | Lamp light spills right onto the corkboard | Right half, over the dim room; live Companion UI and LED demos anchored to the devices |
| 8 | `world-08-wall.jpg` | Station E, pinboard wall | 75–92% | Straight-on pan across the cork | The pinned Smith-chart sheet; pull back toward the bench | About and Career panels beside the board; the real portrait is captioned as real |
| 9 | `world-09-close-titled.jpg` (`world-09-close.jpg` without text) | Close, back at A | 92–100% | High wide pull-back over the whole bench, the other stations visible behind | None, it's the end | "Matched." plus Email and Resume, upper-left, set in Archivo 500 and Plex Mono |

## Smith-chart motif

`smith_chart.py` draws an accurate chart (constant-resistance circles, constant-reactance arcs, spiral trace) as SVG, and `rsvg-convert` turns it into `smith-notebook.png` and `smith-loader.png`. The image model drew a sketch labeled "SMITH" three times instead of a chart, so the real chart is used as a reference image for the hero and the close, and as an exact overlay for the loader. The motif runs through three beats:

1. Loader: the trace spirals all the way to center.
2. Hero: on the notebook, the trace is only partway in, so tuning is still in progress.
3. Close: on the notebook, the trace sits at center ("Matched.").

## How each frame was made

- Frames 2–8: generated, chaining the previous frame as the room reference along with the device's own render or photo. The references were `landscape-machine.webp`, `portrait-machine.webp`, `landscape-capacitors.webp`, the vehicle and robot catalogue posters, `companion-cover.jpg`, `keychain-led-1.jpg`, `portrait.jpg` and the three logo PNGs.
- Frame 9: generated from hero A plus the Smith-chart reference. The headline is typeset with ImageMagick in the site's own Archivo and IBM Plex Mono (converted from `public/assets/fonts/*.woff2`), not AI lettering.
- Frame 1: a composite rather than a generation. It's the chosen hero, blurred and under a 62% `#f6f2e9` veil, with the exact Smith-chart overlay on top. `world-01-loader-b.jpg` is the same build over hero B. To rebuild it after the hero changes:

```sh
magick world-02-hero-a.jpg -resize 1920x1080^ -gravity center -extent 1920x1080 -blur 0x20 \
  \( -size 1920x1080 xc:'#f6f2e9' -alpha set -channel A -evaluate set 62% +channel \) -composite \
  smith-loader.png -composite -quality 92 world-01-loader.jpg
```

## Review: retries and remaining drift

Retries (each frame got at most one):

- **Hero A and B:** retried so the notebook shows a real Smith chart. B was regraded from the new A, so the pair differs only in light.
- **Matcher:** retried for shallow depth of field and clean negative space on the left.
- **Tilt:** retried for motion blur and a carrier object. The coax now drops off the bench edge.
- **Close:** the first attempt rendered the headline area as a flat dark slab with a hard edge. The retry shows the whole room behind the bench (corkboard, desk with the Companion, tape lane).

Remaining drift, accepted for rough frames:

- **Continuity holds:** the window is camera-left in every daytime frame, the green grid mat and wood bench recur, and the matcher bench appears in the background of the vehicle, robot, desk and close frames. The vehicle is parked in the robot frame and visible again at the desk.
- **Bench scale:** the bench shrinks to a small table with grey drawers in the floor frames (5 and 6). In the real build, one `lab.blend` fixes this.
- **Matcher:** recognizable throughout (blue controller and OLED, open box, stacked plates, steppers). The capacitor plate count and the controller's slot pattern vary from frame to frame.
- **Hero notebook:** the chart outline is drawn in orange rather than graphite.
- **Tilt:** the falling coax has a connector on both ends.
- **Robot:** the arms hold the bottle high and slightly unnaturally. The wheel, motor-mount and board layout match the poster.
- **Desk:** the Companion's screen mouth is dark rather than glowing. The keychain grew a key ring that the real one doesn't have.
- **Wall:** the portrait likeness is close but not exact. The final site uses the real photo. The CMU card shows an invented seal instead of the real wordmark, the Hacker Fab mark is approximate, and the pinned "Smith chart" is a sketch again.
- **Close:** the notebook sits left of center rather than dead center.
- **Bench-to-floor move:** the frames use the falling coax as the carrier. The one-world plan had the vehicle driving off the bench edge. Pick one before the storyboard.

## Decisions

1. **Hero:** A, cool morning. The loader is `world-01-loader.jpg` (built over hero A), and the day runs from morning at the bench to evening at the desk.
2. **Bench-to-floor carrier:** the coax drop, as drawn in frame 4. This replaces the plan's "vehicle drives off the bench edge."
3. **Close:** keep the wide pull-back, shortened to about 8% of the scroll. It's the only shot that shows every station at once, so it stays as a brief reveal rather than a long camera move. The 8% this frees goes to the stations: +3% each to the vehicle, robot and desk, with the wall giving back 1%. The table above already uses this budget.
