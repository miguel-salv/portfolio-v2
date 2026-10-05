"""Render the photo-referenced vehicle and robot scenes for the catalogue.

The vehicle and robot builders refine the observed chassis; the robot retains
its redesigned collection arms and pickup animation. Cycles renders physical material responses and
transparent contact shadows. Source blend/CAD files remain untouched.
Run: blender --background --python reel/render_catalogue_loops.py -- --sample
Run: blender --background --python reel/render_catalogue_loops.py
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import shutil
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'reel'))
try:
    import bpy
except ModuleNotFoundError:
    bpy = None
if bpy is not None:
    from mathutils import Vector
    import render_story_world as story
    from robot_finish import apply_robot_finish

WORK = ROOT / '.impeccable' / 'renders' / 'catalogue-motion'
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
        if 'anodized' in name:
            bsdf.inputs['Roughness'].default_value = .41 if 'chassis' in name else .34
            bsdf.inputs['Specular IOR Level'].default_value = .45
            texture_material(mat, 180, .055, .0008)
        elif any(term in name for term in ('steel', 'brass', 'hasl', 'metal', 'd2pak')):
            bsdf.inputs['Metallic'].default_value = max(.72, bsdf.inputs['Metallic'].default_value)
            bsdf.inputs['Roughness'].default_value = .27
            bsdf.inputs['Specular IOR Level'].default_value = .5
            texture_material(mat, 180, .12, .002, (1, 8, 1))
        elif 'rubber' in name or 'tread' in name:
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Roughness'].default_value = .82
            bsdf.inputs['Specular IOR Level'].default_value = .32
            texture_material(mat, 170, .12, .002)
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
        elif name == 'wheel rim polymer':
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Roughness'].default_value = .34
            bsdf.inputs['Specular IOR Level'].default_value = .45
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
    # The mechanism owns the motion. A low vehicle view describes wheel travel;
    # the robot's higher fixed view keeps scanning and pickup in one readable plane.
    camera = scene.camera
    camera.animation_data_clear()
    camera.data.animation_data_clear()
    camera.location = (10, -13, 6) if moment == 'vehicle' else (10, 13, 12)
    camera.data.lens = 64.8
    aim(camera, (0, 0, 1) if moment == 'vehicle' else (0, 0, .85))
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8
    scene.render.use_persistent_data = True
    if moment == 'robot':
        apply_robot_finish(scene)
    return scene


def render_motion(scene, frames, start_frame):
    # These scenes animate object transforms only. Identical evaluated poses,
    # with a fixed camera/light setup and deterministic Cycles seed, share pixels.
    # Reuse full-quality holds instead of tracing the same still at every frame.
    poses = {}
    for frame in range(1, scene.frame_end + 1):
        scene.frame_set(frame)
        pose = [(obj.name, obj.hide_render, tuple(round(value, 9) for row in obj.matrix_world for value in row))
                for obj in sorted(scene.objects, key=lambda obj: obj.name)]
        digest = hashlib.sha256(repr(pose).encode()).hexdigest()
        destination = frames / f'frame_{frame:04d}.png'
        if frame < start_frame and destination.exists():
            poses.setdefault(digest, destination)
            continue
        if digest in poses:
            shutil.copyfile(poses[digest], destination)
            print('REUSED', frame, flush=True)
        else:
            scene.render.filepath = str(destination)
            bpy.ops.render.render(write_still=True)
            poses[digest] = destination


def run(cmd):
    subprocess.run(cmd, check=True)


def encode(moment, frames):
    expected_frames = 120 if moment == 'vehicle' else 90
    rendered_frames = list(frames.glob('frame_*.png'))
    if len(rendered_frames) != expected_frames:
        raise RuntimeError(f'{moment}: expected {expected_frames} frames, found {len(rendered_frames)}; refusing to publish a partial loop')
    # Extract one forward action from the full-quality rendered cycle. The
    # browser reverses this same action; no baked return or long initial hold.
    first, last = (22, 48) if moment == 'vehicle' else (1, 62)
    forward = WORK / f'{moment}-forward'
    forward.mkdir(exist_ok=True)
    for index, source_frame in enumerate(range(first, last + 1), 1):
        shutil.copyfile(frames / f'frame_{source_frame:04d}.png', forward / f'frame_{index:04d}.png')
    frames = forward
    rendered_frames = list(frames.glob('frame_*.png'))
    if len(rendered_frames) != last - first + 1:
        raise RuntimeError(f'{moment}: forward frame directory contains stale or missing frames')
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
        run(base + ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-deadline', 'good', '-cpu-used', '3', '-crf', '29', '-b:v', '0', '-g', '1', str(OUT/f'{moment}-{orientation}.webm')])
        run(base + ['-c:v', 'hevc_videotoolbox', '-allow_sw', '1', '-alpha_quality', '.75', '-pix_fmt', 'bgra', '-q:v', '45', '-g', '1', '-tag:v', 'hvc1', '-movflags', '+faststart', str(OUT/f'{moment}-{orientation}.mov')])
        png = WORK/f'{moment}-{orientation}-poster.png'
        run(base + ['-frames:v', '1', str(png)])
        destination = OUT/f'{moment}-{orientation}-poster.webp'
        run(['cwebp', '-quiet', '-q', '92', str(png), '-o', str(destination)])
        model_note = ('Photo-reconstructed chassis plates, mounting holes, wheels and bumper from src/assets/vehicle-cover.jpg; an exact manufacturer Ackermann CAD file was not available.' if moment == 'vehicle' else 'Photo-referenced robot chassis, wheels, housings, mounting hardware and tidy cable connections refined. Intentionally redesigned collection arms, wheel rolling radius, hierarchy and pickup animation retained; surface finishes from reel/robot_finish.py. Hidden dimensions and routes remain estimates.')
        sources = ('reel/vehicle/model.py; src/assets/vehicle-cover.jpg' if moment == 'vehicle' else 'reel/render_robot.py; reel/robot_finish.py; src/assets/robot-cover.jpg')
        origin = f'Origin: authored Cycles render of the photo-referenced {moment} model and animation from reel/render_story_world.py. {model_note} Physical material roughness and normal detail, directional area lights, native transparent contact shadow with diffuse alpha softened and eased to zero at aperture edges. Rendered by reel/render_catalogue_loops.py; forward action from source frames {first}-{last} at the native 30fps cadence, with a fixed low vehicle camera and fixed elevated robot camera. All-keyframe video supports bidirectional browser seeking. Phone crop: {crop}.'
        run(['/Users/miguelsalvacion/.agents/skills/impeccable/scripts/impeccable', 'embed-prompt', str(destination), '--prompt', origin])
        destination.with_suffix('.webp.json').write_text(json.dumps({'prompt': origin, 'origin': origin, 'source': f'{sources}; reel/render_story_world.py; reel/render_catalogue_loops.py', 'createdAt': datetime.now(timezone.utc).isoformat()}, indent=2)+'\n')
        png.unlink()
    (OUT/f'{moment}-render.json').write_text(json.dumps({'renderer': 'Cycles', 'samples': 32, 'width': source_width, 'height': source_height, 'frameCount': len(rendered_frames), 'sourceFrameRange': [first,last], 'action': 'forward drive' if moment == 'vehicle' else 'scan, approach and grip', 'keyframeInterval': 1, 'fps': 30, 'portraitCrop': crop, 'shadowMatte': 'Diffuse alpha power 1.8; aperture-edge feather 7.5%; alpha >=250 retained', 'geometrySource': sources, 'geometryRetained': False, 'collectionArmsRetained': moment == 'robot', 'animationRetained': True, 'cameraMotionRetained': False, 'cameraMotion': 'fixed low wheel view' if moment == 'vehicle' else 'fixed elevated pickup view', 'modelReference': model_note, 'animationSource': 'reel/render_story_world.py', 'materialPass': 'reel/robot_finish.py; reel/render_catalogue_loops.py' if moment == 'robot' else 'reel/render_catalogue_loops.py'}, indent=2)+'\n')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--sample', action='store_true')
    parser.add_argument('--moment', choices=('vehicle', 'robot', 'all'), default='all')
    parser.add_argument('--encode-only', action='store_true')
    parser.add_argument('--start-frame', type=int, default=1,
                        help='Resume with the same source/settings; completed earlier frames are reused and missing ones rendered')
    options = parser.parse_args(args)
    for moment in ('vehicle', 'robot') if options.moment == 'all' else (options.moment,):
        frames = WORK/moment
        frames.mkdir(exist_ok=True)
        if not options.encode_only:
            if bpy is None:
                raise RuntimeError('Rendering needs Blender; use --encode-only to extract existing full-quality frames with Python')
            scene = scene_for(moment, options.sample)
            if options.sample:
                scene.frame_set(1)
                scene.render.filepath = str(WORK/f'{moment}-sample.png')
                bpy.ops.render.render(write_still=True)
                print('SAMPLE', moment, flush=True)
                continue
            if not 1 <= options.start_frame <= scene.frame_end:
                raise ValueError(f'Invalid start frame {options.start_frame} for {moment}')
            render_motion(scene, frames, options.start_frame)
        encode(moment, frames)
        print('FINISHED', moment, flush=True)
