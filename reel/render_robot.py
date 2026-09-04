#!/usr/bin/env python3
"""Procedurally build and render the trash-collection robot story.

Usage:
  /opt/homebrew/bin/blender --background --python reel/render_robot.py -- --preview
  /opt/homebrew/bin/blender --background --python reel/render_robot.py

The Blender scene, transparent frames, and representative previews stay in
reel/robot/. Final light/dark composites are written to
public/assets/stories/robot/.
"""

from math import atan2, pi, radians
from pathlib import Path
import subprocess
import sys

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "reel" / "robot"
FRAMES = WORK / "frames"
PREVIEWS = WORK / "previews"
OUTPUT = ROOT / "public" / "assets" / "stories" / "robot"
BLEND = WORK / "robot-studio.blend"

FPS = 30
FRAME_START = 1
FRAME_END = 120
RES_X = 1920
RES_Y = 1080
SAMPLES = 20
PREVIEW = "--preview" in sys.argv

LIGHT_BG = "ece1cd"
DARK_BG = "181817"


def material(name, color, roughness=0.5, metallic=0.0, alpha=1.0, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, alpha)
    bsdf.inputs["Roughness"].default_value = roughness
    metallic_input = bsdf.inputs.get("Metallic")
    if metallic_input:
        metallic_input.default_value = metallic
    specular = bsdf.inputs.get("Specular IOR Level")
    if specular:
        specular.default_value = 0.24
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "DITHERED"
    if emission:
        emission_color = bsdf.inputs.get("Emission Color")
        emission_strength = bsdf.inputs.get("Emission Strength")
        if emission_color:
            emission_color.default_value = (*emission[0], 1.0)
        if emission_strength:
            emission_strength.default_value = emission[1]
    return mat


def parent_local(obj, parent, location=(0, 0, 0), rotation=(0, 0, 0)):
    obj.parent = parent
    obj.location = location
    obj.rotation_euler = rotation
    return obj


def smooth(obj):
    if obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def cube(name, location, scale, mat, parent=None, bevel=0.08, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.name = name
    parent_local(obj, parent, location, rotation)
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft manufactured edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    obj.data.materials.append(mat)
    return obj


def cylinder(
    name,
    location,
    radius,
    depth,
    mat,
    parent=None,
    rotation=(0, 0, 0),
    vertices=32,
    bevel=0.03,
):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name = name
    parent_local(obj, parent, location, rotation)
    if bevel:
        modifier = obj.modifiers.new("Edge rolloff", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    obj.data.materials.append(mat)
    return smooth(obj)


def uv_sphere(name, location, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16)
    obj = bpy.context.object
    obj.name = name
    parent_local(obj, parent, location)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return smooth(obj)


def beam_between(name, start, end, width, depth, mat, parent):
    """Create a horizontal beam between two local points."""
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    length = (delta.x * delta.x + delta.y * delta.y) ** 0.5
    angle = atan2(delta.y, delta.x)
    return cube(
        name,
        (a + b) * 0.5,
        (length, width, depth),
        mat,
        parent=parent,
        bevel=min(width, depth) * 0.25,
        rotation=(0, 0, angle),
    )


def tube(name, points, radius, mat, parent, cyclic=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for point, coord in zip(spline.points, points):
        point.co = (*coord, 1.0)
    spline.order_u = min(3, len(points))
    spline.use_endpoint_u = True
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    parent_local(obj, parent)
    obj.data.materials.append(mat)
    return obj


def empty(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    parent_local(obj, parent, location)
    return obj


def key(obj, data_path, frame, value):
    setattr(obj, data_path, value)
    obj.keyframe_insert(data_path=data_path, frame=frame)


def add_wheel(root, x, y, index, mats):
    pivot = empty(f"WheelPivot_{index}", root, (x, y, 0.72))
    cylinder(
        f"RubberWheel_{index}",
        (0, 0, 0),
        0.55,
        0.42,
        mats["rubber"],
        pivot,
        rotation=(0, radians(90), 0),
        vertices=36,
        bevel=0.06,
    )
    side = 1 if x > 0 else -1
    cylinder(
        f"YellowHub_{index}",
        (side * 0.225, 0, 0),
        0.36,
        0.055,
        mats["yellow"],
        pivot,
        rotation=(0, radians(90), 0),
        vertices=28,
        bevel=0.025,
    )
    for spoke_angle in (0, pi / 2):
        cube(
            f"HubSpoke_{index}_{spoke_angle}",
            (side * 0.258, 0, 0),
            (0.028, 0.53, 0.07),
            mats["yellow_dark"],
            pivot,
            bevel=0.018,
            rotation=(spoke_angle, 0, 0),
        )
    mount_x = x - side * 0.55
    cube(
        f"YellowMotorMount_{index}",
        (mount_x, y, 0.78),
        (0.44, 0.58, 0.78),
        mats["yellow"],
        root,
        bevel=0.09,
    )
    cylinder(
        f"MotorCap_{index}",
        (mount_x, y, 1.18),
        0.17,
        0.12,
        mats["steel"],
        root,
        vertices=24,
        bevel=0.02,
    )
    return pivot


def build_robot(mats):
    root = empty("RobotRoot")

    # Rounded layered plywood chassis.
    cube("PlywoodEdge", (0, 0, 0.62), (4.25, 5.85, 0.42), mats["ply_edge"], root, 0.32)
    cube("CreamChassis", (0, 0, 0.72), (4.18, 5.72, 0.34), mats["cream"], root, 0.30)
    cube("TopDeck", (0, 0.18, 0.91), (3.70, 4.95, 0.18), mats["cream_top"], root, 0.24)
    for x in (-1.67, 1.67):
        for y in (-2.15, 2.15):
            cylinder(f"DeckBolt_{x}_{y}", (x, y, 1.03), 0.075, 0.045, mats["steel"], root, vertices=16)

    wheels = []
    for side, x in (("L", -2.34), ("R", 2.34)):
        for slot, y in enumerate((1.86, -1.86)):
            wheels.append(add_wheel(root, x, y, f"{side}{slot}", mats))

    # Exposed boards and recognizable central electronics.
    cube("BatteryTray", (0, 1.55, 1.18), (2.35, 1.42, 0.26), mats["black"], root, 0.10)
    cube("BatteryPack", (0, 1.63, 1.47), (1.72, 1.05, 0.48), mats["charcoal"], root, 0.12)
    for x in (-0.62, 0, 0.62):
        cube(f"BatteryRib_{x}", (x, 1.62, 1.73), (0.10, 0.92, 0.08), mats["black"], root, 0.025)

    cube("MainPCB", (0, 0.05, 1.23), (2.55, 2.05, 0.16), mats["pcb"], root, 0.08)
    cube("ControllerPCB", (-0.48, -0.12, 1.43), (1.25, 1.26, 0.12), mats["pcb_blue"], root, 0.04)
    for x in (-0.72, -0.46, -0.20):
        cube(f"SilverPort_{x}", (x, -0.78, 1.50), (0.18, 0.28, 0.20), mats["steel"], root, 0.025)
    for x in (0.20, 0.47, 0.74):
        cube(f"HeatSink_{x}", (x, 0.04, 1.54), (0.12, 0.72, 0.26), mats["steel_dark"], root, 0.015)
    for x, y in ((-1.0, 0.68), (0.95, 0.68), (0.95, -0.62)):
        cylinder(f"BoardCap_{x}_{y}", (x, y, 1.48), 0.10, 0.24, mats["charcoal"], root, vertices=20)

    # Forward black camera/sensor stack.
    cube("SensorTowerBase", (0, -1.52, 1.34), (1.55, 0.95, 0.72), mats["black"], root, 0.14)
    cube("SensorTowerNeck", (0, -1.52, 1.84), (0.76, 0.64, 0.38), mats["charcoal"], root, 0.10)
    scan = empty("CameraScan", root, (0, -1.58, 2.12))
    cube("CameraHousing", (0, 0, 0), (1.18, 0.68, 0.52), mats["black"], scan, 0.12)
    cube("CameraFace", (0, -0.35, 0), (0.91, 0.08, 0.33), mats["charcoal"], scan, 0.05)
    for x in (-0.28, 0.28):
        cylinder(
            f"CameraLens_{x}",
            (x, -0.405, 0),
            0.115,
            0.09,
            mats["lens"],
            scan,
            rotation=(radians(90), 0, 0),
            vertices=28,
            bevel=0.02,
        )
    cylinder(
        "ScanIndicator",
        (0, -0.41, -0.17),
        0.035,
        0.04,
        mats["red_emit"],
        scan,
        rotation=(radians(90), 0, 0),
        vertices=16,
        bevel=0.005,
    )

    # Two long collection arms, hinged at the forward stack.
    arms = []
    for side, x, open_angle in (("Left", -0.83, -28), ("Right", 0.83, 28)):
        pivot = empty(f"{side}ArmPivot", root, (x, -1.54, 1.72))
        cylinder(f"{side}ArmHinge", (0, 0, 0), 0.23, 0.28, mats["steel_dark"], pivot, vertices=24)
        cube(f"{side}ArmBeam", (0, -1.63, 0), (0.19, 3.28, 0.20), mats["arm_black"], pivot, 0.055)
        cube(f"{side}ArmTip", (0, -3.28, -0.01), (0.42, 0.34, 0.25), mats["rubber"], pivot, 0.09)
        # Small brace echoes the bent fabricated brackets in the reference.
        brace_sign = -1 if side == "Left" else 1
        beam_between(
            f"{side}ArmBrace",
            (0, -0.22, -0.02),
            (brace_sign * 0.42, -0.75, -0.02),
            0.13,
            0.14,
            mats["arm_black"],
            pivot,
        )
        pivot["open_angle"] = radians(open_angle)
        arms.append(pivot)

    # Two short attached looms, both terminated on the chassis.
    harnesses = [
        ("BoardLoom", [(-0.72, 0.82, 1.46), (-0.18, 0.28, 1.52), (0.42, -0.18, 1.48)], mats["wire_black"], 0.032),
        ("ArmLoom", [(0.88, 0.95, 1.38), (0.96, 0.12, 1.44), (0.82, -0.88, 1.50)], mats["wire_red"], 0.028),
    ]
    for name, points, mat, radius in harnesses:
        tube(name, points, radius, mat, root)

    return root, wheels, scan, arms


def build_bottle(mats):
    bottle = empty("BottleRoot")
    cylinder("BottleBody", (0, 0, 0.67), 0.34, 1.30, mats["bottle"], bottle, vertices=36, bevel=0.11)
    cylinder("BottleShoulder", (0, 0, 1.31), 0.26, 0.24, mats["bottle"], bottle, vertices=36, bevel=0.08)
    cylinder("BottleNeck", (0, 0, 1.53), 0.15, 0.28, mats["bottle"], bottle, vertices=32, bevel=0.04)
    cylinder("BottleCap", (0, 0, 1.72), 0.18, 0.13, mats["bottle_cap"], bottle, vertices=24, bevel=0.025)
    cube("BottleLabel", (0, -0.338, 0.80), (0.48, 0.028, 0.48), mats["bottle_label"], bottle, 0.03)
    bottle.location = (0, -4.42, 0.02)
    return bottle


def create_materials():
    return {
        "cream": material("Warm cream plywood", (0.68, 0.60, 0.45), 0.58),
        "cream_top": material("Cream top veneer", (0.82, 0.75, 0.61), 0.50),
        "ply_edge": material("Plywood laminated edge", (0.42, 0.29, 0.17), 0.68),
        "black": material("Satin black housings", (0.025, 0.028, 0.035), 0.38),
        "charcoal": material("Charcoal polymer", (0.065, 0.072, 0.082), 0.50),
        "arm_black": material("Collection arm black", (0.018, 0.021, 0.027), 0.32, 0.18),
        "rubber": material("Wheel rubber", (0.022, 0.024, 0.027), 0.82),
        "tread": material("Raised tread", (0.052, 0.055, 0.060), 0.88),
        "yellow": material("Utility yellow", (0.88, 0.55, 0.035), 0.44),
        "yellow_dark": material("Hub inset yellow", (0.48, 0.27, 0.015), 0.58),
        "steel": material("Brushed steel", (0.55, 0.60, 0.64), 0.28, 0.75),
        "steel_dark": material("Dark anodized metal", (0.16, 0.18, 0.21), 0.32, 0.62),
        "pcb": material("Main circuit board", (0.045, 0.15, 0.10), 0.48),
        "pcb_blue": material("Controller blue", (0.045, 0.13, 0.23), 0.44),
        "lens": material("Camera glass", (0.015, 0.035, 0.055), 0.12, 0.24),
        "red_emit": material("Status LED", (0.40, 0.012, 0.008), 0.28, emission=((1.0, 0.015, 0.005), 4.0)),
        "wire_white": material("White cable", (0.72, 0.73, 0.72), 0.54),
        "wire_red": material("Red cable", (0.52, 0.025, 0.018), 0.52),
        "wire_orange": material("Orange cable", (0.78, 0.25, 0.025), 0.55),
        "wire_black": material("Black cable", (0.018, 0.020, 0.024), 0.62),
        "bottle": material("Neutral bottle", (0.45, 0.58, 0.62), 0.34),
        "bottle_cap": material("Bottle cap", (0.20, 0.27, 0.29), 0.48),
        "bottle_label": material("Bottle label", (0.70, 0.72, 0.69), 0.66),
    }


def animate(root, wheels, scan, arms, bottle):
    # Robot rolls in from the background, slows to scan, then completes collection.
    for frame, y, zrot in (
        (1, 4.75, radians(-4)),
        (48, 1.36, radians(1.5)),
        (74, 0.40, radians(0)),
        (92, 0.12, radians(0)),
        (120, -0.34, radians(-2.0)),
    ):
        root.location = (0, y, 0)
        root.rotation_euler = (0, 0, zrot)
        root.keyframe_insert("location", frame=frame)
        root.keyframe_insert("rotation_euler", frame=frame)

    wheel_radius = 0.55
    start_y = 4.75
    for wheel in wheels:
        for frame, y in ((1, start_y), (48, 1.36), (74, 0.40), (92, 0.12), (120, -0.34)):
            wheel.rotation_euler.x = -(start_y - y) / wheel_radius
            wheel.keyframe_insert("rotation_euler", frame=frame, index=0)

    # Camera head sweeps past the target, confirms it, and faces forward.
    for frame, angle in ((1, 0), (42, 0), (54, -18), (65, 20), (76, 0), (120, 0)):
        scan.rotation_euler.z = radians(angle)
        scan.keyframe_insert("rotation_euler", frame=frame, index=2)

    left, right = arms
    for arm, sign in ((left, -1), (right, 1)):
        for frame, degrees in ((1, 10), (53, 10), (70, 31), (82, 31), (96, 5), (120, 4)):
            arm.rotation_euler.z = radians(sign * degrees)
            arm.keyframe_insert("rotation_euler", frame=frame, index=2)

    # Bottle stays put until the arm tips meet it, then travels with the robot.
    for frame, y, z in ((1, -4.42, 0.02), (94, -4.42, 0.02), (104, -4.52, 0.16), (120, -4.86, 0.24)):
        bottle.location = (0, y, z)
        bottle.keyframe_insert("location", frame=frame)

    # Blender's default Bezier interpolation is shared by root translation and
    # matching wheel keys, so wheel angle stays proportional to distance.


def track_to(obj, target):
    constraint = obj.constraints.new("TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"


def add_area(name, location, energy, size, color, target):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    track_to(obj, target)
    return obj


def setup_camera_and_lights():
    target = empty("CameraTarget")
    cam_data = bpy.data.cameras.new("StoryCamera")
    cam_data.lens = 52
    cam_data.sensor_width = 36
    cam_data.clip_start = 0.05
    cam_data.clip_end = 100
    cam = bpy.data.objects.new("StoryCamera", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    track_to(cam, target)

    for frame, location, look in (
        (1, (8.9, -13.8, 7.8), (0, 0.65, 1.05)),
        (70, (8.55, -13.2, 7.35), (0, -0.10, 1.08)),
        (120, (8.0, -12.2, 6.85), (0, -0.72, 1.18)),
    ):
        cam.location = location
        cam.keyframe_insert("location", frame=frame)
        target.location = look
        target.keyframe_insert("location", frame=frame)

    add_area("CoolKey", (6.2, -5.4, 10.5), 1050, 6.0, (0.82, 0.89, 1.0), target)
    add_area("SoftFill", (-6.5, -1.0, 6.0), 720, 7.5, (0.72, 0.80, 0.92), target)
    add_area("TopStrip", (0, 4.5, 11.8), 1100, 5.5, (0.90, 0.94, 1.0), target)
    add_area("BlueRim", (-4.5, 6.0, 5.8), 900, 5.0, (0.38, 0.55, 0.78), target)

    world = bpy.context.scene.world or bpy.data.worlds.new("NeutralStudioWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.055, 0.065, 0.085, 1)
    bg.inputs["Strength"].default_value = 0.38
    return cam, target


def configure_scene(preview=False):
    scene = bpy.context.scene
    engine_items = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engine_items else "BLENDER_EEVEE"
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END
    scene.render.fps = FPS
    scene.render.resolution_x = RES_X
    scene.render.resolution_y = RES_Y
    scene.render.resolution_percentage = 50 if preview else 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.use_file_extension = True
    scene.render.use_overwrite = True

    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = 8 if preview else SAMPLES
        if hasattr(scene.eevee, "use_raytracing"):
            scene.eevee.use_raytracing = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.15


def build_scene(preview=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = create_materials()
    root, wheels, scan, arms = build_robot(mats)
    bottle = build_bottle(mats)
    animate(root, wheels, scan, arms, bottle)
    setup_camera_and_lights()
    configure_scene(preview)
    WORK.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    return bpy.context.scene


def run(command):
    print("+", " ".join(map(str, command)), flush=True)
    subprocess.run([str(part) for part in command], check=True)


def composite_still(source, destination, bg_hex, width, height, jpeg=False):
    codec_args = ["-q:v", "2"] if jpeg else ["-c:v", "png"]
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=0x{bg_hex}:s={width}x{height}",
            "-i",
            source,
            "-filter_complex",
            "[0:v][1:v]overlay=format=auto,format=rgb24",
            "-frames:v",
            "1",
            *codec_args,
            destination,
        ]
    )


def render_previews(scene):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    for frame in (1, 60, 86, 120):
        scene.frame_set(frame)
        rgba = PREVIEWS / f"robot-{frame:03d}-rgba.png"
        scene.render.filepath = str(rgba)
        bpy.ops.render.render(write_still=True)
        for label, color in (("light", LIGHT_BG), ("dark", DARK_BG)):
            composite_still(
                rgba,
                PREVIEWS / f"robot-{frame:03d}-{label}.png",
                color,
                RES_X // 2,
                RES_Y // 2,
            )
    print(f"Representative previews written to {PREVIEWS}", flush=True)


def render_animation(scene):
    FRAMES.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(FRAMES / "robot_")
    scene.frame_set(FRAME_START)
    bpy.ops.render.render(animation=True)

    duration = FRAME_END / FPS
    for label, color in (("light", LIGHT_BG), ("dark", DARK_BG)):
        output = OUTPUT / f"robot-{label}.mp4"
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                f"color=c=0x{color}:s={RES_X}x{RES_Y}:r={FPS}:d={duration}",
                "-framerate",
                str(FPS),
                "-start_number",
                str(FRAME_START),
                "-i",
                FRAMES / "robot_%04d.png",
                "-filter_complex",
                "[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p",
                "-c:v",
                "libx264",
                "-preset",
                "slow",
                "-crf",
                "19",
                "-g",
                "1",
                "-x264-params",
                "keyint=1:min-keyint=1:scenecut=0",
                "-movflags",
                "+faststart",
                "-an",
                output,
            ]
        )
        composite_still(
            FRAMES / f"robot_{FRAME_END:04d}.png",
            OUTPUT / f"robot-{label}-poster.jpg",
            color,
            RES_X,
            RES_Y,
            jpeg=True,
        )
    print(f"Final story assets written to {OUTPUT}", flush=True)


def main():
    scene = build_scene(PREVIEW)
    if PREVIEW:
        render_previews(scene)
    else:
        render_animation(scene)


if __name__ == "__main__":
    main()
