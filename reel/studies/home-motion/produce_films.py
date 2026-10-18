"""Production films, with genuinely rendered short transition studies first.

Run --gates for final corrected endpoint and portrait composition stills.
Run --films after visual review. Native landscape rate is60fps, portrait30fps.
"""
from pathlib import Path
from time import perf_counter
import argparse,json,subprocess,sys,shutil
sys.path.insert(0,str(Path(__file__).resolve().parent))
import render as r

def gates():
    for shot,frames in [('shaft-to-drive',[88,119]),('bottle-collect',[0,18,119])]:
        for frame in frames:
            p=r.WORK/'keys'/f'{shot}-landscape'/f'frame_{frame:04d}.png'
            if p.exists():p.unlink()
            r.render(shot,'landscape',True,False,64,frame)
    for shot in ('shaft-to-drive','bottle-collect'):r.render(shot,'portrait',True,False,64)

def film(shot,orientation,empty=False,theme='light'):
    samples=40 if empty else 48
    if shot=='bottle-collect':
        # The fully covered boundary is one actual tire frame shared by both
        # clips. It is neither a blank transition card nor a fabricated frame.
        last=r.WORK/'keys'/f'shaft-to-drive-{orientation}'/'frame_0119.png'
        if last.exists():last.unlink()
        r.render('shaft-to-drive',orientation,True,False,64,119)
        from_image=r.OUT/f'shaft-to-drive-{orientation}-0119.webp'
        to_image=r.OUT/f'bottle-collect-{orientation}-0000.webp'
        shutil.copyfile(from_image,to_image)
        poster_meta=json.loads(from_image.with_suffix('.webp.json').read_text());poster_meta.update(endpointReuse={'source':str(from_image.relative_to(r.ROOT)),'logicalFrame':119},origin='The genuine final vehicle tire frame retained at the completely covered scene change; no blank frame or fabricated motion.',prompt='The genuine final vehicle tire frame retained at the completely covered scene change; no blank frame or fabricated motion.')
        to_image.with_suffix('.webp.json').write_text(json.dumps(poster_meta,indent=2)+'\n');r.embed(to_image)
        destination=r.WORK/'keys'/f'bottle-collect-{orientation}'/'frame_0000.png';destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(last,destination)
    ctx=r.setup(shot,orientation,samples,theme=theme);scene=ctx['scene']
    resolution=(1280,800) if orientation=='landscape' else (900,1250)
    scene.render.resolution_x,scene.render.resolution_y=resolution
    scale=2 if orientation=='landscape' else 1
    count=(44 if empty else 119)*scale+1
    suffix='-empty' if empty else '';name=f'{shot}{suffix}-{orientation}'+('-dark' if theme=='dark' else '')
    work=r.WORK/'frames'/name;work.mkdir(parents=True,exist_ok=True)
    frames=[]
    for i in range(count):
        fm=r.state(ctx,i/scale,empty);fm.update(frame=i,sourceFrame=i/scale);frames.append(fm)
    meta=r.metadata(ctx,count,frames,samples,resolution,scale)
    if shot=='bottle-collect':
        drive_meta=json.loads((r.OUT/f'shaft-to-drive-{orientation}.json').read_text())
        meta['endpointReuse']={'frame':0,'from':f'shaft-to-drive-{orientation}','sourceFrame':119*scale,'logicalSourceFrame':119,'reason':'Retain the exact genuinely rendered tire frame while the scene is completely occluded.'}
        frames[0]['destinationCamera']=frames[0]['camera'];frames[0]['camera']=drive_meta['frames'][-1]['camera'];frames[0]['endpointReuse']=meta['endpointReuse']
    (r.OUT/f'{name}.json').write_text(json.dumps(meta,separators=(',',':'))+'\n')
    # Frame studies are authentic contiguous native frames and then reused by
    # the full film, not raster interpolation or lower-quality preview images.
    priorities=list(range(20*scale,min(count,53*scale+1))) if shot=='shaft-to-drive' and not empty else (list(range(0,min(count,19*scale))) if shot=='bottle-collect' else [])
    late_keys=[i*scale for i in (97,100,106,112,116,119)] if shot=='shaft-to-drive' and not empty else []
    priority_set=set(priorities+late_keys)
    order=priorities+late_keys+[i for i in range(count) if i not in priority_set]
    elapsed=[]
    for n,i in enumerate(order):
        r.state(ctx,i/scale,empty);path=work/f'frame_{i:04d}.png'
        if shot=='bottle-collect' and i==0:
            endpoint=r.WORK/'frames'/f'shaft-to-drive-{orientation}'/f'frame_{119*scale:04d}.png'
            if not endpoint.exists():raise RuntimeError('Missing genuine vehicle occlusion endpoint')
            shutil.copyfile(endpoint,path)
        if not path.exists():
            shared=r.WORK/'frames'/f'{shot}{suffix}-{orientation}'/path.name
            # Theme changes only matcher surroundings. Identical later world
            # frames are re-used from the already-rendered daylight film.
            if shot=='bottle-collect' and i==0:
                endpoint=r.WORK/'frames'/f'shaft-to-drive-{orientation}'/f'frame_{119*scale:04d}.png'
                if not endpoint.exists():raise RuntimeError('Missing genuine vehicle occlusion endpoint')
                shutil.copyfile(endpoint,path)
            elif theme=='dark' and i/scale>=45 and shared.exists():shutil.copyfile(shared,path)
            else:
                started=perf_counter();scene.render.filepath=str(path);r.bpy.ops.render.render(write_still=True);elapsed.append(perf_counter()-started)
        print('NATIVE_FRAME',name,i,'of',count,flush=True)
        if len(elapsed)==3:
            report={'name':name,'fps':meta['fps'],'resolution':resolution,'samples':samples,'firstThreeSeconds':elapsed,'averageSeconds':sum(elapsed)/3,'note':'Offline render production timing, not browser frame pacing.'}
            (work/'profile.json').write_text(json.dumps(report,indent=2)+'\n');print('PROFILE',json.dumps(report),flush=True)
        if priorities and n+1==len(priorities):
            first=priorities[0];study=r.WORK/f'{name}-motion-study.mp4'
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(meta['fps']),'-start_number',str(first),'-i',str(work/'frame_%04d.png'),'-frames:v',str(len(priorities)),'-an','-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(study)],check=True)
            print('MOTION_STUDY',study,flush=True)
    (work/'frames.json').write_text(json.dumps(meta,separators=(',',':'))+'\n')
    if shot=='shaft-to-drive' and not empty and theme=='light':
        first=100*scale;study=r.WORK/f'vehicle-foreground-pass-{orientation}-motion-study.mp4'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(meta['fps']),'-start_number',str(first),'-i',str(work/'frame_%04d.png'),'-frames:v',str(19*scale+1),'-an','-c:v','libx264','-threads','2','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(study)],check=True)
        print('FINAL_FOREGROUND_STUDY',study,flush=True)
    r.encode(name,work,count,resolution,meta)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--gates',action='store_true');p.add_argument('--films',action='store_true');p.add_argument('--single',choices=['shaft-to-drive','bottle-collect']);p.add_argument('--empty',action='store_true');p.add_argument('--theme',choices=['light','dark'],default='light');p.add_argument('--orientation',choices=['both','landscape','portrait'],default='both');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if a.gates:gates()
    if a.single:
        if a.orientation=='both':raise SystemExit('A single job requires its explicit orientation')
        film(a.single,a.orientation,a.empty,a.theme)
    if a.films:
        for orientation in ('landscape','portrait') if a.orientation=='both' else [a.orientation]:
            for shot in ('shaft-to-drive','bottle-collect'):film(shot,orientation)
            film('shaft-to-drive',orientation,True)
            film('shaft-to-drive',orientation,False,'dark')
            film('shaft-to-drive',orientation,True,'dark')
