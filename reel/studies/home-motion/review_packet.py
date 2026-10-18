"""Export final review sheets and short studies from genuine completed frames.

CPU-only: this reads the final caches, never launches Blender and never invents
an intermediate image. Half-speed studies explicitly change playback rate.
"""
from pathlib import Path
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[3]
WORK = ROOT / '.impeccable/renders/home-motion'
OUT = ROOT / 'public/assets/studies/home-motion'


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                    '-threads', '2', *map(str, args)], check=True)


def study(orientation, name, first, last, native_rate, source_name):
    scale = 2 if orientation == 'landscape' else 1
    frames = WORK / 'frames' / source_name
    metadata = json.loads((frames / 'frames.json').read_text())
    count = last - first + 1
    for playback_rate in (1, .5):
        suffix = '' if playback_rate == 1 else '-half-speed'
        path = WORK / (name + suffix + '.mp4')
        ffmpeg('-framerate', native_rate * playback_rate,
               '-start_number', first, '-i', frames / 'frame_%04d.png',
               '-frames:v', count, '-an', '-c:v', 'libx264', '-crf', '17',
               '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path)
        record = {
            'source': str(frames.relative_to(ROOT)),
            'sourceMetadata': str((frames / 'frames.json').relative_to(ROOT)),
            'nativeFps': native_rate,
            'playbackFps': native_rate * playback_rate,
            'playbackRate': playback_rate,
            'frameCount': count,
            'sourceNativeFrames': [first, last],
            'sourceLogicalFrames': [first / scale, last / scale],
            'frames': metadata['frames'][first:last + 1],
            'method': 'Contiguous genuine rendered native frames, each encoded once. No optical flow, repeated-frame conversion or raster interpolation.',
        }
        path.with_suffix('.mp4.json').write_text(json.dumps(record, indent=2) + '\n')


def sheet(name, sources, tile_size, columns):
    temporary = WORK / 'review-sources' / name
    temporary.mkdir(parents=True, exist_ok=True)
    for index, path in enumerate(sources):
        shutil.copyfile(path, temporary / f'{index:02d}{path.suffix}')
    # First normalize without changing aspect, then tile. These are review
    # ingredients only; the public assets remain at their native resolution.
    normalized = temporary / 'normalized'
    normalized.mkdir(exist_ok=True)
    width, height = tile_size
    for index, path in enumerate(sources):
        ffmpeg('-i', path, '-frames:v', '1', '-vf',
               f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=0x242421',
               normalized / f'{index:02d}.png')
    rows = (len(sources) + columns - 1) // columns
    target = WORK / (name + '.jpg')
    ffmpeg('-framerate', '1', '-i', normalized / '%02d.png', '-vf',
           f'tile={columns}x{rows}', '-frames:v', '1', '-q:v', '2', target)
    target.with_suffix('.jpg.json').write_text(json.dumps({
        'columns': columns, 'rows': rows, 'tileSize': tile_size,
        'sourcesInReadingOrder': [str(p.relative_to(ROOT)) for p in sources],
        'purpose': 'Final intermediate-frame contact sheet. Review-only downscaling; public stills retain full resolution.',
    }, indent=2) + '\n')


def export():
    for orientation in ('landscape', 'portrait'):
        scale = 2 if orientation == 'landscape' else 1
        rate = 30 * scale
        study(orientation, f'vehicle-foreground-pass-{orientation}-motion-study',
              94 * scale, 119 * scale, rate, f'shaft-to-drive-{orientation}')
        study(orientation, f'robot-occlusion-reveal-{orientation}-final',
              0, 18 * scale, rate, f'bottle-collect-{orientation}')
        native = [round(v * scale) for v in (0, .5, 1.5, 3, 5, 7, 9, 11, 13, 15, 17, 18)] if scale == 2 else [0, 1, 2, 3, 5, 7, 9, 11, 13, 15, 17, 18]
        sheet(f'robot-occlusion-reveal-{orientation}-final',
              [WORK / 'frames' / f'bottle-collect-{orientation}' / f'frame_{i:04d}.png' for i in native],
              (480, 300) if scale == 2 else (270, 375), 4)
        sheet(f'final-full-resolution-keys-{orientation}', [
            OUT / f'hero-push-{orientation}-0048.webp',
            OUT / f'shaft-to-drive-{orientation}-0030.webp',
            OUT / f'shaft-to-drive-{orientation}-0044.webp',
            OUT / f'shaft-to-drive-{orientation}-0045.webp',
            OUT / f'shaft-to-drive-{orientation}-0097.webp',
            OUT / f'bottle-collect-{orientation}-0018.webp',
            OUT / f'bottle-collect-{orientation}-0078.webp',
            OUT / f'bottle-collect-{orientation}-0119.webp',
        ], (480, 300) if scale == 2 else (270, 375), 4)
    print('Exported final review packet from genuine completed frame caches.')


if __name__ == '__main__':
    export()
