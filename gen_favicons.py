import base64
from PIL import Image, ImageDraw

SRC = "assets/avatar.png"
OUT = "assets/favicons"
INK = (20, 20, 19, 255)      # #141413
BADGE_BG = (20, 20, 19, 255) # #141413

src = Image.open(SRC).convert("RGBA")

# 1. favicon-dark.png : white logo, transparent (copy of source)
src.save(f"{OUT}/favicon-dark.png")

# 2. favicon-light.png : recolor opaque pixels -> ink, keep alpha
r, g, b, a = src.split()
ink_img = Image.new("RGBA", src.size, INK)
ink_img.putalpha(a)
ink_img.save(f"{OUT}/favicon-light.png")

# helper: rounded-square badge with white logo centered
def make_badge(size, radius_ratio=0.22, pad_ratio=0.16):
    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1],
                        radius=int(size * radius_ratio), fill=255)
    bg = Image.new("RGBA", (size, size), BADGE_BG)
    badge.paste(bg, (0, 0), mask)
    # scale logo into padded area
    pad = int(size * pad_ratio)
    inner = size - 2 * pad
    logo = src.resize((inner, inner), Image.LANCZOS)
    badge.paste(logo, (pad, pad), logo)
    return badge

# 3. apple-touch-icon.png : 180x180 opaque badge
make_badge(180).save(f"{OUT}/apple-touch-icon.png")

# 4. favicon.ico : multi-size opaque badge at repo root
ico_badge = make_badge(48)
ico_badge.save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# 5. favicon.svg : embed white logo + media-query recolor
with open(SRC, "rb") as f:
    b64 = base64.b64encode(f.read()).decode("ascii")
w, h = src.size
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">'
    '<style>@media (prefers-color-scheme: light){image{filter:brightness(0)}}</style>'
    f'<image href="data:image/png;base64,{b64}" width="{w}" height="{h}"/>'
    '</svg>'
)
with open(f"{OUT}/favicon.svg", "w", encoding="utf-8") as f:
    f.write(svg)

print("Generated favicon assets.")
