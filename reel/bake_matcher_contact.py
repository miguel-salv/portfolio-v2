"""Bake bounded contact shading into one byte per live CAD vertex.

Run after exporting assembly: blender --background --python reel/bake_matcher_contact.py
Only fixed meshes occlude. Moving rotors stay neutral, with no frozen rotor shadows.
No geometry, materials or source blend is modified. A geometry digest invalidates
the optional shading asset when a later export changes the assembly.
"""
from pathlib import Path
from math import pi, sqrt, cos, sin
from datetime import datetime, timezone
import bpy, hashlib, json, struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/assets/matcher'
binary = (OUT / 'assembly.bin').read_bytes()
manifest = json.loads((OUT / 'assembly.json').read_text())
vertices, triangles = [], []
decoded = []
for part in manifest['parts']:
    def values(field, fmt):
        offset, count = part[field]
        return struct.unpack_from('<' + fmt * count, binary, offset)
    positions, normals, indices = values('positions', 'f'), values('normals', 'f'), values('indices', 'I')
    points = [Vector(positions[i:i+3]) for i in range(0, len(positions), 3)]
    decoded.append((part, points, normals))
    if part['group'].startswith('rotor'):
        continue
    start = len(vertices)
    vertices.extend(points)
    triangles.extend(tuple(start + v for v in indices[i:i+3]) for i in range(0, len(indices), 3))
bvh = BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=0)

samples, radius, strength = 24, .22, .58
# Deterministic cosine-weighted hemisphere; no noisy random per-vertex bake.
directions = []
for i in range(samples):
    r = sqrt((i + .5) / samples)
    theta = i * pi * (3 - sqrt(5))
    directions.append(Vector((r * cos(theta), r * sin(theta), sqrt(1-r*r))))
shading = bytearray()
for part, points, normals in decoded:
    if part['group'].startswith('rotor'):
        shading.extend([255] * len(points))
        continue
    for index, point in enumerate(points):
        normal = Vector(normals[index*3:index*3+3]).normalized()
        rotation = Vector((0,0,1)).rotation_difference(normal)
        origin = point + normal * .0025
        occlusion = 0
        for direction in directions:
            hit, _, _, distance = bvh.ray_cast(origin, rotation @ direction, radius)
            if hit is not None:
                occlusion += (1-distance/radius)**2
        shading.append(round(255 * (1-strength*occlusion/samples)))
    print('BAKED', part['group'], part['material'], len(points), flush=True)
digest = hashlib.sha256(binary).digest()
(OUT / 'contact-shading.bin').write_bytes(b'MCA1' + digest + shading)
(OUT / 'contact-shading.bin.json').write_text(json.dumps({
    'source': 'reel/bake_matcher_contact.py; public/assets/matcher/assembly.bin',
    'description': 'Authored deterministic short-range contact shading for fixed meshes. Moving rotors are neutral and excluded from occlusion. One normalized byte per vertex; no additional texture or render pass.',
    'assemblySHA256': digest.hex(), 'vertexCount': len(shading),
    'samples': samples, 'radius': radius, 'strength': strength,
    'createdAt': datetime.now(timezone.utc).isoformat()
}, indent=2)+'\n')
print('AUTHORED contact shading', len(shading)+36, 'bytes', flush=True)
