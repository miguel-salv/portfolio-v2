"""Exact orthographic hero cameras; no browser media decoding is necessary."""
from pathlib import Path
import json,math
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/assets/studies/home-motion'

def dot(a,b):return sum(x*y for x,y in zip(a,b))
def normalized(a):
    length=math.sqrt(dot(a,a));return [v/length for v in a]
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]

def write():
    OUT.mkdir(parents=True,exist_ok=True)
    for ori in ('landscape','portrait','phone'):
        portrait=ori!='landscape'
        resolution={'landscape':[2400,1500],'portrait':[1080,1500],'phone':[1080,2160]}[ori]
        aspect=resolution[0]/resolution[1]
        start=[-2,-1,.1] if not portrait else ([0,0,5.1] if ori=='phone' else [0,0,1.8])
        end=[-1.8,-1,0] if not portrait else [0,0,.4]
        offset=[8,-12,10 if portrait else 9]
        firstspan={'landscape':14,'portrait':11.1,'phone':16}[ori]
        lastspan=11.8 if not portrait else 6.9/aspect
        right=normalized([12,8,0]);forward=normalized([-v for v in offset]);up=cross(right,forward)
        for theme in ('light','dark'):
            source=f'/assets/workbench/matcher-{theme}-{ori}.webp'
            source_meta=json.loads((ROOT/'public'/source.lstrip('/')).with_suffix('.webp.json').read_text())
            frames=[]
            for frame in range(49):
                t=frame/48;t=t*t*(3-2*t)
                target=[a+(b-a)*t for a,b in zip(start,end)];span=firstspan+(lastspan-firstspan)*t
                hs=span*min(1,aspect);vs=span*min(1,1/aspect)
                p=[.5-dot(right,target)/hs,.5+dot(up,target)/vs]
                fw=(6.9 if portrait else 7.8)/hs;fh=(6.9 if portrait else 5.85)/vs
                frames.append({'frame':frame,'camera':{'projection':'ortho','position':[a+b for a,b in zip(target,offset)],'target':target,'rotation':source_meta['camera']['rotation'],'span':span,'horizontalSpan':hs,'verticalSpan':vs,'matcherFilmFrame':{'left':p[0]-fw/2,'top':p[1]-fh/2,'width':fw,'height':fh}},'empty':False})
            meta={'fps':30,'frameCount':49,'duration':49/30,'lastFrameTime':48/30,'width':resolution[0],'height':resolution[1],'orientation':ori,'theme':theme,'alpha':False,'affine':True,'renderer':'Exact orthographic reprojection of source Cycles image','source':source,'sourceMetadata':source+'.json','sourceCamera':source_meta['camera'],'markers':{'inspection':48},'frames':frames,'accuracy':'Fixed camera direction and static illumination make this pan/zoom mathematically identical to re-rendering the same scene; final resting plates are separately rendered for sharpness. No optical-flow or invented intermediate motion.'}
            filename=f'hero-push-{ori}'+('-dark' if theme=='dark' else '')+'.json'
            (OUT/filename).write_text(json.dumps(meta,separators=(',',':'))+'\n')

if __name__=='__main__':write()
