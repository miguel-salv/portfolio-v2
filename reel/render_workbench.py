"""Reproducible workbench plates from original hardware sources.

Blender --background --python reel/render_workbench.py -- --subject matcher
Blender --background --python reel/render_workbench.py -- --all
The master scene is built once per subject. Four-emitter light positions, camera
projection and hardware materials stay identical to the matcher film renderer.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse, json, subprocess, sys
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'reel'))
from workbench_world import subject, lighting, environment, configure, camera


def export_image(path, metadata):
    scene = bpy.context.scene
    png = path.with_suffix('.png')
    scene.render.filepath = str(png)
    bpy.ops.render.render(write_still=True)
    subprocess.run(['cwebp', '-quiet', '-q', '94', str(png), '-o', str(path)], check=True)
    subprocess.run([str(Path('/Users/miguelsalvacion/.agents/skills/impeccable/scripts/impeccable')), 'embed-prompt', str(path), '--prompt', metadata['origin']], check=True, stdout=subprocess.DEVNULL)
    metadata['createdAt'] = datetime.now(timezone.utc).isoformat()
    path.with_suffix('.webp.json').write_text(json.dumps(metadata, indent=2) + '\n')
    from workbench.embed_xmp import embed
    embed(path)
    png.unlink()
    print('WORKBENCH_RENDER', str(path), flush=True)


def apply_theme(night):
    for name, color in [('Warm laboratory laminate', (.045, .055, .052) if night else (.64, .59, .49)), ('Carbon-dissipative green mat', (.032, .067, .054) if night else (.092, .15, .116))]:
        bpy.data.materials[name].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)


def render_subject(name, themes, orientations, preview=False, empty=True):
    objects, namespace = subject(name)
    scene = bpy.context.scene
    lighting(scene)
    floor, desk = environment(objects, False, pcb=name == 'matcher', subject_name=name)
    configure(scene, 16 if preview else 96)
    subject_names = [o.name for o in objects]
    output = ROOT / ('.impeccable/renders/workbench' if preview else 'public/assets/workbench')
    output.mkdir(parents=True, exist_ok=True)
    for theme in themes:
        apply_theme(theme == 'dark')
        for orientation in orientations:
            for o in list(scene.objects):
                if o.type == 'CAMERA': bpy.data.objects.remove(o, do_unlink=True)
            portrait = orientation == 'portrait'
            phone = orientation == 'phone'
            if phone:portrait=True
            cam = camera(scene, portrait, name)
            if phone:
                from workbench_world import aim
                target=Vector((0,0,5.1));cam.location=target+Vector((8,-12,10));aim(cam,target);cam.data.ortho_scale=16
            width, height = (1080,2160) if phone else ((1080, 1500) if portrait else (2400, 1500))
            if preview: width, height = (540,1080) if phone else ((540, 750) if portrait else (1200, 750))
            scene.render.resolution_x, scene.render.resolution_y = width, height
            bpy.context.view_layer.update()
            if not preview and theme == themes[0] and orientation == orientations[0]:
                bpy.ops.file.pack_all()
                master = ROOT / 'reel/workbench' / f'{name}-workbench.blend'
                bpy.ops.wm.save_as_mainfile(filepath=str(master), compress=True)
            projected = world_to_camera_view(scene, cam, Vector((0, 0, 0)))
            points = [world_to_camera_view(scene, cam, o.matrix_world @ Vector(c)) for o in objects if o.type == 'MESH' for c in o.bound_box]
            horizontal_span = cam.data.ortho_scale * min(1, width / height)
            vertical_span = cam.data.ortho_scale * min(1, height / width)
            # Original transparent film frame, in this camera's normalized screen space.
            # Orthographic scaling is exact because the matcher film uses the same
            # view direction; only the master camera's target and span are changed.
            fw = (6.9 if portrait else 7.8) / horizontal_span
            fh = (6.9 if portrait else 5.85) / vertical_span
            origin = f'Authored Blender Cycles {scene.cycles.samples}-sample render from reel/render_workbench.py and reel/workbench_world.py. {name} hardware uses source CAD, actual KiCad board export or documented photograph-referenced reconstruction. Original documentary photographs are unchanged. Shared four-emitter studio, real-depth ESD mat, laboratory laminate, actual project schematic, connector leads and precision driver. {theme} environment; dedicated {orientation} composition.'
            metadata = {'prompt': origin, 'origin': origin, 'renderer': 'Cycles', 'samples': scene.cycles.samples, 'subject': name, 'theme': theme, 'orientation': orientation, 'resolution': [width, height],
                'camera': {'projection': 'orthographic', 'position': list(cam.location), 'rotation': list(cam.rotation_euler), 'span': cam.data.ortho_scale, 'aspect': width / height, 'horizontalSpan': horizontal_span, 'verticalSpan': vertical_span, 'projectedOrigin': [projected.x, 1 - projected.y], 'subjectBounds': [min(p.x for p in points), 1 - max(p.y for p in points), max(p.x for p in points), 1 - min(p.y for p in points)], 'matcherFilmFrame': {'left': projected.x - fw / 2, 'top': 1 - projected.y - fh / 2, 'width': fw, 'height': fh}},
                'floor': floor, 'source': 'reel/render_workbench.py; reel/workbench_world.py; reel/models/impedance-studio.blend; reel/vehicle/model.py; reel/render_robot.py; public/assets/projects/*/kicad/; src/assets/*-cover.jpg',
                'accuracy': 'Matcher mounting geometry follows source CAD. Reconstructed capacitors, hidden vehicle/robot details and Companion enclosure dimensions are photographic estimates, not surveyed dimensions. Keychain outline, copper, soldermask and silkscreen come from the committed KiCad board; foot-finish contours and visible LED lens caps are photograph-referenced reconstructions; no unprovided component STEP files are invented. Supporting control PCB is the actual committed board layout.'}
            path = output / f'{name}-{theme}-{orientation}.webp'
            export_image(path, metadata)
            if name in ('matcher', 'vehicle', 'robot') and empty:
                for obj_name in subject_names: bpy.data.objects[obj_name].hide_render = True
                empty_meta = dict(metadata, subjectHidden=True, origin=origin + f' {name.title()} removed to provide an exact scene-only handoff background, with its shadow and reflections recalculated.')
                export_image(output / f'{name}-{theme}-{orientation}-empty.webp', empty_meta)
                for obj_name in subject_names: bpy.data.objects[obj_name].hide_render = False


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--subject', default='matcher', choices=['matcher', 'vehicle', 'robot', 'companion', 'keychain'])
    parser.add_argument('--all', action='store_true'); parser.add_argument('--preview', action='store_true')
    parser.add_argument('--theme', choices=['light', 'dark', 'both'], default='both')
    parser.add_argument('--orientation', choices=['landscape', 'portrait', 'phone', 'both'], default='both')
    parser.add_argument('--no-empty', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    for name in ['matcher', 'vehicle', 'robot', 'companion', 'keychain'] if args.all else [args.subject]:
        render_subject(name, ['light', 'dark'] if args.theme == 'both' else [args.theme], ['landscape', 'portrait'] if args.orientation == 'both' else [args.orientation], args.preview, not args.no_empty)
