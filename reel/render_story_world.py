#!/usr/bin/env python3
"""Render transparent 3D project drives for a paper page.

The page is the world. Videos keep alpha. Vehicle and robot sit on HTML type.
One clip per moment × orientation — theme is CSS, not a second encode.

Usage:
  blender --background --python reel/render_story_world.py -- --preview --moment vehicle
  blender --background --python reel/render_story_world.py -- --moment matcher
  blender --background --python reel/render_story_world.py
"""

from math import radians
from pathlib import Path
import json
import shutil
import subprocess
import sys

import bpy
from mathutils import Euler, Vector


ROOT = Path(__file__).resolve().parent.parent
REEL = ROOT / "reel"
WORK = REEL / "moments"
OUTPUT_DIR = ROOT / "public" / "assets" / "stories" / "moments"
MATCHER_BLEND = REEL / "models" / "impedance-studio.blend"
MATCHER_GLB = REEL / "models" / "impedance.glb"

sys.path.insert(0, str(REEL))
sys.path.insert(0, str(REEL / "vehicle"))

from model import animate_vehicle, build_vehicle  # noqa: E402
from render_orbit import combined_bounds, objects_prefixed, paint_named_parts, tone_materials  # noqa: E402
from render_robot import build_bottle, build_robot, create_materials as create_robot_materials  # noqa: E402


FPS = 30
FRAME_START = 1
SAMPLES_DEFAULT = 16
SAMPLES_FAST = 12
LANDSCAPE = (1440, 1080)
PORTRAIT = (900, 900)
# Screen Y of the tire contact, as a fraction from the top. HTML type sits here.
ROAD_HORIZON = 0.55
MATCHER_STUDIO = (
    "KeyLight",
    "RimLight",
    "FillLight",
    "WellFloor",
    "OrbitCam",
    "OrbitPivot",
)
MATCHER_RADIUS = 2.55
CAPACITOR_PREFIXES = (
    "Linear Variable Capacitor",
    "Linear Cap",
    "Logarithmic Variable Capacitor",
    "Log Cap",
    "10-500PF",
)
CAPACITOR_FAMILIES = (
    ("Linear Variable Capacitor", "Linear Cap"),
    ("Logarithmic Variable Capacitor", "Log Cap"),
    ("10-500PF",),
)
ENCLOSURE_EXTRA_PREFIXES = (
    "PEC12R",
    "Socket button head screw",
    "Hex nut",
    "94356A118",
)
STEPPER_HARDWARE_PREFIXES = (
    "Motor Spacer",
    "Coupler",
    "Hex socket head cap screw",
)

MOMENTS = {
    "matcher": {
        "frame_end": 90,
        "shots": (
            {"id": "interface", "end": 30, "label": "Interface and control"},
            {"id": "tuning", "end": 60, "label": "Stepper-driven tuning"},
            {"id": "measured", "end": 90, "label": "Measured match"},
        ),
        "poster": 1,
    },
    "vehicle": {
        "frame_end": 120,
        "shots": (
            {"id": "pid", "end": 30, "label": "PID"},
            {"id": "uart", "end": 60, "label": "UART"},
            {"id": "lcd", "end": 90, "label": "LCD"},
            {"id": "rtos", "end": 120, "label": "Context switch"},
        ),
        "poster": 72,
    },
    "robot": {
        "frame_end": 90,
        "shots": (
            {"id": "detect", "end": 30, "label": "Detect"},
            {"id": "command", "end": 60, "label": "Command"},
            {"id": "collect", "end": 90, "label": "Collect"},
        ),
        "poster": 72,
    },
}


def args_after_separator():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def parse_args():
    raw = args_after_separator()
    samples = SAMPLES_FAST if "--fast" in raw else SAMPLES_DEFAULT
    if "--samples" in raw:
        index = raw.index("--samples")
        if index + 1 < len(raw):
            samples = int(raw[index + 1])
    orientation = "both"
    if "--orientation" in raw:
        index = raw.index("--orientation")
        if index + 1 < len(raw):
            orientation = raw[index + 1]
    moment = "all"
    if "--moment" in raw:
        index = raw.index("--moment")
        if index + 1 < len(raw):
            moment = raw[index + 1]
    if orientation not in {"landscape", "portrait", "both"}:
        raise SystemExit("orientation must be landscape, portrait, or both")
    if moment not in {"all", *MOMENTS}:
        raise SystemExit("moment must be matcher, vehicle, robot, or all")
    return {
        "preview": "--preview" in raw,
        "encode_only": "--encode-only" in raw,
        "from_glb": "--from-glb" in raw,
        "orientation": orientation,
        "moment": moment,
        "samples": samples,
    }


def empty(name, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    return obj


def parent_keep_world(child, parent):
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    child.matrix_world = world


def point_at(obj, target):
    destination = target if isinstance(target, Vector) else Vector(target)
    obj.rotation_euler = (destination - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, size, color, target):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    point_at(obj, target)
    return obj


def setup_studio(target):
    """Bright key, real fill, thin rim. World is lighting only — film stays transparent."""
    look = target if isinstance(target, Vector) else Vector(target)
    world = bpy.data.worlds.new("AuthoredStudio")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.82, 0.78, 0.70, 1.0)
    background.inputs["Strength"].default_value = 0.22
    bpy.context.scene.world = world
    add_area("Key", (look.x - 5.2, look.y - 11.0, look.z + 9.4), 2100, 6.0, (1.0, 0.88, 0.72), look)
    add_area("Fill", (look.x + 7.2, look.y - 6.4, look.z + 4.8), 800, 8.0, (0.78, 0.86, 1.0), look)
    add_area("Rim", (look.x + 4.6, look.y + 9.0, look.z + 2.4), 640, 1.4, (0.62, 0.82, 1.0), look)


def descendant_meshes(root):
    found = []

    def walk(obj):
        if obj.type == "MESH" and not obj.name.startswith("Studio"):
            found.append(obj)
        for child in obj.children:
            walk(child)

    walk(root)
    return found


def seat_on_ground(root, move_root=False):
    """Put the subject's lowest point on z=0 without changing later root animation."""
    bpy.context.view_layer.update()
    meshes = descendant_meshes(root)
    if not meshes:
        return 0.0
    mins, _maxs = combined_bounds(meshes)
    lift = -mins.z
    if abs(lift) < 1e-4:
        return 0.0
    if move_root:
        root.location.z += lift
    else:
        for child in root.children:
            child.location.z += lift
    bpy.context.view_layer.update()
    return lift


def add_studio_ground():
    """No mesh ground. Tires register to HTML type; paper shows through alpha."""
    return None


def reveal_from(obj, start):
    if not obj:
        return
    targets = [obj]
    stack = list(obj.children)
    while stack:
        child = stack.pop()
        targets.append(child)
        stack.extend(child.children)
    for target in targets:
        target.hide_render = True
        target.keyframe_insert("hide_render", frame=FRAME_START)
        if start > FRAME_START:
            target.hide_render = True
            target.keyframe_insert("hide_render", frame=start - 1)
        target.hide_render = False
        target.keyframe_insert("hide_render", frame=start)


def configure_render(frame_end, resolution, samples, preview=False):
    scene = bpy.context.scene
    engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.fps = FPS
    scene.frame_start = FRAME_START
    scene.frame_end = frame_end
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 50 if preview else 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.use_file_extension = True
    scene.render.use_overwrite = True
    if hasattr(scene.render, "use_motion_blur"):
        scene.render.use_motion_blur = False
    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = 8 if preview else samples
        if hasattr(scene.eevee, "use_raytracing"):
            scene.eevee.use_raytracing = False
        if hasattr(scene.eevee, "use_gtao"):
            scene.eevee.use_gtao = True
        if hasattr(scene.eevee, "use_shadows"):
            scene.eevee.use_shadows = True
        if hasattr(scene.eevee, "use_volumetric_shadows"):
            scene.eevee.use_volumetric_shadows = False
    try:
        scene.view_settings.view_transform = "AgX"
    except TypeError:
        scene.view_settings.view_transform = "AgX"
    for look_name in ("None", ""):
        try:
            scene.view_settings.look = look_name
            break
        except TypeError:
            continue
    scene.view_settings.exposure = 0.15


def make_camera(name, location, look, lens=56):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36
    data.clip_start = 0.08
    data.clip_end = 80
    data.dof.use_dof = False
    camera = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(camera)
    camera.location = location
    point_at(camera, look)
    bpy.context.scene.camera = camera
    return camera


def key_camera(camera, frames):
    for frame, location, look, lens in frames:
        camera.location = location
        camera.data.lens = lens
        point_at(camera, look)
        camera.keyframe_insert("location", frame=frame)
        camera.keyframe_insert("rotation_euler", frame=frame)
        camera.data.keyframe_insert("lens", frame=frame)


def scene_meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def strip_matcher_studio():
    for name in MATCHER_STUDIO:
        obj = bpy.data.objects.get(name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)
    for obj in list(bpy.context.scene.objects):
        if obj.type in {"LIGHT", "CAMERA"}:
            bpy.data.objects.remove(obj, do_unlink=True)


def wrap_matcher():
    meshes = scene_meshes()
    if not meshes:
        raise SystemExit("Matcher imported with no mesh objects")
    mins, maxs = combined_bounds(meshes)
    center = (mins + maxs) * 0.5
    size = maxs - mins
    radius = max(size.x, size.y, size.z) * 0.5
    root = empty("MatcherRoot", location=center)
    for obj in bpy.context.scene.objects:
        if obj != root and obj.parent is None:
            parent_keep_world(obj, root)
    scale = MATCHER_RADIUS / max(radius, 0.001)
    root.location = Vector((0.0, 0.0, 0.0))
    root.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    return root


def objects_prefixed_any(*prefixes):
    return [obj for obj in scene_meshes() if obj.name.startswith(prefixes)]


def mesh_center(meshes):
    mins, maxs = combined_bounds(meshes)
    return (mins + maxs) * 0.5


def bounds_volume(meshes):
    mins, maxs = combined_bounds(meshes)
    size = maxs - mins
    return max(size.x, 0.001) * max(size.y, 0.001) * max(size.z, 0.001)


def split_meshes_by_x(meshes):
    if len(meshes) <= 1:
        return list(meshes), []
    mid = sum((obj.matrix_world.translation.x for obj in meshes), 0.0) / len(meshes)
    left = [obj for obj in meshes if obj.matrix_world.translation.x <= mid]
    right = [obj for obj in meshes if obj.matrix_world.translation.x > mid]
    if not left or not right:
        return list(meshes), []
    return left, right


def meshes_near(seeds, candidates, pad=0.35):
    if not seeds or not candidates:
        return []
    mins, maxs = combined_bounds(seeds)
    mins -= Vector((pad, pad, pad))
    maxs += Vector((pad, pad, pad))
    nearby = []
    for obj in candidates:
        center = obj.matrix_world.translation
        if (
            mins.x <= center.x <= maxs.x
            and mins.y <= center.y <= maxs.y
            and mins.z <= center.z <= maxs.z
        ):
            nearby.append(obj)
    return nearby


def group_matcher_parts(name, meshes, root):
    if not meshes:
        return None
    mins, maxs = combined_bounds(meshes)
    pivot = empty(name, location=(mins + maxs) * 0.5)
    pivot.rotation_mode = "XYZ"
    for mesh in meshes:
        parent_keep_world(mesh, pivot)
    parent_keep_world(pivot, root)
    bpy.context.view_layer.update()
    return pivot


def world_to_local_delta(obj, world_delta):
    # parent_keep_world stores parent.matrix_world.inverted() on the child, so
    # location is already world-equivalent. Include that inverse or the offset
    # gets scaled twice and the assemble reads as static.
    basis = obj.matrix_parent_inverse.copy()
    if obj.parent is not None:
        basis = obj.parent.matrix_world @ basis
    linear = basis.to_3x3()
    if abs(linear.determinant()) < 1e-8:
        return Vector(world_delta)
    return linear.inverted() @ Vector(world_delta)


def key_transform(obj, frame, location, rotation):
    obj.location = location
    obj.rotation_euler = rotation
    obj.keyframe_insert("location", frame=frame)
    obj.keyframe_insert("rotation_euler", frame=frame)


def smooth_keys(obj):
    action = obj.animation_data.action if obj.animation_data else None
    if not action:
        return
    fcurves = getattr(action, "fcurves", None)
    if not fcurves:
        return
    for fcurve in fcurves:
        for point in fcurve.keyframe_points:
            point.interpolation = "BEZIER"
            point.easing = "EASE_IN_OUT"


def assemble_group(obj, world_offset, rot_offset, start, end, hold_end, extra=None):
    assembled_loc = obj.location.copy()
    assembled_rot = obj.rotation_euler.copy()
    offset = world_to_local_delta(obj, world_offset)
    start_loc = assembled_loc + offset
    start_rot = Euler(
        (
            assembled_rot.x + rot_offset[0],
            assembled_rot.y + rot_offset[1],
            assembled_rot.z + rot_offset[2],
        )
    )
    prefs = bpy.context.preferences.edit
    previous = getattr(prefs, "keyframe_new_interpolation_type", None)
    if previous is not None:
        prefs.keyframe_new_interpolation_type = "BEZIER"
    if start > FRAME_START:
        key_transform(obj, FRAME_START, start_loc, start_rot)
    key_transform(obj, start, start_loc, start_rot)
    for frame, loc_mix, rot in extra or ():
        mixed = start_loc.lerp(assembled_loc, loc_mix)
        keyed = Euler(
            (
                assembled_rot.x + rot[0],
                assembled_rot.y + rot[1],
                assembled_rot.z + rot[2],
            )
        )
        key_transform(obj, frame, mixed, keyed)
    key_transform(obj, end, assembled_loc, assembled_rot)
    key_transform(obj, hold_end, assembled_loc, assembled_rot)
    if previous is not None:
        prefs.keyframe_new_interpolation_type = previous
    smooth_keys(obj)


def animate_matcher_assemble(root, frame_end=120):
    """Keyframe named CAD groups onto the four HUD beats around the main box."""
    enclosure_meshes = objects_prefixed("Main Electronics Housing") + objects_prefixed("OLED Screen")
    enclosure_meshes += objects_prefixed("PEC12R")
    enclosure_meshes += meshes_near(enclosure_meshes, objects_prefixed_any(*ENCLOSURE_EXTRA_PREFIXES), pad=0.55)
    enclosure_meshes = list(dict.fromkeys(enclosure_meshes))
    stepper_meshes = objects_prefixed("17HM15")
    left_steppers, right_steppers = split_meshes_by_x(stepper_meshes)
    # Spacer/coupler/screw origins sit on the CAD occurrence, not the mesh, so
    # meshes_near never sees them. Split each family by X the same way as motors.
    for prefix in STEPPER_HARDWARE_PREFIXES:
        left_hw, right_hw = split_meshes_by_x(objects_prefixed(prefix))
        left_steppers.extend(left_hw)
        right_steppers.extend(right_hw)
    left_steppers = list(dict.fromkeys(left_steppers))
    right_steppers = list(dict.fromkeys(right_steppers))
    box_meshes = objects_prefixed("Aluminum Box")
    cap_families = []
    for prefixes in CAPACITOR_FAMILIES:
        family = objects_prefixed_any(*prefixes)
        if family:
            cap_families.append(family)
    cap_families.sort(key=bounds_volume, reverse=True)
    box = group_matcher_parts("AssembleBox", box_meshes, root)
    enclosure = group_matcher_parts("AssembleEnclosure", enclosure_meshes, root)
    stepper_l = group_matcher_parts("AssembleStepperL", left_steppers, root)
    stepper_r = group_matcher_parts("AssembleStepperR", right_steppers, root)
    cap_groups = []
    for index, family in enumerate(cap_families):
        pivot = group_matcher_parts(f"AssembleCaps{index}", family, root)
        if pivot:
            cap_groups.append((pivot, family))
    print(
        "MATCHER GROUPS "
        f"box={len(box_meshes)} enclosure={len(enclosure_meshes)} "
        f"stepperL={len(left_steppers)} stepperR={len(right_steppers)} "
        f"capFamilies={[len(family) for family in cap_families]}",
        flush=True,
    )
    # Begin assembled. Open only the relevant groups, then return to the real assembly.
    for group, offset, first, last in (
        (enclosure, Vector((.15,-1.0,.12)), 22, 39),
        (stepper_l, Vector((-.65,0,.2)), 42, 64),
        (stepper_r, Vector((.65,0,.2)), 42, 64),
        *((pivot, Vector((0,0,.9)),42,64) for pivot,_ in cap_groups),
    ):
        if not group: continue
        rest=group.location.copy(); rotation=group.rotation_euler.copy()
        for frame,mix in ((1,0),(max(2,first-8),0),(first,1),(last,1),(min(frame_end,last+12),0),(frame_end,0)):
            key_transform(group,frame,rest+offset*mix,rotation)
        smooth_keys(group)


def look_point(kind, fallback):
    if kind == "oled":
        found = objects_prefixed("OLED Screen") or objects_prefixed("Main Electronics Housing")
    elif kind == "stepper":
        found = objects_prefixed("17HM15")
    else:
        found = objects_prefixed("Aluminum Box") or objects_prefixed("Main Electronics Housing")
    if not found:
        return fallback
    mins, maxs = combined_bounds(found)
    return (mins + maxs) * 0.5


def build_matcher_scene(from_glb, orientation, preview, samples):
    if from_glb or not MATCHER_BLEND.exists():
        if not MATCHER_GLB.exists():
            raise SystemExit(f"Missing matcher source: {MATCHER_GLB}")
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(MATCHER_GLB))
        paint_named_parts()
        tone_materials()
    else:
        bpy.ops.wm.open_mainfile(filepath=str(MATCHER_BLEND))
        strip_matcher_studio()
        paint_named_parts()
        tone_materials()
    root = wrap_matcher()
    seat_on_ground(root, move_root=True)
    frame_end = MOMENTS["matcher"]["frame_end"]
    animate_matcher_assemble(root, frame_end)
    body = look_point("body", Vector((0.05, 0.05, 0.45)))
    oled = look_point("oled", body)
    resolution = PORTRAIT if orientation == "portrait" else LANDSCAPE
    camera=make_camera("MatcherCam", (8,-13,7), body, 48)
    key_camera(camera,[(1,(8,-13,7),body,48),(22,(8,-13,7),body,48),(40,(7,-13,8),body,48),(65,(5,-12,10),body,48),(90,(8,-13,7),body,48)])
    setup_studio(body)
    add_studio_ground()
    configure_render(frame_end, resolution, samples, preview)
    return bpy.context.scene


def build_vehicle_scene(orientation, preview, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root, wheels = build_vehicle()
    seat_on_ground(root)
    frame_end = MOMENTS["vehicle"]["frame_end"]
    # Short travel with long reading holds, then an overhead view of construction.
    for frame,x in ((1,-.7),(25,0),(70,0),(120,.6)):
        root.location=(x,0,0); root.keyframe_insert("location",frame=frame)
        for wheel in wheels:
            wheel["roll"].rotation_euler.y=-x/.75
            wheel["roll"].keyframe_insert("rotation_euler",frame=frame)
    resolution = PORTRAIT if orientation == "portrait" else LANDSCAPE
    camera=make_camera("VehicleCam",(9,-14,7),(0,0,1),48)
    key_camera(camera,[(1,(9,-14,7),(0,0,1),48),(30,(9,-14,7),(0,0,1),48),(60,(7,-12,11),(0,0,1),48),(90,(3,-8,15),(0,0,1),48),(120,(3,-8,15),(0,0,1),48)])
    setup_studio((0,0,1))
    add_studio_ground()
    configure_render(frame_end, resolution, samples, preview)
    return bpy.context.scene


def animate_robot_lane(root, wheels, scan, arms, bottle, frame_end=90):
    # Drive on from off-camera -X (screen-right after CSS flip), work, then clear +X.
    heading = radians(90)
    reach = 4.40
    grab = 68
    keys = (
        (1, -11.4, 0.0, 0.0),
        (3, -11.4, 0.0, 0.0),
        (9, 0.42, 0.0, 0.0),
        (20, 0.55, 0.0, 0.0),
        (30, 0.95, 0.0, radians(1.4)),
        (60, 1.18, 0.0, 0.0),
        (grab, 1.28, 0.006, 0.0),
        (78, 2.15, 0.0, 0.0),
        (frame_end, 9.4, 0.0, 0.0),
    )
    root.rotation_mode = "XYZ"
    for frame, x, z, wobble in keys:
        root.location = (x, 0.0, z)
        root.rotation_euler = (0.0, 0.0, heading + wobble)
        root.keyframe_insert("location", frame=frame)
        root.keyframe_insert("rotation_euler", frame=frame)

    wheel_radius = 0.55
    start_x = keys[0][1]
    for wheel in wheels:
        wheel.rotation_mode = "XYZ"
        for frame, x, _, _ in keys:
            wheel.rotation_euler.x = (x - start_x) / wheel_radius
            wheel.keyframe_insert("rotation_euler", frame=frame, index=0)

    scan.rotation_euler = (0.0, 0.0, 0.0)

    left, right = arms
    for arm, sign in ((left, -1), (right, 1)):
        for frame, degrees in ((1, 28), (46, 28), (58, 8), (grab, 6), (frame_end, 5)):
            arm.rotation_euler.z = radians(sign * degrees)
            arm.keyframe_insert("rotation_euler", frame=frame, index=2)

    grab_pose = next(key for key in keys if key[0] == grab)
    parked = grab_pose[1] + reach
    off_screen = 12.4
    bottle.rotation_euler = (0.0, 0.0, 0.0)
    for frame, x in ((1, off_screen), (22, off_screen), (34, parked), (grab - 1, parked)):
        bottle.location = (x, 0.0, 0.0)
        bottle.keyframe_insert("location", frame=frame)
    bpy.context.view_layer.update()

    grab_x, grab_z = grab_pose[1], grab_pose[2]
    bottle.location = (parked, 0.0, 0.0)
    root.location = (grab_x, 0.0, grab_z)
    root.rotation_euler = (0.0, 0.0, heading)
    bpy.context.view_layer.update()

    constraint = bottle.constraints.new("CHILD_OF")
    constraint.target = root
    constraint.inverse_matrix = root.matrix_world.inverted()
    constraint.influence = 0.0
    constraint.keyframe_insert("influence", frame=1)
    constraint.keyframe_insert("influence", frame=grab - 1)
    constraint.influence = 1.0
    constraint.keyframe_insert("influence", frame=grab)


def build_robot_scene(orientation, preview, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = create_robot_materials()
    root, wheels, scan, arms = build_robot(mats)
    seat_on_ground(root)
    bottle = build_bottle(mats)
    seat_on_ground(bottle)
    frame_end = MOMENTS["robot"]["frame_end"]
    # The reference supports planar arm closure. Keep the bottle on the ground.
    for frame,y in ((1,.5),(30,.1),(60,0),(90,-.1)):
        root.location=(0,y,0); root.keyframe_insert("location",frame=frame)
        for wheel in wheels:
            wheel.rotation_euler.x=-y/.55; wheel.keyframe_insert("rotation_euler",frame=frame)
    for arm,sign in zip(arms,(-1,1)):
        for frame,angle in ((1,24),(48,24),(72,8),(90,8)):
            arm.rotation_euler.z=radians(sign*angle); arm.keyframe_insert("rotation_euler",frame=frame)
    bottle.location=(0,-4.0,0)
    resolution = PORTRAIT if orientation == "portrait" else LANDSCAPE
    camera=make_camera("RobotCam",(10,13,11),(0,-.7,.8),46)
    key_camera(camera,[(1,(10,13,11),(0,-.7,.8),46),(30,(10,13,11),(0,-.7,.8),46),(55,(9,11,13),(0,-.7,.8),46),(72,(10,9,10),(0,-.7,.8),46),(90,(10,9,10),(0,-.7,.8),46)])
    setup_studio((0,0,1))
    add_studio_ground()
    configure_render(frame_end, resolution, samples, preview)
    return bpy.context.scene


def build_moment(moment, orientation, from_glb, preview, samples):
    if moment == "matcher":
        return build_matcher_scene(from_glb, orientation, preview, samples)
    if moment == "vehicle":
        return build_vehicle_scene(orientation, preview, samples)
    return build_robot_scene(orientation, preview, samples)


def work_dir(moment, orientation):
    path = WORK / moment / orientation
    path.mkdir(parents=True, exist_ok=True)
    return path


def frame_dir(moment, orientation):
    path = work_dir(moment, orientation) / "frames"
    path.mkdir(parents=True, exist_ok=True)
    return path


def run(command):
    print("+", " ".join(map(str, command)), flush=True)
    subprocess.run([str(part) for part in command], check=True)


def composite_still(source, destination):
    shutil.copy2(source, destination)


def encode_webm(frames, output, frame_end):
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-framerate",
            str(FPS),
            "-start_number",
            str(FRAME_START),
            "-i",
            str(frames / "frame_%04d.png"),
            "-an",
            "-c:v",
            "libvpx-vp9",
            "-pix_fmt",
            "yuva420p",
            "-auto-alt-ref",
            "0",
            "-deadline",
            "good",
            "-cpu-used",
            "2",
            "-crf",
            "36",
            "-b:v",
            "0",
            "-g",
            "1",
            "-keyint_min",
            "1",
            "-frames:v",
            str(frame_end),
            str(output),
        ]
    )
    print(f"VIDEO {output}", flush=True)


def encode_hevc_alpha(frames, output, frame_end):
    try:
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-framerate",
                str(FPS),
                "-start_number",
                str(FRAME_START),
                "-i",
                str(frames / "frame_%04d.png"),
                "-an",
                "-c:v",
                "hevc_videotoolbox",
                "-allow_sw",
                "1",
                "-alpha_quality",
                "0.75",
                "-q:v",
                "45",
                "-tag:v",
                "hvc1",
                "-movflags",
                "+faststart",
                "-frames:v",
                str(frame_end),
                str(output),
            ]
        )
        print(f"VIDEO {output}", flush=True)
        return True
    except subprocess.CalledProcessError:
        print(f"HEVC alpha skipped for {output.name}", flush=True)
        if output.exists():
            output.unlink()
        return False


def local_shots(moment):
    spec = MOMENTS[moment]
    start = FRAME_START
    rows = []
    for shot in spec["shots"]:
        rows.append(
            {
                **shot,
                "start": start,
                "end": shot["end"],
                "reading": [round((start+7)/spec["frame_end"],4), round(shot["end"]/spec["frame_end"],4)],
                "text_side": "right" if moment == "vehicle" else "left",
                "progress": [round((start - 1) / spec["frame_end"], 4), round(shot["end"] / spec["frame_end"], 4)],
            }
        )
        start = shot["end"] + 1
    rows[0]["progress"][0] = 0.0
    rows[-1]["progress"][1] = 1.0
    return rows


def write_manifest(samples, rendered):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    existing = {}
    path = OUTPUT_DIR / "moments-timeline.json"
    if path.exists():
        try:
            existing = json.loads(path.read_text())
        except json.JSONDecodeError:
            existing = {}
    moments = existing.get("moments") or {}
    for moment, spec in MOMENTS.items():
        shots = local_shots(moment)
        moments[moment] = {
            "id": moment,
            "fps": FPS,
            "frame_end": spec["frame_end"],
            "duration_seconds": spec["frame_end"] / FPS,
            "shots": shots,
            "shot_ends": [shot["progress"][1] for shot in shots],
            "assets": {
                orientation: {
                    "resolution": list(LANDSCAPE if orientation == "landscape" else PORTRAIT),
                    "webm": f"/assets/stories/moments/{moment}-{orientation}.webm",
                    "hevc": f"/assets/stories/moments/{moment}-{orientation}.mov",
                    "poster": f"/assets/stories/moments/{moment}-{orientation}-poster.webp",
                }
                for orientation in ("landscape", "portrait")
            },
        }
    manifest = {
        "id": "project-moments",
        "samples": samples,
        "codec": "VP9 WebM yuva420p all-intra, optional HEVC-alpha, PNG posters",
        "horizon": ROAD_HORIZON,
        "moments": moments,
        "rendered": {**(existing.get("rendered") or {}), **rendered},
        "rerun": {
            "preview": "/opt/homebrew/bin/blender --background --python reel/render_story_world.py -- --preview",
            "full": "/opt/homebrew/bin/blender --background --python reel/render_story_world.py",
        },
    }
    path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"MANIFEST {path}", flush=True)


def create_outputs(moment, orientations, samples):
    spec = MOMENTS[moment]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    rendered = {}
    for orientation in orientations:
        resolution = LANDSCAPE if orientation == "landscape" else PORTRAIT
        missing = [
            frame
            for frame in range(FRAME_START, spec["frame_end"] + 1)
            if not (frame_dir(moment, orientation) / f"frame_{frame:04d}.png").exists()
        ]
        if missing:
            raise SystemExit(f"{moment}/{orientation}: missing {len(missing)} frames; first is {missing[0]}")
        poster = frame_dir(moment, orientation) / f"frame_{spec['poster']:04d}.png"
        encode_webm(frame_dir(moment, orientation), OUTPUT_DIR / f"{moment}-{orientation}.webm", spec["frame_end"])
        encode_hevc_alpha(frame_dir(moment, orientation), OUTPUT_DIR / f"{moment}-{orientation}.mov", spec["frame_end"])
        composite_still(poster, OUTPUT_DIR / f"{moment}-{orientation}-poster.png")
        run(["cwebp", "-quiet", "-q", "85", str(poster), "-o", str(OUTPUT_DIR / f"{moment}-{orientation}-poster.webp")])
        rendered[f"{moment}-{orientation}"] = {"frames": spec["frame_end"], "resolution": list(resolution)}
    write_manifest(samples, rendered)


def render_previews(moment, orientations, from_glb, samples):
    spec = MOMENTS[moment]
    preview_dir = WORK / "previews" / moment
    preview_dir.mkdir(parents=True, exist_ok=True)
    frames = sorted({FRAME_START, *(shot["end"] for shot in spec["shots"])})
    for orientation in orientations:
        scene = build_moment(moment, orientation, from_glb, True, samples)
        for frame in frames:
            scene.frame_set(frame)
            rgba = preview_dir / f"{orientation}-{frame:04d}-rgba.png"
            scene.render.filepath = str(rgba)
            bpy.ops.render.render(write_still=True)
            print(f"PREVIEW {moment} {orientation} {frame}", flush=True)
    # Previews must not publish a timeline for assets that have not been rendered.


def render_animation(moment, orientations, from_glb, samples):
    spec = MOMENTS[moment]
    for orientation in orientations:
        scene = build_moment(moment, orientation, from_glb, False, samples)
        out = frame_dir(moment, orientation)
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        print(
            f"Rendering {moment} {orientation} {scene.render.resolution_x}x{scene.render.resolution_y} "
            f"1-{spec['frame_end']} samples={samples}",
            flush=True,
        )
        scene.render.filepath = str(out / "frame_")
        bpy.ops.render.render(animation=True)
        blend = work_dir(moment, orientation) / f"{moment}-{orientation}.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend))
        create_outputs(moment, [orientation], samples)
        shutil.rmtree(out, ignore_errors=True)


def selected(value, options):
    return list(options) if value in {"all", "both"} else [value]


def main():
    options = parse_args()
    moments = selected(options["moment"], MOMENTS)
    orientations = selected(options["orientation"], ("landscape", "portrait"))
    if options["encode_only"]:
        for moment in moments:
            create_outputs(moment, orientations, options["samples"])
        return
    for moment in moments:
        if options["preview"]:
            render_previews(moment, orientations, options["from_glb"], options["samples"])
        else:
            render_animation(moment, orientations, options["from_glb"], options["samples"])


if __name__ == "__main__":
    main()
