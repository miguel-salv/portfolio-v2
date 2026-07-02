# Reference Brand Spec

Source: current portfolio direction, combining the restored light Atelier paper treatment with a dark Kami document toggle.

The portfolio is light mode by default. It preserves the serif stack the user likes, a warm paper canvas, ruled document sections, low-radius cards, and restrained document motion. A theme toggle switches to the dark Kami variant, using warm charcoal, ivory text, and ink-blue accent without changing the content structure.

## Tokens

```css
:root {
  --bg:      #f4ead8;  /* warm paper */
  --surface: #fff8e9;  /* bone card */
  --fg:      #241914;  /* warm ink */
  --muted:   #765d49;  /* warm brown metadata */
  --border:  #c8ad88;  /* paper rule */
  --accent:  #bd624b;  /* Atelier coral (marks, large accents) */
  --accent-text: #9f4f3d;  /* deep coral for small text / labels (AA at 12px) */

  --font-display: "Newsreader", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --font-body: "Newsreader", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;  /* telemetry voice: metadata, dates, metrics, plate captions */
}

:root[data-theme="dark"] {
  --bg:      #141413;  /* Kami dark */
  --surface: #30302e;  /* warm charcoal */
  --fg:      #f5f4ed;  /* ivory ink */
  --muted:   #8f897f;  /* warm stone */
  --border:  #504e49;  /* dark rule */
  --accent:  #d08063;  /* coral, lightened for dark ground (single accent family across themes) */
  --accent-text: #d99277;
}
```

## Layout Posture

- Light mode is the default. Dark mode is opt-in through the nav toggle and persists across pages.
- Two type voices: Newsreader serif for editorial content (headings, prose), IBM Plex Mono for telemetry (metadata labels, dates, metric chips, plate captions, counters). Hierarchy comes from size, spacing, rules, and accent marks rather than synthetic bold or italics.
- The accent is a single coral family in both themes; dark mode lightens it rather than changing hue. The previous ink-blue dark accent is retired.
- Use warm neutrals only. Avoid cool gray app chrome, neon effects, floating settings panels, and decorative glow fields.
- Buttons, tags, and project numbers use low radii, fine rules, and restrained press states.
- Cards use paper/bone surfaces in light mode and warm charcoal surfaces in dark mode; structure and spacing do not change between themes.
- The metal flower motif is retired. Closing visual interest should come from oversized serif type, ruled footer composition, direct contact links, and spacing.
- Motion remains document-like: short reveal transitions, mobile menu behavior, theme switching, and copy feedback only.
