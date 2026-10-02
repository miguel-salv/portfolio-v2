"""Derive purposeful 3:2 phone crops from the complete operational silhouettes.
Uses the authored landscape loops; retains alpha, all frames and original timing.
"""
from pathlib import Path
from datetime import datetime, timezone
import subprocess, re, json, math
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'public/assets/stories/moments'
for moment in ['vehicle','robot']:
    src=OUT/(moment+'-landscape.webm')
    result=subprocess.run(['ffmpeg','-hide_banner','-loglevel','info','-c:v','libvpx-vp9','-i',str(src),'-vf','alphaextract,bbox=min_val=16','-f','null','-'],capture_output=True,text=True,check=True)
    boxes=[tuple(map(int,m)) for m in re.findall(r'x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)',result.stderr)]
    x1=min(b[0] for b in boxes);x2=max(b[1] for b in boxes);y1=min(b[2] for b in boxes);y2=max(b[3] for b in boxes)
    width=max(x2-x1+80,(y2-y1+70)*1.5);width=min(1440,math.ceil(width/6)*6);height=int(width/1.5)
    x=max(0,min(1440-width,round(((x1+x2)/2-width/2)/2)*2));y=max(0,min(1080-height,round(((y1+y2)/2-height/2)/2)*2))
    crop=f'crop={width}:{height}:{x}:{y},scale=900:600'
    base=['ffmpeg','-hide_banner','-loglevel','error','-y','-c:v','libvpx-vp9','-i',str(src),'-vf',crop,'-an']
    subprocess.run(base+['-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0','-deadline','good','-cpu-used','3','-crf','32','-b:v','0','-g','15',str(OUT/(moment+'-portrait.webm'))],check=True)
    subprocess.run(base+['-c:v','hevc_videotoolbox','-allow_sw','1','-alpha_quality','.75','-pix_fmt','bgra','-q:v','45','-tag:v','hvc1','-movflags','+faststart',str(OUT/(moment+'-portrait.mov'))],check=True)
    png=Path('/tmp')/(moment+'-portrait-crop.png')
    subprocess.run(base[:base.index('-an')]+['-frames:v','1',str(png)],check=True)
    destination=OUT/(moment+'-portrait-poster.webp')
    subprocess.run(['/opt/homebrew/bin/cwebp','-q','92',str(png),'-o',str(destination)],check=True);png.unlink()
    prompt='Authored 3:2 phone framing of the existing '+moment+' Blender operational loop. Complete animation alpha bounds with safe margin, crop '+crop+'. Original geometry, motion and timing retained. Source reel/render_monograph_loops.py; crop reel/reframe_monograph_portraits.py.'
    destination.with_suffix('.webp.json').write_text(json.dumps({'prompt':prompt,'source':'reel/render_monograph_loops.py; reel/reframe_monograph_portraits.py','createdAt':datetime.now(timezone.utc).isoformat(),'resolution':[900,600]},indent=2)+'\n')
    timeline=OUT/'moments-timeline.json';data=json.loads(timeline.read_text())
    data['moments'][moment]['assets']['portrait']['resolution']=[900,600]
    data['rendered'][moment+'-portrait']['resolution']=[900,600]
    data['moments'][moment]['assets']['portrait']['crop']=crop
    timeline.write_text(json.dumps(data,indent=2)+'\n')
    print('PHONE CROP',moment,crop,flush=True)
