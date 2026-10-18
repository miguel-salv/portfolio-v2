"""Matching opaque workbench films using the existing engineering animation.

blender --background --python reel/workbench/render_motion.py -- --subject vehicle
A stable normalization is computed at the first action frame, then every
original hardware world matrix is transformed by that exact same matrix.
Supporting props, camera and shared matcher lighting never animate.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse, hashlib, json, subprocess, sys
import bpy

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'reel'))
from workbench_world import subject,lighting,environment,configure,camera
from render_workbench import apply_theme


def render(name,themes,samples=32):
    objects,ns=subject(name,capture_motion=True)
    scene=bpy.context.scene;lighting(scene)
    floor,desk=environment(objects,False,False,subject_name=name)
    configure(scene,samples);camera(scene,False,name)
    scene.render.resolution_x=1080;scene.render.resolution_y=675
    scene.render.fps=ns['fps']
    out=ROOT/'public/assets/workbench';out.mkdir(parents=True,exist_ok=True)
    for theme in themes:
        apply_theme(theme=='dark')
        work=ROOT/'.impeccable/renders/workbench'/f'{name}-{theme}-motion'
        work.mkdir(parents=True,exist_ok=True)
        signatures={}
        for i,pose in enumerate(ns['motion'],1):
            for obj_name,state in pose.items():
                obj=bpy.data.objects[obj_name]
                obj.matrix_world=state['matrix'];obj.hide_render=state['hidden']
            bpy.context.view_layer.update()
            destination=work/f'frame_{i:04d}.png'
            signature=hashlib.sha256(repr([(obj_name,tuple(round(v,7) for row in state['matrix'] for v in row),state['hidden']) for obj_name,state in sorted(pose.items())]).encode()).hexdigest()
            if signature in signatures:
                import shutil;shutil.copyfile(signatures[signature],destination)
            else:
                scene.render.filepath=str(destination);bpy.ops.render.render(write_still=True)
                signatures[signature]=destination
            print('WORKBENCH_MOTION_FRAME',name,theme,i,len(ns['motion']),flush=True)
        path=out/f'{name}-{theme}-landscape.webm'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(ns['fps']),'-i',str(work/'frame_%04d.png'),'-an','-c:v','libvpx-vp9','-pix_fmt','yuv420p','-b:v','0','-crf','22','-g','1','-row-mt','1','-threads','4',str(path)],check=True)
        metadata={'origin':f'Authored Cycles full workbench film, matching {name}-{theme}-landscape.webp camera, geometry, shared four-emitter studio and environment. Existing documented {name} animation world matrices transformed with one stable normalization; no camera or prop motion. No audio. Original documentary evidence is unchanged.', 'source':'reel/workbench/render_motion.py; reel/workbench_world.py; reel/render_story_world.py','subject':name,'theme':theme,'resolution':[1080,675],'fps':ns['fps'],'frameCount':len(ns['motion']),'duration':len(ns['motion'])/ns['fps'],'sourceFrames':ns['sourceFrames'],'samples':samples,'codec':'VP9 opaque, all keyframes','cameraMatches':f'{name}-{theme}-landscape.webp','createdAt':datetime.now(timezone.utc).isoformat()}
        path.with_suffix('.webm.json').write_text(json.dumps(metadata,indent=2)+'\n')
        print('WORKBENCH_MOTION_RENDER',str(path),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--subject',choices=['vehicle','robot','both'],default='both');parser.add_argument('--theme',choices=['light','dark','both'],default='both');parser.add_argument('--samples',type=int,default=32)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for name in ['vehicle','robot'] if args.subject=='both' else [args.subject]:render(name,['light','dark'] if args.theme=='both' else [args.theme],args.samples)
