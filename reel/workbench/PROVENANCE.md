# Portfolio workbench: shipped asset provenance

The published system contains an authored matcher opening, one continuous native-alpha engineering journey, matching native-flow action clips, and four distinct project presentations. Original CAD, KiCad files, documentary photographs, factual measurements and engineering demos are unchanged.

## Published asset families

- `matcher-{light,dark}-{landscape,portrait,phone}.webp` and their matching `-empty.webp` plates: the opening matcher workbench. Desktop2400×1500; portrait1080×1500; dedicated tall phone1080×2160. Shared camera, actual control-board layout and project schematic, connector leads, driver, physical ESD mat and laminate. Empty plates remove the matcher and recalculate its shadow/reflections.
- `journey-landscape.{webm,mov}`, `journey-reverse.{webm,mov}` and their manifests: a single421-frame,60fps,1080×810 camera film. Three devices coexist at fixed world positions. Camera parallax and a deliberate midpoint pull-back carry both bridges; there is no device-opacity crossfade or per-frame station hiding. The vehicle uses a machined assembly fixture, then the camera descends to the robot's narrow test lane.
- `vehicle-action.{webm,mov}` and `robot-action.{webm,mov}` with manifests and matching first-frame WebP posters: direct master-frame subsets80–200 and280–420 (logical source marks40–100 and140–210). No alternate camera or geometry is rendered for native document flow.
- `journey-start.webp`: direct conversion of the existing matcher film's landscape frame30, holding exactly the same open assembly as the spatial journey's first frame.
- `{vehicle,robot,companion,keychain}-scene-{landscape,portrait}.webp`: distinct, theme-independent transparent presentations. Landscape1800×1350; portrait1080×1500. Vehicle on its assembly fixture; robot on its test lane; Companion front-facing on a pale desk with its real documented screen; keychain in an illustrative macro separation above its actual schematic.

The rejected repeated generic-mat nonmatcher stills and opaque workbench films are not published. Earlier scene builders and editable masters remain only as source/reconstruction history.

## Reproduce the current publication

Blender5.2.1 LTS, Cycles/Metal, KiCad10, FFmpeg, `cwebp` and `webpmux` are used. Source photos and supplied CAD are the authority; no purchases or new photography are required.

```sh
/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli pcb export glb --force --include-tracks --include-pads --include-zones --include-silkscreen --include-soldermask -o reel/workbench/matcher-pcb.glb public/assets/projects/impedance/kicad/impedance_matcher.kicad_pcb
/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli pcb export glb --force --include-tracks --include-pads --include-zones --include-silkscreen --include-soldermask -o reel/workbench/keychain.glb public/assets/projects/keychain/kicad/kirby-committed.kicad_pcb
/Applications/Blender.app/Contents/MacOS/Blender --background --python reel/render_workbench.py -- --subject matcher
/Applications/Blender.app/Contents/MacOS/Blender --background --python reel/render_workbench.py -- --subject matcher --orientation phone
/Applications/Blender.app/Contents/MacOS/Blender --background --python reel/workbench/render_spatial_journey.py -- --preview
/Applications/Blender.app/Contents/MacOS/Blender --background --python reel/workbench/render_spatial_journey.py -- --sixty
/Applications/Blender.app/Contents/MacOS/Blender --background --python reel/workbench/render_presentation_scenes.py
python3 reel/workbench/embed_xmp.py public/assets/workbench
python3 reel/workbench/verify_production.py
```

Run KiCad exports sequentially: simultaneous exports share a temporary binary filename and can corrupt their GLB output. Optional project-relative component STEP models are not all supplied. The separate matcher control PCB is therefore the actual committed layout with the components the exporter can resolve, not a claim of a fully populated surveyed assembly.

The spatial renderer writes one packed `journey-world.blend`, three geometry libraries and captured animation matrices. Mechanism matrices are captured before source animation is frozen, then normalized by one stable transform. Station coordinates remain fixed. Original matcher materials and the four-emitter design from `reel/matcher_studio.json` are shared; light linking limits each station's task lights to its own hardware and support. Exact alpha images have no opaque page/background rectangle.

When geometry, lighting or camera direction changes, archive `.impeccable/renders/workbench/spatial/frames/` and rebuild with `--rebuild`. Resuming existing frames assumes unchanged visual inputs. Production input hashes are in `source-hashes.json`. Final public-file hashes and QA status are recorded in `MANIFEST.json`.

## Exact matcher handoff and timeline

Master frame0 is a byte-identical copy of `.impeccable/renders/matcher-film/landscape/frame_0030.png`. Geometry uses `assembly_pose(1)` from the original matcher film renderer. Camera location is(8,−12,9), aimed at the origin. Authored orthographic span8.3 is fitted by the original containment algorithm to8.829053782898447. The next60fps frame continues from that pose and camera; no second reconstruction or alternate inspection view is substituted.

Logical source timeline (30fps coordinates; encoded frame indices are doubled):0–40 matcher-to-vehicle camera travel;40–100 vehicle PCB separation and wheel motion;100–140 vehicle-to-robot travel;140–210 robot scanning and collection-arm action. Quintic easing gives continuous endpoint velocities. Bridge zoom envelopes are zero at both endpoints and reveal neighboring devices together at the midpoint. Native-flow clips are the exact corresponding master frames, not independently authored replacements.

Actual transformed mesh vertices determine rail/lane heights, avoiding the false floor offset from rotated wheel bounding boxes. Numerical checks at140/175/210 put all four tire contact points and the bottle within0.0018–0.0020 scene units of the lane. This is a render-contact check, not a measured physical dimension. Its evidence is `.impeccable/review/workbench/contact-audit.json`.

## Evidence and reconstruction limits

- **Matcher:** original `reel/models/impedance-studio.blend`, `reel/build_matcher_exhibit.py` and `reel/matcher_geometry.py`. Mounting envelopes and offset motor axes follow CAD. Capacitor plate counts/thickness, contours, hidden lugs and RF wire routes retain their documented photographic-estimation status. The same geometry is used by the existing matcher film/live renderer.
- **Vehicle:** `reel/vehicle/model.py`, `src/assets/vehicle-cover.jpg`, `vehicle-pcb.jpg` and `reel/vehicle/CHASSIS-SOURCES.md`. The observed chassis, wheels and PCB are retained. No unavailable manufacturer CAD is claimed. The presentation's PCB separation is illustrative.
- **Robot:** `reel/render_robot.py`, `reel/robot_finish.py` and `src/assets/robot-cover.jpg`. Existing scan and collection-arm animation is retained. Hidden dimensions and cable routes are inferred presentation geometry, not recovered original CAD.
- **Companion:** explicit photographic reconstruction of `src/assets/companion-cover.jpg`, preserving its pink enclosure, feet, eyes, side aperture and power lead. Exact wall dimensions and hidden mounting are unknown. Its screen is an identifiable, unaltered region of `src/assets/companion-ui.jpg` (crop1100×810 at230,190), showing the captured11:45 / Tue21 state. This is photographed UI, not live telemetry.
- **Keychain:** committed `kirby-committed.kicad_pcb` supplies outline, copper, mask, holes and silkscreen. The exporter default green/gold finish is replaced by the documented purple soldermask/silver HASL finish. Dark foot finishes and low-profile LED diffusers are photo-referenced; D1–D5 apertures follow each committed reverse-mount footprint's2.5mm optical offset. Missing supplier STEP geometry is not asserted. The separation above the actual keychain schematic is a presentation composition.
- **Supporting surfaces:** matcher laminate/ESD mat, vehicle fixture, robot test lane and Companion desk are authored physical presentation props. Printed diagrams come from real project images. No invented engineering notation or performance claims are added.

## Production quality and verification

Final stills use96 Cycles samples, adaptive threshold.025, denoising, eight bounces, AgX Medium High Contrast and WebP quality94–95. The421-frame spatial film uses48 samples at native60fps. Every odd frame is a genuinely rendered half-frame world state; the original integer poses occupy even frame indices. Logical chapter marks remain on the original30fps source timeline. VP9 carries alpha with six-frame seek spans; Apple HEVC carries native alpha with independent frames. All clips are silent. Cycles persistent data and change-only hardware transforms prevent rebuilding stationary geometry; on this Apple M2 eight-core Metal GPU, isolated production frames were roughly6–10 seconds rather than the55–100 seconds observed during simultaneous still rendering. These are offline-production timings, not browser frame-rate measurements.

Each WebP carries the production description/source in an XMP chunk, written by `embed_xmp.py` without changing image pixels, plus a `.webp.json` sidecar. Camera metadata, source/accuracy notes, samples and resolution remain machine readable. The Impeccable provenance helper's WebP sidecar fallback is supplemented by actual RIFF/XMP embedding so provenance survives an image copy.

Reviewed8-sample previews temporarily filled still paths during layout integration, with truthful preview flags. Final acceptance requires all scene paths to have96-sample metadata and no preview flag. `verify_production.py` checks that condition, native alpha, embedded metadata, video frame counts/dimensions/frame rate, audio absence, a complete master sequence and the exact original-image handoff. Source hashes and artifact hashes supplement visual comparison against the approved keypose sheet and original photographs.

## Native playback and window projection

The backward film is the exact421 forward PNGs in reverse order, with no optical-flow interpolation. `python3 reel/workbench/encode_reverse.py` reproduces it; the full spatial encode invokes this automatically. A second muted decoder loads only when reverse travel is first needed, seats the last validated world pose, then uses native frame callbacks. One visible canvas retains the previous complete frame until its replacement is validated. Paused/offscreen/hidden films have no permanent frame loop; unsupported native callbacks retain the bounded seek fallback.

During each bridge the same4:3 camera image expands continuously to the full window, then returns to its exact resting aperture. This makes the browser viewport the travel boundary and removes interior media-window amputations. Copy recedes during the expansion. The projection adaptation changes neither source hardware geometry nor world coordinates.
