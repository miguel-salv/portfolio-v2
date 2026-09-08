#!/usr/bin/env python3
"""Procedurally build and render the trash-collection robot story.

Usage:
  /opt/homebrew/bin/blender --background --python reel/render_robot.py -- --preview
  /opt/homebrew/bin/blender --background --python reel/render_robot.py

The Blender scene, transparent frames, and representative previews stay in
reel/robot/. Final light/dark composites are written to
public/assets/stories/robot/.
"""

from math import atan2, cos, pi, radians, sin
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
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 16
    data.bevel_depth = radius
    data.bevel_resolution = 6
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    spline.use_cyclic_u = cyclic
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    parent_local(obj, parent)
    obj.data.materials.append(mat)
    return obj


def label_wrap(name, z, radius, height, mat, parent):
    """Ribbon that follows the bottle wall instead of a flat card."""
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 8
    data.bevel_depth = 0.004
    data.extrude = height * 0.5
    spline = data.splines.new("POLY")
    spline.use_cyclic_u = True
    steps = 36
    spline.points.add(steps - 1)
    for index, point in enumerate(spline.points):
        angle = 2 * pi * index / steps
        point.co = (cos(angle) * radius, sin(angle) * radius, 0.0, 1.0)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    parent_local(obj, parent, (0.0, 0.0, z))
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
    for spoke_angle in (0, pi / 3, 2 * pi / 3):
        cube(
            f"HubSpoke_{index}_{spoke_angle}",
            (side * 0.225, 0, 0),
            (0.022, 0.48, 0.06),
            mats["yellow_dark"],
            pivot,
            bevel=0.008,
            rotation=(spoke_angle, 0, 0),
        )
    for i in range(8):
        angle = i * 2*pi/8
        cylinder(f"Hub_recess_{index}_{i}",(side*.259,cos(angle)*.235,sin(angle)*.235),.052,.008,mats["yellow_dark"],pivot,rotation=(0,radians(90),0),vertices=12,bevel=0)
    cylinder(f"Axle_screw_{index}",(side*.27,0,0),.065,.04,mats["steel"],pivot,rotation=(0,radians(90),0),vertices=12,bevel=.005)
    for i in range(32):
        angle=i*2*pi/32
        for sign in (-1,1):
            cube(f"Tread_{index}_{i}_{sign}",(sign*.11,cos(angle)*.546,sin(angle)*.546),(.18,.06,.016),mats["tread"],pivot,bevel=.009,rotation=(angle,0,sign*.22))
    motor_x = side * (abs(x) - 0.36)
    cube(
        f"YellowMotorMount_{index}",
        (motor_x, y, 0.98),
        (0.34, 0.42, 0.70),
        mats["yellow"],
        root,
        bevel=0.05,
    )
    cylinder(
        f"MotorCap_{index}",
        (motor_x, y, 1.38),
        0.12,
        0.08,
        mats["steel"],
        root,
        vertices=24,
        bevel=0.015,
    )
    deck_x = abs(x) - 0.53
    cube(
        f"ServoBracketDeck_{index}",
        (side * (deck_x - 0.23), y, 0.722),
        (0.40, 0.38, 0.05),
        mats["print"],
        root,
        bevel=0.012,
    )
    cube(
        f"ServoBracketFace_{index}",
        (side * (deck_x - 0.035), y, 0.98),
        (0.04, 0.38, 0.50),
        mats["print"],
        root,
        bevel=0.012,
    )
    cylinder(
        f"ServoBracketBolt_{index}",
        (side * (deck_x - 0.35), y, 0.754),
        0.03,
        0.02,
        mats["steel"],
        root,
        vertices=12,
        bevel=0,
    )
    return pivot


def add_raspberry_pi(root, mats, cx, cy, deck_top):
    """Pi 4 sitting on the power bank. USB / Ethernet face +Y, away from the arms."""
    stand = 0.014
    pcb_h = 0.05
    pcb_z = deck_top + stand + pcb_h * 0.5
    top = pcb_z + pcb_h * 0.5
    sx, sy = 1.16, 1.76
    hx, hy = sx * 0.5, sy * 0.5

    cube("PiBoard", (cx, cy, pcb_z), (sx, sy, pcb_h), mats["pcb"], root, 0.012)
    for ox, oy in ((-hx + 0.10, -hy + 0.10), (hx - 0.10, -hy + 0.10), (-hx + 0.10, hy - 0.10), (hx - 0.10, hy - 0.10)):
        cylinder(f"PiStandoff_{ox}_{oy}", (cx + ox, cy + oy, deck_top + stand * 0.5), 0.035, stand, mats["steel"], root, vertices=12, bevel=0)
        cylinder(f"PiHole_{ox}_{oy}", (cx + ox, cy + oy, top + 0.006), 0.018, 0.01, mats["steel_dark"], root, vertices=10, bevel=0)

    cube("PiSoC", (cx + 0.02, cy - 0.08, top + 0.045), (0.34, 0.34, 0.09), mats["charcoal"], root, 0.008)
    cube("PiSoCCan", (cx + 0.02, cy - 0.08, top + 0.098), (0.28, 0.28, 0.016), mats["steel"], root, 0.004)
    cube("PiRAM", (cx + 0.02, cy + 0.28, top + 0.028), (0.22, 0.16, 0.055), mats["charcoal"], root, 0.006)

    # Dual stacked USB-A plus Ethernet on the +Y short edge.
    for i, ux in enumerate((-0.38, -0.06)):
        cube(f"PiUSB_{i}", (cx + ux, cy + hy + 0.02, top + 0.12), (0.28, 0.22, 0.24), mats["steel"], root, 0.012)
        cube(f"PiUSB_slot_{i}a", (cx + ux, cy + hy + 0.13, top + 0.18), (0.20, 0.02, 0.08), mats["black"], root, 0.002)
        cube(f"PiUSB_slot_{i}b", (cx + ux, cy + hy + 0.13, top + 0.07), (0.20, 0.02, 0.08), mats["black"], root, 0.002)
    cube("PiEthernet", (cx + 0.34, cy + hy + 0.03, top + 0.10), (0.32, 0.24, 0.20), mats["steel"], root, 0.012)
    cube("PiEthernet_slot", (cx + 0.34, cy + hy + 0.15, top + 0.10), (0.20, 0.02, 0.12), mats["black"], root, 0.002)

    # GPIO along -X; USB-C and micro-HDMI along +X.
    for i in range(20):
        yy = cy - 0.72 + i * 0.076
        for row, ox in enumerate((-0.04, 0.04)):
            cube(f"PiGPIO_{i}_{row}", (cx - hx + 0.07 + ox, yy, top + 0.04), (0.045, 0.038, 0.08), mats["black"], root, 0.002)
    cube("PiUSBC", (cx + hx + 0.02, cy + 0.58, top + 0.03), (0.06, 0.16, 0.06), mats["steel"], root, 0.006)
    for i, hy_off in enumerate((0.22, -0.02)):
        cube(f"PiHDMI_{i}", (cx + hx + 0.02, cy + hy_off, top + 0.028), (0.05, 0.12, 0.055), mats["steel"], root, 0.005)
    cube("PiAudio", (cx + hx - 0.02, cy - 0.42, top + 0.03), (0.08, 0.08, 0.06), mats["black"], root, 0.008)
    cube("PiCSI", (cx + 0.28, cy - hy + 0.06, top + 0.012), (0.22, 0.06, 0.024), mats["charcoal"], root, 0.004)
    return {
        "usb_left": (cx - 0.38, cy + hy + 0.14, top + 0.12),
        "usb_right": (cx - 0.06, cy + hy + 0.14, top + 0.12),
        "gpio": (cx - hx + 0.07, cy + 0.20, top + 0.08),
        "usbc": (cx + hx + 0.04, cy + 0.58, top + 0.03),
        "cy": cy,
    }


def add_webcam(scan, mats):
    """USB webcam seated on the tower. Lens faces -Y; the body stays on the box."""
    cube("WebcamBody", (0, 0.0, 0.10), (0.72, 0.50, 0.40), mats["charcoal"], scan, 0.07)
    cube("WebcamFoot", (0, 0.04, -0.16), (0.46, 0.36, 0.10), mats["black"], scan, 0.025)
    cylinder("WebcamRing", (0, -0.26, 0.10), 0.155, 0.06, mats["steel"], scan, rotation=(radians(90), 0, 0), vertices=28, bevel=0.012)
    cylinder("WebcamLens", (0, -0.29, 0.10), 0.105, 0.04, mats["lens"], scan, rotation=(radians(90), 0, 0), vertices=28, bevel=0.01)
    cube("WebcamLED", (0.20, -0.24, 0.16), (0.045, 0.018, 0.045), mats["red_emit"], scan, 0.004)
    cube("WebcamUSB", (0, 0.26, 0.0), (0.16, 0.10, 0.08), mats["steel"], scan, 0.01)
    cube("WebcamUSB_slot", (0, 0.32, 0.0), (0.10, 0.018, 0.05), mats["black"], scan, 0.002)


def add_power_bank(root, mats, cx, cy, deck_top):
    """USB power bank under the Pi, with a narrower tongue between the rear
    motor brackets so the Uno can sit past the Pi USB stacks."""
    sx, sy, sz = 2.08, 2.22, 0.42
    z = deck_top + sz * 0.5
    top = deck_top + sz
    hx, hy = sx * 0.5, sy * 0.5

    cube("PowerBank", (cx, cy, z), (sx, sy, sz), mats["powerbank"], root, 0.09)
    cube("PowerBankLid", (cx, cy, top - 0.012), (sx - 0.08, sy - 0.08, 0.02), mats["powerbank_lid"], root, 0.04)
    cube("PowerBankFace", (cx + hx - 0.02, cy + 0.28, z), (0.06, sy - 0.40, sz - 0.14), mats["charcoal"], root, 0.02)

    # Narrow enough to pass between the rear L-brackets (inner x ~0.73).
    tongue_sx, tongue_sy = 1.36, 0.88
    tongue_cy = cy + hy + tongue_sy * 0.5 - 0.10
    cube("PowerBankTongue", (cx, tongue_cy, z), (tongue_sx, tongue_sy, sz), mats["powerbank"], root, 0.08)
    cube("PowerBankTongueLid", (cx, tongue_cy, top - 0.012), (tongue_sx - 0.08, tongue_sy - 0.08, 0.02), mats["powerbank_lid"], root, 0.04)

    usb_x = cx + hx + 0.02
    for i, uy in enumerate((0.18, 0.46)):
        cube(f"PowerBankUSB_{i}", (usb_x, cy + uy, z + 0.02), (0.08, 0.22, 0.12), mats["steel"], root, 0.008)
        cube(f"PowerBankUSB_slot_{i}", (usb_x + 0.05, cy + uy, z + 0.02), (0.02, 0.14, 0.07), mats["black"], root, 0.002)
    cube("PowerBankUSBC", (usb_x, cy + 0.72, z - 0.04), (0.07, 0.14, 0.06), mats["steel"], root, 0.006)
    cube("PowerBankUSBC_slot", (usb_x + 0.04, cy + 0.72, z - 0.04), (0.02, 0.08, 0.035), mats["black"], root, 0.002)
    cube("PowerBankButton", (usb_x, cy - 0.15, z + 0.06), (0.04, 0.10, 0.08), mats["black"], root, 0.008)
    for i in range(4):
        cube(f"PowerBankLED_{i}", (usb_x + 0.01, cy - 0.15, z - 0.08 + i * 0.045), (0.02, 0.04, 0.03), mats["red_emit"], root, 0.002)

    return {
        "top": top,
        "usb_a0": (usb_x + 0.05, cy + 0.18, z + 0.02),
        "usb_a1": (usb_x + 0.05, cy + 0.46, z + 0.02),
        "usbc": (usb_x + 0.04, cy + 0.72, z - 0.04),
    }


def add_arduino_uno(root, mats, cx, cy, deck_top):
    """Arduino Uno R3 sitting with the Pi. USB-B faces +Y."""
    stand = 0.014
    pcb_h = 0.045
    pcb_z = deck_top + stand + pcb_h * 0.5
    top = pcb_z + pcb_h * 0.5
    sx, sy = 1.08, 0.72
    hx, hy = sx * 0.5, sy * 0.5

    cube("UnoBoard", (cx, cy, pcb_z), (sx, sy, pcb_h), mats["pcb_blue"], root, 0.012)
    for ox, oy in ((-hx + 0.08, -hy + 0.08), (hx - 0.08, -hy + 0.08), (-hx + 0.08, hy - 0.08), (hx - 0.08, hy - 0.08)):
        cylinder(f"UnoStandoff_{ox}_{oy}", (cx + ox, cy + oy, deck_top + stand * 0.5), 0.03, stand, mats["steel"], root, vertices=10, bevel=0)

    cube("UnoUSB", (cx + 0.16, cy + hy + 0.05, top + 0.055), (0.24, 0.22, 0.11), mats["steel"], root, 0.01)
    cube("UnoUSB_slot", (cx + 0.16, cy + hy + 0.16, top + 0.055), (0.14, 0.02, 0.06), mats["black"], root, 0.002)
    cylinder("UnoBarrel", (cx - 0.22, cy + hy + 0.04, top + 0.055), 0.065, 0.16, mats["black"], root, rotation=(radians(90), 0, 0), vertices=16, bevel=0.008)
    cube("UnoBarrelTip", (cx - 0.22, cy + hy + 0.13, top + 0.055), (0.05, 0.04, 0.05), mats["steel"], root, 0.004)

    cube("UnoMCU", (cx - 0.02, cy - 0.04, top + 0.045), (0.30, 0.52, 0.09), mats["charcoal"], root, 0.008)
    cube("Uno16U2", (cx + 0.18, cy + 0.18, top + 0.03), (0.16, 0.20, 0.055), mats["charcoal"], root, 0.006)
    cube("UnoReset", (cx - 0.32, cy + 0.16, top + 0.035), (0.10, 0.10, 0.07), mats["black"], root, 0.01)
    cube("UnoCrystal", (cx + 0.32, cy - 0.08, top + 0.03), (0.12, 0.06, 0.055), mats["steel"], root, 0.006)
    for i, (lx, ly) in enumerate(((-0.38, 0.28), (-0.28, 0.28), (0.38, 0.30), (0.46, 0.30))):
        cube(f"UnoLED_{i}", (cx + lx, cy + ly, top + 0.02), (0.04, 0.06, 0.035), mats["red_emit"] if i < 2 else mats["steel"], root, 0.003)

    for i in range(12):
        yy = cy - hy + 0.10 + i * 0.046
        cube(f"UnoHdr_R_{i}", (cx + hx - 0.06, yy, top + 0.05), (0.08, 0.036, 0.10), mats["black"], root, 0.002)
        cube(f"UnoHdr_L_{i}", (cx - hx + 0.06, yy, top + 0.05), (0.08, 0.036, 0.10), mats["black"], root, 0.002)

    usb = (cx + 0.16, cy + hy + 0.16, top + 0.055)
    barrel = (cx - 0.22, cy + hy + 0.14, top + 0.055)
    return {
        "usb": usb,
        "barrel": barrel,
        "hdr_l": (cx - hx + 0.06, cy - 0.08, top + 0.08),
        "hdr_r": (cx + hx - 0.06, cy - 0.08, top + 0.08),
    }


def add_l298n(root, mats, cx, cy, deck_top, tag):
    """L298N dual H-bridge: red square, finned heatsink to +Y, blue terminals on the sides."""
    pcb_h = 0.04
    pcb_z = deck_top + pcb_h * 0.5
    top = pcb_z + pcb_h * 0.5
    s = 0.50
    h = s * 0.5

    cube(f"L298N_{tag}", (cx, cy, pcb_z), (s, s, pcb_h), mats["pcb_red"], root, 0.01)
    for ox, oy in ((-h + 0.08, -h + 0.08), (h - 0.08, -h + 0.08), (-h + 0.08, h - 0.08), (h - 0.08, h - 0.08)):
        cylinder(f"L298N_{tag}_hole_{ox}_{oy}", (cx + ox, cy + oy, top + 0.004), 0.025, 0.01, mats["steel_dark"], root, vertices=10, bevel=0)

    cube(f"L298N_{tag}_sink", (cx, cy + 0.14, top + 0.18), (0.40, 0.09, 0.36), mats["charcoal"], root, 0.008)
    for i in range(6):
        cube(
            f"L298N_{tag}_fin_{i}",
            (cx - 0.175 + i * 0.07, cy + 0.14, top + 0.20),
            (0.024, 0.12, 0.40),
            mats["charcoal"],
            root,
            0.004,
        )
    cube(f"L298N_{tag}_ic", (cx, cy + 0.07, top + 0.13), (0.26, 0.04, 0.24), mats["black"], root, 0.006)
    cylinder(f"L298N_{tag}_screw", (cx, cy + 0.14, top + 0.38), 0.02, 0.028, mats["steel"], root, vertices=10, bevel=0)

    for i, ox in enumerate((-0.10, 0.10)):
        cylinder(f"L298N_{tag}_cap_{i}", (cx + ox, cy - 0.02, top + 0.11), 0.055, 0.20, mats["steel"], root, vertices=16, bevel=0.008)
        cylinder(f"L298N_{tag}_cap_top_{i}", (cx + ox, cy - 0.02, top + 0.215), 0.048, 0.012, mats["steel_dark"], root, vertices=16, bevel=0)

    cube(f"L298N_{tag}_term_outL", (cx - 0.22, cy + 0.14, top + 0.07), (0.12, 0.16, 0.14), mats["terminal_blue"], root, 0.01)
    cube(f"L298N_{tag}_term_pwr", (cx - 0.22, cy - 0.02, top + 0.07), (0.12, 0.20, 0.14), mats["terminal_blue"], root, 0.01)
    cube(f"L298N_{tag}_term_outR", (cx + 0.22, cy + 0.04, top + 0.07), (0.12, 0.16, 0.14), mats["terminal_blue"], root, 0.01)
    for i in range(6):
        cube(f"L298N_{tag}_hdr_{i}", (cx - 0.18 + i * 0.072, cy - h + 0.06, top + 0.06), (0.04, 0.04, 0.12), mats["black"], root, 0.002)
    for i, (ox, oy) in enumerate(((-0.22, -0.16), (-0.12, -0.16), (0.22, -0.16), (0.12, 0.22))):
        cube(f"L298N_{tag}_smd_{i}", (cx + ox, cy + oy, top + 0.012), (0.06, 0.04, 0.02), mats["charcoal"], root, 0.002)

    return {
        "power": (cx - 0.22, cy - 0.02, top + 0.12),
        "out_rear": (cx - 0.22, cy + 0.14, top + 0.12),
        "out_front": (cx + 0.22, cy + 0.04, top + 0.12),
        "logic": (cx, cy - h + 0.06, top + 0.12),
    }


def build_robot(mats):
    root = empty("RobotRoot")

    cube("CreamChassis", (0, 0, 0.62), (2.32, 4.40, 0.16), mats["cream"], root, 0.07)

    wheels = []
    for side, x in (("L", -1.69), ("R", 1.69)):
        for slot, y in enumerate((1.86, -1.86)):
            wheels.append(add_wheel(root, x, y, f"{side}{slot}", mats))

    cube("SensorTowerBase", (0, -1.45, 1.05), (1.42, 1.25, 0.62), mats["black"], root, 0.025)
    # Tower top is z=1.36. Seat the webcam fully on that lid, not hanging off -Y.
    scan = empty("CameraScan", root, (0.0, -1.38, 1.54))
    add_webcam(scan, mats)

    bank = add_power_bank(root, mats, 0.0, 0.31, 0.70)
    pi_ports = add_raspberry_pi(root, mats, 0.0, 0.07, bank["top"])

    # Uno sits on the bank tongue, past the Pi USB stacks. Drivers stay on the wide pad.
    uno = add_arduino_uno(root, mats, 0.0, 1.74, bank["top"])
    drive_l = add_l298n(root, mats, -0.82, 1.06, bank["top"], "L")
    drive_r = add_l298n(root, mats, 0.82, 1.06, bank["top"], "R")

    # Two long collection arms, hinged at the forward stack. Tips only reach inward.
    arms = []
    for side, x, open_angle in (("Left", -0.83, -28), ("Right", 0.83, 28)):
        pivot = empty(f"{side}ArmPivot", root, (x, -1.54, 1.02))
        cylinder(f"{side}ArmHinge", (0, 0, 0), 0.23, 0.28, mats["steel_dark"], pivot, vertices=24)
        cube(f"{side}ArmBeam", (0, -1.30, 0), (0.20, 2.65, 0.16), mats["arm_black"], pivot, 0.012)
        inward = 1 if side == "Left" else -1
        cube(f"{side}ArmTip", (inward * 0.28, -2.62, 0), (0.40, 0.18, 0.15), mats["arm_black"], pivot, 0.012)
        cylinder(f"{side}TipBolt", (inward * 0.12, -2.62, 0.11), 0.05, 0.032, mats["steel"], pivot, vertices=16, bevel=0.004)
        pivot["open_angle"] = radians(open_angle)
        arms.append(pivot)

    empty("BottleGrab", root, (0, -4.16, 0.02))

    usb_l = pi_ports["usb_left"]
    usb_r = pi_ports["usb_right"]
    cube("USBPlug_L", (usb_l[0], usb_l[1] + 0.04, usb_l[2]), (0.16, 0.10, 0.10), mats["steel"], root, 0.008)
    cube("USBPlug_R", (usb_r[0], usb_r[1] + 0.04, usb_r[2]), (0.16, 0.10, 0.10), mats["steel"], root, 0.008)
    cube("USBPlug_cam", (0.0, 0.30, 0.0), (0.12, 0.07, 0.06), mats["steel"], scan, 0.006)
    cube("UnoPlug", (uno["usb"][0], uno["usb"][1] + 0.02, uno["usb"][2]), (0.14, 0.08, 0.08), mats["steel"], root, 0.006)

    gpio = pi_ports["gpio"]
    for i, mat_name in enumerate(("wire_black", "wire_orange", "wire_red")):
        spread = (i - 1) * 0.035
        tube(
            f"UART_{i}",
            [
                (gpio[0], gpio[1] + spread, gpio[2]),
                (gpio[0] - 0.10, gpio[1] + 0.04 + spread, gpio[2] + 0.14),
                (uno["hdr_l"][0] - 0.10, uno["hdr_l"][1] - 0.04 + spread, uno["hdr_l"][2] + 0.14),
                (uno["hdr_l"][0], uno["hdr_l"][1] + spread, uno["hdr_l"][2]),
            ],
            0.012,
            mats[mat_name],
            root,
        )

    tube(
        "USB_webcam",
        [
            (usb_l[0], usb_l[1] + 0.10, usb_l[2]),
            (usb_l[0] - 0.08, usb_l[1] + 0.18, usb_l[2] + 0.10),
            (-0.72, 0.70, 1.42),
            (-0.72, -0.20, 1.44),
            (-0.55, -0.85, 1.48),
            (0.00, -1.06, 1.54),
        ],
        0.026,
        mats["wire_black"],
        root,
    )
    tube(
        "USB_uno",
        [
            (usb_r[0], usb_r[1] + 0.10, usb_r[2]),
            (usb_r[0] + 0.04, usb_r[1] + 0.16, usb_r[2] + 0.12),
            (0.22, 1.72, 1.50),
            (uno["usb"][0] + 0.04, uno["usb"][1] - 0.06, uno["usb"][2] + 0.10),
            (uno["usb"][0], uno["usb"][1], uno["usb"][2]),
        ],
        0.024,
        mats["wire_white"],
        root,
    )
    tube(
        "USB_pi_power",
        [
            bank["usb_a1"],
            (bank["usb_a1"][0] + 0.08, bank["usb_a1"][1], bank["usb_a1"][2] + 0.10),
            (pi_ports["usbc"][0] + 0.10, pi_ports["usbc"][1], pi_ports["usbc"][2] + 0.10),
            (pi_ports["usbc"][0] + 0.04, pi_ports["usbc"][1], pi_ports["usbc"][2]),
        ],
        0.022,
        mats["wire_black"],
        root,
    )
    for tag, drive, x_sign in (("L", drive_l, -1), ("R", drive_r, 1)):
        tube(
            f"Batt_L298N_{tag}",
            [
                (bank["usb_a0"][0], bank["usb_a0"][1], bank["usb_a0"][2]),
                (x_sign * 1.12, bank["usb_a0"][1], 1.20),
                (x_sign * 1.12, drive["power"][1], 1.24),
                (drive["power"][0] + x_sign * 0.06, drive["power"][1], drive["power"][2] + 0.06),
                drive["power"],
            ],
            0.024,
            mats["wire_red"] if tag == "R" else mats["wire_black"],
            root,
        )

    for side, my in ((-1, -1.86), (-1, 1.86), (1, -1.86), (1, 1.86)):
        drive = drive_l if side < 0 else drive_r
        dest = drive["out_rear"] if my > 0 else drive["out_front"]
        for i in range(3):
            mat = mats[("wire_black", "wire_orange", "wire_red")[i % 3]]
            spread = (i - 1) * 0.04
            start = (side * 1.33, my, 1.40)
            end = (dest[0] + spread, dest[1] + spread * 0.4, dest[2])
            if my > 0:
                points = [
                    start,
                    (side * 1.20, my - 0.10, 1.46),
                    (side * 1.08, dest[1] + 0.18, dest[2] + 0.18),
                    (side * 0.92 + spread, dest[1] + 0.06, dest[2] + 0.08),
                    end,
                ]
            else:
                points = [
                    start,
                    (side * 1.20, my + 0.10, 1.46),
                    (side * 1.14, -0.50, 1.40),
                    (side * 1.12, 0.40, 1.40),
                    (side * 1.04, dest[1] - 0.16, dest[2] + 0.14),
                    (side * 0.90 + spread, dest[1] - 0.04, dest[2] + 0.06),
                    end,
                ]
            tube(f"MotorLoom_{side}_{my}_{i}", points, 0.016, mat, root)

    return root, wheels, scan, arms


def build_bottle(mats):
    bottle = empty("BottleRoot")
    cylinder("BottleBody", (0, 0, 0.67), 0.34, 1.30, mats["bottle"], bottle, vertices=36, bevel=0.11)
    cylinder("BottleShoulder", (0, 0, 1.31), 0.26, 0.24, mats["bottle"], bottle, vertices=36, bevel=0.08)
    cylinder("BottleNeck", (0, 0, 1.53), 0.15, 0.28, mats["bottle"], bottle, vertices=32, bevel=0.04)
    cylinder("BottleCap", (0, 0, 1.72), 0.18, 0.13, mats["bottle_cap"], bottle, vertices=24, bevel=0.025)
    label_wrap("BottleLabel", 0.78, 0.348, 0.58, mats["bottle_label"], bottle)
    bottle.location = (0, -4.42, 0.02)
    return bottle


def create_materials():
    return {
        "cream": material("Warm cream plywood", (0.68, 0.60, 0.45), 0.58),
        "cream_top": material("Cream top veneer", (0.82, 0.75, 0.61), 0.50),
        "ply_edge": material("Plywood laminated edge", (0.42, 0.29, 0.17), 0.68),
        "black": material("Satin black housings", (0.025, 0.028, 0.035), 0.38),
        "charcoal": material("Charcoal polymer", (0.065, 0.072, 0.082), 0.50),
        "powerbank": material("Power bank shell", (0.04, 0.045, 0.05), 0.42),
        "powerbank_lid": material("Power bank top", (0.07, 0.075, 0.082), 0.48),
        "print": material("Printed PLA", (0.10, 0.11, 0.12), 0.78),
        "arm_black": material("Collection arm black", (0.018, 0.021, 0.027), 0.32, 0.18),
        "rubber": material("Wheel rubber", (0.022, 0.024, 0.027), 0.82),
        "tread": material("Raised tread", (0.052, 0.055, 0.060), 0.88),
        "yellow": material("Utility yellow", (0.88, 0.55, 0.035), 0.44),
        "yellow_dark": material("Hub inset yellow", (0.48, 0.27, 0.015), 0.58),
        "steel": material("Brushed steel", (0.55, 0.60, 0.64), 0.28, 0.75),
        "steel_dark": material("Dark anodized metal", (0.16, 0.18, 0.21), 0.32, 0.62),
        "pcb": material("Main circuit board", (0.045, 0.15, 0.10), 0.48),
        "pcb_blue": material("Arduino Uno blue", (0.04, 0.16, 0.42), 0.42),
        "pcb_red": material("L298N red", (0.52, 0.04, 0.035), 0.46),
        "terminal_blue": material("Screw terminal blue", (0.08, 0.22, 0.62), 0.48),
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

    scan.rotation_euler = (0.0, 0.0, 0.0)

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
