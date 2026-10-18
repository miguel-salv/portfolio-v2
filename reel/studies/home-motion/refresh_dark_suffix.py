"""Publish the exact theme-independent corrected vehicle suffix, without GPU."""
from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,shutil,sys,hashlib
ROOT=Path(__file__).resolve().parents[3];WORK=ROOT/'.impeccable/renders/home-motion';OUT=ROOT/'public/assets/studies/home-motion'
sys.path.insert(0,str(ROOT/'reel'))
from workbench.embed_xmp import embed

name='shaft-to-drive-landscape-dark';light=json.loads((OUT/'shaft-to-drive-landscape.json').read_text());meta=json.loads((OUT/f'{name}.json').read_text())
source=WORK/'frames/shaft-to-drive-landscape';destination=WORK/'frames'/name
for i in range(90,239):
    target=destination/f'frame_{i:04d}.png'
    original=source/target.name
    if not target.exists() or hashlib.sha256(target.read_bytes()).digest()!=hashlib.sha256(original.read_bytes()).digest():shutil.copyfile(original,target)
    meta['frames'][i]=light['frames'][i]
meta['suffixReuse']={'source':'shaft-to-drive-landscape','sourceLogicalRange':[45,119],'exactNativePixels':True,'updatedAt':datetime.now(timezone.utc).isoformat()}
(OUT/f'{name}.json').write_text(json.dumps(meta,separators=(',',':'))+'\n');(destination/'frames.json').write_text(json.dumps(meta,separators=(',',':'))+'\n')
base=['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','60','-i',str(destination/'frame_%04d.png'),'-frames:v','239','-an']
subprocess.run(base+['-c:v','libx264','-threads','2','-preset','slow','-crf','18','-pix_fmt','yuv420p','-g','6','-movflags','+faststart',str(OUT/f'{name}.mp4')],check=True)
subprocess.run(base+['-c:v','libvpx-vp9','-deadline','good','-cpu-used','3','-threads','2','-crf','25','-b:v','0','-pix_fmt','yuv420p','-g','6',str(OUT/f'{name}.webm')],check=True)
poster=OUT/f'{name}-occlusion.webp';subprocess.run(['cwebp','-quiet','-q','96',str(destination/'frame_0238.png'),'-o',str(poster)],check=True)
details=dict(meta,frames=[meta['frames'][238]],origin='Genuine Cycles48 exterior tire119, exact pixel reuse from the theme-independent final vehicle source.',prompt='Genuine Cycles48 exterior tire119, exact pixel reuse from the theme-independent final vehicle source.')
poster.with_suffix('.webp.json').write_text(json.dumps(details,indent=2)+'\n');embed(poster)
print('Corrected dark vehicle suffix published by exact native-frame reuse; no Blender scene or raster interpolation.')
