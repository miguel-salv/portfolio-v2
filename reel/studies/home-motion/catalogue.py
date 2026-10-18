"""The one public asset map consumed by the isolated preview."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[3]
BASE='/assets/studies/home-motion/'

def still(name):return {'src':BASE+name+'.webp','metadata':BASE+name+'.webp.json'}
def original(name):return {'src':'/assets/workbench/'+name+'.webp','metadata':'/assets/workbench/'+name+'.webp.json'}

def write():
    data={'version':1,'hero':{},'films':{}}
    for ori in ('landscape','portrait','phone'):
        data['hero'][ori]={}
        for theme in ('light','dark'):
            suffix='-dark' if theme=='dark' else ''
            data['hero'][ori][theme]={
                'opening':original(f'matcher-{theme}-{ori}'),
                'emptyOpening':still(f'hero-push-empty-{ori}{suffix}-0000') if ori=='portrait' else original(f'matcher-{theme}-{ori}-empty'),
                'seat':still(f'hero-push-{ori}{suffix}-0048'),
                'emptySeat':still(f'hero-push-empty-{ori}{suffix}-0048'),
                'timeline':BASE+f'hero-push-{ori}{suffix}.json'}
    for ori in ('landscape','portrait'):
        drive=f'shaft-to-drive-{ori}';robot=f'bottle-collect-{ori}';empty=f'shaft-to-drive-empty-{ori}'
        data['films'][ori]={
            'drive':{'src':BASE+drive+'.mp4','webm':BASE+drive+'.webm','metadata':BASE+drive+'.json','poster':BASE+drive+'-0000.webp','seat':BASE+drive+'-vehicle.webp','shaft':BASE+drive+'-0044.webp','wheel':BASE+drive+'-0045.webp'},
            'robot':{'src':BASE+robot+'.mp4','webm':BASE+robot+'.webm','metadata':BASE+robot+'.json','poster':BASE+robot+'-0000.webp','bottle':BASE+robot+'-0018.webp','seat':BASE+robot+'-0119.webp'},
            'macroEmpty':{'src':BASE+empty+'.mp4','webm':BASE+empty+'.webm','metadata':BASE+empty+'.json'}}
        data['films'][ori]['drive']['dark']={'src':BASE+drive+'-dark.mp4','webm':BASE+drive+'-dark.webm','metadata':BASE+drive+'-dark.json','poster':BASE+f'hero-push-{ori}-dark-0048.webp','seat':BASE+drive+'-vehicle.webp'}
        data['films'][ori]['macroEmpty']['dark']={'src':BASE+empty+'-dark.mp4','webm':BASE+empty+'-dark.webm','metadata':BASE+empty+'-dark.json','poster':BASE+f'hero-push-empty-{ori}-dark-0048.webp'}
    (ROOT/'public/assets/studies/home-motion/catalogue.json').write_text(json.dumps(data,indent=2)+'\n')

if __name__=='__main__':write()
