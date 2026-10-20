"""Original room details: sheer window, connected workshop props and light wear.

All geometry is authored in metres. Existing projects, camera and moving coax
are preserved; no reference screenshots or generated image textures are used.
"""
import math
import random
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


class Author:
    def __init__(self, lab):
        self.lab, self.g = lab, lab.geometry()
        old = bpy.data.collections.get('Room / lived-in details')
        if old:
            for obj in list(old.objects):bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.collections.remove(old)
        self.collection = lab.new_collection('Room / lived-in details')
        self.black = lab.material('Detail / cable rubber', (.014,.019,.018), .72)
        self.metal = lab.material('Detail / satin nickel', (.43,.47,.46), .32)
        lab.principled(self.metal).inputs['Metallic'].default_value = .82
        self.brass = lab.material('Detail / aged brass', (.28,.205,.10), .40)
        lab.principled(self.brass).inputs['Metallic'].default_value = .76
        self.ivory = lab.material('Detail / painted ivory', (.63,.61,.54), .70)
        self.ink = lab.material('Detail / printed label ink', (.025,.032,.029), .90)
        self.paper = lab.material('Detail / label paper', (.69,.66,.57), .92)

    def mesh(self, name, vertices, faces, mat):
        return self.g.mesh_object('Detail / '+name, vertices, faces, self.collection, mat)

    def box(self, name, center, size, mat, bevel=.001):
        vertices = [(x*size[0]/2,y*size[1]/2,z*size[2]/2)
                    for x,y,z in ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                                   (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))]
        obj = self.mesh(name,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
        obj.location = center
        if bevel:
            edge=obj.modifiers.new('Small manufactured edge','BEVEL');edge.width=bevel;edge.segments=3
            obj.modifiers.new('Face normals','WEIGHTED_NORMAL')
        return obj

    def lathe(self, name, center, profile, mat, axis=(0,0,1), count=48):
        vertices=[];rings=[];faces=[]
        for radius,z in profile:
            ring=[]
            for i in range(1 if radius==0 else count):
                ring.append(len(vertices));angle=math.tau*i/count
                vertices.append((radius*math.cos(angle),radius*math.sin(angle),z))
            rings.append(ring)
        for a,b in zip(rings,rings[1:]):
            if len(a)==len(b)==1:continue
            for i in range(count):
                j=(i+1)%count
                if len(a)==1:faces.append((a[0],b[j],b[i]))
                elif len(b)==1:faces.append((a[i],a[j],b[0]))
                else:faces.append((a[i],a[j],b[j],b[i]))
        obj=self.mesh(name,vertices,faces,mat);obj.location=center
        obj.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler()
        for face in obj.data.polygons:
            zs=[obj.data.vertices[i].co.z for i in face.vertices]
            face.use_smooth=max(zs)-min(zs)>1e-8
        return obj

    def cyl(self, name, center, radius, depth, mat, axis=(0,0,1)):
        return self.lathe(name,center,[(0,-depth/2),(radius,-depth/2),(radius,depth/2),(0,depth/2)],mat,axis)

    def wire(self, name, points, radius=.0018, mat=None):
        # Dense Catmull samples make cables curved rather than hinged segments.
        controls=[Vector(p) for p in points];dense=[]
        for i in range(len(controls)-1):
            a,b,c,d=[controls[max(0,min(len(controls)-1,j))] for j in (i-1,i,i+1,i+2)]
            for step in range(8):
                t=step/8
                dense.append(.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
        dense.append(controls[-1])
        for point in dense:
            point.z=max(point.z,radius+.00005)
            if name=='desk lamp power cord' and 4.4<=point.x<=6.7 and 4.2<=point.y<=5.1:
                point.z=max(point.z,.760+radius)
        return self.g.pipe_mesh('Detail / '+name,dense,radius,self.collection,mat or self.black,sides=10)

    def screw(self, name, p, axis=(0,0,1), radius=.003):
        axis=Vector(axis).normalized();p=Vector(p)
        obj=self.cyl(name+' head',p+axis*.0007,radius,.0014,self.metal,axis)
        slot=self.box(name+' slot',p+axis*.00143,(radius*1.35,radius*.23,.00005),self.black,0)
        slot.rotation_euler=obj.rotation_euler
        return obj

    def text(self, name, body, p, height=.005, rotation=(math.pi/2,0,0)):
        curve=bpy.data.curves.new('Detail / '+name,'FONT');curve.body=body
        curve.size=height;curve.align_x='CENTER';curve.align_y='CENTER';curve.extrude=0
        font_path=Path('C:/Windows/Fonts/arial.ttf')
        if font_path.is_file():
            font=next((f for f in bpy.data.fonts if Path(bpy.path.abspath(f.filepath))==font_path),None)
            curve.font=font or bpy.data.fonts.load(str(font_path))
            if hasattr(curve.font,'pack'):curve.font.pack()
        obj=bpy.data.objects.new('Detail / '+name,curve);self.collection.objects.link(obj)
        obj.location=p;obj.rotation_euler=rotation;curve.materials.append(self.ink)
        return obj


def original_matrix(obj):
    if 'detail_base_matrix' not in obj:obj['detail_base_matrix']=[v for row in obj.matrix_world for v in row]
    values=obj['detail_base_matrix']
    return Matrix([values[i:i+4] for i in range(0,16,4)])


def original_mesh(obj):
    if 'detail_base_vertices' not in obj:
        obj.data=obj.data.copy();obj['detail_base_vertices']=[v for point in obj.data.vertices for v in point.co]
    values=obj['detail_base_vertices']
    for i,point in enumerate(obj.data.vertices):point.co=values[i*3:i*3+3]


def window(a):
    lab=a.lab;spec=lab.WORLD['room']['details']['curtain']
    linen=lab.material('Detail / ivory sheer linen',(.78,.74,.65),.96)
    tree=linen.node_tree;n=tree.nodes;l=tree.links;n.clear()
    output=n.new('ShaderNodeOutputMaterial');surface=n.new('ShaderNodeBsdfPrincipled')
    surface.inputs['Base Color'].default_value=(.78,.74,.65,1)
    surface.inputs['Roughness'].default_value=.96;surface.inputs['Sheen Weight'].default_value=.22
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1600
    position=n.new('ShaderNodeNewGeometry');l.new(position.outputs['Position'],noise.inputs['Vector'])
    bump=n.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.00008;bump.inputs['Strength'].default_value=.15
    l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],surface.inputs['Normal'])
    translucent=n.new('ShaderNodeBsdfTranslucent');translucent.inputs['Color'].default_value=(.88,.84,.76,1)
    weave=n.new('ShaderNodeMixShader');weave.inputs[0].default_value=.62
    l.new(surface.outputs[0],weave.inputs[1]);l.new(translucent.outputs[0],weave.inputs[2])
    transparent=n.new('ShaderNodeBsdfTransparent');transparent.inputs[0].default_value=(.94,.93,.90,1)
    sheer=n.new('ShaderNodeMixShader');sheer.inputs[0].default_value=.25
    l.new(weave.outputs[0],sheer.inputs[1]);l.new(transparent.outputs[0],sheer.inputs[2]);l.new(sheer.outputs[0],output.inputs[0])
    y0,y1=spec['y_range_m'];bottom,top=spec['bottom_m'],spec['top_m']
    def point(u,v,offset=0):
        return (.150+(.025+.009*(1-v))*math.sin(u*math.tau*8+.18*math.sin(math.pi*v))+offset,
                y0+(y1-y0)*u+.008*math.sin(math.pi*u)*(1-v),
                bottom+(top-bottom)*v+.002*math.sin(u*math.tau*8)*(1-v))
    def fabric(name,ua,ub,va,vb,cols,rows,offset=0):
        vertices=[point(ua+(ub-ua)*i/cols,va+(vb-va)*j/rows,offset)
                  for j in range(rows+1) for i in range(cols+1)]
        faces=[(j*(cols+1)+i,j*(cols+1)+i+1,(j+1)*(cols+1)+i+1,(j+1)*(cols+1)+i)
               for j in range(rows) for i in range(cols)]
        obj=a.mesh(name,vertices,faces,linen)
        for face in obj.data.polygons:face.use_smooth=True
        return obj
    fabric('curtain sheer',0,1,0,1,96,64)
    fabric('curtain lower hem',0,1,0,.018/(top-bottom),96,2,.0008)
    fabric('curtain header',0,1,1-.035/(top-bottom),1,96,3,.0008)
    for ua,ub in ((0,.008/(y1-y0)),(1-.008/(y1-y0),1)):
        fabric('curtain side hem',ua,ub,0,1,2,64,.0008)
    rail_z=spec['rail_height_m']
    a.cyl('curtain rail',(.165,4.4,rail_z),.0075,2.64,a.brass,(0,1,0))
    for y in (3.08,5.72):a.cyl('curtain rail end cap',(.165,y,rail_z),.012,.014,a.brass,(0,1,0))
    for y in (3.12,5.68):
        a.box('rail bracket plate',(.055,y,3.085),(.010,.038,.075),a.brass)
        a.cyl('rail bracket arm',(.113,y,rail_z),.006,.105,a.brass,(1,0,0))
        for z in (3.06,3.11):a.screw('rail fixing',(.061,y,z),(1,0,0),.003)
    for k in range(9):
        u=(k+.5)/9;x,y,z=point(u,1)
        a.wire('curtain ring',[(.165+.032*math.cos(t),y,rail_z-.0233+.032*math.sin(t))
                              for t in [math.tau*j/40 for j in range(41)]],.0012,a.brass)
        tab=a.mesh('curtain hanging tab',[(x,y-.006,top),(x,y+.006,top),(.165,y+.006,rail_z-.0553),(.165,y-.006,rail_z-.0553)],[(0,1,2,3)],linen)
        tab.modifiers.new('Woven tab thickness','SOLIDIFY').thickness=.0007
    glass=lab.material('Detail / thin window glazing',(.92,.96,1),.04)
    n=glass.node_tree.nodes;l=glass.node_tree.links;n.clear()
    output=n.new('ShaderNodeOutputMaterial');fresnel=n.new('ShaderNodeFresnel');fresnel.inputs['IOR'].default_value=1.46
    clear=n.new('ShaderNodeBsdfTransparent');clear.inputs[0].default_value=(.985,.995,1,1)
    reflection=n.new('ShaderNodeBsdfGlossy');reflection.inputs['Color'].default_value=(.94,.97,1,1);reflection.inputs['Roughness'].default_value=.035
    mix=n.new('ShaderNodeMixShader');l.new(fresnel.outputs[0],mix.inputs[0]);l.new(clear.outputs[0],mix.inputs[1]);l.new(reflection.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],output.inputs[0])
    for i in range(4):
        lo=3.2+i*.6+.033;hi=lo+.534
        for z0,z1 in ((1.176,2.024),(2.076,2.924)):
            a.mesh('window glazing', [(-.014,lo,z0),(-.014,hi,z0),(-.014,hi,z1),(-.014,lo,z1)],[(0,1,2,3)],glass)
            for y in (lo-.002,hi+.002):a.box('window gasket',(.031,y,(z0+z1)/2),(.003,.004,z1-z0+.008),a.black,.0004)
            for z in (z0-.002,z1+.002):a.box('window gasket',(.031,(lo+hi)/2,z),(.003,hi-lo+.008,.004),a.black,.0004)
    a.box('window latch plate',(.044,4.4,2.16),(.012,.028,.085),a.metal)
    a.cyl('window latch neck',(.062,4.4,2.16),.005,.025,a.metal,(1,0,0))
    a.cyl('window latch lever',(.077,4.4,2.137),.005,.053,a.metal)
    for z in (2.13,2.19):a.screw('window latch screw',(.050,4.4,z),(1,0,0),.0025)
    for z in (1.49,2.62):
        a.cyl('window hinge barrel',(.043,5.0,z),.006,.050,a.metal)
        a.box('window hinge leaf',(.036,4.982,z),(.004,.034,.038),a.metal,.0006)
    sill=bpy.data.objects['Window sill'];original_mesh(sill)
    # A 40 mm deeper sill supports the new plant saucer without overhang.
    inverse=sill.matrix_world.inverted().to_3x3();shift=inverse@Vector((.04,0,0))
    maximum=max(v.co.x for v in sill.data.vertices)
    for v in sill.data.vertices:
        if abs(v.co.x-maximum)<1e-6:v.co+=shift
    sill.data.update()
    sky=lab.material('Detail / exterior sky',(0,0,0),1)
    node=lab.principled(sky);node.inputs['Emission Color'].default_value=(.30,.43,.62,1)
    node.inputs['Emission Strength'].default_value=.358
    card=a.box('distant sky',(-16,6,4),(.02,36,20),sky,0)
    card.visible_shadow=False;card.visible_diffuse=False
    stone=lab.material('Detail / distant masonry',(.19,.22,.24),.94)
    roof=lab.material('Detail / distant roof',(.10,.13,.15),.90)
    a.box('neighbor building',(-8.6,8.6,.8),(.2,8,3.1),stone,.03)
    a.box('neighbor parapet',(-8.4,8.6,2.41),(.40,8.3,.15),roof,.02)
    for y in (5.8,7.6,9.4,11.2):a.box('distant window',(-8.485,y,1.26),(.012,.70,.90),roof,.015)
    bark=lab.material('Detail / distant bark',(.055,.06,.046),.96)
    greens=[lab.material('Detail / exterior leaves '+str(i),color,.92)
            for i,color in enumerate(((.055,.105,.069),(.079,.127,.060),(.043,.083,.054)))]
    ground=lab.material('Detail / exterior ground',(.065,.078,.055),.96)
    a.box('exterior ground',(-9,7,-.055),(17,36,.05),ground,0)
    rng=random.Random(149)
    for x,y,z in ((-4.8,6.9,2.8),(-6.0,10.8,3.2)):
        a.cyl('distant tree trunk',(x,y,z*.43),.065,z*.86,bark)
        vertices=[];faces=[];materials=[]
        for i in range(10):
            angle=i*2.39996
            center=Vector((x+.58*math.cos(angle),y+.70*math.sin(angle),z+.42*math.sin(i*1.4)))
            start=Vector((x,y,z*.58+i*.035))
            a.wire('exterior tree branch',[start,start.lerp(center,.5)+Vector((0,0,.12)),center],.009,bark)
            for j in range(150):
                direction=Vector((rng.gauss(0,1),rng.gauss(0,1),rng.gauss(0,1))).normalized()
                p=center+Vector((direction.x*.60,direction.y*.65,direction.z*.51))*rng.random()**.333
                axis=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-.3,.8))).normalized()
                side=axis.cross(Vector((0,0,1))).normalized()
                length=rng.uniform(.035,.065);width=length*.40;k=len(vertices)
                vertices.extend((p-axis*length,p-side*width,p+axis*length,p+side*width,p+Vector((0,0,.004))))
                faces.extend(((k,k+1,k+4),(k+1,k+2,k+4),(k+2,k+3,k+4),(k+3,k,k+4)))
                materials.extend([rng.randrange(3)]*4)
        obj=a.mesh('exterior tree foliage',vertices,faces,greens[0])
        for mat in greens[1:]:obj.data.materials.append(mat)
        for face,index in zip(obj.data.polygons,materials):face.material_index=index
    return {'curtain_coverage_m':y1-y0,'uncovered_window_m':2.4-(y1-y0),'glazing_panes':8,'image_backdrops':False}


def workshop(a):
    lab=a.lab;g=a.g
    # Seat the existing enclosure on small pads without moving its attached coax.
    housing=g.world_bvh(bpy.data.objects['Aluminum Box Bottom'])
    for x in (1.872,2.020):
        for y in (4.443,4.530):
            hit,normal,index,distance=housing.ray_cast(Vector((x,y,.906)),Vector((0,0,1)),.025)
            if hit is None:raise RuntimeError('Matcher support pad missed the CAD underside')
            a.cyl('matcher support pad',(x,y,(.906+hit.z)/2),.006,hit.z-.906,a.black)
    # The grounding lead is separate from the moving RF coax.
    a.cyl('mat ground snap',(1.16,4.88,.9075),.006,.003,a.metal)
    a.cyl('mat ground cap',(1.16,4.88,.910),.0045,.002,a.black)
    a.wire('mat ground lead',[(1.16,4.88,.912),(1.155,4.927,.9121),(1.11,4.927,.9121)],.0011)
    coil=[(1.11-.30*t,4.927+.0055*math.sin(math.tau*30*t),.9066+.0055*math.cos(math.tau*30*t)) for t in [i/720 for i in range(721)]]
    g.pipe_mesh('Detail / mat coiled ground cord',coil,.0011,a.collection,a.black,sides=8)
    a.wire('mat frame bond lead',[(.81,4.927,.9121),(.69,4.94,.903),(.60,4.972,.884),(.59,4.975,.72),(.57,4.891,.68)],.0011)
    a.cyl('bench ground lug',(.57,4.889,.68),.008,.003,a.brass,(0,1,0));a.screw('bench bond bolt',(.57,4.891,.68),(0,1,0),.004)
    a.wire('desk lamp power cord',[(5.50,4.819,.770),(5.54,4.91,.764),(5.64,5.025,.762),(6.19,5.025,.762),(6.30,5.01,.775),(6.354,4.95,.807)],.0018)
    a.box('desk lamp plug',(6.37,4.95,.807),(.032,.026,.024),a.black,.003)
    a.cyl('desk plug strain relief',(6.350,4.95,.807),.003,.014,a.black,(1,0,0))
    for x in (5.70,6.14):
        a.box('desk cable clip',(x,5.025,.764),(.014,.012,.008),a.black,.002)
    a.wire('floor lamp power cord',[(7.55,5.34,.012),(7.67,5.39,.003),(7.79,5.93,.003),(7.72,6.36,.003),(7.30,6.411,.006),(7.30,6.411,.35),(7.30,6.411,.91),(7.30,6.415,.921)],.002)
    a.box('floor lamp wall plug',(7.30,6.415,.94),(.032,.030,.039),a.black,.003)
    for z in (.12,.48,.81):a.box('wall cord clip',(7.30,6.427,z),(.012,.014,.012),a.ivory,.002)
    # Reversible small placement variations, with every prop still supported.
    for i,angle,dx in ((1,.025,.008),(3,-.035,-.010),(5,.018,.006)):
        pivot=Vector((.65+i*.35,6.13,1.155));matrix=Matrix.Translation(pivot+Vector((dx,0,0)))@Matrix.Rotation(angle,4,'Z')@Matrix.Translation(-pivot)
        for obj in list(bpy.data.objects):
            if obj.name.startswith(f'Context / parts bin {i} '):obj.matrix_world=matrix@original_matrix(obj)
    for obj in list(bpy.data.objects):
        if obj.name.startswith(('Room detail / stacked book','Room detail / stacked page')):
            base=original_matrix(obj);obj.matrix_world=base
            center=sum((base@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
            if center.z>1.662:
                pivot=Vector((7.43,6.27,1.663));obj.matrix_world=Matrix.Translation(pivot+Vector((-.018,.008,-.003)))@Matrix.Rotation(-.075,4,'Z')@Matrix.Translation(-pivot)@base
    bpy.context.view_layer.update()
    labels=('CONNECTORS','HEADERS','PCB OFFCUTS','CAPACITORS','FASTENERS','WIRE')
    for i,body in enumerate(labels):
        plate=bpy.data.objects[f'Context / parts bin {i} label']
        points=[plate.matrix_world@v.co for v in plate.data.vertices];p=sum(points,Vector())/len(points)+Vector((0,-.00042,0))
        obj=a.text('parts bin label '+str(i),body,p,.0055)
        obj.rotation_euler=(plate.matrix_world.to_quaternion()@obj.rotation_euler.to_quaternion()).to_euler()
    for i,body in enumerate(('PCB OFFCUTS','SPARE BOARDS','WIRE')):
        a.text('lower bin label '+str(i),body,(.84+i*.30,4.38418,.2235),.0055)
    # Partial, supported contents agree with each bin's printed label.
    capacitor=lab.material('Detail / capacitor sleeves',(.025,.055,.065),.43)
    for i in (0,1,3,4,5):
        for obj in bpy.data.objects:
            if obj.name.startswith(f'Context / parts bin {i} offcut'):
                obj.hide_render=True;obj.hide_viewport=True
        prior=set(a.collection.objects);x=.65+i*.35;y=6.13;floor=1.169
        if i==0:
            for j in range(4):
                p=(x-.07+j*.046,y-.025+(j%2)*.063,floor+.007)
                a.cyl('bin connector barrel',p,.007,.027,a.metal,(0,1,0))
                a.cyl('bin connector insulator',(p[0],p[1]-.014,p[2]),.004,.002,a.ivory,(0,1,0))
        elif i==1:
            for j in range(3):
                cx=x-.065+j*.062;cy=y-.023+(j%2)*.06
                a.box('spare header strip',(cx,cy,floor+.003),(.034,.005,.006),a.black,.0004)
                for k in range(8):a.box('header pin',(cx-.014+k*.004,cy,floor+.010),(.0007,.0007,.014),a.brass,.0001)
        elif i==3:
            for j in range(5):
                cx=x-.08+j*.039;cy=y-.030+(j%2)*.073
                a.cyl('loose capacitor',(cx,cy,floor+.008),.006,.016,capacitor)
                a.cyl('capacitor top',(cx,cy,floor+.016),.0052,.0003,a.metal)
        elif i==4:
            for j in range(6):
                cx=x-.09+j*.034;cy=y-.024+(j%2)*.063
                a.cyl('spare screw shank',(cx,cy,floor+.0045),.002,.023,a.metal,(0,1,0))
                a.cyl('spare screw head',(cx,cy-.013,floor+.0045),.0045,.003,a.metal,(0,1,0))
        else:
            for j in range(2):
                cx=x-.057+j*.105
                for k in range(3):
                    radius=.028+k*.003
                    a.wire('bin wire coil',[(cx+radius*math.cos(t),y+radius*math.sin(t),floor+.0012)
                                            for t in [math.tau*m/64 for m in range(65)]],.0012)
        transform=bpy.data.objects[f'Context / parts bin {i} bottom'].matrix_world.copy()
        bpy.context.view_layer.update()
        for obj in set(a.collection.objects)-prior:obj.matrix_world=transform@obj.matrix_world
    for obj in bpy.data.objects:
        if obj.name.startswith('Context / under-bench bin 2 offcut'):
            obj.hide_render=True;obj.hide_viewport=True
    for k in range(4):
        radius=.037+k*.003
        a.wire('lower spare wire coil',[(1.44+radius*math.cos(t),4.51+radius*math.sin(t),.1997)
                                      for t in [math.tau*m/64 for m in range(65)]],.0012)
    # A real open tray, replacing the old solid block-in tray.
    old=bpy.data.objects.get('Context / empty repair tray')
    if old:old.hide_render=True;old.hide_viewport=True
    def tray(name,center,size,floor):
        x,y=center;w,d=size
        a.box(name+' bottom',(x,y,floor+.002),(w,d,.004),a.black,.002)
        for sign in (-1,1):
            a.box(name+' side',(x+sign*(w/2-.002),y,floor+.013),(.004,d,.026),a.black,.001)
            a.box(name+' end',(x,y+sign*(d/2-.002),floor+.013),(w-.008,.004,.026),a.black,.001)
        return floor+.004
    base=tray('repair tray',(2.18,6.13),(.45,.24),1.603)
    green=lab.material('Detail / spare PCB mask',(.025,.12,.07),.56)
    copper=lab.material('Detail / exposed PCB pads',(.39,.29,.10),.38);lab.principled(copper).inputs['Metallic'].default_value=.7
    a.box('unfinished repair PCB',(2.11,6.13,base+.001),(.13,.085,.002),green,.0005)
    for i in range(8):
        for sign in (-1,1):a.box('spare board pad',(2.075+i*.010,6.13+sign*.023,base+.0021),(.004,.007,.00015),copper,.0001)
    a.box('partly fitted IC',(2.095,6.13,base+.0035),(.025,.012,.003),a.black,.0004)
    for i in range(4):
        a.box('loose repair component',(2.23+i*.019,6.11+(i%2)*.028,base+.002),(.008,.004,.004),a.black,.0004)
    spare_floor=tray('bench connector tray',(.81,4.52),(.18,.11),.900)
    for i in range(3):
        p=Vector((.765+i*.037,4.52+(i%2)*.017,spare_floor+.0078))
        a.lathe('spare coax socket',p,[(.002,-.013),(.006,-.013),(.006,-.004),(.0075,-.004),(.0075,.006),(.0048,.006),(.0048,.015),(.002,.015),(.002,-.013)],a.metal,(1,0,0))
        for shift in (-.002,.001,.004):a.cyl('socket thread',p+Vector((shift,0,0)),.0078,.0007,a.metal,(1,0,0))
        a.cyl('socket dielectric',p+Vector((.0152,0,0)),.0037,.001,a.ivory,(1,0,0))
        a.cyl('socket brass contact',p+Vector((.016,0,0)),.0008,.003,a.brass,(1,0,0))
    # Visible wall/ledge hardware, without adding invented readings or logos.
    for x in (6.82,7.62):
        for z in (1.52,1.58):a.screw('book ledge fixing',(x,6.294,z),(0,-1,0),.003)
    return {'grounded_mat':True,'lamp_cords':2,'bin_labels':9,'spare_sockets':3,'partly_populated_repair_board':True}


def plants(a):
    specs=(('window plant',Vector((.075,5.30,1.148)),1.05,1.1475),
           ('shelf plant',Vector((.75,6.14,2.125)),.95,2.123),
           ('corner plant',Vector((7.42,5.92,0)),3.2,0))
    clay=a.lab.material('Detail / clay saucers',(.22,.10,.055),.88)
    for name,base,scale,support in specs:
        delta=Vector((0,0,support+.004*scale-base.z))
        leaves=[]
        for obj in list(bpy.data.objects):
            if not obj.name.startswith('Room detail / '+name):continue
            obj.matrix_world=Matrix.Translation(delta)@original_matrix(obj)
            if obj.type!='MESH':continue
            if 'leaf' in obj.name:leaves.append(obj)
            if 'leaf' in obj.name or 'stem' in obj.name or 'soil' in obj.name:original_mesh(obj)
            if 'soil' in obj.name:
                top=max(v.co.z for v in obj.data.vertices)
                for v in obj.data.vertices:
                    if abs(v.co.z-top)<1e-6:v.co.z+=.0014*scale*math.sin(v.co.x*173+v.co.y*197)
        for k,obj in enumerate(sorted(leaves,key=lambda o:o.name)):
            pivot=sum((obj.data.vertices[i].co for i in range(3)),Vector())/3
            rotation=Matrix.Rotation((k%5-2)*.045,3,'Z')
            for vertex in obj.data.vertices:
                local=vertex.co-pivot;t=min(1,local.length/(.15*scale))
                vertex.co=pivot+rotation@local
                vertex.co.z+=.007*scale*math.sin(k*1.7)*t*t
        if name=='window plant':
            for obj in list(bpy.data.objects):
                if obj.name.startswith('Room detail / '+name) and obj.type=='MESH' and ('leaf' in obj.name or 'stem' in obj.name):
                    inverse=obj.matrix_world.inverted()
                    for v in obj.data.vertices:
                        p=obj.matrix_world@v.co
                        if p.x<.025:p.x=.025+(.025-p.x)*.15;v.co=inverse@p
        a.lathe(name+' saucer',(base.x,base.y,support),
                [(0,0),(.083*scale,0),(.090*scale,.004*scale),(.090*scale,.012*scale),
                 (.083*scale,.012*scale),(.078*scale,.004*scale),(0,.004*scale)],clay)
    return {'saucers':3,'supported_pot_bases':True,'window_leaves_clear_glazing':True}


def wear(lab):
    """Small roughness-only polish near handles, worktop edges and cart casters."""
    def start(mat):
        tree=mat.node_tree;n=tree.nodes;l=tree.links;bsdf=lab.principled(mat)
        current=bsdf.inputs['Roughness'].links[0].from_socket if bsdf.inputs['Roughness'].is_linked else None
        if current and not current.node.name.startswith('Detail wear /'):
            source=current
            mat['detail_roughness_node']=source.node.name;mat['detail_roughness_socket']=source.name
            mat['detail_roughness_value']=bsdf.inputs['Roughness'].default_value
        elif 'detail_roughness_node' in mat:
            node=n.get(mat['detail_roughness_node']);source=node.outputs[mat['detail_roughness_socket']] if node else None
        else:
            source=bsdf.inputs['Roughness'].links[0].from_socket if bsdf.inputs['Roughness'].is_linked else None
            mat['detail_roughness_node']=source.node.name if source else ''
            mat['detail_roughness_socket']=source.name if source else ''
            mat['detail_roughness_value']=bsdf.inputs['Roughness'].default_value
        for node in list(n):
            if node.name.startswith('Detail wear /'):n.remove(node)
        def node(kind):
            obj=n.new(kind);obj.name='Detail wear / '+obj.name;return obj
        p=node('ShaderNodeNewGeometry').outputs['Position']
        def distance(center,scale=(1,1,1)):
            sub=node('ShaderNodeVectorMath');sub.operation='SUBTRACT';l.new(p,sub.inputs[0]);sub.inputs[1].default_value=center
            stretch=node('ShaderNodeVectorMath');stretch.operation='MULTIPLY';l.new(sub.outputs[0],stretch.inputs[0]);stretch.inputs[1].default_value=scale
            length=node('ShaderNodeVectorMath');length.operation='LENGTH';l.new(stretch.outputs[0],length.inputs[0]);return length.outputs['Value']
        def falloff(value,inner,outer):
            ramp=node('ShaderNodeMapRange');ramp.clamp=True;ramp.inputs['From Min'].default_value=inner;ramp.inputs['From Max'].default_value=outer
            ramp.inputs['To Min'].default_value=1;ramp.inputs['To Max'].default_value=0;l.new(value,ramp.inputs['Value']);return ramp.outputs['Result']
        def maximum(masks):
            result=masks[0]
            for value in masks[1:]:
                add=node('ShaderNodeMath');add.operation='MAXIMUM';l.new(result,add.inputs[0]);l.new(value,add.inputs[1]);result=add.outputs[0]
            return result
        def finish(mask,strength):
            multiply=node('ShaderNodeMath');multiply.operation='MULTIPLY';l.new(mask,multiply.inputs[0]);multiply.inputs[1].default_value=strength
            add=node('ShaderNodeMath');add.operation='ADD';l.new(multiply.outputs[0],add.inputs[1])
            if source:l.new(source,add.inputs[0])
            else:add.inputs[0].default_value=mat['detail_roughness_value']
            l.new(add.outputs[0],bsdf.inputs['Roughness'])
        return node,p,distance,falloff,maximum,finish
    mat=bpy.data.materials.get('Context / cabinet enamel')
    if mat:
        node,p,distance,falloff,maximum,finish=start(mat)
        centers=[(x,5.87,z+.023) for x in (.78,1.58,2.38) for z in (.26,.52,.72)]
        centers.extend((6.23,4.37,z) for z in (.19,.43,.60))
        finish(maximum([falloff(distance(c,(1,1.5,1.4)),.015,.080) for c in centers]),-.07)
    for name in ('Bench / photographed oak veneer','Desk / satin photographed oak veneer'):
        mat=bpy.data.materials.get(name)
        if mat:
            node,p,distance,falloff,maximum,finish=start(mat)
            # Elliptical hand-contact regions; color and photographed grain stay intact.
            finish(maximum([falloff(distance(c,(.14,1,1)),.015,.042) for c in ((1.55,3.965,.895),(5.45,4.215,.755))]),-.055)
    mat=bpy.data.materials.get('Room / epoxy floor')
    if mat:
        node,p,distance,falloff,maximum,finish=start(mat);masks=[]
        for c in ((3.20,5.15,0),(3.76,5.15,0)):
            radius=distance(c,(1,1,0));sub=node('ShaderNodeMath');sub.operation='SUBTRACT';l=mat.node_tree.links;l.new(radius,sub.inputs[0]);sub.inputs[1].default_value=.11
            absolute=node('ShaderNodeMath');absolute.operation='ABSOLUTE';l.new(sub.outputs[0],absolute.inputs[0]);masks.append(falloff(absolute.outputs[0],.001,.004))
        finish(maximum(masks),.035)


def enrich(lab):
    a=Author(lab)
    report={'window':window(a),'workshop':workshop(a),'plants':plants(a)}
    wear(lab)
    report['objects']=len(a.collection.objects)
    report['roughness_wear_only']=True
    return report
