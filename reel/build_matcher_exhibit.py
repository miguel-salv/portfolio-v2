"""Build the chapter's lightweight CAD exhibit and rendered fallback.

blender --background --python reel/build_matcher_exhibit.py
Existing Onshape assembly; distinct capacitor plate stacks, supports and visible
RF harness reconstructed from Miguel's build photograph. No source .blend changes.
Use --output-dir /tmp/matcher-review for a non-shipping geometry export/render.
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
sys.path.insert(0, str(ROOT / 'reel'))
from matcher_geometry import (reconstruct_capacitors, reconstruct_inductor, photo_rf_harness,
                              RF_DOCUMENTATION_URL, RF_SCHEMATIC_URL)

OUT = Path(sys.argv[sys.argv.index('--output-dir') + 1]) if '--output-dir' in sys.argv else ROOT / 'public/assets/matcher'
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

aluminum = mat('Exhibit — cast aluminum', (.58, .62, .64), .24, 1)
steel = mat('Exhibit — capacitor aluminum', (.75, .78, .80), .16, 1)
brass = mat('Exhibit — brass shaft', (.62, .40, .14), .2, 1)
blue = mat('Exhibit — printed blue housing', (.025, .13, .29), .38)
black = mat('Exhibit — motor body', (.035, .042, .044), .42, .25)
glass = mat('Exhibit — OLED glass', (.012, .032, .034), .2, .1)
insulator = mat('Exhibit — brown phenolic support', (.20, .044, .024), .5)
white_insulator = mat('Exhibit — white rear insulating support', (.8, .79, .74), .44)
frame = mat('Exhibit — capacitor frame and hardware', (.47, .50, .52), .28, 1)
copper = mat('Exhibit — enamelled copper winding', (.37, .115, .035), .30, .85)
acetal = mat('Exhibit — acetal inductor core', (.12, .13, .12), .48)
rf_red = mat('Exhibit — red RF insulation', (.38, .016, .009), .38)
shrink = mat('Exhibit — black heat shrink', (.018, .021, .023), .53)
solder = mat('Exhibit — RF solder joint', (.44, .46, .47), .30, 1)

meshes = [o for o in scene.objects if o.type == 'MESH' and not any(t in o.name.lower() for t in ('floor', 'ground', 'catcher'))]
transforms = {o: o.matrix_world.copy() for o in meshes}
for o in list(scene.objects):
    if o not in meshes:
        bpy.data.objects.remove(o, do_unlink=True)
for o in meshes:
    o.animation_data_clear()
    o.parent = None
    o.matrix_world = transforms[o]
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

# The exported capacitor bodies are envelopes. Reconstruct each family inside
# its mounting bounds, retaining the real offset motor axes from the source CAD.
caps = sorted([o for o in meshes if 'Variable Capacitor' in o.name], key=lambda o: o.matrix_world.translation.x)
caps += [o for o in meshes if o.name.startswith('10-500PF Trim Cap')]
materials = {'plate': steel, 'frame': frame, 'brass': brass, 'phenolic': insulator,
             'white': white_insulator, 'copper': copper, 'core': acetal,
             'red': rf_red, 'shrink': shrink, 'solder': solder}
couplers = [o for o in meshes if o.name.startswith('Coupler')]
cap_centers, reconstruction_specs = reconstruct_capacitors(caps, materials, couplers)
rf_connection_specs = []
for old in [o for o in scene.objects if o.name == 'Inductor']:
    rf_connection_specs.append(reconstruct_inductor(old, materials))
photo_rf_harness(materials)

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

# Preserve curved bore normals and actual chamfers in the interactive export.
# A 35-degree crease preserves flat machined faces while smoothing bores.
for o in meshes:
    if o.name.startswith(('Aluminum Box', 'Main Electronics Housing', '17HM15', 'Back Mount', 'Coupler')):
        for polygon in o.data.polygons: polygon.use_smooth = True
        o.data.set_sharp_from_angle(angle=radians(35))
        bevel = o.modifiers.new('Studio edge chamfer', 'BEVEL')
        bevel.width = .00025; bevel.segments = 3; bevel.limit_method = 'ANGLE'
        bevel.angle_limit = radians(35)
        weighted = o.modifiers.new('Machined face normals', 'WEIGHTED_NORMAL')
        weighted.keep_sharp = True; weighted.weight = 50

def group(o):
    if o.get('exhibit_group'): return o['exhibit_group']
    n = o.name
    if n.startswith('17HM15') or 'Coupler' in n: return 'motors'
    if 'Housing' in n or 'OLED' in n or n.startswith('Board'): return 'control'
    if n.startswith(('C1', 'C2', 'C3')) or 'Capacitor' in n: return 'capacitors'
    return 'body'

# Export indexed geometry, grouped by material and functional assembly.
# Tiny PCB copper/components remain in the rendered still, not the live mesh.
packed = {}
deps = bpy.context.evaluated_depsgraph_get()
for o in meshes:
    if not o.name.startswith(('17HM15', 'Aluminum Box', 'Main Electronics', 'OLED Screen', 'Linear Cap', 'Log Cap', 'Back Mount', 'Coupler', 'Mounting Bracket', 'Inductor', 'Motor Spacer', 'C1', 'C2', 'C3')):
        continue
    dims = o.dimensions
    if max(dims) < .09 and group(o) == 'body': continue
    if len(o.data.vertices) > 18000 and not o.name.startswith(('Aluminum Box', 'Main Electronics Housing')):
        decimate = o.modifiers.new('Exhibit transfer budget', 'DECIMATE')
        decimate.ratio = min(1, 18000 / len(o.data.vertices))
    ev = o.evaluated_get(deps); mesh = ev.to_mesh(); mesh.calc_loop_triangles()
    world = o.matrix_world; norm = world.to_3x3().inverted().transposed()
    for triangle in mesh.loop_triangles:
        m = o.data.materials[triangle.material_index] if triangle.material_index < len(o.data.materials) else aluminum
        key = (group(o), m.name if m else aluminum.name)
        bucket = packed.setdefault(key, {'positions': [], 'normals': [], 'uvs': [], 'indices': [], 'map': {}})
        for vi, li in zip(triangle.vertices, triangle.loops):
            vertex = mesh.vertices[vi]
            p = world @ vertex.co; n = (norm @ mesh.corner_normals[li].vector).normalized()
            ident = tuple(round(v, 5) for v in (*p, *n))
            if ident not in bucket['map']:
                bucket['map'][ident] = len(bucket['positions']) // 3
                bucket['positions'].extend(p); bucket['normals'].extend(n)
                # Planar projection in model units keeps the authored finish fine.
                axis = max(range(3), key=lambda a: abs(n[a]))
                axes = [a for a in range(3) if a != axis]
                bucket['uvs'].extend((p[axes[0]] * 3, p[axes[1]] * 3))
            bucket['indices'].append(bucket['map'][ident])
    ev.to_mesh_clear()

binary = bytearray(); manifest = {'parts': [], 'rotors': [list(c) for c in cap_centers],
    'reconstruction': {'reference': 'src/assets/impedance-cover.jpg',
        'components': reconstruction_specs,
        'rfConnections': rf_connection_specs,
        'accuracy': 'Mounting envelopes and motor axes follow source CAD. Salvaged central capacitor outline, plate count and visible wire routes are photo estimates; manufacturer and exact dimensions are unknown.'}}
for (assembly, material_name), data in packed.items():
    m = bpy.data.materials.get(material_name) or aluminum
    p = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
    offsets = {}
    for label, fmt in [('positions', 'f'), ('normals', 'f'), ('uvs', 'f'), ('indices', 'I')]:
        offsets[label] = [len(binary), len(data[label])]
        binary.extend(struct.pack('<'+fmt*len(data[label]), *data[label]))
    manifest['parts'].append({'group': assembly, 'material':material_name, **offsets,
        'color': list(p.inputs['Base Color'].default_value[:3]) if p else [.4,.45,.47],
        'roughness': p.inputs['Roughness'].default_value if p else .4,
        'metallic': p.inputs['Metallic'].default_value if p else .5})
(OUT / 'assembly.bin').write_bytes(binary)
(OUT / 'assembly.json').write_text(json.dumps(manifest, separators=(',', ':')))
(OUT/'assembly.json.provenance.json').write_text(json.dumps({'source':'reel/models/impedance-studio.blend','reconstruction':'Distinct air-variable capacitor contours, mixed brown front/white rear supports on the salvaged center unit, RF lead loops and six-turn inductor with both leads continuously attached. Official RF schematic verifies L1 between the common C1/C2/C3 junction and chassis GND, with C3 parallel to C2. Conductive lugs contact the fixed stator rod and ray-cast aluminum enclosure floor. Mounting envelopes and offset motor axes follow source CAD. Plate counts, contour, plate thickness, hidden lug positions and wire routes are reconstruction estimates; the salvaged component has no confirmed manufacturer. Rotor angles illustrate the browser control loop, not live hardware.','documentation':RF_DOCUMENTATION_URL,'rfSchematic':RF_SCHEMATIC_URL,'connectionSpecs':rf_connection_specs,'generator':'reel/build_matcher_exhibit.py; reel/matcher_geometry.py','createdAt':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
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
