"""Personal workshop atmosphere, authored in the same room and metre scale.

Original geometry only: plaster enclosure, low paneling, a woven chair rug,
plants, books and fixed practical lights. Project stations and camera stay put.
"""
import math
from pathlib import Path

import bpy
from mathutils import Vector


def seating_area(lab):
    """A bound rug in the knee space, with the chair clear of the drawer unit."""
    g = lab.geometry()
    g.discard_named(('Room detail / woven chair rug', 'Room detail / rug fringe',
                     'Room detail / rug binding', 'Room detail / chair throw'))
    collection = bpy.data.collections['Room / personal workshop']
    spec = next(p for p in lab.WORLD['room']['context'] if p['id'] == 'chair-rug')
    chair_spec = next(p for p in lab.WORLD['room']['context'] if p['id'] == 'desk-chair')
    center = Vector(spec['center_m'])
    width, depth, thickness = spec['size_m']
    radius, binding = spec['corner_radius_m'], spec['binding_width_m']
    top = center.z + thickness / 2
    cloth = lab.material('Room detail / dense chair rug', (.282,.247,.184), .94)
    edge_mat = lab.material('Room detail / rug binding', (.248,.215,.155), .93)

    def loop(w, d, r):
        points = []
        for sx,sy,start in ((1,1,0),(-1,1,90),(-1,-1,180),(1,-1,270)):
            for step in range(13):
                angle = math.radians(start + step * 90 / 12)
                points.append((center.x + sx*(w/2-r) + r*math.cos(angle),
                               center.y + sy*(d/2-r) + r*math.sin(angle), top))
        return points

    outer = loop(width, depth, radius)
    inner = loop(width-2*binding, depth-2*binding, radius-binding)
    rug = g.mesh_object('Room detail / woven chair rug', inner,
                        [tuple(range(len(inner)))], collection, cloth)
    n = len(outer)
    faces = [(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
    edge = g.mesh_object('Room detail / rug binding', outer+inner, faces, collection, edge_mat)
    for obj in (rug, edge):
        solid = obj.modifiers.new('Flat woven thickness 2.5 mm', 'SOLIDIFY')
        solid.thickness, solid.offset = thickness, -1
    chair = bpy.data.objects.get('Context / chair seat')
    target = Vector(chair_spec['center_m'])
    if chair:
        bpy.context.view_layer.update()
        current = sum((chair.matrix_world @ Vector(p) for p in chair.bound_box), Vector()) / 8
        delta = target - current
        for obj in bpy.data.objects:
            if obj.name.startswith('Context / chair '):obj.location += delta
    # Preserve the authored folds relative to the chair as it moves into knee space.
    path = [(3.558,.77),(3.558,.90),(3.550,.950),(3.522,.953),
            (3.485,.950),(3.473,.925),(3.468,.82),(3.466,.69),(3.462,.60)]
    vertices = [];cols = 24
    for j,(y,z) in enumerate(path):
        for i in range(cols+1):
            t = i/cols
            fold = .003*math.sin(t*math.tau*4)*math.sin(math.pi*j/(len(path)-1))
            vertices.append((target.x+(t-.5)*.32,target.y+y-3.75-fold,
                             target.z+z-.47+.002*math.sin(t*math.tau*3)))
    faces = [(j*(cols+1)+i,j*(cols+1)+i+1,(j+1)*(cols+1)+i+1,(j+1)*(cols+1)+i)
             for j in range(len(path)-1) for i in range(cols)]
    throw = g.mesh_object('Room detail / chair throw',vertices,faces,collection,
                          bpy.data.materials['Room detail / woven oat'])
    solid = throw.modifiers.new('Folded fabric thickness','SOLIDIFY');solid.thickness = .0015
    sub = throw.modifiers.new('Soft folds','SUBSURF');sub.levels = 2
    for face in throw.data.polygons:face.use_smooth = True
    return {'rug_bounds_m': [center.x-width/2,center.x+width/2,center.y-depth/2,center.y+depth/2],
            'rug_top_m':top,'fringe':False,'binding_width_m':binding,'chair_seat_m':list(target)}


def enrich(lab):
    g=lab.geometry()
    old=bpy.data.collections.get('Room / personal workshop')
    if old:
        for obj in list(old.objects):bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.collections.remove(old)
    c=lab.new_collection('Room / personal workshop')
    wood=bpy.data.materials['Bench / photographed oak veneer']
    plaster=lab.material('Room detail / ceiling plaster',(.61,.58,.51),.92)
    sage=lab.material('Room detail / sage paneling',(.17,.205,.16),.75)
    oat=lab.material('Room detail / woven oat',(.32,.275,.205),.94)
    clay=lab.material('Room detail / terracotta',(.24,.105,.055),.86)
    leaf=lab.material('Room detail / leaf green',(.055,.13,.048),.48)
    leaf_light=lab.material('Room detail / leaf light',(.09,.18,.065),.52)
    soil=lab.material('Room detail / soil',(.026,.018,.011),.98)
    brass=lab.material('Room detail / aged brass',(.26,.20,.11),.35)
    lab.principled(brass).inputs['Metallic'].default_value=.78
    cream=lab.material('Room detail / book cloth',(.42,.36,.25),.89)
    greenbook=lab.material('Room detail / green book cloth',(.095,.14,.11),.88)
    paper=lab.material('Room detail / paper edges',(.62,.57,.46),.94)
    def box(name,p,size,mat,bevel=.002):
        v=[(p[0]+dx*size[0]/2,p[1]+dy*size[1]/2,p[2]+dz*size[2]/2)
           for dx,dy,dz in ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                            (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))]
        o=g.mesh_object('Room detail / '+name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],c,mat)
        if bevel:
            m=o.modifiers.new('Soft finished edges','BEVEL');m.width=bevel;m.segments=3
            o.modifiers.new('Face normals','WEIGHTED_NORMAL')
        return o
    def lathe(name,p,profile,mat,segments=64):
        v=[];rings=[];f=[]
        for r,z in profile:
            ring=[]
            for i in range(1 if r==0 else segments):
                ring.append(len(v));v.append(Vector(p)+Vector((r*math.cos(math.tau*i/segments),r*math.sin(math.tau*i/segments),z)))
            rings.append(ring)
        for a,b in zip(rings,rings[1:]):
            if len(a)==len(b)==1:continue
            for i in range(segments):
                j=(i+1)%segments
                if len(a)==1:f.append((a[0],b[j],b[i]))
                elif len(b)==1:f.append((a[i],a[j],b[0]))
                else:f.append((a[i],a[j],b[j],b[i]))
        o=g.mesh_object('Room detail / '+name,v,f,c,mat)
        for face in o.data.polygons:
            zs=[o.data.vertices[i].co.z for i in face.vertices];face.use_smooth=max(zs)-min(zs)>.00001
        return o
    def cyl(name,p,r,depth,mat):
        return lathe(name,p,[(0,-depth/2),(r,-depth/2),(r,depth/2),(0,depth/2)],mat)
    def stem(name,points,r=.003,mat=leaf):
        return g.pipe_mesh('Room detail / '+name,points,r,c,mat,sides=8)

    # Complete the enclosure at the existing room bounds. The camera stays
    # inside it, including the high final view below the 3.6 m ceiling.
    box('ceiling',(4,3.25,3.64),(8,6.5,.08),plaster)
    wall=bpy.data.materials['Room / mineral paint']
    box('south wall',(4,-.06,1.8),(8,.12,3.6),wall)
    box('north low paneling',(4,6.483,.435),(7.98,.026,.87),sage)
    box('east low paneling',(7.983,3.25,.435),(.026,6.48,.87),sage)
    box('north oak cap',(4,6.458,.884),(7.98,.070,.028),wood)
    box('east oak cap',(7.958,3.25,.884),(.070,6.48,.028),wood)
    for x in (3.07,4.24,6.87,7.88):box('north panel stile',(x,6.465,.495),(.026,.018,.75),sage)
    for y in (.12,1.5,2.9,4.3,5.7,6.38):box('east panel stile',(7.965,y,.495),(.018,.026,.75),sage)
    # Gentle architectural framing around the existing opening, no glass image.
    for y in (3.16,5.64):box('window side casing',(.055,y,2.05),(.09,.075,1.91),wood)
    box('window head casing',(.055,4.4,3.005),(.09,2.56,.07),wood)

    seating = seating_area(lab)

    def plant(name,p,scale=1):
        p=Vector(p);s=scale
        lathe(name+' clay pot',p,[(0,0),(.052*s,0),(.075*s,.119*s),(.079*s,.121*s),
              (.079*s,.132*s),(.071*s,.132*s),(.065*s,.115*s),(.045*s,.012*s),(0,.012*s)],clay)
        cyl(name+' soil',p+Vector((0,0,.116*s)),.065*s,.006*s,soil)
        for k in range(11):
            a=k*2.399963;reach=(.10+.028*(k%3))*s
            tip=p+Vector((reach*math.cos(a),reach*math.sin(a),(.22+.04*(k%4))*s))
            start=p+Vector((.015*s*math.cos(a),.015*s*math.sin(a),.12*s))
            base=start.lerp(tip,.38)
            stem(name+' stem',[start,base,base.lerp(tip,.38)],.0018*s)
            side=Vector((-math.sin(a),math.cos(a),0));vertices=[]
            for j in range(9):
                t=j/8;mid=base.lerp(tip,t)+Vector((0,0,.035*s*math.sin(math.pi*t)))
                w=.036*s*math.sin(math.pi*t)**.8
                vertices.extend((mid-side*w,mid+Vector((0,0,.004*s*math.sin(math.pi*t))),mid+side*w))
            faces=[]
            for j in range(8):faces.extend(((j*3,(j+1)*3,(j+1)*3+1,j*3+1),(j*3+1,(j+1)*3+1,(j+1)*3+2,j*3+2)))
            o=g.mesh_object('Room detail / '+name+' leaf',vertices,faces,c,leaf if k%3 else leaf_light)
            for face in o.data.polygons:face.use_smooth=True
            shell=o.modifiers.new('Leaf thickness','SOLIDIFY');shell.thickness=.0003*s
    plant('window plant',(.075,5.30,1.148),1.05)
    plant('shelf plant',(.75,6.14,2.125),.95)
    plant('corner plant',(7.42,5.92,0),3.2)

    # A compact book ledge warms the unused wall beside the real pinboard.
    box('book ledge',(7.22,6.28,1.62),(1.02,.32,.025),wood,.004)
    for x in (6.82,7.62):box('ledge bracket',(x,6.365,1.55),(.025,.14,.12),brass)
    for i,(x,h) in enumerate(((6.87,.23),(6.94,.26),(7.015,.21),(7.09,.25))):
        mat=greenbook if i%2 else cream
        box('book paper',(x,6.27,1.6325+h/2),(.042,.202,h-.012),paper,.0005)
        for sign in (-1,1):box('book cover',(x+sign*.023,6.27,1.6325+h/2),(.003,.214,h),mat,.0007)
        box('book spine',(x,6.165,1.6325+h/2),(.048,.007,h),mat,.001)
    for i in range(2):
        z=1.647+i*.032
        mat=cream if i else greenbook
        for sign in (-1,1):box('stacked book cover',(7.43,6.27,z+sign*.013),(.30,.22,.003),mat,.0007)
        box('stacked book spine',(7.43,6.162,z),(.30,.006,.028),mat,.001)
        box('stacked page edges',(7.43,6.263,z),(.29,.21,.020),paper,.0005)

    # Warm practicals occupy fixed physical fixtures, keyed by the same dusk
    # transition as the desk lamp. They do not follow the camera.
    diffuser=lab.material('Room detail / shelf diffuser',(.75,.71,.59),.6)
    bsdf=lab.principled(diffuser);bsdf.inputs['Emission Color'].default_value=(*lab.kelvin_rgb(3000),1)
    box('shelf strip housing',(1.58,6.015,1.125),(1.72,.034,.010),brass,.001)
    box('shelf strip diffuser',(1.58,6.009,1.118),(1.69,.025,.004),diffuser,.001)
    data=bpy.data.lights.get('Room / storage strip') or bpy.data.lights.new('Room / storage strip','AREA')
    obj=bpy.data.objects.new('Room detail / storage strip light',data);c.objects.link(obj)
    data.shape='RECTANGLE';data.size=1.65;data.size_y=.035
    obj.location=(1.58,6.005,1.113);lab.look_at(obj,(1.58,6.005,.85))

    linen=lab.material('Room detail / linen shade',(.59,.49,.34),.86)
    tree=linen.node_tree;n=tree.nodes;l=tree.links
    if not n.get('Linen transmission'):
        bsdf=lab.principled(linen);translucent=n.new('ShaderNodeBsdfTranslucent');translucent.name='Linen transmission';translucent.inputs['Color'].default_value=(.72,.61,.44,1)
        mix=n.new('ShaderNodeMixShader');mix.inputs[0].default_value=.38
        l.new(bsdf.outputs['BSDF'],mix.inputs[1]);l.new(translucent.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],n.get('Material Output').inputs['Surface'])
    bsdf=lab.principled(linen);bsdf.inputs['Emission Color'].default_value=(*lab.kelvin_rgb(2700),1)
    lamp=Vector((7.55,5.20,0))
    lathe('floor lamp weighted base',lamp,[(0,0),(.14,0),(.148,.013),(.14,.027),(0,.027)],brass)
    cyl('floor lamp upright',lamp+Vector((0,0,.685)),.008,1.32,brass)
    lathe('linen lamp shade',lamp,[(.190,1.34),(.135,1.65)],linen)
    for r,z in ((.190,1.34),(.135,1.65)):
        points=[lamp+Vector((r*math.cos(math.tau*j/72),r*math.sin(math.tau*j/72),z)) for j in range(73)]
        stem('shade bound rim',points,.002,linen)
    bulb=lab.material('Room detail / lamp bulb',(.80,.73,.58),.5)
    bsdf=lab.principled(bulb);bsdf.inputs['Emission Color'].default_value=(*lab.kelvin_rgb(2700),1)
    bulb_obj=lathe('floor lamp bulb',lamp,[(0,1.34),(.014,1.35),(.028,1.39),(.027,1.43),(.014,1.455),(0,1.46)],bulb)
    bulb_obj.visible_shadow=False
    data=bpy.data.lights.get('Room / linen corner lamp') or bpy.data.lights.new('Room / linen corner lamp','POINT')
    obj=bpy.data.objects.new('Room detail / linen corner light',data);c.objects.link(obj)
    data.shadow_soft_size=.07;obj.location=lamp+Vector((0,0,1.45))
    bpy.context.view_layer.update()
    return {'objects':len(c.objects),'seating':seating,'enclosure_height_m':3.6,
            'context':['warm lower paneling','window casing','chair rug and throw','three plants','book ledge','storage strip','linen floor lamp']}
