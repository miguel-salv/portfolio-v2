"""A single spatial camera film: matcher > assembly fixture > robot test lane.

Blender --background --python reel/workbench/render_spatial_journey.py -- --preview
Blender --background --python reel/workbench/render_spatial_journey.py
Blender --background --python reel/workbench/render_spatial_journey.py -- --encode-only
Source evidence and original engineering animations are unchanged.
"""
from pathlib import Path
from datetime import datetime,timezone
from math import radians,sin,pi
import argparse,json,shutil,subprocess,sys,hashlib,time
import bpy
from mathutils import Matrix,Vector,Quaternion
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'reel'))
from workbench_world import subject,box,cylinder,material,aim,configure,bounds
from render_matcher_film import assembly_pose,smooth
WORK=ROOT/'.impeccable/renders/workbench/spatial';OUT=ROOT/'public/assets/workbench'
STATIONS={'matcher':Vector((0,0,0)),'vehicle':Vector((7.155,4.770,0)),'robot':Vector((14.476,9.651,-2.3))}
COUNT=211;FPS=30;KEYS=[0,10,20,30,40,70,100,110,120,130,140,175,210]
START_SPAN=8.3
ROBOT_CONTACT_Z=0

def mesh_floor(objects):
    return min((o.matrix_world @ vertex.co).z for o in objects if o.type=='MESH' for vertex in o.data.vertices)


def save_library(name):
    objects,ns=subject(name,capture_motion=name!='matcher')
    scene=bpy.context.scene
    if name=='matcher':
        group=ns['namespace']['group'];centers=ns['namespace']['cap_centers'];pose=assembly_pose(1)
        for o in objects:
            matrix=o.matrix_world.copy();family=group(o);delta=Vector((0,0,0));rotor=family.startswith('rotor')
            if rotor:
                index=int(family[-1])-1;pivot=centers[index]
                matrix=Matrix.Translation(pivot) @ Matrix.Rotation(radians(45 if index==0 else -45),4,'Y') @ Matrix.Translation(-pivot) @ matrix
            if family=='capacitors' or rotor:delta=Vector(pose['capacitors'])
            elif family=='control':delta=Vector(pose['control'])
            elif family=='motors':
                delta=Vector(pose['motors'])
                if matrix.translation.x<0:delta.x*=-1
            o.matrix_world=Matrix.Translation(delta) @ matrix
    original_names={o:o.name for o in objects}
    motion=[]
    for pose in ns.get('motion',[]):
        motion.append({name+'::'+n:{'matrix':[list(row) for row in state['matrix']],'hidden':state['hidden']} for n,state in pose.items()})
    collection=bpy.data.collections.new(name+'Subject');scene.collection.children.link(collection)
    for o in objects:
        for c in list(o.users_collection):c.objects.unlink(o)
        collection.objects.link(o);o.name=name+'::'+original_names[o]
    for o in list(scene.objects):
        if o not in objects:bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.view_layer.update()
    bpy.ops.file.pack_all()
    destination=ROOT/'reel/workbench'/f'{name}-spatial-library.blend'
    bpy.data.libraries.write(str(destination),{collection},fake_user=True,compress=True)
    (ROOT/'reel/workbench'/f'{name}-spatial-motion.json').write_text(json.dumps({'motion':motion},separators=(',',':')))


def attach(obj,collection):
    for c in list(obj.users_collection):c.objects.unlink(obj)
    collection.objects.link(obj);return obj


def supports(name,objects,collection):
    before=set(bpy.context.scene.objects);lo,hi=bounds(objects);origin=STATIONS[name]
    lo.z=mesh_floor(objects)
    if name=='vehicle':
        steel=material('Fixture — brushed aluminum',(.46,.49,.50),.31,1,texture=260)
        navy=material('Fixture — anodized graphite rails',(.035,.05,.06),.36,.75,texture=220)
        amber=material('Fixture — brass locator stops',(.49,.29,.075),.29,.85)
        z=lo.z-.002
        for y in (-1.34,1.34):
            box('Vehicle fixture support rail',origin+Vector((0,y,z-.10)),(6.6,.35,.20),steel,.035)
            for offset in (-.10,.10):box('Extrusion guide channel',origin+Vector((0,y+offset,z+.004)),(6.35,.025,.012),navy,.005)
        for x in (-2.45,2.45):
            box('Vehicle fixture crossmember',origin+Vector((x,0,z-.28)),(.5,3.9,.30),navy,.04)
            for y in (-1.75,1.75):
                cylinder('Fixture socket fastener',origin+Vector((x,y,z-.11)),.06,.035,steel)
        for x in (-3.1,3.1):
            box('Wheel travel stop',origin+Vector((x,-1.34,z+.11)),(.14,.48,.26),amber,.025)
    if name=='robot':
        lane=material('Robot test lane — ivory resin',(.54,.51,.44),.78,texture=180)
        graphite=material('Robot lane boundary',(.025,.032,.033),.7)
        z=lo.z-.002
        box('Robot physical test lane',origin+Vector((0,-.1,z-.075)),(4.8,7.0,.15),lane,.13)
        for x in (-2.05,2.05):box('Test lane boundary',origin+Vector((x,-.1,z+.007)),(.045,6.4,.012),graphite,.006)
        for y in (-3.05,2.85):box('Test lane end marker',origin+Vector((0,y,z+.008)),(4.1,.045,.012),graphite,.006)
    result=[o for o in bpy.context.scene.objects if o not in before]
    for o in result:attach(o,collection)
    return result


def build(rebuild=False):
    global START_SPAN,ROBOT_CONTACT_Z
    WORK.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    for name in STATIONS:
        if rebuild or not (ROOT/'reel/workbench'/f'{name}-spatial-library.blend').exists():save_library(name)
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
    groups={};motions={};supports_by_name={}
    for name,origin in STATIONS.items():
        path=ROOT/'reel/workbench'/f'{name}-spatial-library.blend'
        with bpy.data.libraries.load(str(path),link=False) as (source,dest):dest.collections=[name+'Subject']
        collection=dest.collections[0];scene.collection.children.link(collection)
        bpy.context.view_layer.update()
        objects=list(collection.all_objects);groups[name]=objects
        if name=='robot':
            wheel_floor=mesh_floor([o for o in objects if 'RubberWheel' in o.name or 'Tread_' in o.name])
            bottle_floor=mesh_floor([o for o in objects if 'BottleBody' in o.name])
            ROBOT_CONTACT_Z=bottle_floor-wheel_floor
            for o in objects:
                if 'Bottle' not in o.name:o.matrix_world=Matrix.Translation(Vector((0,0,ROBOT_CONTACT_Z))) @ o.matrix_world
            bpy.context.view_layer.update()
            print('ROBOT_CONTACT_CORRECTION',ROBOT_CONTACT_Z,flush=True)
        supports_by_name[name]=supports(name,objects,collection)
        for o in objects:o.matrix_world=Matrix.Translation(origin) @ o.matrix_world
        motions[name]=json.loads((ROOT/'reel/workbench'/f'{name}-spatial-motion.json').read_text())['motion']
    studio=json.loads((ROOT/'reel/matcher_studio.json').read_text())
    world=bpy.data.worlds.new('Shared spatial studio');world.use_nodes=True;scene.world=world
    world.node_tree.nodes['Background'].inputs[0].default_value=(*studio['worldColor'],1)
    world.node_tree.nodes['Background'].inputs[1].default_value=studio['worldStrength']
    # One shared emitter design follows the three physical stations. Light
    # linking prevents the neighboring task lights changing the exact matcher
    # handoff exposure, while all devices retain stable world illumination.
    for name,origin in STATIONS.items():
        receivers=bpy.data.collections.get(name+'Subject')
        for light in studio['lights']:
            data=bpy.data.lights.new(name+' '+light['name'],'AREA');data.energy=light['power'];data.shape='RECTANGLE';data.size=light['width'];data.size_y=light['height'];data.color=light['color']
            obj=bpy.data.objects.new(name+' '+light['name'],data);scene.collection.objects.link(obj);obj.location=origin+Vector(light['position']);aim(obj,origin)
            obj.light_linking.receiver_collection=receivers
    cam=bpy.data.objects.new('Continuous spatial camera',bpy.data.cameras.new('Continuous spatial camera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.data.clip_end=100
    configure(scene,48);scene.render.film_transparent=True;scene.cycles.transparent_max_bounces=8;scene.cycles.seed=0;scene.cycles.use_animated_seed=False
    preferences=bpy.context.preferences.addons['cycles'].preferences
    print('SPATIAL_DEVICE',scene.cycles.device,[(d.name,d.type,d.use) for d in preferences.devices],'persistent',scene.render.use_persistent_data,flush=True)
    scene.render.resolution_x=1080;scene.render.resolution_y=810;scene.render.image_settings.color_depth='8';scene.render.fps=FPS
    cam.location=(8,-12,9);aim(cam,(0,0,0));cam.data.ortho_scale=8.3;bpy.context.view_layer.update()
    points=[world_to_camera_view(scene,cam,o.matrix_world @ Vector(c)) for o in groups['matcher'] if o.type=='MESH' for c in o.bound_box]
    extent=max(max(abs(p.x-.5),abs(p.y-.5))*2 for p in points)
    START_SPAN=8.3*max(1,extent/.92)
    print('SPATIAL_START_SPAN',START_SPAN,flush=True)
    return scene,cam,groups,motions,supports_by_name


def matrix_between(a,b,t):
    la,qa,sa=Matrix(a).decompose();lb,qb,sb=Matrix(b).decompose()
    return Matrix.LocRotScale(la.lerp(lb,t),qa.slerp(qb,t),sa.lerp(sb,t))


def pose_at(motion,t):
    at=min(len(motion)-1,max(0,t*(len(motion)-1)));i=int(at);j=min(i+1,len(motion)-1)
    return {name:{'matrix':matrix_between(state['matrix'],motion[j][name]['matrix'],at-i),'hidden':state['hidden']} for name,state in motion[i].items()}


def state(frame,scene,cam,groups,motions):
    vehicle_amount=smooth((frame-40)/60);robot_amount=smooth((frame-140)/70)
    for name,amount in [('vehicle',vehicle_amount),('robot',robot_amount)]:
        pose=pose_at(motions[name],amount);origin=STATIONS[name]
        # Vehicle sits in the assembly fixture: retain source wheel rotation,
        # cancel source drive translation, then lift the documented PCB layer.
        drift=Vector((0,0,0))
        if name=='vehicle':
            key=next(n for n in pose if 'Green_PCB_lower' in n)
            drift=pose[key]['matrix'].translation-Matrix(motions[name][0][key]['matrix']).translation
        for n,info in pose.items():
            obj=bpy.data.objects[n];matrix=info['matrix'];delta=origin-drift
            if name=='robot' and 'Bottle' not in n:delta+=Vector((0,0,ROBOT_CONTACT_Z))
            if name=='vehicle':
                if any(s in n for s in ('Green_PCB_upper','Upper_PCB_','PCB_screw_')):delta+=Vector((0,0,.85*smooth((frame-43)/37)))
                elif any(s in n for s in ('Black_upper','Top_chassis','Deck_')):delta+=Vector((0,0,.22*smooth((frame-48)/35)))
            desired=Matrix.Translation(delta) @ matrix
            if max(abs(obj.matrix_world[r][c]-desired[r][c]) for r in range(4) for c in range(4))>1e-6:obj.matrix_world=desired
            if obj.hide_render!=info['hidden']:obj.hide_render=info['hidden']
    if frame<=40:
        t=smooth(frame/40);target=STATIONS['matcher'].lerp(STATIONS['vehicle'],t);offset=Vector((8,-12,9)).lerp(Vector((8,-12,5.3)),t);span=START_SPAN+(8.0-START_SPAN)*t+8.0*sin(pi*t)**2
    elif frame<=100:
        t=smooth((frame-40)/60);target=STATIONS['vehicle'];offset=Vector((8,-12,5.3)).lerp(Vector((9,-11,8.6)),t);span=8.0-.25*t
    elif frame<=140:
        t=smooth((frame-100)/40);target=STATIONS['vehicle'].lerp(STATIONS['robot'],t);offset=Vector((9,-11,8.6)).lerp(Vector((8,-12,5.6)),t);span=7.75+(9.2-7.75)*t+8.0*sin(pi*t)**2
    else:
        t=smooth((frame-140)/70);target=STATIONS['robot'];offset=Vector((8,-12,5.6)).lerp(Vector((6.8,-11.5,6.5)),t);span=9.2-.5*t
    cam.location=target+offset;aim(cam,target);cam.data.ortho_scale=span
    bpy.context.view_layer.update()
    return {'frame':frame,'camera':{'position':list(cam.location),'rotation':list(cam.rotation_euler),'target':list(target),'span':span},'vehicle':vehicle_amount,'robot':robot_amount}


def encode(sixty=False):
    fps=60 if sixty else FPS
    count=421 if sixty else COUNT
    scale=2 if sixty else 1
    frames=WORK/('frames60' if sixty else 'frames')
    if any(not (frames/f'frame_{i:04d}.png').exists() for i in range(count)):
        raise RuntimeError('Incomplete spatial film; refusing publication')
    clips=[('journey-landscape',0,count-1),('vehicle-action',40*scale,100*scale),('robot-action',140*scale,210*scale)]
    encoded=WORK/'encoded';encoded.mkdir(parents=True,exist_ok=True)
    options=[('webm',['-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0','-deadline','good','-cpu-used','3','-threads','2','-crf','27','-b:v','0','-g','6']),('mov',['-c:v','hevc_videotoolbox','-allow_sw','1','-alpha_quality','.9','-pix_fmt','bgra','-q:v','55','-g','1','-tag:v','hvc1','-movflags','+faststart'])]
    for extension,opts in options:
        for name,first,last in clips:
            destination=encoded/f'{name}.{extension}'
            command=['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(fps),'-start_number',str(first),'-i',str(frames/'frame_%04d.png'),'-frames:v',str(last-first+1),'-an']
            subprocess.run(command+opts+[str(destination)],check=True)
            shutil.copyfile(destination,OUT/destination.name)
    for name,logical_first,logical_last in [('vehicle',40,100),('robot',140,210)]:
        first,last=logical_first*scale,logical_last*scale
        poster=OUT/f'{name}-action.webp'
        subprocess.run(['cwebp','-quiet','-q','95',str(frames/f'frame_{first:04d}.png'),'-o',str(poster)],check=True)
        origin=f'Exact first frame {first} (logical source frame {logical_first}) of the continuous spatial journey: actual {name} presentation on its distinct physical fixture/test lane. Native alpha, shared studio, 48 Cycles samples. Original source reconstruction boundaries remain unchanged.'
        subprocess.run(['/Users/miguelsalvacion/.agents/skills/impeccable/scripts/impeccable','embed-prompt',str(poster),'--prompt',origin],check=True,stdout=subprocess.DEVNULL)
        poster.with_suffix('.webp.json').write_text(json.dumps({'origin':origin,'prompt':origin,'source':'reel/workbench/render_spatial_journey.py','frame':first,'sourceFrame':logical_first,'samples':48,'alpha':True,'resolution':[1080,810]},indent=2)+'\n')
        from workbench.embed_xmp import embed
        embed(poster)
        metadata={'fps':fps,'sourceTimelineFps':30,'frameCount':last-first+1,'width':1080,'height':810,'duration':(last-first+1)/fps,'lastFrameTime':(last-first)/fps,'alpha':True,'keyframeInterval':{'webm':6,'mov':1},'sourceFrames':[logical_first,logical_last],'encodedFrames':[first,last],'source':'journey-landscape','renderer':'Cycles','samples':48}
        (OUT/f'{name}-action.json').write_text(json.dumps(metadata,separators=(',',':'))+'\n')
    metadata=json.loads((WORK/('frames60.json' if sixty else 'frames.json')).read_text())
    metadata.update({'fps':fps,'sourceTimelineFps':30,'frameCount':count,'width':1080,'height':810,'duration':count/fps,'lastFrameTime':(count-1)/fps,'alpha':True,'keyframeInterval':{'webm':6,'mov':1},'stations':{name:list(point) for name,point in STATIONS.items()},'segments':{'matcherTravel':[0,40],'vehicle':[40,100],'robotTravel':[100,140],'robot':[140,210]},'matcherStart':{'source':'.impeccable/renders/matcher-film/landscape/frame_0030.png','frame':30,'assembly':1,'camera':[8,-12,9],'span':metadata['frames'][0]['camera']['span'],'authoredSpan':8.3},'source':'reel/workbench/render_spatial_journey.py; original matcher CAD and photograph-referenced vehicle/robot models','accuracy':'Presentation reconstruction. Hidden dimensions and component envelopes remain photo estimates; rendered actions illustrate mechanisms, not measured hardware telemetry. All odd 60fps frames are genuine half-frame 3D world renders, not optical-flow interpolation.','createdAt':datetime.now(timezone.utc).isoformat()})
    (OUT/'journey-landscape.json').write_text(json.dumps(metadata,separators=(',',':'))+'\n')
    if sixty:
        from encode_reverse import encode_reverse
        encode_reverse()
    print('SPATIAL_ENCODED',fps,count,flush=True)


def run(preview=False,rebuild=False,only=None,sixty=False,frames_only=False):
    scene,cam,groups,motions,fixtures=build(rebuild)
    scene.cycles.samples=8 if preview else 48
    if not preview:
        bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'reel/workbench/journey-world.blend'),compress=True)
    frames=WORK/('preview' if preview else 'frames');frames.mkdir(parents=True,exist_ok=True)
    records=[]
    selected=only if only is not None else (KEYS if preview else range(COUNT))
    for frame in selected:
        before=time.perf_counter();sample=state(frame,scene,cam,groups,motions);records.append(sample)
        state_elapsed=time.perf_counter()-before;destination=frames/f'frame_{frame:04d}.png'
        if frame==0 and not preview:
            shutil.copyfile(ROOT/'.impeccable/renders/matcher-film/landscape/frame_0030.png',destination)
        elif not destination.exists() or preview or only:
            scene.render.filepath=str(destination);bpy.ops.render.render(write_still=True)
        print('SPATIAL_FRAME',frame,COUNT-1,'state_seconds',round(state_elapsed,4),'total_seconds',round(time.perf_counter()-before,3),flush=True)
    if preview:
        (frames/'camera.json').write_text(json.dumps(records,indent=2)+'\n');return
    if only is None:(WORK/'frames.json').write_text(json.dumps({'frames':records,'renderer':'Cycles','samples':48},separators=(',',':'))+'\n')
    if sixty:
        destination_frames=WORK/'frames60';destination_frames.mkdir(parents=True,exist_ok=True)
        records=[]
        scene.render.fps=60
        for index in range(421):
            logical=index/2;before=time.perf_counter();sample=state(logical,scene,cam,groups,motions)
            sample['sourceFrame']=logical;sample['frame']=index;records.append(sample)
            destination=destination_frames/f'frame_{index:04d}.png'
            if index%2==0:
                shutil.copyfile(frames/f'frame_{index//2:04d}.png',destination)
            elif not destination.exists():
                scene.render.filepath=str(destination);bpy.ops.render.render(write_still=True)
            print('SPATIAL_60_FRAME',index,420,'source_frame',logical,'seconds',round(time.perf_counter()-before,3),flush=True)
        (WORK/'frames60.json').write_text(json.dumps({'frames':records,'renderer':'Cycles','samples':48,'genuineHalfFrameRenders':True},separators=(',',':'))+'\n')
        encode(True)
    elif only is None and not frames_only:encode()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--preview',action='store_true');parser.add_argument('--rebuild',action='store_true');parser.add_argument('--encode-only',action='store_true');parser.add_argument('--frames-only',action='store_true');parser.add_argument('--sixty',action='store_true');parser.add_argument('--frames',default='')
    arguments=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if arguments.encode_only:encode(arguments.sixty)
    else:run(arguments.preview,arguments.rebuild,[int(i) for i in arguments.frames.split(',')] if arguments.frames else None,arguments.sixty,arguments.frames_only)
