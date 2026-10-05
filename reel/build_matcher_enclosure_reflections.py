"""Capture the hero-lit hardware for local enclosure reflections.

blender --background --python reel/build_matcher_enclosure_reflections.py
A small floor-bounce reflection probe replaces the empty studio only on inward
enclosure walls. No source geometry or hero image is modified.
"""
from pathlib import Path
from datetime import datetime, timezone
from math import pi
import bpy,json,hashlib,textwrap

ROOT=Path(__file__).resolve().parent.parent
source=ROOT/'reel/render_monograph.py'
# Reuse the same rebuilt assembly, materials, noise and rectangular lights.
namespace={'__file__':str(source)}
exec(compile(source.read_text().split("camera=bpy.data.objects.new('Portrait camera'")[0],str(source),'exec'),namespace)
scene=bpy.context.scene
studio=json.loads((ROOT/'reel/matcher_studio.json').read_text())
position=studio['live']['reflectionProbe']
for obj in scene.objects:
    if obj.type=='MESH' and not obj.name.startswith('Aluminum Box'):
        # Primary probe rays see the enclosure's lit floor and walls, avoiding
        # nearby supports filling the entire panorama. The actual hardware
        # still affects lighting, shadowing and secondary reflected rays.
        obj.visible_camera=False
    if obj.type=='MESH' and namespace['namespace']['group'](obj).startswith('rotor'):
        obj.visible_shadow=False;obj.visible_glossy=False
camera=bpy.data.objects.new('Interior reflection probe',bpy.data.cameras.new('Interior reflection probe'))
scene.collection.objects.link(camera);scene.camera=camera
camera.location=position;camera.rotation_euler=(pi/2,0,0)
camera.data.type='PANO';camera.data.panorama_type='EQUIRECTANGULAR';camera.data.clip_start=.001
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=6
try:
    preferences=bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type='METAL';preferences.get_devices()
    gpu=[device for device in preferences.devices if device.type=='METAL']
    for device in preferences.devices:device.use=device in gpu
    if gpu:scene.cycles.device='GPU'
except (TypeError,RuntimeError):pass
scene.render.resolution_x=512;scene.render.resolution_y=256;scene.render.resolution_percentage=100
scene.render.film_transparent=False;scene.render.image_settings.file_format='HDR'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
out=ROOT/'public/assets/matcher/enclosure-reflections.hdr'
scene.render.filepath=str(out);bpy.ops.render.render(write_still=True)
digest=hashlib.sha256((out.parent/'assembly.bin').read_bytes()).hexdigest()
prompt='Authored Cycles floor-bounce reflection probe from the same rebuilt CAD, aluminum noise, materials, world and area lights as the hardware hero. 512x256 linear HDR, captured in the clear under-stack gap. Primary rays see the lit aluminum enclosure; fixed hardware still casts shadows and affects secondary reflections. Moving rotors are excluded from baked shadow/glossy effects. Box projection approximates indirect wall reflections, not a path-traced live scene.'
metadata={'source':'reel/build_matcher_enclosure_reflections.py; reel/render_monograph.py; reel/matcher_studio.json',
          'prompt':prompt,'probePosition':position,'assemblySHA256':digest,
          'resolution':[512,256],'createdAt':datetime.now(timezone.utc).isoformat()}
out.with_suffix('.hdr.json').write_text(json.dumps(metadata,indent=2)+'\n')
data=out.read_bytes();newline=data.index(b'\n')+1
comments='# Assembly-SHA256: '+digest+'\n'+'\n'.join('# '+line for line in textwrap.wrap('Origin: '+prompt,90))+'\n'
out.write_bytes(data[:newline]+comments.encode()+data[newline:])
print('AUTHORED local enclosure reflections',flush=True)
