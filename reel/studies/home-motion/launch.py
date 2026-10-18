"""Detach the explicitly authorized long render from chat-tool cancellation.

This is one finite local production process, not an automation or service.
"""
from pathlib import Path
from datetime import datetime,timezone
import json,os,subprocess,sys
ROOT=Path(__file__).resolve().parents[3]
WORK=ROOT/'.impeccable/renders/home-motion'
WORK.mkdir(parents=True,exist_ok=True)
status=WORK/'render-process.json'
check=[]
if status.exists():check.append(json.loads(status.read_text()).get('pid'))
pipeline=WORK/'pipeline-status.json'
if pipeline.exists():
    current=json.loads(pipeline.read_text());check.extend([current.get('hostPid'),current.get('childPid')])
for pid in set(p for p in check if p):
    try:
        os.kill(pid,0)
        command_line=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout
        if any(name in command_line for name in ('reel/studies/home-motion/produce_films.py','reel/studies/home-motion/pipeline.py','reel/studies/home-motion/refresh_motion_stills.py','reel/studies/home-motion/save_scenes.py')):
            raise SystemExit('Render process already alive: '+str(pid))
    except ProcessLookupError:pass
command=[sys.executable,'reel/studies/home-motion/pipeline.py']
with (WORK/'native-production.log').open('ab',buffering=0) as output:
    process=subprocess.Popen(command,cwd=ROOT,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
data={'pid':process.pid,'command':command,'startedAt':datetime.now(timezone.utc).isoformat(),'log':str(WORK/'native-production.log'),'finiteJob':True}
status.write_text(json.dumps(data,indent=2)+'\n');print(json.dumps(data))
