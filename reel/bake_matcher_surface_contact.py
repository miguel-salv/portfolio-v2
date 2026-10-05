"""Bake pose-aware indirect contact shading into the surface shadow islands.

blender --background --python reel/bake_matcher_surface_contact.py
Uses the unchanged assembly, UV island layout and thirteen shaft angles.
Output is lossless run-length encoded scalar data, not another render pass.
"""
from pathlib import Path
from math import pi, sqrt, cos, sin
import bpy, json, hashlib, struct, gzip
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parent.parent
source=ROOT/'reel/bake_matcher_shadow_detail.py'
namespace={'__file__':str(source)}
exec(compile(source.read_text().split('fixed_bvh=')[0],str(source),'exec'),namespace)
globals().update({name:namespace[name] for name in ['OUT','binary','manifest','fixed_vertices','fixed_triangles','Vector','Matrix','BVHTree','radians']})
metadata=json.loads((OUT/'shadow-detail.json').read_text())
directions=[]
for i in range(24):
    r=sqrt((i+.5)/24);theta=i*pi*(3-sqrt(5))
    directions.append(Vector((r*cos(theta),r*sin(theta),sqrt(1-r*r))))

def bake(items,width,height,bvh,angle=0,rotor=None):
    data=bytearray([255])*(width*height)
    rotation=Matrix.Rotation(radians(angle),3,'Y')
    pivot=Vector(manifest['rotors'][rotor]) if rotor is not None else None
    for item in items:
        part,points,normals=namespace['namespace']['decoded'][item['part']]
        offset,count=part['indices'];ids=struct.unpack_from('<III',binary,offset+item['triangle']*12)
        triangle=[points[i] for i in ids];ns=[Vector(normals[i*3:i*3+3]) for i in ids]
        if pivot is not None:
            triangle=[pivot+rotation@(p-pivot) for p in triangle];ns=[rotation@n for n in ns]
        side=item['size'];denominator=side-5
        for y in range(side):
            for x in range(side):
                u=max(0,min(1,(x-2)/denominator));v=max(0,min(1,(y-2)/denominator))
                if u+v>1:u,v=u/(u+v),v/(u+v)
                w=1-u-v;point=triangle[0]*w+triangle[1]*u+triangle[2]*v
                normal=(ns[0]*w+ns[1]*u+ns[2]*v).normalized()
                hemisphere=Vector((0,0,1)).rotation_difference(normal);origin=point+normal*.0005
                occlusion=0
                for direction in directions:
                    hit,_,_,distance=bvh.ray_cast(origin,hemisphere@direction,.22)
                    if hit is not None:occlusion+=(1-distance/.22)**2
                data[(item['y']+y)*width+item['x']+x]=round(255*(1-.92*occlusion/len(directions)))
    return data

fixed=metadata['fixed'];moving=metadata['rotors']
bvh=BVHTree.FromPolygons(fixed_vertices,fixed_triangles,all_triangles=True,epsilon=0)
data=bake(fixed['tiles'],fixed['width'],fixed['height'],bvh)
print('BAKED fixed surface contact',flush=True)
for angle in moving['angles']:
    layer=bytearray([255])*(moving['width']*moving['height'])
    for rotor in range(len(manifest['rotors'])):
        items=[item for item in moving['tiles'] if manifest['parts'][item['part']]['group']==f'rotor{rotor+1}']
        rotation=Matrix.Rotation(radians(angle),3,'Y');pivot=Vector(manifest['rotors'][rotor])
        vertices=list(fixed_vertices);triangles=list(fixed_triangles)
        for part,points,normals in namespace['namespace']['decoded']:
            if part['group']!=f'rotor{rotor+1}':continue
            start=len(vertices);vertices.extend(pivot+rotation@(p-pivot) for p in points)
            offset,count=part['indices'];indices=struct.unpack_from('<'+'I'*count,binary,offset)
            triangles.extend(tuple(start+i for i in indices[j:j+3]) for j in range(0,count,3))
        bvh=BVHTree.FromPolygons(vertices,triangles,all_triangles=True,epsilon=0)
        own=bake(items,moving['width'],moving['height'],bvh,angle,rotor)
        for item in items:
            for y in range(item['size']):
                start=(item['y']+y)*moving['width']+item['x'];end=start+item['size']
                layer[start:end]=own[start:end]
    data.extend(layer);print('BAKED rotor surface contact',angle,flush=True)
encoded=bytearray();i=0
while i<len(data):
    value=data[i];count=1
    while i+count<len(data) and data[i+count]==value and count<65535:count+=1
    encoded.extend(struct.pack('<HB',count,value));i+=count
layout_hash=hashlib.sha256((OUT/'shadow-detail.json').read_bytes()).digest()
output=b'MAC1'+layout_hash+struct.pack('<I',len(data))+encoded
compressed=gzip.compress(output,mtime=0)
(OUT/'surface-contact.bin.gz').write_bytes(compressed)
(OUT/'surface-contact.bin.gz.json').write_text(json.dumps({
    'source':'reel/bake_matcher_surface_contact.py; public/assets/matcher/shadow-detail.json',
    'description':'Authored short-range indirect visibility at shadow-island texels. Twenty-four deterministic hemisphere rays, 0.22 radius, 0.92 occlusion strength. Moving plates use the same thirteen shaft-angle poses. Gzip-wrapped lossless uint16 run length / uint8 value encoding; digest tied to the complete island layout.',
    'layoutSHA256':layout_hash.hex(),'decodedBytes':len(data),'encodedBytes':len(output),'compressedBytes':len(compressed),
    'createdAt':datetime.now(timezone.utc).isoformat()
},indent=2)+'\n')
print('AUTHORED surface contact',len(data),'bytes encoded as',len(output),'compressed to',len(compressed),flush=True)
