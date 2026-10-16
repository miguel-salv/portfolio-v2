"""Prepare the opening action from the existing authored transparent frames.

The complete six-second inspection film loads after an explicit Inside action.
VP9 packets are copied exactly. HEVC uses the original PNG frames and encoding
settings because generic MOV remuxing loses Apple's auxiliary alpha metadata.
Run after encoding full films: python3 scripts/build-matcher-assembly-films.py
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
FILMS = ROOT / 'public/assets/matcher/film'


def build(variant):
    metadata_file = FILMS / f'{variant}.json'
    metadata = json.loads(metadata_file.read_text())
    count = metadata['assemblyEnd'] + 1
    outputs = {}
    for extension in ('webm', 'mov'):
        source = FILMS / f'matcher-{variant}.{extension}'
        target = FILMS / f'matcher-{variant}-assembly.{extension}'
        temporary = target.with_name(f'.{target.stem}.tmp.{extension}')
        command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y']
        if extension == 'webm':
            command += ['-i', str(source), '-map', '0:v:0', '-frames:v', str(count), '-c', 'copy']
        else:
            frames = ROOT / '.impeccable/renders/matcher-film' / variant
            if any(not (frames / f'frame_{index:04d}.png').exists() for index in range(count)):
                raise RuntimeError('HEVC alpha encoding requires the original opening PNG frames')
            command += ['-framerate', str(metadata['fps']), '-start_number', '0',
                        '-i', str(frames / 'frame_%04d.png'), '-frames:v', str(count), '-an',
                        '-vf', f"scale={metadata['width']}:{metadata['height']}",
                        '-c:v', 'hevc_videotoolbox', '-allow_sw', '1',
                        '-alpha_quality', '.85' if variant == 'portrait' else '.9',
                        '-pix_fmt', 'bgra', '-q:v', '45' if variant == 'portrait' else '55',
                        '-g', '1', '-tag:v', 'hvc1', '-movflags', '+faststart']
        try:
            subprocess.run(command + [str(temporary)], check=True)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        # Reuse the same authored frames, cadence, alpha, materials and camera
        # projection. HEVC retains the complete film's original quality settings.
        outputs[extension] = f'/assets/matcher/film/{target.name}'
    signature = hashlib.sha256(b''.join(
        (FILMS / Path(outputs[extension]).name).read_bytes() for extension in ('webm', 'mov')
    )).hexdigest()
    metadata['assemblyMedia'] = {**outputs, 'frameCount': count, 'signature': signature,
                                 'sourceMediaSignature': metadata.get('mediaSignature')}
    metadata_file.write_text(json.dumps(metadata, separators=(',', ':')) + '\n')
    print(json.dumps({'variant': variant, 'frames': count, 'bytes': {
        extension: (FILMS / Path(url).name).stat().st_size for extension, url in outputs.items()
    }}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--variant', choices=('portrait', 'landscape'))
    args = parser.parse_args()
    for selected in (args.variant,) if args.variant else ('portrait', 'landscape'):
        build(selected)
