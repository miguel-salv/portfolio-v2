#!/usr/bin/env python3
"""Build and render the procedural vehicle story.

Usage:
  /opt/homebrew/bin/blender --background --python reel/render_vehicle.py -- --preview
  /opt/homebrew/bin/blender --background --python reel/render_vehicle.py
  /opt/homebrew/bin/blender --background --python reel/render_vehicle.py -- --encode-only
"""

from pathlib import Path
import json
import shutil
import subprocess
import sys

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "reel" / "vehicle"
FRAMES_DIR = SOURCE_DIR / "frames_rgba"
PREVIEW_DIR = SOURCE_DIR / "preview"
BLEND_PATH = SOURCE_DIR / "vehicle-studio.blend"
OUTPUT_DIR = ROOT / "public" / "assets" / "stories" / "vehicle"

sys.path.insert(0, str(SOURCE_DIR))
from composite import composite_rgba_png  # noqa: E402
from model import animate_vehicle, build_vehicle  # noqa: E402


FPS = 30
FRAME_START = 1
FRAME_END = 120
RESOLUTION = (1920, 1080)
SAMPLES = 20
PREVIEW_FRAMES = (1, 34, 76, 120)
BACKGROUNDS = {
    "light": (0xEC, 0xE1, 0xCD),
    "dark": (0x18, 0x18, 0x17),
}


def args_after_separator():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def configure_color_management(scene):
    transforms = {item.name for item in scene.bl_rna.properties.get("view_settings", ()).enum_items} if False else set()
    try:
        scene.view_settings.view_transform = "AgX"
    except TypeError:
        scene.view_settings.view_transform = "Standard"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast", "Medium High Contrast"):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue
    scene.view_settings.exposure = 0.15
    scene.view_settings.gamma = 1.0


def add_area_light(name, location, energy, size, color, target):
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light_data.color = color
    light = bpy.data.objects.new(name, light_data)
    light.location = location
    bpy.context.collection.objects.link(light)
    point_at(light, target)
    return light


def setup_lighting():
    world = bpy.data.worlds.new("Cool neutral studio")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.045, 0.052, 0.062, 1.0)
    background.inputs["Strength"].default_value = 0.28
    bpy.context.scene.world = world

    target = (0.1, 0.0, 1.15)
    add_area_light(
        "Large cool key",
        (2.0, -7.8, 10.0),
        1350,
        5.5,
        (0.80, 0.89, 1.0),
        target,
    )
    add_area_light(
        "Soft front fill",
        (9.0, -8.0, 4.3),
        930,
        5.0,
        (0.92, 0.95, 1.0),
        target,
    )
    add_area_light(
        "Blue edge",
        (-6.5, 5.5, 6.8),
        1180,
        4.0,
        (0.48, 0.65, 1.0),
        target,
    )
    add_area_light(
        "Top plate strip",
        (-0.5, 2.0, 11.0),
        820,
        3.5,
        (0.72, 0.84, 1.0),
        target,
    )


def setup_camera():
    camera_data = bpy.data.cameras.new("Vehicle hero camera")
    camera_data.lens = 56
    camera_data.sensor_width = 36
    camera_data.clip_start = 0.1
    camera_data.clip_end = 100
    camera_data.dof.use_dof = False
    camera = bpy.data.objects.new("Vehicle hero camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (11.8, -15.5, 7.7)
    point_at(camera, (0.15, 0.0, 1.35))
    bpy.context.scene.camera = camera
    return camera


def configure_render(preview=False):
    scene = bpy.context.scene
    engine_options = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engine_options else "BLENDER_EEVEE"
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END
    scene.render.resolution_x = RESOLUTION[0]
    scene.render.resolution_y = RESOLUTION[1]
    scene.render.resolution_percentage = 50 if preview else 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.use_file_extension = True
    scene.render.use_overwrite = True
    scene.render.image_settings.compression = 35
    if hasattr(scene.render, "use_motion_blur"):
        scene.render.use_motion_blur = False
    if hasattr(scene, "eevee"):
        eevee = scene.eevee
        for samples_property in ("taa_render_samples", "taa_samples"):
            if hasattr(eevee, samples_property):
                setattr(eevee, samples_property, 8 if preview else SAMPLES)
        if hasattr(eevee, "use_raytracing"):
            eevee.use_raytracing = False
        if hasattr(eevee, "use_gtao"):
            eevee.use_gtao = True
            eevee.gtao_distance = 3
            eevee.gtao_factor = 1.1
    configure_color_management(scene)


def build_scene(preview=False):
    clear_scene()
    root, wheels = build_vehicle()
    animate_vehicle(root, wheels, FRAME_END)
    setup_lighting()
    setup_camera()
    configure_render(preview)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    return bpy.context.scene


def render_previews(scene):
    if PREVIEW_DIR.exists():
        shutil.rmtree(PREVIEW_DIR)
    PREVIEW_DIR.mkdir(parents=True)
    for frame in PREVIEW_FRAMES:
        scene.frame_set(frame)
        scene.render.filepath = str(PREVIEW_DIR / f"vehicle-preview-{frame:04d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"PREVIEW {scene.render.filepath}", flush=True)


def render_frames(scene):
    if FRAMES_DIR.exists():
        shutil.rmtree(FRAMES_DIR)
    FRAMES_DIR.mkdir(parents=True)
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(FRAMES_DIR / "frame_")
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END
    print(f"Rendering {FRAME_END} transparent RGBA frames at {RESOLUTION[0]}x{RESOLUTION[1]}", flush=True)
    bpy.ops.render.render(animation=True)


def ffmpeg_binary():
    found = shutil.which("ffmpeg")
    if not found:
        raise SystemExit("ffmpeg was not found in PATH")
    return found


def encode_video(theme, rgb):
    hex_color = "".join(f"{component:02x}" for component in rgb)
    duration = FRAME_END / FPS
    output = OUTPUT_DIR / f"vehicle-{theme}.mp4"
    command = [
        ffmpeg_binary(),
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-f",
        "lavfi",
        "-i",
        f"color=c=0x{hex_color}:s={RESOLUTION[0]}x{RESOLUTION[1]}:r={FPS}:d={duration:.3f}",
        "-framerate",
        str(FPS),
        "-start_number",
        str(FRAME_START),
        "-i",
        str(FRAMES_DIR / "frame_%04d.png"),
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
        str(FRAME_END),
        str(output),
    ]
    subprocess.run(command, check=True)
    print(f"VIDEO {output}", flush=True)


def create_outputs():
    missing = [frame for frame in range(FRAME_START, FRAME_END + 1) if not (FRAMES_DIR / f"frame_{frame:04d}.png").exists()]
    if missing:
        raise SystemExit(f"Missing {len(missing)} transparent frames; first missing frame is {missing[0]}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    hero_source = FRAMES_DIR / f"frame_{FRAME_END:04d}.png"
    for theme, rgb in BACKGROUNDS.items():
        composite_rgba_png(hero_source, OUTPUT_DIR / f"vehicle-{theme}-poster.png", rgb)
        encode_video(theme, rgb)
    metadata = {
        "fps": FPS,
        "frame_start": FRAME_START,
        "frame_end": FRAME_END,
        "frame_count": FRAME_END,
        "duration_seconds": FRAME_END / FPS,
        "resolution": list(RESOLUTION),
        "renderer": "EEVEE",
        "samples": SAMPLES,
        "codec": "H.264, all-intra, CRF 19, yuv420p, faststart",
        "backgrounds": {
            theme: f"#{''.join(f'{component:02x}' for component in rgb)}"
            for theme, rgb in BACKGROUNDS.items()
        },
    }
    (OUTPUT_DIR / "vehicle-render.json").write_text(json.dumps(metadata, indent=2) + "\n")


def main():
    arguments = args_after_separator()
    preview = "--preview" in arguments
    encode_only = "--encode-only" in arguments
    if encode_only:
        create_outputs()
        return
    scene = build_scene(preview=preview)
    if preview:
        render_previews(scene)
        return
    render_frames(scene)
    create_outputs()


if __name__ == "__main__":
    main()

