"""Photo-referenced robot surface finish, applied after the catalogue setup.

Only material nodes, material face assignments and existing studio lights are
changed. Meshes, modifiers, transforms, camera keys and mechanism keys remain
the authored scene. All detail is procedural shading, never displacement.
"""
from math import pi

import bpy
from mathutils import Vector


def _surface(mat, roughness, specular=.45, metallic=0, coat=0):
    """Replace the generic normal noise with one material-specific node tree."""
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    output = nodes.get('Material Output')
    for node in list(nodes):
        if node not in (bsdf, output):
            nodes.remove(node)
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    for name, value in {
        'Roughness': roughness, 'Specular IOR Level': specular,
        'Metallic': metallic, 'Coat Weight': coat, 'Coat Roughness': .28,
        'Transmission Weight': 0, 'Anisotropic': 0,
    }.items():
        bsdf.inputs[name].default_value = value
    return bsdf


def _noise(mat, scale, stretch=(1, 1, 1), detail=2):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coordinates = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = stretch
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = detail
    noise.inputs['Roughness'].default_value = .6
    links.new(coordinates.outputs['Object'], mapping.inputs[0])
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    return noise.outputs['Fac']


def _range(mat, source, low, high, target):
    node = mat.node_tree.nodes.new('ShaderNodeMapRange')
    node.inputs['To Min'].default_value = low
    node.inputs['To Max'].default_value = high
    mat.node_tree.links.new(source, node.inputs['Value'])
    mat.node_tree.links.new(node.outputs['Result'], target)


def _bump(mat, source, strength, distance, bsdf):
    bump = mat.node_tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = distance
    mat.node_tree.links.new(source, bump.inputs['Height'])
    mat.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def _pigment(mat, source, light, dark, bsdf):
    ramp = mat.node_tree.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].color = (*light, 1)
    mat.node_tree.links.new(source, ramp.inputs['Fac'])
    mat.node_tree.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])


def _layers(mat, period):
    """Object-space height bands follow each printed part as it animates."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coordinates = nodes.new('ShaderNodeTexCoord')
    separate = nodes.new('ShaderNodeSeparateXYZ')
    frequency = nodes.new('ShaderNodeMath')
    frequency.operation = 'MULTIPLY'
    frequency.inputs[1].default_value = 2*pi/period
    sine = nodes.new('ShaderNodeMath')
    sine.operation = 'SINE'
    links.new(coordinates.outputs['Object'], separate.inputs['Vector'])
    links.new(separate.outputs['Z'], frequency.inputs[0])
    links.new(frequency.outputs[0], sine.inputs[0])
    return sine.outputs[0]


def _plywood(mat, edge=False):
    bsdf = _surface(mat, .58 if edge else .51, .36)
    if edge:
        # The five veneers are visible on the existing side faces; no stacked
        # meshes, added thickness or changed chassis silhouette is required.
        layers = _layers(mat, .034)
        _pigment(mat, layers, (.42, .32, .20), (.26, .18, .10), bsdf)
        _bump(mat, layers, .08, .00035, bsdf)
    else:
        # Birch veneer is pale and quiet, with long irregular fibers rather
        # than the uniformly coarse bump previously applied to every surface.
        grain = _noise(mat, 7, (1, .025, 2), 3)
        _pigment(mat, grain, (.73, .65, .50), (.62, .53, .39), bsdf)
        _range(mat, grain, .48, .59, bsdf.inputs['Roughness'])
        _bump(mat, grain, .08, .0007, bsdf)


def _printed(mat, roughness, specular=.43):
    bsdf = _surface(mat, roughness, specular)
    layers = _layers(mat, .012)
    # Normal-only relief keeps the print texture below the silhouette level.
    _bump(mat, layers, .095, .00022, bsdf)
    _range(mat, _noise(mat, 95), roughness-.035, roughness+.035,
           bsdf.inputs['Roughness'])


def _light(scene, name, position, energy, width, height, color):
    obj = scene.objects.get(name)
    if not obj or obj.type != 'LIGHT':
        return
    obj.location = position
    obj.rotation_euler = (Vector((0, 0, 1))-obj.location).to_track_quat('-Z', 'Y').to_euler()
    obj.data.energy = energy
    obj.data.shape = 'RECTANGLE'
    obj.data.size, obj.data.size_y = width, height
    obj.data.color = color


def _metal_parts(scene):
    """Differentiate stamped connector plating from machined aluminum cans."""
    tin = bpy.data.materials.get('Robot tin plated connectors')
    aluminum = bpy.data.materials.get('Robot satin aluminum cans')
    for name, mat in (('Robot tin plated connectors', tin),
                      ('Robot satin aluminum cans', aluminum)):
        if mat is None:
            mat = bpy.data.materials.new(name)
            mat.use_nodes = True
        if name == 'Robot tin plated connectors':
            tin = mat
            bsdf = _surface(mat, .23, .5, metallic=.98)
            bsdf.inputs['Base Color'].default_value = (.53, .57, .60, 1)
            bsdf.inputs['Anisotropic'].default_value = .12
        else:
            aluminum = mat
            bsdf = _surface(mat, .32, .5, metallic=1)
            bsdf.inputs['Base Color'].default_value = (.59, .61, .63, 1)
    connector_prefixes = ('PiUSB', 'PiEthernet', 'PiHDMI', 'UnoUSB',
                          'PowerBankUSB', 'WebcamUSB', 'USBPlug', 'UnoPlug')
    for obj in scene.objects:
        target = None
        if obj.name.startswith('MotorCap') or obj.name == 'PiSoCCan':
            target = aluminum
        elif obj.name.startswith(connector_prefixes) and '_slot' not in obj.name:
            target = tin
        if target:
            for slot in obj.material_slots:
                if slot.material and slot.material.name in (
                        'Brushed steel', tin.name, aluminum.name):
                    slot.material = target


def apply_robot_finish(scene):
    """Refine the robot after refine_materials() and catalogue light creation."""
    materials = {slot.material.name: slot.material for obj in scene.objects
                 for slot in obj.material_slots if slot.material}
    for name, mat in materials.items():
        if not mat.use_nodes or not mat.node_tree.nodes.get('Principled BSDF'):
            continue
        # Match source labels explicitly: e.g. printed PLA differs from ABS
        # motor shells, PCB coating, vulcanized tires and flexible PVC cable.
        if name in ('Warm cream plywood', 'Cream top veneer'):
            _plywood(mat)
        elif name == 'Plywood laminated edge':
            _plywood(mat, edge=True)
        elif name in ('Wheel rubber', 'Raised tread'):
            bsdf = _surface(mat, .79, .34)
            bsdf.inputs['Base Color'].default_value = (.018, .020, .023, 1)
            texture = _noise(mat, 170)
            _range(mat, texture, .75, .83, bsdf.inputs['Roughness'])
            _bump(mat, texture, .12, .0012, bsdf)
        elif name in ('Utility yellow', 'Hub inset yellow'):
            bsdf = _surface(mat, .31 if name == 'Utility yellow' else .39, .48)
            # Keep the photographed yellow pigment; ABS gets a broad satin
            # reflection, unlike the softer black tire immediately beside it.
            texture = _noise(mat, 260)
            _range(mat, texture, .29, .36, bsdf.inputs['Roughness'])
            _bump(mat, texture, .035, .00018, bsdf)
        elif name in ('Printed PLA', 'Collection arm black'):
            _printed(mat, .62 if name == 'Printed PLA' else .49)
            mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.018, .021, .027, 1)
        elif name in ('Satin black housings', 'Power bank shell', 'Power bank top'):
            _printed(mat, .43 if name == 'Satin black housings' else .52, .42)
            pigment = (.015, .017, .020) if name == 'Satin black housings' else (.023, .026, .031)
            mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*pigment, 1)
        elif name == 'Charcoal polymer':
            bsdf = _surface(mat, .54, .39)
            bsdf.inputs['Base Color'].default_value = (.030, .035, .041, 1)
            _range(mat, _noise(mat, 220), .50, .56, bsdf.inputs['Roughness'])
        elif name in ('Main circuit board', 'Arduino Uno blue', 'L298N red'):
            bsdf = _surface(mat, .30, .49, coat=.20)
            if name == 'Main circuit board':
                bsdf.inputs['Base Color'].default_value = (.025, .105, .058, 1)
        elif name == 'Screw terminal blue':
            _surface(mat, .37, .44)
        elif name == 'Brushed steel':
            bsdf = _surface(mat, .25, .5, metallic=.95)
            bsdf.inputs['Anisotropic'].default_value = .24
            brushing = _noise(mat, 90, (1, 12, 1))
            _range(mat, brushing, .22, .31, bsdf.inputs['Roughness'])
            _bump(mat, brushing, .035, .00015, bsdf)
        elif name == 'Dark anodized metal':
            _surface(mat, .34, .5, metallic=.82)
        elif name in ('White cable', 'Red cable', 'Orange cable', 'Black cable'):
            _surface(mat, .40 if name == 'White cable' else .44, .43)
        elif name == 'Camera glass':
            bsdf = _surface(mat, .065, .5, coat=.20)
            bsdf.inputs['IOR'].default_value = 1.49
        elif name == 'Neutral bottle':
            bsdf = _surface(mat, .26, .48, coat=.13)
            bsdf.inputs['IOR'].default_value = 1.46

    _metal_parts(scene)

    # Split the already-existing chassis faces into veneer and laminated edge.
    chassis = scene.objects.get('CreamChassis')
    if chassis and chassis.type == 'MESH':
        veneer = bpy.data.materials.get('Cream top veneer')
        edge = bpy.data.materials.get('Plywood laminated edge')
        if veneer and edge:
            _plywood(veneer)
            _plywood(edge, edge=True)
            for mat in (veneer, edge):
                if mat.name not in chassis.data.materials:
                    chassis.data.materials.append(mat)
            slots = {mat.name: index for index, mat in enumerate(chassis.data.materials)}
            for face in chassis.data.polygons:
                face.material_index = slots[veneer.name if face.normal.z > .5 else edge.name]

    # Place the key on the camera side, across the body: controlled highlights
    # describe black arms and connector metal without gray-washing the rubber.
    _light(scene, 'Catalogue key', (-3.5, 7.0, 9.5), 1750, 5, 4, (1, .97, .93))
    _light(scene, 'Catalogue fill', (8, 3, 5.5), 500, 7, 5, (.92, .96, 1))
    _light(scene, 'Catalogue edge', (-2, -6, 7.5), 1100, 4, 1.8, (1, 1, 1))
    background = scene.world.node_tree.nodes.get('Background') if scene.world else None
    if background:
        background.inputs['Color'].default_value = (.78, .80, .82, 1)
        background.inputs['Strength'].default_value = .14
    scene.view_settings.exposure = .1
