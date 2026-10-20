"""Working-lab context, with authored furniture dimensions and clear floor lanes.

Generic tools and blank instruments establish use. No screens, measurements or
new project claims are fabricated. Furniture stays fixed through every shot.
"""
import math

import bpy
from mathutils import Vector


def storage_supports(lab):
    """Give the low bin rack and desk pedestal visible, grounded supports."""
    g = lab.geometry()
    g.discard_named(('Context / RF bin rack leg', 'Context / RF bin rack foot',
                     'Context / pedestal leveling foot'))
    collection = bpy.data.collections['Room / working context']
    steel = bpy.data.materials['Context / graphite steel']
    rubber = bpy.data.materials['Context / rubber']

    def box(name, center, size, material, bevel=.001):
        vertices = [(center[0] + x * size[0] / 2,
                     center[1] + y * size[1] / 2,
                     center[2] + z * size[2] / 2)
                    for x, y, z in ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                                    (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))]
        obj = g.mesh_object('Context / ' + name, vertices,
                            [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],
                            collection, material)
        edge = obj.modifiers.new('Finished support edges', 'BEVEL')
        edge.width, edge.segments = bevel, 3
        obj.modifiers.new('Support face normals', 'WEIGHTED_NORMAL')
        return obj

    for x in (.72, 1.66):
        for y in (4.24, 4.76):
            suffix = f'{x:.2f} {y:.2f}'
            box('RF bin rack foot ' + suffix, (x,y,.006), (.040,.040,.012), rubber)
            # Shelf underside .1575 m; feet end at .012 m.
            box('RF bin rack leg ' + suffix, (x,y,.08475), (.025,.025,.1455), steel)
    for x in (6.00, 6.46):
        for y in (4.43, 4.97):
            # The bound chair rug stops before the cabinet; all feet meet epoxy.
            floor = 0
            top = .015
            box(f'pedestal leveling foot {x:.2f} {y:.2f}',
                (x,y,(floor+top)/2), (.036,.036,top-floor), rubber)
    return {'rack_feet': 4, 'rack_legs': 4, 'rack_shelf_underside_m': .1575,
            'pedestal_feet': 4, 'pedestal_underside_m': .015,
            'front_pedestal_foot_surface_m': 0, 'rear_pedestal_foot_surface_m': 0}


def furnish(lab):
    g=lab.geometry()
    old=bpy.data.collections.get('Room / working context')
    if old:
        for obj in list(old.objects):bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.collections.remove(old)
    c=lab.new_collection('Room / working context')
    graphite=lab.material('Context / graphite steel',(.055,.065,.063),.53)
    ivory=lab.material('Context / cabinet enamel',(.48,.51,.47),.61)
    rubber=lab.material('Context / rubber',(.02,.026,.024),.82)
    metal=lab.material('Context / brushed steel',(.39,.44,.43),.34)
    lab.principled(metal).inputs['Metallic'].default_value=.8
    binmat=lab.material('Context / muted blue bins',(.075,.16,.20),.68)
    boardmat=lab.material('Context / spare green PCB',(.025,.13,.075),.55)
    copper=lab.material('Context / wire spool copper',(.33,.12,.045),.48)
    paper=lab.material('Context / paper',(.72,.69,.59),.88)
    wood=bpy.data.materials.get('Bench / photographed oak veneer')

    def box(name,p,size,mat=graphite,bevel=.003):
        vertices=[(p[0]+dx*size[0]/2,p[1]+dy*size[1]/2,p[2]+dz*size[2]/2)
                  for dx,dy,dz in ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                                   (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))]
        obj=g.mesh_object('Context / '+name,vertices,
            [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],c,mat)
        if bevel:
            m=obj.modifiers.new('Finished edges','BEVEL');m.width=bevel;m.segments=3
            obj.modifiers.new('Face normals','WEIGHTED_NORMAL')
        return obj

    def rod(name,a,b,r=.012,mat=graphite):
        a,b=Vector(a),Vector(b)
        return cyl(name,(a+b)/2,r,(b-a).length,mat,b-a)

    def cyl(name,p,r,depth,mat=graphite,axis=(0,0,1)):
        rotation=Vector(axis).to_track_quat('Z','Y').to_matrix()
        vertices=[Vector(p)+rotation@Vector((r*math.cos(math.tau*i/32),r*math.sin(math.tau*i/32),z))
                  for z in (-depth/2,depth/2) for i in range(32)]
        faces=[(i,(i+1)%32,(i+1)%32+32,i+32) for i in range(32)]
        faces.extend([tuple(reversed(range(32))),tuple(range(32,64))])
        obj=g.mesh_object('Context / '+name,vertices,faces,c,mat)
        b=obj.modifiers.new('Edge radius','BEVEL');b.width=min(.003,depth*.15);b.segments=3
        for face in obj.data.polygons:face.use_smooth=len(face.vertices)==4
        return obj

    def wire(name,points,r=.003,mat=rubber):
        return g.pipe_mesh('Context / '+name,points,r,c,mat,sides=10)

    def storage_bin(name,x,y,z,w=.28):
        box(name+' bottom',(x,y,z+.008),(w,.25,.016),binmat)
        box(name+' back',(x,y+.116,z+.080),(w,.018,.16),binmat)
        box(name+' left',(x-w/2+.008,y,z+.070),(.016,.25,.14),binmat)
        box(name+' right',(x+w/2-.008,y,z+.070),(.016,.25,.14),binmat)
        box(name+' front lip',(x,y-.117,z+.034),(w,.016,.068),binmat)
        box(name+' label',(x,y-.1254,z+.041),(.083,.0008,.018),paper,0)
        for j in range(3):
            box(name+f' offcut {j}',(x-.075+j*.06,y+.02,z+.022),(.045,.11,.012),boardmat,.001)

    # North-wall service storage gives depth behind the RF bench.
    for x in (.78,1.58,2.38):
        box('service cabinet',(x,6.15,.435),(.77,.53,.79),ivory,.008)
        box('cabinet toe',(x,6.15,.045),(.69,.46,.09),graphite)
        for z in (.26,.52,.72):
            box('drawer front',(x,5.877,z),(.725,.02,.17),ivory)
            rod('drawer pull',(x-.11,5.851,z+.023),(x+.11,5.851,z+.023),.009,metal)
    box('service worktop',(1.58,6.13,.85475),(2.48,.62,.0495),wood,.009)
    for x in (.43,2.73):box('shelf upright',(x,6.18,1.66725),(.038,.37,1.5755),graphite)
    for z in (1.14,1.59,2.11):
        box('shelf',(1.58,6.18,z),(2.34,.38,.026),ivory)
    for i in range(6):storage_bin(f'parts bin {i}',.65+i*.35,6.13,1.153)
    for i in range(3):storage_bin(f'upper bin {i}',.68+i*.42,6.13,1.603,.31)
    # Bench instruments are blank housings with knobs and ports, without fake readings.
    for i,(x,w) in enumerate(((1.02,.40),(1.68,.48))):
        box('instrument body',(x,6.12,.9795),(w,.31,.20),ivory,.009)
        box('instrument front',(x,5.956,.9795),(w-.018,.012,.18),graphite)
        box('instrument unpowered display',(x-.06,5.948,1.0075),(.15,.004,.07),rubber,.001)
        for j in range(2):cyl('instrument knob',(x+w*.29,5.935,.9495+j*.065),.018,.019,rubber,(0,1,0))
    for i in range(3):
        x=2.12+i*.17
        cyl('wire spool drum',(x,6.14,.9515),.054,.10,copper,(1,0,0))
        for sign in (-1,1):cyl('wire spool cheek',(x+sign*.052,6.14,.9515),.072,.009,graphite,(1,0,0))
    for i in range(4):
        box('manual spine',(.63+i*.052,6.19,1.804),(.044,.22,.37),graphite if i%2 else ivory)
        box('manual index strip',(.63+i*.052,6.079,1.854),(.025,.002,.055),paper,0)
    # More shelves have open space; the room remains a workshop rather than a warehouse.
    for i in range(2):
        x=1.10+i*.42
        cyl('spare lead coil',(x,6.14,1.632),.065,.026,rubber)
    box('empty repair tray',(2.18,6.13,1.63),(.45,.24,.045),graphite)

    # Under-bench stock is away from the drawer and the cable landing.
    box('RF lower shelf',(1.19,4.50,.17),(1.08,.61,.025),graphite)
    for i in range(3):storage_bin(f'under-bench bin {i}',.84+i*.30,4.51,.1825,.26)

    # A two-shelf mobile service cart occupies the gap behind the stations.
    cart=Vector((3.48,5.36,0))
    for dx in (-.28,.28):
        for dy in (-.21,.21):
            cyl('cart caster',(cart.x+dx,cart.y+dy,.038),.038,.025,rubber,(1,0,0))
            rod('cart caster pin',(cart.x+dx,cart.y+dy,.07),(cart.x+dx,cart.y+dy,.11),.009,metal)
            box('cart post',(cart.x+dx,cart.y+dy,.46),(.023,.023,.73),graphite)
    for z in (.22,.78):
        box('cart tray',(cart.x,cart.y,z),(.64,.51,.024),ivory)
        for sign in (-1,1):box('cart tray lip',(cart.x+sign*.31,cart.y,z+.025),(.016,.51,.05),ivory)
    storage_bin('cart components',cart.x,cart.y,.232,.40)
    box('cart ESD pad',(cart.x,cart.y,.795),(.49,.37,.006),rubber)
    box('cart spare PCB',(cart.x-.06,cart.y,.803),(.18,.12,.01),boardmat,.001)
    for i in range(4):box('cart PCB socket',(cart.x-.11+i*.032,cart.y,.813),(.018,.04,.01),graphite,.001)
    rod('cart handle',(cart.x+.31,cart.y-.20,.88),(cart.x+.31,cart.y+.20,.88),.013,graphite)
    for dy in (-.2,.2):rod('cart handle support',(cart.x+.31,cart.y+dy,.78),(cart.x+.31,cart.y+dy,.88),.01,graphite)

    # Keep the accepted desktop surface at exactly .760 m; give it actual knee space.
    desk=bpy.data.objects.get('Personal desk')
    if desk:
        bpy.data.objects.remove(desk,do_unlink=True)
    box('personal desk top',(5.55,4.65,.742),(2.3,.9,.036),wood,.008)
    for x in (4.48,6.62):
        for y in (4.27,5.03):box('personal desk leg',(x,y,.363),(.045,.045,.726),graphite)
        rod('personal desk rear brace',(x,4.27,.23),(x,5.03,.23),.016,graphite)
    box('personal desk rear rail',(5.55,5.03,.68),(2.17,.038,.064),graphite)
    # Storage pedestal is under the unused right end of the desk.
    box('personal desk pedestal',(6.23,4.70,.34),(.56,.63,.65),ivory,.008)
    for z in (.19,.43,.60):
        box('pedestal drawer',(6.23,4.372,z),(.52,.019,.12),ivory)
        rod('pedestal pull',(6.15,4.35,z),(6.31,4.35,z),.007,metal)
    # Tool station at the far right; no changes to the small devices' scale or pose.
    box('desk tool tray',(6.12,4.77,.774),(.32,.25,.028),graphite)
    for i in range(3):
        rod('desk screwdriver shaft',(6.03+i*.075,4.70,.795),(6.03+i*.075,4.81,.795),.002,metal)
        rod('desk screwdriver grip',(6.03+i*.075,4.80,.795),(6.03+i*.075,4.87,.795),.008,graphite)
    for i in range(5):box('desk paper stack',(5.87,4.89,.76055+i*.0011),(.20,.14,.0011),paper,.0003)
    box('desk power strip',(6.45,4.95,.779),(.27,.065,.03),ivory)
    for i in range(3):box('desk power socket',(6.37+i*.073,4.95,.795),(.036,.027,.002),graphite,.001)

    # A stool by the bench and a work chair by the free side of the desk set human scale.
    cyl('bench stool seat',(.78,3.59,.48),.19,.048,rubber)
    for i in range(4):
        a=math.tau*i/4+math.pi/4
        rod('stool leg',(.78+.16*math.cos(a),3.59+.16*math.sin(a),.010),(.78+.11*math.cos(a),3.59+.11*math.sin(a),.46),.015,metal)
        cyl('stool foot',(.78+.16*math.cos(a),3.59+.16*math.sin(a),.007),.020,.014,rubber)
    bpy.ops.mesh.primitive_torus_add(major_radius=.14,minor_radius=.009,location=(.78,3.59,.19),major_segments=48,minor_segments=10)
    lab.adopt_mesh('Context / stool foot ring',metal,c)
    center=Vector((6.12,3.75,0))
    cyl('chair seat',(center.x,center.y,.47),.235,.065,rubber)
    cyl('chair gas lift',(center.x,center.y,.27),.025,.33,metal)
    for i in range(5):
        a=math.tau*i/5
        p=center+Vector((.29*math.cos(a),.29*math.sin(a),.06))
        rod('chair base spoke',(center.x,center.y,.13),p,.018,graphite)
        cyl('chair caster',p-Vector((0,0,.028)),.032,.035,rubber,(math.cos(a),math.sin(a),0))
    for sign in (-1,1):rod('chair back support',(center.x+sign*.12,center.y-.15,.46),(center.x+sign*.12,center.y-.24,.86),.014,graphite)
    box('chair back',(center.x,center.y-.24,.80),(.42,.065,.30),rubber,.035)

    # Outlet raceway and skirting connect the furniture to the building.
    box('north skirting',(4,6.475,.06),(7.98,.035,.12),ivory)
    box('east skirting',(7.975,3.25,.06),(.035,6.5,.12),ivory)
    box('north outlet raceway',(1.57,6.465,1.015),(2.9,.035,.05),ivory)
    for x in (.8,1.6,2.4):
        box('outlet plate',(x,6.441,1.015),(.11,.012,.065),ivory)
        for dx in (-.025,.025):box('outlet recess',(x+dx,6.432,1.015),(.012,.003,.023),graphite,.001)

    # A hanging-lead rail gives the empty wall above the cart a workshop use.
    # The pinboard starts at x=4.45; every hook and loop stays to its left.
    box('wall lead rail',(3.65,6.448,1.79),(1.12,.038,.055),graphite)
    for x in (3.17,4.13):
        cyl('rail mounting screw',(x,6.423,1.79),.005,.004,metal,(0,1,0))
    for i,(x,r) in enumerate(((3.27,.128),(3.67,.155),(4.03,.105))):
        rod('lead hook',(x,6.426,1.79),(x,6.33,1.79),.006,metal)
        rod('lead hook upturn',(x,6.33,1.79),(x,6.33,1.82),.006,metal)
        for turn in range(2):
            points=[(x+r*math.sin(math.tau*j/72),6.355-turn*.009,
                     1.79-r+r*math.cos(math.tau*j/72)) for j in range(73)]
            wire(f'hanging lead {i} turn {turn}',points,.0035,rubber)
        # Two unequal tails end in metal connector barrels.
        for sign,tail in ((-1,.14),(1,.19)):
            y=6.35-sign*.012
            wire('lead tail',[(x+sign*r*.72,y,1.79-r*.4),
                 (x+sign*r*.90,y,1.79-r*1.1),(x+sign*r*.8,y,1.79-r-tail)],.0035,rubber)
            cyl('stored lead plug',(x+sign*r*.8,y,1.79-r-tail-.012),.007,.024,metal)

    # Building services, kept outside the pinboard and device compositions.
    box('desk wall raceway',(5.75,6.467,.94),(3.83,.028,.045),ivory)
    box('east wall raceway',(7.978,5.20,.94),(.027,2.54,.045),ivory)
    for x in (4.18,5.58,7.30):
        box('desk wall outlet plate',(x,6.443,.94),(.12,.018,.078),ivory)
        for dx in (-.028,.028):
            for dz in (-.009,.009):box('desk wall outlet slot',(x+dx,6.432,.94+dz),(.014,.002,.004),graphite,.0005)
    # A recessed ventilation grille breaks up the upper east wall.
    box('vent frame',(7.969,5.39,2.55),(.045,.74,.29),ivory,.009)
    box('vent recess',(7.943,5.39,2.55),(.006,.68,.235),graphite,.001)
    for i in range(7):
        blade=box('vent louvre',(7.936,5.39,2.45+i*.033),(.021,.665,.013),ivory,.002)
    for y in (5.06,5.72):
        for z in (2.425,2.675):cyl('vent screw',(7.943,y,z),.003,.003,metal,(1,0,0))
    # Flush sealant joints add construction scale, not raised floor platforms.
    joint=lab.material('Context / floor joint sealant',(.085,.10,.09),.92)
    for name,vertices in (
        ('south floor joint',[(.02,1.099,.00005),(7.98,1.099,.00005),(7.98,1.101,.00005),(.02,1.101,.00005)]),
        ('east floor joint',[(7.099,.02,.00005),(7.101,.02,.00005),(7.101,6.47,.00005),(7.099,6.47,.00005)])):
        g.mesh_object('Context / '+name,vertices,[(0,1,2,3)],c,joint)
    personal=lab.load_py('lab_room',lab.ROOT/'reel/world/lab_room.py').enrich(lab)
    supports=storage_supports(lab)
    details=lab.load_py('lab_details',lab.ROOT/'reel/world/lab_details.py').enrich(lab)
    return {'objects':len(c.objects),'storage_supports':supports,'personal_workshop':personal,'details':details,'clear_floor_lanes':True,'desk_top_m':.76,
            'context':['north service storage','parts bins','bench instruments','service cart','desk frame','stool','chair','tool tray','outlet raceway','hanging lead rail','wall ventilation','flush floor joints']}
