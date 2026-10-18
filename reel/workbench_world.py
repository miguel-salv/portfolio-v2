"""Shared, authored laboratory environment. No source CAD/photographs are changed."""
from pathlib import Path
from math import pi, sin, cos
import json, sys, bpy
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'reel'))

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def material(name, color, roughness=.5, metallic=0, texture=0):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if texture:
        coord = nodes.new('ShaderNodeTexCoord')
        noise = nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = texture
        noise.inputs['Detail'].default_value = 3
        bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .16
        bump.inputs['Distance'].default_value = .007 if texture < 100 else .0015
        links.new(coord.outputs['Object'], noise.inputs['Vector'])
        links.new(noise.outputs['Fac'], bump.inputs['Height']); links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat

def box(name, center, size, mat, bevel=.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = name; obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    if bevel:
        b = obj.modifiers.new('Physical edge', 'BEVEL'); b.width=bevel; b.segments=4
        n = obj.modifiers.new('Face normals', 'WEIGHTED_NORMAL'); n.keep_sharp=True
    return obj

def cylinder(name, center, radius, depth, mat, direction=None, vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center)
    obj=bpy.context.object; obj.name=name; obj.data.materials.append(mat)
    if direction: obj.rotation_euler=Vector(direction).to_track_quat('Z','Y').to_euler()
    b=obj.modifiers.new('Turned edge','BEVEL');b.width=min(.012,radius*.12);b.segments=3
    for p in obj.data.polygons:p.use_smooth=True
    obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return obj

def cable(name, points, radius, mat):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=24
    spline=data.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for point,co in zip(spline.bezier_points,points):
        point.co=co;point.handle_left_type=point.handle_right_type='AUTO'
    data.bevel_depth=radius;data.bevel_resolution=5
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);data.materials.append(mat)
    return obj

def bounds(objects):
    points=[o.matrix_world @ Vector(c) for o in objects if o.type=='MESH' for c in o.bound_box]
    return Vector([min(p[i] for p in points) for i in range(3)]),Vector([max(p[i] for p in points) for i in range(3)])

def import_board(path, width, location, turn=0):
    before=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects=[o for o in bpy.context.scene.objects if o not in before]
    if path.stem=='keychain':
        # D1-D5 are reverse-mount emitters: the visible front apertures are
        # 2.5mm along each rotated footprint's optical axis. Keep the diffuser
        # flush with the actual artwork openings, not on the rear package
        # origin (which would produce a false second lens on the front).
        lens=material('Keychain documented LED lens',(.55,.57,.26),.24)
        bsdf=lens.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Coat Weight'].default_value=.5
        for i,(x,y) in enumerate([(111.5,123.5),(131.5,81.7466),(147.4966,85.5),(186.5,114),(156,135.301343)],1):
            objects.append(cylinder(f'D{i} photo-referenced LED diffuser',(x/1000,-y/1000,.00160),.00198,.00012,lens))
    bpy.context.view_layer.update()
    low,high=bounds(objects);center=(low+high)/2
    # KiCad GLB uses Y-up; the importer converts it to Blender's Z-up.
    span=max(high.x-low.x,high.y-low.y)
    transform=Matrix.Translation(Vector(location)) @ Matrix.Rotation(turn,4,'Z') @ Matrix.Scale(width/span,4) @ Matrix.Translation(-center)
    roots=[o for o in objects if o.parent not in objects]
    for o in roots:o.matrix_world=transform @ o.matrix_world
    bpy.context.view_layer.update()
    return objects

def subject(name, capture_motion=False):
    """Return the real CAD or an explicitly photo-referenced presentation."""
    if name=='matcher':
        source=ROOT/'reel/render_monograph.py'; ns={'__file__':str(source)}
        exec(compile(source.read_text().split('outputs = [')[0],str(source),'exec'),ns)
        return ns['namespace']['meshes'],ns
    if name in ('vehicle','robot'):
        import render_story_world as story
        scene=story.build_moment(name,'landscape',False,False,64)
        scene.frame_set(22 if name=='vehicle' else 1)
        for o in list(scene.objects):
            if o.type in ('CAMERA','LIGHT') or o.name=='StudioGround':bpy.data.objects.remove(o,do_unlink=True)
        # Wires are curves and silkscreen labels are fonts. They are hardware,
        # so freeze and normalize them with the meshes instead of leaving
        # unscaled dangling cables behind at their source coordinates.
        objects=[o for o in scene.objects if o.type in ('MESH','CURVE','FONT')]
        bpy.context.view_layer.update();low,high=bounds(objects);center=(low+high)/2
        scale=5.8/max(high.x-low.x,high.y-low.y)
        transform=Matrix.Scale(scale,4) @ Matrix.Translation(-center)
        motion=[]
        if capture_motion:
            first,last=(22,48) if name=='vehicle' else (1,62)
            for frame in range(first,last+1):
                scene.frame_set(frame);bpy.context.view_layer.update()
                motion.append({o.name:{'matrix':transform @ o.matrix_world.copy(),'hidden':o.hide_render} for o in objects})
            scene.frame_set(first);bpy.context.view_layer.update()
        # Freeze the documentary mechanism pose, preserving all evaluated world transforms.
        transforms={o:transform @ o.matrix_world.copy() for o in objects}
        for o,matrix in transforms.items():o.animation_data_clear();o.parent=None;o.matrix_world=matrix
        from render_catalogue_loops import refine_materials
        refine_materials()
        if name=='robot':
            from robot_finish import apply_robot_finish
            apply_robot_finish(scene)
        return objects,{'motion':motion,'fps':30,'sourceFrames':[22,48] if name=='vehicle' else [1,62]}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if name=='keychain':
        objects=import_board(ROOT/'reel/workbench/keychain.glb',4.2,(0,0,0),-.12)
        # KiCad exports its viewer's default green soldermask/gold copper.
        # The documentary build is purple soldermask with a silver HASL star.
        # Change those physical finish materials without changing any artwork.
        for obj in objects:
            if obj.type!='MESH':continue
            for slot in obj.material_slots:
                mat=slot.material
                if not mat:continue
                mat.use_nodes=True
                bsdf=mat.node_tree.nodes.get('Principled BSDF')
                identity=obj.name+' '+obj.data.name
                if 'soldermask' in identity.lower() or mat.name.split('.')[0] in ('mat_15','mat_16'):
                    bsdf.inputs['Base Color'].default_value=(.085,.009,.06,1)
                    bsdf.inputs['Alpha'].default_value=1
                    bsdf.inputs['Roughness'].default_value=.37
                    bsdf.inputs['Coat Weight'].default_value=.16
                elif 'copper' in identity.lower() or mat.name.split('.')[0]=='mat_11':
                    bsdf.inputs['Base Color'].default_value=(.55,.58,.59,1)
                    bsdf.inputs['Metallic'].default_value=1
                    bsdf.inputs['Roughness'].default_value=.35
        # The two foot regions are separate mask islands in the actual board,
        # with the darker finish visible in the documentary photograph.
        feet=material('Photo-referenced dark purple foot mask',(.018,.002,.016),.42)
        front=next(o for o in objects if o.type=='MESH' and 'soldermask' in o.data.name and min(v.co.z for v in o.data.vertices)>0)
        # The visible foot artwork is absent from the exporter's opaque mask
        # treatment. These flat, photo-referenced ink shapes restore that finish;
        # their contours remain a reconstruction rather than original CAD.
        for index,(x,y,angle) in enumerate([(0.132,-.105,-.28),(0.161,-.108,.22)]):
            points=[]
            for i in range(64):
                t=2*pi*i/64;px=.0115*cos(t);py=.015*sin(t)
                points.append((x+px*cos(angle)-py*sin(angle),y+px*sin(angle)+py*cos(angle),.001575))
            mesh=bpy.data.meshes.new('Photo-referenced foot artwork');mesh.from_pydata(points,[],[tuple(range(64))]);mesh.materials.append(feet)
            obj=bpy.data.objects.new(f'Photographic foot finish {index+1}',mesh);bpy.context.collection.objects.link(obj);obj.matrix_world=front.matrix_world.copy();objects.append(obj)
        # Low-profile visible lenses follow committed D1–D5 footprint aperture centers (local offset 0, 2.5 mm, rotated with the footprint).
        # These are photograph-referenced caps, not missing supplier CAD.
        lens=material('Visible pale LED lens',(.63,.66,.29),.24)
        lens.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.22
        scale=front.matrix_world.to_scale().x
        for ref,x,y in [('D1',111.5,123.5),('D2',131.5,81.7466),('D3',147.4966,85.5),('D4',186.5,114),('D5',156,135.301343)]:
            location=front.matrix_world @ Vector((x*.001,-y*.001,.00176))
            bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=location)
            obj=bpy.context.object;obj.name=f'{ref} photo-referenced visible lens';obj.scale=(.0019*scale,.0019*scale,.00035*scale);obj.data.materials.append(lens)
            for face in obj.data.polygons:face.use_smooth=True
            objects.append(obj)
        return objects,{}
    pink=material('Companion printed pink enclosure',(.64,.24,.30),.38,texture=220)
    red=material('Companion red feet',(.48,.027,.043),.42,texture=160)
    black=material('Companion face and display',(.007,.009,.011),.22)
    white=material('Companion eye highlights',(.88,.84,.74),.44)
    box('Photo-referenced Kirby enclosure',(0,0,0),(3.25,1.55,3.4),pink,.24)
    box('Companion touchscreen',(0,-.787,-.65),(2.0,.035,1.16),black,.12)
    for x in (-.55,.55):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=(x,-.78,.78))
        o=bpy.context.object;o.name='Companion eye';o.scale=(.19,.038,.52);o.data.materials.append(black)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=(x-.012,-.817,.98))
        o=bpy.context.object;o.name='Companion eye highlight';o.scale=(.105,.018,.26);o.data.materials.append(white)
    for x in (-1.57,1.57):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=24,location=(x,0,.4))
        o=bpy.context.object;o.name='Companion side arm';o.scale=(.62,.55,.5);o.data.materials.append(pink)
    for x in (-1.1,1.1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=24,location=(x,-.2,-1.7))
        o=bpy.context.object;o.name='Companion foot';o.scale=(.62,.65,.34);o.data.materials.append(red)
    # Visible side opening and braided power lead are photo-referenced details;
    # their hidden wall construction is intentionally not represented as CAD.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,location=(1.626,.04,-.63))
    o=bpy.context.object;o.name='Companion side speaker opening';o.scale=(.016,.39,.64);o.data.materials.append(black)
    rubber=material('Companion braided power lead',(.018,.022,.02),.82,texture=300)
    cable('Companion power lead',[(-1.55,.5,-1.4),(-2.6,.65,-1.9),(-3.2,-.6,-1.9),(-2.7,-1.8,-1.9),(-3.6,-1.9,-1.9),(-3.9,-.6,-1.9),(-2.8,.0,-1.9)],.055,rubber)
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':
            for p in obj.data.polygons:p.use_smooth=True
    return [o for o in bpy.context.scene.objects if o.type in ('MESH','CURVE','FONT')],{}

def lighting(scene):
    for o in list(scene.objects):
        if o.type in ('LIGHT','CAMERA'):bpy.data.objects.remove(o,do_unlink=True)
    config=json.loads((ROOT/'reel/matcher_studio.json').read_text())
    world=bpy.data.worlds.new('Working bench — shared daylight');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(*config['worldColor'],1)
    world.node_tree.nodes['Background'].inputs[1].default_value=config['worldStrength']
    scene.world=world
    for light in config['lights']:
        data=bpy.data.lights.new(light['name'],'AREA');data.energy=light['power'];data.shape='RECTANGLE'
        data.size=light['width'];data.size_y=light['height'];data.color=light['color']
        obj=bpy.data.objects.new(light['name'],data);scene.collection.objects.link(obj);obj.location=light['position'];aim(obj,(0,0,0))

def environment(objects, night=False, pcb=True, subject_name='matcher'):
    bpy.context.view_layer.update();low,high=bounds(objects);floor=low.z-.045
    laminate=material('Graphite task-light bench' if night else 'Warm laboratory laminate',(.045,.055,.052) if night else (.64,.59,.49),.6,texture=140)
    mat=material('Carbon-dissipative green mat',(.032,.067,.054) if night else (.092,.15,.116),.84,texture=180)
    edge=material('ESD mat edge',(.025,.055,.044),.83)
    rubber=material('Lead insulation',(.012,.017,.019),.68,texture=180)
    metal=material('Nickel connector',(.55,.57,.55),.24,.94,texture=260)
    grip=material('Driver anodized grip',(.045,.075,.09),.38,.7,texture=120)
    paper=material('Printed schematic paper',(.84,.80,.70),.9)
    desk=box('Laboratory work surface',(0,0,floor-.16),(45,35,.3),laminate,.08)
    # An ESD mat is the actual working surface; its shallow tool channels have physical depth.
    box('ESD work mat',(.7,.5,floor+.025),(8.6,6.9,.05),mat,.16)
    for y in (3.42,3.58):box('Mat tool channel',(.7,y,floor+.054),(7.9,.035,.012),edge,.008)
    for x in (4.46,4.63):box('Mat parts channel',(x,2.35,floor+.054),(.035,1.8,.012),edge,.008)
    # Actual schematic artwork, mapped to paper rather than redrawn as decorative notation.
    sheet=box('Matcher schematic print',(-4.1,1.4,floor+.025),(2.8,3.5,.025),paper,.01)
    sheet.rotation_euler.z=-.12
    image_path=ROOT/('src/assets/keychain-schematic.jpg' if subject_name=='keychain' else 'src/assets/impedance-schematic.jpg')
    image=bpy.data.images.load(str(image_path),check_existing=True)
    ink=bpy.data.materials.new('Actual RF schematic');ink.use_nodes=True
    tex=ink.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
    bsdf=ink.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.92
    ink.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    bpy.ops.mesh.primitive_plane_add(size=1,location=(-4.1,1.4,floor+.04))
    o=bpy.context.object;o.name='Printed project schematic';o.scale=(2.55,3.17,1);o.rotation_euler.z=-.12;o.data.materials.append(ink)
    # Two real-scale connector leads form a quiet diagonal behind the mechanism.
    cable('Black connector lead',[(-3.5,4.8,floor+.09),(-1.7,4.5,floor+.1),(1.4,5.6,floor+.11),(4.4,4.3,floor+.10),(5.7,1.7,floor+.08)],.052,rubber)
    cable('Second connector lead',[(5.4,-3.9,floor+.08),(6.0,-2.8,floor+.09),(5.5,-1.7,floor+.1),(5.1,.1,floor+.08)],.046,rubber)
    for point,angle in [((-3.5,4.8,floor+.13),.7),((5.4,-3.9,floor+.13),-.4)]:
        axis=(cos(angle),sin(angle),0)
        cylinder('BNC connector body',point,.14,.44,metal,axis)
        p=Vector(point)+Vector(axis)*.25;cylinder('BNC collar',p,.18,.14,metal,axis)
        for d in (-.09,-.045,0,.045,.09):
            p=Vector(point)+Vector(axis)*d;cylinder('Connector knurl',p,.146,.013,metal,axis)
    driver=Vector((3.1,-3.4,floor+.15));direction=Vector((.8,.6,0))
    cylinder('Precision driver grip',driver,.13,1.12,grip,direction)
    cylinder('Precision driver shaft',driver+direction*.93,.035,.83,metal,direction)
    cylinder('Driver rotating cap',driver-direction*.60,.145,.16,metal,direction)
    for i in range(7):cylinder('Driver grip groove',driver+direction*(i*.12-.36),.134,.018,rubber,direction)
    if pcb and (ROOT/'reel/workbench/matcher-pcb.glb').exists():
        board=import_board(ROOT/'reel/workbench/matcher-pcb.glb',2.3,(-3.3,-2.7,floor+.11),.16)
        lo,_=bounds(board)
        for obj in [o for o in board if o.parent not in board]:obj.location.z+=floor+.075-lo.z
    return floor,desk

def configure(scene,samples=96):
    scene.render.engine='CYCLES';scene.cycles.samples=samples;scene.cycles.use_denoising=True
    scene.cycles.adaptive_threshold=.025;scene.cycles.max_bounces=8
    scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.use_persistent_data=True
    try:
        preferences=bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type='METAL';preferences.get_devices()
        gpu=[d for d in preferences.devices if d.type=='METAL']
        for d in preferences.devices:d.use=d in gpu
        if gpu:scene.cycles.device='GPU'
    except (TypeError,RuntimeError):pass
    scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=False
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.view_settings.exposure=0
    scene.render.use_compositing=False

def camera(scene,portrait=False,subject_name='matcher',close=False):
    data=bpy.data.cameras.new('Working bench camera');data.type='ORTHO';data.clip_end=100
    obj=bpy.data.objects.new('Working bench camera',data);scene.collection.objects.link(obj);scene.camera=obj
    target=Vector((0,0,1.8)) if portrait else Vector((-2,-1,.1))
    if close:target=Vector((0,0,.1))
    offset=Vector((8,-12,10 if portrait else 9))
    if subject_name=='companion':offset=Vector((6,-15,8))
    obj.location=target+offset;aim(obj,target)
    data.ortho_scale=11.1 if portrait else 14.0
    if close:data.ortho_scale=8.8
    return obj
