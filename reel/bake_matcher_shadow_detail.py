"""Bake surface-sampled studio visibility for broad faces and moving plates.

blender --background --python reel/bake_matcher_shadow_detail.py
Only additional UV seams are exported; assembly geometry stays unchanged.
Four linear texture channels store the visibility of the four area lights.
"""
from pathlib import Path
from math import ceil, sqrt, radians
from datetime import datetime, timezone
import bpy, hashlib, json, struct
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent.parent
source = ROOT/'reel/bake_matcher_studio_visibility.py'
namespace = {'__file__':str(source)}
exec(compile(source.read_text().split('visibility=bytearray()')[0],str(source),'exec'),namespace)
OUT = namespace['OUT']; binary = namespace['binary']; manifest = namespace['manifest']
fixed_vertices = namespace['vertices']; fixed_triangles = namespace['triangles']; lights = namespace['lights']
selected = ('cast aluminum','printed blue housing','capacitor frame and hardware','capacitor aluminum')
records = []
for part_index,(part,points,normals) in enumerate(namespace['decoded']):
    if not any(name in part['material'] for name in selected):continue
    # Motor steel has many small curved faces; existing vertex shading already
    # resolves these. Spend the texture budget on larger inspection surfaces.
    if part['group']=='motors':continue
    offset,count = part['indices']; indices = struct.unpack_from('<'+'I'*count,binary,offset)
    for triangle in range(count//3):
        ids = indices[triangle*3:triangle*3+3]; a,b,c = [points[i] for i in ids]
        area = (b-a).cross(c-a).length/2
        if area < .01:continue
        size = max(8,min(48,ceil(sqrt(area)*24)+6))
        records.append({'part':part_index,'triangle':triangle,'size':size})

def pack(items,width):
    x,y,row = 0,0,0
    for item in sorted(items,key=lambda item:item['size'],reverse=True):
        size=item['size']
        if x+size>width:x=0;y+=row;row=0
        item['x']=x;item['y']=y;x+=size;row=max(row,size)
    height=2**ceil(__import__('math').log2(max(1,y+row)))
    return width,height

fixed=[item for item in records if not manifest['parts'][item['part']]['group'].startswith('rotor')]
moving=[item for item in records if manifest['parts'][item['part']]['group'].startswith('rotor')]
fixed_size=pack(fixed,1024);moving_size=pack(moving,512)
print('ATLAS PLAN',fixed_size,len(fixed),moving_size,len(moving),flush=True)
angles=list(range(-180,181,30))

def save(name,width,height,pixels):
    image=bpy.data.images.new(name,width=width,height=height,alpha=True,float_buffer=False)
    image.colorspace_settings.name='Non-Color';image.alpha_mode='CHANNEL_PACKED'
    image.pixels.foreach_set(pixels);image.filepath_raw=str(OUT/name);image.file_format='PNG';image.save()
    bpy.data.images.remove(image)

def bake(items,size,bvh,angle=0,rotor=None):
    width,height=size;pixels=[1.0]*(width*height*4)
    rotation=Matrix.Rotation(radians(angle),3,'Y')
    pivot=Vector(manifest['rotors'][rotor]) if rotor is not None else None
    for item in items:
        part,points,normals=namespace['decoded'][item['part']]
        offset,count=part['indices'];ids=struct.unpack_from('<III',binary,offset+item['triangle']*12)
        triangle=[points[i] for i in ids];ns=[Vector(normals[i*3:i*3+3]) for i in ids]
        if pivot is not None:
            triangle=[pivot+rotation@(p-pivot) for p in triangle];ns=[rotation@n for n in ns]
        side=item['size'];denominator=side-5
        for y in range(side):
            for x in range(side):
                # Two-pixel gutters clamp to the triangle boundary. Continue
                # the nearest barycentric edge beyond its diagonal as well.
                u=max(0,min(1,(x-2)/denominator));v=max(0,min(1,(y-2)/denominator))
                if u+v>1:u,v=u/(u+v),v/(u+v)
                w=1-u-v;point=triangle[0]*w+triangle[1]*u+triangle[2]*v
                normal=(ns[0]*w+ns[1]*u+ns[2]*v).normalized();origin=point+normal*.0005
                index=((item['y']+y)*width+item['x']+x)*4
                for light,samples in enumerate(lights):
                    visible,total=0,0
                    for sample in samples:
                        direction=sample-origin;distance=direction.length;direction/=distance
                        if normal.dot(direction)<=0:continue
                        total+=1
                        hit,_,_,_=bvh.ray_cast(origin,direction,distance-.0005)
                        if hit is None:visible+=1
                    pixels[index+light]=round(255*visible/total)/255 if total else 1
    return pixels

fixed_bvh=BVHTree.FromPolygons(fixed_vertices,fixed_triangles,all_triangles=True,epsilon=0)
save('shadow-detail-fixed.png',*fixed_size,bake(fixed,fixed_size,fixed_bvh))
print('BAKED fixed surface shadow detail',flush=True)
width,height=moving_size;poses=[]
for angle in angles:
    pixels=[1.0]*(width*height*4)
    for rotor in range(len(manifest['rotors'])):
        own=[item for item in moving if manifest['parts'][item['part']]['group']==f'rotor{rotor+1}']
        rotation=Matrix.Rotation(radians(angle),3,'Y');pivot=Vector(manifest['rotors'][rotor])
        vertices=list(fixed_vertices);triangles=list(fixed_triangles)
        for part,points,normals in namespace['decoded']:
            if part['group']!=f'rotor{rotor+1}':continue
            start=len(vertices);vertices.extend(pivot+rotation@(p-pivot) for p in points)
            offset,count=part['indices'];indices=struct.unpack_from('<'+'I'*count,binary,offset)
            triangles.extend(tuple(start+i for i in indices[j:j+3]) for j in range(0,count,3))
        bvh=BVHTree.FromPolygons(vertices,triangles,all_triangles=True,epsilon=0)
        layer=bake(own,moving_size,bvh,angle,rotor)
        for item in own:
            for y in range(item['size']):
                start=((item['y']+y)*width+item['x'])*4;end=start+item['size']*4
                pixels[start:end]=layer[start:end]
    poses.extend(pixels);print('BAKED surface rotor pose',angle,flush=True)
save('shadow-detail-rotors.png',width,height*len(angles),poses)
metadata={
    'source':'reel/bake_matcher_shadow_detail.py; reel/bake_matcher_studio_visibility.py',
    'description':'Authored per-surface four-channel softbox visibility. Broad fixed faces and moving capacitor plates use independent triangle islands with two-pixel gutters. Thirteen rotor poses interpolate with actual shaft angle; moving rotors do not occlude fixed surfaces or one another.',
    'geometrySHA256':hashlib.sha256(binary).hexdigest(),
    'lightsSHA256':hashlib.sha256(json.dumps(namespace['studio']['lights'],separators=(',',':')).encode()).hexdigest(),
    'fixed':{'width':fixed_size[0],'height':fixed_size[1],'tiles':fixed},
    'rotors':{'width':width,'height':height,'angles':angles,'tiles':moving},
    'textures':{name:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for name in ['shadow-detail-fixed.png','shadow-detail-rotors.png']},
    'createdAt':datetime.now(timezone.utc).isoformat()
}
(OUT/'shadow-detail.json').write_text(json.dumps(metadata,separators=(',',':'))+'\n')
for name in metadata['textures']:
    (OUT/(name+'.json')).write_text(json.dumps({key:metadata[key] for key in ['source','description','geometrySHA256','lightsSHA256','createdAt']},indent=2)+'\n')
print('AUTHORED surface shadow detail',flush=True)
