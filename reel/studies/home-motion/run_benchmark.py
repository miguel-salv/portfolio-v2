"""Host helper: keep the Metal benchmark free of our own competing batch."""
from pathlib import Path
import os,signal,subprocess
ROOT=Path(__file__).resolve().parents[3]
match='Blender --background --python reel/studies/home-motion/produce_films.py -- --gates'
result=subprocess.run(['pgrep','-f',match],capture_output=True,text=True)
pids=[int(p) for p in result.stdout.split()]
try:
    for pid in pids:os.kill(pid,signal.SIGSTOP)
    subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender','--background','--python','reel/studies/home-motion/benchmark.py'],cwd=ROOT,check=True)
finally:
    for pid in pids:
        try:os.kill(pid,signal.SIGCONT)
        except ProcessLookupError:pass
