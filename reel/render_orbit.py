# Blender 4.x/5.x: import the matcher GLB and render a three-shot silent CAD film.
# Usage: blender --background --python reel/render_orbit.py -- [--preview] [--rebuild]

from math import cos, radians, sin
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
GLB = ROOT / "reel" / "models" / "impedance.glb"
BLEND = ROOT / "reel" / "models" / "impedance-studio.blend"
FRAMES_DIR = ROOT / "reel" / "frames"
FPS = 30
RES_X = 1920
RES_Y = 1080
PREVIEW = "--preview" in sys.argv
REBUILD = "--rebuild" in sys.argv
DISSOLVE_S = 8 / FPS
SHOTS = (
    {"name": "detail", "frames": 75, "look": "oled", "lens": 50, "start": (0.95, 10, 14), "end": (1.72, 22, 18)},
    {"name": "mechanism", "frames": 75, "look": "stepper", "lens": 40, "start": (1.55, 58, 10), "end": (2.05, 78, 16)},
    {"name": "hero", "frames": 90, "look": "body", "lens": 35, "start": (3.55, 38, 20), "end": (2.85, 44, 16)},
)


def scene_meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def combined_bounds(objects):
    mins = Vector((float("inf"),) * 3)
    maxs = Vector((float("-inf"),) * 3)
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    return mins, maxs


PROTECTED_MATS = {"StepperBody", "StepperSteel", "AluminumBox", "OledGlass", "HousingLines"}


def export_rgb(mat):
    parts = mat.name.split("_")
    try:
        return float(parts[0]), float(parts[1]), float(parts[2])
    except (ValueError, IndexError):
        return None


def make_principled(name, color, roughness, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    princ = mat.node_tree.nodes["Principled BSDF"]
    princ.inputs["Base Color"].default_value = (*color, 1.0)
    princ.inputs["Roughness"].default_value = roughness
    if "Metallic" in princ.inputs:
        princ.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in princ.inputs:
        princ.inputs["Specular IOR Level"].default_value = 0.18
    emit = princ.inputs.get("Emission Strength")
    if emit:
        emit.default_value = 0.0
    return mat


def paint_named_parts():
    """Onshape exported the NEMA 17 bodies as white — same family as the box."""
    stepper = make_principled("StepperBody", (0.045, 0.046, 0.048), 0.4, metallic=0.28)
    steel = make_principled("StepperSteel", (0.62, 0.63, 0.65), 0.28, metallic=0.72)
    aluminum = make_principled("AluminumBox", (0.38, 0.40, 0.43), 0.34, metallic=0.55)
    oled = make_principled("OledGlass", (0.028, 0.03, 0.034), 0.18, metallic=0.12)
    lines = make_principled("HousingLines", (0.055, 0.055, 0.058), 0.48, metallic=0.08)

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith("17HM15"):
            for slot in obj.material_slots:
                mat = slot.material
                if not mat:
                    continue
                rgb = export_rgb(mat)
                if not rgb:
                    continue
                r, g, b = rgb
                luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
                sat = max(r, g, b) - min(r, g, b)
                if sat < 0.12 and luma > 0.7:
                    slot.material = steel
                elif sat < 0.12 and 0.16 < luma < 0.45:
                    slot.material = stepper
        elif obj.name.startswith("Aluminum Box"):
            for slot in obj.material_slots:
                if slot.material:
                    slot.material = aluminum
        elif obj.name.startswith("OLED Screen"):
            for slot in obj.material_slots:
                rgb = export_rgb(slot.material) if slot.material else None
                if not rgb:
                    continue
                r, g, b = rgb
                luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
                sat = max(r, g, b) - min(r, g, b)
                if luma > 0.18 and sat < 0.12:
                    slot.material = oled
        elif obj.name.startswith("Main Electronics Housing"):
            for slot in obj.material_slots:
                rgb = export_rgb(slot.material) if slot.material else None
                if not rgb:
                    continue
                r, g, b = rgb
                luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
                sat = max(r, g, b) - min(r, g, b)
                if sat < 0.08 and 0.2 < luma < 0.5:
                    slot.material = lines


def tone_materials():
    """Pull CAD whites and primaries back toward paper/ink so they don't blow."""
    for mat in bpy.data.materials:
        if mat.name in PROTECTED_MATS or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            base = node.inputs.get("Base Color")
            if base and not base.is_linked:
                r, g, b, a = base.default_value
                luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
                sat = max(r, g, b) - min(r, g, b)
                if sat > 0.18:
                    r = r * 0.84 + luma * 0.16
                    g = g * 0.84 + luma * 0.16
                    b = b * 0.84 + luma * 0.16
                    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
                if luma > 0.42:
                    scale = 0.36 / luma
                    r, g, b = r * scale, g * scale, b * scale
                # Neutral soot — no yellow push.
                base.default_value = (r * 0.9 + 0.018, g * 0.9 + 0.018, b * 0.9 + 0.02, a)
            rough = node.inputs.get("Roughness")
            if rough and not rough.is_linked:
                rough.default_value = max(rough.default_value, 0.58)
            spec = node.inputs.get("Specular IOR Level")
            if spec and not spec.is_linked:
                spec.default_value = min(spec.default_value, 0.14)
            emit = node.inputs.get("Emission Strength")
            if emit:
                emit.default_value = 0.0


def setup_studio(center, radius):
    world = bpy.context.scene.world or bpy.data.worlds.new("StudioWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new("ShaderNodeBackground")
    # Neutral, dim — film is transparent; world must not tint metal toward cream or soot.
    bg.inputs["Color"].default_value = (0.18, 0.18, 0.19, 1.0)
    bg.inputs["Strength"].default_value = 0.35
    out = nodes.new("ShaderNodeOutputWorld")
    links.new(bg.outputs["Background"], out.inputs["Surface"])

    key = bpy.data.objects.new("KeyLight", bpy.data.lights.new("KeyLight", "AREA"))
    key.data.energy = 3.2
    key.data.size = radius * 3.2
    key.data.color = (0.98, 0.98, 1.0)
    key.location = center + Vector((radius * 2.4, -radius * 2.6, radius * 2.2))
    key.rotation_euler = (radians(40), radians(6), radians(26))
    bpy.context.scene.collection.objects.link(key)

    rim = bpy.data.objects.new("RimLight", bpy.data.lights.new("RimLight", "AREA"))
    rim.data.energy = 1.05
    rim.data.size = radius * 2.2
    rim.data.color = (0.38, 0.5, 0.6)
    rim.location = center + Vector((-radius * 2.6, radius * 1.6, radius * 1.5))
    rim.rotation_euler = (radians(62), radians(-12), radians(-130))
    bpy.context.scene.collection.objects.link(rim)

    fill = bpy.data.objects.new("FillLight", bpy.data.lights.new("FillLight", "AREA"))
    fill.data.energy = 0.62
    fill.data.size = radius * 4.2
    fill.data.color = (0.86, 0.88, 0.92)
    fill.location = center + Vector((0.0, -radius * 3.4, radius * 1.0))
    fill.rotation_euler = (radians(70), 0, 0)
    bpy.context.scene.collection.objects.link(fill)


EXPLODE_PREFIX = "Explode_"


def clear_explode():
    bpy.context.scene.frame_set(1)
    for obj in list(bpy.data.objects):
        if not obj.name.startswith(EXPLODE_PREFIX):
            continue
        for child in list(obj.children):
            world = child.matrix_world.copy()
            child.parent = None
            child.matrix_world = world
        bpy.data.objects.remove(obj, do_unlink=True)


def objects_prefixed(prefix):
    return [obj for obj in scene_meshes() if obj.name.startswith(prefix)]


def look_target(kind, body_center, body_radius):
    if kind == "oled":
        found = objects_prefixed("OLED Screen") or objects_prefixed("Main Electronics Housing")
    elif kind == "stepper":
        found = objects_prefixed("17HM15")
    else:
        found = []
    if not found:
        return body_center
    mins, maxs = combined_bounds(found)
    return (mins + maxs) * 0.5


def spherical(look, dist, az_deg, el_deg):
    az = radians(az_deg)
    el = radians(el_deg)
    return Vector((
        look.x + dist * cos(el) * sin(az),
        look.y - dist * cos(el) * cos(az),
        look.z + dist * sin(el),
    ))


def setup_camera(center, radius):
    cam_data = bpy.data.cameras.new("OrbitCam")
    cam_data.lens = 50
    cam_data.clip_start = radius * 0.02
    cam_data.clip_end = radius * 80
    cam = bpy.data.objects.new("OrbitCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    target = bpy.data.objects.new("OrbitPivot", None)
    target.empty_display_type = "PLAIN_AXES"
    target.location = center
    bpy.context.scene.collection.objects.link(target)

    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    bpy.context.scene.render.fps = FPS
    return cam, target


def apply_shot(cam, target, center, radius, shot):
    cam.data.lens = shot.get("lens", 50)
    look = look_target(shot["look"], center, radius)
    start_dist, start_az, start_el = shot["start"]
    end_dist, end_az, end_el = shot["end"]
    frames = shot["frames"]

    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frames
    scene.frame_set(1)

    prefs = bpy.context.preferences.edit
    interp_attr = "keyframe_new_interpolation_type"
    previous_interp = getattr(prefs, interp_attr, None)
    if previous_interp is not None:
        setattr(prefs, interp_attr, "BEZIER")

    cam.animation_data_clear()
    target.animation_data_clear()

    target.location = look
    target.keyframe_insert("location", frame=1)
    target.keyframe_insert("location", frame=frames)

    cam.location = spherical(look, radius * start_dist, start_az, start_el)
    cam.keyframe_insert("location", frame=1)
    cam.location = spherical(look, radius * end_dist, end_az, end_el)
    cam.keyframe_insert("location", frame=frames)

    if previous_interp is not None:
        setattr(prefs, interp_attr, previous_interp)

    return frames


def configure_render(preview):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys() else "BLENDER_EEVEE"
    scene.render.resolution_x = RES_X
    scene.render.resolution_y = RES_Y
    scene.render.resolution_percentage = 50 if preview else 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.filepath = str(FRAMES_DIR / "frame_")
    scene.render.use_file_extension = True
    scene.render.use_overwrite = True

    eevee = scene.eevee
    if hasattr(eevee, "taa_render_samples"):
        eevee.taa_render_samples = 8 if preview else 24
    if hasattr(eevee, "use_raytracing"):
        eevee.use_raytracing = False
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -0.55
    if hasattr(eevee, "use_shadows"):
        eevee.use_shadows = True
    if hasattr(eevee, "use_volumetric_shadows"):
        eevee.use_volumetric_shadows = False


def build_studio():
    if not GLB.exists():
        raise SystemExit(f"Missing GLB: {GLB}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    print(f"Importing {GLB} …", flush=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB))

    meshes = scene_meshes()
    if not meshes:
        raise SystemExit("GLB imported with no mesh objects")
    print(f"Imported {len(meshes)} meshes", flush=True)

    mins, maxs = combined_bounds(meshes)
    center = (mins + maxs) * 0.5
    size = maxs - mins
    radius = max(size.x, size.y, size.z) * 0.5
    if radius <= 0:
        raise SystemExit("Degenerate bounds")
    print(f"Bounds size={tuple(size)} radius={radius:.4f}", flush=True)

    paint_named_parts()
    tone_materials()
    setup_studio(center, radius)
    cam, target = setup_camera(center, radius)
    BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print(f"Saved studio file {BLEND}", flush=True)
    return center, radius, cam, target


STUDIO_NAMES = ("KeyLight", "RimLight", "FillLight", "FloorFill", "WellFloor", "ShadowCatcher", "OrbitCam", "OrbitPivot")


def restage_existing():
    print(f"Opening {BLEND}", flush=True)
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    clear_explode()
    for name in STUDIO_NAMES:
        obj = bpy.data.objects.get(name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)
    leftover = bpy.data.materials.get("ShadowCatcher")
    if leftover:
        bpy.data.materials.remove(leftover)
    meshes = scene_meshes()
    mins, maxs = combined_bounds(meshes)
    center = (mins + maxs) * 0.5
    size = maxs - mins
    radius = max(size.x, size.y, size.z) * 0.5
    print(f"Bounds size={tuple(round(v, 4) for v in size)} radius={radius:.4f}", flush=True)
    setup_studio(center, radius)
    cam, target = setup_camera(center, radius)
    alum = bpy.data.materials.get("AluminumBox")
    if alum and alum.use_nodes:
        princ = alum.node_tree.nodes.get("Principled BSDF")
        if princ:
            princ.inputs["Base Color"].default_value = (0.38, 0.40, 0.43, 1.0)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("Restaged lights and camera", flush=True)
    return center, radius, cam, target


def shot_dir(name):
    return FRAMES_DIR / name


def render_shot(cam, target, center, radius, shot, preview=False):
    frames = apply_shot(cam, target, center, radius, shot)
    look = look_target(shot["look"], center, radius)
    print(
        f"Shot {shot['name']}: look={shot['look']} at {tuple(round(v, 4) for v in look)} "
        f"lens={shot.get('lens', 50)} frames={frames} dist={shot['start'][0]}→{shot['end'][0]}",
        flush=True,
    )
    out = shot_dir(shot["name"])
    out.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    if preview:
        for label, frame in (("start", 1), ("end", frames)):
            scene.frame_set(frame)
            preview_path = FRAMES_DIR / f"preview_{shot['name']}_{label}"
            scene.render.filepath = str(preview_path)
            bpy.ops.render.render(write_still=True)
            print(f"Wrote preview {preview_path}.png", flush=True)
        return
    scene.render.filepath = str(out / "frame_")
    print(f"Rendering {shot['name']} ({frames} frames) …", flush=True)
    bpy.ops.render.render(animation=True)
    print(f"Finished {shot['name']}", flush=True)


def main():
    if BLEND.exists() and not REBUILD:
        center, radius, cam, target = restage_existing()
    else:
        if REBUILD and BLEND.exists():
            BLEND.unlink()
        center, radius, cam, target = build_studio()

    configure_render(PREVIEW)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    oled = objects_prefixed("OLED Screen")
    stepper = objects_prefixed("17HM15")
    print(f"OLED parts={len(oled)} stepper parts={len(stepper)}", flush=True)

    for shot in SHOTS:
        render_shot(cam, target, center, radius, shot, preview=PREVIEW)

    print("Render complete", flush=True)


if __name__ == "__main__":
    main()
