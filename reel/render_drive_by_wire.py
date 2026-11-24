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
        material("Chassis powder coat", (.085, .105, .125), .65),
        material("Black fasteners", (.07, .08, .09), .6),
        material("Motor and hub housings", (.11, .13, .15), .5),
        material("Silver linkages", (.44, .49, .52), .8, .32),
        material("Brass hardware", (.45, .30, .12), .25, .52),
        material("Rubber tires", (.035, .041, .048), 0, .8),
        material("Steel screws", (.35, .39, .42), .75),
        material("Dark hardware", (.07, .08, .09), .65),
        material("Black screws", (.06, .07, .08), .65),
        material("Servo body", (.12, .14, .16), .15),
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
    parser.add_argument("--sample", action="store_true", help="Render start, steering, and end frames only")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    chassis = load_chassis(args.chassis_data)
    load_controller(args.chassis_data)
    pivots = steering_pivots(chassis)
    scene, camera = setup_scene(args.samples)
    frames = [1, 35, FRAME_COUNT] if args.sample else range(1, FRAME_COUNT + 1)
    for number in frames:
        pose(camera, pivots, (number - 1) / (FRAME_COUNT - 1))
        scene.render.filepath = str(args.output / f"frame-{number:04d}.png")
        bpy.ops.render.render(write_still=True)
    with (args.chassis_data / "controller.glb").open("rb") as mesh:
        print("Controller mesh SHA-256:", hashlib.file_digest(mesh, "sha256").hexdigest())


if __name__ == "__main__":
    main()
