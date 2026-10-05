"""Photo-reconstructed Ackermann chassis and custom control PCB for Blender.

Visible frame details follow src/assets/vehicle-cover.jpg, cross-checked against
Yahboom's ROS-Robot-Chassis product reference. The available manufacturer STEP
archive is a different 4WD frame, so no downloaded geometry is presented as an
exact match. See CHASSIS-SOURCES.md for evidence and reconstruction limits.
The established 0.75 tire radius, steering/rolling parents and animation API stay
compatible with the existing story renderers.
"""

from math import atan2, cos, exp, pi, radians, sin

import bpy
from mathutils import Vector

_PCB_FONT = None


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
    if mat is not None and hasattr(obj.data, "materials"):
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


def box(name, location, scale, mat, parent=None, rotation=(0, 0, 0)):
    """Unbeveled cuboid. `scale` is half-extents, matching `cube`."""
    sx, sy, sz = scale
    verts = (
        (-sx, -sy, -sz),
        (sx, -sy, -sz),
        (sx, sy, -sz),
        (-sx, sy, -sz),
        (-sx, -sy, sz),
        (sx, -sy, sz),
        (sx, sy, sz),
        (-sx, sy, sz),
    )
    faces = ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (3, 2, 6, 7), (0, 3, 7, 4), (1, 5, 6, 2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    assign(obj, mat)
    if parent:
        parent_local(obj, parent)
    return obj


def prism(name, outline, z, thickness, mat, parent=None, bevel=0.012):
    """Extruded cut-sheet silhouette; outline runs counterclockwise in XY."""
    n = len(outline)
    verts = [(x, y, h) for h in (-thickness / 2, thickness / 2) for x, y in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location.z = z
    assign(obj, mat)
    if bevel:
        mod = obj.modifiers.new("Cut sheet edge", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    if parent:
        parent_local(obj, parent)
    return obj


def cut_openings(obj, slots=(), holes=()):
    """Cut real through-openings with one compound boolean, then bevel the edges."""
    cutters = []
    for i, (x, y, hx, hy, radius) in enumerate(slots):
        cutter = cube(f"{obj.name}_slot_cutter_{i}", (x, y, obj.location.z), (hx, hy, 0.18), None, radius)
        if cutter.modifiers:
            bpy.context.view_layer.objects.active = cutter
            bpy.ops.object.modifier_apply(modifier=cutter.modifiers[0].name)
        cutters.append(cutter)
    for i, (x, y, radius) in enumerate(holes):
        cutters.append(cylinder(f"{obj.name}_bore_cutter_{i}", (x, y, obj.location.z), radius, 0.40, None, 20, bevel=0))
    if not cutters:
        return obj
    bpy.ops.object.select_all(action="DESELECT")
    for cutter in cutters:
        cutter.select_set(True)
    bpy.context.view_layer.objects.active = cutters[0]
    bpy.ops.object.join()
    compound = bpy.context.object
    mod = obj.modifiers.new("Through holes and service slots", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = compound
    # Evaluate booleans before the small sheet bevel, so hole rims get softened.
    bpy.context.view_layer.objects.active = obj
    while list(obj.modifiers).index(mod) > 0:
        bpy.ops.object.modifier_move_up(modifier=mod.name)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(compound, do_unlink=True)
    return obj


def annulus(name, radius_outer, radius_inner, depth, mat, parent, location=(0, 0, 0)):
    """Open rim/barrel aligned to the wheel's Y axis, with no opaque wheel dish."""
    segments = 64
    verts = []
    for y, radius in ((-depth / 2, radius_outer), (depth / 2, radius_outer), (-depth / 2, radius_inner), (depth / 2, radius_inner)):
        verts += [(radius * cos(2 * pi * i / segments), y, radius * sin(2 * pi * i / segments)) for i in range(segments)]
    faces = []
    for a, b in ((0, 1), (1, 3), (3, 2), (2, 0)):
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((a * segments + i, a * segments + j, b * segments + j, b * segments + i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], [tuple(reversed(face)) for face in faces])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    assign(obj, mat)
    smooth(obj)
    parent_local(obj, parent)
    return obj


def top_fastener(name, x, y, z, parent, radius=0.065):
    """A visible washer and recessed hex socket on the upward-facing screw."""
    cylinder(f"{name}_washer", (x, y, z + 0.010), radius * 1.20, 0.020, MATERIALS["steel"], 24, bevel=0.004, parent=parent)
    head = cylinder(f"{name}_head", (x, y, z + 0.030), radius, 0.042, MATERIALS["steel"], 24, bevel=0.008, parent=parent)
    cutter = cylinder(f"{name}_socket_cutter", (x, y, z + 0.057), radius * 0.40, 0.031, None, 6, bevel=0)
    mod = head.modifiers.new("Hex socket", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    bpy.context.view_layer.objects.active = head
    while list(head.modifiers).index(mod) > 0:
        bpy.ops.object.modifier_move_up(modifier=mod.name)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return head


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


def curve(name, points, radius, mat, parent=None, pin_end=False):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 16
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    if pin_end and len(points) >= 2:
        last = spline.bezier_points[-1]
        prev = spline.bezier_points[-2]
        delta = last.co - prev.co
        for knot, toward in ((prev, delta), (last, delta)):
            knot.handle_left_type = "FREE"
            knot.handle_right_type = "FREE"
            knot.handle_left = knot.co - toward * 0.28
            knot.handle_right = knot.co + toward * 0.28
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
    """Photographed touring tire, recessed sweeping grooves and turbine spokes."""
    steer = bpy.data.objects.new(f"{name}_steer", None)
    steer.location = (x, y, 0.86)
    camber = radians(2.0)
    steer.rotation_euler.x = -camber if y > 0 else camber
    bpy.context.collection.objects.link(steer)
    parent_local(steer, parent)
    roll = bpy.data.objects.new(f"{name}_roll", None)
    bpy.context.collection.objects.link(roll)
    parent_local(roll, steer)

    # Revolved carcass with a broad crown and rounded sidewalls, like the photo.
    # The grooves are depressions in the rubber mesh, not raised black ribs.
    control_profile = [
        (-.239, .579), (-.247, .620), (-.242, .672), (-.221, .712),
        (-.192, .736), (-.160, .747), (-.130, .750), (-.100, .750),
        (-.070, .750), (-.040, .750), (-.012, .750), (.012, .750),
        (.040, .750), (.070, .750), (.100, .750), (.130, .750),
        (.160, .747), (.192, .736), (.221, .712), (.242, .672),
        (.247, .620), (.239, .579),
    ]
    # Dense rings preserve the continuous sweeping groove across the crown;
    # sparse rings turn the diagonal depressions into a blocky tread pattern.
    profile = []
    for first, second in zip(control_profile, control_profile[1:]):
        for step in range(4):
            t = step / 4
            profile.append((first[0] * (1 - t) + second[0] * t, first[1] * (1 - t) + second[1] * t))
    profile.append(control_profile[-1])
    segments, grooves = 560, 28
    pitch = 2 * pi / grooves
    verts, faces = [], []
    for yy, nominal_radius in profile:
        across = abs(yy)
        sweep = .26 * (min(across / .205, 1.0) ** .85)
        for i in range(segments):
            angle = 2 * pi * i / segments
            offset = ((angle - sweep + pitch / 2) % pitch) - pitch / 2
            # Small curved secondary sipes enter the shoulders only.
            secondary = ((angle + .085 - sweep * .35 + pitch / 2) % pitch) - pitch / 2
            groove_depth = .020 * exp(-((offset / .018) ** 4)) if across < .218 else 0
            if .115 < across < .229:
                groove_depth += .011 * exp(-((secondary / .014) ** 4))
            radius = nominal_radius - groove_depth
            verts.append((cos(angle) * radius, yy, sin(angle) * radius))
    for row in range(len(profile)):
        next_row = (row + 1) % len(profile)
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((row * segments + i, row * segments + j, next_row * segments + j, next_row * segments + i))
    mesh = bpy.data.meshes.new(f"{name}_grooved_tire")
    mesh.from_pydata(verts, [], [tuple(reversed(face)) for face in faces])
    mesh.update()
    tire = bpy.data.objects.new(f"{name}_rubber", mesh)
    bpy.context.collection.objects.link(tire)
    assign(tire, MATERIALS["rubber"])
    smooth(tire)
    parent_local(tire, roll)

    annulus(f"{name}_open_barrel", .584, .535, .42, MATERIALS["wheel_black"], roll)
    cylinder(f"{name}_inner_hub", (0, 0, 0), .125, .40, MATERIALS["wheel_black"], 32, (radians(90), 0, 0), .012, roll)
    outer_y = -.248 if y < 0 else .248
    direction = -1 if y < 0 else 1
    for sign in (-1, 1):
        annulus(f"{name}_red_rim_{sign:+d}", .601, .547, .031, MATERIALS["red"], roll, (0, sign * .226, 0))

    # Ten curved, tapered blades carry the hub into a broad red ring.
    for i in range(10):
        angle = 2 * pi * i / 10
        vertices = []
        sections = ((.135, 0), (.22, .20), (.36, .50), (.46, .76), (.553, 1))
        for inset in (-.021, .021):
            for radius, t in sections:
                sweep = angle + .35 * (1 - t) - .15 * t
                half_angle = (.024 + .020 * t) / radius
                yy = outer_y * (.66 + .24 * t) + inset
                for edge in (-1, 1):
                    aa = sweep + edge * half_angle
                    vertices.append((radius * cos(aa), yy, radius * sin(aa)))
        side_count = len(sections) * 2
        faces = []
        for row in range(len(sections) - 1):
            a, b = row * 2, (row + 1) * 2
            faces += [(a, a + 1, b + 1, b), (a + side_count, b + side_count, b + 1 + side_count, a + 1 + side_count)]
            faces += [(a, b, b + side_count, a + side_count), (a + 1, a + 1 + side_count, b + 1 + side_count, b + 1)]
        faces += [(0, side_count, side_count + 1, 1), (side_count - 2, side_count - 1, side_count * 2 - 1, side_count * 2 - 2)]
        data = bpy.data.meshes.new(f"{name}_blade_{i}")
        data.from_pydata(vertices, [], faces)
        data.update()
        blade = bpy.data.objects.new(f"{name}_spoke_{i:02d}", data)
        bpy.context.collection.objects.link(blade)
        assign(blade, MATERIALS["wheel_black"])
        parent_local(blade, roll)
        mod = blade.modifiers.new("Molded blade edges", "BEVEL")
        mod.width, mod.segments = .007, 2
        # Red rim has rectangular inward fingers at every spoke attachment.
        cube(
            f"{name}_rim_finger_{i}",
            (.534 * cos(angle - .15), outer_y * .95, .534 * sin(angle - .15)),
            (.032, .014, .040), MATERIALS["red"], .004, roll, (0, -(angle - .15), 0),
        )
    cylinder(f"{name}_hub_cap", (0, outer_y * .77, 0), .117, .045, MATERIALS["wheel_black"], 32, (radians(90), 0, 0), .01, roll)
    cylinder(f"{name}_washer", (0, outer_y * .95, 0), .104, .016, MATERIALS["steel"], 32, (radians(90), 0, 0), .003, roll)
    cylinder(f"{name}_nut", (0, outer_y + direction * .012, 0), .078, .043, MATERIALS["steel"], 6, (radians(90), 0, radians(30)), .004, roll)
    cylinder(f"{name}_stud", (0, outer_y + direction * .038, 0), .026, .035, MATERIALS["steel"], 16, (radians(90), 0, 0), .002, roll)

    # Steering knuckle travels with the front wheel; chassis stays on root.
    cylinder(f"{name}_bearing", (0, -direction * .30, 0), .147, .105, MATERIALS["steel"], 32, (radians(90), 0, 0), .009, steer)
    cube(f"{name}_knuckle", (0, -direction * .40, .025), (.092, .093, .205), MATERIALS["black"], .019, steer)
    cylinder(f"{name}_axle", (x, y - direction * .48, .86), .065, .33, MATERIALS["steel"], 24, (radians(90), 0, 0), .006, parent)
    if front:
        cube(f"{name}_steering_arm", (-.18, -direction * .40, -.080), (.23, .065, .041), MATERIALS["black"], .014, steer)
        cylinder(f"{name}_kingpin", (0, -direction * .40, .035), .044, .42, MATERIALS["steel"], 20, bevel=.006, parent=steer)
    return {"steer": steer, "roll": roll, "front": front}


def make_bumper(parent):
    """One curved foam nose with three top-mounted washers and inset top channels."""
    outline = [
        (2.96, -1.13), (3.02, -1.51), (3.28, -1.62), (3.50, -1.57),
        (3.58, -1.29), (3.65, -.63), (3.67, 0), (3.65, .63),
        (3.58, 1.29), (3.50, 1.57), (3.28, 1.62), (3.02, 1.51),
        (2.96, 1.13), (3.08, .85), (3.11, 0), (3.08, -.85),
    ]
    foam = prism("Foam_bumper", outline, .78, .63, MATERIALS["foam"], parent, .078)
    cube("Bumper_mount", (3.02, 0, .90), (.19, .92, .17), MATERIALS["black"], .028, parent)
    # Raised tabs are part of the molded foam top; the slots are shallow reliefs.
    for y in (-.78, 0, .78):
        cube(f"Bumper_top_pad_{y}", (3.25, y, 1.094), (.22, .29, .010), MATERIALS["foam"], .045, parent)
        top_fastener(f"Bumper_bolt_{y}", 3.24, y, 1.112, parent, radius=.083)
    for y in (-.94, 0, .94):
        cutter = cube(f"Foam_relief_cutter_{y}", (3.53, y, 1.099), (.055, .29, .025), None, .028)
        bpy.context.view_layer.objects.active = cutter
        bpy.ops.object.modifier_apply(modifier=cutter.modifiers[0].name)
        mod = foam.modifiers.new("Molded top channel", "BOOLEAN")
        mod.operation, mod.object = "DIFFERENCE", cutter
        bpy.context.view_layer.objects.active = foam
        while list(foam.modifiers).index(mod) > 0:
            bpy.ops.object.modifier_move_up(modifier=mod.name)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    return foam


def trapezoid_deck(name, z, mat, parent):
    """Thin black sheet with the photo's mild taper and real service/mounting holes."""
    outline = [
        (-3.12, -1.32), (-3.07, -1.41), (-2.92, -1.43),
        (2.58, -1.05), (2.68, -.97), (2.68, .97), (2.58, 1.05),
        (-2.92, 1.43), (-3.07, 1.41), (-3.12, 1.32),
    ]
    deck = prism(name, outline, z, .054, mat, parent, .007)
    slots = [
        # Transverse front slot and larger opening behind the steering support.
        (2.24, 0, .094, .61, .073), (1.37, 0, .28, .51, .055),
        # Rear center service aperture and long side harness slots.
        (-1.93, 0, .255, .71, .055),
        (-1.65, -.98, .49, .075, .063), (-1.65, .98, .49, .075, .063),
    ]
    holes = []
    # Photo-visible symmetrical multi-servo pattern just behind front aperture.
    for side in (-1, 1):
        for xx, yy, radius in [
            (.54, .72, .042), (.66, .55, .041), (.78, .68, .041),
            (.87, .83, .036), (.41, .86, .039), (.57, .94, .024),
            (.94, .96, .026), (.26, .69, .027), (.80, .48, .025),
        ]:
            holes.append((xx, side * yy, radius))
        for xx, yy in ((1.72, .75), (1.91, .68), (2.15, .82), (2.39, .79), (2.51, .57)):
            holes.append((xx, side * yy, .034))
        for xx, yy in ((-2.71, 1.11), (-2.40, .77), (-2.61, .42), (-2.87, .39), (-.83, .87), (-.50, .72), (-.25, 1.04)):
            holes.append((xx, side * yy, .026))
        # Unused mounting bores remain actual holes rather than black disc decals.
        for xx, yy in ((-.41, .29), (-.82, .29), (-2.54, .15)):
            holes.append((xx, side * yy, .026))
    cut_openings(deck, slots, holes)
    # Four photographed socket heads secure the steering support/front edge.
    for xx, yy in ((2.49, -.81), (2.49, .81), (1.96, -.49), (1.96, .49)):
        top_fastener(f"Deck_front_screw_{xx}_{yy}", xx, yy, z + .027, parent, .054)
    return deck


def make_lower_chassis(parent):
    """Green anodized sheet/tray with axle recesses, tabs and through-hole pattern."""
    outline = [
        (-3.10, -1.21), (-3.03, -1.31), (-2.85, -1.35),
        (1.62, -1.31), (1.92, -1.43), (2.45, -1.43),
        (2.45, -.93), (2.84, -.93), (2.94, -.80),
        (2.94, .80), (2.84, .93), (2.45, .93), (2.45, 1.43),
        (1.92, 1.43), (1.62, 1.31), (-2.85, 1.35),
        (-3.03, 1.31), (-3.10, 1.21),
    ]
    plate = prism("Green_PCB_lower", outline, .99, .052, MATERIALS["chassis_green"], parent, .007)
    slots = [(-1.88, 0, .33, .56, .035), (.10, -.73, .27, .040, .03), (.10, .73, .27, .040, .03)]
    holes = []
    for side in (-1, 1):
        for xx, yy in ((-2.79, 1.12), (-2.42, .93), (-1.10, .95), (-.62, .98), (.51, .96), (.91, .99), (1.52, .98), (2.12, 1.26)):
            holes.append((xx, side * yy, .031))
        for xx, yy in ((-.80, .55), (-.15, .55), (.80, .55), (1.10, .55)):
            holes.append((xx, side * yy, .026))
    cut_openings(plate, slots, holes)
    # Formed side rails visible between the two plates; left and right end short
    # of the steering axle instead of continuing through the wheel clearances.
    for side in (-1, 1):
        cube(f"Green_tray_rail_{side}", (-.17, side * 1.13, 1.17), (1.82, .023, .185), MATERIALS["chassis_green"], .009, parent)
        cube(f"Front_axle_ear_{side}", (2.28, side * 1.29, 1.14), (.26, .21, .025), MATERIALS["chassis_green"], .013, parent)
        for xx in (2.09, 2.42):
            top_fastener(f"Axle_ear_screw_{side}_{xx}", xx, side * 1.29, 1.165, parent, .048)
    return plate


def pcb_font():
    global _PCB_FONT
    try:
        if _PCB_FONT is not None:
            _ = _PCB_FONT.name
            return _PCB_FONT
    except ReferenceError:
        _PCB_FONT = None
    for path in (
        "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ):
        try:
            _PCB_FONT = bpy.data.fonts.load(path)
            return _PCB_FONT
        except (RuntimeError, OSError):
            continue
    return None


def silk_text(name, body, location, size, parent, rotation_z=0.0, align="CENTER"):
    data = bpy.data.curves.new(name, "FONT")
    data.body = body
    font = pcb_font()
    if font:
        try:
            data.font = font
        except ReferenceError:
            data.font = pcb_font() or data.font
    data.size = size
    data.extrude = 0.0006
    data.align_x = align
    data.align_y = "CENTER"
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, rotation_z)
    assign(obj, MATERIALS["silk"])
    parent_local(obj, parent)
    return obj


def smd_passive(name, x, y, top, parent, rotation=0.0, kind="resistor"):
    body = MATERIALS["ceramic"] if kind == "cap" else MATERIALS["resistor"]
    hx, hy, hz = (0.048, 0.026, 0.013) if kind != "ferrite" else (0.060, 0.032, 0.017)
    cube(name, (x, y, top + hz), (hx, hy, hz), body, 0.004, parent, (0, 0, rotation))
    cap = hx * 0.28
    dx = (hx - cap * 0.35) * cos(rotation)
    dy = (hx - cap * 0.35) * sin(rotation)
    for sign in (-1, 1):
        box(
            f"{name}_end_{sign}",
            (x + sign * dx, y + sign * dy, top + hz),
            (cap, hy * 0.92, hz * 0.92),
            MATERIALS["tin"],
            parent,
            (0, 0, rotation),
        )


def add_soic(name, cx, cy, top, parent, pins=10):
    bx, by, bz = 0.20, 0.32, 0.024
    cube(f"{name}_body", (cx, cy, top + bz), (bx, by, bz), MATERIALS["chip"], 0.01, parent)
    box(f"{name}_dot", (cx - bx * 0.72, cy + by * 0.72, top + bz * 2 + 0.003), (0.016, 0.016, 0.003), MATERIALS["silk"], parent)
    span = by * 1.62
    pin_l, pin_w, pin_h = 0.048, 0.014, 0.008
    for i in range(pins):
        yy = cy - span * 0.5 + span * (i + 0.5) / pins
        for sign in (-1, 1):
            box(
                f"{name}_pin_{sign}_{i}",
                (cx + sign * (bx + pin_l * 0.45), yy, top + pin_h),
                (pin_l, pin_w, pin_h),
                MATERIALS["tin"],
                parent,
            )


def add_d2pak(name, cx, cy, top, parent):
    cube(f"{name}_body", (cx, cy, top + 0.032), (0.10, 0.12, 0.032), MATERIALS["chip"], 0.01, parent)
    cube(f"{name}_tab", (cx + 0.14, cy, top + 0.009), (0.08, 0.105, 0.009), MATERIALS["tab"], 0.004, parent)
    for i, dy in enumerate((-0.078, 0.0, 0.078)):
        box(f"{name}_pin_{i}", (cx - 0.14, cy + dy, top + 0.007), (0.058, 0.020, 0.007), MATERIALS["tin"], parent)


def add_sot223(name, cx, cy, top, parent):
    cube(f"{name}_body", (cx, cy, top + 0.018), (0.055, 0.070, 0.018), MATERIALS["chip"], 0.006, parent)
    cube(f"{name}_tab", (cx + 0.075, cy, top + 0.005), (0.038, 0.055, 0.005), MATERIALS["tab"], 0.003, parent)
    for i, dy in enumerate((-0.045, 0.0, 0.045)):
        box(f"{name}_pin_{i}", (cx - 0.075, cy + dy, top + 0.004), (0.032, 0.012, 0.004), MATERIALS["tin"], parent)


def make_raised_pcb(parent):
    """Thin control board on the four black posts. +X is front; JSTs sit at the rear."""
    posts = ((-2.25, -1.02), (-2.25, 1.02), (0.60, -0.72), (0.60, 0.72))
    pcb_cx, pcb_cy = -0.825, 0.0
    half_x, half_y = 1.62, 1.18
    pcb_half_z = 0.012
    post_top = 2.70
    pcb_z = post_top + pcb_half_z
    top = pcb_z + pcb_half_z
    l298 = (0.08, 0.08)
    mosfets = ((-1.70, 0.48), (-1.70, 0.02), (-1.70, -0.44))
    regulator = (-0.52, 0.05)

    cube("Green_PCB_upper", (pcb_cx, pcb_cy, pcb_z), (half_x, half_y, pcb_half_z), MATERIALS["green"], 0.003, parent)
    for x, y in posts:
        cylinder(f"PCB_screw_{x}_{y}", (x, y, top + 0.018), 0.036, 0.028, MATERIALS["steel"], 16, parent=parent)

    add_soic("Upper_PCB_L298P", l298[0], l298[1], top, parent)
    add_sot223("Upper_PCB_U1", regulator[0], regulator[1], top, parent)
    for i, (mx, my) in enumerate(mosfets):
        add_d2pak(f"Upper_PCB_U{i + 2}", mx, my, top, parent)
        smd_passive(f"Upper_PCB_R{i * 2 + 1}", mx + 0.34, my + 0.08, top, parent, kind="resistor")
        smd_passive(f"Upper_PCB_R{i * 2 + 2}", mx + 0.34, my - 0.08, top, parent, kind="resistor")
        smd_passive(f"Upper_PCB_C{i * 2 + 1}", mx + 0.50, my + 0.08, top, parent, kind="cap")
        smd_passive(f"Upper_PCB_C{i * 2 + 2}", mx + 0.50, my - 0.08, top, parent, kind="cap")

    smd_passive("Upper_PCB_FB1", l298[0] - 0.12, l298[1] + 0.42, top, parent, kind="ferrite")
    smd_passive("Upper_PCB_FB2", l298[0] + 0.12, l298[1] + 0.42, top, parent, kind="ferrite")
    smd_passive("Upper_PCB_C7", l298[0] + 0.38, l298[1] + 0.16, top, parent, kind="cap")
    smd_passive("Upper_PCB_C8", l298[0] + 0.38, l298[1] - 0.10, top, parent, kind="cap")
    silk_text("Upper_PCB_L298P_lbl", "L298P", (l298[0], l298[1], top + 0.052), 0.085, parent)

    jst_z = top + 0.055
    for side in (-1, 1):
        cube(
            f"Upper_PCB_jst_{side}",
            (-2.26, side * 0.88, jst_z),
            (0.14, 0.12, 0.05),
            MATERIALS["connector"],
            0.012,
            parent,
        )
        cube(
            f"Upper_PCB_jst_mouth_{side}",
            (-2.39, side * 0.88, jst_z),
            (0.016, 0.08, 0.032),
            MATERIALS["recess"],
            0.004,
            parent,
        )
        box(f"Upper_PCB_jst_latch_{side}", (-2.26, side * 0.88, jst_z + 0.052), (0.055, 0.035, 0.01), MATERIALS["connector"], parent)
        for i in range(5):
            box(
                f"Upper_PCB_jst_pin_{side}_{i}",
                (-2.375, side * 0.88 + (i - 2) * 0.036, jst_z),
                (0.01, 0.007, 0.016),
                MATERIALS["tin"],
                parent,
            )
    cube("Upper_PCB_front_jst", (0.50, 0.12, jst_z), (0.12, 0.10, 0.045), MATERIALS["connector"], 0.012, parent)
    cube("Upper_PCB_front_jst_mouth", (0.61, 0.12, jst_z), (0.016, 0.07, 0.028), MATERIALS["recess"], 0.004, parent)
    box("Upper_PCB_front_jst_latch", (0.50, 0.12, jst_z + 0.048), (0.05, 0.03, 0.009), MATERIALS["connector"], parent)
    for i in range(4):
        box(
            f"Upper_PCB_front_jst_pin_{i}",
            (0.60, 0.12 + (i - 1.5) * 0.032, jst_z),
            (0.01, 0.007, 0.014),
            MATERIALS["tin"],
            parent,
        )


def make_posts(parent):
    green_top, deck_bottom = 1.016, 1.473
    brass_h = deck_bottom - green_top
    brass_z = (green_top + deck_bottom) * .5
    for x, y in ((-2.55, -1.05), (-2.55, 1.05), (0.0, -.95), (0.0, .95), (2.15, -.72), (2.15, .72)):
        cylinder(f"Brass_standoff_{x}_{y}", (x, y, brass_z), .049, brass_h, MATERIALS["brass"], 16, bevel=.004, parent=parent)
        top_fastener(f"Deck_standoff_screw_{x}_{y}", x, y, 1.528, parent, .044)
    for x, y in ((-2.25, -1.02), (-2.25, 1.02), (.60, -.72), (.60, .72)):
        cylinder(f"Tall_mount_{x}_{y}", (x, y, 2.114), .041, 1.172, MATERIALS["black"], 24, bevel=.004, parent=parent)
        cylinder(f"Mount_bore_{x}_{y}", (x, y, 2.707), .025, .012, MATERIALS["steel"], 16, bevel=.002, parent=parent)


def rod_between(name, start, end, radius, mat, parent):
    direction = Vector(end) - Vector(start)
    obj = cylinder(name, (Vector(start) + Vector(end)) * .5, radius, direction.length, mat, 20, bevel=.004, parent=parent)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def make_underbody(parent):
    cube("Battery_pack", (-.15, 0, .66), (1.40, .72, .22), MATERIALS["battery"], .08, parent)
    for x in (-.94, .65):
        cube(f"Battery_retaining_strap_{x}", (x, 0, .648), (.082, .733, .228), MATERIALS["strap"], .026, parent)
    # Two rear reduction motors; front axle is steered by a servo, not driven by
    # the cylindrical can that occupied this space in the old generic model.
    for side in (-1, 1):
        cylinder(f"Rear_motor_can_{side}", (-2.29, side * .79, .86), .206, .71, MATERIALS["motor"], 48, (radians(90), 0, 0), .014, parent)
        cylinder(f"Rear_gearbox_{side}", (-2.29, side * 1.18, .86), .219, .20, MATERIALS["steel"], 32, (radians(90), 0, 0), .016, parent)
        cylinder(f"Rear_encoder_cover_{side}", (-2.29, side * .41, .86), .161, .07, MATERIALS["black"], 32, (radians(90), 0, 0), .011, parent)
        cube(f"Rear_motor_saddle_{side}", (-2.29, side * .95, .65), (.24, .34, .07), MATERIALS["chassis_green"], .010, parent)
        # Rear green end angle joins the two rails without blocking the center
        # service hole in the lower tray.
        cube(f"Rear_mount_angle_{side}", (-2.70, side * .85, 1.12), (.028, .35, .15), MATERIALS["chassis_green"], .006, parent)
        for x in (-2.46, -2.13):
            top_fastener(f"Rear_motor_mount_{side}_{x}", x, side * .99, 1.017, parent, .039)

    cube("Steering_servo_body", (1.46, 0, 1.217), (.27, .41, .24), MATERIALS["black"], .030, parent)
    for side in (-1, 1):
        cube(f"Servo_mount_tab_{side}", (1.45, side * .47, 1.418), (.24, .082, .025), MATERIALS["black"], .011, parent)
        top_fastener(f"Servo_mount_screw_{side}", 1.44, side * .49, 1.443, parent, .037)
    cylinder("Servo_output_spindle", (1.47, 0, 1.483), .067, .064, MATERIALS["steel"], 24, bevel=.006, parent=parent)
    cube("Servo_horn", (1.68, 0, 1.489), (.23, .063, .017), MATERIALS["black"], .027, parent)
    rod_between("Servo_drag_link", (1.88, 0, 1.494), (2.03, .51, .858), .027, MATERIALS["steel"], parent)
    # Cross-car tie rod, ball joints and green kingpin supports are visible
    # through the front service opening and on both sides of the frame.
    rod_between("Steering_cross_tie_rod", (2.01, -1.37, .781), (2.01, 1.37, .781), .031, MATERIALS["steel"], parent)
    for side in (-1, 1):
        uv_sphere(f"Tie_rod_ball_joint_{side}", (2.01, side * 1.37, .781), (.075, .076, .061), MATERIALS["black"], parent)
        cylinder(f"Steering_pivot_bolt_{side}", (2.02, side * 1.37, .812), .043, .113, MATERIALS["steel"], 20, bevel=.004, parent=parent)
        cube(f"Front_kingpin_support_{side}", (2.34, side * 1.25, .912), (.155, .113, .207), MATERIALS["chassis_green"], .013, parent)
        # The yellow/red/brown servo cable is distinctive in the supplied photo.
        for index, key in enumerate(("wire_gold", "wire_red", "wire_brown")):
            curve(f"Front_servo_harness_{side}_{index}", [
                (1.52, side * .39, 1.06), (1.66, side * .91, .86 + index * .033),
                (2.11, side * 1.39, .91 + index * .033), (2.37, side * 1.22, 1.012 + index * .022),
            ], .012, MATERIALS[key], parent)


def build_vehicle():
    global MATERIALS, _PCB_FONT
    _PCB_FONT = None
    MATERIALS = {
        "black": material("Powder-coated black", (0.018, 0.020, 0.021), 0.42, 0.18),
        "recess": material("Vent recess", (0.002, 0.003, 0.003), 0.60),
        "green": material("PCB green", (0.018, 0.30, 0.145), 0.50, 0.0),
        "green_edge": material("PCB edge", (0.010, 0.14, 0.065), 0.46),
        "chassis_green": material("Anodized green chassis", (0.008, 0.235, 0.099), 0.41, 0.58),
        "wheel_black": material("Wheel rim polymer", (0.003, 0.004, 0.005), 0.34),
        "strap": material("Battery retaining strap", (0.012, 0.013, 0.014), 0.86),
        "rubber": material("Wheel rubber", (0.009, 0.010, 0.011), 0.72),
        "tread": material("Tread highlight", (0.020, 0.022, 0.024), 0.82),
        "foam": material("Front foam", (0.020, 0.021, 0.021), 0.94),
        "red": material("Anodized red", (0.52, 0.012, 0.008), 0.30, 0.62),
        "steel": material("Fastener steel", (0.38, 0.42, 0.46), 0.26, 0.78),
        "brass": material("Brass standoffs", (0.34, 0.22, 0.075), 0.34, 0.72),
        "chip": material("IC black", (0.010, 0.012, 0.014), 0.50),
        "silk": material("PCB silkscreen", (0.84, 0.86, 0.82), 0.52),
        "tin": material("HASL pad", (0.55, 0.56, 0.52), 0.22, 0.88),
        "tab": material("D2PAK tab", (0.62, 0.64, 0.66), 0.16, 0.94),
        "resistor": material("SMD resistor", (0.04, 0.04, 0.045), 0.48),
        "ceramic": material("SMD capacitor", (0.55, 0.36, 0.16), 0.38),
        "connector": material("Connector ivory", (0.67, 0.70, 0.68), 0.42),
        "copper": material("PCB copper", (0.34, 0.18, 0.05), 0.36, 0.55),
        "battery": material("Battery shell", (0.035, 0.040, 0.046), 0.52),
        "motor": material("Motor dark metal", (0.075, 0.080, 0.086), 0.34, 0.68),
        "antenna": material("Antenna black", (0.008, 0.009, 0.010), 0.48),
        "wire_black": material("Cable black", (0.007, 0.008, 0.009), 0.48),
        "wire_red": material("Cable red", (0.46, 0.015, 0.010), 0.44),
        "wire_gold": material("Cable yellow", (0.72, 0.32, 0.025), 0.44),
        "wire_brown": material("Cable brown", (0.080, 0.024, 0.010), 0.50),
    }

    root = bpy.data.objects.new("Vehicle_Root", None)
    root.empty_display_type = "PLAIN_AXES"
    bpy.context.collection.objects.link(root)

    make_lower_chassis(root)
    make_posts(root)
    make_raised_pcb(root)
    trapezoid_deck("Black_upper_deck", 1.50, MATERIALS["black"], root)
    make_bumper(root)
    make_underbody(root)
    plug_z = 2.80
    for side in (-1, 1):
        for wire in range(3):
            yy = side * (0.38 + wire * 0.09)
            mouth_y = side * (0.84 + wire * 0.03)
            curve(
                f"Rear_harness_{side}_{wire}",
                [
                    (-2.28, yy, 0.70),
                    (-2.88, yy * 0.55, 1.25),
                    (-2.55, mouth_y * 0.90, 2.40),
                    (-2.48, mouth_y, plug_z),
                    (-2.39, mouth_y, plug_z),
                ],
                0.016,
                MATERIALS["wire_black"],
                root,
                pin_end=True,
            )
    curve(
        "Front_header_lead",
        [
            (2.22, 0.22, 0.70),
            (1.42, 0.20, 1.68),
            (0.92, 0.14, plug_z),
            (0.61, 0.12, plug_z),
        ],
        0.015,
        MATERIALS["wire_black"],
        root,
        pin_end=True,
    )


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

    tire_radius = 0.75
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
