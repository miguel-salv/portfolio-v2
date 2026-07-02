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
  --accent:  #bd624b;  /* Atelier coral */

  --font-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Charter", Georgia, serif;
  --font-body: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Charter", Georgia, serif;
  --font-mono: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Charter", Georgia, serif;
}

:root[data-theme="dark"] {
  --bg:      #141413;  /* Kami dark */
  --surface: #30302e;  /* warm charcoal */
  --fg:      #f5f4ed;  /* ivory ink */
  --muted:   #8f897f;  /* warm stone */
  --border:  #504e49;  /* dark rule */
  --accent:  #2d5a8a;  /* ink blue */
}
```

## Layout Posture

- Light mode is the default. Dark mode is opt-in through the nav toggle and persists across pages.
- Serif remains the only visible type family; hierarchy comes from size, spacing, rules, and accent marks rather than synthetic bold or italics.
- Use warm neutrals only. Avoid cool gray app chrome, neon effects, floating settings panels, and decorative glow fields.
- Buttons, tags, and project numbers use low radii, fine rules, and restrained press states.
- Cards use paper/bone surfaces in light mode and warm charcoal surfaces in dark mode; structure and spacing do not change between themes.
- The metal flower motif is retired. Closing visual interest should come from oversized serif type, ruled footer composition, direct contact links, and spacing.
- Motion remains document-like: short reveal transitions, mobile menu behavior, theme switching, and copy feedback only.
