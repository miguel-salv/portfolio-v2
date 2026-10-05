"""Author a static hardware portrait and matching exhibit stills from real CAD.
No source blend is modified. Capacitors use the existing photo-referenced builder.
Run: blender --background --python reel/render_monograph.py
"""
from pathlib import Path
from datetime import datetime, timezone
import bpy, json, subprocess, sys
from mathutils import Vector
ROOT = Path(__file__).resolve().parent.parent
builder = ROOT / 'reel/build_matcher_exhibit.py'
namespace = {'__file__': str(builder)}
exec(compile(builder.read_text().split('# Export indexed geometry')[0], str(builder), 'exec'), namespace)
scene = bpy.context.scene
# Machined surfaces carry a subtle physical roughness rather than a flat gray.
for name in ['Exhibit — cast aluminum', 'Exhibit — capacitor aluminum']:
    material = bpy.data.materials[name]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    noise = nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 420
    noise.inputs['Detail'].default_value = 2
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .12
    bump.inputs['Distance'].default_value = .002
    links.new(noise.outputs['Fac'], bump.inputs['Height']); links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

def aim(obj, target): obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
world = bpy.data.worlds.new('Graphite studio'); world.use_nodes = True
studio = json.loads((ROOT / 'reel/matcher_studio.json').read_text())
world.node_tree.nodes['Background'].inputs[0].default_value = (*studio['worldColor'],1)
world.node_tree.nodes['Background'].inputs[1].default_value = studio['worldStrength']
scene.world = world
for light in studio['lights']:
    data=bpy.data.lights.new(light['name'],'AREA'); data.energy=light['power']; data.shape='RECTANGLE'; data.size=light['width']; data.size_y=light['height']; data.color=light['color']
    obj=bpy.data.objects.new(light['name'],data);scene.collection.objects.link(obj);obj.location=light['position'];aim(obj,(0,0,0))
camera=bpy.data.objects.new('Portrait camera',bpy.data.cameras.new('Portrait camera'));scene.collection.objects.link(camera)
camera.data.type='ORTHO'; scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
try:
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = 'METAL'
    preferences.get_devices()
    gpu_devices = [device for device in preferences.devices if device.type == 'METAL']
    for device in preferences.devices:
        device.use = device in gpu_devices
    if gpu_devices:
        scene.cycles.device = 'GPU'
except (TypeError, RuntimeError):
    pass
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.use_persistent_data=True
scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True;scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
outputs = [
    ('public/assets/workshop/hardware-portrait.webp', (1920,1440), (8,-12,9), 7.8),
    ('public/assets/workshop/hardware-portrait-mobile.webp', (1000,1000), (8,-12,10), 6.9),
    ('public/assets/matcher/overview.webp', (1440,1080), (7,-10,7), 8.8),
    ('public/assets/matcher/inside.webp', (1440,1080), (3,-5,11), 9.2),
]
for relative, resolution, position, span in outputs:
    if '--hero-only' in sys.argv and relative != 'public/assets/workshop/hardware-portrait.webp': continue
    if '--chapter-only' in sys.argv and '/workshop/' in relative: continue
    destination=ROOT/relative; destination.parent.mkdir(parents=True, exist_ok=True)
    intermediate=Path('/tmp')/('monograph-'+destination.stem+'.png')
    scene.render.resolution_x,scene.render.resolution_y=resolution
    camera.location=position;camera.data.ortho_scale=span;aim(camera,(0,0,0))
    scene.render.filepath=str(intermediate);bpy.ops.render.render(write_still=True)
    subprocess.run(['/opt/homebrew/bin/cwebp','-q','92',str(intermediate),'-o',str(destination)],check=True)
    intermediate.unlink()
    destination.with_suffix(destination.suffix+'.json').write_text(json.dumps({
        'prompt':'Authored Blender hardware monograph render from reel/render_monograph.py: existing impedance matcher CAD, photo-referenced capacitor stacks from reel/build_matcher_exhibit.py, directional rectangular studio lighting, high-contrast machined metals, native transparent background. No generated or stock imagery.',
        'source':'reel/models/impedance-studio.blend; src/assets/impedance-cover.jpg; reel/build_matcher_exhibit.py; reel/matcher_geometry.py',
        'reconstruction':'CAD mounting envelopes and motor axes retained. Both inductor leads terminate at visible hardware: the common capacitor junction and chassis ground, following the documented RF schematic. Salvaged central capacitor outline, plate counts/thickness and physical wire routes are photo estimates.',
        'rf_schematic':'https://raw.githubusercontent.com/hacker-fab/gitbook/main/.gitbook/assets/image%20%283%29.png',
        'created_at':datetime.now(timezone.utc).isoformat(),'resolution':list(resolution)
    },indent=2)+'\n')
    print('AUTHORED',relative,flush=True)
