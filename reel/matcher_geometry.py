"""Photo reconstruction of the matcher's air-variable components.

Coordinates and mounting/shaft positions come from the existing Onshape CAD.
The large capacitor is salvaged: no manufacturer or exact plate count is known.
Its plate contour/count and the visible wire routes are silhouette estimates from
src/assets/impedance-cover.jpg, not dimensional or electrical design evidence.
The documented inductor has six turns of 16-AWG wire on an acetal core; the
existing CAD envelope is retained because the documented build revisions differ.
"""
from math import atan2, cos, sin, pi

import bpy
from mathutils import Vector

RF_DOCUMENTATION_URL = 'https://github.com/hacker-fab/gitbook/blob/main/fab-toolkit/deposition/diy-rf-sputtering-chamber-cmu/add-ons-and-wip/automated-impedance-matching.md'
RF_SCHEMATIC_URL = 'https://raw.githubusercontent.com/hacker-fab/gitbook/main/.gitbook/assets/image%20%283%29.png'


def bounds(obj):
    points = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
    return (Vector(tuple(min(p[i] for p in points) for i in range(3))),
            Vector(tuple(max(p[i] for p in points) for i in range(3))))


def mesh_object(name, vertices, faces, material, group='capacitors'):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj['exhibit_group'] = group
    return obj


def profile(name, center, points, thickness, material, group='capacitors'):
    """Extrude a genuine plate outline in XZ along the assembly's Y shaft."""
    vertices = [(x, y, z) for y in (-thickness / 2, thickness / 2) for x, z in points]
    n = len(points)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    obj = mesh_object(name, vertices, faces, material, group)
    obj.location = center
    return obj


def block(name, position, size, material, bevel=.0003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    obj['exhibit_group'] = 'capacitors'
    if bevel:
        mod = obj.modifiers.new('Small machined edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    return obj


def axle(name, position, radius, depth, material, group='capacitors', sides=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=depth,
                                      location=position, rotation=(pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    obj['exhibit_group'] = group
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4 and sides > 8
    return obj


def shaft_bore(support, x, z):
    """Cut the support's actual opening, leaving a visible inner bore at oblique views."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.00355,
                                      depth=support.dimensions.y + .008,
                                      location=(x, support.location.y, z),
                                      rotation=(pi / 2, 0, 0))
    cutter = bpy.context.object
    bpy.context.view_layer.objects.active = support
    mod = support.modifiers.new('Through shaft bearing bore', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    # Cut the un-bevelled support before its finishing modifier is evaluated.
    bpy.ops.object.modifier_move_up(modifier=mod.name)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def contact_bar(name, start, end, width, thickness, material):
    """Flat conductive lug in XZ, attached at both ends to fixed metal hardware."""
    start, end = Vector(start), Vector(end)
    assert abs(start.y - end.y) < 1e-8
    obj = block(name, (start + end) / 2, (width, thickness, (end - start).length),
                material, bevel=.0001)
    obj.rotation_euler.y = atan2(end.x - start.x, end.z - start.z)
    return obj


def solder_joint(name, position, material, radius=.0013):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8,
                                       radius=radius, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    # These small electrical contacts must survive the live export's body filter.
    obj['exhibit_group'] = 'capacitors'
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def washer(name, position, outer, inner, depth, material, sides=24):
    vertices = [(r * cos(2 * pi * i / sides), y, r * sin(2 * pi * i / sides))
                for y in (-depth / 2, depth / 2) for r in (outer, inner)
                for i in range(sides)]
    faces = []
    for i in range(sides):
        j = (i + 1) % sides
        faces += [(i, j, j + sides, i + sides),
                  (i + 2 * sides, i + 3 * sides, j + 3 * sides, j + 2 * sides),
                  (i, i + 2 * sides, j + 2 * sides, j),
                  (i + sides, j + sides, j + 3 * sides, i + 3 * sides)]
    obj = mesh_object(name, vertices, faces, material)
    obj.location = position
    for i, face in enumerate(obj.data.polygons):
        face.use_smooth = i % 4 >= 2
    return obj


def wire(name, points, radius, material, group='capacitors', sides=10):
    """Mesh tube, keeping curved wires in the indexed live export as well."""
    points = [Vector(p) for p in points]
    vertices = []
    for i, point in enumerate(points):
        tangent = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
        tangent.normalize()
        normal = tangent.cross(Vector((0, 0, 1)))
        if normal.length < .01:
            normal = tangent.cross(Vector((0, 1, 0)))
        normal.normalize()
        bitangent = tangent.cross(normal).normalized()
        vertices.extend(tuple(point + radius * (cos(2 * pi * j / sides) * normal +
                                                sin(2 * pi * j / sides) * bitangent))
                        for j in range(sides))
    faces = []
    for i in range(len(points) - 1):
        for j in range(sides):
            k = (j + 1) % sides
            faces.append((i * sides + j, i * sides + k,
                          (i + 1) * sides + k, (i + 1) * sides + j))
    faces.extend((tuple(range(sides - 1, -1, -1)),
                  tuple(range((len(points) - 1) * sides, len(points) * sides))))
    obj = mesh_object(name, vertices, faces, material, group)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return obj


def curved_wire(name, control_points, radius, material, group='capacitors'):
    # Centripetal-looking Catmull-Rom interpolation keeps RF harness bends soft
    # without a curve object that the existing mesh-only exporter would drop.
    controls = [Vector(p) for p in control_points]
    points = []
    for i in range(len(controls) - 1):
        a, b = controls[max(0, i - 1)], controls[i]
        c, d = controls[i + 1], controls[min(len(controls) - 1, i + 2)]
        for step in range(8):
            t = step / 8
            points.append(.5 * ((2 * b) + (-a + c) * t +
                                (2 * a - 5 * b + 4 * c - d) * t * t +
                                (-a + 3 * b - 3 * c + d) * t * t * t))
    points.append(controls[-1])
    return wire(name, points, radius, material, group)


def rotor_outline(radius, start, eccentric=0):
    # The logarithmic rotor's contour is wider on the side opposite its offset
    # shaft. Eccentricity is taken from the CAD, not an invented part dimension.
    points = [(0, 0)]
    for i in range(33):
        angle = start + pi * i / 32
        r = radius - eccentric * cos(angle)
        points.append((r * cos(angle), r * sin(angle)))
    return points


def side_stator_outline(half_width, height):
    # Flat upper ears and a curved lower perimeter; the open center relief
    # clears the rotating shaft rather than driving it through a filled disc.
    points = [(half_width, .0035), (half_width, 0)]
    points += [(half_width * cos(-pi * i / 32), height * sin(-pi * i / 32))
               for i in range(1, 33)]
    points += [(-half_width, .0035), (-.004, .0035)]
    points += [(.004 * cos(pi + pi * i / 16), .004 * sin(pi + pi * i / 16))
               for i in range(17)]
    points.append((half_width, .0035))
    return points[:-1]


def large_stator_outline(half_width, lower_height):
    # Broad flat upper edge and rounded lower cheeks visible in the photograph.
    # A small right-side shaft relief makes a C profile independent of the
    # small capacitors' semicircular outline.
    points = [(half_width, .018), (-half_width, .018), (-half_width, 0)]
    points += [(half_width * cos(pi + (pi - .20) * i / 32),
                lower_height * sin(pi + (pi - .20) * i / 32)) for i in range(1, 33)]
    points += [(.0038, -.0038)]
    points += [(.0046 * cos(-pi / 4 - 3 * pi / 2 * i / 24),
                .0046 * sin(-pi / 4 - 3 * pi / 2 * i / 24)) for i in range(25)]
    points += [(half_width, .0038)]
    return points


def reconstruct_capacitors(caps, materials, couplers):
    """Return the two motor pivots in world coordinates for the live renderer."""
    pivots, specs = [], []
    for index, old in enumerate(caps):
        low, high = bounds(old)
        center = (low + high) / 2
        bpy.data.objects.remove(old, do_unlink=True)
        prefix = f'C{index + 1}'
        if index == 2:
            # Original 50 mm-wide salvaged-capacitor support envelope retained.
            pivot = Vector((center.x, center.y, center.z))
            first, last = low.y + .011, high.y - .011
            plate_count, thickness = 31, .0005
            stator = large_stator_outline((high.x - low.x) * .475, .0195)
            rotor = rotor_outline(.0205, pi * 1.025)
            front, rear = low.y + .002, high.y - .003
            support = block(prefix + ' brown phenolic front support',
                            (center.x, front, center.z),
                            (high.x - low.x, .004, high.z - low.z), materials['phenolic'])
            shaft_bore(support, pivot.x, pivot.z)
            support = block(prefix + ' white rear insulating support',
                            (center.x, rear, center.z - .002),
                            ((high.x - low.x) * .98, .004, (high.z - low.z) * .92),
                            materials['white'])
            shaft_bore(support, pivot.x, pivot.z)
            rod_x, rod_z = .0218, center.z + .018
        else:
            # The couplers retain the source assembly's real axes. In particular,
            # the logarithmic capacitor shaft is 6.35 mm off its body center.
            coupler = min(couplers, key=lambda obj: abs(obj.matrix_world.translation.x - center.x))
            axis = coupler.matrix_world.translation
            pivot = Vector((axis.x, center.y, axis.z))
            pivots.append(pivot.copy())
            first, last = .01875, .06447  # Source CAD plate-body endpoints.
            plate_count, thickness = 19, .000508
            stator = side_stator_outline(.019, .019)
            eccentric = pivot.x - center.x
            rotor = rotor_outline(.0182, pi * .13, eccentric * .65)
            front, rear = .01304, .06650
            # The small Cardwell-style frames are metal in the photograph,
            # unlike the mismatched brown insulating blocks previously used.
            for label, y, depth in [('front', front, .003), ('rear', rear, .0025)]:
                support = block(prefix + f' metal {label} end frame',
                                (center.x, y, center.z),
                                (.0384, depth, .038), materials['frame'])
                shaft_bore(support, pivot.x, pivot.z)
            rod_x, rod_z = .0164, pivot.z - .006

        spacing = (last - first) / (plate_count - 1)
        for j in range(plate_count):
            y = first + spacing * j
            # The stationary body's center can differ from the rotor axis.
            stator_x = pivot.x if index == 2 else center.x
            profile(prefix + f' stator plate {j:02}', (stator_x, y, pivot.z),
                    stator, thickness, materials['plate'])
            if j < plate_count - 1:
                profile(prefix + f' rotor plate {j:02}',
                        (pivot.x, y + spacing / 2, pivot.z), rotor, thickness,
                        materials['plate'], f'rotor{index + 1}' if index < 2 else 'capacitors')

        axis_start = low.y if index == 2 else -.00525
        axis_end = rear + .006
        shaft_material = materials['brass'] if index == 2 else materials['frame']
        axle(prefix + ' continuous tuning shaft',
             (pivot.x, (axis_start + axis_end) / 2, pivot.z), .003175,
             axis_end - axis_start, shaft_material)
        for label, y, sign in [('front', front, -1), ('rear', rear, 1)]:
            face_y = y + sign * (.0038 if index == 2 else .0025)
            axle(prefix + f' {label} shaft bearing', (pivot.x, face_y, pivot.z),
                 .006, .003, shaft_material)
            washer(prefix + f' {label} shaft washer',
                   (pivot.x, face_y + sign * .002, pivot.z),
                   .0067, .0033, .0008, materials['frame'])
            axle(prefix + f' {label} hex bearing locknut',
                 (pivot.x, face_y + sign * .003, pivot.z), .0058, .0018,
                 shaft_material, sides=6)

        for sign in (-1, 1):
            x = center.x + sign * rod_x
            axle(prefix + ' stator tie rod', (x, (front + rear) / 2, rod_z),
                 .00125, rear - front + .01, materials['frame'])
            # Visible spacing sleeves give the plates their characteristic comb.
            for j in range(plate_count - 1):
                axle(prefix + f' stator spacer {sign} {j:02}',
                     (x, first + (j + .5) * spacing, rod_z), .00175,
                     spacing - thickness, materials['frame'], sides=12)
            for y, outward in [(front, -1), (rear, 1)]:
                washer(prefix + ' tie rod washer', (x, y + outward * .003, rod_z),
                       .0036, .00135, .0007, materials['frame'])
                axle(prefix + ' tie rod hex nut', (x, y + outward * .004, rod_z),
                     .003, .002, materials['brass'] if index == 2 else materials['frame'], sides=6)

        # Tabs and solder pads terminate the visible RF leads; they are not an
        # assertion about an otherwise unobservable rear-side circuit topology.
        if index == 2:
            for sign in (-1, 1):
                terminal = (center.x + sign * .019, front - .0028, center.z + .011)
                block(prefix + ' brass terminal tab', terminal,
                      (.0065, .001, .006), materials['brass'], bevel=.00015)
                # The photograph's front RF tabs belong to the fixed stator
                # junction. A conductive lug now joins each to its tie-rod nut;
                # they no longer look soldered only to the brown insulator.
                contact_bar(prefix + ' fixed stator terminal bridge', terminal,
                            (center.x + sign * rod_x, terminal[1], rod_z),
                            .003, .001, materials['brass'])
        else:
            inward = 1 if index == 0 else -1
            block(prefix + ' RF solder terminal',
                  (center.x + inward * .020, first + .006, pivot.z - .002),
                  (.005, .006, .0008), materials['frame'], bevel=.0001)
        specs.append({'component': prefix,
                      'sourceEnvelopeM': [list(low), list(high)],
                      'shaftM': list(pivot),
                      'statorPlateCountEstimate': plate_count,
                      'rotorPlateCountEstimate': plate_count - 1,
                      'plateThicknessEstimateM': thickness})
    return pivots, specs


def reconstruct_inductor(old, materials):
    low, high = bounds(old)
    center = (low + high) / 2
    bpy.data.objects.remove(old, do_unlink=True)
    length = high.x - low.x
    radius = min(high.y - low.y, high.z - low.z) / 2
    wire_radius = .000645  # 16 AWG bare conductor radius; documented gauge.
    core = axle('Inductor acetal core', center, radius - 2 * wire_radius,
                length, materials['core'], group='body', sides=32)
    core.rotation_euler = (0, pi / 2, 0)
    # Six turns are documented; winding pitch/diameter follow the retained CAD
    # envelope rather than applying another revision's 2-inch winding length.
    points = []
    steps = 6 * 32
    for i in range(steps + 1):
        phase = 2 * pi * 6 * i / steps
        points.append((low.x + .002 + (length - .004) * i / steps,
                       center.y + (radius - wire_radius) * cos(phase),
                       center.z + (radius - wire_radius) * sin(phase)))
    wire('Inductor six-turn enamelled copper winding', points, wire_radius,
         materials['copper'], group='body')

    # The inspected official RF schematic shows C3 in parallel with C2, and L1
    # running from the common C1/C2/C3 junction to GND. It does NOT put C3 and L1
    # in series. Both leads below terminate at fixed metal, never a motor shaft.
    # Physical lug positions and routes are reconstruction estimates: the photo
    # hides these joints beneath/behind the large capacitor.
    stator_rod = (.04625 - .0218, .07619, .0175 + .018)
    junction_terminal = (.0175, stator_rod[1], stator_rod[2])
    washer('Inductor RF junction tie-rod contact washer', stator_rod,
           .0035, .0013, .0008, materials['frame'])
    axle('Inductor RF junction tie-rod contact nut',
         (stator_rod[0], stator_rod[1] + .0012, stator_rod[2]),
         .0028, .0016, materials['brass'], sides=6)
    contact_bar('Inductor RF junction fixed stator lug', junction_terminal,
                stator_rod, .0035, .0008, materials['brass'])
    solder_joint('Inductor RF junction solder joint', junction_terminal,
                 materials['solder'])
    junction_lead = curved_wire('Inductor lead to C1 C2 C3 fixed RF junction',
                               [points[0], (.019, .076, -.011),
                                (.014, .077, -.004), (.014, .077, .018),
                                junction_terminal],
                               wire_radius, materials['copper'])

    # Ray-cast the actual source enclosure at the grounding point, so its lug
    # contacts metal even if the retained enclosure's floor thickness changes.
    ground_x, ground_y = .0785, .0760
    enclosure = bpy.context.scene.objects['Aluminum Box Bottom']
    enclosure_inverse = enclosure.matrix_world.inverted()
    ray_origin = enclosure_inverse @ Vector((ground_x, ground_y, .15))
    ray_direction = enclosure_inverse.to_3x3() @ Vector((0, 0, -1))
    hit, hit_position, _, _ = enclosure.ray_cast(ray_origin, ray_direction.normalized())
    if not hit:
        raise RuntimeError('Inductor ground terminal must contact the source aluminum enclosure')
    floor_z = (enclosure.matrix_world @ hit_position).z
    # The contact washer penetrates that metal surface by 0.2 mm; the stud
    # penetrates by 1.5 mm. No apparent solder-on-plastic attachment remains.
    stud = axle('Inductor chassis ground stud', (ground_x, ground_y, floor_z + .0015),
                .0015, .006, materials['frame'], sides=20)
    stud.rotation_euler = (0, 0, 0)
    ground_washer = washer('Inductor chassis ground contact washer',
                           (ground_x, ground_y, floor_z + .00025), .0035, .0016,
                           .0009, materials['frame'])
    ground_washer.rotation_euler = (pi / 2, 0, 0)
    nut = axle('Inductor chassis ground hex nut', (ground_x, ground_y, floor_z + .0016),
               .0028, .0018, materials['frame'], sides=6)
    nut.rotation_euler = (0, 0, 0)
    ground_terminal = (ground_x - .0025, ground_y, floor_z + .0011)
    solder_joint('Inductor chassis ground solder joint', ground_terminal,
                 materials['solder'])
    ground_lead = curved_wire('Inductor lead to aluminum chassis ground',
                             [points[-1], (.067, .075, center.z - .001),
                              (.071, .076, floor_z + .0025), ground_terminal],
                             wire_radius, materials['copper'])

    connection_specs = []
    for lead, coil_point, terminal, node, hardware in [
        (junction_lead, points[0], junction_terminal, 'C1/C2/C3_COMMON_JUNCTION',
         'fixed C3 stator tie rod and conductive lug'),
        (ground_lead, points[-1], ground_terminal, 'CHASSIS_GND',
         'bolted metal stud and washer contacting the aluminum enclosure floor'),
    ]:
        lead['rf_start_node'] = 'L1_WINDING'
        lead['rf_end_node'] = node
        connection_specs.append({'mesh': lead.name, 'windingEndpointM': list(coil_point),
                                 'terminalEndpointM': list(terminal), 'node': node,
                                 'terminalHardware': hardware, 'routeAccuracy': 'estimated',
                                 'topologySource': RF_SCHEMATIC_URL})
    return {'documentation': RF_DOCUMENTATION_URL, 'schematic': RF_SCHEMATIC_URL,
            'topology': 'L1 between the common C1/C2/C3 junction and chassis GND; C3 is parallel with C2.',
            'connections': connection_specs,
            'physicalAccuracy': 'Electrical nodes verified from the official RF schematic. Hidden lug locations and complete lead routes are estimates, not measured as-built wiring.'}


def photo_rf_harness(materials):
    # Two short visible red loops run through the gaps beside the central cap.
    # The photograph occludes other joints, so it is deliberately not completed
    # into a claimed exact wiring diagram.
    for sign in (-1, 1):
        central_x = .04625 + sign * .019
        gap_x = .04625 + sign * .034
        side_x = -.01625 + .020 if sign == -1 else .1024 - .020
        curved_wire('C3 RF red connection loop',
                    [(central_x, -.0105, .0285),
                     (central_x, -.0175, .012),
                     (gap_x, -.015, -.009),
                     (gap_x, .010, -.010),
                     (side_x, .020, .005)],
                    .00175, materials['red'])
        curved_wire('C3 RF black heat shrink termination',
                    [(central_x, -.0105, .0285),
                     (central_x, -.0145, .0225)],
                    .002, materials['shrink'])
        curved_wire('C3 RF exposed solder link',
                    [(side_x, .020, .005), (side_x, .02475, .006)],
                    .00065, materials['solder'])
        # Continue the red loop's conductor all the way into its fixed C3 tab.
        curved_wire('C3 RF front terminal solder connection',
                    [(central_x, -.0105, .0285), (central_x, -.00861, .0285)],
                    .0008, materials['solder'])
        solder_joint('C3 RF front terminal solder joint',
                     (central_x, -.00861, .0285), materials['solder'])
