"""Render the portfolio's workshop from the existing hardware source models.

blender --background --python reel/render_workshop.py
The arrangement is an authored display; vehicle and robot are photo-referenced.
"""
from pathlib import Path
from math import radians
import subprocess
import json
from datetime import datetime, timezone
import bpy
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public/assets/workshop"
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, roughness=.55, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat

def box(name, position, size, mat, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Machined edges", "BEVEL")
        mod.width = bevel
        mod.segments = 4
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj

def hardware(path, name, width, position, turn):
    with bpy.data.libraries.load(str(ROOT / path), link=False) as (source, loaded):
        loaded.objects = source.objects
    for obj in loaded.objects:
        if obj:
            bpy.context.scene.collection.objects.link(obj)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    meshes = [o for o in loaded.objects if o and o.type == "MESH"
              and not any(token in o.name.lower() for token in ("floor", "ground", "studio", "catcher", "bottle"))]
    # Bake the source hierarchy's world transforms before removing its lights/rig.
    transforms = {o: o.matrix_world.copy() for o in meshes}
    points = [transforms[o] @ Vector(p) for o in meshes for p in o.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    scale = width / max(high.x - low.x, high.y - low.y)
    center = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    transform = Matrix.Translation(Vector(position)) @ Matrix.Rotation(radians(turn), 4, "Z") @ Matrix.Scale(scale, 4) @ Matrix.Translation(-center)
    for o in meshes:
        o.animation_data_clear()
        o.parent = None
        o.matrix_world = transform @ transforms[o]
    for o in loaded.objects:
        if o and o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    return Vector(position) + Vector((0, 0, (high.z - low.z) * scale / 2))

chalk = material("Warm plaster", (.72, .69, .62))
blue = material("Powder blue enamel", (.28, .43, .47), .38)
coral = material("Vermilion enamel", (.68, .18, .095), .4)
stone = material("Chalk pedestal", (.84, .81, .73))
metal = material("Brushed aluminum", (.52, .57, .57), .28, .65)
floor = box("Workshop floor", (0, 0, -.16), (200, 200, .3), chalk, 0)
box("Matcher pedestal", (2.65, .35, .72), (3.2, 2.65, 1.44), coral, .09)
box("Vehicle pedestal", (.25, -1.6, .23), (2.75, 1.9, .46), blue, .07)
box("Robot pedestal", (5.4, 1.75, .49), (2.2, 2.25, .98), stone, .06)
centers = {
    "vehicle": hardware("reel/vehicle/vehicle-studio.blend", "vehicle", 2.25, (.25, -1.6, .47), -20),
    "robot": hardware("reel/robot/robot-studio.blend", "robot", 1.8, (5.4, 1.75, .99), -25),
    "matcher": hardware("reel/models/impedance-studio.blend", "matcher", 2.65, (2.65, .35, 1.45), -12),
}
# The continuous floor fills the camera: no freestanding supports or exposed wall edge.

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

def light(name, position, energy, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.size, data.color = energy, size, color
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = position
    aim(obj, (2, 0, 1))
    return data

key = light("Large workshop window", (-3, -2, 9), 1800, 5, (1, .92, .79))
fill = light("Cool daylight", (7, -4, 5), 1100, 5, (.78, .89, 1))
rim = light("Backlight", (4, 4, 8), 1600, 3, (1, .92, .8))
world = bpy.data.worlds.new("Daylight")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (.7, .77, .8, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = .35
bpy.context.scene.world = world
camera = bpy.data.objects.new("Workshop camera", bpy.data.cameras.new("Workshop camera"))
bpy.context.scene.collection.objects.link(camera)
camera.location = (9.4, -14.5, 10)
aim(camera, (1.0, .15, 1.05))
camera.data.type = "ORTHO"
camera.data.ortho_scale = 12.5
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1920
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
scene.render.film_transparent = False
scene.render.filepath = str(ROOT / "reel/world/workshop-light.png")
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "reel/world/workshop.blend"))
bpy.ops.render.render(write_still=True)
# Same physical scene after lights-out, with the illuminated objects still readable.
chalk.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.042, .055, .054, 1)
stone.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.19, .24, .22, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = .15
key.energy, fill.energy, rim.energy = 1250, 750, 1100
scene.render.filepath = str(ROOT / "reel/world/workshop-dark.png")
bpy.ops.render.render(write_still=True)

for theme in ("light", "dark"):
    asset = OUTPUT / f"workshop-{theme}.webp"
    subprocess.run(["cwebp", "-q", "88", str(ROOT / f"reel/world/workshop-{theme}.png"), "-o", str(asset)], check=True)
    asset.with_suffix(".webp.json").write_text(json.dumps({
        "prompt": "Origin: authored Blender Cycles render from reel/render_workshop.py. Actual impedance-studio.blend CAD plus photo-referenced vehicle-studio.blend and robot-studio.blend models. Static hardware on three colored display blocks, continuous studio floor, no wall edge or background supports. Reproduce with blender --background --python reel/render_workshop.py.",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }, indent=2) + "\n")
