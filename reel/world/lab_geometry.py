"""Geometry and contact for the detailed lab. All distances are metres in world space.

This module changes meshes and rig stops, not camera paths or the lighting schedule.
The eyes use the actual paper artwork photographed on the Companion.
"""
import math

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def mesh_object(name, vertices, faces, collection, material=None, parent=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if material:
        mesh.materials.append(material)
    if parent:
        obj.parent = parent
    return obj


def discard_named(prefixes):
    for obj in list(bpy.data.objects):
        if obj.name.startswith(tuple(prefixes)):
            bpy.data.objects.remove(obj, do_unlink=True)


def keychain_finish(lab, objects, board, holder):
    """Use real CAD mask/silk boundaries, with the photographed dark foot finish.

    A rectangle cut from the perspective photo cannot cover the separate mask,
    exposed copper and silk layers. Keep those layers as actual materials.
    The two foot outlines are traced from the owner's existing cover photo and
    registered to the five LED centres and mounting hole, not raster textures.
    """
    import numpy as np
    from mathutils.geometry import tessellate_polygon
    def linear(rgb):
        return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
    purple=lab.material('Keychain / purple solder mask',linear((.30,.12,.285)),.43)
    dark=lab.material('Keychain / dark purple feet',linear((.16,.095,.18)),.47)
    silver=lab.material('Keychain / silver plated star',(.57,.59,.57),.38)
    lab.principled(silver).inputs['Metallic'].default_value=.8
    silk=lab.material('Keychain / white silkscreen',(.79,.81,.76),.58)
    edge=lab.material('Keychain / cut laminate edge',(.12,.075,.045),.72)
    for obj in objects:
        if obj.type!='MESH':continue
        name=obj.data.name
        material=None
        if 'soldermask' in name:material=purple
        elif 'silkscreen' in name:
            material=silk;obj.hide_viewport=False;obj.hide_render=False
        elif any(token in name for token in ('_copper','_pad','_via')):material=silver
        elif obj is board:material=edge
        if material:
            obj.data.materials.clear();obj.data.materials.append(material)
            for face in obj.data.polygons:face.material_index=0
    # Projective registration removes the photo's perspective. Coordinates are
    # photo pixels (top-left origin) and source KiCad millimetres.
    source=[(x,y) for _ref,x,y in lab.keychain_light_windows()]+[(150.5,65.75)]
    photographed=[(386,876),(454,503),(618,485),(935,618),(764,860),(563,354)]
    a=[];b=[]
    for (x,y),(u,v) in zip(source,photographed):
        a.extend(((x,y,1,0,0,0,-u*x,-u*y),(0,0,0,x,y,1,-v*x,-v*y)));b.extend((u,v))
    h=np.r_[np.linalg.lstsq(a,b,rcond=None)[0],1].reshape(3,3)
    inverse=np.linalg.inv(h)
    outlines=[[(385,550),(424,546),(467,560),(509,588),(539,623),(548,662),
               (538,698),(512,720),(480,730),(444,724),(406,708),(376,683),
               (355,650),(346,619),(348,589),(362,566)],
              [(668,513),(700,511),(728,530),(746,568),(753,610),(748,650),
               (736,688),(717,714),(691,729),(665,731),(637,722),(617,700),
               (605,671),(604,639),(612,595),(628,553),(648,524)]]
    z=max(v.co.z for v in board.data.vertices)+.000105
    transform=holder.matrix_world.inverted()@board.matrix_world
    for side,outline in zip(('left','right'),outlines):
        dense=[]
        for i in range(len(outline)):
            p0,p1,p2,p3=[np.array(outline[j%len(outline)],float) for j in (i-1,i,i+1,i+2)]
            for j in range(5):
                t=j/5
                uv=.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
                point=inverse@np.r_[uv,1];x,y=point[:2]/point[2]
                dense.append(transform@Vector((x/1000,-y/1000,z)))
        triangles=tessellate_polygon([dense])
        # tessellate_polygon returns indices in Blender 5.2.
        if triangles and isinstance(triangles[0][0],int):faces=triangles
        else:
            indices={tuple(v):i for i,v in enumerate(dense)}
            faces=[tuple(indices[tuple(v)] for v in triangle) for triangle in triangles]
        foot=mesh_object('Keychain / '+side+' dark foot finish',dense,faces,board.users_collection[0],dark,holder)
        objects.append(foot)
    return {'finish':'native purple mask, silver star, dark purple feet, white CAD silkscreen',
            'photo_rectangular_texture':False}


def world_vertices(obj):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh=evaluated.to_mesh()
    points=[evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


def world_bvh(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    tree = BVHTree.FromPolygons(points, [tuple(poly.vertices) for poly in mesh.polygons])
    evaluated.to_mesh_clear()
    return tree


def floor_contacts(holder, kind):
    """Use rendered rubber/tread vertices, excluding the robot's separate bottle."""
    import numpy as np
    if kind=='robot':
        wheels=[obj for obj in holder.children_recursive if obj.name.startswith('Tread_')]
    else:
        wheels=[obj for obj in holder.children_recursive
                if obj.name.startswith('Wheel_') and obj.name.endswith('_rubber')]
    if len(wheels)!=4:raise RuntimeError(f'Expected four {kind} wheel supports')
    depsgraph=bpy.context.evaluated_depsgraph_get();contacts={}
    for obj in wheels:
        evaluated=obj.evaluated_get(depsgraph);mesh=evaluated.to_mesh()
        points=np.empty(len(mesh.vertices)*3,dtype=np.float64);mesh.vertices.foreach_get('co',points)
        transform=evaluated.matrix_world
        heights=points.reshape((-1,3))@np.array(transform[2][:3])+transform[2][3]
        contacts[obj.name]=float(heights.min());evaluated.to_mesh_clear()
    return contacts


def ground_floor_device(holder, kind, keep_bottle=False):
    """Seat tires at their current roll phase, retaining the bottle's floor contact."""
    import numpy as np
    # These baked support meshes have no deforming modifiers. Cache their
    # evaluated local vertices, then compose the authored parent transforms.
    # Re-evaluating the full room after every tiny support adjustment is costly.
    global _support_mesh_cache
    if '_support_mesh_cache' not in globals():_support_mesh_cache={}
    matrices={}
    def matrix(obj):
        if obj.name not in matrices:
            if obj.constraints:raise RuntimeError('Ground support has a constrained parent: '+obj.name)
            matrices[obj.name]=(matrix(obj.parent)@obj.matrix_parent_inverse@obj.matrix_basis
                                if obj.parent else obj.matrix_basis.copy())
        return matrices[obj.name]
    def local_points(obj):
        key=(getattr(obj,'session_uid',obj.as_pointer()),getattr(obj.data,'session_uid',obj.data.as_pointer()))
        if key not in _support_mesh_cache:
            evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
            points=np.empty(len(mesh.vertices)*3,dtype=np.float64);mesh.vertices.foreach_get('co',points)
            _support_mesh_cache[key]=points.reshape((-1,3));evaluated.to_mesh_clear()
        return _support_mesh_cache[key]
    def points(obj):
        transform=np.array(matrix(obj));return local_points(obj)@transform[:3,:3].T+transform[:3,3]
    wheels=[obj for obj in holder.children_recursive if obj.name.startswith('Tread_')] if kind=='robot' else [
        obj for obj in holder.children_recursive if obj.name.startswith('Wheel_') and obj.name.endswith('_rubber')]
    if len(wheels)!=4:raise RuntimeError(f'Expected four {kind} wheel supports')
    def contacts():return {obj.name:float(points(obj)[:,2].min()) for obj in wheels}
    before=contacts()
    holder.location.z-=min(before.values())
    matrices.clear()
    if kind=='robot' and keep_bottle:
        bottle=bpy.data.objects['BottleRoot']
        bottom=min(float(points(obj)[:,2].min()) for obj in bottle.children_recursive if obj.type=='MESH')
        bottle.location+=matrix(bottle.parent).inverted().to_3x3()@Vector((0,0,-bottom))
        matrices.clear()
        center=Vector(points(bpy.data.objects['BottleLabel']).mean(axis=0))
        for side in ('Left','Right'):
            arm=bpy.data.objects[side+'ArmPivot']
            arm.location.z=(matrix(arm.parent).inverted()@center).z
    matrices.clear()
    return {'before_m':before,'after_m':contacts()}


def static_support_contacts():
    """Check the bearing parts of furniture and loose bench/shelf props."""
    cache={};rows=[]
    def parts(name):
        found=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render
               and (o.name==name or o.name.startswith(name+'.'))]
        if not found:raise RuntimeError('Missing support audit object: '+name)
        return sorted(found,key=lambda o:o.name)
    def bounds(obj):
        if obj.name not in cache:
            pts=world_vertices(obj)
            cache[obj.name]=([min(p[i] for p in pts) for i in range(3)],
                             [max(p[i] for p in pts) for i in range(3)])
        return cache[obj.name]
    def check(obj,support,z=None):
        low,high=bounds(obj);slo,shi=bounds(support)
        overlap=all(min(high[i],shi[i])-max(low[i],slo[i])>-.0001 for i in (0,1))
        rows.append({'object':obj.name,'support':support.name,'gap_m':low[2]-(shi[2] if z is None else z),'xy_overlap':overlap})
    def group(name,support,z=None):
        sup=bpy.data.objects[support]
        for obj in parts(name):check(obj,sup,z)
    for name in ('RF bench leg','Context / personal desk leg','Context / stool foot',
                 'Context / cart caster','Context / cabinet toe','Room detail / floor lamp weighted base',
                 'Room detail / woven chair rug','Room detail / rug binding','Detail / corner plant saucer'):
        group(name,'Room floor')
    for obj in bpy.context.scene.objects:
        if obj.name.startswith(('Context / RF bin rack foot ','Context / pedestal leveling foot ')):
            check(obj,bpy.data.objects['Room floor'])
    group('Context / chair caster','Room detail / woven chair rug')
    for leg,foot in zip(parts('Context / stool leg'),parts('Context / stool foot')):check(leg,foot)
    group('Context / service worktop','Context / service cabinet')
    group('Context / shelf upright','Context / service worktop')
    group('Context / instrument body','Context / service worktop')
    group('Context / wire spool cheek','Context / service worktop')
    for i in range(6):group(f'Context / parts bin {i} bottom','Context / shelf')
    for i in range(3):
        group(f'Context / upper bin {i} bottom','Context / shelf.001')
        group(f'Context / under-bench bin {i} bottom','Context / RF lower shelf')
    group('Context / cart components bottom','Context / cart tray')
    group('Context / manual spine','Context / upper bin 0 bottom')
    for i,obj in enumerate(parts('Context / spare lead coil')):check(obj,bpy.data.objects[f'Context / upper bin {i+1} bottom'])
    group('Room detail / book cover','Room detail / book ledge')
    covers=parts('Room detail / stacked book cover')
    check(covers[0],bpy.data.objects['Room detail / book ledge']);check(covers[2],covers[1])
    for name in ('Feet:1','Feet:2','Keychain support / front foot -1','Keychain support / front foot 1',
                 'Keychain support / folded rear stand','Desk lamp / rubber sole','Context / desk tool tray'):
        group(name,'Context / personal desk top')
    pages=parts('Context / desk paper stack')
    for i,obj in enumerate(pages):check(obj,pages[i-1] if i else bpy.data.objects['Context / personal desk top'])
    group('ESD mat','RF bench oak top')
    for name in ('Hollow ceramic mug','Pencil / hexagonal barrel','Probe / tapered grip','Detail / matcher support pad'):
        group(name,'ESD mat')
    group('Detail / bench connector tray bottom','RF bench oak top')
    group('Detail / socket thread','Detail / bench connector tray bottom')
    group('Detail / repair tray bottom','Context / shelf.001')
    group('Detail / loose repair component','Detail / repair tray bottom')
    group('Detail / window plant saucer','Window sill')
    group('Detail / shelf plant saucer','Context / shelf.002')
    for name,z in (('window plant',1.1475+.004*1.05),('shelf plant',2.123+.004*.95),('corner plant',.004*3.2)):
        group('Room detail / '+name+' clay pot','Detail / '+name+' saucer',z)
    floating=[row for row in rows if row['gap_m']>.0001 or not row['xy_overlap']]
    if floating:raise RuntimeError('Unsupported bearing parts: '+str(floating))
    return rows


def rear_coax_mounts(housing):
    """Find the two circular connector cutouts in the original rear CAD face."""
    normal=Vector((-math.sin(math.radians(5)),math.cos(math.radians(5)),0))
    points=[housing.matrix_world@v.co for v in housing.data.vertices]
    nm=housing.matrix_world.to_3x3().inverted().transposed()
    faces=[f for f in housing.data.polygons if (nm@f.normal).normalized().dot(normal)>.999]
    plane=max(sum(points[i].dot(normal) for i in f.vertices)/len(f.vertices) for f in faces)
    faces=[f for f in faces if abs(sum(points[i].dot(normal) for i in f.vertices)/len(f.vertices)-plane)<.00001]
    edges={}
    for face in faces:
        ids=list(face.vertices)
        for i,a in enumerate(ids):
            e=tuple(sorted((a,ids[(i+1)%len(ids)])));edges[e]=edges.get(e,0)+1
    adjacent={}
    for (a,b),count in edges.items():
        if count==1:
            adjacent.setdefault(a,set()).add(b);adjacent.setdefault(b,set()).add(a)
    holes=[]
    while adjacent:
        todo=[next(iter(adjacent))];group=set()
        while todo:
            i=todo.pop()
            if i in group:continue
            group.add(i);todo.extend(adjacent.get(i,set())-group)
        for i in group:adjacent.pop(i,None)
        boundary=[points[i] for i in group]
        center=sum(boundary,Vector())/len(boundary)
        radii=[(p-center).length for p in boundary]
        if len(boundary)>12 and .0075<min(radii)<.0084 and max(radii)-min(radii)<.00002:
            holes.append({'center':center,'radius':sum(radii)/len(radii)})
    if len(holes)!=2:raise RuntimeError(f'expected two rear connector cutouts, found {len(holes)}')
    return sorted(holes,key=lambda h:h['center'].x,reverse=True),normal


def rear_coax_connection(lab):
    """Restore sockets in the two existing CAD holes; plug into the side route."""
    discard_named(('Coax / rear','Coax connector ring','Coax / bench guide'))
    collection=bpy.data.collections.get('RF bench / coax fittings') or lab.new_collection('RF bench / coax fittings')
    housing=bpy.data.objects['Aluminum Box Bottom']
    mounts,normal=rear_coax_mounts(housing)
    hit=mounts[0]['center']
    metal=lab.material('Coax / rear connector nickel',(.50,.55,.54),.27)
    lab.principled(metal).inputs['Metallic'].default_value=.92
    rubber=lab.material('Coax / rear connector boot',(.009,.013,.013),.65)
    dielectric=lab.material('Coax / rear PTFE dielectric',(.72,.70,.60),.5)
    brass=lab.material('Coax / rear socket contact',(.48,.30,.075),.3)
    lab.principled(brass).inputs['Metallic'].default_value=.9
    rotation=normal.to_track_quat('Z','Y').to_matrix()

    def cyl(name,center,radius,depth,mat,vertices=48):
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=center)
        obj=lab.adopt_mesh(name,mat,collection)
        obj.rotation_euler=normal.to_track_quat('Z','Y').to_euler()
        bevel=obj.modifiers.new('Connector edges','BEVEL');bevel.width=.00035;bevel.segments=3
        return obj

    def annulus(name,center,outer,inner,depth,mat,sides=64,hex_outer=False):
        vertices=[]
        for z,r in ((-depth/2,outer),(depth/2,outer),(-depth/2,inner),(depth/2,inner)):
            for i in range(sides):
                a=math.tau*i/sides
                radius=r*math.cos(math.pi/6)/math.cos(a%(math.pi/3)-math.pi/6) if hex_outer and r==outer else r
                vertices.append(Vector(center)+rotation@Vector((radius*math.cos(a),radius*math.sin(a),z)))
        faces=[]
        for i in range(sides):
            j=(i+1)%sides
            faces.extend(((i,j,sides+j,sides+i),(2*sides+j,2*sides+i,3*sides+i,3*sides+j),
                          (j,i,2*sides+i,2*sides+j),(sides+i,sides+j,3*sides+j,3*sides+i)))
        obj=mesh_object(name,vertices,faces,collection,mat)
        bevel=obj.modifiers.new('Machined edges','BEVEL');bevel.width=.00012;bevel.segments=2
        return obj

    for i,mount in enumerate(mounts):
        center=mount['center'];label=f'Coax / rear port {i+1}'
        annulus(label+' mounting washer',center+normal*.0007,.012,.0080,.0014,metal)
        annulus(label+' hex nut',center+normal*.0027,.0123,.00795,.003,metal,72,True)
        annulus(label+' bulkhead barrel',center+normal*.005,.0078,.0063,.019,metal)
        for j in range(7):
            annulus(label+f' thread {j}',center+normal*(.0048+j*.00135),.0081,.0077,.00055,metal)
        annulus(label+' insulator',center+normal*.0127,.00625,.0017,.0023,dielectric)
        annulus(label+' female contact',center+normal*.0125,.00165,.0009,.003,brass)
        # A shadowed bore reads as a female socket, rather than a solid metal cap.
        cyl(label+' bore shadow',center+normal*.0088,.00085,.0003,rubber)
    cyl('Coax / rear knurled coupling',hit+normal*.022,.0102,.018,metal)
    for i in range(6):cyl(f'Coax / rear coupling groove {i}',hit+normal*(.014+i*.0027),.01045,.00065,metal)
    cyl('Coax / rear plug neck',hit+normal*.034,.0065,.010,metal)
    cyl('Coax / rear strain relief',hit+normal*.041,.0044,.016,rubber)
    anchor=hit+normal*.049
    # The last guide is a real restraint at the front of the bench. The long
    # route behind the matcher stays put while only the slack loop pays out.
    for x,y in ((2.18,4.60),(2.43,4.10)):
        top=.906 if x<2.375 else .900
        center=Vector((x,y,top+.003))
        bpy.ops.mesh.primitive_torus_add(major_radius=.0044,minor_radius=.0009,
            major_segments=24,minor_segments=8,location=center,rotation=(math.pi/2,0,0))
        obj=lab.adopt_mesh('Coax / bench guide arch',rubber,collection)
        foot=lab.box('Coax / bench guide base',(x,y,top+.0008),(.016,.009,.0016),rubber,collection)
    lab.WORLD['animatic']['coax_attachment_m']=list(anchor)
    return {'anchor_m':list(anchor),'rear_panel_m':list(hit),'outward_normal':list(normal),
            'existing_holes':[{'center_m':list(h['center']),'diameter_m':h['radius']*2} for h in mounts]}


def wheel_rotation_cues(lab,vehicle):
    """One valve and a small asymmetric tire mark make the wheel phase readable."""
    discard_named(('Wheel cue /',))
    collection=vehicle.users_collection[0]
    black=lab.material('Wheel cue / valve rubber',(.018,.022,.02),.7)
    brass=lab.material('Wheel cue / valve cap',(.34,.29,.16),.32)
    white=lab.material('Wheel cue / chalk mark',(.72,.71,.60),.84)
    for roll in [o for o in vehicle.children_recursive if o.name.endswith('_roll')]:
        side=1 if roll.parent.location.y>0 else -1
        # These coordinates use the source wheel's presentation units.
        theta=.31 if 'front' in roll.name else 1.03
        for label,radius,depth,y,mat in (('valve',.016,.075,side*.268,black),('cap',.023,.022,side*.311,brass)):
            bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=radius,depth=depth)
            obj=lab.adopt_mesh('Wheel cue / '+roll.name+' '+label,mat,collection)
            obj.parent=roll;obj.location=(.48*math.cos(theta),y,.48*math.sin(theta))
            obj.rotation_euler=(math.pi/2,0,0)
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj=lab.adopt_mesh('Wheel cue / '+roll.name+' chalk',white,collection)
        obj.parent=roll
        obj.location=(.67*math.cos(theta),side*.23,.67*math.sin(theta))
        obj.scale=(.12,.008,.035);obj.rotation_euler.y=-theta
        roll.rotation_mode='XYZ'
    return {'wheel_count':4,'cues':['valve stem','small chalk mark']}


def configure_bottle(lab):
    """Stop the inner tip faces tangent to the label; the bottle remains on the floor."""
    bottle = bpy.data.objects['BottleRoot']
    robot = bpy.data.objects['Robot / provisional placement']
    bottle.location.x = 0
    bottle.location.y = -4.14
    bpy.context.view_layer.update()
    # Set the bottom using vertices, not an envelope containing bevel margins.
    bottom = min(p.z for obj in bottle.children_recursive if obj.type == 'MESH'
                 for p in world_vertices(obj))
    bottle.location.z -= bottom / robot.scale.z
    bpy.context.view_layer.update()
    label = bpy.data.objects['BottleLabel']
    label_points=world_vertices(label)
    label_center = sum(label_points, Vector()) / len(label_points)
    root = bpy.data.objects['LeftArmPivot'].parent
    center = root.matrix_world.inverted() @ label_center
    label_radius = max((root.matrix_world.inverted() @ p - center).xy.length
                       for p in label_points)
    closed = {}
    clearance = 0.00015 / robot.scale.x
    for side in ('Left', 'Right'):
        arm = bpy.data.objects[f'{side}ArmPivot']
        tip = bpy.data.objects[f'{side}ArmTip']
        arm.location.z = center.z
        arm.rotation_mode = 'XYZ'
        x0 = min(v.co.x for v in tip.data.vertices) * tip.scale.x
        x1 = max(v.co.x for v in tip.data.vertices) * tip.scale.x
        y0 = min(v.co.y for v in tip.data.vertices) * tip.scale.y
        y1 = max(v.co.y for v in tip.data.vertices) * tip.scale.y

        def distance(angle):
            delta = center - arm.location
            local = Matrix.Rotation(-angle, 4, 'Z') @ delta - tip.location
            dx = max(x0 - local.x, 0, local.x - x1)
            dy = max(y0 - local.y, 0, local.y - y1)
            return math.hypot(dx, dy)

        opened = float(arm['open_angle'])
        # Search from the original open pose toward the already known over-closed pose.
        beyond = 0.14 if side == 'Left' else -0.14
        a, b = 0.0, 1.0
        for _ in range(48):
            t = (a + b) / 2
            angle = opened + (beyond - opened) * t
            if distance(angle) > label_radius + clearance:
                a = t
            else:
                b = t
        angle = opened + (beyond - opened) * a
        arm['closed_angle'] = angle
        arm['contact_gap_m'] = (distance(angle) - label_radius) * robot.scale.x
        arm.rotation_euler.z = opened
        closed[side] = {'angle_rad': angle, 'clearance_m': arm['contact_gap_m']}
    bpy.context.view_layer.update()
    return {'closed': closed, 'bottle_world_bottom_m': 0.0, 'label_center_local': list(center)}


# Pixel outlines of the two real paper eyes in src/assets/companion-cover.jpg.
# UVs sample that source photograph directly; there is no generated eye image.
EYES = {
    'left': [(724,279),(734,281),(742,293),(747,312),(751,337),(752,363),
             (749,391),(741,420),(731,445),(725,451),(716,447),(708,430),
             (701,405),(697,377),(696,349),(700,320),(708,293),(717,281)],
    'right': [(874,302),(884,307),(891,321),(895,343),(897,369),(895,397),
              (890,429),(880,460),(870,479),(862,481),(850,475),(842,452),
              (837,425),(837,397),(842,364),(850,334),(862,309)],
}


def companion_eyes(lab, holder, objects):
    discard_named(('Companion eye',))
    bpy.context.view_layer.update()
    shell = lab.named_mesh(objects, 'Shell')
    low, high = lab.mesh_bounds([shell])
    center_x = (low.x + high.x) / 2
    eye_z = low.z + (high.z - low.z) * 0.73
    source = bpy.data.images.load(str(lab.ROOT / 'src/assets/companion-cover.jpg'), check_existing=True)
    source.pack()
    material = bpy.data.materials.new('Companion / photographed paper eyes')
    bsdf = lab.principled(material)
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = source
    material.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.88
    material.diffuse_color = (0.012, 0.012, 0.015, 1)
    inv = holder.matrix_world.inverted()
    made = []
    for side, sign in (('left', -1), ('right', 1)):
        outline = EYES[side]
        px0, px1 = min(p[0] for p in outline), max(p[0] for p in outline)
        py0, py1 = min(p[1] for p in outline), max(p[1] for p in outline)
        # Match the long black oval and upper white highlight on the real device.
        height = 0.0255
        width = height * (px1 - px0) / (py1 - py0)
        cx = center_x + sign * 0.0144
        verts = [inv @ Vector((cx + ((x-px0)/(px1-px0)-0.5)*width,
                               low.y - 0.00018,
                               eye_z + (0.5-(y-py0)/(py1-py0))*height)) for x,y in outline]
        obj = mesh_object(f'Companion eye {side} / photo decal', verts,
                          [tuple(range(len(verts)))], holder.users_collection[0], material, holder)
        uv = obj.data.uv_layers.new(name='Original photo')
        for loop in obj.data.loops:
            x, y = outline[loop.vertex_index]
            uv.data[loop.index].uv = (x/source.size[0], 1-y/source.size[1])
        obj['art_source'] = 'src/assets/companion-cover.jpg / paper eye'
        obj.visible_shadow = False
        solid = obj.modifiers.new('Paper thickness', 'SOLIDIFY')
        solid.thickness = 0.00008
        solid.offset = 0
        made.append(obj)
    return made


def pipe_mesh(name, path, radius, collection, material, parent=None, sides=12):
    """Sweep a round wire with stable normals and physical radius."""
    path = [Vector(p) for p in path]
    vertices, faces = [], []
    previous = None
    for i, p in enumerate(path):
        tangent = (path[min(i+1,len(path)-1)] - path[max(i-1,0)]).normalized()
        if previous is None:
            previous = tangent.cross(Vector((0,0,1)))
            if previous.length < 0.1:
                previous = tangent.cross(Vector((0,1,0)))
        normal = (previous - tangent*previous.dot(tangent)).normalized()
        binormal = tangent.cross(normal).normalized()
        previous = normal
        for j in range(sides):
            theta = j/sides*math.tau
            vertices.append(p + radius*(normal*math.cos(theta)+binormal*math.sin(theta)))
        if i:
            for j in range(sides):
                k = (j+1)%sides
                faces.append(((i-1)*sides+j,(i-1)*sides+k,i*sides+k,i*sides+j))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(path)-1)*sides+j for j in range(sides)))
    obj = mesh_object(name, vertices, faces, collection, material, parent)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices)==4
    return obj


def threaded_ring(lab, board, holder, objects):
    discard_named(('Keychain ring',))
    bpy.context.view_layer.update()
    hole = lab.keychain_hole(board)
    # The ring crosses the PCB mid-plane at the drilled hole and beyond its edge.
    hole.z = sum(Vector(c).z for c in board.bound_box) / 8
    world = board.matrix_world @ hole
    mat = lab.material('Keychain / split ring steel', (0.56,0.59,0.62), 0.27)
    lab.principled(mat).inputs['Metallic'].default_value=0.9
    radius, wire, pitch = 0.011, 0.0005, 0.00115
    # Make the ring in board coordinates, preserving the actual import transform.
    bx = (board.matrix_world.to_3x3() @ Vector((1,0,0))).normalized()
    by = (board.matrix_world.to_3x3() @ Vector((0,1,0))).normalized()
    bz = (board.matrix_world.to_3x3() @ Vector((0,0,1))).normalized()
    center = world + by*radius
    inverse = holder.matrix_world.inverted()
    path=[]
    for i in range(225):
        theta = math.tau * 1.88 * i/224
        axial = (theta/math.tau - 0.94)*pitch
        p = center + bx*axial - by*(radius*math.cos(theta)) + bz*(radius*math.sin(theta))
        path.append(inverse @ p)
    obj = pipe_mesh('Keychain ring / threaded split steel', path, wire,
                    holder.users_collection[0], mat, holder, sides=12)
    obj['hole_diameter_m'] = 0.0045
    obj['wire_diameter_m'] = wire*2
    obj['ring_diameter_m'] = 2*(radius+wire)
    obj['hole_in_board_local'] = list(hole)
    objects.append(obj)
    return obj


def keychain_support(lab, holder, board, floor_z):
    """Three visible supports: two front rubber feet and a small rear folded stand."""
    discard_named(('Keychain support',))
    bpy.context.view_layer.update()
    board_points = world_vertices(board)
    low = Vector(tuple(min(p[i] for p in board_points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in board_points) for i in range(3)))
    tree = world_bvh(board)
    inv = holder.matrix_world.inverted()
    rubber = lab.material('Keychain / support rubber', (0.028,0.031,0.033), 0.82)
    stand = lab.material('Keychain / folded support', (0.12,0.13,0.14), 0.6)
    contacts=[]
    width, depth = high.x-low.x, high.y-low.y

    def height_at(x,y):
        hit, _n, _idx, _d = tree.ray_cast(Vector((x,y,floor_z-0.01)),Vector((0,0,1)))
        if hit is None:
            raise RuntimeError(f'keychain support misses PCB at {x}, {y}')
        return hit.z-0.00006

    for sign in (-1,1):
        x = (low.x+high.x)/2 + sign*width*0.21
        y = low.y+depth*0.18
        z = height_at(x,y)
        sx,sy=0.004,0.004
        vs=[(x+dx,y+dy,zz) for zz in (floor_z,z) for dx,dy in ((-sx/2,-sy/2),(sx/2,-sy/2),(sx/2,sy/2),(-sx/2,sy/2))]
        obj=mesh_object(f'Keychain support / front foot {sign}', [inv@Vector(p) for p in vs],
                        [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],
                        holder.users_collection[0],rubber,holder)
        bevel=obj.modifiers.new('Soft rubber corners','BEVEL');bevel.width=0.0005;bevel.segments=3
        contacts.append({'name':obj.name,'top_z_m':z,'floor_z_m':floor_z})
    x=(low.x+high.x)/2
    y=high.y-depth*0.26
    z=height_at(x,y)
    # A folded triangular stand below the raised back; all three bottom edges sit on oak.
    sx,sy=0.014,0.012
    vertices=[(x-sx/2,y-sy/2,floor_z),(x+sx/2,y-sy/2,floor_z),
              (x-sx/2,y+sy/2,floor_z),(x+sx/2,y+sy/2,floor_z),
              (x-sx/2,y,z),(x+sx/2,y,z)]
    obj=mesh_object('Keychain support / folded rear stand',[inv@Vector(p) for p in vertices],
                    [(0,1,5,4),(4,5,3,2)],holder.users_collection[0],stand,holder)
    solid=obj.modifiers.new('Folded steel thickness','SOLIDIFY');solid.thickness=0.0005;solid.offset=0
    contacts.append({'name':obj.name,'top_z_m':z,'floor_z_m':floor_z})
    holder['support_contacts']=3
    return contacts


def robot_alignment_marks(lab):
    """Short tape references on the shared epoxy; no station-shaped tile grid."""
    discard_named(('Robot grid', 'Floor / grid', 'Floor / robot alignment'))
    collection = bpy.data.collections.get('Stations / floor markings')
    if collection is None:
        collection = lab.new_collection('Stations / floor markings')
    area = next(s for s in lab.WORLD['room']['sets'] if s['id'] == 'robot-grid')
    x, y, z = area['center_m'];width, depth, thickness = area['size_m']
    z += thickness / 2
    length = area['alignment_marks']['corner_length_m']
    tape_width = area['alignment_marks']['tape_width_m']
    tape = lab.material('Floor / robot alignment tape', (.20,.22,.19), .84)
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = x + sx * width / 2, y + sy * depth / 2
            # Two quads meet at the corner without overlapping coplanar faces.
            for label, coords in (
                ('x', ((0,0),(-sx*length,0),(-sx*length,-sy*tape_width),(0,-sy*tape_width))),
                ('y', ((0,-sy*tape_width),(-sx*tape_width,-sy*tape_width),(-sx*tape_width,-sy*length),(0,-sy*length))),
            ):
                vertices = [(px+u,py+v,z) for u,v in coords]
                if sx * sy < 0:vertices.reverse()
                mesh_object(f'Floor / robot alignment {sx} {sy} {label}', vertices, [(0,1,2,3)], collection, tape)
    return {'corner_marks': 4, 'tape_width_m': tape_width, 'tape_height_m': z, 'separate_floor_patch': False}


def floor_markings(lab):
    discard_named(('Vehicle lane','Robot grid','Floor / lane','Floor / grid'))
    collection=bpy.data.collections.get('Stations / floor markings')
    if collection is None:collection=lab.new_collection('Stations / floor markings')
    tape=lab.material('Floor / yellow safety tape',(0.62,0.48,0.08),0.78)
    path=lab.WORLD['animatic']['vehicle_path_m']
    a,b=Vector(path[0]),Vector(path[1]);a.z=b.z=0.00016
    direction=(b-a).normalized();side=Vector((-direction.y,direction.x,0))
    # Mark the actual drive path, including the parked endpoint.
    start=a-direction*0.44;end=b+direction*0.40
    for sign in (-1,1):
        left=start+side*(sign*0.38);right=end+side*(sign*0.38)
        vertices=[left+side*0.012,right+side*0.012,right-side*0.012,left-side*0.012]
        mesh_object(f'Floor / lane edge {sign}',vertices,[(0,1,2,3)],collection,tape)
    for i in range(1,8):
        p=a.lerp(b,i/8)
        vs=[p+direction*u+side*v for u,v in ((-.08,-.012),(.08,-.012),(.08,.012),(-.08,.012))]
        mesh_object(f'Floor / lane dash {i}',vs,[(0,1,2,3)],collection,tape)
    return {'lane_thickness_m':0.00016,'robot_alignment':robot_alignment_marks(lab),'floor_z_m':0}


def task_lamp(lab):
    """Weighted base, connected articulated arm, hinge hardware and a hollow metal shade."""
    for obj in list(bpy.data.objects):
        if obj.name.startswith(('Desk lamp /','Desk / warm')) and obj.name!='Desk lamp / spill toward pinboard':
            bpy.data.objects.remove(obj,do_unlink=True)
    spill=bpy.data.objects.get('Desk lamp / spill toward pinboard')
    if spill and spill.data.name!='Desk lamp / wall spill':
        orphan=bpy.data.lights.get('Desk lamp / wall spill')
        if orphan and orphan.users==0:bpy.data.lights.remove(orphan)
        spill.data.name='Desk lamp / wall spill'
    collection=bpy.data.collections.get('Desk / evening lamp') or lab.new_collection('Desk / evening lamp')
    graphite=lab.material('Desk lamp / graphite shade',(0.07,0.065,0.06),0.42)
    steel=lab.material('Desk lamp / steel',(0.42,0.43,0.41),0.3)
    lab.principled(steel).inputs['Metallic'].default_value=0.78
    rubber=lab.material('Desk lamp / rubber sole',(0.018,0.02,0.021),0.84)
    white=lab.material('Desk lamp / reflector',(0.78,0.76,0.7),0.28)
    base=Vector((5.50,4.78,.766))
    mast=Vector((5.50,4.78,.803));elbow=Vector((5.54,4.80,.987));head=Vector((5.30,4.66,.93))

    def cyl(name,location,radius,depth,mat,axis=(0,0,1)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=radius,depth=depth,location=location)
        obj=lab.adopt_mesh(name,mat,collection)
        obj.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler()
        bevel=obj.modifiers.new('Machined edge','BEVEL');bevel.width=min(.001,depth*.12);bevel.segments=3
        for p in obj.data.polygons:p.use_smooth=len(p.vertices)==4
        return obj

    cyl('Desk lamp / rubber sole',(base.x,base.y,.761),.038,.002,rubber)
    cyl('Desk lamp / weighted base',(base.x,base.y,.768),.041,.012,graphite)
    cyl('Desk lamp / base collar',(base.x,base.y,.782),.011,.016,steel)
    lab.rod('Desk lamp / upright',(.0+base.x,base.y,.785),mast,.006,graphite,collection)
    axis=(elbow-mast).cross(head-elbow).normalized()
    for sign in (-1,1):
        offset=axis*(sign*.004)
        lab.rod(f'Desk lamp / lower link {sign}',mast+offset,elbow+offset,.003,graphite,collection)
        lab.rod(f'Desk lamp / upper link {sign}',elbow+offset,head+offset,.0028,graphite,collection)
    for name,point in (('base',mast),('elbow',elbow),('head',head)):
        cyl(f'Desk lamp / {name} hinge',point,.008,.014,graphite,axis)
        for sign in (-1,1):cyl(f'Desk lamp / {name} screw {sign}',point+axis*(sign*.0076),.003,.0015,steel,axis)
    aim=(Vector((5.22,4.54,.76))-head).normalized()
    rotation=(-aim).to_track_quat('Z','Y').to_matrix()
    # Closed cross-section of a metal shell: open mouth, inner wall, back, outer wall.
    profile=[(.039,-.021),(.0375,-.021),(.015,.021),(.0,.023),(.0,.025),(.017,.025),(.039,-.019)]
    vs=[];fs=[];rings=[];bands=[];segments=64
    for radius,z in profile:
        ring=[]
        for i in range(1 if radius==0 else segments):
            theta=math.tau*i/segments
            ring.append(len(vs))
            vs.append(head+rotation@Vector((radius*math.cos(theta),radius*math.sin(theta),z)))
        rings.append(ring)
    for ring in range(len(profile)):
        a,b=rings[ring],rings[(ring+1)%len(profile)]
        if len(a)==len(b)==1:continue
        for i in range(segments):
            j=(i+1)%segments
            if len(a)==1:fs.append((a[0],b[j],b[i]))
            elif len(b)==1:fs.append((a[i],a[j],b[0]))
            else:fs.append((a[i],a[j],b[j],b[i]))
            bands.append(ring)
    shade=mesh_object('Desk lamp / hollow shade',vs,fs,collection,graphite)
    shade.data.materials.append(white)
    for face in shade.data.polygons:
        face.use_smooth=True
        if bands[face.index] in (1,2):face.material_index=1
    emitter=lab.material('Desk lamp / LED diffuser',(0.88,.85,.76),.4)
    node=lab.principled(emitter);node.inputs['Emission Color'].default_value=(*lab.kelvin_rgb(3000),1);node.inputs['Emission Strength'].default_value=1.2
    # Clear the 8 mm head hinge behind the diffuser instead of intersecting it.
    cyl('Desk lamp / recessed diffuser',head+aim*.012,.021,.001,emitter,aim)
    light=bpy.data.lights.get('Desk lamp / 3000K') or bpy.data.lights.new('Desk lamp / 3000K','AREA')
    light.energy=lab.WORLD['lighting']['rig']['desk_w'];light.shape='DISK';light.size=.040;light.color=lab.kelvin_rgb(3000)
    obj=bpy.data.objects.new('Desk lamp / warm key',light);collection.objects.link(obj)
    obj.location=head+aim*.014;lab.look_at(obj,obj.location+aim)
    return {'shade_open_diameter_m':.078,'emitter_diameter_m':.042,'hinges':3,'base_bottom_m':.76}
