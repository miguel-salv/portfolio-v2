#!/usr/bin/env python3
"""Build a reproducible grey-box lab, camera animation, renders and audit.

blender --background --python reel/world/build_animatic.py -- --stills
blender --background --python reel/world/build_animatic.py -- --render

All station positions and camera waypoints come from world.json. This is a
spatial study; the detailed devices, materials and final rig are later work.
"""

import argparse
from bisect import bisect_right
from datetime import datetime, timezone
import hashlib
import json
from math import acos, atan2, cos, pi, radians, sin, sqrt
from pathlib import Path
import shutil
import subprocess
import sys
import time

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / "animatic"
SPEC = json.loads((HERE / "world.json").read_text())
POSES = {p["id"]: p for p in SPEC["camera"]["poses"]}
SEGMENTS = SPEC["timeline"]["segments"]
FPS = SPEC["timeline"]["fps"]
START, END = SPEC["timeline"]["frame_range"]
STATIC_SOLIDS = []


def ease(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def phase(frame, segment_id):
    a, b = next(s["frame_range"] for s in SEGMENTS if s["id"] == segment_id)
    return min(1.0, max(0.0, (frame - a) / (b - a)))


def lerp(a, b, t):
    return Vector(a).lerp(Vector(b), t)


def spline(values, t):
    """Cardinal spline through all waypoints, eased to zero speed at ends."""
    if len(values) == 1:
        return Vector(values[0])
    scaled = ease(t) * (len(values) - 1)
    i = min(len(values) - 2, int(scaled))
    u = scaled - i
    p0, p1, p2, p3 = [Vector(values[max(0, min(len(values) - 1, j))]) for j in (i - 1, i, i + 1, i + 2)]
    return .5 * ((2 * p1) + (-p0 + p2) * u + (2*p0 - 5*p1 + 4*p2 - p3) * u*u + (-p0 + 3*p1 - 3*p2 + p3) * u*u*u)


def segment_at(frame):
    return SEGMENTS[min(len(SEGMENTS) - 1, bisect_right([s["frame_range"][0] for s in SEGMENTS], frame) - 1)]


def camera_sample(frame):
    segment = segment_at(frame)
    a, b = segment["frame_range"]
    path_ids = segment["camera_path"]
    if segment.get("continuous_move"):
        connected = [s for s in SEGMENTS if s.get("continuous_move") == segment["continuous_move"]]
        a, b = connected[0]["frame_range"][0], connected[-1]["frame_range"][1]
        path_ids = connected[0]["camera_path"] + [p for s in connected[1:] for p in s["camera_path"][1:]]
    t = (frame - a) / (b - a)
    path = [POSES[p] for p in path_ids]
    return {
        "position": spline([p["position_m"] for p in path], t),
        "target": spline([p["target_m"] for p in path], t),
        "lens": spline([(p["lens_mm"], 0, 0) for p in path], t).x,
        "shift": spline([(p.get("shift_x", 0), 0, 0) for p in path], t).x,
        "segment": segment,
    }


def inspect_sources():
    reports = []
    for ident in ("matcher-model", "vehicle-model", "robot-model"):
        source = next(s for s in SPEC["sources"] if s["id"] == ident)
        bpy.ops.wm.open_mainfile(filepath=str(ROOT / source["path"]))
        scene = bpy.context.scene
        scene.frame_set(1)
        bpy.context.view_layer.update()
        excluded = ("floor", "ground", "studio", "catcher", "reflection", "gobo", "backdrop", "bottle", "window")
        meshes = [o for o in scene.objects if o.type == "MESH" and not any(t in o.name.lower() for t in excluded)]
        points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
        low = [min(p[i] for p in points) for i in range(3)]
        high = [max(p[i] for p in points) for i in range(3)]
        reports.append({"id": ident, "path": source["path"], "unit_system": scene.unit_settings.system, "unit_scale": scene.unit_settings.scale_length, "bounds_min": low, "bounds_max": high, "extent": [b-a for a, b in zip(low, high)], "mesh_count": len(meshes)})
    # The reconstructed source models carry presentation units, despite METRIC.
    # Preserve their proportions, and never relabel that as a physical survey.
    proxy = SPEC["animatic"]["proxy_sizes"]
    for report in reports:
        size = report["extent"]
        entry = proxy[report["id"]]
        factor = entry["long_axis_m"] / max(size[:2])
        report.update({"proxy_scale": factor, "proxy_extent_m": [v * factor for v in size], "scale_basis": entry["basis"]})
    return reports


def material(name, rgb):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*rgb, 1)
    node.inputs["Roughness"].default_value = .78
    return mat


def box(name, position, size, mat, parent=None, solid=False, bevel=.005):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Blockout edge", "BEVEL")
        mod.width, mod.segments = bevel, 1
    if parent:
        obj.parent = parent
    if solid:
        STATIC_SOLIDS.append({"name": name, "low": [p-s/2 for p, s in zip(position, size)], "high": [p+s/2 for p, s in zip(position, size)]})
    return obj


def empty(name, position=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = position
    return obj


def cylinder(name, position, radius, depth, mat, parent=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=depth, location=position, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def label(name, text, position, size, mat, rotation=(pi/2, 0, 0), parent=None):
    data = bpy.data.curves.new(name, "FONT")
    data.body, data.size, data.align_x = text, size, "CENTER"
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location, obj.rotation_euler = position, rotation
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def beam(name, start, end, width, mat):
    obj = box(name, (0, 0, 0), (width, width, 1), mat, bevel=0)
    return pose_beam(obj, Vector(start), Vector(end))


def pose_beam(obj, start, end):
    obj.location = (start + end) / 2
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = (end - start).to_track_quat("Z", "Y")
    obj.scale.z = (end - start).length
    return obj


def neutral_lights(scene):
    world = bpy.data.worlds.new("Fixed neutral study lighting")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (.72, .76, .8, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = .35
    scene.world = world
    for name, location, target, energy, size in (
        ("West window key", (.2, 4.4, 2.45), (3.5, 3.4, .6), 500, 2.8),
        ("Ceiling soft fill", (4, 2.8, 3.45), (4, 3, 0), 750, 6),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.size = energy, size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def make_room(m):
    width, depth, height = SPEC["room"]["size_m"]
    box("Continuous lab floor", (width/2, depth/2, -.06), (width, depth, .12), m["floor"], bevel=0)
    box("North wall", (width/2, depth+.06, height/2), (width, .12, height), m["wall"], solid=True)
    box("East wall", (width+.06, depth/2, height/2), (.12, depth, height), m["wall"], solid=True)
    wy, wz = SPEC["room"]["window"]["center_m"][1:]
    ww, wh = SPEC["room"]["window"]["size_m"][1:]
    for name, y, sy, z, sz in (
        ("West lower wall", depth/2, depth, (wz-wh/2)/2, wz-wh/2),
        ("West upper wall", depth/2, depth, (height+wz+wh/2)/2, height-wz-wh/2),
        ("West front pier", (wy-ww/2)/2, wy-ww/2, wz, wh),
        ("West back pier", (depth+wy+ww/2)/2, depth-wy-ww/2, wz, wh),
    ):
        box(name, (-.06, y, z), (.12, sy, sz), m["wall"], solid=True)
    for y in (wy-ww/2, wy, wy+ww/2):
        box("Window mullion", (.01, y, wz), (.045, .045, wh), m["frame"])
    box("Window crossbar", (.01, wy, wz), (.045, ww, .045), m["frame"])

    for ident, leg_width in (("rf-bench", .055), ("personal-desk", .045)):
        spec = next(s for s in SPEC["room"]["sets"] if s["id"] == ident)
        x, y, _ = spec["center_m"]
        sx, sy, h = spec["size_m"]
        box(ident + " top", (x, y, h-.025), (sx, sy, .05), m["bench"], solid=True)
        for dx in (-sx/2+.12, sx/2-.12):
            for dy in (-sy/2+.09, sy/2-.09):
                box(ident + " leg", (x+dx, y+dy, (h-.05)/2), (leg_width, leg_width, h-.05), m["frame"], solid=True)
        if ident == "rf-bench":
            box("Bench front drawer", (x+.65, y, h-.16), (.64, sy-.1, .22), m["bench"], solid=True)
            box("ESD mat", (x+.1, y-.03, h+.003), (1.25, .72, .006), m["mat"])
            label("Bench station", "A / RF BENCH", (x-.45, y-.506, h-.08), .05, m["dark"])
        else:
            label("Desk station", "D / PERSONAL BUILDS", (x, y-.456, h-.08), .045, m["dark"])
    # Tape is geometry on a single shared floor, not a cut to another set.
    for y in (2.2, 3.10):
        box("Vehicle lane tape", (2.1, y, .003), (2.6, .027, .006), m["tape"], bevel=0)
    for x in (3.9, 4.6, 5.3, 6):
        box("Robot tile grid x", (x, 2.65, .003), (.022, 1.8, .006), m["tape"], bevel=0)
    for y in (1.75, 2.35, 2.95, 3.55):
        box("Robot tile grid y", (4.95, y, .003), (2.1, .022, .006), m["tape"], bevel=0)
    label("Vehicle floor station", "B / CONTROL", (1.25, 2.35, .011), .08, m["dark"], rotation=(0, 0, 0))
    label("Robot floor station", "C / ROBOTICS", (5.2, 1.95, .011), .08, m["dark"], rotation=(0, 0, 0))
    board = next(s for s in SPEC["room"]["sets"] if s["id"] == "pinboard")
    box("Pinboard", board["center_m"], board["size_m"], m["board"], solid=True)
    label("Wall station", "E / ABOUT & EXPERIENCE", (5.55, 6.375, 2.12), .085, m["dark"])
    for text, x, z, sx, sz in (("PORTRAIT", 5.05, 1.63, .65, .72), ("FORD", 5.9, 1.87, .65, .28), ("CMU", 5.9, 1.48, .65, .28), ("HACKER FAB", 5.9, 1.09, .65, .28)):
        box(text + " placement", (x, 6.375, z), (sx, .013, sz), m["paper"])
        label(text + " placeholder", text, (x, 6.363, z-.02), .065, m["dark"])


def make_matcher(m, dimensions):
    root = empty("Matcher source-proportioned proxy", (1.95, 4.45, .906))
    root.rotation_euler.z = radians(SPEC["animatic"].get("matcher_yaw_degrees", 0))
    x, y, z = dimensions
    box("Matcher chassis", (0, .025, .009), (x, .12, .018), m["metal"], root, bevel=.001)
    for dx in (-x/2+.005, x/2-.005):
        box("Open enclosure side", (dx, .025, .039), (.008, .12, .06), m["metal"], root, bevel=.001)
    box("Controller proxy", (0, -.067, .04), (.082, .075, .08), m["device"], root, bevel=.002)
    box("Controller display", (0, -.105, .053), (.047, .002, .025), m["dark"], root, bevel=0)
    for x0 in (-.055, .005, .055):
        for y0 in (.002, .012, .022, .032, .042, .052, .062, .072):
            box("Capacitor plate proxy", (x0, y0, .048), (.031, .002, .042), m["paper"], root, bevel=0)
    label("Matcher controller mark", "RF", (0, -.107, .027), .014, m["paper"], parent=root)
    # Notebook and chart ring stand in for the authored motif, not lab evidence.
    box("Notebook", (1.64, 4.27, .91), (.18, .24, .015), m["paper"])
    bpy.ops.mesh.primitive_torus_add(major_radius=.057, minor_radius=.0012, major_segments=40, minor_segments=6, location=(1.64, 4.27, .919))
    bpy.context.object.name = "Smith chart placement ring"
    bpy.context.object.data.materials.append(m["dark"])
    cylinder("Mug proxy", (1.47, 4.5, .96), .035, .12, m["frame"])
    return root


def make_vehicle(m, dimensions):
    root = empty("Vehicle source-proportioned proxy")
    length, width, height = dimensions
    # Keep all dimensions subordinate to the inspected source envelope.
    radius = height * .275
    body_z = radius + .01
    box("Vehicle lower PCB proxy", (0, 0, body_z), (length*.86, width*.72, .012), m["device"], root, bevel=.002)
    box("Vehicle upper PCB proxy", (0, 0, height-.018), (length*.48, width*.63, .008), m["paper"], root, bevel=.002)
    for x in (-length*.19, length*.19):
        for y in (-width*.23, width*.23):
            cylinder("Vehicle PCB post", (x, y, height*.64), .004, height*.58, m["metal"], root)
    wheels = []
    for x in (-length*.32, length*.32):
        for y in (-width*.43, width*.43):
            wheels.append(cylinder("Vehicle wheel proxy", (x, y, radius), radius, width*.15, m["dark"], root, (pi/2, 0, 0)))
    return root, wheels, radius


def make_robot(m, dimensions):
    root = empty("Robot source-proportioned proxy")
    width, length, height = dimensions
    radius = .061
    box("Robot chassis proxy", (0, 0, .09), (width*.78, length*.65, .05), m["metal"], root)
    box("Robot control board proxy", (0, -.025, .13), (.24, .19, .015), m["device"], root)
    for x in (-width*.43, width*.43):
        for y in (-length*.19, length*.19):
            cylinder("Robot wheel proxy", (x, y, radius), radius, .038, m["dark"], root, (0, pi/2, 0))
    # A two-link proxy rig makes reach a checked distance instead of a drawn pose.
    arm1 = beam("Robot upper arm", (0, 0, 0), (0, .18, 0), .018, m["frame"])
    arm2 = beam("Robot forearm", (0, 0, 0), (0, .18, 0), .018, m["frame"])
    bottle = empty("Carried bottle proxy")
    cylinder("Bottle body proxy", (0, 0, 0), .027, .16, m["paper"], bottle)
    cylinder("Bottle neck proxy", (0, 0, .095), .012, .03, m["frame"], bottle)
    return root, (arm1, arm2), bottle


def make_desk_devices(m):
    root = empty("Companion photo-proportioned stand-in", (5.22, 4.49, .76))
    box("Companion body proxy", (0, 0, .085), (.14, .11, .17), m["device"], root, bevel=.02)
    box("Companion screen proxy", (0, -.057, .072), (.068, .003, .05), m["dark"], root, bevel=.003)
    for dx in (-.029, .029):
        box("Companion eye proxy", (dx, -.057, .13), (.011, .003, .023), m["dark"], root, bevel=.003)
    keychain = empty("Keychain source-sized PCB stand-in", (5.43, 4.41, .80))
    keychain.rotation_euler.x = radians(50)
    box("Keychain board envelope", (0, 0, 0), (.07, .065, .003), m["paper"], keychain, bevel=.008)
    box("Keychain PCB holder", (5.43, 4.41, .773), (.045, .04, .02), m["frame"], bevel=.003)
    for i in range(5):
        cylinder("Keychain LED proxy", (-.024+i*.012, 0, .003), .002, .003, m["dark"], keychain)
    cylinder("Desk lamp foot", (5.07, 4.83, .775), .065, .025, m["frame"])
    cylinder("Desk lamp stem", (5.07, 4.83, .96), .009, .35, m["frame"])
    box("Desk lamp shade", (5.12, 4.76, 1.14), (.17, .14, .045), m["frame"])
    return root, keychain


def make_cable(m):
    data = bpy.data.curves.new("Coax slack kinematic study", "CURVE")
    data.dimensions, data.bevel_depth, data.bevel_resolution = "3D", .004, 1
    points = data.splines.new("POLY")
    points.points.add(39)
    obj = bpy.data.objects.new("Attached coax loop", data)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(m["dark"])
    return obj


def cable_points(t):
    attached = SPEC["animatic"]["coax_attachment_m"]
    initial = [attached, [2.12, 4.27, .92], [2.26, 4.08, .92], [2.45, 4.03, .92], [2.57, 4.18, .92], [2.42, 4.28, .92]]
    landed = [attached, [2.12, 4.27, .92], [2.26, 3.96, .92], [2.44, 3.86, .48], [2.46, 3.62, .03], [2.24, 3.45, .03]]
    controls = [lerp(a, b, t) for a, b in zip(initial, landed)]
    points = [spline(controls, i/39) for i in range(40)]
    for point in points:
        point.z = max(.009, point.z)
    return points


def update_actors(frame, actors, keyed=False):
    vehicle, wheels, radius, robot, arms, bottle, cable = actors
    vtrack = SPEC["animatic"]["vehicle_path_m"]
    v = ease(phase(frame, "vehicle-depart"))
    vehicle.location = lerp(*vtrack, v)
    heading = atan2(vtrack[1][1]-vtrack[0][1], vtrack[1][0]-vtrack[0][0])
    vehicle.rotation_euler.z = heading * ease(min(1, v*4))
    distance = (Vector(vtrack[1])-Vector(vtrack[0])).length * v
    for wheel in wheels:
        wheel.rotation_euler.y = distance / radius
    rtrack = SPEC["animatic"]["robot_path_m"]
    u = phase(frame, "robot-lift")
    lift = ease(min(1, u/.45))
    drive = ease(max(0, (u-.45)/.55))
    robot.location = lerp(*rtrack, drive)
    center = robot.location + Vector((0, .45, .085 + .12*lift))
    bottle.location = center
    shoulder = robot.location + Vector((0, .18, .16))
    grip = robot.location + Vector((0, .45, .17+.12*lift))
    direction = grip-shoulder
    reach = direction.length
    link = .18
    assert reach <= 2*link + 1e-6, f"Proxy arm unreachable at frame {frame}: {reach}"
    midpoint = (shoulder+grip)/2
    # An elbow-up bend in the shoulder/grip YZ plane, with fixed link lengths.
    perpendicular = Vector((0, -direction.z, direction.y)).normalized()
    elbow = midpoint + perpendicular * sqrt(max(0, link*link - reach*reach/4))
    pose_beam(arms[0], shoulder, elbow)
    pose_beam(arms[1], elbow, grip)
    for point, location in zip(cable.data.splines[0].points, cable_points(ease(phase(frame, "bench-drop")))):
        point.co = (*location, 1)
        if keyed:
            point.keyframe_insert("co", frame=frame)
    if keyed:
        for obj in (vehicle, robot, bottle, *arms):
            for prop in ("location", "rotation_quaternion" if obj.rotation_mode == "QUATERNION" else "rotation_euler", "scale"):
                obj.keyframe_insert(prop, frame=frame)
        for wheel in wheels:
            wheel.keyframe_insert("rotation_euler", frame=frame)
    return {"vehicle": list(vehicle.location), "robot": list(robot.location), "bottle": list(bottle.location), "bottle_held": lift >= .999, "bottle_offset_m": list(bottle.location-robot.location), "arm_reach_m": reach, "arm_max_m": 2*link, "coax_attached": list(cable.data.splines[0].points[0].co)[:3]}


def build_scene(reports, engine):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    palette = {"floor": (.43,.46,.45), "wall": (.68,.7,.68), "bench": (.54,.56,.54), "frame": (.22,.25,.25), "mat": (.32,.39,.34), "tape": (.7,.71,.61), "board": (.48,.5,.46), "paper": (.83,.84,.8), "dark": (.075,.095,.09), "metal": (.57,.59,.58), "device": (.35,.43,.43)}
    m = {name: material(name, rgb) for name, rgb in palette.items()}
    make_room(m)
    bounds = {r["id"]: r["proxy_extent_m"] for r in reports}
    matcher = make_matcher(m, bounds["matcher-model"])
    vehicle, wheels, radius = make_vehicle(m, bounds["vehicle-model"])
    robot, arms, bottle = make_robot(m, bounds["robot-model"])
    companion, keychain = make_desk_devices(m)
    cable = make_cable(m)
    camera = bpy.data.objects.new("One continuous lab camera", bpy.data.cameras.new("Lab camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.rotation_mode = "QUATERNION"
    camera.data.sensor_width = SPEC["camera"]["sensor_width_mm"]
    camera.data.clip_start, camera.data.clip_end = .012, 100
    scene.render.engine = engine
    neutral_lights(scene)
    if engine == "BLENDER_WORKBENCH":
        shading = scene.display.shading
        shading.light, shading.color_type = "STUDIO", "MATERIAL"
        shading.show_shadows, shading.show_cavity = True, True
        shading.cavity_type = "BOTH"
        shading.background_type, shading.background_color = "WORLD", (.5,.5,.5)
        if hasattr(shading, "use_world_space_lighting"):
            shading.use_world_space_lighting = True
        scene.display.render_aa = '8'
    else:
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = 8
    scene.view_settings.view_transform = "AgX"
    scene.render.resolution_x, scene.render.resolution_y = 960, 540
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 90
    scene.frame_start, scene.frame_end = START, END-1
    scene.render.use_file_extension = True
    actors = vehicle, wheels, radius, robot, arms, bottle, cable
    return scene, camera, actors, {"matcher": matcher, "vehicle": vehicle, "robot": robot, "companion": companion, "keychain": keychain}


def distance_to_box(position, box):
    return sqrt(sum(max(lo-v, 0, v-hi)**2 for v, lo, hi in zip(position, box["low"], box["high"])))


def bake(scene, camera, actors, devices):
    samples, clearance_issues = [], []
    minimum_clearance = 1e9
    previous_quaternion = None
    for frame in range(START, END):
        sample = camera_sample(frame)
        camera.location = sample["position"]
        rotation = (sample["target"]-camera.location).to_track_quat("-Z", "Y")
        if previous_quaternion is not None and rotation.dot(previous_quaternion) < 0:
            rotation.negate()
        camera.rotation_quaternion = rotation
        previous_quaternion = rotation.copy()
        camera.data.lens, camera.data.shift_x = sample["lens"], sample["shift"]
        camera.keyframe_insert("location", frame=frame)
        camera.keyframe_insert("rotation_quaternion", frame=frame)
        camera.data.keyframe_insert("lens", frame=frame)
        camera.data.keyframe_insert("shift_x", frame=frame)
        actor_sample = update_actors(frame, actors, keyed=True)
        clearance = min(distance_to_box(camera.location, solid) for solid in STATIC_SOLIDS)
        minimum_clearance = min(minimum_clearance, clearance)
        if clearance < .04:
            clearance_issues.append({"frame": frame, "clearance_m": round(clearance, 4)})
        inside = all(.025 <= v <= size-.025 for v, size in zip(camera.location, SPEC["room"]["size_m"]))
        if not inside:
            clearance_issues.append({"frame": frame, "issue": "camera outside room"})
        samples.append({"frame": frame, "position_m": list(camera.location), "target_m": list(sample["target"]), "quaternion_wxyz": list(rotation), "lens_mm": camera.data.lens, "shift_x": camera.data.shift_x, "segment": sample["segment"]["id"], "actors": actor_sample})
    # Blender 5 uses layered actions. Sampled LINEAR keys preserve the baked path.
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag = strip.channelbag(slot)
                    if bag:
                        for curve in bag.fcurves:
                            for point in curve.keyframe_points:
                                point.interpolation = "LINEAR"
    for segment in SEGMENTS:
        marker = scene.timeline_markers.new(segment["id"], frame=segment["frame_range"][0])
        marker.camera = camera
    rest_results = []
    required_devices = {"hero": ["matcher"], "matcher": ["matcher"], "vehicle": ["vehicle"], "robot": ["robot"], "desk": ["companion", "keychain"], "wall": [], "close": ["matcher", "vehicle", "robot", "companion", "keychain"]}
    for rest in SPEC["timeline"]["rests"]:
        segment = next(s for s in SEGMENTS if s.get("rest_id") == rest["id"])
        rows = samples[slice(*segment["frame_range"])]
        fields = ("position_m", "target_m", "quaternion_wxyz", "lens_mm", "shift_x", "actors")
        frozen = all(all(row[field] == rows[0][field] for field in fields) for row in rows)
        scene.frame_set(rest["sample_frame"])
        bpy.context.view_layer.update()
        projected = {}
        aperture = {}
        for ident, obj in devices.items():
            p = world_to_camera_view(scene, camera, obj.matrix_world.translation)
            projected[ident] = [round(p.x, 4), round(1-p.y, 4), round(p.z, 4)]
            if ident in required_devices[rest["id"]]:
                objects = [o for o in [obj, *obj.children_recursive] if o.type == "MESH"]
                points = [world_to_camera_view(scene, camera, o.matrix_world @ Vector(c)) for o in objects for c in o.bound_box]
                envelope = [min(p.x for p in points), min(p.y for p in points), max(p.x for p in points), max(p.y for p in points)]
                aperture[ident] = {"bounds_xy_minmax": [round(v, 4) for v in envelope], "fully_visible": all(p.z > 0 and -.005 <= p.x <= 1.005 and -.005 <= p.y <= 1.005 for p in points)}
        rest_results.append({"id": rest["id"], "frame": rest["sample_frame"], "frozen": frozen, "projected_origins_xy_depth": projected, "device_aperture": aperture})
    pickup_start, pickup_end = next(s["frame_range"] for s in SEGMENTS if s["id"] == "robot-lift")
    pickup = samples[pickup_start:pickup_end+1]
    start_position = Vector(pickup[0]["actors"]["robot"])
    lifted = [r for r in samples[pickup_start:] if r["actors"]["bottle_held"]]
    held_offset = Vector(lifted[0]["actors"]["bottle_offset_m"])
    pickup_checks = {
        "lift_before_drive": all(r["actors"]["bottle_held"] or (Vector(r["actors"]["robot"])-start_position).length < 1e-5 for r in pickup),
        "held_until_end": all(r["actors"]["bottle_held"] and (Vector(r["actors"]["bottle_offset_m"])-held_offset).length < 1e-5 for r in samples[lifted[0]["frame"]:]),
        "drive_distance_m": round((Vector(pickup[-1]["actors"]["robot"])-start_position).length, 4),
        "lift_distance_m": round(held_offset.z-pickup[0]["actors"]["bottle_offset_m"][2], 4),
        "collection_box_absent": not any(o.name.startswith("Bin ") for o in scene.objects),
    }
    return samples, {"camera_minimum_static_clearance_m": round(minimum_clearance, 4), "camera_clearance_issues": clearance_issues, "locked_rests": rest_results, "robot_pickup": pickup_checks, "one_place_review": "rendered-for-review-not-user-approved", "scope": "Static furniture camera clearance, frozen camera/actor rests, pickup-and-carry staging and proxy arm reach checked. Detailed device collision, real-world reconstructed device sizes, actual robot rig and final copy framing remain production gates."}


def render_still(scene, frame, target):
    scene.frame_set(frame)
    scene.render.filepath = str(target)
    bpy.ops.render.render(write_still=True)


def encode_frames(paths, target):
    ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    args = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-vcodec", "mjpeg", "-i", "-", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-g", "15", "-movflags", "+faststart", "-metadata", "comment=Authored Blender grey-box study from reel/world/build_animatic.py and world.json; spatial review only.", str(target)]
    with subprocess.Popen(args, stdin=subprocess.PIPE) as proc:
        try:
            for path in paths:
                proc.stdin.write(path.read_bytes())
            proc.stdin.close()
            code = proc.wait()
        except BaseException:
            proc.kill()
            raise
    if code:
        raise RuntimeError(f"ffmpeg failed with exit {code}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stills", action="store_true")
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--engine", default="BLENDER_WORKBENCH", choices=["BLENDER_WORKBENCH", "BLENDER_EEVEE"])
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "posters").mkdir(exist_ok=True)
    (OUT / "frames").mkdir(exist_ok=True)
    reports = inspect_sources()
    (OUT / "source-bounds.json").write_text(json.dumps(reports, indent=2)+"\n")
    scene, camera, actors, devices = build_scene(reports, args.engine)
    samples, audit = bake(scene, camera, actors, devices)
    fingerprint = hashlib.sha256((HERE / "world.json").read_bytes() + Path(__file__).read_bytes()).hexdigest()
    metadata = {"created_at": datetime.now(timezone.utc).isoformat(), "source_fingerprint": fingerprint, "fps": FPS, "frame_range": [START, END], "duration_seconds": (END-START)/FPS, "resolution": [960, 540], "engine": args.engine, "lighting": "fixed-neutral", "units": "meters", "camera_samples": samples}
    (OUT / "camera.json").write_text(json.dumps(metadata, separators=(",", ":"))+"\n")
    (OUT / "audit.json").write_text(json.dumps(audit, indent=2)+"\n")
    if audit["camera_clearance_issues"]:
        raise RuntimeError(f"Camera clearance failed in {len(audit['camera_clearance_issues'])} samples; inspect animatic/audit.json before rendering")
    if not all(rest["frozen"] for rest in audit["locked_rests"]):
        raise RuntimeError("A reading rest is not completely frozen")
    pickup = audit["robot_pickup"]
    if not all(pickup[k] for k in ("lift_before_drive", "held_until_end", "collection_box_absent")) or abs(pickup["drive_distance_m"]-.3) > .001:
        raise RuntimeError("Robot pickup-and-carry staging failed; inspect animatic/audit.json")
    clipped = [(r["id"], key) for r in audit["locked_rests"] for key, aperture in r["device_aperture"].items() if not aperture["fully_visible"]]
    if clipped:
        raise RuntimeError(f"A reading view crops a required device: {clipped}")
    scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "lab-greybox.blend"))
    if args.stills or args.render:
        for rest in SPEC["timeline"]["rests"]:
            render_still(scene, rest["sample_frame"], OUT / "posters" / f"{rest['id']}.jpg")
        mids = [(s["id"], sum(s["frame_range"])//2) for s in SEGMENTS if s["kind"] == "move"]
        for name, frame in mids:
            render_still(scene, frame, OUT / "posters" / f"move-{name}.jpg")
    if args.render:
        began = time.monotonic()
        paths = []
        for frame in range(START, END):
            target = OUT / "frames" / f"frame-{frame:04d}.jpg"
            render_still(scene, frame, target)
            paths.append(target)
            if frame % 60 == 0:
                print(f"LAB_RENDER frame={frame}/{END} elapsed={time.monotonic()-began:.1f}s", flush=True)
        encode_frames(paths, OUT / "lab-greybox.mp4")
        encode_frames(reversed(paths), OUT / "lab-greybox-reverse.mp4")
        audit["rendered_frame_count"] = len(paths)
        audit["render_seconds"] = round(time.monotonic()-began, 2)
        audit["forward_video"] = "lab-greybox.mp4"
        audit["reverse_video"] = "lab-greybox-reverse.mp4"
        (OUT / "audit.json").write_text(json.dumps(audit, indent=2)+"\n")
    print("LAB_ANIMATIC_COMPLETE", json.dumps({"frames": END-START, "duration": (END-START)/FPS, "rests": len(audit['locked_rests']), "clearance_m": audit['camera_minimum_static_clearance_m']}), flush=True)


if __name__ == "__main__":
    main()
