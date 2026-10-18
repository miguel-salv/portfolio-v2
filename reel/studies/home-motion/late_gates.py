"""Six genuine native-size frames for the corrected one-pass departure."""
from pathlib import Path
import sys,json
sys.path.insert(0,str(Path(__file__).resolve().parent))
import render as r

for orientation in ('landscape','portrait'):
    ctx=r.setup('shaft-to-drive',orientation,48)
    scene=ctx['scene'];resolution=(1280,800) if orientation=='landscape' else (900,1250)
    scene.render.resolution_x,scene.render.resolution_y=resolution
    work=r.WORK/('late-v2-'+orientation);work.mkdir(parents=True,exist_ok=True)
    frames=[]
    for frame in (94,100,106,112,116,119):
        fm=r.state(ctx,frame);frames.append(fm)
        scene.render.filepath=str(work/f'frame_{frame:04d}.png')
        r.bpy.ops.render.render(write_still=True)
        print('LATE_V2_GATE',orientation,frame,flush=True)
    (work/'frames.json').write_text(json.dumps(r.metadata(ctx,6,frames,48,resolution),indent=2)+'\n')
