"""Absorb the accepted opening bench into one lab and block in the other stations.

The vehicle is built from reel/vehicle/model.py and the robot from
reel/render_robot.py with the reel/robot_finish.py surfaces. Both are still
scaled to the animatic's provisional envelopes: no surveyed length is recorded,
so their rest cameras stay unauthored.

blender --background --python reel/world/build_lab.py -- --replace-floor
"""
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
WORLD = json.loads((ROOT / "reel/world/world.json").read_text(encoding="utf-8"))
OUT = ROOT / "reel/world/lab"
BENCH = ROOT / "reel/world/hero/opening-bench.blend"
BUILDERS = {
    "vehicle": ROOT / "reel/vehicle/model.py",
    "robot": ROOT / "reel/render_robot.py",
    "robot_finish": ROOT / "reel/robot_finish.py",
}
PROVISIONAL = {
    "vehicle": WORLD["animatic"]["proxy_sizes"]["vehicle-model"]["long_axis_m"],
    "robot": WORLD["animatic"]["proxy_sizes"]["robot-model"]["long_axis_m"],
}
SKIP_TYPES = {"LIGHT", "CAMERA"}
SKIP_NAMES = {"CameraTarget"}


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def mesh_bounds(objects):
    low = Vector((math.inf, math.inf, math.inf))
    high = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            low = Vector(map(min, low, point))
            high = Vector(map(max, high, point))
    if not math.isfinite(low.x):
        raise RuntimeError("device has no mesh bounds")
    return low, high


def material(name, color, roughness=0.55):
    found = bpy.data.materials.get(name)
    if found:
        return found
    mat = bpy.data.materials.new(name)
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    mat.diffuse_color = (*color, 1)
    return mat


def box(name, center, size, mat, collection):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.active_object
    obj.name = name
    obj.dimensions = size
    obj.data.materials.append(mat)
    for slot in obj.users_collection:
        slot.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def load_device(path):
    before = set(bpy.data.objects)
    with bpy.data.libraries.load(str(path), link=False) as (data_from, data_to):
        data_to.objects = [
            name for name in data_from.objects if name not in SKIP_NAMES
        ]
    loaded = [obj for obj in bpy.data.objects if obj not in before]
    kept = []
    for obj in loaded:
        if obj.type in SKIP_TYPES or obj.name in SKIP_NAMES:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return kept


def place_device(kind, objects, target_xy, yaw):
    collection = bpy.data.collections.new(f"Device / {kind}")
    bpy.context.scene.collection.children.link(collection)
    holder = bpy.data.objects.new(f"{kind.title()} / provisional placement", None)
    collection.objects.link(holder)
    for obj in objects:
        for slot in list(obj.users_collection):
            slot.objects.unlink(obj)
        collection.objects.link(obj)
        if obj.parent is None:
            obj.parent = holder
    bpy.context.view_layer.update()
    low, high = mesh_bounds(objects)
    source_extent = high - low
    long_axis = max(source_extent.x, source_extent.y)
    scale = PROVISIONAL[kind] / long_axis
    center = (low + high) / 2
    for obj in objects:
        if obj.parent == holder:
            obj.location -= Vector((center.x, center.y, low.z))
    holder.scale = (scale, scale, scale)
    holder.rotation_euler.z = yaw
    holder.location = (target_xy[0], target_xy[1], 0)
    holder["scale_status"] = "provisional"
    holder["final_cameras"] = False
    bpy.context.view_layer.update()
    placed_low, placed_high = mesh_bounds(objects)
    return {
        "source": str(Path(path)),
        "source_extent_units": [round(v, 4) for v in source_extent],
        "source_declares_metric": True,
        "surveyed_millimeters": None,
        "provisional_long_axis_m": PROVISIONAL[kind],
        "applied_uniform_scale": round(scale, 6),
        "placed_extent_m": [round(v, 4) for v in (placed_high - placed_low)],
        "placed_min_m": [round(v, 4) for v in placed_low],
        "placed_max_m": [round(v, 4) for v in placed_high],
        "final_cameras": False,
    }


def load_py(alias, path):
    spec = importlib.util.spec_from_file_location(alias, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def purge_unused():
    for bank in (bpy.data.materials, bpy.data.meshes, bpy.data.curves):
        for item in list(bank):
            if item.users == 0:
                bank.remove(item)


def remove_device(kind):
    collection = bpy.data.collections.get(f"Device / {kind}")
    if collection is None:
        return
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)
    purge_unused()


def claim_new(before, collection):
    created = [obj for obj in bpy.data.objects if obj not in before]
    for obj in created:
        for slot in list(obj.users_collection):
            slot.objects.unlink(obj)
        collection.objects.link(obj)
    return created


def parent_world(child, parent):
    # The holder is still at the origin here, so a plain parent keeps the
    # built offset. Assigning matrix_world before the parent evaluates
    # collapses that offset onto the holder.
    child.parent = parent


def meshes_under(root):
    return [obj for obj in root.children_recursive if obj.type == "MESH"]


def place_scaled(kind, collection, holder, measure, target_xy, yaw, source):
    bpy.context.view_layer.update()
    low, high = mesh_bounds(measure)
    long_axis = max(high.x - low.x, high.y - low.y)
    scale = PROVISIONAL[kind] / long_axis
    holder.scale = (scale, scale, scale)
    holder.rotation_euler.z = yaw
    bpy.context.view_layer.update()
    low, high = mesh_bounds(measure)
    center = (low + high) / 2
    holder.location = (target_xy[0] - center.x, target_xy[1] - center.y, -low.z)
    geometry().ground_floor_device(holder,kind)
    holder["scale_status"] = "provisional"
    holder["final_cameras"] = False
    bpy.context.view_layer.update()
    placed_low, placed_high = mesh_bounds(measure)
    return {
        "source": source,
        "surveyed_millimeters": None,
        "provisional_long_axis_m": PROVISIONAL[kind],
        "applied_uniform_scale": round(scale, 6),
        "placed_extent_m": [round(v, 4) for v in (placed_high - placed_low)],
        "placed_min_m": [round(v, 4) for v in placed_low],
        "placed_max_m": [round(v, 4) for v in placed_high],
        "final_cameras": False,
    }


def match_vehicle_wheels():
    """Grow the vehicle until its tire radius matches the robot's. Neither length is surveyed."""
    robot = bpy.data.objects["Robot / provisional placement"]
    vehicle = bpy.data.objects["Vehicle / provisional placement"]
    robot_radius = 0.576 * robot.scale.x
    vehicle_radius = 0.75 * vehicle.scale.x
    factor = robot_radius / vehicle_radius
    vehicle.scale = Vector(tuple(axis * factor for axis in vehicle.scale))
    bpy.context.view_layer.update()
    root = next(obj for obj in vehicle.children if obj.name == "Vehicle_Root")
    low, high = mesh_bounds(meshes_under(root))
    center = (low + high) / 2
    vehicle.location.x += 1.85 - center.x
    vehicle.location.y += 2.65 - center.y
    vehicle.location.z += -low.z
    bpy.context.view_layer.update()
    geometry().ground_floor_device(vehicle,'vehicle')
    low, high = mesh_bounds(meshes_under(root))
    return {
        "wheel_match": "vehicle tire radius set to the robot tire radius",
        "robot_tire_radius_m": round(robot_radius, 4),
        "vehicle_tire_radius_m": round(0.75 * vehicle.scale.x, 4),
        "scale_factor_from_provisional": round(factor, 4),
        "placed_extent_m": [round(v, 4) for v in (high - low)],
        "placed_min_m": [round(v, 4) for v in low],
        "placed_max_m": [round(v, 4) for v in high],
    }


def new_device_collection(kind):
    collection = bpy.data.collections.new(f"Device / {kind}")
    bpy.context.scene.collection.children.link(collection)
    holder = bpy.data.objects.new(f"{kind.title()} / provisional placement", None)
    collection.objects.link(holder)
    return collection, holder


def center_bottle_grab():
    return geometry().configure_bottle(_lab_api())


def _lab_api():
    from types import SimpleNamespace
    return SimpleNamespace(**globals())


def geometry():
    global _GEOMETRY
    if '_GEOMETRY' not in globals():
        _GEOMETRY = load_py('lab_geometry', Path(__file__).with_name('lab_geometry.py'))
    return _GEOMETRY


def place_current_robot():
    """Current photo-referenced robot, open arms, bottle on the floor in front."""
    remove_device("robot")
    collection, holder = new_device_collection("robot")
    robot_py = load_py("lab_render_robot", BUILDERS["robot"])
    finish = load_py("lab_robot_finish", BUILDERS["robot_finish"])
    before = set(bpy.data.objects)
    materials = robot_py.create_materials()
    root, _wheels, _scan, arms = robot_py.build_robot(materials)
    bottle = robot_py.build_bottle(materials)
    claim_new(before, collection)
    for arm in arms:
        arm.rotation_euler.z = float(arm["open_angle"])
    parent_world(root, holder)
    parent_world(bottle, holder)
    finish.apply_robot_finish(bpy.context.scene)
    report = place_scaled(
        "robot", collection, holder, meshes_under(root), (4.95, 2.65), 0,
        "reel/render_robot.py; reel/robot_finish.py",
    )
    report["bottle"] = center_bottle_grab()
    return report


def place_current_vehicle():
    """Current photo-reconstructed chassis, aimed along the lane."""
    remove_device("vehicle")
    collection, holder = new_device_collection("vehicle")
    vehicle_py = load_py("lab_vehicle_model", BUILDERS["vehicle"])
    before = set(bpy.data.objects)
    root, _wheels = vehicle_py.build_vehicle()
    claim_new(before, collection)
    parent_world(root, holder)
    yaw = math.atan2(0.50, 1.80)
    report = place_scaled(
        "vehicle", collection, holder, meshes_under(root), (1.85, 2.65), yaw,
        "reel/vehicle/model.py",
    )
    if bpy.data.objects.get("Robot / provisional placement"):
        report.update(match_vehicle_wheels())
    return report


def ensure_floor_fill():
    """Soft daylight over both floor stations. apply_lighting fades it around that beat."""
    name = "Floor / day fill"
    light = bpy.data.lights.get(name)
    if light is None:
        light = bpy.data.lights.new(name, "AREA")
        obj = bpy.data.objects.new(name, light)
        bpy.context.scene.collection.objects.link(obj)
    else:
        obj = bpy.data.objects.get(name) or bpy.context.scene.objects.get(name)
    light.shape = "RECTANGLE"
    light.size = 4.5
    light.size_y = 3.2
    light.energy = 0
    light.color = (0.86, 0.91, 1.0)
    obj.location = (3.75, 1.25, 2.85)
    look_at(obj, (3.75, 2.95, 0.1))


def station_shells():
    stations = bpy.data.collections.new("Stations / shells")
    bpy.context.scene.collection.children.link(stations)
    oak = material("Bench / photographed oak veneer", (0.42, 0.28, 0.14), 0.46)
    tape = material("Floor tape", (0.62, 0.48, 0.08), 0.72)
    grid = material("Robot grid", (0.22, 0.23, 0.22), 0.84)
    cork = material("Pinboard cork", (0.40, 0.28, 0.16), 0.86)
    sets = {item["id"]: item for item in WORLD["room"]["sets"]}
    geometry().floor_markings(_lab_api())
    desk = sets["personal-desk"]
    box("Personal desk", desk["center_m"], desk["size_m"], oak, stations)
    board = sets["pinboard"]
    box("Pinboard", board["center_m"], board["size_m"], cork, stations)
    ensure_floor_fill()


COMPANION_GLB = OUT / "sources" / "companion.glb"
KEYCHAIN_GLB = OUT / "sources" / "keychain.glb"
SCREEN_UI = OUT / 'textures/companion-clock.png'
# Footprint positions from kirby-committed.kicad_pcb. KiCad Y is flipped in the GLB.
# The LED and CR2032 models are not in the project, so these bodies are stand-ins
# on the real footprints. The mounting hole gets a ring.
KEYCHAIN_LEDS = (
    ("D1", 111.5, 121.0, 0),
    ("D2", 131.5, 79.2466, 0),
    ("D3", 149.9966, 85.5, 90),
    ("D4", 186.5, 116.5, 180),
    ("D5", 156.0, 132.801343, 0),
)
KEYCHAIN_CELL = (164.25, 88.546489, 90)


def keychain_light_windows():
    """F.Mask light window centres: (0, 2.5 mm) in each rotated footprint.

    These reverse-mounted LEDs illuminate the front through 4 mm windows;
    their footprint origins are not the centres of those windows.
    """
    for ref,x,y,rotation in KEYCHAIN_LEDS:
        angle=math.radians(rotation)
        yield ref,x+2.5*math.sin(angle),y+2.5*math.cos(angle)


def staging(name):
    return next(item for item in WORLD["staging"] if item["id"] == name)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [obj for obj in bpy.data.objects if obj not in before]


def new_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def adopt(objects, holder, collection):
    for obj in objects:
        for slot in list(obj.users_collection):
            slot.objects.unlink(obj)
        collection.objects.link(obj)
        if obj.parent is None:
            obj.parent = holder


def named_mesh(objects, token):
    found = [obj for obj in objects if obj.type == "MESH" and obj.data.name == token]
    if not found:
        found = [obj for obj in objects if obj.type == "MESH" and token in obj.data.name and "Back" not in obj.data.name]
    if not found:
        raise RuntimeError(f"no mesh named {token}")
    return found[0]


def seat(holder, meshes, rotation, xy, floor_z):
    holder.rotation_euler = rotation
    bpy.context.view_layer.update()
    low, high = mesh_bounds(meshes)
    center = (low + high) * 0.5
    holder.location = (xy[0] - center.x, xy[1] - center.y, floor_z - low.z)
    bpy.context.view_layer.update()
    return mesh_bounds(meshes)


def clean_screen():
    """Use the existing UI renderer, exported by export_companion_screen.mjs."""
    if not SCREEN_UI.is_file():
        raise RuntimeError('missing clean Companion UI; run reel/world/export_companion_screen.mjs with Node and Playwright')
    image=bpy.data.images.load(str(SCREEN_UI),check_existing=True)
    image.pack()
    return image


def emissive_image(name, image, strength):
    mat = bpy.data.materials.new(name)
    bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation='Closest'
    bsdf.inputs['Base Color'].default_value=(.003,.004,.006,1)
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = strength
    bsdf.inputs["Roughness"].default_value = 0.42
    bsdf.inputs['Specular IOR Level'].default_value=.22
    mat.diffuse_color = (0.45, 0.55, 0.95, 1)
    return mat


def paint_feet(objects):
    red = material("Companion feet", (0.72, 0.13, 0.16), 0.55)
    for obj in objects:
        if obj.type == "MESH" and obj.data.name.startswith("Feet"):
            obj.data.materials.clear()
            obj.data.materials.append(red)


def add_companion_eyes(holder, objects):
    return geometry().companion_eyes(_lab_api(), holder, objects)


def place_companion(floor_z):
    if not COMPANION_GLB.is_file():
        raise RuntimeError(f"missing companion glb: {COMPANION_GLB}")
    objects = import_glb(COMPANION_GLB)
    collection = new_collection("Device / companion")
    holder = bpy.data.objects.new("Companion / measured enclosure", None)
    collection.objects.link(holder)
    adopt(objects, holder, collection)
    screen = named_mesh(objects, "ESP32-S3-TOUCH-LCD-2-PMMA")
    shell = named_mesh(objects, "Shell")
    low, high = mesh_bounds([screen])
    shell_low, _shell_high = mesh_bounds([shell])
    # The glass sits behind the shell opening. Place the clean UI inside it.
    bpy.ops.mesh.primitive_plane_add(size=1, location=((low.x + high.x) / 2, (low.y + high.y) / 2, shell_low.z + 0.0012))
    plane = bpy.context.active_object
    plane.name = "Companion screen"
    plane.dimensions = (0.042, 0.030, 0)
    plane.rotation_euler.x = math.pi
    plane.data.materials.append(emissive_image("Companion screen", clean_screen(), .85))
    for slot in list(plane.users_collection):
        slot.objects.unlink(plane)
    collection.objects.link(plane)
    plane.parent = holder
    objects.append(plane)
    rest = staging("companion")["rest_position_m"]
    # Feet point along local +Y and the display faces local -Z. Tip the body upright
    # and turn the screen toward the south side of the desk.
    paint_feet(objects)
    placed_low, placed_high = seat(holder, [obj for obj in objects if obj.type == "MESH"], (math.radians(-90), 0, 0), rest[:2], floor_z)
    objects.extend(add_companion_eyes(holder, objects))
    holder["scale_status"] = "step-millimetres"
    return {
        "source": "C:/Users/alpac/Downloads/Kirby.step",
        "screen": "existing Companion clock renderer, clean 320x240 UI",
        "eyes": "paper decals",
        "feet": "painted red",
        "placed_extent_m": [round(v, 4) for v in (placed_high - placed_low)],
        "placed_min_m": [round(v, 4) for v in placed_low],
        "final_cameras": False,
    }


def principled(mat):
    return next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")


def tint_material(mat, color, roughness, metallic=0.0):
    bsdf = principled(mat)
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    mat.diffuse_color = (*color, 1)


def keychain_hole(board):
    """Mounting hole at KiCad (150.5, 65.75) mm. The GLB flips Y and may be stored in millimetres."""
    xs = [Vector(corner).x for corner in board.bound_box]
    ys = [Vector(corner).y for corner in board.bound_box]
    face_z = max(Vector(corner).z for corner in board.bound_box)
    unit = 1.0 if (max(xs) - min(xs)) > 2 else 0.001
    pad = (max(xs) - min(xs)) * 0.02
    hits = []
    for sign in (-1, 1):
        point = Vector((150.5 * unit, sign * 65.75 * unit, face_z))
        if min(xs) - pad <= point.x <= max(xs) + pad and min(ys) - pad <= point.y <= max(ys) + pad:
            hits.append(point)
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        middle = (min(ys) + max(ys)) * 0.5
        return max(hits, key=lambda point: abs(point.y - middle))
    raise RuntimeError(f"keychain hole is outside the board x {min(xs):.3f}..{max(xs):.3f} y {min(ys):.3f}..{max(ys):.3f}")


def style_keychain(objects, holder):
    board = named_mesh(objects, "kirby-committed_PCB")
    finish = geometry().keychain_finish(_lab_api(), objects, board, holder)
    hole = keychain_hole(board)
    geometry().threaded_ring(_lab_api(), board, holder, objects)
    for obj in objects:
        if not obj.name.startswith("Keychain ") or obj.type != "MESH":
            continue
        if obj.get('keychain_led'):
            tint_material(obj.data.materials[0], (0.64, 0.71, 0.35), 0.35)
            bsdf = principled(obj.data.materials[0])
            bsdf.inputs["Emission Color"].default_value = (0.86, 1.0, 0.45, 1)
            bsdf.inputs["Emission Strength"].default_value = 0.18
        elif "holder" in obj.name:
            tint_material(obj.data.materials[0], (0.08, 0.08, 0.075), 0.45)
        elif "CR2032" in obj.name:
            tint_material(obj.data.materials[0], (0.72, 0.72, 0.68), 0.3, 0.85)
    return {"hole_local_m": [round(v, 4) for v in hole], **finish}


def place_keychain(floor_z):
    if not KEYCHAIN_GLB.is_file():
        raise RuntimeError(f"missing keychain glb: {KEYCHAIN_GLB}")
    objects = import_glb(KEYCHAIN_GLB)
    collection = new_collection("Device / keychain")
    holder = bpy.data.objects.new("Keychain / KiCad board", None)
    collection.objects.link(holder)
    adopt(objects, holder, collection)
    board = named_mesh(objects, "kirby-committed_PCB")
    board_low, board_high = mesh_bounds([board])
    led = material("Keychain LED stand-in", (0.95, 0.9, 0.55), 0.25)
    led_bsdf = next(node for node in led.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    led_bsdf.inputs["Emission Color"].default_value = (1, 0.92, 0.55, 1)
    led_bsdf.inputs["Emission Strength"].default_value = 6
    body = material("Keychain holder stand-in", (0.55, 0.55, 0.52), 0.4)
    cell = material("Keychain cell stand-in", (0.75, 0.75, 0.72), 0.28)
    for ref, x_mm, y_mm in keychain_light_windows():
        # Front optical windows; the SMD packages are on the back of the board.
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.002, depth=0.00025, location=(x_mm / 1000, -y_mm / 1000, board_high.z + 0.000175))
        obj = bpy.context.active_object
        obj.name = f"Keychain {ref} stand-in"
        obj.data.materials.append(led)
        obj["stand_in"] = True
        obj["keychain_led"] = True
        for slot in list(obj.users_collection):
            slot.objects.unlink(obj)
        collection.objects.link(obj)
        obj.parent = holder
        objects.append(obj)
    x_mm, y_mm, rotation = KEYCHAIN_CELL
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x_mm / 1000, -y_mm / 1000, board_low.z - 0.0022))
    holder_body = bpy.context.active_object
    holder_body.name = "Keychain cell holder stand-in"
    holder_body.dimensions = (0.0243, 0.0157, 0.0044)
    holder_body.rotation_euler.z = math.radians(-rotation)
    holder_body.data.materials.append(body)
    holder_body["stand_in"] = True
    bpy.ops.mesh.primitive_cylinder_add(radius=0.01, depth=0.0032, location=(x_mm / 1000, -y_mm / 1000, board_low.z - 0.0016))
    coin = bpy.context.active_object
    coin.name = "Keychain CR2032 stand-in"
    coin.data.materials.append(cell)
    coin["stand_in"] = True
    for obj in (holder_body, coin):
        for slot in list(obj.users_collection):
            slot.objects.unlink(obj)
        collection.objects.link(obj)
        obj.parent = holder
        objects.append(obj)
    face = style_keychain(objects, holder)
    # Tip the head up and the near edge down so the face angles toward the desk camera.
    rest = staging("keychain")["rest_position_m"]
    placed_low, placed_high = seat(holder, [obj for obj in objects if obj.type == "MESH" and not obj.hide_viewport], (math.radians(18), 0, 0), rest[:2], floor_z)
    supports = geometry().keychain_support(_lab_api(), holder, board, floor_z)
    holder["scale_status"] = "kicad-millimetres"
    return {
        "source": "public/assets/projects/keychain/kicad/kirby-committed.kicad_pcb",
        "stand_ins": ["D1", "D2", "D3", "D4", "D5", "CR2032 holder"],
        "key_ring": True,
        "supports": supports,
        "face": face,
        "placed_extent_m": [round(v, 4) for v in (placed_high - placed_low)],
        "placed_min_m": [round(v, 4) for v in placed_low],
        "final_cameras": False,
    }


def enable_cycles_gpu():
    prefs = bpy.context.preferences.addons["cycles"].preferences
    scene = bpy.context.scene
    for backend in ("METAL", "OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
        except (TypeError, RuntimeError):
            continue
        devices = [device for device in prefs.devices if device.type == backend]
        if not devices:
            continue
        for device in prefs.devices:
            device.use = device.type == backend
        scene.cycles.device = "GPU"
        print("CYCLES_DEVICE", backend, [device.name for device in devices], flush=True)
        return
    print("CYCLES_DEVICE", "CPU", flush=True)


def layout_still():
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("Layout close")
    camera_data.lens = 16
    camera = bpy.data.objects.new("Layout / close (not a rest)", camera_data)
    scene.collection.objects.link(camera)
    # Wide enough to show both floor devices. This is a layout check, not the close.
    camera.location = (3.3, 0.3, 3.2)
    look_at(camera, (3.9, 3.5, 0.15))
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(OUT / "layout-close.png")
    bpy.ops.render.render(write_still=True)


def set_light(name, energy, color=None):
    light = bpy.data.lights.get(name)
    if light is None:
        return
    light.energy = energy
    if color is not None:
        light.color = color


def set_world(color, strength):
    world = bpy.context.scene.world
    if world and world.node_tree:
        background = world.node_tree.nodes.get("Background")
        if background:
            background.inputs[0].default_value = (*color, 1)
            background.inputs[1].default_value = strength


def set_desk_practicals(energy_scale):
    rig=WORLD['lighting']['rig']
    warm=kelvin_rgb(WORLD['lighting']['practicals_kelvin']['desk'])
    set_light("Desk lamp / 3000K", rig['desk_w'] * energy_scale, warm)
    set_light("Desk lamp / wall spill", rig['wall_bounce_w'] * energy_scale, warm)
    set_light('Room / storage strip',rig['storage_strip_w']*energy_scale,warm)
    set_light('Room / linen corner lamp',rig['corner_lamp_w']*energy_scale,kelvin_rgb(2700))
    for name,strength in (('Room detail / shelf diffuser',.7),('Room detail / lamp bulb',3),('Room detail / linen shade',.12)):
        mat=bpy.data.materials.get(name)
        if mat:principled(mat).inputs['Emission Strength'].default_value=strength*energy_scale


def kelvin_rgb(kelvin):
    temp = kelvin / 100
    if temp <= 66:
        red = 255
        green = 99.4708025861 * math.log(temp) - 161.1195681661
        blue = 0 if temp <= 19 else 138.5177312231 * math.log(temp - 10) - 305.0447927307
    else:
        red = 329.698727446 * ((temp - 60) ** -0.1332047592)
        green = 288.1221695283 * ((temp - 60) ** -0.0755148492)
        blue = 255

    def channel(value):
        return max(0, min(255, value)) / 255

    return (channel(red), channel(green), channel(blue))


def smoothstep(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


def lighting_at(scroll_percent):
    """Smoothstep between the keyed states. The close stays on the last dusk key."""
    states = WORLD["lighting"]["states"]
    scroll = max(states[0]["at_scroll_percent"], min(states[-1]["at_scroll_percent"], scroll_percent))
    for earlier, later in zip(states, states[1:]):
        if scroll <= later["at_scroll_percent"]:
            span = later["at_scroll_percent"] - earlier["at_scroll_percent"]
            blend = smoothstep(0 if span == 0 else (scroll - earlier["at_scroll_percent"]) / span)

            def mix(key):
                return earlier[key] + (later[key] - earlier[key]) * blend

            return {
                "window_kelvin": mix("window_kelvin"),
                "window_relative_power": mix("window_relative_power"),
                "desk_relative_power": mix("desk_relative_power"),
            }
    last = states[-1]
    return {key: last[key] for key in ("window_kelvin", "window_relative_power", "desk_relative_power")}


def apply_lighting(scroll_percent):
    """One rig. Morning at 0 matches the opening frame. Scroll 60 through 100 stays at dusk."""
    state = lighting_at(scroll_percent)
    power = state["window_relative_power"]
    rig=WORLD['lighting']['rig']
    tint = tuple(channel / base for channel, base in zip(kelvin_rgb(state["window_kelvin"]), kelvin_rgb(6500)))

    def tinted(color):
        return tuple(max(0.0, min(1.0, channel * scale)) for channel, scale in zip(color, tint))

    shaft = power ** 2
    set_light("West window / open sky", 60 * power, tinted((0.78, 0.87, 1.0)))
    set_light("West window / low morning key", 1400 * shaft, tinted((1.0, 0.93, 0.83)))
    day=tinted((.86,.92,1.0));blend=state['desk_relative_power']*.55
    bounce=tuple(a+(b-a)*blend for a,b in zip(day,(1.0,.87,.70)))
    set_light("Room / soft ceiling bounce", rig['ceiling_day_w'] * power + rig['ceiling_evening_w'] * state['desk_relative_power'], bounce)
    set_light("Morning / sun through west window", 0.35 * shaft, tinted((1.0, 0.90, 0.75)))
    set_world(
        (0.12 + 0.43 * power, 0.16 + 0.51 * power, 0.28 + 0.52 * power),
        rig['world_floor_strength'] + .032 * power,
    )
    set_desk_practicals(state["desk_relative_power"])
    # The broad room fill follows daylight throughout the film, including dusk.
    # It does not switch off when the camera leaves the robot station.
    set_light("Floor / day fill", rig['floor_day_w'] * power + rig['floor_evening_w'] * state['desk_relative_power'], tinted((.84,.91,1.0)))
    sky=bpy.data.materials.get('Detail / exterior sky')
    if sky:
        principled(sky).inputs['Emission Strength'].default_value=rig['exterior_sky_day']*power+rig['exterior_sky_floor']
    return state


def set_morning():
    apply_lighting(0)


def set_evening():
    apply_lighting(100)


def apply_evening():
    set_evening()


def adopt_mesh(name, mat, collection):
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    for slot in list(obj.users_collection):
        slot.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def rod(name, start, end, radius, mat, collection):
    start, end = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=(end - start).length, location=(start + end) / 2)
    obj = adopt_mesh(name, mat, collection)
    obj.rotation_euler = (end - start).to_track_quat("Z", "Y").to_euler()
    return obj


def desk_lamp():
    return geometry().task_lamp(_lab_api())


ASSETS = ROOT / "src/assets"
PIN_FACE_Y = 6.388


def tube(name, points, radius, mat, collection):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = radius
    data.bevel_resolution = 2
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, value in zip(spline.points, points):
        point.co = (*value, 1)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.visible_shadow = False
    return obj


def face_plane(name, center_xz, size_xz, y, mat, collection):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(center_xz[0], y, center_xz[1]), rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size_xz[0], size_xz[1], 1)
    obj.data.materials.append(mat)
    for slot in list(obj.users_collection):
        slot.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def print_material(name, path):
    mat = bpy.data.materials.new(name)
    bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    image = bpy.data.images.load(str(path))
    image.pack()
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if image.channels == 4:
        mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "DITHERED"
    bsdf.inputs["Roughness"].default_value = 0.62
    return mat


def pin(name, center_xz, collection):
    steel = material("Pin / dark steel", (0.12, 0.12, 0.12), 0.35)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=0.004,
        depth=0.006,
        location=(center_xz[0], PIN_FACE_Y - 0.001, center_xz[1]),
        rotation=(math.pi / 2, 0, 0),
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(steel)
    for slot in list(obj.users_collection):
        slot.objects.unlink(obj)
    collection.objects.link(obj)


def pinned_smith(center_xz, radius, collection):
    ink = material("Notebook / technical pencil", (0.07, 0.08, 0.072), 0.9)
    trace = material("Notebook / muted red pencil", (0.20, 0.027, 0.012), 0.86)
    y = PIN_FACE_Y - 0.0012
    cx, cz = center_xz

    def on_chart(px, pz):
        return (px, y, pz)

    for resistance in (0, 0.2, 0.5, 1, 2, 5):
        rr, c = 1 / (1 + resistance), resistance / (1 + resistance)
        points = [
            on_chart(cx + radius * (c + rr * math.cos(2 * math.pi * i / 80)), cz + radius * rr * math.sin(2 * math.pi * i / 80))
            for i in range(81)
        ]
        tube("Pinned Smith / resistance circle", points, 0.00045, ink, collection)
    for reactance in (0.2, 0.5, 1, 2, 5):
        for sign in (-1, 1):
            points = []
            for i in range(90):
                resistance = 10 ** (-3 + 6 * i / 89)
                gamma = (complex(resistance, sign * reactance) - 1) / (complex(resistance, sign * reactance) + 1)
                points.append(on_chart(cx + radius * gamma.real, cz + radius * gamma.imag))
            tube("Pinned Smith / reactance arc", points, 0.0004, ink, collection)
    tube("Pinned Smith / real axis", [on_chart(cx - radius, cz), on_chart(cx + radius, cz)], 0.0004, ink, collection)
    points = []
    for i in range(90):
        t = i / 89
        mag = 0.83 * (1 - t) ** 1.25
        angle = 2.3 - 2 * math.pi * 1.35 * t
        points.append(on_chart(cx + radius * mag * math.cos(angle), cz + radius * mag * math.sin(angle)))
    tube("Pinned Smith / illustrative pencil trace", points, 0.0009, trace, collection)


def place_pinboard():
    """Real portrait and logos, plus the same mathematical Smith print as the notebook."""
    collection = new_collection("Pinboard / prints")
    paper = material("Pinboard / print paper", (0.965, 0.949, 0.914), 0.72)
    portrait = (5.12, 1.78)
    face_plane("Pinboard / portrait", portrait, (0.56, 0.56), PIN_FACE_Y, print_material("Pinboard / portrait photo", ASSETS / "portrait.jpg"), collection)
    for corner in ((-0.26, 0.26), (0.26, 0.26)):
        pin("Pinboard / portrait pin", (portrait[0] + corner[0], portrait[1] + corner[1]), collection)
    ink = material("Notebook / graphite", (0.06, 0.065, 0.058), 0.89)
    font_path = Path(r"C:\Windows\Fonts\arial.ttf")
    if font_path.is_file():
        curve = bpy.data.curves.new("Pinboard / photograph label", "FONT")
        curve.body = "Photograph"
        curve.size = 0.022
        curve.align_x = "CENTER"
        curve.font = bpy.data.fonts.load(str(font_path))
        label = bpy.data.objects.new("Pinboard / photograph label", curve)
        label.location = (portrait[0], PIN_FACE_Y - 0.001, 1.44)
        label.rotation_euler = (math.pi / 2, 0, 0)
        label.data.materials.append(ink)
        collection.objects.link(label)
    logos = (
        ("ford", ASSETS / "logo-ford.png", 4.90),
        ("hacker-fab", ASSETS / "logo-hacker-fab.png", 5.12),
        ("cmu", ASSETS / "logo-cmu.png", 5.34),
    )
    for name, path, x in logos:
        face_plane(f"Pinboard / {name} card", (x, 1.28), (0.16, 0.16), PIN_FACE_Y + 0.0002, paper, collection)
        face_plane(f"Pinboard / {name}", (x, 1.28), (0.14, 0.14), PIN_FACE_Y - 0.0002, print_material(f"Pinboard / {name} mark", path), collection)
        pin(f"Pinboard / {name} pin", (x, 1.35), collection)
    sheet = (6.02, 1.72)
    face_plane("Pinboard / smith sheet", sheet, (0.48, 0.60), PIN_FACE_Y, paper, collection)
    pinned_smith((sheet[0], 1.78), 0.16, collection)
    for corner in ((-0.22, 0.28), (0.22, 0.28)):
        pin("Pinboard / smith pin", (sheet[0] + corner[0], sheet[1] + corner[1]), collection)
    return {
        "portrait": "src/assets/portrait.jpg",
        "logos": ["src/assets/logo-ford.png", "src/assets/logo-hacker-fab.png", "src/assets/logo-cmu.png"],
        "smith": "mathematical, same construction as the notebook",
        "caption": "Photograph",
        "final_cameras": False,
    }


def hold_camera(pose_id, object_name):
    scene = bpy.context.scene
    pose = next(item for item in WORLD["camera"]["poses"] if item["id"] == pose_id)
    camera_data = bpy.data.cameras.new(object_name)
    camera_data.lens = pose["lens_mm"]
    camera_data.sensor_width = 36
    camera_data.shift_x = pose.get("shift_x", 0)
    camera_data.shift_y = pose.get("shift_y", 0)
    camera_data.clip_start = 0.01
    camera_data.dof.use_dof = True
    camera_data.dof.aperture_fstop = 8
    camera = bpy.data.objects.new(object_name, camera_data)
    scene.collection.objects.link(camera)
    camera.location = pose["position_m"]
    look_at(camera, pose["target_m"])
    camera.data.dof.focus_distance = (Vector(pose["target_m"]) - Vector(pose["position_m"])).length
    scene.camera = camera
    return camera


def render_hold(filepath, exposure=-0.75):
    scene = bpy.context.scene
    enable_cycles_gpu()
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = exposure
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.filepath = str(filepath)
    bpy.ops.render.render(write_still=True)


def lamp_spill():
    """Broad reflected lamp spill replaces the pinboard spotlight circle."""
    return load_py('lab_look',Path(__file__).with_name('lab_look.py')).wall_bounce(_lab_api())


def close_still():
    set_evening()
    camera = hold_camera("close", "Close / dusk hold")
    camera.data.dof.aperture_fstop = 11
    render_hold(OUT / "close-landscape-draft.png", exposure=-0.15)


def matcher_still():
    set_morning()
    camera = hold_camera("matcher", "Matcher / morning hold")
    camera.data.dof.aperture_fstop = 9
    render_hold(OUT / "matcher-landscape-draft.png")


def wall_still():
    set_evening()
    lamp_spill()
    hold_camera("wall", "Wall / evening hold")
    render_hold(OUT / "wall-landscape-draft.png")


def desk_still():
    scene = bpy.context.scene
    apply_evening()
    desk_lamp()
    pose = next(item for item in WORLD["camera"]["poses"] if item["id"] == "desk")
    camera_data = bpy.data.cameras.new("Desk rest")
    camera_data.lens = pose["lens_mm"]
    camera_data.sensor_width = 36
    camera_data.shift_x = pose.get("shift_x", 0)
    camera_data.shift_y = pose.get("shift_y", 0)
    camera_data.clip_start = 0.01
    camera_data.dof.use_dof = True
    camera_data.dof.aperture_fstop = 8
    camera = bpy.data.objects.new("Desk / evening hold", camera_data)
    scene.collection.objects.link(camera)
    camera.location = pose["position_m"]
    look_at(camera, pose["target_m"])
    camera.data.dof.focus_distance = (Vector(pose["target_m"]) - Vector(pose["position_m"])).length
    enable_cycles_gpu()
    scene.camera = camera
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.75
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.filepath = str(OUT / "desk-landscape-draft.png")
    bpy.ops.render.render(write_still=True)


def main():
    if not BENCH.is_file():
        raise RuntimeError(f"missing opening bench: {BENCH}")
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(BENCH))
    station_shells()
    desk = next(item for item in WORLD["room"]["sets"] if item["id"] == "personal-desk")
    desk_top = desk["center_m"][2] + desk["size_m"][2] / 2
    report = {
        "stage": "shared-lab-size-unverified",
        "absorbed": "reel/world/hero/opening-bench.blend",
        "final_cameras": False,
        "reason": (
            "No surveyed length is recorded for the vehicle or the robot. "
            "projects.ts gives none. reel/vehicle/CHASSIS-SOURCES.md says the "
            "studio units are not surveyed millimetres. The animatic envelopes "
            "are provisional, so the rest cameras stay unauthored."
        ),
        "devices": {
            "robot": place_current_robot(),
            "vehicle": place_current_vehicle(),
            "companion": place_companion(desk_top),
            "keychain": place_keychain(desk_top),
            "pinboard": place_pinboard(),
        },
    }
    (OUT / "size-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print('CONTEXT',load_py('lab_context',Path(__file__).with_name('lab_context.py')).furnish(_lab_api()),flush=True)
    print('LOOK',load_py('lab_look',Path(__file__).with_name('lab_look.py')).apply(_lab_api()),flush=True)
    layout_still()
    matcher_still()
    desk_still()
    wall_still()
    close_still()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "lab.blend"))
    print("LAB_SIZE", json.dumps(report["devices"]), flush=True)
    print("LAB_SAVED", OUT / "lab.blend", flush=True)


def replace_floor():
    """Swap the floor models in the existing lab without re-rendering the other stills."""
    bpy.ops.wm.open_mainfile(filepath=str(OUT / "lab.blend"))
    remove_device("vehicle")
    report = {
        "robot": place_current_robot(),
        "vehicle": place_current_vehicle(),
    }
    ensure_floor_fill()
    set_evening()
    bpy.ops.wm.save_mainfile()
    print("FLOOR_REPLACED", json.dumps(report), flush=True)


def restyle_desk():
    """Replace the Companion and keychain in the open lab. Does not render."""
    desk = next(item for item in WORLD["room"]["sets"] if item["id"] == "personal-desk")
    desk_top = desk["center_m"][2] + desk["size_m"][2] / 2
    remove_device("companion")
    remove_device("keychain")
    return {
        "companion": place_companion(desk_top),
        "keychain": place_keychain(desk_top),
        "bottle": center_bottle_grab(),
    }


def match_wheels_only():
    """Rescale the vehicle already in lab.blend. Does not rebuild the meshes."""
    bpy.ops.wm.open_mainfile(filepath=str(OUT / "lab.blend"))
    report = match_vehicle_wheels()
    set_evening()
    bpy.ops.wm.save_mainfile()
    print("WHEELS_MATCHED", json.dumps(report), flush=True)


if __name__ == "__main__":
    if "--replace-floor" in sys.argv:
        replace_floor()
    elif "--match-wheels" in sys.argv:
        match_wheels_only()
    elif "--restyle-desk" in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(OUT / "lab.blend"))
        report = restyle_desk()
        bpy.ops.wm.save_mainfile()
        print("DESK_RESTYLED", json.dumps(report), flush=True)
    else:
        main()
