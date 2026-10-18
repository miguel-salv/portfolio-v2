"""Final full-resolution plates, independent of the moving film resolution."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
import render as r

for orientation in ('landscape','portrait','phone'):
    for theme in ('light','dark'):
        suffix='-dark' if theme=='dark' else ''
        # Only the original first landscape draft used a superseded seat.
        if orientation=='landscape' and theme=='light':
            old=r.WORK/'keys'/'hero-push-landscape'/'frame_0048.png'
            if old.exists():old.unlink()
        r.render('hero-push',orientation,True,False,64,48,theme)
        r.render('hero-push',orientation,True,True,64,48,theme)
        if orientation=='portrait':r.render('hero-push',orientation,True,True,64,0,theme)
