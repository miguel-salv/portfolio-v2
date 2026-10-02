"""Build the chapter's lightweight CAD exhibit and rendered fallback.

blender --background --python reel/build_matcher_exhibit.py
Existing Onshape assembly; capacitor plate stacks reconstructed from Miguel's
build photograph inside the existing CAD envelope. No source .blend is changed.
"""
from pathlib import Path
from math import sin, cos, pi, radians
import bpy
import json
import struct
import subprocess
import sys
from mathutils import Vector, Matrix
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/assets/matcher'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'reel/models/impedance-studio.blend'))
scene = bpy.context.scene
scene.frame_set(1)
bpy.context.view_layer.update()

def mat(name, color, roughness=.4, metallic=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    return m

aluminum = mat('Exhibit — cast aluminum', (.40, .45, .47), .3, .75)
steel = mat('Exhibit — capacitor aluminum', (.63, .68, .70), .23, .8)
brass = mat('Exhibit — brass shaft', (.46, .31, .12), .28, .8)
blue = mat('Exhibit — printed blue housing', (.055, .20, .39), .47)
black = mat('Exhibit — motor body', (.035, .042, .044), .42, .25)
glass = mat('Exhibit — OLED glass', (.012, .032, .034), .2, .1)
insulator = mat('Exhibit — phenolic endplate', (.27, .075, .035), .48)

meshes = [o for o in scene.objects if o.type == 'MESH' and not any(t in o.name.lower() for t in ('floor', 'ground', 'catcher'))]
transforms = {o: o.matrix_world.copy() for o in meshes}
for o in list(scene.objects):
    if o not in meshes:
        bpy.data.objects.remove(o, do_unlink=True)
for o in meshes:
    o.animation_data_clear()
    o.parent = None
    o.matrix_world = transforms[o]
    if o.name.startswith('10-500PF Trim Cap'):
        # This source CAD envelope is absent from the documented physical build.
        o.hide_render = True
    if o.name.startswith('Aluminum Box'):
        o.data.materials.clear(); o.data.materials.append(aluminum)
    elif o.name.startswith('Main Electronics Housing'):
        for slot in o.material_slots:
            if slot.material and slot.material.name != 'HousingLines': slot.material = blue
    elif o.name.startswith('17HM15'):
        for slot in o.material_slots:
            if slot.material and slot.material.name == 'StepperBody': slot.material = black
            elif slot.material and slot.material.name == 'StepperSteel': slot.material = steel
    elif o.name.startswith('OLED Screen'):
        for slot in o.material_slots:
            if slot.material and slot.material.name == 'OledGlass': slot.material = glass

# The exported capacitor bodies are envelopes. Replace only those with an
# explicit photo-referenced rotor/stator construction inside the same bounds.
caps = [o for o in meshes if 'Variable Capacitor' in o.name]
cap_centers = []

def cube(name, position, size, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    o = bpy.context.object; o.name = name; o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    bevel = o.modifiers.new('Small machined edge', 'BEVEL'); bevel.width = .00035; bevel.segments = 2
    return o

def cylinder(name, position, radius, depth, material):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=position, rotation=(pi / 2, 0, 0))
    o = bpy.context.object; o.name = name; o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = True
    return o

def plate(name, center, radius, depth, start, material, rotor):
    # Extruded semicircular plate. The rotor has a real shaft-centered pivot.
    pts = [(0, 0)] + [(radius * cos(start + pi * i / 24), radius * sin(start + pi * i / 24)) for i in range(25)]
    vertices = [(x, y, z) for y in (-depth/2, depth/2) for x, z in pts]
    n = len(pts)
    faces = [tuple(range(n-1, -1, -1)), tuple(range(n, n*2))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], faces); mesh.update()
    o = bpy.data.objects.new(name, mesh); scene.collection.objects.link(o); o.location = center
    o.data.materials.append(material); o['exhibit_group'] = rotor
    return o

for index, old in enumerate(sorted(caps, key=lambda o: o.matrix_world.translation.x)):
    corners = [old.matrix_world @ Vector(p) for p in old.bound_box]
    low = Vector(tuple(min(p[i] for p in corners) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in corners) for i in range(3)))
    center = (low + high) / 2
    radius = min((high.x-low.x)*.48, (high.z-low.z)*.47)
    center.z = low.z + radius + .001
    cap_centers.append(center)
    bpy.data.objects.remove(old, do_unlink=True)
    length = (high.y-low.y)*.75
    count = 22
    spacing = length / count
    for j in range(count):
        y = center.y - length/2 + spacing*j
        plate(f'C{index+1} stator {j}', (center.x, y, center.z), radius, .00065, 0, steel, 'capacitors')
        plate(f'C{index+1} rotor {j}', (center.x, y+spacing/2, center.z), radius*.91, .00065, pi*.52, steel, f'rotor{index+1}')
    for side in (-1, 1):
        y = center.y + side*(length/2+.002)
        cube(f'C{index+1} phenolic end', (center.x, y, center.z), (radius*2.1, .003, radius*2.1), insulator)
    cylinder(f'C{index+1} shaft', center, .0025, length+.022, brass)
    for offset in (-.85, .85):
        cylinder(f'C{index+1} support rod', (center.x+offset*radius, center.y, center.z+radius*.65), .0012, length+.012, steel)

# Center and scale the hardware into a convenient exhibit coordinate system.
bpy.context.view_layer.update()
meshes = [o for o in scene.objects if o.type == 'MESH']
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
center = (low + high) / 2
scale = 5.5 / max(high.x-low.x, high.y-low.y)
normal = Matrix.Scale(scale, 4) @ Matrix.Translation(-center)
for o in meshes: o.matrix_world = normal @ o.matrix_world
cap_centers = [normal @ c for c in cap_centers]

def group(o):
    if o.get('exhibit_group'): return o['exhibit_group']
    n = o.name
    if n.startswith('17HM15') or 'Coupler' in n: return 'motors'
    if 'Housing' in n or 'OLED' in n or n.startswith('Board'): return 'control'
    if n.startswith('C1') or n.startswith('C2') or 'Capacitor' in n: return 'capacitors'
    return 'body'

# Export indexed geometry, grouped by material and functional assembly.
# Tiny PCB copper/components remain in the rendered still, not the live mesh.
packed = {}
deps = bpy.context.evaluated_depsgraph_get()
for o in meshes:
    if not o.name.startswith(('17HM15', 'Aluminum Box', 'Main Electronics', 'OLED Screen', 'Linear Cap', 'Log Cap', 'Back Mount', 'Coupler', 'Mounting Bracket', 'Inductor', 'Motor Spacer', 'C1', 'C2')):
        continue
    dims = o.dimensions
    if max(dims) < .09 and group(o) == 'body': continue
    if len(o.data.vertices) > 3500:
        decimate = o.modifiers.new('Exhibit transfer budget', 'DECIMATE')
        decimate.ratio = min(1, 3500 / len(o.data.vertices))
    ev = o.evaluated_get(deps); mesh = ev.to_mesh(); mesh.calc_loop_triangles()
    world = o.matrix_world; norm = world.to_3x3().inverted().transposed()
    for triangle in mesh.loop_triangles:
        m = o.data.materials[triangle.material_index] if triangle.material_index < len(o.data.materials) else aluminum
        key = (group(o), m.name if m else aluminum.name)
        bucket = packed.setdefault(key, {'positions': [], 'normals': [], 'indices': [], 'map': {}})
        for vi in triangle.vertices:
            vertex = mesh.vertices[vi]
            p = world @ vertex.co; n = (norm @ vertex.normal).normalized()
            ident = tuple(round(v, 5) for v in (*p, *n))
            if ident not in bucket['map']:
                bucket['map'][ident] = len(bucket['positions']) // 3
                bucket['positions'].extend(p); bucket['normals'].extend(n)
            bucket['indices'].append(bucket['map'][ident])
    ev.to_mesh_clear()

binary = bytearray(); manifest = {'parts': [], 'rotors': [list(c) for c in cap_centers]}
for (assembly, material_name), data in packed.items():
    m = bpy.data.materials.get(material_name) or aluminum
    p = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
    offsets = {}
    for label, fmt in [('positions', 'f'), ('normals', 'f'), ('indices', 'I')]:
        offsets[label] = [len(binary), len(data[label])]
        binary.extend(struct.pack('<'+fmt*len(data[label]), *data[label]))
    manifest['parts'].append({'group': assembly, **offsets,
        'color': list(p.inputs['Base Color'].default_value[:3]) if p else [.4,.45,.47],
        'roughness': p.inputs['Roughness'].default_value if p else .4,
        'metallic': p.inputs['Metallic'].default_value if p else .5})
(OUT / 'assembly.bin').write_bytes(binary)
(OUT / 'assembly.json').write_text(json.dumps(manifest, separators=(',', ':')))
print('Exhibit transfer:', len(binary), 'bytes;', len(packed), 'material groups', flush=True)
if '--export-only' in sys.argv:
    raise SystemExit(0)

# Restore the source detail for the photographed-style fallback, keeping the
# runtime geometry transfer budget independent of the still's rendering detail.
for o in meshes:
    for modifier in list(o.modifiers):
        if modifier.name == 'Exhibit transfer budget': o.modifiers.remove(modifier)

def aim(o, target): o.rotation_euler = (Vector(target)-o.location).to_track_quat('-Z', 'Y').to_euler()
world = bpy.data.worlds.new('Exhibit daylight'); world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.78,.83,.87,1)
world.node_tree.nodes['Background'].inputs[1].default_value = .5; scene.world = world
for name, pos, energy, size in [('Softbox', (3,-4,7), 650, 5), ('Fill', (-4,-1,3), 450, 5), ('Edge', (1,4,5), 900, 4)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.size=size
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos;aim(o,(0,0,0))
camera=bpy.data.objects.new('Exhibit camera',bpy.data.cameras.new('Exhibit camera'));scene.collection.objects.link(camera)
camera.data.type='ORTHO';camera.data.ortho_scale=7.4;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1440;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX'
for name, position in [('overview', (7,-10,7)), ('inside',(3,-5,11))]:
    camera.location=position;aim(camera,(0,0,0));scene.render.filepath=str(OUT/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    subprocess.run(['/opt/homebrew/bin/cwebp','-q','88',str(OUT/f'{name}.png'),'-o',str(OUT/f'{name}.webp')],check=True)
    (OUT/f'{name}.png').unlink()
    (OUT/f'{name}.webp.json').write_text(json.dumps({'prompt':'Authored Blender render from reel/build_matcher_exhibit.py. Existing impedance-studio.blend CAD with capacitor plates reconstructed from src/assets/impedance-cover.jpg within the source CAD envelope. Static chapter fallback; no source model changed.','createdAt':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
(OUT/'assembly.json.provenance.json').write_text(json.dumps({'source':'reel/models/impedance-studio.blend','reconstruction':'Photo-referenced capacitor plate stacks from src/assets/impedance-cover.jpg; within original CAD envelopes. Rotor angles illustrate the browser control loop, not live hardware.','generator':'reel/build_matcher_exhibit.py','createdAt':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
