"""Reverse the exact authored states for native backward playback, without interpolation."""
from pathlib import Path
import subprocess,json,shutil
ROOT=Path(__file__).resolve().parents[2];WORK=ROOT/'.impeccable/renders/workbench/spatial';OUT=ROOT/'public/assets/workbench'
def encode_reverse():
    frames=WORK/'frames60';ordered=WORK/'reverse60';ordered.mkdir(parents=True,exist_ok=True)
    for i in range(421):
        source=frames/f'frame_{420-i:04d}.png';target=ordered/f'frame_{i:04d}.png'
        if not source.exists():raise RuntimeError('Incomplete master sequence')
        if not target.exists():target.symlink_to(source)
    options=[('webm',['-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0','-deadline','good','-cpu-used','3','-threads','2','-crf','27','-b:v','0','-g','6']),('mov',['-c:v','hevc_videotoolbox','-allow_sw','1','-alpha_quality','.9','-pix_fmt','bgra','-q:v','55','-g','1','-tag:v','hvc1','-movflags','+faststart'])]
    for extension,opts in options:
        destination=OUT/f'journey-reverse.{extension}'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','60','-i',str(ordered/'frame_%04d.png'),'-frames:v','421','-an']+opts+[str(destination)],check=True)
        print('REVERSE_ENCODED',extension,flush=True)
    (OUT/'journey-reverse.json').write_text(json.dumps({'fps':60,'frameCount':421,'width':1080,'height':810,'alpha':True,'audio':False,'source':'journey-landscape','mapping':'reverse encoded frame i = forward encoded frame 420-i; no interpolation','sourceTimelineFps':30,'samples':48},indent=2)+'\n')
if __name__=='__main__':encode_reverse()
