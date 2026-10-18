"""Verify final workbench media, preview removal, transparency and provenance."""
from pathlib import Path
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/assets/workbench';WORK=ROOT/'.impeccable/renders/workbench/spatial/frames60'
checks=[]

def check(label,condition):
    checks.append({'check':label,'passed':bool(condition)})

def probe(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(path)]))

for name in ['vehicle','robot','companion','keychain']:
    for orientation,resolution in [('landscape',[1800,1350]),('portrait',[1080,1500])]:
        path=OUT/f'{name}-scene-{orientation}.webp'
        check(str(path.relative_to(ROOT))+' exists',path.exists())
        if not path.exists():continue
        data=json.loads(path.with_suffix('.webp.json').read_text())
        check(path.name+' final samples',data.get('samples')==96 and not data.get('preview'))
        check(path.name+' dimensions',data.get('resolution')==resolution)
        info=subprocess.check_output(['magick','identify','-format','%[opaque]',str(path)]).decode().strip()
        check(path.name+' alpha',info=='False')
        check(path.name+' embedded provenance',data.get('metadataEmbedded')=='XMP')
for name,count in [('journey-landscape',421),('journey-reverse',421),('vehicle-action',121),('robot-action',141)]:
    for extension in ['webm','mov']:
        path=OUT/f'{name}.{extension}';check(path.name+' exists',path.exists())
        if not path.exists():continue
        data=probe(path);video=next(s for s in data['streams'] if s['codec_type']=='video')
        check(path.name+' frame count',int(video.get('nb_read_frames',0))==count)
        check(path.name+' dimensions',[video['width'],video['height']]==[1080,810])
        check(path.name+' frame rate',video['r_frame_rate']=='60/1')
        check(path.name+' no audio',not any(s['codec_type']=='audio' for s in data['streams']))
        if extension=='webm':check(path.name+' alpha track',video.get('tags',{}).get('alpha_mode')=='1')
source=ROOT/'.impeccable/renders/matcher-film/landscape/frame_0030.png';start=WORK/'frame_0000.png'
check('exact matcher source handoff',start.exists() and hashlib.sha256(start.read_bytes()).digest()==hashlib.sha256(source.read_bytes()).digest())
check('complete master PNG sequence',all((WORK/f'frame_{i:04d}.png').exists() for i in range(421)))
result={'passed':all(c['passed'] for c in checks),'checks':checks}
path=ROOT/'.impeccable/review/workbench/production-verification.json';path.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':result['passed'],'checks':len(checks),'failed':[c['check'] for c in checks if not c['passed']]},indent=2))
raise SystemExit(0 if result['passed'] else 1)
