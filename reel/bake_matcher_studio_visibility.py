"""Bake soft visibility for the four hero area lights on fixed live meshes.

blender --background --python reel/bake_matcher_studio_visibility.py
Four normalized bytes per vertex; no extra live shadow pass. Geometry and light
digests invalidate stale data. Moving rotors are excluded as occluders and stay
neutral, so no frozen rotor shadow is painted onto another component.
"""
from pathlib import Path
from datetime import datetime, timezone
import bpy, hashlib, json, struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'public/assets/matcher'
binary=(OUT/'assembly.bin').read_bytes()
manifest=json.loads((OUT/'assembly.json').read_text())
studio=json.loads((ROOT/'reel/matcher_studio.json').read_text())
vertices,triangles,decoded=[],[],[]
for part in manifest['parts']:
    def values(field,fmt):
        offset,count=part[field]
        return struct.unpack_from('<'+fmt*count,binary,offset)
    p,n,indices=values('positions','f'),values('normals','f'),values('indices','I')
    points=[Vector(p[i:i+3]) for i in range(0,len(p),3)]
    decoded.append((part,points,n))
    if part['group'].startswith('rotor'):continue
    start=len(vertices);vertices.extend(points)
    triangles.extend(tuple(start+v for v in indices[i:i+3]) for i in range(0,len(indices),3))
bvh=BVHTree.FromPolygons(vertices,triangles,all_triangles=True,epsilon=0)
lights=[]
for light in studio['lights']:
    position=Vector(light['position'])
    rotation=(-position).to_track_quat('-Z','Y')
    points=[]
    for y in range(4):
        for x in range(4):
            offset=Vector(((x+.5)/4-.5,(y+.5)/4-.5,0))
            offset.x*=light['width'];offset.y*=light['height']
            points.append(position+rotation@offset)
    lights.append(points)
visibility=bytearray()
for part,points,normals in decoded:
    if part['group'].startswith('rotor'):
        visibility.extend([255]*(4*len(points)));continue
    for index,point in enumerate(points):
        normal=Vector(normals[3*index:3*index+3]).normalized()
        origin=point+normal*.0025
        for samples in lights:
            visible,total=0,0
            for sample in samples:
                direction=sample-origin;distance=direction.length;direction/=distance
                # The live LTC integral already rejects the back hemisphere.
                if normal.dot(direction)<=0:continue
                total+=1
                hit,_,_,_=bvh.ray_cast(origin,direction,distance-.0025)
                if hit is None:visible+=1
            visibility.append(round(255*visible/total) if total else 255)
    print('BAKED soft studio visibility',part['group'],part['material'],flush=True)
geometry_hash=hashlib.sha256(binary).digest()
lights_hash=hashlib.sha256(json.dumps(studio['lights'],separators=(',',':')).encode()).digest()
(OUT/'studio-visibility.bin').write_bytes(b'MVS1'+geometry_hash+lights_hash+visibility)
(OUT/'studio-visibility.bin.json').write_text(json.dumps({
    'source':'reel/bake_matcher_studio_visibility.py; public/assets/matcher/assembly.bin; reel/matcher_studio.json',
    'description':'Authored 4x4 stratified soft visibility per rectangular studio light on fixed CAD vertices. Rotors receive neutral visibility and do not occlude the bake. No additional runtime shadow map or render pass.',
    'geometrySHA256':geometry_hash.hex(),'lightsSHA256':lights_hash.hex(),
    'vertices':len(visibility)//4,'samplesPerLight':16,
    'createdAt':datetime.now(timezone.utc).isoformat()
},indent=2)+'\n')
print('AUTHORED studio visibility',len(visibility)+68,'bytes',flush=True)
