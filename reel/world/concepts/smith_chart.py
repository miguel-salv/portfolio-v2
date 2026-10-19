"""Draw an accurate Smith chart with a spiral trace to the matched point.

Writes SVGs next to this file; rasterize with rsvg-convert. Used as a
reference and overlay for the concept frames, never shipped.
"""

import math
from pathlib import Path

HERE = Path(__file__).parent

R_VALUES = [0.2, 0.5, 1.0, 2.0, 5.0]
X_VALUES = [0.2, 0.5, 1.0, 2.0, 5.0]


def chart_paths(cx, cy, radius):
    """Return SVG path data for the unit circle, r circles, x arcs and the real axis."""
    s = radius
    parts = [f'<circle cx="{cx}" cy="{cy}" r="{s}"/>']
    for r in R_VALUES:
        c = r / (1 + r)
        rr = 1 / (1 + r)
        parts.append(f'<circle cx="{cx + c * s:.2f}" cy="{cy}" r="{rr * s:.2f}"/>')
    for x in X_VALUES:
        for sign in (1, -1):
            # Circle center (1, 1/x), radius 1/x; intersects unit circle at (1,0)
            # and at ((x^2-1)/(x^2+1), 2x/(x^2+1)).
            ex = (x * x - 1) / (x * x + 1)
            ey = sign * 2 * x / (x * x + 1)
            arc_r = s / x
            sweep = 1 if sign > 0 else 0
            parts.append(
                f'<path d="M {cx + s:.2f} {cy} '
                f'A {arc_r:.2f} {arc_r:.2f} 0 0 {sweep} {cx + ex * s:.2f} {cy - ey * s:.2f}"/>'
            )
    parts.append(f'<line x1="{cx - s}" y1="{cy}" x2="{cx + s}" y2="{cy}"/>')
    return "\n".join(parts)


def trace_path(cx, cy, radius, start_mag=0.86, start_deg=128.0, turns=1.6, steps=240):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mag = start_mag * (1 - t) ** 1.35
        ang = math.radians(start_deg) - 2 * math.pi * turns * t
        pts.append((cx + mag * math.cos(ang) * radius, cy - mag * math.sin(ang) * radius))
    d = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in pts)
    return d, pts[0]


def write(name, width, height, cx, cy, radius, background, grid, grid_width, trace, trace_width):
    d, start = trace_path(cx, cy, radius)
    bg = f'<rect width="100%" height="100%" fill="{background}"/>' if background else ""
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
{bg}
<defs><clipPath id="u"><circle cx="{cx}" cy="{cy}" r="{radius}"/></clipPath></defs>
<g fill="none" stroke="{grid}" stroke-width="{grid_width}" clip-path="url(#u)">
{chart_paths(cx, cy, radius)}
</g>
<circle cx="{cx}" cy="{cy}" r="{radius}" fill="none" stroke="{grid}" stroke-width="{grid_width * 1.6}"/>
<path d="{d}" fill="none" stroke="{trace}" stroke-width="{trace_width}" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="{start[0]:.2f}" cy="{start[1]:.2f}" r="{trace_width * 1.4}" fill="{trace}"/>
<circle cx="{cx}" cy="{cy}" r="{trace_width * 2.4}" fill="none" stroke="{trace}" stroke-width="{trace_width * 0.8}"/>
<circle cx="{cx}" cy="{cy}" r="{trace_width * 0.9}" fill="{trace}"/>
</svg>
"""
    (HERE / name).write_text(svg)


if __name__ == "__main__":
    # Pencil-on-paper reference for the close frame's notebook page.
    write("smith-notebook.svg", 1600, 1600, 800, 800, 680,
          "#f3efe4", "#4a4a48", 2.2, "#c8552b", 6)
    # Transparent overlay for the loader: thin graphite chart, orange trace.
    write("smith-loader.svg", 1920, 1080, 960, 540, 300,
          None, "#2b2b29", 1.1, "#d9622b", 2.6)
