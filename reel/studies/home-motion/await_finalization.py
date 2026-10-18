"""Finite CPU-only completion watch for a resumable native production queue."""
from pathlib import Path
from datetime import datetime, timezone
import json
import os
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
WORK = ROOT / '.impeccable/renders/home-motion'
started = time.monotonic()
last_job = None
record = WORK / 'finalization-process.json'
record.write_text(json.dumps({
    'pid': os.getpid(), 'startedAt': datetime.now(timezone.utc).isoformat(),
    'finiteTimeoutSeconds': 14400, 'state': 'waiting-for-native-queue',
    'scope': 'CPU-only. Does not launch Blender or modify original hero assets.',
}, indent=2) + '\n')
while time.monotonic() - started < 14400:
    status = json.loads((WORK / 'pipeline-status.json').read_text())
    if status.get('currentJob') != last_job:
        last_job = status.get('currentJob')
        print('NATIVE_JOB', last_job, flush=True)
    if status.get('state') == 'failed':
        raise SystemExit('Native queue failed; preserve caches and inspect its log.')
    if status.get('state') == 'renders-complete':
        result = subprocess.run([sys.executable, 'reel/studies/home-motion/finalize.py'], cwd=ROOT)
        data = json.loads(record.read_text())
        data.update(state='complete' if result.returncode == 0 else 'failed',
                    returnCode=result.returncode,
                    finishedAt=datetime.now(timezone.utc).isoformat())
        record.write_text(json.dumps(data, indent=2) + '\n')
        raise SystemExit(result.returncode)
    time.sleep(30)
raise SystemExit('Finite finalization watch timed out; native queue was not cancelled.')
