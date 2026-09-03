"""Small dependency-free RGBA PNG compositor used for exact-color posters."""

from pathlib import Path
import struct
import zlib


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _chunks(data):
    offset = len(PNG_SIGNATURE)
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        yield kind, payload
        offset += 12 + length


def _paeth(a, b, c):
    estimate = a + b - c
    pa = abs(estimate - a)
    pb = abs(estimate - b)
    pc = abs(estimate - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _decode_rgba(path):
    data = Path(path).read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"Not a PNG: {path}")
    ihdr = None
    compressed = bytearray()
    for kind, payload in _chunks(data):
        if kind == b"IHDR":
            ihdr = payload
        elif kind == b"IDAT":
            compressed.extend(payload)
    if ihdr is None:
        raise ValueError(f"PNG has no IHDR: {path}")
    width, height, depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", ihdr)
    if (depth, color_type, compression, filtering, interlace) != (8, 6, 0, 0, 0):
        raise ValueError(
            f"Expected non-interlaced 8-bit RGBA PNG, got depth={depth}, "
            f"color_type={color_type}, interlace={interlace}"
        )
    raw = zlib.decompress(bytes(compressed))
    stride = width * 4
    previous = bytearray(stride)
    rows = []
    cursor = 0
    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        source = raw[cursor : cursor + stride]
        cursor += stride
        row = bytearray(stride)
        for index, value in enumerate(source):
            left = row[index - 4] if index >= 4 else 0
            above = previous[index]
            upper_left = previous[index - 4] if index >= 4 else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = above
            elif filter_type == 3:
                predictor = (left + above) // 2
            elif filter_type == 4:
                predictor = _paeth(left, above, upper_left)
            else:
                raise ValueError(f"Unsupported PNG filter {filter_type}")
            row[index] = (value + predictor) & 0xFF
        rows.append(row)
        previous = row
    return width, height, rows


def _chunk(kind, payload):
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def composite_rgba_png(source, destination, background):
    """Alpha-composite an RGBA PNG over an exact 8-bit sRGB background."""
    width, height, rows = _decode_rgba(source)
    red, green, blue = background
    scanlines = bytearray()
    for row in rows:
        scanlines.append(0)
        for index in range(0, len(row), 4):
            alpha = row[index + 3]
            inverse = 255 - alpha
            # Rounded integer source-over in encoded sRGB, preserving exact
            # background bytes wherever the transparent render has alpha=0.
            scanlines.extend(
                (
                    (row[index] * alpha + red * inverse + 127) // 255,
                    (row[index + 1] * alpha + green * inverse + 127) // 255,
                    (row[index + 2] * alpha + blue * inverse + 127) // 255,
                )
            )
    output = (
        PNG_SIGNATURE
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + _chunk(b"sRGB", b"\x00")
        + _chunk(b"IDAT", zlib.compress(bytes(scanlines), level=9))
        + _chunk(b"IEND", b"")
    )
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(output)

