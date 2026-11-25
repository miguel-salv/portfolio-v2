"""Render the drive-by-wire catalogue film from the Lab 4 CAD exports.

Run Blender in background mode with this script, then pass the archived
chassis-data directory and a frame output directory after `--`.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector


FPS = 24
FRAME_COUNT = 84
WIDTH, HEIGHT = 1440, 1080


def material(name, color, metallic=0.0, roughness=0.55):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return result


def aim(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def ease(value):
    value = min(1, max(0, value))
    return value * value * (3 - 2 * value)


def load_chassis(source):
    materials = [
        material("Satin black sheet metal", (.026, .026, .026), roughness=.43),
        material("Black fasteners", (.045, .045, .045), .6),
        material("Motor and hub housings", (.055, .055, .055), .5, .48),
        material("Silver linkages", (.44, .49, .52), .8, .32),
        material("Brass hardware", (.45, .30, .12), .25, .52),
        material("Rubber tires", (.023, .023, .023), roughness=.8),
        material("Steel screws", (.35, .39, .42), .75),
        material("Dark hardware", (.045, .045, .045), .65),
        material("Black screws", (.040, .040, .040), .65),
        material("Servo body", (.055, .055, .055), .15),
        material("Servo brass", (.56, .34, .12), .7),
        material("Red wheel hubs", (.42, .035, .025), .5),
        material("Encoder boards", (.58, .62, .65), .2),
    ]
    objects = {}
    index = json.loads((source / "chassis-mesh-index.json").read_text())
    for item in index["objects"]:
        number = item["index"]
        name = f"ChassisCAD_{number}"
        mesh = bpy.data.meshes.new(name)
        with np.load(source / item["file"]) as data:
            mesh.from_pydata((data["vertices"] * .001).tolist(), [], data["faces"].tolist())
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        mesh.materials.append(materials[item["layer"]])
        mesh.polygons.foreach_set("use_smooth", np.ones(len(mesh.polygons), dtype=bool))
        if item["layer"] in (3, 4):
            # Keep the flat faces of hex hardware flat as the camera rises.
            for polygon in mesh.polygons:
                polygon.use_smooth = False
        objects[number] = obj
    return objects


def finish_pi(controller):
    """Translate the archived Pi STEP colors into part-specific Cycles finishes."""
    soldermask = material("Pi green solder mask", (.018, .115, .058), 0, .48)
    mask_shader = soldermask.node_tree.nodes["Principled BSDF"]
    mask_shader.inputs["Specular IOR Level"].default_value = .42
    mask_shader.inputs["Coat Weight"].default_value = .08
    mask_shader.inputs["Coat Roughness"].default_value = .39

    steel = material("Pi stamped connector steel", (.56, .58, .60), 1, .26)
    nodes, links = steel.node_tree.nodes, steel.node_tree.links
    shader = nodes["Principled BSDF"]
    # The imported CAD is in metres. Break the reflection at the sheet edges
    # and vary the roughness at a fine scale without beveling tessellated meshes.
    bevel = nodes.new("ShaderNodeBevel")
    bevel.inputs["Radius"].default_value = .00010
    bevel.samples = 4
    links.new(bevel.outputs["Normal"], shader.inputs["Normal"])
    coordinates = nodes.new("ShaderNodeTexCoord")
    stretch = nodes.new("ShaderNodeVectorMath")
    stretch.operation = "MULTIPLY"
    stretch.inputs[1].default_value = (1, .15, 1)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 14500
    noise.inputs["Detail"].default_value = 1
    roughness = nodes.new("ShaderNodeMapRange")
    roughness.inputs["To Min"].default_value = .23
    roughness.inputs["To Max"].default_value = .32
    links.new(coordinates.outputs["Object"], stretch.inputs[0])
    links.new(stretch.outputs["Vector"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], roughness.inputs["Value"])
    links.new(roughness.outputs["Result"], shader.inputs["Roughness"])

    chip_lid = material("Pi processor heat spreader", (.53, .54, .56), .96, .33)
    plastic = material("Pi black molded plastic", (.022, .024, .025), 0, .54)
    gold = material("Pi gold contacts", (.58, .38, .12), .84, .31)
    tin = material("Pi tinned leads", (.43, .44, .46), .88, .36)
    # The GLB shares some material IDs across unrelated parts. Resolve those
    # slots by CAD component name before substituting the common finishes.
    finishes = {
        "mat_0": tin,
        "mat_22": gold,
        "mat_24": plastic,
        "mat_25": gold,
        "mat_26": gold,
        "mat_27": material("Pi flex socket body", (.55, .48, .36), 0, .48),
        "mat_28": plastic,
        "mat_31": plastic,
        "mat_32": gold,
        "mat_33": steel,
        "mat_34": steel,
        "mat_35": material("Pi USB 3 blue insert", (.011, .071, .30), 0, .43),
        "mat_36": material("Pi laser markings", (.29, .30, .29), 0, .63),
    }
    led = material("Pi Ethernet indicator lens", (.045, .25, .039), 0, .40)
    amber = material("Pi amber Ethernet indicator lens", (.38, .25, .027), 0, .40)
    receivers = []
    for obj in controller:
        if obj.type != "MESH" or ", RPi4ModelB" not in obj.data.name:
            continue
        part = obj.data.name.split(", RPi4ModelB")[0]
        for slot in obj.material_slots:
            source = slot.material.name.partition(".")[0] if slot.material else ""
            surface = finishes.get(source)
            if source == "mat_21":
                surface = soldermask if part == "PCB" else led
            elif source == "mat_23":
                surface = chip_lid if "CPU" in part else steel if part == "SD Card Slot" else tin
            elif source == "mat_29":
                surface = steel if part.endswith("PORTS") or part == "Gigabit Ethernet Port" else tin
            elif source == "mat_30":
                surface = amber
            if surface is not None:
                slot.link = "OBJECT"
                slot.material = surface
                if surface in (steel, chip_lid) and obj not in receivers:
                    receivers.append(obj)
    return receivers


def light_pi_metal(receivers):
    if not receivers:
        return
    # This narrow softbox reflects off the Pi hardware as the camera rises.
    # Light linking limits its contribution to the selected Pi meshes.
    data = bpy.data.lights.new("Pi metal reflection strip", "AREA")
    data.energy = 3.5
    data.shape = "RECTANGLE"
    data.size = .24
    data.size_y = .055
    data.diffuse_factor = 0
    light = bpy.data.objects.new(data.name, data)
    bpy.context.collection.objects.link(light)
    light.location = (-.18, .31, .34)
    aim(light, (0, .03, .13))
    collection = bpy.data.collections.new("Pi reflection receivers")
    for obj in receivers:
        collection.objects.link(obj)
    light.light_linking.receiver_collection = collection


def load_controller(source):
    previous = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source / "controller.glb"))
    controller = set(bpy.data.objects) - previous
    bpy.context.view_layer.update()
    mask = material("Black soldermask", (.009, .011, .014), .10, .52)
    silk = material("White silkscreen", (.85, .87, .84), 0, .65)
    pads = material("ENIG pads", (.55, .34, .07), .75, .28)
    body = next(obj for obj in controller if obj.type == "MESH" and obj.data.name == "controller_PCB")
    board_z = min((body.matrix_world @ Vector(vertex)).z for vertex in body.bound_box)
    # Preserve the transform from the archived mounted-fit render.
    to_chassis = Matrix.Translation((.109232262, -.101958968, .091117693 - board_z))
    to_chassis @= Matrix.Rotation(math.pi, 4, "Z")
    for obj in controller:
        if obj.parent is None:
            obj.matrix_world = to_chassis @ obj.matrix_world
        if obj.type != "MESH":
            continue
        name = obj.data.name
        surface = mask if "soldermask" in name else silk if "silkscreen" in name else pads if name == "controller_pad" else None
        if surface:
            obj.data.materials.clear()
            obj.data.materials.append(surface)
    brass = material("Illustrated brass standoffs", (.44, .32, .16), .25, .52)
    nylon = material("Nylon Pi supports", (.36, .34, .29), 0, .62)
    for obj in controller:
        if obj.type == "MESH" and "polyamide" in obj.data.name.lower():
            obj.data.materials.clear()
            obj.data.materials.append(nylon)
    for x_mm, y_mm in ((70.242535, 62.783571), (143.257465, 62.783571),
                       (70.242535, 209.450933), (143.257465, 209.450933)):
        x, y, _ = to_chassis @ Vector((x_mm / 1000, -y_mm / 1000, 0))
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=.0028, depth=.010, location=(x, y, .086117693))
        bpy.context.object.data.materials.append(brass)
    light_pi_metal(finish_pi(controller))


def steering_pivots(chassis):
    # CAD meshes for each front stub axle, hub, tire, and retaining hardware.
    groups = [
        ((-.0528, -.08838, .0418), [0, 34, 96, 97, 98, 122, 128, 129, 130]),
        ((.0577, -.08838, .0418), [15, 33, 99, 100, 101, 121, 125, 126, 127]),
    ]
    pivots = []
    for location, meshes in groups:
        pivot = bpy.data.objects.new("Front steering pivot", None)
        bpy.context.collection.objects.link(pivot)
        pivot.location = location
        bpy.context.view_layer.update()
        for index in meshes:
            chassis[index].parent = pivot
            chassis[index].matrix_parent_inverse = pivot.matrix_world.inverted()
        pivots.append(pivot)
    return pivots


def setup_scene(samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.adaptive_threshold = .025
    try:
        preferences = bpy.context.preferences.addons["cycles"].preferences
        preferences.compute_device_type = "METAL"
        preferences.get_devices()
        devices = [device for device in preferences.devices if device.type == "METAL"]
        for device in preferences.devices:
            device.use = device in devices
        if devices:
            scene.cycles.device = "GPU"
    except (RuntimeError, TypeError):
        pass
    scene.cycles.max_bounces = 5
    scene.render.use_persistent_data = True
    scene.render.film_transparent = True
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.fps = FPS
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = -1.25
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (.83, .88, .94, 1)
    background.inputs["Strength"].default_value = .45
    floor = material("Bench surface", (.54, .58, .60), 0, .78)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, .003))
    ground = bpy.context.object
    ground.data.materials.append(floor)
    ground.is_shadow_catcher = True
    for name, loc, power, size in (
        ("Key", (.19, -.36, .58), 10, .42),
        ("Fill", (-.42, -.12, .32), 5, .42),
        ("Rim", (.09, .46, .43), 11, .32),
    ):
        lamp = bpy.data.lights.new(name, "AREA")
        lamp.energy = power
        lamp.shape = "DISK"
        lamp.size = size
        light = bpy.data.objects.new(name, lamp)
        bpy.context.collection.objects.link(light)
        light.location = loc
        aim(light, (0, 0, .05))
    camera_data = bpy.data.cameras.new("Controller reveal")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new("Controller reveal", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    return scene, camera


def pose(camera, pivots, progress):
    rise = ease((progress - .32) / .66)
    drift = ease(progress)
    camera.location = (.30 + .055 * drift, -.48 + .11 * drift, .23 + .30 * rise)
    aim(camera, (.002, -.015 - .010 * rise, .060 + .010 * rise))
    camera.data.ortho_scale = .384 + .014 * rise
    sweep = ease(progress / .32) * (1 - ease((progress - .40) / .34))
    for pivot, degrees in zip(pivots, (17, 21)):
        pivot.rotation_euler.z = math.radians(degrees * sweep)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("chassis_data", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--samples", type=int, default=32)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--sample", action="store_true", help="Render start, steering, and end frames only")
    mode.add_argument("--prepare-only", action="store_true",
                      help="Save a Blender scene at the final camera pose without rendering")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    chassis = load_chassis(args.chassis_data)
    load_controller(args.chassis_data)
    pivots = steering_pivots(chassis)
    scene, camera = setup_scene(args.samples)
    if args.prepare_only:
        pose(camera, pivots, 1)
        scene.render.filepath = str(args.output / "drive-by-wire-preview.png")
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output / "drive-by-wire.blend"))
        return
    frames = [1, 35, FRAME_COUNT] if args.sample else range(1, FRAME_COUNT + 1)
    for number in frames:
        pose(camera, pivots, (number - 1) / (FRAME_COUNT - 1))
        scene.render.filepath = str(args.output / f"frame-{number:04d}.png")
        bpy.ops.render.render(write_still=True)
    with (args.chassis_data / "controller.glb").open("rb") as mesh:
        print("Controller mesh SHA-256:", hashlib.file_digest(mesh, "sha256").hexdigest())


if __name__ == "__main__":
    main()
