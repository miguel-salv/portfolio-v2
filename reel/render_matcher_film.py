"""Hero-matched, bidirectional matcher inspection film; source CAD is untouched.

blender --background --python reel/render_matcher_film.py -- --variant landscape
python3 reel/render_matcher_film.py --encode-only
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse, hashlib, json, subprocess, sys, shutil

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / '.impeccable/renders/matcher-film'
OUT = ROOT / 'public/assets/matcher/film'
FPS = 30
ASSEMBLY = 30
VIEWS = {'capacitors': 40, 'motors': 70, 'control': 100}
ROUTES = [
    {'from': 'capacitors', 'to': 'motors', 'start': 40, 'end': 70},
    {'from': 'motors', 'to': 'control', 'start': 70, 'end': 100},
    {'from': 'capacitors', 'to': 'control', 'start': 101, 'end': 131},
    {'from': 'machine', 'to': 'capacitors', 'start': 132, 'end': 147},
    {'from': 'machine', 'to': 'motors', 'start': 148, 'end': 163},
    {'from': 'machine', 'to': 'control', 'start': 164, 'end': 179},
]
COUNT = 180

def smooth(value):
    t = min(1, max(0, value))
    return t*t*t*(t*(t*6-15)+10)

def assembly_pose(value):
    control = smooth((value-.025)/.35)
    hardware = smooth((value-.28)/.62)
    return {'control': (.15*control, -1.15*control, .16*control),
            'capacitors': (0, 0, 1.35*hardware),
            'motors': (.9*hardware, 0, .2*hardware),
            'shafts': smooth((value-.62)/.38)}

def render(variant, preview=False, only=None, cpu=False, project_from_portrait=False):
    import bpy
    from math import radians
    from mathutils import Vector, Matrix
    from bpy_extras.object_utils import world_to_camera_view
    source = ROOT / 'reel/render_monograph.py'
    ns = {'__file__': str(source)}
    # The actual hero builder, full-detail geometry, roughness, softboxes and
    # AgX display transform, rather than a second approximation of its look.
    exec(compile(source.read_text().split('outputs = [')[0], str(source), 'exec'), ns)
    scene, camera = ns['scene'], ns['camera']
    meshes = ns['namespace']['meshes']
    group = ns['namespace']['group']
    centers = ns['namespace']['cap_centers']
    original = {obj: obj.matrix_world.copy() for obj in meshes}
    mobile = variant == 'portrait'
    width, height = (900, 900) if mobile else (1080, 810)
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.image_settings.color_depth = '8'
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    if preview: scene.cycles.samples = 8
    scene.render.fps = FPS
    if cpu: scene.cycles.device = 'CPU'
    frames = WORK / variant
    frames.mkdir(parents=True, exist_ok=True)
    signature = hashlib.sha256(b''.join((ROOT / p).read_bytes() for p in
        ['reel/render_monograph.py', 'reel/build_matcher_exhibit.py',
         'reel/matcher_geometry.py', 'reel/matcher_studio.json', 'reel/render_matcher_film.py'])).hexdigest()
    stamp = frames / 'signature.txt'
    if not preview:
        if stamp.exists() and stamp.read_text() != signature:
            raise RuntimeError('Render inputs changed; use a fresh frame directory before publishing')
        stamp.write_text(signature)
    hero = Vector((8, -12, 10 if mobile else 9))
    # Overhead capacitors, then the stepper side and a short move toward the
    # display. Both stops sit off the assembled hero, and the straight blend
    # between them never crosses it.
    views = [hero, Vector((3,-5,11)), Vector((12,-4.4,5.7)), Vector((3,-12,5.3))]
    hero_span = 6.9 if mobile else 7.8
    spans = [hero_span+(.8 if mobile else .5), 8.2 if mobile else 9.2, 8.2 if mobile else 9.2, 8.2 if mobile else 9.2]
    anchors = {'capacitors': Vector(centers[0])+Vector((0,.15,.2)),
               'motors': Vector((centers[1].x,-1.9,-.1)),
               'control': Vector((0,-2.3,.8))}
    def fitted(base):
        points = [world_to_camera_view(scene,camera,obj.matrix_world @ Vector(c)) for obj in meshes for c in obj.bound_box]
        extent = max(max(abs(p.x-.5),abs(p.y-.5))*2 for p in points)
        return base*max(1, extent/.92)
    portrait_metadata = json.loads((WORK/'portrait/frames.json').read_text()) if project_from_portrait else None
    if portrait_metadata and variant != 'landscape': raise ValueError('Projection reuse requires the desktop variant')
    metadata = []
    for frame in range(COUNT):
        if only is not None and frame not in only: continue
        progress = min(1, frame/ASSEMBLY)
        pose = assembly_pose(progress)
        for obj, transform in original.items():
            family = group(obj)
            delta = Vector((0,0,0))
            rotor = family.startswith('rotor')
            matrix = transform.copy()
            if rotor:
                index = int(family[-1])-1
                pivot = centers[index]
                angle = radians(45 if index == 0 else -45)*pose['shafts']
                matrix = Matrix.Translation(pivot) @ Matrix.Rotation(angle,4,'Y') @ Matrix.Translation(-pivot) @ matrix
            if family == 'capacitors' or rotor:
                delta = Vector(pose['capacitors'])
            elif family == 'control':
                delta = Vector(pose['control'])
            elif family == 'motors':
                delta = Vector(pose['motors'])
                if transform.translation.x < 0: delta.x *= -1
            posed = Matrix.Translation(delta) @ matrix
            # Camera-only frames share one open mechanism. Reassigning an
            # identical transform invalidates Cycles geometry on every frame.
            if obj.matrix_world != posed: obj.matrix_world = posed
        if frame <= 40:
            segment, start, length = 0, ASSEMBLY, 10
        elif frame <= 70:
            segment, start, length = 1, 40, 30
        elif frame <= 100:
            segment, start, length = 2, 70, 30
        elif frame <= 131:
            segment, start, length = 1, 101, 30
        else:
            segment, start, length = 0, 132+((frame-132)//16)*16, 15
        amount = smooth((frame-start)/length)
        if frame >= 132:
            destination_view = (frame-132)//16+1
            shared_hero = Vector((8,-12,10 if destination_view == 1 else 9))
            offset = (hero.z-shared_hero.z)*(1-smooth((frame-start)/(length*.25)))
            camera.location = shared_hero.lerp(views[destination_view],amount)+Vector((0,0,offset))
        else:
            destination_view = 3 if frame >= 101 else segment+1
            camera.location = views[segment].lerp(views[destination_view], amount)
        authored = spans[segment]*(1-amount)+spans[destination_view]*amount
        # Give the lifted stacks room continuously, without changing the
        # initial hero projection by even one pixel.
        if frame <= ASSEMBLY: authored = hero_span+(.8 if mobile else .5)*smooth(progress)
        camera.data.ortho_scale = authored
        ns['aim'](camera, (0,0,0))
        bpy.context.view_layer.update()
        if frame:
            camera.data.ortho_scale = fitted(authored)
            bpy.context.view_layer.update()
        projected = {}
        for name, point in anchors.items():
            p = world_to_camera_view(scene,camera,point+Vector(pose[name]))
            projected[name] = [round(p.x*100,4),round((1-p.y)*100,4)]
        metadata.append({'assembly':progress,'anchors':projected})
        destination = (WORK/'preview'/f'{variant}_{frame:04d}.png') if preview else frames/f'frame_{frame:04d}.png'
        if preview: destination.parent.mkdir(parents=True, exist_ok=True)
        alias = {101:40,131:100,132:30,147:40,148:30,163:70,164:30,179:100}.get(frame)
        if not preview and alias is not None:
            shutil.copyfile(frames/f'frame_{alias:04d}.png',destination)
        elif portrait_metadata and frame > 40 and (frame <= 131 or (frame-132)%16 >= 4):
            # Orthographic inspection angles and illumination are shared. Apply
            # the exact projection scale/crop to the full-quality phone render.
            source_points=portrait_metadata['frames'][frame]['anchors']
            sx=(projected['control'][0]-50)*width/((source_points['control'][0]-50)*portrait_metadata['width'])
            sy=(projected['capacitors'][1]-50)*height/((source_points['capacitors'][1]-50)*portrait_metadata['height'])
            if abs(sx-sy)>.001: raise RuntimeError('Inspection cameras do not share an orthographic projection')
            scale=(sx+sy)/2
            tx=(width-portrait_metadata['width']*scale)/2
            ty=(height-portrait_metadata['height']*scale)/2
            source_frame=WORK/'portrait'/f'frame_{frame:04d}.png'
            run(['magick',str(source_frame),'-alpha','on','-virtual-pixel','transparent',
                 '-filter','Lanczos','-define',f'distort:viewport={width}x{height}+0+0',
                 '-distort','AffineProjection',f'{scale},0,0,{scale},{tx},{ty}',str(destination)])
        elif preview or not destination.exists():
            scene.render.filepath = str(destination)
            bpy.ops.render.render(write_still=True)
        print('MATCHER_FRAME', variant, frame, '/', COUNT-1, flush=True)
    if preview: return
    (frames / 'frames.json').write_text(json.dumps({'fps':FPS,'frameCount':COUNT,
        'assemblyEnd':ASSEMBLY,'views':VIEWS,'width':width,'height':height,
        'signature':signature,'routes':ROUTES,'frames':metadata},separators=(',',':'))+'\n')

def run(command):
    subprocess.run(command,check=True)

def encode(selected_variant=None):
    OUT.mkdir(parents=True,exist_ok=True)
    for variant in (selected_variant,) if selected_variant else ('landscape','portrait'):
        frames = WORK / variant
        metadata = json.loads((frames / 'frames.json').read_text())
        if any(not (frames / f'frame_{i:04d}.png').exists() for i in range(COUNT)):
            raise RuntimeError('Refusing to publish an incomplete inspection film')
        base = ['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(FPS),
                '-start_number','0','-i',str(frames/'frame_%04d.png'),'-frames:v',str(COUNT),'-an']
        # VP9 uses a short, six-frame seek span to reuse unchanged hardware
        # detail. Keep every pose, full resolution, 30fps and native alpha.
        # Apple's transparent HEVC retains its independent frames.
        for extension, options in [('webm',['-c:v','libvpx-vp9','-pix_fmt','yuva420p',
            '-auto-alt-ref','0','-deadline','good','-cpu-used','3','-threads','2','-crf','28','-b:v','0','-g','6']),
            ('mov',['-c:v','hevc_videotoolbox','-allow_sw','1','-alpha_quality','.9',
             '-pix_fmt','bgra','-q:v','55','-g','1','-tag:v','hvc1','-movflags','+faststart'])]:
            run(base+options+[str(OUT/f'matcher-{variant}.{extension}')])
        for name, frame in {'machine':0,**VIEWS}.items():
            destination = OUT / f'{variant}-{name}.webp'
            run(['cwebp','-quiet','-q','95',str(frames/f'frame_{frame:04d}.png'),'-o',str(destination)])
            origin='Authored transparent Cycles render using the exact hardware hero scene, full-detail photo-referenced CAD, studio emitters, materials, AgX transform, and 48 samples. Same frame as the matcher inspection film. No stock or generated imagery.'
            run(['/Users/miguelsalvacion/.agents/skills/impeccable/scripts/impeccable','embed-prompt',str(destination),'--prompt',origin])
            destination.with_suffix('.webp.json').write_text(json.dumps({
                'origin':origin,'prompt':origin,
                'source':'reel/render_matcher_film.py; reel/render_monograph.py; reel/matcher_geometry.py',
                'createdAt':datetime.now(timezone.utc).isoformat(),'frame':frame},indent=2)+'\n')
        media_signature = hashlib.sha256(b''.join((OUT/f'matcher-{variant}.{extension}').read_bytes()
            for extension in ('webm','mov'))).hexdigest()
        metadata.update({'renderer':'Cycles','samples':48,'keyframeInterval':{'webm':6,'mov':1},
            'mediaSignature':media_signature,
            'heroScene':'reel/render_monograph.py','independentShaftControl':False,
            'action':'assembled hero, staged separation, capacitor inspection, motors, controller',
            'createdAt':datetime.now(timezone.utc).isoformat()})
        (OUT/f'{variant}.json').write_text(json.dumps(metadata,separators=(',',':'))+'\n')

if __name__ == '__main__':
    arguments = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument('--variant',choices=('landscape','portrait'))
    parser.add_argument('--encode-only',action='store_true')
    parser.add_argument('--preview',action='store_true')
    parser.add_argument('--cpu',action='store_true')
    parser.add_argument('--project-from-portrait',action='store_true')
    parser.add_argument('--frames',default='')
    options = parser.parse_args(arguments)
    selected = {int(item) for item in options.frames.split(',') if item}
    if options.encode_only: encode(options.variant)
    else: render(options.variant or 'landscape', preview=options.preview, only=selected or None, cpu=options.cpu, project_from_portrait=options.project_from_portrait)
