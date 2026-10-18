"""Invalidate only reviewed late-camera/wipe pixels; retain every valid frame."""
from pathlib import Path
from datetime import datetime,timezone
import json,shutil,hashlib
ROOT=Path(__file__).resolve().parents[3];WORK=ROOT/'.impeccable/renders/home-motion'
stamp=WORK/'pass-v2-committed.json'
if stamp.exists():
    print('Final pass revision already committed; retaining its native cache.')
else:
    changed=[]
    for orientation,scale in [('landscape',2),('portrait',1)]:
        for name,indices in [(f'shaft-to-drive-{orientation}',range(94*scale+1,119*scale+1)),(f'shaft-to-drive-{orientation}-dark',range(94*scale+1,119*scale+1)),(f'bottle-collect-{orientation}',range(18*scale))]:
            for i in indices:
                old=WORK/'frames'/name/f'frame_{i:04d}.png'
                if old.exists():
                    archive=WORK/'historical-pass-v1'/name/old.name;archive.parent.mkdir(parents=True,exist_ok=True)
                    if not archive.exists():old.rename(archive)
                    else:old.unlink()
                    changed.append(str(old.relative_to(ROOT)))
        destination=WORK/'frames'/f'shaft-to-drive-{orientation}';destination.mkdir(parents=True,exist_ok=True)
        for frame in (94,100,106,112,116):
            source=WORK/f'late-v2-{orientation}'/f'frame_{frame:04d}.png'
            shutil.copyfile(source,destination/f'frame_{frame*scale:04d}.png')
        shutil.copyfile(WORK/f'endpoint-v2-{orientation}'/'frame_0119.png',destination/f'frame_{119*scale:04d}.png')
    # Landscape0 was already refreshed from the identical pre94 source pose.
    checkpoint=WORK/'motion-still-checkpoint.json'
    if checkpoint.exists():
        data=json.loads(checkpoint.read_text());data['renderRevision']=hashlib.sha256((ROOT/'reel/studies/home-motion/render.py').read_bytes()).hexdigest();checkpoint.write_text(json.dumps(data,indent=2)+'\n')
    stamp.write_text(json.dumps({'committedAt':datetime.now(timezone.utc).isoformat(),'invalidated':changed,'sourceRevision':hashlib.sha256((ROOT/'reel/studies/home-motion/render.py').read_bytes()).hexdigest(),'retained':'All drive source frames0–94, all valid portrait20–38, both existing landscape empty prefixes, robot source18 onward, unchanged dark matcher prefixes. Reviewed native-size gate PNGs are reused at their exact source times.'},indent=2)+'\n')
    print('Committed final camera/wipe revision; archived',len(changed),'affected cached frames.')
