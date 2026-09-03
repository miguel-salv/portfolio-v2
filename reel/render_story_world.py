#!/usr/bin/env python3
"""Render three full-bleed 3D project drives.

Visual contract from the supplied United Carriers reel:
- The 3D is the page: full-bleed paper studio, one hero, no floating cables
- Object travels through a locked camera so HTML type can sit on the field
- Vehicle: arrive, hold and drive in place, then drive past
- Robot: travel a center lane past left/right type zones
- Matcher: centered product action, then a slight pull-back for the card beat
- Never reuse a cached shared-world .blend

Usage:
  blender --background --python reel/render_story_world.py -- --preview
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
from mathutils import Vector


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
LANDSCAPE = (1920, 1080)
PORTRAIT = (1080, 1350)
BACKGROUNDS = {"light": (0xEC, 0xE1, 0xCD), "dark": (0x18, 0x18, 0x17)}
MATCHER_STUDIO = (
    "KeyLight",
    "RimLight",
    "FillLight",
    "FloorFill",
    "WellFloor",
    "ShadowCatcher",
    "OrbitCam",
    "OrbitPivot",
)
MATCHER_RADIUS = 2.55

MOMENTS = {
    "matcher": {
        "frame_end": 120,
        "shots": (
            {"id": "interface", "end": 30, "label": "Interface and control"},
            {"id": "tuning", "end": 60, "label": "Stepper-driven tuning"},
            {"id": "measured", "end": 90, "label": "Measured match"},
            {"id": "card", "end": 120, "label": "Project card"},
        ),
        "poster": 90,
    },
    "vehicle": {
        "frame_end": 150,
        "shots": (
            {"id": "pid", "end": 30, "label": "PID"},
            {"id": "uart", "end": 60, "label": "UART"},
            {"id": "lcd", "end": 90, "label": "LCD"},
            {"id": "rtos", "end": 120, "label": "Context switch"},
            {"id": "card", "end": 150, "label": "Project card"},
        ),
        "poster": 88,
    },
    "robot": {
        "frame_end": 120,
        "shots": (
            {"id": "detect", "end": 30, "label": "Detect"},
            {"id": "command", "end": 60, "label": "Command"},
            {"id": "collect", "end": 90, "label": "Collect"},
            {"id": "card", "end": 120, "label": "Project card"},
        ),
        "poster": 90,
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


def hex_color(rgb):
    return "".join(f"{component:02x}" for component in rgb)


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


def setup_studio(target, accent=(0.38, 0.55, 0.78)):
    world = bpy.data.worlds.new("IsolatedStudio")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.055, 0.062, 0.078, 1.0)
    background.inputs["Strength"].default_value = 0.32
    bpy.context.scene.world = world
    add_area("Key", (5.4, -6.2, 8.8), 980, 5.6, (0.84, 0.90, 1.0), target)
    add_area("Fill", (-5.8, -2.4, 5.4), 620, 6.8, (0.78, 0.84, 0.94), target)
    add_area("Top", (0.2, 3.6, 10.4), 760, 4.8, (0.92, 0.95, 1.0), target)
    add_area("Accent", (-3.8, 5.2, 4.6), 540, 4.2, accent, target)


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
    try:
        scene.view_settings.view_transform = "AgX"
    except TypeError:
        scene.view_settings.view_transform = "Standard"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue
    scene.view_settings.exposure = 0.08


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
    leftover = bpy.data.materials.get("ShadowCatcher")
    if leftover:
        bpy.data.materials.remove(leftover)
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
    wrap_matcher()
    oled = look_point("oled", Vector((0.15, 0.35, 0.55)))
    body = look_point("body", Vector((0.05, 0.05, 0.15)))
    if orientation == "portrait":
        keys = (
            (1, (8.2, -12.6, 7.8), (body.x, body.y, body.z + 0.9), 46),
            (40, (7.6, -11.8, 7.2), (oled.x, oled.y, oled.z + 0.45), 48),
            (80, (8.0, -12.4, 7.4), (body.x, body.y, body.z + 0.7), 46),
            (120, (8.8, -13.4, 8.2), (body.x, body.y, body.z + 1.1), 42),
        )
        resolution = PORTRAIT
    else:
        keys = (
            (1, (9.4, -14.0, 6.2), (body.x, body.y, body.z + 0.2), 44),
            (40, (8.6, -13.0, 5.6), (oled.x, oled.y, oled.z + 0.05), 46),
            (80, (9.2, -13.8, 6.0), (body.x, body.y, body.z + 0.15), 44),
            (120, (10.2, -15.0, 6.8), (body.x, body.y, body.z + 0.3), 40),
        )
        resolution = LANDSCAPE
    camera = make_camera("MatcherCam", keys[0][1], keys[0][2], keys[0][3])
    key_camera(camera, keys)
    setup_studio(keys[-1][2], (0.42, 0.58, 0.78))
    configure_render(120, resolution, samples, preview)
    return bpy.context.scene


def build_vehicle_scene(orientation, preview, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root, wheels = build_vehicle()
    animate_vehicle(root, wheels, 150)
    # Locked side-profile: the chassis drives through the frame; type sits on it.
    if orientation == "portrait":
        location, look, lens = (0.15, -14.6, 6.4), (0.0, 0.0, 2.35), 40
        resolution = PORTRAIT
    else:
        location, look, lens = (0.2, -16.4, 3.55), (0.0, 0.0, 1.12), 38
        resolution = LANDSCAPE
    make_camera("VehicleCam", location, look, lens)
    setup_studio(look, (0.55, 0.22, 0.16))
    configure_render(150, resolution, samples, preview)
    return bpy.context.scene


def animate_robot_lane(root, wheels, scan, arms, bottle, frame_end=120):
    # Model forward is local -Y. Face +X so a locked side camera sees a drive, not a crab-walk.
    heading = radians(90)
    reach = 4.40
    grab = 84
    keys = (
        (1, -7.2, 0.0, 0.0),
        (30, -3.6, 0.02, radians(2.0)),
        (60, -2.25, 0.0, 0.0),
        (grab, -2.05, 0.01, 0.0),
        (96, -1.85, 0.0, 0.0),
        (frame_end, 1.15, 0.0, 0.0),
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
            wheel.rotation_euler.x = -(x - start_x) / wheel_radius
            wheel.keyframe_insert("rotation_euler", frame=frame, index=0)

    for frame, angle in ((1, 0), (28, 0), (40, -16), (52, 16), (64, 0), (frame_end, 0)):
        scan.rotation_euler.z = radians(angle)
        scan.keyframe_insert("rotation_euler", frame=frame, index=2)

    left, right = arms
    for arm, sign in ((left, -1), (right, 1)):
        for frame, degrees in ((1, 12), (50, 12), (68, 30), (90, 30), (frame_end, 24)):
            arm.rotation_euler.z = radians(sign * degrees)
            arm.keyframe_insert("rotation_euler", frame=frame, index=2)

    parked = keys[3][1] + reach
    bottle.location = (parked, 0.0, 0.02)
    bottle.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()

    grab_x, grab_z = keys[3][1], keys[3][2]
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
    bottle = build_bottle(mats)
    animate_robot_lane(root, wheels, scan, arms, bottle, 120)
    if orientation == "portrait":
        location, look, lens = (0.2, -13.8, 6.8), (0.0, 0.0, 2.2), 40
        resolution = PORTRAIT
    else:
        location, look, lens = (0.25, -15.6, 4.2), (0.0, 0.0, 1.15), 38
        resolution = LANDSCAPE
    make_camera("RobotCam", location, look, lens)
    setup_studio(look, (0.78, 0.48, 0.12))
    configure_render(120, resolution, samples, preview)
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


def composite_still(source, destination, rgb, width, height):
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
            f"color=c=0x{hex_color(rgb)}:s={width}x{height}",
            "-i",
            source,
            "-filter_complex",
            "[0:v][1:v]overlay=format=auto,format=rgb24",
            "-frames:v",
            "1",
            "-q:v",
            "2",
            destination,
        ]
    )


def encode_video(moment, orientation, theme, rgb, resolution, frame_end):
    duration = frame_end / FPS
    output = OUTPUT_DIR / f"{moment}-{orientation}-{theme}.mp4"
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
            f"color=c=0x{hex_color(rgb)}:s={resolution[0]}x{resolution[1]}:r={FPS}:d={duration:.3f}",
            "-framerate",
            str(FPS),
            "-start_number",
            str(FRAME_START),
            "-i",
            str(frame_dir(moment, orientation) / "frame_%04d.png"),
            "-filter_complex",
            "[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p[v]",
            "-map",
            "[v]",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "19",
            "-g",
            "1",
            "-keyint_min",
            "1",
            "-x264-params",
            "keyint=1:min-keyint=1:scenecut=0",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-frames:v",
            str(frame_end),
            str(output),
        ]
    )
    print(f"VIDEO {output}", flush=True)


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
                    "light": f"/assets/stories/moments/{moment}-{orientation}-light.mp4",
                    "dark": f"/assets/stories/moments/{moment}-{orientation}-dark.mp4",
                    "poster_light": f"/assets/stories/moments/{moment}-{orientation}-light-poster.jpg",
                    "poster_dark": f"/assets/stories/moments/{moment}-{orientation}-dark-poster.jpg",
                }
                for orientation in ("landscape", "portrait")
            },
        }
    manifest = {
        "id": "project-moments",
        "samples": samples,
        "codec": "H.264, all-intra, CRF 19, yuv420p, faststart",
        "backgrounds": {theme: f"#{hex_color(rgb)}" for theme, rgb in BACKGROUNDS.items()},
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
        for theme, rgb in BACKGROUNDS.items():
            encode_video(moment, orientation, theme, rgb, resolution, spec["frame_end"])
            composite_still(
                poster,
                OUTPUT_DIR / f"{moment}-{orientation}-{theme}-poster.jpg",
                rgb,
                resolution[0],
                resolution[1],
            )
        rendered[f"{moment}-{orientation}"] = {"frames": spec["frame_end"], "resolution": list(resolution)}
    write_manifest(samples, rendered)


def render_previews(moment, orientations, from_glb, samples):
    spec = MOMENTS[moment]
    preview_dir = WORK / "previews" / moment
    preview_dir.mkdir(parents=True, exist_ok=True)
    frames = sorted({FRAME_START, *(shot["end"] for shot in spec["shots"])})
    for orientation in orientations:
        scene = build_moment(moment, orientation, from_glb, True, samples)
        width = scene.render.resolution_x * scene.render.resolution_percentage // 100
        height = scene.render.resolution_y * scene.render.resolution_percentage // 100
        for frame in frames:
            scene.frame_set(frame)
            rgba = preview_dir / f"{orientation}-{frame:04d}-rgba.png"
            scene.render.filepath = str(rgba)
            bpy.ops.render.render(write_still=True)
            for theme, rgb in BACKGROUNDS.items():
                composite_still(
                    rgba,
                    preview_dir / f"{orientation}-{frame:04d}-{theme}.jpg",
                    rgb,
                    width,
                    height,
                )
            print(f"PREVIEW {moment} {orientation} {frame}", flush=True)
    write_manifest(samples, {f"{moment}-preview": True})


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
    create_outputs(moment, orientations, samples)


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
