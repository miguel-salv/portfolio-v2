"""The isolated home-motion study. Original source scenes are read-only inputs.

Blender --background --python reel/studies/home-motion/render.py -- --keys
Blender --background --python reel/studies/home-motion/render.py -- --film
Every encoded frame is rendered in Cycles, including intermediate poses.
"""
from pathlib import Path
from datetime import datetime, timezone
from math import radians, sin, cos, pi, exp, log
import argparse, json, subprocess, sys, hashlib
import bpy
from mathutils import Vector, Matrix, Euler, Quaternion
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'reel'))
from workbench_world import aim,configure,box,material,bounds
from workbench.embed_xmp import embed
OUT=ROOT/'public/assets/studies/home-motion'
WORK=ROOT/'.impeccable/renders/home-motion'
SOURCE=ROOT/'reel/studies/home-motion'
FPS=30
COUNTS={'hero-push':49,'shaft-to-drive':120,'bottle-collect':120}
UNCERTAINTY='Matcher mounting geometry follows original CAD. Capacitor contours and plate details, hidden chassis dimensions, robot wiring, lab surroundings and bottle are presentation reconstructions from existing photographs. Motion is modeled mechanism behavior, not measured telemetry.'
# One spin carries across the match cut: the C1 shaft and the front-left wheel
# turn at the same rate, in the same screen direction.
SPIN=radians(3)
WHEEL_RADIUS=.75*.854
WHEEL_PHASE=radians(0)
NUT=Vector((-1.756322,.407,-.243362))
HUB=Vector((1.764,1.789,-.5225))
CAR=Vector((.4,0,-.25))
DIVE_WIDTH=.62
CUT_LENS=32
HOLD_AHEAD=4.2
PASS_GAP=.04
# Below the axle so the hub nut clears the lens; the rubber band is r .5-.647.
PASS_OFFSET=.575
# Matcher washer and vehicle hub cap are the matched outer discs.
HUB_WIDTH=DIVE_WIDTH*.1/.19
EXIT_ACCELERATION=2*HOLD_AHEAD/19**2
BOUNCE=NUT+Vector((.06,-.084,.09))
ARM_CLOSE=12
DEEPER=.42
# The locknut sits inside the open-top box behind its front wall; it is only
# visible looking down over that wall.
APPROACH=Vector((sin(radians(40))*cos(radians(50)),-cos(radians(40))*cos(radians(50)),sin(radians(50))))

def smooth(x):
    x=max(0,min(1,x));return x*x*(3-2*x)

def ease_in(u):
    u=max(0,min(1,u));return (3*u*u-u**3)/2

def ease_out(v):return 1-ease_in(1-v)

def turn(a,b,t):
    return Quaternion((1,0,0,0)).slerp(a.rotation_difference(b),t)@a

def shaft_spin(frame):
    x=(frame-4)/16
    return -SPIN*16*(0 if x<=0 else (x**3-x**4/2 if x<1 else x-.5))

def vehicle_travel(frame):
    v0=SPIN*WHEEL_RADIUS;s=max(0,min(50,frame-45))
    travel=v0*s-v0*s*s/100
    if frame>100:travel+=EXIT_ACCELERATION*(frame-100)**2/2
    return travel

def vehicle_speed(frame):
    if frame>=100:return EXIT_ACCELERATION*(frame-100)
    return SPIN*WHEEL_RADIUS*max(0,1-max(0,frame-45)/50)

def lerp(a,b,t):return Vector(a).lerp(Vector(b),t)

def camera_key(keys,frame):
    """Shape-preserving cubic camera channel, continuous through authored keys."""
    if frame<=keys[0][0]:return keys[0][1]
    if frame>=keys[-1][0]:return keys[-1][1]
    slopes=[(b[1]-a[1])/(b[0]-a[0]) for a,b in zip(keys,keys[1:])]
    tangent=[0.0]
    for i in range(1,len(keys)-1):
        a,b=slopes[i-1],slopes[i]
        if a*b<=0:tangent.append(0.0)
        else:
            h0=keys[i][0]-keys[i-1][0];h1=keys[i+1][0]-keys[i][0]
            w0=2*h1+h0;w1=h1+2*h0;tangent.append((w0+w1)/(w0/a+w1/b))
    tangent.append(slopes[-1])
    i=next(i for i in range(len(keys)-1) if keys[i][0]<=frame<keys[i+1][0])
    a,b=keys[i],keys[i+1];h=b[0]-a[0];u=(frame-a[0])/h
    return (2*u**3-3*u*u+1)*a[1]+(u**3-2*u*u+u)*h*tangent[i]+(-2*u**3+3*u*u)*b[1]+(u**3-u*u)*h*tangent[i+1]

def camera_vector(keys,frame):
    return Vector(tuple(camera_key([(f,v[axis]) for f,v in keys],frame) for axis in range(3)))

def set_matrix(obj,matrix):
    if max(abs(obj.matrix_world[r][c]-matrix[r][c]) for r in range(4) for c in range(4))>1e-7:obj.matrix_world=matrix

def new_camera(scene):
    for o in list(scene.objects):
        if o.type=='CAMERA':bpy.data.objects.remove(o,do_unlink=True)
    cam=bpy.data.objects.new('Study camera',bpy.data.cameras.new('Study camera'))
    scene.collection.objects.link(cam);scene.camera=cam
    cam.data.clip_start=.008;cam.data.clip_end=300
    return cam

def load_matcher():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'reel/workbench/matcher-workbench.blend'))
    scene=bpy.context.scene
    names=set(json.loads((ROOT/'public/assets/matcher/manifest.json').read_text()).get('x',[])) if (ROOT/'public/assets/matcher/manifest.json').exists() else set()
    # Hardware names are the exact monograph meshes, not workbench props.
    hardware=[o for o in scene.objects if o.type=='MESH' and not any(k in o.name for k in ('Laboratory work surface','ESD ','Mat ','schematic','Driver','driver','BNC ','Connector','connector','Precision','Printed project','Unnamed'))]
    # Recover the unambiguous matcher mesh set from the unchanged source library.
    with bpy.data.libraries.load(str(ROOT/'reel/workbench/matcher-spatial-library.blend'),link=False) as (src,dst):
        names=set(n.replace('matcher::','') for n in src.objects)
    hardware=[o for o in scene.objects if o.name in names]
    if len(hardware)<30:raise RuntimeError('Matcher mesh ownership could not be recovered')
    return scene,hardware

def add_library(name,origin):
    with bpy.data.libraries.load(str(ROOT/'reel/workbench'/f'{name}-spatial-library.blend'),link=False) as (src,dst):dst.collections=[name+'Subject']
    coll=dst.collections[0];bpy.context.scene.collection.children.link(coll)
    objects=list(coll.all_objects)
    bpy.context.view_layer.update()
    transforms={o:o.matrix_world.copy() for o in objects}
    for o in objects:o.animation_data_clear();o.parent=None
    for o,matrix in transforms.items():o.matrix_world=Matrix.Translation(origin)@matrix
    if name=='vehicle':
        # Source circumferences are sufficient at catalogue scale. The macro
        # cut needs continuous turned edges; six-sided nuts remain six-sided.
        for o in objects:
            kind=next((k for k in ('hub_cap','washer','stud') if o.name.endswith('_'+k) and 'Wheel_' in o.name),None)
            if not kind:continue
            radius,depth={'hub_cap':(.117,.045),'washer':(.104,.016),'stud':(.055,.06)}[kind]
            mats=list(o.data.materials)
            bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=radius,depth=depth)
            temp=bpy.context.object;mesh=temp.data.copy();bpy.data.objects.remove(temp,do_unlink=True);o.data=mesh
            for mat in mats:mesh.materials.append(mat)
            for mod in o.modifiers:
                if mod.type=='BEVEL':mod.segments=5
            for face in mesh.polygons:face.use_smooth=len(face.vertices)==4
            o.modifiers.new('Macro turned edge normals','WEIGHTED_NORMAL')
        # Proportions of the matcher's locknut on its washer, for the match cut.
        turned=turned_aluminum('Macro wheel turned aluminum',1700)
        for o in objects:
            if 'Wheel_' not in o.name or not any(o.name.endswith('_'+k) for k in ('hub_cap','washer','stud','nut')):continue
            if o.name.endswith('_nut'):
                c=o.matrix_world@(sum((Vector(v) for v in o.bound_box),Vector())/8)
                o.matrix_world=Matrix.Translation(c)@Matrix.Diagonal((1.25,1,1.25,1))@Matrix.Translation(-c)@o.matrix_world
            o.data.materials.clear();o.data.materials.append(turned)
    bpy.context.view_layer.update()
    return objects

def turned_aluminum(name,texture):
    polished=material(name,(.53,.55,.57),.25,.96,texture=texture)
    bump=next((n for n in polished.node_tree.nodes if n.type=='BUMP'),None)
    if bump:bump.inputs['Strength'].default_value=.035;bump.inputs['Distance'].default_value=.0002
    return polished

def surface(name,color,scale=80,roughness=.6):
    mat=material(name,color,roughness,texture=scale)
    n=mat.node_tree.nodes;l=mat.node_tree.links;b=n.get('Principled BSDF')
    tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=4;tex.inputs['Detail'].default_value=3
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=tuple(c*.85 for c in color)+(1,);ramp.color_ramp.elements[1].color=tuple(min(1,c*1.06) for c in color)+(1,)
    l.new(tex.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],b.inputs['Base Color'])
    return mat

def floor_environment(name,objects,origin):
    low=min((o.matrix_world@v.co).z for o in objects if o.type=='MESH' and 'Bottle' not in o.name for v in o.data.vertices)
    if name=='robot':
        wheel=[o for o in objects if 'RubberWheel' in o.name or 'Tread_' in o.name]
        low=min((o.matrix_world@v.co).z for o in wheel for v in o.data.vertices)
        bottle=min((o.matrix_world@v.co).z for o in objects if 'BottleBody' in o.name for v in o.data.vertices)
        for o in objects:
            if 'Bottle' in o.name:o.location.z+=low-bottle
    base=surface('Photograph-referenced ivory vinyl tile' if name=='robot' else 'Polished laboratory concrete',(.47,.43,.35) if name=='robot' else (.39,.405,.40),100 if name=='robot' else 70,.35 if name=='robot' else .49)
    floor=box(name+' continuous floor',origin+Vector((0,0,low-origin.z-.11)),(95,95,.2),base,.01)
    if name=='robot':
        seam=material('Worn tile joints',(.16,.15,.13),.92)
        for i in range(-9,10):
            x=origin.x+i*2.7;y=origin.y+i*2.7
            box('Tile seam vertical',(x,origin.y,low-.008),(.010,50,.008),seam,0)
            box('Tile seam horizontal',(origin.x,y,low-.008),(50,.010,.008),seam,0)
        # Quiet offset dark band matches the worn institutional tile context.
        strip=surface('Documentary darker tile band',(.235,.228,.203),120,.43)
        box('Offset tile band',(origin.x,origin.y+4.05,low-.004),(45,.31,.006),strip,0)
    else:
        seam=material('Concrete expansion joint',(.19,.20,.20),.8)
        box('Floor joint',(origin.x,origin.y+4.8,low-.007),(80,.018,.008),seam,0)
    return low

def station_lights(scene,origin,name):
    for label,pos,power,size,color in [
        ('soft north window',(-4,-6,9),1700,7,(.86,.92,1)),
        ('warm room bounce',(7,3,7),950,6,(1,.86,.69)),
        ('grazing detail',(0,8,3),580,3,(.90,.94,1))]:
        data=bpy.data.lights.new(name+' '+label,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
        obj=bpy.data.objects.new(name+' '+label,data);scene.collection.objects.link(obj);obj.location=origin+Vector(pos);aim(obj,origin)

def camera_set(cam,position,target,span=None,lens=50,focus=None,fstop=7):
    cam.location=position;aim(cam,target)
    cam.data.sensor_fit='AUTO'
    cam.data.type='ORTHO' if span is not None else 'PERSP'
    if span is not None:cam.data.ortho_scale=span
    else:cam.data.lens=lens
    cam.data.dof.use_dof=focus is not None
    if focus is not None:
        cam.data.dof.focus_distance=(Vector(focus)-cam.location).length;cam.data.dof.aperture_fstop=fstop

def setup(shot,orientation,samples,theme='light'):
    scene,matcher=load_matcher();cam=new_camera(scene)
    from render_workbench import apply_theme
    apply_theme(theme=='dark')
    groups={'matcher':matcher};origins={'vehicle':Vector((80,0,0)),'robot':Vector((160,0,0))}
    bases={};floors={};wipe_data=None
    if shot=='shaft-to-drive':
        groups['vehicle']=add_library('vehicle',origins['vehicle']);floors['vehicle']=floor_environment('vehicle',groups['vehicle'],origins['vehicle']);station_lights(scene,origins['vehicle'],'vehicle')
        data=bpy.data.lights.new('Macro inspection bounce','AREA');data.energy=2;data.size=.16;data.color=(1,.97,.92)
        obj=bpy.data.objects.new('Macro inspection bounce',data);scene.collection.objects.link(obj);obj.location=BOUNCE;aim(obj,NUT)
        for o in matcher:
            if o.name in ('C1 front shaft bearing','C1 front shaft washer','C1 front hex bearing locknut'):
                o.data.materials.clear();o.data.materials.append(turned_aluminum('Macro capacitor turned aluminum '+o.name,800))
    if shot=='bottle-collect':
        # Matcher stage is completely outside the camera; don't retain its lights.
        for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
        scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.66,.69,.72,1)
        scene.world.node_tree.nodes['Background'].inputs[1].default_value=.18
        cam=new_camera(scene)
        groups={'robot':add_library('robot',origins['robot'])};floors['robot']=floor_environment('robot',groups['robot'],origins['robot']);station_lights(scene,origins['robot'],'robot')
        robot_lights=[o for o in scene.objects if o.type=='LIGHT']
        wipe=add_library('vehicle',Vector((0,0,0)));groups['wipe']=wipe
        receivers=bpy.data.collections.new('Foreground vehicle light receivers')
        for o in wipe:receivers.objects.link(o)
        robot_receivers=bpy.data.collections.new('Robot station light receivers')
        for o in scene.objects:
            if o.type=='MESH' and o not in wipe:robot_receivers.objects.link(o)
        for light in robot_lights:light.light_linking.receiver_collection=robot_receivers
        before=set(scene.objects);station_lights(scene,Vector((0,0,0)),'Foreground vehicle')
        config=json.loads((ROOT/'reel/matcher_studio.json').read_text())
        # The distant original bench emitters also remain part of the source
        # vehicle illumination, in coordinates relative to its80-unit station.
        for item in config['lights']:
            data=bpy.data.lights.new('Foreground '+item['name'],'AREA');data.energy=item['power'];data.shape='RECTANGLE';data.size=item['width'];data.size_y=item['height'];data.color=item['color']
            light=bpy.data.objects.new(data.name,data);scene.collection.objects.link(light);light.location=Vector(item['position'])-Vector((80,0,0));aim(light,Vector((-80,0,0)))
        foreground_lights=[o for o in scene.objects if o.type=='LIGHT' and o not in before]
        for light in foreground_lights:light.light_linking.receiver_collection=receivers
        bpy.context.view_layer.update()
        source_camera=json.loads((OUT/f'shaft-to-drive-{orientation}.json').read_text())['frames'][-1]['camera']
        source_position=Vector(source_camera['position'])-Vector((80,0,0))
        source_matrix=Matrix.LocRotScale(source_position,Euler(source_camera['rotation']).to_quaternion(),Vector((1,1,1)))
        wipe_data={'sourceCamera':source_camera,'sourceMatrix':source_matrix,'sourcePosition':source_position,'floor':min((o.matrix_world@v.co).z for o in wipe if o.type=='MESH' for v in o.data.vertices),'lights':foreground_lights,'lightBases':{o.name:o.matrix_world.copy() for o in foreground_lights},'lightPowers':{o.name:o.data.energy for o in foreground_lights},'robotLights':robot_lights,'robotLightPowers':{o.name:o.data.energy for o in robot_lights},'worldColor':config['worldColor'],'worldStrength':config['worldStrength']}
    for name,objects in groups.items():bases[name]={o.name:o.matrix_world.copy() for o in objects}
    configure(scene,samples);scene.cycles.adaptive_threshold=.035;scene.cycles.seed=0;scene.cycles.use_animated_seed=False
    scene.render.image_settings.color_mode='RGB';scene.render.film_transparent=False;scene.render.fps=FPS
    scene.cycles.transparent_max_bounces=10
    # Bottle must have true clear PET, rather than the old opaque proxy.
    if 'robot' in groups:
        for o in groups['robot']:
            if any(k in o.name for k in ('BottleBody','BottleShoulder','BottleNeck')):
                for slot in o.material_slots:
                    if slot.material:
                        bsdf=slot.material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.83,.89,.88,1);bsdf.inputs['Transmission Weight'].default_value=.94;bsdf.inputs['Roughness'].default_value=.095;bsdf.inputs['IOR'].default_value=1.47
                shell=o.modifiers.new('Inferred thin PET wall','SOLIDIFY');shell.thickness=.007;shell.offset=-1
    motion=json.loads((ROOT/'reel/workbench/robot-spatial-motion.json').read_text())['motion'] if 'robot' in groups else None
    return {'scene':scene,'camera':cam,'groups':groups,'bases':bases,'origins':origins,'floors':floors,'motion':motion,'orientation':orientation,'shot':shot,'theme':theme,'wipe':wipe_data}

def pose_wheels(objects,bases,drift,travel,transform=Matrix.Identity(4)):
    for o in objects:
        m=bases[o.name].copy();wheelkey=next((k for k in ('front_left','rear_left','front_right','rear_right') if 'Wheel_'+k in o.name),None)
        if wheelkey and not any(o.name.endswith('_'+k) for k in ('bearing','knuckle','kingpin','steering_arm','axle')):
            rubber=next(x for x in objects if 'Wheel_'+wheelkey+'_rubber' in x.name);base=bases[rubber.name];pivot=base.translation
            axis=base.to_quaternion()@Vector((0,1,0))
            m=Matrix.Translation(pivot)@Matrix.Rotation(travel/WHEEL_RADIUS+WHEEL_PHASE,4,axis)@Matrix.Translation(-pivot)@m
        set_matrix(o,transform@Matrix.Translation(drift)@m)

def matrix_between(a,b,t):
    la,qa,sa=Matrix(a).decompose();lb,qb,sb=Matrix(b).decompose();return Matrix.LocRotScale(la.lerp(lb,t),qa.slerp(qb,t),sa.lerp(sb,t))

def state(ctx,frame,empty=False):
    scene=ctx['scene'];cam=ctx['camera'];shot=ctx['shot'];ori=ctx['orientation'];portrait=ori!='landscape'
    inspect_target=Vector((0,0,.4)) if portrait else Vector((-1.8,-1,0));offset=Vector((8,-12,10 if portrait else 9));inspect_span=6.9 if portrait else 11.8
    # In portrait Blender's span is vertical; preserve the square live aperture.
    if portrait:inspect_span=6.9/.72 if ori=='portrait' else 6.9/.5
    if shot=='hero-push':
        t=smooth(frame/48)
        start_target=Vector((0,0,5.1)) if ori=='phone' else (Vector((0,0,1.8)) if portrait else Vector((-2,-1,.1)))
        start_span=16 if ori=='phone' else (11.1 if portrait else 14)
        target=start_target.lerp(inspect_target,t)
        camera_set(cam,target+offset,target,start_span+(inspect_span-start_span)*t)
    elif shot=='shaft-to-drive':
        if frame<45:
            pivot=Vector((-1.7563223838806152,1.167188286781311,-.24336211383342743))
            rotation=Matrix.Translation(pivot)@Matrix.Rotation(shaft_spin(frame),4,'Y')@Matrix.Translation(-pivot)
            for o in ctx['groups']['matcher']:
                if o.get('exhibit_group')=='rotor1' or o.name in ('C1 continuous tuning shaft','Coupler.001'):
                    set_matrix(o,rotation@ctx['bases']['matcher'][o.name])
            # A push from the bench view into the front locknut. The
            # orthographic plate is the infinite-lens limit of its first frame;
            # perspective arrives while the frame is still wide, and the view
            # tilts over the box wall while the camera is still far out.
            u=frame/45;g=ease_in(u);k=smooth(u/.6)
            width=inspect_span*(DIVE_WIDTH/inspect_span)**g
            lens=exp(log(1500)+(log(CUT_LENS)-log(1500))*smooth(u/.6))
            target=inspect_target.lerp(NUT,k);distance=width*lens/36
            direction=turn(offset.normalized(),APPROACH,smooth((frame-4)/12))
            camera_set(cam,target+direction*distance,target,None,lens)
            cam.data.clip_start=max(.008,distance-offset.length);cam.data.clip_end=distance+300
            bpy.data.lights['Macro inspection bounce'].energy=2*smooth((frame-17)/27)
        else:
            origin=ctx['origins']['vehicle'];objects=ctx['groups']['vehicle'];bases=ctx['bases']['vehicle']
            travel=vehicle_travel(frame);drift=Vector((travel,0,0))
            pose_wheels(objects,bases,drift,travel)
            # The cut's mirror image: the hub is the locknut seen from the same
            # angle, turned half a revolution about the vertical.
            mirrored=Vector((-APPROACH.x,-APPROACH.y,APPROACH.z))
            hub=origin+HUB+drift;center=origin+CAR+drift
            seat=origin+Vector((HUB.x+HOLD_AHEAD+vehicle_travel(100),1.754+PASS_GAP,HUB.z-PASS_OFFSET))
            hold=seat-(origin+CAR+Vector((vehicle_travel(100),0,0)))
            near=HUB_WIDTH*CUT_LENS/36
            if frame<=95:
                h=ease_out((frame-45)/50);k=smooth(h)
                target=hub.lerp(center,k)
                pos=target+turn(mirrored,hold.normalized(),k)*(near*(hold.length/near)**h)
            else:
                # Fixed beside the car's path: it stops for the copy, then
                # accelerates past close enough to fill the frame.
                pos=seat;look=(center-seat).normalized()
                target=seat+turn(look,Vector((0,-1,0)),smooth((frame-100)/19))
            camera_set(cam,pos,target,None,CUT_LENS)
            cam.data.clip_start=.008;cam.data.clip_end=300
            if frame>=119 and 'endpoint_tread' not in ctx:
                bpy.context.view_layer.update();rubber=next(o for o in objects if 'Wheel_front_left_rubber' in o.name)
                depsgraph=bpy.context.evaluated_depsgraph_get();inverse=rubber.matrix_world.inverted()
                hit,location,normal,index=rubber.evaluated_get(depsgraph).ray_cast(inverse@seat,(inverse.to_3x3()@Vector((0,-1,0))).normalized())
                if not hit:raise RuntimeError('Final exterior tire ray missed the actual tread')
                surface_point=rubber.matrix_world@location
                ctx['endpoint_tread']={'relativeY':surface_point.y-seat.y,'surface':list(surface_point),'gap':(surface_point-seat).length,'object':rubber.name,'worldRadius':WHEEL_RADIUS,'travel':travel,'speed':vehicle_speed(119),'acceleration':EXIT_ACCELERATION}
    else:
        origin=ctx['origins']['robot'];objects=ctx['groups']['robot'];motion=ctx['motion']
        t=smooth((frame-22)/85);at=t*(len(motion)-1);i=int(at);j=min(i+1,len(motion)-1)
        # Reach past the recorded stop so the bottle sits well inside the open
        # arms before they close.
        extra_approach=2.4-(2.4+DEEPER)*smooth((frame-35)/38)
        for o in objects:
            a=motion[i][o.name];b=motion[j][o.name];m=matrix_between(a['matrix'],b['matrix'],at-i)
            # Wheel contact correction and bottle's floor offset from setup.
            original=Matrix(motion[0][o.name]['matrix']);correction=ctx['bases']['robot'][o.name].translation-(original.translation+origin)
            delta=origin+correction
            if 'Bottle' not in o.name:delta+=Vector((0,extra_approach,0))
            # Once caged, chassis and bottle travel together. The bottle stays
            # grounded; the documented mechanism is a collector, not a lift.
            delta+=Vector((0,-.22*smooth((frame-99)/20),0))
            set_matrix(o,Matrix.Translation(delta)@m)
        for side,sign in [('Left',1),('Right',-1)]:
            pivot=next(o for o in objects if o.name=='robot::'+side+'ArmHinge').matrix_world.translation.copy()
            close=Matrix.Translation(pivot)@Matrix.Rotation(radians(ARM_CLOSE)*sign*smooth((frame-92)/15),4,'Z')@Matrix.Translation(-pivot)
            for o in objects:
                if o.name.startswith('robot::'+side+'Arm') or o.name=='robot::'+side+'TipBolt':set_matrix(o,close@o.matrix_world)
        bottle=next(o for o in objects if 'BottleBody' in o.name);bp=bottle.matrix_world.translation
        # The approach begins while the departing car still clears the frame.
        low=ctx['floors']['robot'];t=smooth((frame-12)/79)
        start=bp+Vector((2.1,-4.8,.45));end=origin+Vector((7,-10,6.5))
        position=start.lerp(end,t);target=bp.lerp(origin+Vector((-.4,-.9,-.10)),t);fstop=.6+6.8*t
        camera_set(cam,position,target,None,54 if not portrait else 43,focus=bp.lerp(origin+Vector((0,0,.4)),smooth((frame-35)/30)),fstop=fstop)
        # Carry the exact final vehicle pose and its source light rig across
        # the opaque boundary. A rigid yaw/translation maps both real floors;
        # the wheels keep rolling and the whole car leaves the foreground.
        wipe=ctx['groups']['wipe'];wbases=ctx['bases']['wipe'];wd=ctx['wipe'];release=smooth(frame/18)
        world=scene.world.node_tree.nodes['Background'];world.inputs[0].default_value=(*Vector(wd['worldColor']).lerp(Vector((.66,.69,.72)),release),1);world.inputs[1].default_value=wd['worldStrength']+(.18-wd['worldStrength'])*release
        for light in wd['robotLights']:light.data.energy=wd['robotLightPowers'][light.name]
        for light in wd['lights']:light.data.energy=wd['lightPowers'][light.name]*(1-release)
        for o in wipe:o.hide_render=frame>=18
        if frame<18:
            ground=start.copy();ground.z=low+wd['sourcePosition'].z-wd['floor'];ground_target=Vector((bp.x,bp.y,ground.z))
            ground_matrix=Matrix.LocRotScale(ground,(ground_target-ground).to_track_quat('-Z','Y'),Vector((1,1,1)))
            transport=ground_matrix@wd['sourceMatrix'].inverted()
            original_frame=cam.data.view_frame(scene=scene);effective_lens=36/(2*max(abs(v.x/v.z) for v in original_frame))
            lens=wd['sourceCamera']['lens']+(effective_lens-wd['sourceCamera']['lens'])*smooth((frame-8)/10)
            target=ground_target.lerp(target,release)
            camera_set(cam,ground.lerp(position,release),target,None,lens,focus=bp if frame>6 else None,fstop=fstop+63.4*(1-smooth((frame-6)/12)))
            cam.data.sensor_fit='HORIZONTAL'
            # The car keeps its exact exit speed and acceleration past the lens.
            exit=wd['sourceCamera']['occluderExterior']
            distance=exit['travel']+exit['speed']*frame+exit['acceleration']*frame*frame/2
            pose_wheels(wipe,wbases,Vector((distance,0,0)),distance,transport)
            for light in wd['lights']:set_matrix(light,transport@wd['lightBases'][light.name])
    for o in ctx['groups'].get('matcher',[]):o.hide_render=empty
    bpy.context.view_layer.update()
    width,height=scene.render.resolution_x,scene.render.resolution_y
    target=Vector(target);p=world_to_camera_view(scene,cam,Vector((0,0,0)))
    hspan=cam.data.ortho_scale*min(1,width/height) if cam.data.type=='ORTHO' else None
    vspan=cam.data.ortho_scale*min(1,height/width) if cam.data.type=='ORTHO' else None
    aperture=None
    if hspan and (shot=='hero-push' or (shot=='shaft-to-drive' and frame<45)):
        aperture={'left':p.x-(6.9 if portrait else 7.8)/hspan/2,'top':1-p.y-(6.9 if portrait else 5.85)/vspan/2,'width':(6.9 if portrait else 7.8)/hspan,'height':(6.9 if portrait else 5.85)/vspan}
    bounce=None
    if shot=='shaft-to-drive' and frame<45:
        bounce={'power':float(bpy.data.lights['Macro inspection bounce'].energy),'position':list(BOUNCE),'target':list(NUT),'size':.16,'color':[1,.97,.92]}
    return {'frame':frame,'camera':{'projection':cam.data.type.lower(),'position':list(cam.location),'rotation':list(cam.rotation_euler),'target':list(target),'span':cam.data.ortho_scale if hspan else None,'horizontalSpan':hspan,'verticalSpan':vspan,'lens':cam.data.lens,'sensorFit':cam.data.sensor_fit,'near':cam.data.clip_start,'bounce':bounce,'rotorOffset':[-shaft_spin(frame)*180/pi,0] if shot=='shaft-to-drive' and frame<45 else [0,0],'matcherFilmFrame':aperture,'occluderExterior':ctx.get('endpoint_tread') if shot=='shaft-to-drive' and frame==119 else None},'empty':empty}

def metadata(ctx,count,frames,samples,resolution,scale=1):
    fps=FPS*scale
    return {'fps':fps,'sourceTimelineFps':FPS,'frameScale':scale,'frameCount':count,'duration':count/fps,'lastFrameTime':(count-1)/fps,'width':resolution[0],'height':resolution[1],'orientation':ctx['orientation'],'renderer':'Cycles','samples':samples,'alpha':False,'source':'reel/studies/home-motion/render.py; reel/workbench/matcher-workbench.blend; reel/workbench/*-spatial-library.blend; original project CAD and documentary photographs','accuracy':UNCERTAINTY,'frames':frames,'markers':{'inspection':48} if ctx['shot']=='hero-push' else ({'shaft':44,'wheelCut':45,'vehicle':97,'occlusion':119} if ctx['shot']=='shaft-to-drive' else {'occlusion':0,'bottle':18,'detect':45,'approach':78,'collect':119}),'createdAt':datetime.now(timezone.utc).isoformat()}

def webp(source,path,meta):
    subprocess.run(['cwebp','-quiet','-q','96',str(source),'-o',str(path)],check=True)
    meta=dict(meta,origin='Authored home-motion Blender scene: '+UNCERTAINTY,prompt='Authored home-motion Blender scene: '+UNCERTAINTY)
    path.with_suffix('.webp.json').write_text(json.dumps(meta,indent=2)+'\n');embed(path)

def render(shot,orientation,keys=False,empty=False,samples=48,only=None,theme='light'):
    ctx=setup(shot,orientation,samples,theme);scene=ctx['scene']
    resolution=((1920,1200) if orientation=='landscape' else ((1080,1500) if orientation=='portrait' else (1080,2160))) if keys else ((1280,800) if orientation=='landscape' else ((900,1250) if orientation=='portrait' else (900,1800)))
    scene.render.resolution_x,scene.render.resolution_y=resolution
    suffix='-empty' if empty else '';name=f'{shot}{suffix}-{orientation}'+('-dark' if theme=='dark' else '')
    work=WORK/('keys' if keys else 'frames')/name;work.mkdir(parents=True,exist_ok=True)
    scale=2 if orientation=='landscape' and not keys else 1
    last=44 if empty and shot=='shaft-to-drive' else COUNTS[shot]-1
    indices=([0,24,48] if shot=='hero-push' else ([0,30,44,45,70,97,110,119] if shot=='shaft-to-drive' else [0,18,45,78,99,119])) if keys else range(last*scale+1)
    if only is not None:indices=[only]
    frame_meta=[]
    for i in indices:
        source_frame=i/scale
        fm=state(ctx,source_frame,empty);fm.update(frame=i,sourceFrame=source_frame);frame_meta.append(fm);path=work/f'frame_{i:04d}.png'
        if not path.exists():
            scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        if keys:
            webp(path,OUT/f'{name}-{i:04d}.webp',metadata(ctx,1,[fm],samples,resolution))
        print('STUDY_FRAME',name,i,flush=True)
    meta=metadata(ctx,len(frame_meta),frame_meta,samples,resolution,scale)
    (work/'frames.json').write_text(json.dumps(meta,separators=(',',':'))+'\n')
    if not keys:
        (OUT/f'{name}.json').write_text(json.dumps(meta,separators=(',',':'))+'\n')
        if only is None:encode(name,work,len(frame_meta),resolution,meta)
    else:
        (SOURCE/f'{name}-keys.json').write_text(json.dumps(meta,indent=2)+'\n')

def encode(name,work,count,resolution,meta):
    base=['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(meta['fps']),'-i',str(work/'frame_%04d.png'),'-frames:v',str(count),'-an']
    subprocess.run(base+['-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-g','6','-movflags','+faststart',str(OUT/f'{name}.mp4')],check=True)
    subprocess.run(base+['-c:v','libvpx-vp9','-deadline','good','-cpu-used','3','-threads','2','-crf','25','-b:v','0','-pix_fmt','yuv420p','-g','6',str(OUT/f'{name}.webm')],check=True)
    webp(work/'frame_0000.png',OUT/f'{name}.webp',dict(meta,frames=meta['frames'][:1]))
    for marker,frame in meta['markers'].items():
        frame*=meta.get('frameScale',1)
        if frame<count:webp(work/f'frame_{frame:04d}.png',OUT/f'{name}-{marker}.webp',dict(meta,frames=[meta['frames'][frame]]))
    print('STUDY_ENCODED',name,flush=True)

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True);WORK.mkdir(parents=True,exist_ok=True)
    p=argparse.ArgumentParser();p.add_argument('--keys',action='store_true');p.add_argument('--film',action='store_true');p.add_argument('--empty',action='store_true');p.add_argument('--shot',choices=list(COUNTS),default='hero-push');p.add_argument('--orientation',choices=['landscape','portrait','phone'],default='landscape');p.add_argument('--samples',type=int,default=48);p.add_argument('--frame',type=int);p.add_argument('--theme',choices=['light','dark'],default='light')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    render(a.shot,a.orientation,a.keys,a.empty,a.samples,a.frame,a.theme)
