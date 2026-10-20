"""Audit the saved film; optionally make a small desktop motion review.

blender --background --python reel/world/review_film.py
blender --background --python reel/world/review_film.py -- --preview
blender --background --python reel/world/review_film.py -- --preview --refresh 285 405
blender --background --python reel/world/review_film.py -- --quality-stills
blender --background --python reel/world/review_film.py -- --reading-stills

Uses the existing baked scene: no model rebuild, rope simulation or final movie.
The review uses 640x360 / 8 samples, updates moving poses at 15 fps (the cable
fall at 30 fps), and reuses one image throughout each reading rest. Encoding is
30 fps so the authored duration and pause lengths stay exactly 26.5 seconds.
Use --refresh only when the edit is confined to those frame intervals; omitted
intervals reuse the previous images. Without --refresh all images are updated.
--quality-stills renders only four 1920x1080 checkpoints, without saving the
scene, encoding a video or rebuilding any geometry.
--reading-stills renders the seven reading rests from world.json into
lab/review/desktop-rests, ready for desktop HTML layout validation.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
SCENE = HERE / 'lab/film/lab-film.blend'
OUT = HERE / 'lab/review/motion'


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def points(obj):
    return np.array([point.co[:3] for point in obj.data.splines[0].points])


def light_values(scene, film, lab):
    values = []
    for name in film.LIGHTS:
        data = bpy.data.lights[name]
        values.extend([data.energy, *data.color])
    node = scene.world.node_tree.nodes['Background']
    values.extend([*node.inputs[0].default_value, node.inputs[1].default_value])
    for name in ('Room detail / shelf diffuser', 'Room detail / lamp bulb', 'Room detail / linen shade', 'Detail / exterior sky'):
        material=bpy.data.materials.get(name)
        if material:
            values.append(lab.principled(material).inputs['Emission Strength'].default_value)
    return values


def screen_margin(scene, root):
    """Conservative mesh bounds, projected together with one camera matrix."""
    vertices = np.array([[*(obj.matrix_world @ Vector(corner)), 1]
                         for obj in root.children_recursive if obj.type == 'MESH' and not obj.hide_render
                         for corner in obj.bound_box])
    camera = scene.camera
    projection = camera.calc_matrix_camera(bpy.context.evaluated_depsgraph_get(), x=640, y=360)
    clip = np.array(projection @ camera.matrix_world.inverted())
    coords = vertices @ clip.T
    xy = coords[:, :2] / coords[:, 3, None] * .5 + .5
    return float(min(xy.min(), 1 - xy.max()))


def audit(scene, film, lab, animatic):
    geometry = load('lab_geometry')
    vehicle = bpy.data.objects['Vehicle / provisional placement']
    robot = bpy.data.objects['Robot / provisional placement']
    bottle = bpy.data.objects['BottleRoot']
    cable = bpy.data.objects['Connected coax loop']
    plug = bpy.data.objects['Coax / free plug']
    rolls = [obj for obj in vehicle.children_recursive if obj.name.endswith('_roll')]
    scene.frame_set(0)
    bottle_vertices = [bottle.matrix_world.inverted() @ p
                       for obj in bottle.children_recursive if obj.type in ('MESH', 'CURVE')
                       for p in geometry.world_vertices(obj)]
    plug_vertices = [plug.matrix_world.inverted() @ p
                     for obj in plug.children_recursive if obj.type == 'MESH'
                     for p in geometry.world_vertices(obj)]
    camera_error = 0
    aim_error = 0
    vehicle_margins = []
    robot_margins = []
    samples = []
    wheel_contacts=[]
    for frame in range(795):
        scene.frame_set(frame)
        if frame%200==0:print('CONTACT_AUDIT_FRAME',frame,flush=True)
        camera = scene.camera
        expected = animatic.camera_sample(frame)
        camera_error = max(camera_error, (camera.location - expected['position']).length)
        direction = camera.rotation_quaternion @ Vector((0, 0, -1))
        aim_error = max(aim_error, (direction - (expected['target'] - camera.location).normalized()).length)
        if 285 <= frame <= 345:
            vehicle_margins.append(screen_margin(scene, vehicle))
        if 435 <= frame <= 495:
            robot_margins.append(screen_margin(scene, robot))
        samples.append({
            'camera': [*camera.location, *camera.rotation_quaternion, camera.data.lens, camera.data.shift_x, camera.data.shift_y],
            'vehicle': list(vehicle.location), 'roll': rolls[0].rotation_euler.y,
            'robot': list(robot.location), 'bottle': list(bottle.matrix_world.translation),
            'bottle_bottom': min((bottle.matrix_world @ p).z for p in bottle_vertices),
            'lights': light_values(scene, film, lab),
            'cable_digest': hashlib.sha256(points(cable).tobytes()).hexdigest(),
        })
        wheel_contacts.extend((name,height,frame) for holder,kind in ((robot,'robot'),(vehicle,'vehicle'))
                              for name,height in geometry.floor_contacts(holder,kind).items())
    rest_drift = {}
    for segment in animatic.SEGMENTS:
        if segment['kind'] != 'rest':
            continue
        start, end = segment['frame_range']
        rows = samples[start:end]
        variation = {key: float(np.ptp(np.array([row[key] for row in rows]), axis=0).max())
                     for key in ('camera', 'vehicle', 'robot', 'bottle', 'lights')}
        variation['cable_changes'] = len(set(row['cable_digest'] for row in rows)) - 1
        rest_drift[segment['id']] = variation
    intersections = []
    for quarter in range(435 * 4, 495 * 4 + 1):
        frame = quarter / 4
        scene.frame_set(int(frame), subframe=frame % 1)
        wheel_contacts.extend((name,height,frame) for name,height in geometry.floor_contacts(robot,'robot').items())
        for side in ('Left', 'Right'):
            tip = geometry.world_bvh(bpy.data.objects[side + 'ArmTip'])
            for other in ('BottleBody', 'BottleLabel'):
                if tip.overlap(geometry.world_bvh(bpy.data.objects[other])):
                    intersections.append([frame, side, other])
    plug_bottoms = []
    for quarter in range(285*4,345*4+1):
        frame=quarter/4;scene.frame_set(int(frame),subframe=frame%1)
        wheel_contacts.extend((name,height,frame) for name,height in geometry.floor_contacts(vehicle,'vehicle').items())
    anchor_drift = 0
    lengths = []
    for quarter in range(170 * 4, 265 * 4 + 1):
        frame = quarter / 4
        scene.frame_set(int(frame), subframe=frame % 1)
        coords = points(cable)
        anchor_drift = max(anchor_drift, float(np.linalg.norm(coords[0] - np.array(animatic.SPEC['animatic']['coax_attachment_m']))))
        lengths.append(float(np.linalg.norm(np.diff(coords, axis=0), axis=1).sum()))
        plug_bottoms.append((min((plug.matrix_world @ p).z for p in plug_vertices), frame))
    errors = []
    stopped = []
    for frame in range(286, 346):
        a, b = samples[frame - 1:frame + 1]
        travel = (Vector(a['vehicle']) - Vector(b['vehicle'])).length
        turn = abs(b['roll'] - a['roll'])
        errors.append(abs(travel - turn * .75 * vehicle.scale.x))
        if travel > 1e-6 and turn < 1e-7:
            stopped.append(frame)
    closing = np.array([row['camera'][:3] for row in samples[675:766]])
    speed = np.linalg.norm(np.diff(closing, axis=0), axis=1)
    minima = [675 + i + 1 for i in range(1, len(speed) - 1)
              if speed[i] < speed[i - 1] and speed[i] < speed[i + 1]]
    static_contacts=geometry.static_support_contacts()
    (OUT/'static-supports.json').write_text(json.dumps(static_contacts,indent=2))
    report = {
        'camera_frames_checked': len(samples), 'camera_spec_error_m': camera_error,
        'wheel_contact_samples': len(wheel_contacts),
        'wheel_floor_gap_range_m': [min(row[1] for row in wheel_contacts),max(row[1] for row in wheel_contacts)],
        'static_supports_checked':len(static_contacts),
        'static_support_maximum_gap_m':max(row['gap_m'] for row in static_contacts),
        'camera_aim_direction_error': aim_error,
        'vehicle_departure_minimum_screen_margin': min(vehicle_margins),
        'robot_slide_minimum_screen_margin': min(robot_margins),
        'reading_rest_drift': rest_drift,
        'gripper_contact_samples': 241, 'gripper_intersections': intersections,
        'bottle_bottom_range_m': [min(row['bottle_bottom'] for row in samples), max(row['bottle_bottom'] for row in samples)],
        'plug_contact_samples': len(plug_bottoms), 'plug_minimum_floor_clearance_m_and_frame': min(plug_bottoms),
        'cable_anchor_drift_m': anchor_drift, 'render_curve_length_range_m': [min(lengths), max(lengths)],
        'physical_cable_length_error_fraction': cable['baked_length_error_fraction'],
        'cable_release_landing_settled': [cable.get(key) for key in ('release_frame', 'landing_frame', 'settled_frame')],
        'wheel_travel_spin_error_m': max(errors), 'moving_frames_with_stopped_wheels': stopped,
        'closing_interior_speed_minima': minima,
        'closing_camera_path': next(s['camera_path'] for s in animatic.SEGMENTS if s['id'] == 'return-wide'),
    }
    (OUT / 'audit.json').write_text(json.dumps(report, indent=2))
    assert camera_error < 1e-5, report
    assert all(abs(height)<.0001 for name,height,frame in wheel_contacts), sorted(wheel_contacts,key=lambda row:abs(row[1]))[-8:]
    assert aim_error < 1e-5, report
    assert min(vehicle_margins) > .02 and min(robot_margins) > .02, report
    assert all(value < 1e-7 for rest in rest_drift.values() for value in rest.values()), rest_drift
    assert not intersections, intersections
    assert max(abs(row['bottle_bottom']) for row in samples) < 1e-5
    assert min(plug_bottoms)[0] >= -.0001, min(plug_bottoms)
    assert anchor_drift < 1e-5
    assert max(errors) < 1e-5 and not stopped
    assert not minima, minima
    print('MOTION_AUDIT_PASSED', json.dumps(report), flush=True)
    return report


def render_preview(scene, lab, animatic, refresh_ranges=None):
    start = time.perf_counter()
    frames = OUT / 'frames'
    frames.mkdir(exist_ok=True)
    source_at = []
    for frame in range(795):
        segment = animatic.segment_at(frame)
        first = segment['frame_range'][0]
        if segment['kind'] == 'rest':
            source = first
        elif 170 <= frame <= 198:
            source = frame
        else:
            source = first + (frame - first) // 2 * 2
        source_at.append(source)
    unique = sorted(set(source_at))
    refreshed = 0
    lab.enable_cycles_gpu()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 8
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPTIX'
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_animated_seed = False
    scene.render.resolution_x = 640
    scene.render.resolution_y = 360
    scene.render.resolution_percentage = 100
    scene.render.image_settings.media_type = 'IMAGE'
    scene.render.image_settings.file_format = 'PNG'
    for index, frame in enumerate(unique):
        path = frames / f'frame-{frame:04d}.png'
        if refresh_ranges and path.exists() and not any(a <= frame <= b for a, b in refresh_ranges):
            continue
        scene.frame_set(frame)
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        refreshed += 1
        if index % 25 == 0 or index + 1 == len(unique):
            print('MOTION_PREVIEW_PROGRESS', index + 1, len(unique), round(time.perf_counter() - start, 1), flush=True)
    # Encode existing preview images with Blender's sequencer; no external ffmpeg
    # installation and no extra 3D rendering are needed for held poses.
    encode = bpy.data.scenes.new('Desktop motion review encode')
    editor = encode.sequence_editor_create()
    strip = editor.strips.new_image('Preview images', str(frames / f'frame-{source_at[0]:04d}.png'), channel=1, frame_start=0)
    for source in source_at[1:]:
        strip.elements.append(f'frame-{source:04d}.png')
    strip.frame_final_duration = 795
    encode.render.resolution_x = 640
    encode.render.resolution_y = 360
    encode.render.resolution_percentage = 100
    encode.render.fps = 30
    encode.frame_start, encode.frame_end = 0, 794
    encode.render.image_settings.media_type = 'VIDEO'
    encode.render.image_settings.file_format = 'FFMPEG'
    encode.render.ffmpeg.format = 'MPEG4'
    encode.render.ffmpeg.codec = 'H264'
    encode.render.ffmpeg.constant_rate_factor = 'MEDIUM'
    encode.render.ffmpeg.ffmpeg_preset = 'GOOD'
    encode.render.ffmpeg.audio_codec = 'NONE'
    encode.render.filepath = str(OUT / 'desktop-motion.mp4')
    # PNGs already contain the film's display transform.
    encode.view_settings.view_transform = 'Standard'
    encode.view_settings.look = 'None'
    encode.view_settings.exposure = 0
    bpy.ops.render.render(animation=True, scene=encode.name)
    metadata = {'scene': str(SCENE), 'preview': str(OUT / 'desktop-motion.mp4'),
                'size': [640, 360], 'samples': 8, 'rendered_3d_frames': len(unique),
                'encoded_frames': 795, 'fps': 30, 'duration_seconds': 26.5,
                'motion_update_fps': 15, 'cable_fall_update_fps': 30,
                'refreshed_3d_frames_this_run': refreshed,
                'elapsed_seconds': round(time.perf_counter() - start, 2),
                'source_frames': source_at, 'final_movie_replaced': False}
    (OUT / 'preview.json').write_text(json.dumps(metadata, indent=2))
    print('MOTION_PREVIEW_DONE', json.dumps({k: v for k, v in metadata.items() if k != 'source_frames'}), flush=True)


def render_quality_stills(scene, lab, checkpoints=None, destination=None):
    destination = destination or HERE / 'lab/review/desktop-quality'
    destination.mkdir(parents=True, exist_ok=True)
    protected = [SCENE, HERE / 'lab/film/lab-film.mp4', OUT / 'desktop-motion.mp4']
    before = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in protected}
    start = time.perf_counter()
    lab.enable_cycles_gpu()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPTIX'
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = .015
    scene.render.use_persistent_data = True
    scene.render.use_motion_blur = False
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.media_type = 'IMAGE'
    scene.render.image_settings.file_format = 'PNG'
    checkpoints = checkpoints or [(190, 'cable landing'), (325, 'vehicle handoff'),
                                   (483, 'robot grip and floor slide'), (765, 'wide close')]
    renders = []
    for frame, label in checkpoints:
        scene.frame_set(frame)
        scene.render.filepath = str(destination / f'frame-{frame:04d}.png')
        tick = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        camera=scene.camera
        renders.append({'frame': frame, 'label': label, 'file': scene.render.filepath,
                        'seconds': round(time.perf_counter() - tick, 2),
                        'camera': {'name': camera.name, 'matrix_world': [list(row) for row in camera.matrix_world],
                                   'lens_mm': camera.data.lens, 'shift': [camera.data.shift_x,camera.data.shift_y],
                                   'sensor_width_mm': camera.data.sensor_width, 'sensor_fit': camera.data.sensor_fit}})
        print('QUALITY_STILL', renders[-1], flush=True)
    after = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in protected}
    assert before == after, 'A protected scene or movie changed during still rendering'
    report = {'size': [1920, 1080], 'maximum_samples': 128,
              'adaptive_threshold': .015, 'denoiser': 'OPTIX',
              'renders': renders, 'elapsed_seconds': round(time.perf_counter() - start, 2),
              'protected_files_unchanged': before, 'rendered_animation': False}
    (destination / 'render.json').write_text(json.dumps(report, indent=2))
    print('QUALITY_STILLS_DONE', json.dumps(report), flush=True)


def render_reading_stills(scene, lab):
    """One current desktop image per authored reading rest; no HTML overlay yet."""
    rests=lab.WORLD['timeline']['rests']
    assert [rest['id'] for rest in rests]==lab.WORLD['fallbacks']['rest_order']
    destination=HERE/'lab/review/desktop-rests'
    render_quality_stills(scene,lab,[(rest['sample_frame'],rest['id']) for rest in rests],destination)
    path=destination/'render.json';report=json.loads(path.read_text())
    for row,rest in zip(report['renders'],rests):
        row['rest_id']=rest['id'];row['copy_id']=rest['copy_id']
        row['scroll_range_percent']=rest['scroll_range_percent']
        row['content_steps']=rest.get('content_steps',[])
    report['purpose']='Seven source stills for desktop text layout validation; HTML layout has not yet been validated'
    path.write_text(json.dumps(report,indent=2))
    print('SEVEN_READING_STILLS_DONE',flush=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    film = load('build_film')
    lab = load('build_lab')
    animatic = load('build_animatic')
    bpy.ops.wm.open_mainfile(filepath=str(SCENE))
    scene = bpy.context.scene
    raw = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--reading-stills' in raw:
        render_reading_stills(scene, lab)
        return
    if '--quality-stills' in raw:
        render_quality_stills(scene, lab)
        return
    audit(scene, film, lab, animatic)
    if '--preview' in raw:
        ranges = []
        for index, value in enumerate(raw):
            if value == '--refresh':
                ranges.append((int(raw[index + 1]), int(raw[index + 2])))
        render_preview(scene, lab, animatic, ranges)


if __name__ == '__main__':
    main()
