"""Play the detailed lab as one film.

The camera path is the animatic spline, including the updated rest poses.
Light follows world.json from morning to dusk and stays at dusk through the close.
The vehicle is scaled so its tires match the robot's. The coax drops off the
bench during the bench-to-floor move and stays attached at the matcher. The
robot closes its arms around the bottle and drives 30 cm with it; the bottle
does not change height.

blender --background --python reel/world/build_film.py
blender --background --python reel/world/build_film.py -- --preview
blender --background --python reel/world/build_film.py -- --render
"""
import importlib.util
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / "lab" / "film"


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def args():
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    start, end = 0, 795
    if "--start" in raw:
        start = int(raw[raw.index("--start") + 1])
    if "--end" in raw:
        end = int(raw[raw.index("--end") + 1])
    return start, end, "--stills" in raw, "--render" in raw, "--preview" in raw


def seat_on_rest(holder, collection_name, xy):
    """Put the frozen mesh center on the staging point. Source actions had undone it."""
    collection = bpy.data.collections[collection_name]
    points = []
    for obj in collection.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    center = (low + high) / 2
    holder.location.x += xy[0] - center.x
    holder.location.y += xy[1] - center.y
    holder.location.z += -low.z
    bpy.context.view_layer.update()
    kind='robot' if collection_name=='Device / robot' else 'vehicle'
    load('lab_geometry').ground_floor_device(holder,kind)
    return holder.location.copy()


def freeze_source_actions():
    """Studio files key their own motion. Keep the frame-1 pose and let the film drive travel."""
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in list(bpy.data.objects):
        if obj.animation_data is None or obj.animation_data.action is None:
            continue
        loc, rot, scale = obj.evaluated_get(depsgraph).matrix_local.decompose()
        obj.animation_data_clear()
        obj.rotation_mode = "QUATERNION"
        obj.location = loc
        obj.rotation_quaternion = rot
        obj.scale = scale
    bpy.context.view_layer.update()


def coax_shape(animatic):
    """Bake a cable with fixed length and contact against the bench and floor."""
    cable = bpy.data.objects['Connected coax loop']
    solver = load('coax_bake')
    result = solver.curve(animatic, cable)
    print('COAX_BAKE', {k:v for k,v in result.items() if k not in ('frames','rest')}, flush=True)
    return cable, result, solver



def apply_coax(animatic, cable, posed, stops, frame):
    stops.pose(cable, posed, frame)


def scroll_at(animatic, frame):
    segment = animatic.segment_at(frame)
    a, b = segment["frame_range"]
    start, end = segment["scroll_range_percent"]
    span = b - a
    blend = 0 if span == 0 else (frame - a) / span
    return start + (end - start) * blend


def light_scroll_at(animatic, frame):
    """Freeze the light at each reading pose; change time of day during travel."""
    rests = [segment for segment in animatic.SEGMENTS if segment['kind'] == 'rest']
    previous = rests[0]
    for rest in rests:
        if frame < rest['frame_range'][0]:
            start = previous['frame_range'][1]
            end = rest['frame_range'][0]
            blend = animatic.ease((frame - start) / (end - start))
            a = previous['scroll_range_percent'][0]
            b = rest['scroll_range_percent'][0]
            return a + (b - a) * blend
        if frame < rest['frame_range'][1]:
            return rest['scroll_range_percent'][0]
        previous = rest
    return rests[-1]['scroll_range_percent'][0]


LIGHTS = (
    "West window / open sky",
    "West window / low morning key",
    "Room / soft ceiling bounce",
    "Morning / sun through west window",
    "Desk lamp / 3000K",
    "Desk lamp / wall spill",
    "Floor / day fill",
    "Room / storage strip",
    "Room / linen corner lamp",
)


def key_lighting(lab, animatic, frame):
    lab.apply_lighting(light_scroll_at(animatic, frame))
    for name in LIGHTS:
        light = bpy.data.lights.get(name)
        if light is None:
            continue
        light.keyframe_insert("energy", frame=frame)
        light.keyframe_insert("color", frame=frame)
    for name in ('Room detail / shelf diffuser','Room detail / lamp bulb','Room detail / linen shade','Detail / exterior sky'):
        mat=bpy.data.materials.get(name)
        if mat:lab.principled(mat).inputs['Emission Strength'].keyframe_insert('default_value',frame=frame)
    background = bpy.context.scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs[0].keyframe_insert("default_value", frame=frame)
        background.inputs[1].keyframe_insert("default_value", frame=frame)


def key_coax(animatic, cable, posed, stops, frame):
    apply_coax(animatic, cable, posed, stops, frame)
    for point in cable.data.splines[0].points:
        point.keyframe_insert("co", frame=frame)
    plug=bpy.data.objects.get('Coax / free plug')
    if plug:
        plug.keyframe_insert('location',frame=frame)
        plug.keyframe_insert('rotation_quaternion',frame=frame)


def linearize_baked_actions():
    """Keep sampled motion and contacts from overshooting between frame keys."""
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag = strip.channelbag(slot)
                    if bag:
                        for curve in bag.fcurves:
                            for key in curve.keyframe_points:
                                key.interpolation = 'LINEAR'


def prepare_scrub_view(scene, scene_lighting=True):
    for marker in list(scene.timeline_markers):
        if marker.name.startswith('Review /'):
            scene.timeline_markers.remove(marker)
    carrier=next(c for c in load('build_animatic').SPEC['staging'] if c['id']=='coax-slack')
    cable=bpy.data.objects.get('Connected coax loop')
    landing=int(cable.get('landing_frame',carrier['release_frame']+16)) if cable else carrier['release_frame']+16
    for frame, label in ((0,'bench'),(carrier['release_frame'],'cable slips'),(landing,'cable lands'),
                         (carrier['settled_frame'],'cable settled'),(315,'wheel cruise'),(405,'arms open'),(470,'bottle contact'),
                         (555,'eyes, ring and lamp'),(645,'pinboard'),(765,'wide close')):
        scene.timeline_markers.new('Review / '+label,frame=frame)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.shading.type='MATERIAL'
                space.shading.use_scene_lights=scene_lighting
                space.shading.use_scene_world=scene_lighting
                space.clip_start=.005
                space.clip_end=100
                space.region_3d.view_perspective='CAMERA'


def bake_floor_subframes(scene,lab):
    """Keep polygonal tire contact between whole-frame roll samples as well."""
    original=scene.frame_current;count=0
    for kind,start,end in (('vehicle',285,345),('robot',435,495)):
        holder=bpy.data.objects[kind.title()+' / provisional placement']
        for quarter in range(start*4,end*4+1):
            if quarter%4==0:continue
            frame=quarter/4;scene.frame_set(int(frame),subframe=frame%1)
            lab.geometry().ground_floor_device(holder,kind,keep_bottle=kind=='robot')
            holder.keyframe_insert('location',frame=frame,index=2)
            if kind=='robot':
                bpy.data.objects['BottleRoot'].keyframe_insert('location',frame=frame,index=2)
                for side in ('Left','Right'):bpy.data.objects[side+'ArmPivot'].keyframe_insert('location',frame=frame,index=2)
            count+=1
    linearize_baked_actions();scene.frame_set(original)
    return count


def main():
    start, end, stills, render, preview = args()
    animatic = load("build_animatic")
    lab = load("build_lab")
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(HERE / "lab" / "lab.blend"))
    scene = bpy.context.scene
    freeze_source_actions()
    lab.match_vehicle_wheels()
    vehicle = bpy.data.objects["Vehicle / provisional placement"]
    robot = bpy.data.objects["Robot / provisional placement"]
    vehicle_path = animatic.SPEC["animatic"]["vehicle_path_m"]
    robot_path = animatic.SPEC["animatic"]["robot_path_m"]
    vehicle_rest = seat_on_rest(vehicle, "Device / vehicle", vehicle_path[0][:2])
    robot_rest = seat_on_rest(robot, "Device / robot", robot_path[0][:2])
    print("DESK", lab.restyle_desk(), flush=True)
    print('FLOOR', lab.geometry().floor_markings(lab._lab_api()), flush=True)
    print('LAMP', lab.desk_lamp(), flush=True)
    lab.lamp_spill()
    rear=lab.geometry().rear_coax_connection(lab._lab_api())
    animatic.SPEC['animatic']['coax_attachment_m']=rear['anchor_m']
    print('REAR_COAX',rear,flush=True)
    print('CONTEXT',load('lab_context').furnish(lab._lab_api()),flush=True)
    print('LOOK',load('lab_look').apply(lab._lab_api()),flush=True)
    print('WHEEL_CUES',lab.geometry().wheel_rotation_cues(lab._lab_api(),vehicle),flush=True)
    vehicle_origin = Vector(vehicle_path[0])
    robot_origin = Vector(robot_path[0])
    rolls = [obj for obj in vehicle.children_recursive if obj.name.endswith("_roll")]
    for roll in rolls:
        roll.animation_data_clear()
        roll.rotation_mode='XYZ'
    robot_wheels = [obj for obj in robot.children_recursive if obj.name.startswith("WheelPivot_")]
    arms = [obj for obj in robot.children_recursive if obj.name.endswith("ArmPivot")]
    arm_open = {arm.name: arm.rotation_euler.z for arm in arms}
    vehicle_radius = 0.75 * vehicle.scale.x
    robot_radius = 0.55 * robot.scale.x
    lane_length = (Vector(vehicle_path[1]) - Vector(vehicle_path[0])).length
    robot_travel = (Vector(robot_path[1]) - Vector(robot_path[0])).length
    cable, coax_posed, coax_stops = coax_shape(animatic)
    apply_coax(animatic,cable,coax_posed,coax_stops,0)
    bpy.ops.wm.save_mainfile()

    camera_data = bpy.data.cameras.new("Film camera")
    camera_data.sensor_width = 36
    camera_data.clip_start = 0.02
    camera_data.clip_end = 40
    camera = bpy.data.objects.new("Film / one camera", camera_data)
    camera.rotation_mode = "QUATERNION"
    scene.collection.objects.link(camera)
    scene.camera = camera

    previous = None
    for frame in range(0, 795):
        scene.frame_set(frame)
        sample = animatic.camera_sample(frame)
        camera.location = sample["position"]
        rotation = (sample["target"] - camera.location).to_track_quat("-Z", "Y")
        if previous is not None and rotation.dot(previous) < 0:
            rotation.negate()
        previous = rotation.copy()
        camera.rotation_quaternion = rotation
        camera.data.lens = sample["lens"]
        camera.data.shift_x = sample["shift"]
        camera.data.shift_y = sample["shift_y"]
        camera.keyframe_insert("location", frame=frame)
        camera.keyframe_insert("rotation_quaternion", frame=frame)
        camera.data.keyframe_insert("lens", frame=frame)
        camera.data.keyframe_insert("shift_x", frame=frame)
        camera.data.keyframe_insert("shift_y", frame=frame)

        depart = animatic.vehicle_progress(animatic.phase(frame, "vehicle-depart"))
        vehicle.location = vehicle_rest + (Vector(animatic.lerp(*vehicle_path, depart)) - vehicle_origin)
        vehicle.location.z = vehicle_rest.z
        vehicle.keyframe_insert("location", frame=frame)
        lift = animatic.phase(frame, "robot-lift")
        drive = animatic.ease(max(0, (lift - 0.45) / 0.55))
        robot.location = robot_rest + (Vector(animatic.lerp(*robot_path, drive)) - robot_origin)
        robot.location.z = robot_rest.z
        robot.keyframe_insert("location", frame=frame)

        distance = lane_length * depart
        for roll in rolls:
            roll.rotation_euler = (0, -distance / vehicle_radius, 0)
            roll.keyframe_insert("rotation_euler", frame=frame)
        close = animatic.ease(min(1, lift / 0.45)) if lift else 0
        for arm in arms:
            opened = arm_open[arm.name]
            arm.rotation_euler.z = opened + (float(arm['closed_angle']) - opened) * close
            arm.keyframe_insert("rotation_euler", frame=frame)
        for wheel in robot_wheels:
            wheel.rotation_euler.x = (robot_travel * drive) / robot_radius
            wheel.keyframe_insert("rotation_euler", frame=frame)
        # Bounding boxes and the bottle are not the wheel support surface.
        # Bake contact after rolling, including the tread's changing phase.
        for holder,kind in ((vehicle,'vehicle'),(robot,'robot')):
            lab.geometry().ground_floor_device(holder,kind,keep_bottle=kind=='robot')
            holder.keyframe_insert('location',frame=frame)
        bpy.data.objects['BottleRoot'].keyframe_insert('location',frame=frame,index=2)
        for arm in arms:arm.keyframe_insert('location',frame=frame,index=2)
        key_lighting(lab, animatic, frame)
        if frame in (0, 119, coax_posed['start_frame']-1, 794) or coax_posed['start_frame'] <= frame <= coax_posed['end_frame']:
            key_coax(animatic, cable, coax_posed, coax_stops, frame)

    print('FLOOR_SUBFRAMES',bake_floor_subframes(scene,lab),flush=True)

    def on_frame(scene, *depsgraph):
        lab.apply_lighting(light_scroll_at(animatic, scene.frame_current))
        apply_coax(animatic, cable, coax_posed, coax_stops, scene.frame_current)

    bpy.app.handlers.frame_change_pre.clear()
    bpy.app.handlers.frame_change_pre.append(on_frame)

    linearize_baked_actions()
    lab.enable_cycles_gpu()
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 8
    scene.cycles.use_denoising = True
    scene.cycles.adaptive_threshold = 0.05
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.4
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.fps = 30
    scene.frame_start = start
    scene.frame_end = end - 1
    if stills:
        scene.render.image_settings.media_type = "IMAGE"
        scene.render.image_settings.file_format = "PNG"
        for frame in (0, 90, 255, 405, 555, 645, 765):
            scene.frame_set(frame)
            apply_coax(animatic, cable, coax_posed, coax_stops, frame)
            scene.render.filepath = str(OUT / f"frame-{frame:04d}.png")
            bpy.ops.render.render(write_still=True)
            print("STILL", frame, flush=True)
        print("STILLS_DONE", flush=True)
        return
    scene.render.image_settings.media_type = "VIDEO"
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "HIGH"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.ffmpeg.audio_codec = "NONE"
    scene.render.filepath = str(OUT / "lab-film.mp4")
    scene.render.use_file_extension = True
    scene.frame_set(start)
    apply_coax(animatic, cable, coax_posed, coax_stops, start)
    prepare_scrub_view(scene)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "lab-film.blend"))
    print("FILM_SAVED", OUT / "lab-film.blend", flush=True)
    if preview:
        scene.render.engine = "BLENDER_EEVEE"
        if hasattr(scene, "eevee"):
            scene.eevee.taa_render_samples = 16
        scene.render.image_settings.media_type = "IMAGE"
        scene.render.image_settings.file_format = "PNG"
        for frame in (0, 165, 210, 405, 470, 555, 720, 765):
            scene.frame_set(frame)
            apply_coax(animatic, cable, coax_posed, coax_stops, frame)
            scene.render.filepath = str(OUT / f"preview-{frame:04d}.png")
            bpy.ops.render.render(write_still=True)
            print("PREVIEW", frame, flush=True)
        print("PREVIEW_DONE", flush=True)
        return
    if not render:
        return
    bpy.ops.render.render(animation=True)
    print("FILM_RENDERED", start, end, flush=True)


if __name__ == "__main__":
    main()
