"""Record reproducible inputs and shipped workbench files after production QA."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib,json
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/workbench'
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
source_path=ROOT/'reel/workbench/source-hashes.json'
sources=json.loads(source_path.read_text())
for name in ('reel/workbench/verify_production.py','reel/workbench/encode_reverse.py','reel/workbench/embed_xmp.py','reel/workbench/write_manifest.py','reel/workbench/companion-display-reference.png','reel/workbench/matcher-pcb.glb','reel/workbench/keychain.glb'):
    sources[name]=''
sources={name:digest(ROOT/name) for name in sources}
source_path.write_text(json.dumps(sources,indent=2)+'\n')
files={str(path.relative_to(OUT)):{'bytes':path.stat().st_size,'sha256':digest(path)} for path in sorted(OUT.rglob('*')) if path.is_file() and path.name!='MANIFEST.json'}
manifest={'createdAt':datetime.now(timezone.utc).isoformat(),'generator':'python3 reel/workbench/write_manifest.py','sourceHashes':'reel/workbench/source-hashes.json','provenance':'reel/workbench/PROVENANCE.md','film':{'frames':421,'fps':60,'resolution':[1080,810],'samples':48,'alpha':True,'audio':False},'presentationStills':{'count':8,'samples':96,'alpha':True},'verification':'python3 reel/workbench/verify_production.py','reviewEvidence':'.impeccable/review/workbench/final/','files':files}
(OUT/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Recorded {len(sources)} source inputs and {len(files)} public artifacts.')
