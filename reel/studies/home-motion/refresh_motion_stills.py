"""Refresh dedicated source-time plates after the final mechanical audit.

The native producer owns motion PNGs and both119/0 endpoints. This finite job
owns only the other full-resolution drive camera plates. Run it after the
native producer exits: overlapping Blender scenes contend severely on M2.
"""
from pathlib import Path
import sys,json,hashlib,shutil
sys.path.insert(0,str(Path(__file__).resolve().parent))
import render as r

revision=hashlib.sha256((Path(__file__).parent/'render.py').read_bytes()).hexdigest()
checkpoint=r.WORK/'motion-still-checkpoint.json'
saved=json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
if saved.get('renderRevision')!=revision:saved={'renderRevision':revision,'completed':{}}

for orientation in ('landscape','portrait'):
    ctx=r.setup('shaft-to-drive',orientation,64,theme='light')
    scene=ctx['scene'];resolution=(1920,1200) if orientation=='landscape' else (1800,2500)
    scene.render.resolution_x,scene.render.resolution_y=resolution
    name='shaft-to-drive-'+orientation
    work=r.WORK/'keys'/name;work.mkdir(parents=True,exist_ok=True)
    for frame in ((0,30,44,45,65,88,108) if orientation=='landscape' else (0,30,44,45,65,88,108,119)):
        output=r.OUT/f'{name}-{frame:04d}.webp'
        previous=json.loads(output.with_suffix('.webp.json').read_text()) if output.with_suffix('.webp.json').exists() else {}
        if frame in saved['completed'].get(orientation,[]) and output.exists() and previous.get('width')==resolution[0]:
            print('RETAINED_CURRENT_POSE',name,frame,flush=True);continue
        fm=r.state(ctx,frame);fm.update(frame=frame,sourceFrame=frame)
        image=work/f'frame_{frame:04d}.png';scene.render.filepath=str(image)
        r.bpy.ops.render.render(write_still=True)
        r.webp(image,r.OUT/f'{name}-{frame:04d}.webp',r.metadata(ctx,1,[fm],64,resolution))
        saved['completed'].setdefault(orientation,[]).append(frame)
        temporary=checkpoint.with_suffix('.tmp');temporary.write_text(json.dumps(saved,indent=2)+'\n');temporary.replace(checkpoint)
        print('REFRESHED_CURRENT_POSE',name,frame,flush=True)

# The original portrait/phone hero openings stay byte-identical. Newly authored
# resting plates and portrait project views meet the 1800-pixel still brief.
def plate(ctx,name,frame,resolution,empty=False):
    output=r.OUT/f'{name}-{frame:04d}.webp'
    sidecar=output.with_suffix('.webp.json')
    previous=json.loads(sidecar.read_text()) if sidecar.exists() else {}
    if output.exists() and previous.get('width')==resolution[0] and previous.get('height')==resolution[1]:
        print('RETAINED_FULL_RESOLUTION',output.name,flush=True);return
    scene=ctx['scene'];scene.render.resolution_x,scene.render.resolution_y=resolution
    fm=r.state(ctx,frame,empty);fm.update(frame=frame,sourceFrame=frame)
    directory=r.WORK/'keys'/name;directory.mkdir(parents=True,exist_ok=True)
    image=directory/f'frame_{frame:04d}.png';scene.render.filepath=str(image)
    r.bpy.ops.render.render(write_still=True)
    metadata=r.metadata(ctx,1,[fm],64,resolution);metadata.update(theme=ctx['theme'],shot=ctx['shot'],generator='reel/studies/home-motion/refresh_motion_stills.py')
    r.webp(image,output,metadata)
    print('REFRESHED_FULL_RESOLUTION',output.name,flush=True)

source=r.OUT/'shaft-to-drive-portrait-0119.webp';destination=r.OUT/'bottle-collect-portrait-0000.webp'
shutil.copyfile(source,destination)
endpoint_meta=json.loads(source.with_suffix('.webp.json').read_text())
endpoint_meta.update(endpointReuse={'source':str(source.relative_to(r.ROOT)),'logicalFrame':119},origin='The genuine full-resolution final vehicle tire frame retained at the completely covered scene change; no blank frame or fabricated motion.',prompt='The genuine full-resolution final vehicle tire frame retained at the completely covered scene change; no blank frame or fabricated motion.')
destination.with_suffix('.webp.json').write_text(json.dumps(endpoint_meta,indent=2)+'\n');r.embed(destination)
shutil.copyfile(r.WORK/'keys'/'shaft-to-drive-portrait'/'frame_0119.png',r.WORK/'keys'/'bottle-collect-portrait'/'frame_0000.png')

ctx=r.setup('bottle-collect','portrait',64)
for frame in (18,45,78,99,119):plate(ctx,'bottle-collect-portrait',frame,(1800,2500))
for orientation,resolution in [('portrait',(1800,2500)),('phone',(1800,3600))]:
    for theme in ('light','dark'):
        ctx=r.setup('hero-push',orientation,64,theme=theme)
        suffix='-dark' if theme=='dark' else ''
        plate(ctx,f'hero-push-{orientation}{suffix}',48,resolution)
        plate(ctx,f'hero-push-empty-{orientation}{suffix}',48,resolution,True)
        if orientation=='portrait':plate(ctx,f'hero-push-empty-{orientation}{suffix}',0,resolution,True)
