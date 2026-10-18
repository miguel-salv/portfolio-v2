"""Verify the finite asset delivery and write its consumption manifest."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/assets/studies/home-motion'
WORK=ROOT/'.impeccable/renders/home-motion'

def read(path):return json.loads(path.read_text())
def resolve(url):return ROOT/'public'/url.lstrip('/')
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def probe(path):
    result=subprocess.run(['ffprobe','-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_read_frames,pix_fmt','-of','json',str(path)],check=True,capture_output=True,text=True)
    return json.loads(result.stdout)['streams'][0]
def pixel_digest(path):
    result=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(path),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],check=True,capture_output=True)
    return hashlib.sha256(result.stdout).hexdigest()

def verify():
    catalogue=read(OUT/'catalogue.json');checks=[];errors=[];manifest={'produce':[],'direct':[],'semantic':[]}
    source_hashes=read(ROOT/'reel/studies/home-motion/source-hashes.json')
    for relative,expected in source_hashes.get('unchangedHeroInputs',{}).items():
        assert digest(ROOT/relative)==expected,'Original hero changed: '+relative
    checks.append({'check':'approved original hero inputs remain byte-identical','files':len(source_hashes.get('unchangedHeroInputs',{})),'result':'pass'})
    protected={p:h for p,h in source_hashes.get('sources',{}).items() if not p.startswith('reel/studies/home-motion/')}
    for relative,expected in protected.items():
        assert digest(ROOT/relative)==expected,'Read-only source changed: '+relative
    checks.append({'check':'original scene, library and documentary inputs remain byte-identical','files':len(protected),'result':'pass'})
    for orientation,themes in catalogue['hero'].items():
        for theme,entry in themes.items():
            timeline=read(resolve(entry['timeline']))
            assert timeline['affine'] and len(timeline['frames'])==49
            assert timeline['frames'][0]['camera']['position']==timeline['sourceCamera']['position'] or all(abs(a-b)<1e-5 for a,b in zip(timeline['frames'][0]['camera']['position'],timeline['sourceCamera']['position']))
            checks.append({'check':'exact affine hero','orientation':orientation,'theme':theme,'frames':49,'result':'pass'})
            for role in ('opening','emptyOpening','seat','emptySeat'):
                asset=entry[role];path=resolve(asset['src']);meta=read(resolve(asset['metadata']))
                if not path.exists():errors.append('Missing '+str(path));continue
                row={'id':f'hero-{orientation}-{theme}-{role}','source_crop':'reel/workbench/matcher-workbench.blend','output_path':str(path.relative_to(ROOT)),'strategy':'unchanged source render' if '/workbench/' in asset['src'] else 'dedicated Cycles camera plate','prompt_used':meta.get('origin',meta.get('prompt')),'dimensions':meta.get('resolution',[meta.get('width'),meta.get('height')]),'format':'webp','transparency':False,'deviations':None,'sha256':digest(path),'qa_status':'accepted'}
                manifest['direct' if '/workbench/' in asset['src'] else 'produce'].append(row)
    for orientation,entries in catalogue['films'].items():
        for role in ('drive','robot','macroEmpty'):
            for theme,entry in [('light',entries[role])]+([('dark',entries[role]['dark'])] if 'dark' in entries[role] else []):
                meta_path=resolve(entry['metadata'])
                if not meta_path.exists():errors.append('Missing '+str(meta_path));continue
                meta=read(meta_path);scale=2 if orientation=='landscape' else 1
                expected=(44 if role=='macroEmpty' else 119)*scale+1
                assert meta['frameCount']==expected and len(meta['frames'])==expected and meta['fps']==30*scale
                assert meta['frames'][-1]['sourceFrame']==(44 if role=='macroEmpty' else 119)
                for kind in ('src','webm'):
                    path=resolve(entry[kind])
                    if not path.exists():errors.append('Missing '+str(path));continue
                    info=probe(path);assert int(info['nb_read_frames'])==expected
                    assert info['width']==meta['width'] and info['height']==meta['height']
                    assert info['r_frame_rate']==str(meta['fps'])+'/1'
                    manifest['produce'].append({'id':f'{role}-{orientation}-{theme}-{path.suffix[1:]}','source_crop':'reel/studies/home-motion/render.py','output_path':str(path.relative_to(ROOT)),'strategy':'native Cycles world render; bounded-seek encoding','prompt_used':None,'dimensions':[info['width'],info['height']],'format':path.suffix[1:],'transparency':False,'frame_count':expected,'fps':meta['fps'],'deviations':'One genuine shared endpoint for the completely occluded scene cut.' if role=='robot' else None,'sha256':digest(path),'qa_status':'needs_parent_review'})
                    checks.append({'check':'native film','path':str(path.relative_to(ROOT)),'frames':expected,'fps':meta['fps'],'result':'pass'})
        scale=2 if orientation=='landscape' else 1
        suffix_source=WORK/'frames'/f'shaft-to-drive-{orientation}'
        suffix_dark=WORK/'frames'/f'shaft-to-drive-{orientation}-dark'
        for i in range(45*scale,119*scale+1):
            assert digest(suffix_source/f'frame_{i:04d}.png')==digest(suffix_dark/f'frame_{i:04d}.png')
        checks.append({'check':'theme-independent vehicle suffix uses exact native source bytes','orientation':orientation,'frames':(119-45)*scale+1,'result':'pass'})
        a=WORK/'frames'/f'shaft-to-drive-{orientation}'/f'frame_{119*scale:04d}.png'
        b=WORK/'frames'/f'bottle-collect-{orientation}'/'frame_0000.png'
        if a.exists() and b.exists():
            assert digest(a)==digest(b)
            checks.append({'check':'exact genuine tire endpoint reuse','orientation':orientation,'sha256':digest(a),'result':'pass'})
        a=OUT/f'shaft-to-drive-{orientation}-0119.webp';b=OUT/f'bottle-collect-{orientation}-0000.webp'
        if a.exists() and b.exists():
            assert pixel_digest(a)==pixel_digest(b)
            checks.append({'check':'exact endpoint poster pixels','orientation':orientation,'result':'pass'})
    # Include the dedicated full-resolution camera gates and film recovery
    # images, not only the hero plates and encoded streams, in the handoff.
    listed={row['output_path'] for row in manifest['produce']+manifest['direct']}
    for path in sorted(OUT.glob('*.webp')):
        relative=str(path.relative_to(ROOT))
        if relative in listed:continue
        sidecar=path.with_suffix('.webp.json')
        if not sidecar.exists():errors.append('Missing '+str(sidecar));continue
        meta=read(sidecar)
        manifest['produce'].append({'id':path.stem,'source_crop':'reel/workbench/matcher-workbench.blend; reel/workbench/*-spatial-library.blend','output_path':relative,'strategy':'dedicated Cycles camera still or genuine native-frame recovery poster','prompt_used':meta.get('origin',meta.get('prompt')),'dimensions':[meta.get('width'),meta.get('height')],'format':'webp','transparency':False,'deviations':'Exact shared vehicle endpoint.' if meta.get('endpointReuse') else None,'sha256':digest(path),'qa_status':'needs_parent_review'})
    manifest['semantic']=[
        {'id':'hero-camera-handoff','implementation':'One canvas/image owner uses catalogue hero source metadata,49 calibrated orthographic camera frames and occupied/empty high-resolution resting plates. CSS owns viewport composition; HTML owns all type and controls. Live renderer preserves selected angles and opts into matching camera/bounce/rotorOffset.','notes':'No navigation, copy, buttons, card chrome or layout are baked into scene assets.','qa_status':'needs_parent_review'},
        {'id':'progressive-film-sequence','implementation':'One shared controller uses logical0–119 markers, native frameScale2 landscape/1 portrait, first-frame readiness and cancellation to hand off opaque films. Load drive,robot and empty clips progressively. Preserve native document scroll,static image recovery and reduced-motion alternatives.','notes':'All interface measurements and detection labels remain semantic HTML/SVG/canvas.','qa_status':'needs_parent_review'}]
    manifest.update(execution_order=['approved hero source and camera plates','mechanism and environment still gate','native macro/drive and bottle/collection films','theme background prefixes','technical verification and parent motion review'],blockers=errors,assumptions=['Existing photographic reconstruction limits remain documented.','No UI or existing homepage files were edited by asset production.','Native encoded rate is distinct from measured browser frame pacing.'],createdAt=datetime.now(timezone.utc).isoformat())
    (OUT/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
    report={'passed':not errors,'checks':checks,'errors':errors,'createdAt':datetime.now(timezone.utc).isoformat()}
    (WORK/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'passed':not errors,'checks':len(checks),'missing':errors}))
    if errors:raise SystemExit(1)

if __name__=='__main__':verify()
