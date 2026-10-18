"""One finite serial production pipeline; one fresh Blender process per job.

Releasing Metal caches between films avoids the severe M2 memory contention
seen when multiple scenes or long-lived cross-film caches overlap.
"""
from pathlib import Path
from datetime import datetime,timezone
import json,os,subprocess,sys,time,hashlib
ROOT=Path(__file__).resolve().parents[3];WORK=ROOT/'.impeccable/renders/home-motion'
BLENDER='/Applications/Blender.app/Contents/MacOS/Blender'
status_path=WORK/'pipeline-status.json'
status=json.loads(status_path.read_text()) if status_path.exists() else {'completedJobs':[]}
status.update(hostPid=os.getpid(),startedAt=datetime.now(timezone.utc).isoformat(),revision='pass-v2-opaque',state='running')

def save():status_path.write_text(json.dumps(status,indent=2)+'\n')
def run(name,script,args=()):
    if name in status['completedJobs']:
        print('PIPELINE_RETAINED_JOB',name,flush=True);return
    command=[BLENDER,'--background','--python',script]
    if args:command+=['--',*args]
    print('PIPELINE_JOB_START',name,json.dumps(command),flush=True)
    started=time.monotonic();child=subprocess.Popen(command,cwd=ROOT,stdin=subprocess.DEVNULL)
    status.update(currentJob=name,childPid=child.pid,jobStartedAt=datetime.now(timezone.utc).isoformat());save()
    code=child.wait()
    if code:
        status.update(state='failed',returnCode=code,childPid=None);save();raise SystemExit(code)
    status['completedJobs'].append(name);status.update(childPid=None,lastJobSeconds=time.monotonic()-started);save()
    print('PIPELINE_JOB_DONE',name,status['lastJobSeconds'],flush=True)

def film(name,shot,orientation,empty=False,theme='light'):
    args=['--single',shot,'--orientation',orientation,'--theme',theme]
    if empty:args+=['--empty']
    run(name,'reel/studies/home-motion/produce_films.py',args)

save()
film('corrected-landscape-drive','shaft-to-drive','landscape')
film('corrected-landscape-robot-prefix','bottle-collect','landscape')
film('corrected-landscape-dark-suffix','shaft-to-drive','landscape',theme='dark')
film('portrait-drive','shaft-to-drive','portrait')
film('portrait-robot','bottle-collect','portrait')
film('portrait-empty','shaft-to-drive','portrait',empty=True)
film('portrait-dark-drive','shaft-to-drive','portrait',theme='dark')
film('portrait-dark-empty','shaft-to-drive','portrait',empty=True,theme='dark')
run('matching-full-resolution-plates','reel/studies/home-motion/refresh_motion_stills.py')
run('final-editable-scene-anchors','reel/studies/home-motion/save_scenes.py')

hash_file=ROOT/'reel/studies/home-motion/source-hashes.json';hashes=json.loads(hash_file.read_text())
hashes['finalScripts']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'reel/studies/home-motion').glob('*.py'))}
hashes['finalSceneAnchors']={str(p.relative_to(ROOT)):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in sorted((ROOT/'reel/studies/home-motion').glob('*.blend'))}
hashes['finalizedAt']=datetime.now(timezone.utc).isoformat();hash_file.write_text(json.dumps(hashes,indent=2)+'\n')
status.update(state='renders-complete',currentJob=None,childPid=None,finishedAt=datetime.now(timezone.utc).isoformat());save()
print('SERIAL_NATIVE_PRODUCTION_COMPLETE',flush=True)
