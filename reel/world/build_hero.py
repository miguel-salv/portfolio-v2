#!/usr/bin/env python3
"""Author the first detailed lab rest from real CAD, at metric scale.

blender --background --python reel/world/build_hero.py -- --draft
blender --background --python reel/world/build_hero.py -- --final
No original source geometry, animatic, or production page is changed.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from math import cos, sin, pi, radians
from pathlib import Path
from random import Random
import shutil
import subprocess
import sys

import bpy
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / 'hero'
OUT.mkdir(exist_ok=True)
SPEC = json.loads((HERE / 'world.json').read_text())
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
DRAFT = '--final' not in args
rng = Random(274)


def material(name, color, roughness=.5, metal=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    mat.diffuse_color = (*color, 1)
    return mat


def noise_finish(mat, scale, strength, distance):
    n, l = mat.node_tree.nodes, mat.node_tree.links
    coord = n.new('ShaderNodeTexCoord')
    noise = n.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 2
    bump = n.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = distance
    l.new(coord.outputs['Object'], noise.inputs['Vector'])
    l.new(noise.outputs['Fac'], bump.inputs['Height'])
    l.new(bump.outputs['Normal'], n.get('Principled BSDF').inputs['Normal'])


def box(name, location, size, mat, bevel=.001):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o = bpy.context.object
    o.name = name
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Physical edge radius', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        mod = o.modifiers.new('Face normals', 'WEIGHTED_NORMAL')
    return o


def tube(name, points, radius, mat, cyclic=False):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth, data.bevel_resolution = radius, 3
    s = data.splines.new('POLY')
    s.points.add(len(points)-1)
    for p, v in zip(s.points, points):
        p.co = (*v, 1)
    s.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    mod = o.modifiers.new('Small edge highlight', 'BEVEL')
    mod.width, mod.segments = min(.0008, depth/4), 3
    o.modifiers.new('Face normals', 'WEIGHTED_NORMAL')
    return o


def text(name, body, position, size, mat, rotation=(0, 0, 0), align='LEFT'):
    d = bpy.data.curves.new(name, 'FONT')
    d.body, d.size, d.align_x = body, size, align
    d.space_character = 1.08
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    o.location, o.rotation_euler = position, rotation
    o.data.materials.append(mat)
    return o


def aim(o, target):
    o.rotation_euler = (Vector(target)-o.location).to_track_quat('-Z', 'Y').to_euler()


# Reuse the same photo-referenced capacitor, inductor and RF harness as the
# existing interactive exhibit, stopping BEFORE its presentation-unit rescale.
builder = ROOT / 'reel/build_matcher_exhibit.py'
namespace = {'__file__': str(builder)}
old_argv = sys.argv[:]
sys.argv = [str(builder), '--output-dir', str(OUT)]
exec(compile(builder.read_text().split('# Center and scale the hardware')[0], str(builder), 'exec'), namespace)
sys.argv = old_argv
scene = bpy.context.scene
hardware = [o for o in scene.objects if o.type == 'MESH']
bpy.context.view_layer.update()
points = [o.matrix_world @ Vector(c) for o in hardware for c in o.bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
center = Vector(((low.x+high.x)/2, (low.y+high.y)/2, low.z))
transform = Matrix.Translation(Vector((1.95, 4.45, .909))) @ Matrix.Rotation(radians(SPEC['animatic']['matcher_yaw_degrees']), 4, 'Z') @ Matrix.Translation(-center)
for o in hardware:
    o.matrix_world = transform @ o.matrix_world
    o['hero_source'] = 'existing CAD + existing photo-referenced reconstruction'
    if o.name.startswith(('Aluminum Box', 'Main Electronics Housing')):
        bevel = o.modifiers.new('Tactile housing edges', 'BEVEL')
        bevel.width, bevel.segments = .00018, 3
        o.modifiers.new('Machined face normals', 'WEIGHTED_NORMAL')
for name in ('Exhibit — cast aluminum', 'Exhibit — capacitor aluminum'):
    noise_finish(bpy.data.materials[name], 2200, .12, .000035)
noise_finish(bpy.data.materials['Exhibit — printed blue housing'], 6500, .12, .000055)
glass=bpy.data.materials['Exhibit — OLED glass'].node_tree.nodes.get('Principled BSDF')
glass.inputs['Roughness'].default_value=.10
glass.inputs['Metallic'].default_value=0
glass.inputs['Coat Weight'].default_value=.45
glass.inputs['Coat Roughness'].default_value=.055
# A sampled neutral material for small unpainted CAD hardware, retaining colored
# PCBs and actual part segmentation; no fake instrument numbers are added.

# Photographed CC0 oak provides actual grain/pores rather than synthetic bands.
# Source: https://polyhaven.com/a/oak_veneer_01 (Jenelle van Heerden, CC0).
wood=material('Bench / photographed oak veneer',(.25,.15,.07),.43)
n,l=wood.node_tree.nodes,wood.node_tree.links
coord=n.new('ShaderNodeTexCoord')
maps={}
for label,file in [('color','oak-diffuse.jpg'),('roughness','oak-roughness.jpg'),('normal','oak-normal.jpg'),('height','oak-height.jpg')]:
    image=bpy.data.images.load(str(OUT/'textures'/file),check_existing=True)
    if label!='color':image.colorspace_settings.name='Non-Color'
    node=n.new('ShaderNodeTexImage');node.image=image;node.extension='REPEAT';maps[label]=node
    l.new(coord.outputs['UV'],node.inputs['Vector'])
# A subtle oil finish darkens raw oak without replacing its photographed color.
tint=n.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=.42;tint.inputs[2].default_value=(.68,.56,.44,1)
l.new(maps['color'].outputs['Color'],tint.inputs[1]);l.new(tint.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
rough=n.new('ShaderNodeMapRange');rough.inputs['From Min'].default_value=0;rough.inputs['From Max'].default_value=1;rough.inputs['To Min'].default_value=.30;rough.inputs['To Max'].default_value=.52
l.new(maps['roughness'].outputs['Color'],rough.inputs['Value']);l.new(rough.outputs[0],n.get('Principled BSDF').inputs['Roughness'])
normal=n.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.45
l.new(maps['normal'].outputs['Color'],normal.inputs['Color'])
bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.20;bump.inputs['Distance'].default_value=.0002
l.new(maps['height'].outputs['Color'],bump.inputs['Height']);l.new(normal.outputs[0],bump.inputs['Normal']);l.new(bump.outputs[0],n.get('Principled BSDF').inputs['Normal'])
endgrain=wood.copy();endgrain.name='Bench / oak edge band with mapped cut'

mat = material('Bench / muted green antistatic rubber', (.020, .040, .028), .82)
noise_finish(mat, 4200, .18, .00006)
paper = material('Notebook / uncoated ivory', (.76, .72, .61), .85)
noise_finish(paper, 5000, .13, .000015)
grid = material('Mat / low contrast printed scale', (.09, .12, .10), .83)
ink = material('Notebook / graphite', (.06, .065, .058), .89)
chart_ink = material('Notebook / technical pencil', (.07, .08, .072), .9)
trace = material('Notebook / muted red pencil', (.20, .027, .012), .86)
black = material('Coax / matte elastomer', (.009, .013, .013), .46)
steel = material('Tools / brushed steel', (.55, .60, .60), .25, 1)
brass = material('Connector / brass', (.46, .28, .07), .25, 1)
ceramic = material('Mug / charcoal glaze', (.064, .078, .076), .22)
coffee = material('Mug / coffee', (.018, .009, .004), .14)
red = material('Probe / faded red rubber', (.34, .023, .014), .57)
wall = material('Room / mineral paint', (.55, .59, .57), .9)
floor = material('Room / epoxy floor', (.07, .09, .08), .68)
frame = material('Room / graphite steel', (.055, .065, .06), .54, .35)

# Keep the authored room/bench dimensions; stage small props for both crops.
box('Room floor', (4, 3.25, -.04), (8, 6.5, .08), floor)
box('North wall', (4, 6.56, 1.8), (8, .12, 3.6), wall)
box('East wall', (8.06, 3.25, 1.8), (.12, 6.5, 3.6), wall)
# West window is an actual opening. Its mullions and sill cast physical shadows.
box('West wall below window', (-.06, 3.25, .575), (.12, 6.5, 1.15), wall)
box('West wall above window', (-.06, 3.25, 3.275), (.12, 6.5, .65), wall)
box('West wall front', (-.06, 1.6, 2.05), (.12, 3.2, 1.8), wall)
box('West wall back', (-.06, 6.05, 2.05), (.12, .9, 1.8), wall)
for y in (3.2, 3.8, 4.4, 5.0, 5.6): box('Window frame', (0, y, 2.05), (.065, .06, 1.8), paper)
box('Window crossbar', (0, 4.4, 2.05), (.065, 2.4, .05), paper)
box('Window sill', (.04, 4.4, 1.13), (.22, 2.5, .035), paper)
bench=box('RF bench oak top', (1.65, 4.45, .875), (2.4, 1, .05), wood, .012)
bench.data.materials.append(endgrain)
# UVs are measured in meters against the material's 1.8 m source width.
# Long top/front fibers follow the bench; end caps use the cut's YZ plane.
uv=bench.data.uv_layers.active or bench.data.uv_layers.new(name='Metric oak cut')
for face in bench.data.polygons:
    axis=max(range(3),key=lambda i:abs(face.normal[i]))
    if axis==0:face.material_index=1
    for li in face.loop_indices:
        p=bench.matrix_world@bench.data.vertices[bench.data.loops[li].vertex_index].co
        axes=(p.y,p.x) if axis==2 else ((p.z,p.x) if axis==1 else (p.y,p.z))
        uv.data[li].uv=(axes[0]/1.8,axes[1]/1.8)
for x in (.57, 2.73):
    for y in (4.04, 4.86): box('RF bench leg', (x, y, .425), (.055, .055, .85), frame)
box('RF bench drawer', (2.3, 4.45, .74), (.64, .9, .22), wood, .005)
box('Drawer pull', (2.3, 3.983, .76), (.16, .018, .012), steel)
box('ESD mat', (1.75, 4.50, .903), (1.25, .88, .006), mat, .006)
# Printed lines are actual millimeter-scale marks on the physical cutting mat.
for i in range(63):
    x = 1.13+i*.02
    tube('Mat scale / x', [(x, 4.065, .90615), (x, 4.935, .90615)], .00013, grid)
for i in range(44):
    y = 4.065+i*.02
    tube('Mat scale / y', [(1.13, y, .90615), (2.37, y, .90615)], .00013, grid)
for i in range(0, 61, 5):
    text('Mat physical scale', str(i*20), (1.13+i*.02, 4.069, .9063), .0034, grid)

# An open, imperfectly flat notebook with a mathematically authored Smith chart.
notebook_before=set(scene.objects)
book = Vector((1.64, 4.27, .91))
cover = material('Notebook / cloth cover', (.10, .13, .115), .9)
box('Notebook cloth cover', book, (.185, .246, .012), cover, .003)
for i in range(9):
    box('Notebook page edges', book+Vector((0, 0, .006+i*.00025)), (.178, .238, .0002), paper, .0001)
for side in (-1, 1):
    o = box('Open notebook page', book+Vector((side*.043, 0, .009)), (.086, .237, .0013), paper, .0008)
    o.rotation_euler.y = side*radians(-1)
# Marks follow the 1° page tilt and sit on the paper. A fixed height left a gap, and the low window light turned every stroke into a shadow.
def page_ink(x, side, lift):
    theta = side * radians(-1)
    local_x = x - (1.64 + side * .043)
    return .919 + (-local_x * sin(theta) + .00065 * cos(theta)) + lift

def ruled(x0, x1, y, radius):
    tube('Notebook ruled paper', [(x0, y, page_ink(x0, -1, radius)), (x1, y, page_ink(x1, -1, radius))], radius, chart_ink)

for i in range(27):
    ruled(1.557, 1.632, 4.158+i*.0085, .000045)
# Gamma=(z-1)/(z+1): clipped resistance/reactance curves on the right page.
cx, cy, radius = 1.682, 4.283, .037
def on_chart(x, y, lift):
    return (x, y, page_ink(x, 1, lift))
for r in (0, .2, .5, 1, 2, 5):
    rr, c = 1/(1+r), r/(1+r)
    pts = [on_chart(cx+radius*(c+rr*cos(2*pi*i/160)), cy+radius*rr*sin(2*pi*i/160), .00013) for i in range(161)]
    tube('Smith / resistance circle', pts, .00013, chart_ink)
for reactance in (.2, .5, 1, 2, 5):
    for sign in (-1, 1):
        pts=[]
        for i in range(221):
            resistance = 10**(-3+6*i/220)
            gamma = (complex(resistance, sign*reactance)-1)/(complex(resistance, sign*reactance)+1)
            pts.append(on_chart(cx+radius*gamma.real, cy+radius*gamma.imag, .00011))
        tube('Smith / reactance arc', pts, .00011, chart_ink)
tube('Smith / real axis', [on_chart(cx-radius, cy, .00011), on_chart(cx+radius, cy, .00011)], .00011, chart_ink)
pts=[]
for i in range(180):
    t=i/179; mag=.83*(1-t)**1.25; a=2.3-2*pi*1.35*t
    pts.append(on_chart(cx+radius*mag*cos(a), cy+radius*mag*sin(a), .00045))
tube('Smith / illustrative pencil trace', pts, .00045, trace)
text('Notebook heading', 'RF matching', (1.645, 4.378, page_ink(1.645, 1, .00005)), .006, ink, rotation=(0, radians(-1), 0))
text('Notebook chart label', 'normalised impedance', (1.647, 4.229, page_ink(1.647, 1, .00005)), .0032, chart_ink, rotation=(0, radians(-1), 0))
text('Notebook note', 'match at centre', (1.559, 4.364, page_ink(1.559, -1, .00005)), .0041, ink, rotation=(0, radians(1), 0))
text('Notebook equation', 'G = (z - 1) / (z + 1)', (1.558, 4.347, page_ink(1.558, -1, .00005)), .0032, chart_ink, rotation=(0, radians(1), 0))

for o in set(scene.objects)-notebook_before:
    o.location.x+=.11
    if o.name.startswith(('Notebook ruled', 'Notebook heading', 'Notebook chart', 'Notebook note', 'Notebook equation', 'Smith /')):
        o.visible_shadow = False

# Hollow ceramic vessel; the handle joins the cup, coffee sits below the rim.
# Just behind the notebook, so the mug belongs to the working group.
mx, my, mz = 1.78, 4.48, .906
verts=[];faces=[]
profile=[(.024,0),(.029,.004),(.033,.075),(.0335,.083),(.0305,.084),(.030,.079),(.027,.009),(0,.009)]
for radius_, height in profile:
    verts += [(mx+radius_*cos(2*pi*i/72),my+radius_*sin(2*pi*i/72),mz+height) for i in range(72)]
for j in range(len(profile)-1):
    for i in range(72):
        a=j*72+i;b=j*72+(i+1)%72;faces.append((a,b,b+72,a+72))
mesh=bpy.data.meshes.new('Mug lathe');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('Hollow ceramic mug',mesh);scene.collection.objects.link(o);o.data.materials.append(ceramic)
for p in mesh.polygons:p.use_smooth=True
tube('Mug handle',[(mx-.031-.022*sin(pi*i/40),my,mz+.043+.026*cos(pi*i/40)) for i in range(41)],.0045,ceramic)
cylinder('Coffee surface',(mx,my,mz+.069),.029,.001,coffee)

# Share the film's rear-panel connection and supported route. The static opening
# needs only the rest pose, so it does not run the contact simulation.
helper_spec=importlib.util.spec_from_file_location('hero_lab_helpers',HERE/'build_lab.py')
hero_lab=importlib.util.module_from_spec(helper_spec);helper_spec.loader.exec_module(hero_lab)
rear=hero_lab.geometry().rear_coax_connection(hero_lab._lab_api())
spec=importlib.util.spec_from_file_location('lab_animatic',HERE/'build_animatic.py')
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
lab.SPEC['animatic']['coax_attachment_m']=rear['anchor_m']
coax_solver=hero_lab.load_py('hero_coax_route',HERE/'coax_bake.py')
coax,_,coax_radius=coax_solver.rest_configuration(lab)
tube('Connected coax loop',coax_solver.render_points(coax,coax_radius),coax_radius,black)
# Finished tools: tapered molded bodies, finger guards, ribbed strain reliefs,
# and relaxed cable curves. All parts sit on the same physical mat.
def segment_cylinder(name,start,end,radius,mat,vertices=48):
    start,end=Vector(start),Vector(end)
    o=cylinder(name,(start+end)/2,radius,(end-start).length,mat,vertices=vertices)
    o.rotation_euler=(end-start).to_track_quat('Z','Y').to_euler()
    return o

def cone_segment(name,start,end,r1,r2,mat,vertices=32):
    start,end=Vector(start),Vector(end)
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=(end-start).length,location=(start+end)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=(end-start).to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
    for face in o.data.polygons:face.use_smooth=len(face.vertices)==4
    return o

# Mat top is the box center plus half its thickness. Tools use this, not the coax height.
mat_top=.906
for x,y,angle,rubber in ((1.99,4.18,-.1,black),(2.05,4.17,-.18,red)):
    direction=Vector((sin(angle),cos(angle),0));start=Vector((x,y,mat_top+.0042))
    cone_segment('Probe / tapered grip',start,start+direction*.06,.0034,.0042,rubber)
    cone_segment('Probe / molded nose',start+direction*.06,start+direction*.086,.0042,.0022,rubber)
    for distance in (.018,.025,.032,.039,.046):
        segment_cylinder('Probe / grip ridge',start+direction*distance,start+direction*(distance+.0011),.0044,rubber)
    segment_cylinder('Probe / finger guard',start+direction*.061,start+direction*.063,.0045,rubber)
    segment_cylinder('Probe / steel contact',start+direction*.086,start+direction*.111,.0007,steel)
    cone_segment('Probe / strain relief',start-direction*.013,start,.0015,.0034,rubber)
    for distance in (.003,.006,.009):
        segment_cylinder('Probe / flexible relief rib',start-direction*(distance+.001),start-direction*distance,.0024,rubber)
    # The last drop used to cut through the oak edge. Hold the lead at probe height
    # until the front edge, then let it fall in front of the bench.
    controls=[start-direction*.013,start+Vector((.016,-.043,0)),start+Vector((.074,-.083,0)),start+Vector((.14,-.047,0)),start+Vector((.18,-.13,0)),start+Vector((.17,-.23,0)),start+Vector((.16,-.30,-.06))]
    tube('Probe / resting lead',[lab.spline(controls,i/150) for i in range(151)],.00135,rubber)
pencil=material('Pencil / graphite lacquer',(.026,.038,.033),.38)
pencil_wood=material('Pencil / exposed cedar',(.37,.19,.075),.7)
graphite=material('Pencil / writing graphite',(.025,.027,.026),.35,.15)
# Rest a hexagonal flat on the mat. The old center used the coax height, which
# left a pencil-width gap and a detached shadow.
barrel_r=.0028
start=Vector((1.87,4.09,mat_top+barrel_r*cos(radians(30))))
direction=Vector((.07,.15,0)).normalized();end=start+direction*.145
def seat_hex(obj):
    obj.rotation_euler=(obj.rotation_euler.to_matrix()@Matrix.Rotation(radians(30),3,'Z')).to_euler()
    return obj
seat_hex(segment_cylinder('Pencil / hexagonal barrel',start,end,barrel_r,pencil,vertices=6))
seat_hex(cone_segment('Pencil / sharpened cedar',end,end+direction*.012,barrel_r,.00055,pencil_wood,vertices=6))
seat_hex(cone_segment('Pencil / graphite tip',end+direction*.012,end+direction*.015,.00055,0,graphite))
seat_hex(segment_cylinder('Pencil / end cap',start-direction*.003,start,barrel_r,graphite,vertices=6))
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
lowest=min((ev.matrix_world@v.co).z for o in scene.objects if o.name.startswith('Pencil /') for ev in [o.evaluated_get(deps)] for mesh in [ev.to_mesh()] for v in mesh.vertices)
for o in scene.objects:
    if o.name.startswith('Pencil /'): o.evaluated_get(deps).to_mesh_clear()
gap=lowest-mat_top
print('PENCIL_GAP_MM',round(gap*1000,3),flush=True)
if not -.15e-3<=gap<=.2e-3: raise RuntimeError(f'pencil is not seated on the mat: {gap*1000:.3f} mm')
# Fine irregular wear belongs to the laminate, not an overlay on the page.
for i in range(20):
    x,y=1.21+rng.random()*.95,4.02+rng.random()*.76
    if 1.13<x<2.375 and 4.06<y<4.78:continue
    tube('Laminate fine wear',[(x,y,.9001),(x+.008+rng.random()*.022,y+.001,.9001)],.000025,grid)

# One fixed morning environment: cool open-sky window fill, a motivated low key and
# reflected oak. No per-object studio cutouts or screen-space fake shadows.
world=bpy.data.worlds.new('Lab / cool morning sky');world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.67,.80,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.04
scene.world=world

def area(name,location,target,power,size,color,shape='DISK',height=None):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;d.shape=shape;d.color=color
    if height is not None:d.size_y=height
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=location;aim(o,target)
    return o

area('West window / open sky',(-.16,4.4,2.13),(1.85,4.4,.93),60,2.4,(.78,.87,1),'RECTANGLE',1.7)
area('West window / low morning key',(-3,3.4,4.1),(1.90,4.45,.91),1400,.12,(1,.93,.83),'RECTANGLE',.18)
area('Room / soft ceiling bounce',(2.1,4.25,3.35),(1.8,4.4,.9),25,3,(1,.94,.85))
d=bpy.data.lights.new('Morning / sun through west window','SUN');d.energy=.35;d.angle=radians(.6);d.color=(1,.90,.75)
o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.rotation_euler=Vector((1,.20,-.61)).to_track_quat('-Z','Y').to_euler()

camera=bpy.data.objects.new('Opening / corrected southeast camera',bpy.data.cameras.new('Opening camera'))
scene.collection.objects.link(camera);scene.camera=camera
hero=next(p for p in SPEC['camera']['poses'] if p['id']=='hero')
camera.location=hero['position_m'];aim(camera,hero['target_m']);camera.data.lens=hero['lens_mm'];camera.data.sensor_width=36;camera.data.shift_x=hero['shift_x']
camera.data.clip_start=.005;camera.data.clip_end=100
camera.data.dof.use_dof=True;camera.data.dof.focus_distance=(Vector((1.95,4.45,.95))-camera.location).length;camera.data.dof.aperture_fstop=9
scene.render.engine='CYCLES';scene.cycles.samples=40 if DRAFT else 192
scene.cycles.use_denoising=True;scene.cycles.adaptive_threshold=.025 if DRAFT else .008
scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=4;scene.cycles.glossy_bounces=4
def enable_cycles_gpu():
    prefs=bpy.context.preferences.addons['cycles'].preferences
    for backend in ('METAL','OPTIX','CUDA'):
        try:
            prefs.compute_device_type=backend
            prefs.get_devices()
        except (TypeError,RuntimeError):
            continue
        devices=[d for d in prefs.devices if d.type==backend]
        if not devices:
            continue
        for d in prefs.devices:
            d.use=d.type==backend
        scene.cycles.device='GPU'
        print('CYCLES_DEVICE',backend,[d.name for d in devices],flush=True)
        return
    print('CYCLES_DEVICE','CPU',flush=True)
enable_cycles_gpu()
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.use_persistent_data=True;scene.render.resolution_percentage=100
scene.render.film_transparent=False;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.image_settings.color_depth='8'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.75
scene.render.image_settings.compression=35
scene.render.use_file_extension=True
scene['authored_scene']='One-world lab / opening look development';scene['hardware_scale']=1.0
scene['note']='Authored scene. Capacitor shapes/plate counts and RF wire paths reuse existing photo estimates, not surveyed component geometry.'
report={'created_at':datetime.now(timezone.utc).isoformat(),'stage':'draft' if DRAFT else 'finished-opening-for-review','source':'reel/models/impedance-studio.blend; reel/build_matcher_exhibit.py; reel/matcher_geometry.py; world.json','source_fingerprint':hashlib.sha256(Path(__file__).read_bytes()+(HERE/'world.json').read_bytes()).hexdigest(),'hardware_meshes':len(hardware),'hardware_scale':1,'source_extent_m':list(high-low),'matcher_yaw_degrees':SPEC['animatic']['matcher_yaw_degrees'],'geometry_note':scene['note'],'material_sources':[{'name':'Oak Veneer 01','author':'Jenelle van Heerden','url':'https://polyhaven.com/a/oak_veneer_01','license':'CC0','manifest':'hero/textures/oak-files.json'}],'render_settings':{'engine':'CYCLES','samples':scene.cycles.samples,'denoising':True,'display_transform':'AgX - Medium High Contrast','exposure':scene.view_settings.exposure},'renders':[]}
def webp_encoder():
    mac=Path('/opt/homebrew/bin/cwebp')
    if mac.is_file():
        return str(mac)
    found=shutil.which('cwebp')
    if not found:
        raise RuntimeError('cwebp not found')
    return found
webp_bin=None if DRAFT else webp_encoder()
for ident,resolution in [('landscape',(960,600) if DRAFT else (1920,1200)),('portrait',(540,864) if DRAFT else (1000,1600))]:
    if ident=='portrait':
        camera.location=Vector(hero['position_m'])+Vector((.04,.05,0));aim(camera,Vector(hero['target_m'])+Vector((.04,.05,0)))
        camera.data.lens=42;camera.data.shift_x=.04;camera.data.shift_y=.18
        camera.data.dof.focus_distance=(Vector((1.95,4.45,.95))-camera.location).length
    scene.render.resolution_x,scene.render.resolution_y=resolution
    bpy.context.view_layer.update()
    points=[world_to_camera_view(scene,camera,o.matrix_world@Vector(c)) for o in hardware for c in o.bound_box]
    envelope=[min(p.x for p in points),min(p.y for p in points),max(p.x for p in points),max(p.y for p in points)]
    if not all(p.z > 0 and 0 <= p.x <= 1 and 0 <= p.y <= 1 for p in points):
        raise RuntimeError(f'{ident} crops hardware: {envelope}')
    path=OUT/f'{ident}{"-draft" if DRAFT else ""}.png';scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    if not DRAFT:
        subprocess.run([webp_bin,'-quiet','-q','94',str(path),'-o',str(OUT/f'{ident}.webp')],check=True)
    entry={'id':ident,'resolution':list(resolution),'camera_position_m':list(camera.location),'quaternion_wxyz':list(camera.rotation_euler.to_quaternion()),'lens_mm':camera.data.lens,'shift_xy':[camera.data.shift_x,camera.data.shift_y],'hardware_aperture_xy_minmax':envelope}
    report['renders'].append(entry)
    path.with_suffix(path.suffix+'.json').write_text(json.dumps({'origin':'Authored Cycles render from build_hero.py using existing metric CAD + photo-reference reconstruction. Photographed CC0 oak material, authored rubber and ceramic and mathematically drawn notebook Smith chart. Illustrative scene and pencil trace, not documentary test results. No generated concept pixels or replacement hardware photos.','source':report['source'],'created_at':report['created_at']},indent=2)+'\n')
    if not DRAFT:
        (OUT/f'{ident}.webp.json').write_text(path.with_suffix(path.suffix+'.json').read_text())
    print('HERO_RENDER_COMPLETE',ident,flush=True)
camera.location=hero['position_m'];aim(camera,hero['target_m']);camera.data.lens=hero['lens_mm'];camera.data.shift_x=hero['shift_x'];camera.data.shift_y=0
camera.data.dof.focus_distance=(Vector((1.95,4.45,.95))-camera.location).length
scene.render.resolution_x,scene.render.resolution_y=1920,1200
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opening-bench.blend'))
(OUT/('draft.json' if DRAFT else 'render.json')).write_text(json.dumps(report,indent=2)+'\n')
print('LAB_HERO_COMPLETE',json.dumps({'hardware_meshes':len(hardware),'stage':report['stage']}),flush=True)
