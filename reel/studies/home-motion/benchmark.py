"""Three production-resolution native half-step frames, re-used by the film."""
from pathlib import Path
from time import perf_counter
import json,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
import render as r
c=r.setup('shaft-to-drive','landscape',48);scene=c['scene']
scene.render.resolution_x=1280;scene.render.resolution_y=800
work=r.WORK/'frames/shaft-to-drive-landscape';work.mkdir(parents=True,exist_ok=True)
timings=[]
for source in (38,38.5,39):
    r.state(c,source);scene.render.filepath=str(work/f'frame_{int(source*2):04d}.png')
    started=perf_counter();r.bpy.ops.render.render(write_still=True);timings.append(perf_counter()-started)
prefs=r.bpy.context.preferences.addons['cycles'].preferences
result={'renderer':'Cycles','device':scene.cycles.device,'devices':[{'name':d.name,'type':d.type,'use':d.use} for d in prefs.devices],'resolution':[1280,800],'samples':48,'nativeFps':60,'sourceFrames':[38,38.5,39],'seconds':timings,'steadyMean':sum(timings[1:])/2,'firstFrameSetupIncluded':True,'note':'Offline render production cost, not browser frame pacing. Other render batches were paused during measurement.'}
(r.WORK/'benchmark.json').write_text(json.dumps(result,indent=2)+'\n');print('NATIVE_BENCHMARK',json.dumps(result),flush=True)
