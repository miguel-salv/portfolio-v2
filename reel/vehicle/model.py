"""Procedural stylized four-wheel robotics vehicle for Blender 5.2.

The proportions and visible construction are based on src/assets/vehicle-cover.jpg:
long stacked plates, exposed green PCB, red wheel hubs, foam bumper, standoffs,
a raised rectangular PCB on four corner posts, and loose wiring. No downloaded
geometry is used.
"""

from math import atan2, cos, pi, radians, sin

import bpy
from mathutils import Vector


def material(name, color, roughness=0.45, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    specular = bsdf.inputs.get("Specular IOR Level")
    if specular:
        specular.default_value = 0.24
    return mat


def assign(obj, mat):
    if hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)
    return obj


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def parent_local(obj, parent):
    obj.parent = parent
    return obj


def cube(name, location, scale, mat, bevel=0.08, parent=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Edge softening", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    assign(obj, mat)
    if parent:
        parent_local(obj, parent)
    return obj


def cylinder(
    name,
    location,
    radius,
    depth,
    mat,
    vertices=32,
    rotation=(0, 0, 0),
    bevel=0.035,
    parent=None,
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    if bevel:
        modifier = obj.modifiers.new("Edge softening", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    assign(obj, mat)
    if parent:
        parent_local(obj, parent)
    return obj


def uv_sphere(name, location, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(obj)
    assign(obj, mat)
    if parent:
        parent_local(obj, parent)
    return obj


def curve(name, points, radius, mat, parent=None):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 3
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    assign(obj, mat)
    if parent:
        parent_local(obj, parent)
    return obj


def make_plate(name, z, mat, parent, upper=False):
    """Layered long chassis plate with stepped side rails and open center hints."""
    plate = cube(name, (0, 0, z), (3.18, 1.46, 0.09), mat, 0.13, parent)
    # Slight side scallops/rail blocks give a cut-sheet silhouette without booleans.
    for side in (-1, 1):
        cube(
            f"{name}_side_rail_{side:+d}",
            (-0.15, side * 1.55, z - 0.015),
            (2.46, 0.10, 0.07),
            mat,
            0.05,
            parent,
        )
    if upper:
        # Bolt-hole language: dark recesses and bright fastener heads.
        for x, y in ((-2.5, -1.05), (-2.5, 1.05), (2.42, -1.05), (2.42, 1.05)):
            cylinder(
                f"Top_plate_bolt_{x}_{y}",
                (x, y, z + 0.105),
                0.10,
                0.035,
                MATERIALS["steel"],
                20,
                parent=parent,
            )
        for x in (-1.35, 0.0, 1.35):
            for y in (-0.38, 0.38):
                cylinder(
                    f"Top_plate_vent_{x}_{y}",
                    (x, y, z + 0.101),
                    0.055,
                    0.025,
                    MATERIALS["recess"],
                    16,
                    parent=parent,
                )
    return plate


def make_wheel(name, x, y, front, parent):
    """Wheel assembly with rubber torus, red rim, five spokes, and tread blocks."""
    steer = bpy.data.objects.new(f"{name}_steer", None)
    steer.location = (x, y, 0.86)
    bpy.context.collection.objects.link(steer)
    parent_local(steer, parent)

    roll = bpy.data.objects.new(f"{name}_roll", None)
    roll.location = (0, 0, 0)
    bpy.context.collection.objects.link(roll)
    parent_local(roll, steer)

    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.54,
        minor_radius=0.19,
        major_segments=36,
        minor_segments=10,
        location=(0, 0, 0),
        rotation=(radians(90), 0, 0),
    )
    tire = bpy.context.object
    tire.name = f"{name}_rubber"
    smooth(tire)
    assign(tire, MATERIALS["rubber"])
    parent_local(tire, roll)

    cylinder(
        f"{name}_red_rim",
        (0, 0, 0),
        0.49,
        0.27,
        MATERIALS["red"],
        40,
        (radians(90), 0, 0),
        0.03,
        roll,
    )
    cylinder(
        f"{name}_black_inset",
        (0, -0.15 if y < 0 else 0.15, 0),
        0.38,
        0.045,
        MATERIALS["black"],
        32,
        (radians(90), 0, 0),
        0.02,
        roll,
    )
    outer_y = -0.19 if y < 0 else 0.19
    cylinder(
        f"{name}_hub",
        (0, outer_y, 0),
        0.13,
        0.09,
        MATERIALS["steel"],
        24,
        (radians(90), 0, 0),
        0.02,
        roll,
    )
    cylinder(
        f"{name}_spoke_hub",
        (0, outer_y, 0),
        0.07,
        0.05,
        MATERIALS["black"],
        20,
        (radians(90), 0, 0),
        0.015,
        roll,
    )
    spoke_len = 0.34
    spoke_center = 0.04 + spoke_len * 0.5
    for spoke_index in range(5):
        angle = radians(spoke_index * 72)
        cube(
            f"{name}_spoke_{spoke_index:02d}",
            (cos(angle) * spoke_center, outer_y, sin(angle) * spoke_center),
            (spoke_len * 0.5, 0.032, 0.032),
            MATERIALS["black"],
            0.016,
            roll,
            (0, -angle, 0),
        )
    # Radial tread catches highlights and keeps the wheel readable during motion.
    for tread_index in range(24):
        angle = 2 * pi * tread_index / 24
        cube(
            f"{name}_tread_{tread_index:02d}",
            (cos(angle) * 0.72, 0, sin(angle) * 0.72),
            (0.055, 0.225, 0.022),
            MATERIALS["tread"],
            0.018,
            roll,
            (0, -angle, 0),
        )

    # Short visible axle and suspension block.
    cylinder(
        f"{name}_axle",
        (x, y * 0.72, 0.86),
        0.11,
        0.72,
        MATERIALS["steel"],
        24,
        (radians(90), 0, 0),
        0.02,
        parent,
    )
    cube(
        f"{name}_mount",
        (x, y * 0.73, 1.02),
        (0.28, 0.20, 0.24),
        MATERIALS["black"],
        0.06,
        parent,
    )
    return {"steer": steer, "roll": roll, "front": front}


def make_bumper(parent):
    """Three-part chamfered foam bumper, matching the broad black photo bumper."""
    x = 3.62
    cube("Foam_bumper_center", (x, 0, 0.73), (0.30, 1.12, 0.34), MATERIALS["foam"], 0.17, parent)
    for side in (-1, 1):
        cube(
            f"Foam_bumper_wing_{side:+d}",
            (x - 0.12, side * 1.24, 0.73),
            (0.38, 0.52, 0.34),
            MATERIALS["foam"],
            0.16,
            parent,
            (0, 0, radians(side * 18)),
        )
    for y in (-0.83, 0, 0.83):
        cylinder(
            f"Bumper_bolt_{y}",
            (x + 0.31, y, 0.88),
            0.105,
            0.045,
            MATERIALS["steel"],
            20,
            (0, radians(90), 0),
            0.02,
            parent,
        )


def trapezoid_deck(name, z, mat, parent):
    """Black upper plate: wide at the rear, tapering toward the front bumper."""
    rear_x, front_x = -3.12, 2.68
    rear_y, front_y = 1.46, 0.74
    hz = 0.075
    verts = [
        (rear_x, -rear_y, -hz),
        (rear_x, rear_y, -hz),
        (front_x, front_y, -hz),
        (front_x, -front_y, -hz),
        (rear_x, -rear_y, hz),
        (rear_x, rear_y, hz),
        (front_x, front_y, hz),
        (front_x, -front_y, hz),
    ]
    faces = (
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (3, 2, 6, 7),
        (0, 3, 7, 4),
        (1, 5, 6, 2),
    )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = (0.0, 0.0, z)
    modifier = obj.modifiers.new("Edge softening", "BEVEL")
    modifier.width = 0.06
    modifier.segments = 2
    assign(obj, mat)
    parent_local(obj, parent)
    for x, y in ((-2.55, -1.05), (-2.55, 1.05), (2.15, -0.55), (2.15, 0.55)):
        cylinder(
            f"{name}_bolt_{x}_{y}",
            (x, y, z + hz + 0.02),
            0.09,
            0.03,
            MATERIALS["steel"],
            16,
            parent=parent,
        )
    return obj


def make_raised_pcb(parent):
    """Four corner standoffs hold a rectangular green board above the upper deck."""
    pcb_cx, pcb_cy = -0.10, 0.0
    half_x, half_y = 1.64, 0.88
    inset = 0.16
    deck_top = 1.58
    post_height = 0.48
    post_z = deck_top + post_height * 0.5
    pcb_half_z = 0.045
    pcb_z = deck_top + post_height + pcb_half_z
    corners = (
        (pcb_cx - half_x + inset, pcb_cy - half_y + inset),
        (pcb_cx - half_x + inset, pcb_cy + half_y - inset),
        (pcb_cx + half_x - inset, pcb_cy - half_y + inset),
        (pcb_cx + half_x - inset, pcb_cy + half_y - inset),
    )
    for x, y in corners:
        cylinder(
            f"PCB_standoff_{x:.2f}_{y:.2f}",
            (x, y, post_z),
            0.058,
            post_height,
            MATERIALS["brass"],
            8,
            parent=parent,
        )
        cylinder(
            f"PCB_standoff_screw_{x:.2f}_{y:.2f}",
            (x, y, pcb_z + pcb_half_z + 0.018),
            0.040,
            0.036,
            MATERIALS["steel"],
            16,
            parent=parent,
        )
    cube("Green_PCB_upper", (pcb_cx, pcb_cy, pcb_z), (half_x, half_y, pcb_half_z), MATERIALS["green"], 0.055, parent)
    cube(
        "Green_PCB_upper_edge",
        (pcb_cx, pcb_cy, pcb_z - pcb_half_z - 0.012),
        (half_x + 0.035, half_y + 0.035, 0.016),
        MATERIALS["green_edge"],
        0.028,
        parent,
    )
    cube("Upper_PCB_trace_a", (pcb_cx - 0.42, pcb_cy + 0.46, pcb_z + 0.052), (0.78, 0.026, 0.012), MATERIALS["copper"], 0.01, parent)
    cube("Upper_PCB_trace_b", (pcb_cx + 0.55, pcb_cy - 0.38, pcb_z + 0.052), (0.62, 0.026, 0.012), MATERIALS["copper"], 0.01, parent)
    cube("Upper_PCB_chip", (pcb_cx - 0.28, pcb_cy + 0.08, pcb_z + 0.10), (0.50, 0.32, 0.08), MATERIALS["chip"], 0.04, parent)
    cube("Upper_PCB_connector", (pcb_cx + 1.12, pcb_cy + 0.46, pcb_z + 0.10), (0.22, 0.16, 0.09), MATERIALS["connector"], 0.03, parent)


def make_posts(parent):
    # Structural brass standoffs between decks.
    for x, y in ((-2.65, -1.15), (-2.65, 1.15), (0, -1.15), (0, 1.15), (2.55, -1.15), (2.55, 1.15)):
        cylinder(f"Brass_standoff_{x}_{y}", (x, y, 1.24), 0.055, 0.42, MATERIALS["brass"], 16, parent=parent)
    make_raised_pcb(parent)


def make_underbody(parent):
    cube("Battery_pack", (-0.15, 0, 0.62), (1.55, 0.77, 0.26), MATERIALS["battery"], 0.12, parent)
    for x in (-2.20, 2.15):
        cube(f"Motor_block_{x}", (x, 0, 0.76), (0.52, 0.66, 0.31), MATERIALS["motor"], 0.10, parent)
        cylinder(
            f"Motor_can_{x}",
            (x, 0, 0.76),
            0.28,
            0.95,
            MATERIALS["motor"],
            28,
            (radians(90), 0, 0),
            0.05,
            parent,
        )


def build_vehicle():
    global MATERIALS
    MATERIALS = {
        "black": material("Powder-coated black", (0.018, 0.020, 0.021), 0.42, 0.18),
        "recess": material("Vent recess", (0.002, 0.003, 0.003), 0.60),
        "green": material("PCB green", (0.018, 0.30, 0.145), 0.40, 0.04),
        "green_edge": material("PCB edge", (0.010, 0.14, 0.065), 0.46),
        "rubber": material("Wheel rubber", (0.009, 0.010, 0.011), 0.72),
        "tread": material("Tread highlight", (0.020, 0.022, 0.024), 0.82),
        "foam": material("Front foam", (0.020, 0.021, 0.021), 0.94),
        "red": material("Anodized red", (0.52, 0.012, 0.008), 0.30, 0.62),
        "steel": material("Fastener steel", (0.38, 0.42, 0.46), 0.26, 0.78),
        "brass": material("Brass standoffs", (0.34, 0.22, 0.075), 0.34, 0.72),
        "chip": material("IC black", (0.010, 0.012, 0.014), 0.50),
        "connector": material("Connector ivory", (0.67, 0.70, 0.68), 0.42),
        "copper": material("PCB copper", (0.34, 0.18, 0.05), 0.36, 0.55),
        "battery": material("Battery shell", (0.035, 0.040, 0.046), 0.52),
        "motor": material("Motor dark metal", (0.075, 0.080, 0.086), 0.34, 0.68),
        "antenna": material("Antenna black", (0.008, 0.009, 0.010), 0.48),
        "wire_black": material("Cable black", (0.007, 0.008, 0.009), 0.48),
        "wire_red": material("Cable red", (0.46, 0.015, 0.010), 0.44),
        "wire_gold": material("Cable yellow", (0.72, 0.32, 0.025), 0.44),
    }

    root = bpy.data.objects.new("Vehicle_Root", None)
    root.empty_display_type = "PLAIN_AXES"
    bpy.context.collection.objects.link(root)

    cube("Green_PCB_lower", (0.02, 0, 0.99), (3.02, 1.34, 0.08), MATERIALS["green"], 0.08, root)
    make_posts(root)
    trapezoid_deck("Black_upper_deck", 1.50, MATERIALS["black"], root)
    make_bumper(root)

    wheels = []
    for x, front in ((2.34, True), (-2.30, False)):
        for y in (-1.78, 1.78):
            side = "right" if y < 0 else "left"
            axle = "front" if front else "rear"
            wheels.append(make_wheel(f"Wheel_{axle}_{side}", x, y, front, root))

    return root, wheels


def animate_vehicle(root, wheels, frame_end=120):
    """Arrive, hold on the type, then drive through so the road of words reads as travel."""
    arrive = max(24, int(frame_end * 0.22))
    hold = max(arrive + 16, int(frame_end * 0.62))
    keys = (
        (1, -9.6, 0.0, radians(10), 0.0),
        (arrive, 1.55, 0.012, radians(7), 10.4),
        (hold, 2.05, 0.0, radians(6), 16.8),
        (frame_end, 11.4, 0.0, radians(2), 36.0),
    )
    root.rotation_mode = "XYZ"
    for frame, x, z, yaw, _odometer in keys:
        root.location = (x, 0, z)
        root.rotation_euler = (0, 0, yaw)
        root.keyframe_insert("location", frame=frame)
        root.keyframe_insert("rotation_euler", frame=frame)

    tire_radius = 0.735
    for wheel in wheels:
        roll = wheel["roll"]
        roll.rotation_mode = "XYZ"
        for frame, _x, _z, _yaw, odometer in keys:
            roll.rotation_euler = (0, -odometer / tire_radius, 0)
            roll.keyframe_insert("rotation_euler", frame=frame)
        if wheel["front"]:
            steer = wheel["steer"]
            steer.rotation_mode = "XYZ"
            for frame, steering in (
                (1, 0),
                (arrive, radians(-5)),
                (hold, 0),
                (frame_end, 0),
            ):
                steer.rotation_euler = (0, 0, steering)
                steer.keyframe_insert("rotation_euler", frame=frame)

