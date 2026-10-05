"""Bake rotation-dependent soft studio shadows for the two capacitor rotors.

blender --background --python reel/bake_matcher_rotor_visibility.py
Thirteen poses interpolate with the actual rotor angle. Fixed geometry and the
active rotor occlude; the other rotor is excluded. No live shadow pass is added.
"""
from pathlib import Path
from math import radians
from datetime import datetime, timezone
import bpy,hashlib,json,struct
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent.parent
source=ROOT/'reel/bake_matcher_studio_visibility.py'
namespace={'__file__':str(source)}
exec(compile(source.read_text().split('visibility=bytearray()')[0],str(source),'exec'),namespace)
OUT=namespace['OUT'];binary=namespace['binary'];manifest=namespace['manifest'];studio=namespace['studio']
fixed_vertices=namespace['vertices'];fixed_triangles=namespace['triangles'];lights=namespace['lights']
angles=list(range(-180,181,30));shading=bytearray()
for part,points,normals in namespace['decoded']:
    if not part['group'].startswith('rotor'):continue
    rotor=int(part['group'][-1])-1;pivot=Vector(manifest['rotors'][rotor])
    offset,count=part['indices'];indices=struct.unpack_from('<'+'I'*count,binary,offset)
    start=len(fixed_vertices)
    own_triangles=[tuple(start+v for v in indices[i:i+3]) for i in range(0,len(indices),3)]
    for angle in angles:
        rotation=Matrix.Rotation(radians(angle),3,'Y')
        transformed=[pivot+rotation@(point-pivot) for point in points]
        bvh=BVHTree.FromPolygons(fixed_vertices+transformed,fixed_triangles+own_triangles,all_triangles=True,epsilon=0)
        for index,point in enumerate(transformed):
            normal=rotation@Vector(normals[index*3:index*3+3]).normalized();origin=point+normal*.0025
            for samples in lights:
                visible,total=0,0
                for sample in samples:
                    direction=sample-origin;distance=direction.length;direction/=distance
                    if normal.dot(direction)<=0:continue
                    total+=1
                    hit,_,_,_=bvh.ray_cast(origin,direction,distance-.0025)
                    if hit is None:visible+=1
                shading.append(round(255*visible/total) if total else 255)
        print('BAKED',part['group'],'angle',angle,flush=True)
geometry_hash=hashlib.sha256(binary).digest()
lights_hash=hashlib.sha256(json.dumps(studio['lights'],separators=(',',':')).encode()).digest()
(OUT/'rotor-visibility.bin').write_bytes(b'MVR1'+geometry_hash+lights_hash+struct.pack('<Iff',len(angles),angles[0],30)+shading)
(OUT/'rotor-visibility.bin.json').write_text(json.dumps({
    'source':'reel/bake_matcher_rotor_visibility.py; reel/bake_matcher_studio_visibility.py',
    'description':'Authored rotation-dependent 4x4 area-light visibility for live rotors. Thirteen angle poses interpolate with the displayed rotor angle; only the active rotor and fixed geometry occlude each pose. No frozen shadow on moving geometry and no extra live render pass.',
    'geometrySHA256':geometry_hash.hex(),'lightsSHA256':lights_hash.hex(),
    'anglesDegrees':angles,'createdAt':datetime.now(timezone.utc).isoformat()
},indent=2)+'\n')
print('AUTHORED moving rotor visibility',len(shading)+80,'bytes',flush=True)
