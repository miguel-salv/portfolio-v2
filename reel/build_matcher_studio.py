"""Author HDR reflection cards and fine metal/plastic roughness maps in Blender.
Run: blender --background --python reel/build_matcher_studio.py
Local material assets, no external HDR or source CAD changes.
"""
from pathlib import Path
from datetime import datetime, timezone
from math import pi, sin
from random import Random
import bpy, json, textwrap, sys
from mathutils import Vector

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'public/assets/matcher'; OUT.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
world=bpy.data.worlds.new('Hardware graphite reflection studio');world.use_nodes=True
studio=json.loads((ROOT/'reel/matcher_studio.json').read_text())
world.node_tree.nodes['Background'].inputs['Color'].default_value=(*studio['worldColor'],1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=studio['worldStrength']
scene.world=world

# Reflection cards share the portrait's linear colors, dimensions and poses.
# Cycles normalized rectangular lights emit power / (pi * area) radiance.
for light in studio['lights']:
    name,pos,color=light['name'],light['position'],light['color']
    size=(light['width'],light['height'])
    energy=light['power']/(pi*size[0]*size[1])*studio['live']['reflectionCardScale']
    bpy.ops.mesh.primitive_plane_add(size=1,location=pos)
    obj=bpy.context.object;obj.name=name;obj.scale=(size[0],size[1],1)
    obj.rotation_euler=(-obj.location).to_track_quat('Z','Y').to_euler()
    material=bpy.data.materials.new(name);material.use_nodes=True
    nodes=material.node_tree.nodes;nodes.clear()
    output=nodes.new('ShaderNodeOutputMaterial');emission=nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value=(*color,1);emission.inputs['Strength'].default_value=energy
    material.node_tree.links.new(emission.outputs[0],output.inputs['Surface']);obj.data.materials.append(material)
camera=bpy.data.objects.new('Reflection panorama',bpy.data.cameras.new('Reflection panorama'))
scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='PANO'
camera.data.panorama_type='EQUIRECTANGULAR';camera.rotation_euler=(pi/2,0,0)
scene.render.engine='CYCLES';scene.cycles.samples=8
scene.render.resolution_x=1024;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='HDR';scene.render.film_transparent=False
scene.view_settings.view_transform='Standard';scene.render.filepath=str(OUT/'studio-reflections.hdr')
bpy.ops.render.render(write_still=True)
prompt='Authored Blender HDR environment from reel/build_matcher_studio.py using the hero studio in reel/matcher_studio.json: matching linear world color and four rectangular emitter poses, dimensions and colors. Linear high-dynamic-range 1024x512 equirectangular raster for physical metal reflections, not visible background. The world retains hero intensity; reflection-card radiance is scaled to 0.18 to supplement the live finite area lights without doubling the studio rig.'
(OUT/'studio-reflections.hdr.json').write_text(json.dumps({'prompt':prompt,'source':'reel/build_matcher_studio.py','createdAt':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
# Radiance permits comment metadata; keep provenance in the shipping raster.
hdr=OUT/'studio-reflections.hdr';data=hdr.read_bytes();newline=data.index(b'\n')+1
comments='\n'.join('# '+line for line in textwrap.wrap('Origin: '+prompt,90))+'\n'
hdr.write_bytes(data[:newline]+comments.encode()+data[newline:])
if '--reflections-only' in sys.argv:
    raise SystemExit(0)

for name,base,amplitude in [('metal-roughness',.86,.10),('plastic-roughness',.9,.07)]:
    size=512;rng=Random(71 if name.startswith('metal') else 112)
    image=bpy.data.images.new(name,width=size,height=size,alpha=False,float_buffer=False)
    pixels=[]
    for y in range(size):
        row=rng.uniform(-1,1)
        for x in range(size):
            variation=(row*.7+rng.uniform(-1,1)*.3) if name.startswith('metal') else (.45*sin(y*pi/2)+rng.uniform(-1,1)*.55)
            value=max(0,min(1,base+variation*amplitude));pixels.extend((value,value,value,1))
    image.pixels.foreach_set(pixels);image.filepath_raw=str(OUT/(name+'.png'));image.file_format='PNG';image.save()
    prompt='Authored deterministic fine '+name+' map from reel/build_matcher_studio.py. 512x512 linear grayscale material roughness: subtle directional machining for metal or printed layer variation for blue plastic. Seeded procedural surface finish, not photographic evidence.'
    (OUT/(name+'.png.json')).write_text(json.dumps({'prompt':prompt,'source':'reel/build_matcher_studio.py','createdAt':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
print('AUTHORED HDR and two roughness maps',flush=True)
