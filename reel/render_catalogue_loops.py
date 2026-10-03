"""Refine existing vehicle/robot scenes without changing geometry or animation.

Original builders and blend/CAD files remain untouched. Cycles renders physical
material responses and transparent contact shadows. New assets ship in the
catalogue subdirectory; originals remain available at their established paths.
Run: blender --background --python reel/render_catalogue_loops.py -- --sample
Run: blender --background --python reel/render_catalogue_loops.py
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import json
import subprocess
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'reel'))
import render_story_world as story

WORK = ROOT / '.impeccable' / 'renders' / 'catalogue'
OUT = ROOT / 'public' / 'assets' / 'stories' / 'moments' / 'catalogue'
WORK.mkdir(parents=True, exist_ok=True)


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def texture_material(mat, scale, strength, distance, stretch=(1, 1, 1)):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = stretch
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 2
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = distance
    links.new(coord.outputs['Object'], mapping.inputs[0])
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def refine_materials():
    # Preserve photo-referenced pigments. Differentiate physical surfaces through
    # roughness, dielectric reflection and very small normal variation.
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if not bsdf:
            continue
        name = mat.name.lower()
        if any(term in name for term in ('steel', 'brass', 'hasl', 'anodized', 'metal', 'd2pak')):
            bsdf.inputs['Metallic'].default_value = max(.72, bsdf.inputs['Metallic'].default_value)
            bsdf.inputs['Roughness'].default_value = .27
            bsdf.inputs['Specular IOR Level'].default_value = .5
            texture_material(mat, 180, .12, .002, (1, 8, 1))
        elif 'rubber' in name or 'tread' in name:
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Roughness'].default_value = .82
            bsdf.inputs['Specular IOR Level'].default_value = .32
            texture_material(mat, 95, .2, .012)
        elif 'foam' in name:
            bsdf.inputs['Roughness'].default_value = .95
            texture_material(mat, 75, .32, .015)
        elif 'plywood' in name or 'veneer' in name:
            bsdf.inputs['Roughness'].default_value = .62
            texture_material(mat, 38, .17, .004, (.07, 1, 1))
        elif 'pcb' in name or 'circuit board' in name or 'arduino' in name:
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Roughness'].default_value = .4
            bsdf.inputs['Specular IOR Level'].default_value = .42
            bsdf.inputs['Coat Weight'].default_value = .16
            bsdf.inputs['Coat Roughness'].default_value = .28
        elif 'powder-coated' in name or 'housing' in name or 'polymer' in name or 'printed' in name:
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Roughness'].default_value = .47
            bsdf.inputs['Specular IOR Level'].default_value = .4
            texture_material(mat, 180, .12, .002)
        elif 'collection arm' in name:
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Roughness'].default_value = .45
            bsdf.inputs['Specular IOR Level'].default_value = .4
        elif 'glass' in name:
            bsdf.inputs['Roughness'].default_value = .1
            bsdf.inputs['IOR'].default_value = 1.48


def scene_for(moment, sample):
    scene = story.build_moment(moment, 'landscape', False, False, 32)
    for obj in list(scene.objects):
        if obj.type == 'LIGHT' or obj.name == 'StudioGround':
            bpy.data.objects.remove(obj, do_unlink=True)
    background = scene.world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (.72, .76, .8, 1)
    background.inputs['Strength'].default_value = .18
    # Broad key/fill reveal dark housings; a narrower rear strip describes metal.
    for name, pos, energy, width, height, color in [
        ('Catalogue key', (-5, -8, 10), 1900, 7, 4, (1, .97, .92)),
        ('Catalogue fill', (7, -4, 6), 700, 8, 6, (.88, .94, 1)),
        ('Catalogue edge', (3, 7, 8), 1350, 6, 2, (1, 1, 1)),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.shape = 'RECTANGLE'
        data.size, data.size_y, data.color = width, height, color
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        light.location = pos
        aim(light, (0, 0, 1))
    refine_materials()
    # A real shadow catcher seats the wheels while keeping the neutral page as
    # the ground. It contributes no opaque rectangle in either theme.
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.018))
    ground = bpy.context.object
    ground.name = 'Catalogue contact catcher'
    ground.is_shadow_catcher = True
    ground_mat = bpy.data.materials.new('Catalogue neutral ground')
    ground_mat.use_nodes = True
    ground_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.6, .6, .6, 1)
    ground_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    ground.data.materials.append(ground_mat)
    scene.render.engine = 'CYCLES'
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
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.cycles.adaptive_threshold = .045
    scene.cycles.max_bounces = 6
    scene.cycles.transparent_max_bounces = 4
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    # 1080px exceeds the stage's visible media aperture without over-rendering
    # transparent margins. Retain every frame at the native 30fps cadence.
    scene.render.resolution_x, scene.render.resolution_y = (720, 540) if sample else (1080, 810)
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .25
    # Match the existing closer monograph framing without changing camera keys.
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        if curve.data_path == 'lens':
                            for point in curve.keyframe_points:
                                point.co.y *= 1.35
                                point.handle_left.y *= 1.35
                                point.handle_right.y *= 1.35
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8
    scene.render.use_persistent_data = True
    return scene


def run(cmd):
    subprocess.run(cmd, check=True)


def encode(moment, frames):
    expected_frames = 120 if moment == 'vehicle' else 90
    rendered_frames = list(frames.glob('frame_*.png'))
    if len(rendered_frames) != expected_frames:
        raise RuntimeError(f'{moment}: expected {expected_frames} frames, found {len(rendered_frames)}; refusing to publish a partial loop')
    OUT.mkdir(parents=True, exist_ok=True)
    dimensions = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', str(frames/'frame_0001.png')], capture_output=True, text=True, check=True)
    stream = json.loads(dimensions.stdout)['streams'][0]
    source_width, source_height = stream['width'], stream['height']
    # Union of subject bounds, excluding the soft contact shadow, protects every
    # animated silhouette when making the 3:2 phone aperture.
    result = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'info', '-framerate', '30', '-i', str(frames/'frame_%04d.png'), '-vf', 'alphaextract,bbox=min_val=100', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    import re, math
    boxes = [tuple(map(int, box)) for box in re.findall(r'x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)', result.stderr)]
    x1, x2 = min(b[0] for b in boxes), max(b[1] for b in boxes)
    y1, y2 = min(b[2] for b in boxes), max(b[3] for b in boxes)
    width = min(source_width, math.ceil(max(x2-x1+84, (y2-y1+76)*1.5)/6)*6)
    height = int(width/1.5)
    x = max(0, min(source_width-width, round(((x1+x2)/2-width/2)/2)*2))
    y = max(0, min(source_height-height, round(((y1+y2)/2-height/2)/2)*2))
    crop = f'crop={width}:{height}:{x}:{y},scale=900:600'
    # Preserve opaque hardware pixels; soften the native catcher's diffuse
    # alpha and let it reach zero before the aperture edge. This avoids a
    # rectangular shadow field while retaining contact beneath the wheels.
    shadow_matte = "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(alpha(X,Y),250),pow(alpha(X,Y)/255,1.8)*255*min(1,min(min(X,W-1-X),min(Y,H-1-Y))/(0.075*min(W,H))),alpha(X,Y))'"
    for orientation in ('landscape', 'portrait'):
        filter_chain = [crop] if orientation == 'portrait' else []
        filters = ['-vf', ','.join([*filter_chain, shadow_matte])]
        base = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '30', '-i', str(frames/'frame_%04d.png'), *filters, '-an']
        run(base + ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-deadline', 'good', '-cpu-used', '3', '-crf', '29', '-b:v', '0', '-g', '15', str(OUT/f'{moment}-{orientation}.webm')])
        run(base + ['-c:v', 'hevc_videotoolbox', '-allow_sw', '1', '-alpha_quality', '.75', '-pix_fmt', 'bgra', '-q:v', '45', '-tag:v', 'hvc1', '-movflags', '+faststart', str(OUT/f'{moment}-{orientation}.mov')])
        png = WORK/f'{moment}-{orientation}-poster.png'
        run(base + ['-frames:v', '1', str(png)])
        destination = OUT/f'{moment}-{orientation}-poster.webp'
        run(['cwebp', '-quiet', '-q', '92', str(png), '-o', str(destination)])
        origin = f'Origin: authored Cycles render of the existing photo-referenced {moment} model and animation from reel/render_story_world.py. Physical material roughness and normal detail, broad neutral area lights, native transparent contact shadow with diffuse alpha softened and eased to zero at aperture edges. Rendered by reel/render_catalogue_loops.py; opaque hardware pixels, original geometry, timing, camera motion and source blends retained. Phone crop: {crop}.'
        destination.with_suffix('.webp.json').write_text(json.dumps({'origin': origin, 'source': 'reel/render_story_world.py; reel/render_catalogue_loops.py', 'createdAt': datetime.now(timezone.utc).isoformat()}, indent=2)+'\n')
        run(['/Users/miguelsalvacion/.agents/skills/impeccable/scripts/impeccable', 'embed-prompt', str(destination), '--prompt', origin])
        png.unlink()
    (OUT/f'{moment}-render.json').write_text(json.dumps({'renderer': 'Cycles', 'samples': 32, 'width': source_width, 'height': source_height, 'frameCount': len(list(frames.glob('frame_*.png'))), 'fps': 30, 'portraitCrop': crop, 'shadowMatte': 'Diffuse alpha power 1.8; aperture-edge feather 7.5%; alpha >=250 retained', 'originalGeometry': 'reel/render_story_world.py', 'materialPass': 'reel/render_catalogue_loops.py'}, indent=2)+'\n')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--sample', action='store_true')
    parser.add_argument('--moment', choices=('vehicle', 'robot', 'all'), default='all')
    parser.add_argument('--encode-only', action='store_true')
    options = parser.parse_args(args)
    for moment in ('vehicle', 'robot') if options.moment == 'all' else (options.moment,):
        frames = WORK/moment
        frames.mkdir(exist_ok=True)
        if not options.encode_only:
            scene = scene_for(moment, options.sample)
            if options.sample:
                scene.frame_set(1)
                scene.render.filepath = str(WORK/f'{moment}-sample.png')
                bpy.ops.render.render(write_still=True)
                print('SAMPLE', moment, flush=True)
                continue
            scene.render.filepath = str(frames/'frame_')
            bpy.ops.render.render(animation=True)
        encode(moment, frames)
        print('FINISHED', moment, flush=True)
