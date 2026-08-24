#!/usr/bin/env python3
"""Extract Night Popstar LVGL bitmaps and phosphor fonts into the companion demo."""
from __future__ import annotations

import re
import struct
import zlib
from pathlib import Path

KIRBY = Path("/Users/miguelsalvacion/Documents/School/3 Spring/24672/PS7/Kirby Code")
OUT = Path("/Users/miguelsalvacion/Documents/portfolio-v2/public/assets/demos/companion")
JS = Path("/Users/miguelsalvacion/Documents/portfolio-v2/src/scripts/demos/companion/phos-fonts.js")

CF_TRUE = "LV_IMG_CF_TRUE_COLOR"
CF_ALPHA = "LV_IMG_CF_TRUE_COLOR_ALPHA"


def rgb565(lo: int, hi: int) -> tuple[int, int, int]:
    c = lo | (hi << 8)
    r = (c >> 11) & 0x1F
    g = (c >> 5) & 0x3F
    b = c & 0x1F
    return (r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)


def parse_hex_bytes(block: str) -> bytes:
    return bytes(int(x, 16) for x in re.findall(r"0x([0-9a-fA-F]{2})", block))


def parse_arrays(text: str) -> dict[str, bytes]:
    arrays = {}
    for name, body in re.findall(
        r"static const uint8_t (\w+)\[\] = \{([^}]+)\}",
        text,
        flags=re.S,
    ):
        arrays[name] = parse_hex_bytes(body)
    return arrays


def parse_descs(text: str) -> dict[str, tuple[str, int, int]]:
    descs = {}
    for name, cf, w, h in re.findall(
        r"static const lv_img_dsc_t (\w+) = \{\s*"
        r"#if LV_BIG_ENDIAN_SYSTEM.*?\#else\s*"
        r"\{(LV_IMG_CF_[A-Z_]+), 0, 0, (\d+), (\d+)\}",
        text,
        flags=re.S,
    ):
        descs[name] = (cf, int(w), int(h))
    return descs


def decode_image(data: bytes, cf: str, w: int, h: int) -> bytes:
    out = bytearray(w * h * 4)
    if cf == CF_ALPHA:
        bpp = 3
        for i in range(w * h):
            lo, hi, a = data[i * bpp : i * bpp + 3]
            r, g, b = rgb565(lo, hi)
            o = i * 4
            out[o : o + 4] = bytes((r, g, b, a))
    else:
        bpp = 2
        for i in range(w * h):
            lo, hi = data[i * bpp : i * bpp + 2]
            r, g, b = rgb565(lo, hi)
            o = i * 4
            out[o : o + 4] = bytes((r, g, b, 255))
    return bytes(out)


def write_png(path: Path, w: int, h: int, rgba: bytes) -> None:
    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + rgba[y * w * 4 : (y + 1) * w * 4] for y in range(h))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def extract_images() -> None:
    sources = {
        "kirby_sprite.h": {
            "kirby_spr_idle": "kirby-idle.png",
            "kirby_spr_blink": "kirby-blink.png",
            "kirby_spr_wave": "kirby-wave.png",
            "kirby_spr_wave2": "kirby-wave2.png",
            "kirby_spr_inhale": "kirby-inhale.png",
            "kirby_spr_squash": "kirby-squash.png",
            "warp_star_spr": "warp-star.png",
            "wx_sun_spr": "wx-sun.png",
            "wx_rain_spr": "wx-rain.png",
            "wx_wind_spr": "wx-wind.png",
            "wx_snow_spr": "wx-snow.png",
            "wx_cloud_spr": "wx-cloud.png",
            "wx_sun_spr32": "wx-sun32.png",
            "wx_rain_spr32": "wx-rain32.png",
            "wx_wind_spr32": "wx-wind32.png",
            "wx_snow_spr32": "wx-snow32.png",
            "wx_cloud_spr32": "wx-cloud32.png",
            "chev_up_spr": "chev-up.png",
            "chev_dn_spr": "chev-dn.png",
        },
        "phos_floor.h": {
            "phos_cloud_hero": "cloud-hero.png",
            "phos_cloud_medium": "cloud-medium.png",
            "phos_cloud_small": "cloud-small.png",
        },
        "phos_digits.h": {
            "phos_d0": "digit-0.png",
            "phos_d1": "digit-1.png",
            "phos_d2": "digit-2.png",
            "phos_d3": "digit-3.png",
            "phos_d4": "digit-4.png",
            "phos_d5": "digit-5.png",
            "phos_d6": "digit-6.png",
            "phos_d7": "digit-7.png",
            "phos_d8": "digit-8.png",
            "phos_d9": "digit-9.png",
            "phos_ddash": "digit-dash.png",
            "phos_colon": "digit-colon.png",
            "phos_dot": "digit-dot.png",
        },
        "phos_sky.h": {
            "phos_sky": "sky.png",
        },
    }
    map_alias = {
        "kirby_spr_idle": "kirby_idle_map",
        "kirby_spr_blink": "kirby_blink_map",
        "kirby_spr_wave": "kirby_wave_map",
        "kirby_spr_wave2": "kirby_wave2_map",
        "kirby_spr_inhale": "kirby_inhale_map",
        "kirby_spr_squash": "kirby_squash_map",
        "warp_star_spr": "warp_star_map",
        "wx_sun_spr": "wx_sun_map",
        "wx_rain_spr": "wx_rain_map",
        "wx_wind_spr": "wx_wind_map",
        "wx_snow_spr": "wx_snow_map",
        "wx_cloud_spr": "wx_cloud_map",
        "wx_sun_spr32": "wx_sun32_map",
        "wx_rain_spr32": "wx_rain32_map",
        "wx_wind_spr32": "wx_wind32_map",
        "wx_snow_spr32": "wx_snow32_map",
        "wx_cloud_spr32": "wx_cloud32_map",
        "chev_up_spr": "chev_up_map",
        "chev_dn_spr": "chev_dn_map",
        "phos_cloud_hero": "phos_cloud_hero_map",
        "phos_cloud_medium": "phos_cloud_medium_map",
        "phos_cloud_small": "phos_cloud_small_map",
        "phos_d0": "phos_d0_map",
        "phos_d1": "phos_d1_map",
        "phos_d2": "phos_d2_map",
        "phos_d3": "phos_d3_map",
        "phos_d4": "phos_d4_map",
        "phos_d5": "phos_d5_map",
        "phos_d6": "phos_d6_map",
        "phos_d7": "phos_d7_map",
        "phos_d8": "phos_d8_map",
        "phos_d9": "phos_d9_map",
        "phos_ddash": "phos_ddash_map",
        "phos_colon": "phos_colon_map",
        "phos_dot": "phos_dot_map",
        "phos_sky": "phos_sky_map",
    }

    for header, items in sources.items():
        text = (KIRBY / "main" / "ui" / header).read_text()
        arrays = parse_arrays(text)
        descs = parse_descs(text)
        for dsc_name, filename in items.items():
            cf, w, h = descs[dsc_name]
            raw = arrays[map_alias[dsc_name]]
            rgba = decode_image(raw, cf, w, h)
            dest = OUT / filename
            write_png(dest, w, h, rgba)
            print(f"{filename:22} {w}x{h} {cf} -> {dest.stat().st_size} bytes")


def parse_font(path: Path, size: int) -> list[list[int]]:
    text = path.read_text()
    match = re.search(r"static LV_ATTRIBUTE_LARGE_CONST const uint8_t glyph_bitmap\[\] = \{([^}]+)\}", text, re.S)
    if not match:
        raise SystemExit(f"no glyph_bitmap in {path}")
    data = parse_hex_bytes(match.group(1))
    stride = size // 8
    row_bytes = size * stride
    glyphs = []
    # skip reserved glyph 0; ASCII 32-126 is 95 glyphs
    for i in range(95):
        start = i * row_bytes
        glyphs.append(list(data[start : start + row_bytes]))
    return glyphs


def write_fonts() -> None:
    g8 = parse_font(KIRBY / "main" / "ui" / "phos_font_8.c", 8)
    g16 = parse_font(KIRBY / "main" / "ui" / "phos_font_16.c", 16)

    def dump(name: str, size: int, glyphs: list[list[int]]) -> str:
        rows = ",\n".join("  [" + ",".join(str(b) for b in g) + "]" for g in glyphs)
        return f"export const {name} = {{\n  size: {size},\n  glyphs: [\n{rows}\n  ],\n}};\n"

    JS.write_text(
        "/* Autogenerated from firmware phos_font_8.c / phos_font_16.c. Do not edit. */\n"
        + dump("PHOS8", 8, g8)
        + "\n"
        + dump("PHOS16", 16, g16)
    )
    print(f"wrote {JS}")


if __name__ == "__main__":
    extract_images()
    write_fonts()
