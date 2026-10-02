# Portfolio upgrade plan

Reference research: October 1, 2026. This is a proposal, not an implemented redesign or an Awwwards score prediction.

## Recommendation

Build an interactive engineering exhibition around **inspect the machine → operate it → see the result**. Keep the warm workshop identity and static hero. Make the featured projects demonstrate Miguel's engineering, rather than primarily displaying models next to descriptions.

The current site has real substance: custom hardware, actual build photographs, CAD, working browser demonstrations, technical writeups, and measured results. Its presentation still undersells that substance. The hero is more composed than the project stage; the three featured chapters repeat nearly the same composition; technical proof is small; the tuner is separated from the matcher chapter; and the later page settles into familiar photo grids and resume-style rows. These are the main creative gaps, not a lack of more decorative animation.

## Specific references and what they teach

All four references were found on or confirmed in the [Awwwards Developer gallery](https://www.awwwards.com/websites/developer/). Observations below come from the live sites, not just gallery thumbnails.

### Seasats — the closest subject-matter reference

[Live site](https://www.seasats.com/) · [Awwwards entry](https://www.awwwards.com/sites/seasats)

Observed: a large environmental vessel hero, colored chapter navigation, a Lightfish product sequence that changes scale and framing, a close-up paired with explanatory copy, and real operational footage placed over the model. Product selectors remain available. Its page also exposes payload configuration and an X-ray control; the X-ray action did not complete in this browser session, so its resulting effect is not verified.

Why it feels more complete: the same vessel becomes an object, a mechanism, and evidence of a deployed product. Materials, reflections, camera composition, and real footage reinforce one another.

Our gap: the matcher stage presents a relatively small model with flat surfaces and a hard shadow, alongside a small build photograph. Most of the screen carries little new information as the visitor inspects it.

Adaptation: keep the shared three-project stage, add project-specific close-ups and component explanations, and give actual hardware photographs a substantial reveal. Use verified existing assets before requesting any new footage.

### USAvionix — explanation integrated into the scene

[Live site](https://www.usavionix.com/) · [Awwwards entry](https://www.awwwards.com/sites/usavionix)

Observed: scrolling changes the aircraft from an angled hero view into an overhead specifications view. Leader lines connect VTOL architecture, sensors, compute, and speed to the aircraft. A subsequent swarm chapter turns the scene into a system diagram with multiple aircraft and connections.

Why it feels more ambitious: motion changes the meaning of the visual. The aircraft does explanatory work rather than serving as an animated illustration beside unrelated copy.

Our gap: our chapter changes mostly replace the object, color, description, and metrics. The important relationships—RF feedback, scheduling, vision to actuation—remain elsewhere in the writeups or demos.

Adaptation: concise annotations anchored to real parts, and one diagram or interaction per machine. Borrow the explanatory choreography, not its military scenery, simulated threat telemetry, or dark identity.

### Jesper Landberg — continuity between browsing and detail

[Live site](https://jesperlandberg.com/) · [Awwwards entry](https://www.awwwards.com/sites/jesper-landberg-4)

Observed: featured work sits in a curved spatial gallery above a perspective grid. Selecting Casa Di Solare opens a large white project panel within that gallery context; neighboring projects remain visible around it. The Awwwards entry specifically highlights home-to-detail, project-to-project, and home-to-profile transitions.

Why it feels deliberate: navigation is part of the designed experience. The visitor keeps a sense of where the selected work came from.

Our gap: we already have a photo handoff and native project routes, but the homepage's CAD presentation and the case study's photographic reading layout feel like distinct presentation modes. The transition alone cannot unify them.

Adaptation: keep the existing Astro router and image handoff. Give stage previews and case-study heroes matching image crops, chapter identity, and entry hierarchy. Preserve useful return position and develop the next-project continuation. Do not copy the curved gallery; hardware inspection is a more fitting signature for Miguel.

### Léo Parpeix — personality carried through the whole site

[Live site](https://www.leoparpeix.com/) · [Awwwards entry](https://www.awwwards.com/sites/leo-parpeix-portfolio-2026)

Observed: a moustached daisy is the focal object in the workshop opening. The flower identity reappears in the about imagery and playful interaction prompts. The credits describe the character as the concept tying the portfolio together.

Why it feels personal: the material world and the recognizable motif belong to its creator, rather than simply illustrating a profession.

Our gap: the warm light, serif type, and models establish a tasteful workshop, but they are not yet a distinctive visual language that persists through the tuner, independent builds, biography, and close.

Adaptation: make an actual circuit/control-loop language the recurring motif: real PCB traces and component callouts, a tuning path, and the LED chase. Each recurrence must connect to the work being shown. Avoid a stock circuit background or adopting someone else's character.

## Implementation order

### 1. Build one complete flagship matcher chapter

Implemented October 1, 2026: Machine, Inside, Tune, and In the lab modes; photo-referenced capacitor plates; model rotors linked to the existing tuner; substantial deployed-build photography. The scoped independent finish review returned **ship**. All 52 tests, Astro check and production build pass. The remaining steps below are future work.

This is the first implementation slice and the largest expected improvement.

- Retain direct chapter navigation and the smooth shared-stage handoff.
- Introduce a clear whole-device view and an optional inspection view focused on the capacitors, motors, sensing, and controller. Map labels to verified geometry; use a real photo or schematic where the model cannot faithfully show a detail.
- Bring the existing tuner into the matcher experience. Let the visitor detune, run the modeled control loop, and see the capacitor positions, search path, and VSWR change together.
- Visually distinguish the browser demonstration's result from the deployed hardware's measured ~1.2 VSWR result. Keep that explanation compact and contextual, not as a model disclaimer.
- Follow with a large real-build/deployed-photo reveal and a clear case-study entry.
- Make inspection and tuning optional. A visitor should understand the project and open its case study without completing an animation or demo.

Done when: the visitor can identify the problem, the mechanism, and the actual result in one chapter; interaction teaches something; and the stage works in reverse as well as forward. Do not extend the homepage into a long mandatory scroll presentation.

Primary files: `src/components/SelectedWork.astro`, `src/components/MatcherBench.astro`, `src/scripts/project-journey.js`, `src/scripts/instrument.js`, `src/styles/workshop-stage.css`.

### 2. Raise the visual quality of the hardware assets

Coordinate this with the matcher chapter before expanding to the other projects.

- Unify hero and chapter lighting, shadows, camera perspective, and scale.
- Improve metal, PCB, plastic, screen, and fastener materials using the actual build photographs. Preserve the geometry's factual limitations.
- Produce whole-device and selected detail compositions from existing CAD/render sources. An exploded view is conditional on separable, truthful components; it is not a promised effect before inspecting the model.
- Match photo crops and tonal treatment across models and real hardware. Avoid aggressive retouching that erases the physical build.
- Keep the hero completely static, with no random supports or architectural wall edges.

Done when: chapter assets have the same level of visual intention as the hero, and photographs feel integral rather than supplemental thumbnails.

Primary files: the existing `reel/` render scripts and model sources, `public/assets/stories/`, and `public/assets/workshop/`.

### 3. Give the vehicle and robot their own technical experiences

Use the flagship's interaction rules, but not identical content arrangements.

- Vehicle: connect board and sensor/motor views to a compact real-time scheduling demonstration, reusing the existing RTOS demo. Highlight timing and control relationships, with illustrative timing clearly identified.
- Robot: connect vision detection to UART communication and motor/arm response, reusing the existing CV demonstration. Use actual chassis and wiring photos to establish the physical system.
- Give each project a distinct close-up, technical reveal, and result emphasis within one continuous navigation system.
- Keep photo zoom, link arrows, focus feedback, and direct project links. Restoring feedback is useful; hover-dependent content is not sufficient for touch or keyboard visitors.

Done when: the three machines have three memorable mechanisms, while still feeling like one exhibition.

Primary files: `SelectedWork.astro`, `project-journey.js`, `workshop-stage.css`, and the existing `src/scripts/demos/vehicle-rtos/` and `robot-cv/` modules.

### 4. Carry the identity through the rest of the homepage

- Compose the companion and keychain as a small operable workbench, keeping their real photographs and existing wake/LED interactions. Their enclosure/interface and tiny analog circuit should each receive an appropriate scale and emphasis.
- Vary the page rhythm: large hardware compositions, compact technical explanations, photographic evidence, and generous pauses. Reduce repeated large serif headings with italic second lines.
- Give the about section more human presence using existing portrait assets and first-person context supported by the current content.
- Tighten career entries into scannable contribution/outcome summaries, preserving every employer, date, role, and factual claim. Keep detailed evidence available.
- Make the hiring close visually intentional and direct, with email, resume, and May 2027 availability easy to find.

Done when: the identity survives beyond the first three projects and a hiring reader can still move quickly.

### 5. Strengthen the case-study experience and route continuity

- Retain readable long-form text, native chapter links, source links, real-photo heroes, and functional demos.
- Add prominent system diagrams and annotated photo details at the point they clarify a design decision, rather than surrounding every paragraph with visual effects.
- Bring challenge, Miguel's contribution, key tradeoff, and measured outcome earlier in each case study.
- Match homepage previews to case-study hero crops and chapter treatment, then refine the existing handoff and next-project flow. Do not rebuild routing merely to add motion.

Done when: project detail deepens the exhibition rather than switching to a generic report, while remaining readable and linkable.

### 6. Validate creative work and technical quality together

The gallery's Developer label is an award filter, not just a collection of programmer portfolios. The reference entries list developer assessment areas including semantics/SEO, animation/transitions, accessibility, web performance, responsive design, and markup/meta-data. [Evaluation system](https://www.awwwards.com/about-evaluation/)

- Inspect desktop, the user's medium-width browser, and phone layouts together; specifically cover 390, 692, and 1440px widths and short screens.
- Treat touch as an intentional version: readable component detail and tap controls, natural scrolling, no mandatory desktop pinning, and no hover-only explanations.
- Preserve keyboard operation, visible focus, reduced motion, no-script/static fallbacks, both themes, and back-navigation position.
- Measure production performance before and after, including LCP, INP, CLS, initial asset transfer, and offscreen resource use. Target the current Core Web Vitals good thresholds after verifying official guidance during implementation; do not claim field performance from a local test.
- Prefer rendered media plus HTML/SVG explanations. Introduce live 3D only if it materially improves inspection and fits a measured loading/rendering budget. Lazy-load optional experiences and pause work offscreen.
- Run the repository's relevant build, type checks, and existing tests. Add new tests only for meaningful interaction/state risks.

## Decisions already settled

- No mockup approval round is required; the user has waived it.
- The hero remains static.
- Preserve the warm workshop identity, truthful content, all five projects, and actual hardware imagery.
- Retain smooth movement between the three featured projects and useful hover/focus feedback.
- No visible 3D-model disclaimers, random pillars, or finite wall edge in the hero.
- This proposal does not authorize deployment or award submission.

## Evidence and limits

The live homepage, matcher stage, independent-build section, career section, and matcher case-study entry were inspected alongside the four live references. This is reference-led upgrade planning, not an isolated heuristic audit or a formal jury assessment. Browser research does not establish other sites' actual performance or accessibility quality.

Saved comparison captures:

- [Current matcher stage](.impeccable/review/awwwards-current-stage.png)
- [Seasats detail framing](.impeccable/review/awwwards-seasats-detail.png)
- [USAvionix component annotations](.impeccable/review/awwwards-usavionix-annotations.png)
- [Jesper project panel](.impeccable/review/awwwards-jesper-project.png)

The first milestone should be the finished matcher chapter, not another whole-site reskin. It will establish whether this direction produces the meaningful jump in personality, technical expression, and finish the user is asking for.
