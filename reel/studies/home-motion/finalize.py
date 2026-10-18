"""CPU-only final provenance, source-anchor and finite delivery audit.

Run after pipeline.py reports renders-complete. This never launches Blender or
changes the approved original hero files. Keep its scan restricted to the study.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'reel/studies/home-motion'
OUT = ROOT / 'public/assets/studies/home-motion'
WORK = ROOT / '.impeccable/renders/home-motion'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def finalize():
    status = json.loads((WORK / 'pipeline-status.json').read_text())
    if status.get('state') != 'renders-complete':
        raise SystemExit('Native production is still active; defer finalization.')

    # The renderer embeds the native origin description after each conversion.
    # Repeat once over this one output folder before the independent skill scan.
    embed = subprocess.run(
        [sys.executable, 'reel/workbench/embed_xmp.py', str(OUT)],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    scan = subprocess.run(
        ['/Users/miguelsalvacion/.agents/skills/impeccable/scripts/impeccable',
         'embed-prompt', '--scan', str(OUT)],
        cwd=ROOT, capture_output=True, text=True,
    )
    (WORK / 'provenance-scan.txt').write_text(
        embed.stdout + embed.stderr + scan.stdout + scan.stderr
        + '\nscanExitCode=' + str(scan.returncode) + '\n'
    )
    if scan.returncode:
        raise SystemExit('Study raster provenance scan failed; inspect its log.')

    hashes_path = SOURCE / 'source-hashes.json'
    hashes = json.loads(hashes_path.read_text())
    current_anchors = {
        str(p.relative_to(ROOT)): {'sha256': digest(p), 'bytes': p.stat().st_size}
        for p in sorted(SOURCE.glob('*.blend'))
    }
    initial_anchors = hashes.get('packedSceneAnchors', {})
    if initial_anchors and initial_anchors != current_anchors:
        hashes.setdefault('initialCompositionAnchors', initial_anchors)
    hashes['packedSceneAnchors'] = current_anchors
    hashes['finalSceneAnchors'] = current_anchors
    hashes['finalScripts'] = {
        str(p.relative_to(ROOT)): digest(p) for p in sorted(SOURCE.glob('*.py'))
    }
    hashes['finalizedAt'] = datetime.now(timezone.utc).isoformat()
    hashes_path.write_text(json.dumps(hashes, indent=2) + '\n')

    subprocess.run([sys.executable, 'reel/studies/home-motion/verify.py'],
                   cwd=ROOT, check=True)
    subprocess.run([sys.executable, 'reel/studies/home-motion/review_packet.py'],
                   cwd=ROOT, check=True)
    verification = json.loads((WORK / 'verification.json').read_text())
    result = {
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'state': 'asset-audit-complete',
        'nativeProduction': status,
        'provenanceScan': scan.stdout.strip(),
        'verifiedChecks': len(verification['checks']),
        'webpCount': len(list(OUT.glob('*.webp'))),
        'mp4Count': len(list(OUT.glob('*.mp4'))),
        'webmCount': len(list(OUT.glob('*.webm'))),
        'packedAnchors': current_anchors,
        'visualAcceptance': 'Parent reviews the complete proof and motion evidence; technical verification alone does not establish visual acceptance.',
        'limitations': 'Photograph-referenced hidden geometry and illustrative modeled behavior remain documented in PROVENANCE.md.',
    }
    (WORK / 'asset-delivery.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    finalize()
