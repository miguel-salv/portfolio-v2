import { PHOS8, PHOS16 } from "./phos-fonts.js";

const FONTS = { 8: PHOS8, 16: PHOS16 };

export function phosMeasure(text, size = 8, letterSpace = size === 8 ? 1 : 0, lineSpace = 2) {
  const font = FONTS[size];
  const lines = String(text).split("\n");
  const lineW = (line) => {
    if (!line.length) return 0;
    return line.length * font.size + Math.max(0, line.length - 1) * letterSpace;
  };
  return {
    w: Math.max(0, ...lines.map(lineW)),
    h: lines.length * font.size + Math.max(0, lines.length - 1) * lineSpace,
    lines,
    font,
    letterSpace,
    lineSpace,
  };
}

export function phosDraw(ctx, text, x, y, color, size = 8, letterSpace = size === 8 ? 1 : 0, lineSpace = 2) {
  const { lines, font } = phosMeasure(text, size, letterSpace, lineSpace);
  const stride = font.size / 8;
  ctx.fillStyle = color;
  lines.forEach((line, li) => {
    let cx = x;
    const cy = y + li * (font.size + lineSpace);
    for (const ch of line) {
      const idx = ch.charCodeAt(0) - 32;
      const glyph = idx >= 0 && idx < font.glyphs.length ? font.glyphs[idx] : null;
      if (glyph) {
        for (let row = 0; row < font.size; row++) {
          for (let col = 0; col < font.size; col++) {
            const byte = glyph[row * stride + (col >> 3)];
            if (byte & (1 << (7 - (col & 7)))) ctx.fillRect(cx + col, cy + row, 1, 1);
          }
        }
      }
      cx += font.size + letterSpace;
    }
  });
}

export function paintPhosCanvas(canvas, text, color, opts = {}) {
  const size = opts.size ?? 8;
  const letterSpace = opts.letterSpace ?? (size === 8 ? 1 : 0);
  const lineSpace = opts.lineSpace ?? 2;
  const align = opts.align ?? "left";
  const boxW = opts.w;
  const m = phosMeasure(text, size, letterSpace, lineSpace);
  const w = boxW ?? Math.max(1, m.w);
  const h = Math.max(1, m.h);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  let x = 0;
  if (align === "center") x = Math.floor((w - m.w) / 2);
  if (align === "right") x = w - m.w;
  phosDraw(ctx, text, x, 0, color, size, letterSpace, lineSpace);
  return m;
}
