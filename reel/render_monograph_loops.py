"""Relight existing operational animations; retain motion, proportions and CAD.
Run: blender --background --python reel/render_monograph_loops.py
"""
from pathlib import Path
from datetime import datetime, timezone
import bpy, json, subprocess, sys, shutil
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'reel'))
import render_story_world as story
from mathutils import Vector
OUT=ROOT/'public/assets/stories/moments'
WORK=Path('/tmp/portfolio-monograph-loops');WORK.mkdir(exist_ok=True)
for moment in ['vehicle','robot']:
    scene=story.build_moment(moment,'landscape',False,False,16)
    for obj in list(scene.objects):
        if obj.type=='LIGHT' or obj.name=='StudioGround': bpy.data.objects.remove(obj,do_unlink=True)
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.68,.72,.76,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.12
    target=Vector((0,0,1))
    for name,pos,energy,width,height in [
        ('Long key',(-5,-8,10),1800,6,2),('Quiet fill',(7,-4,5),260,7,7),('Sharp edge',(3,7,8),1500,5,1)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='RECTANGLE';data.size=width;data.size_y=height
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=pos
        obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
    for material in bpy.data.materials:
        if not material.use_nodes: continue
        node=material.node_tree.nodes.get('Principled BSDF')
        if not node: continue
        metal=node.inputs['Metallic'].default_value
        if metal>.15:
            node.inputs['Metallic'].default_value=max(metal,.85)
            node.inputs['Roughness'].default_value=max(.2,min(node.inputs['Roughness'].default_value,.34))
    # Ray tracing produces the reflected studio strips on the real mesh.
    if hasattr(scene.eevee,'use_raytracing'): scene.eevee.use_raytracing=True
    scene.view_settings.look='AgX - Medium High Contrast'
    # Bring the mechanism closer while retaining the original camera path.
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        if curve.data_path == 'lens':
                            for point in curve.keyframe_points:
                                point.co.y *= 1.35; point.handle_left.y *= 1.35; point.handle_right.y *= 1.35
    scene.render.resolution_x=1440;scene.render.resolution_y=1080
    frames=WORK/moment;frames.mkdir(exist_ok=True)
    scene.render.filepath=str(frames/'frame_')
    if '--sample' in sys.argv:
        scene.frame_set(1);scene.render.filepath=str(WORK/(moment+'-sample.png'));bpy.ops.render.render(write_still=True)
        continue
    bpy.ops.render.render(animation=True)
    common=['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','30','-i',str(frames/'frame_%04d.png'),'-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0','-deadline','good','-cpu-used','3','-crf','32','-b:v','0','-g','15']
    subprocess.run(common+[str(OUT/(moment+'-landscape.webm'))],check=True)
    subprocess.run(common+['-vf','scale=900:675,pad=900:900:0:112:color=black@0',str(OUT/(moment+'-portrait.webm'))],check=True)
    # Also refresh Safari's alpha fallback from the same frames.
    for orientation in ['landscape','portrait']:
        command=['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','30','-i',str(frames/'frame_%04d.png')]
        if orientation=='portrait':command+=['-vf','scale=900:675,pad=900:900:0:112:color=black@0']
        command+=['-an','-c:v','hevc_videotoolbox','-allow_sw','1','-alpha_quality','.75','-pix_fmt','bgra','-q:v','45','-tag:v','hvc1','-movflags','+faststart',str(OUT/(moment+'-'+orientation+'.mov'))]
        subprocess.run(command,check=True)
    for orientation in ['landscape','portrait']:
        png=WORK/(moment+'-'+orientation+'.png')
        if orientation=='landscape':shutil.copy2(frames/'frame_0001.png',png)
        else:subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(frames/'frame_0001.png'),'-vf','scale=900:675,pad=900:900:0:112:color=black@0','-frames:v','1',str(png)],check=True)
        destination=OUT/(moment+'-'+orientation+'-poster.webp')
        subprocess.run(['/opt/homebrew/bin/cwebp','-q','92',str(png),'-o',str(destination)],check=True)
        destination.with_suffix('.webp.json').write_text(json.dumps({'prompt':'Authored Blender relighting of the existing '+moment+' operational animation. Original CAD geometry and animation from reel/render_story_world.py, directional rectangular studio lights, physically differentiated metal, high contrast and transparent background. Rendered by reel/render_monograph_loops.py.','source':'reel/render_story_world.py; reel/render_monograph_loops.py','created_at':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
        png.unlink()
    shutil.rmtree(frames)
    print('AUTHORED LOOP',moment,flush=True)
if '--sample' not in sys.argv:
    subprocess.run(['python3', str(ROOT/'reel/reframe_monograph_portraits.py')],check=True)
