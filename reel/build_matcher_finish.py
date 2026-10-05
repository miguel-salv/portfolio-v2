"""Export the hero's actual Blender display transform and fine metal bump.

blender --background --python reel/build_matcher_finish.py
The small 3D lookup replaces the browser's approximate AgX transform in one
texture lookup. No render pass, source blend or hero image is changed.
"""
from pathlib import Path
from datetime import datetime, timezone
from math import pi
import bpy, json, struct
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/assets/matcher'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'

size, minimum, maximum = 33, -12, 8
# X changes fastest, then Y, then Z: WebGL's 3D texture memory order.
image = bpy.data.images.new('Hero display transform', width=size*size, height=size, alpha=True, float_buffer=True)
image.colorspace_settings.name = 'Linear Rec.709'
pixels = []
levels = [2**(minimum + (maximum-minimum)*i/(size-1)) for i in range(size)]
for blue in levels:
    for green in levels:
        for red in levels:
            pixels.extend((red, green, blue, 1))
image.pixels.foreach_set(pixels)
temporary = Path('/tmp/matcher-hero-color-lut.png')
image.save_render(str(temporary), scene=scene)
encoded = bpy.data.images.load(str(temporary), check_existing=False)
# Read the already display-encoded bytes without another sRGB conversion.
encoded.colorspace_settings.name = 'Non-Color'
rgba = bytearray(round(max(0,min(1,value))*255) for value in encoded.pixels[:])
(OUT/'hero-color-lut.bin').write_bytes(b'MLT1' + struct.pack('<Iff', size, minimum, maximum) + rgba)
(OUT/'hero-color-lut.bin.json').write_text(json.dumps({
    'source': 'reel/build_matcher_finish.py; Blender bundled OCIO color configuration',
    'description': 'Actual Blender AgX / Medium High Contrast / sRGB display transform sampled on a 33-cubed logarithmic RGB lattice. Runtime interpolation is approximate between samples; no generated imagery or new color grade.',
    'blenderVersion': bpy.app.version_string, 'size': size,
    'minimumEV': minimum, 'maximumEV': maximum,
    'createdAt': datetime.now(timezone.utc).isoformat()
},indent=2)+'\n')
temporary.unlink()

# Isotropic fine machining replaces the previous strong horizontal bands.
# Sixteen noise cells per tile, repeated 8.75 times over the export's UV scale
# of three, reproduce the hero's 420-cell material scale.
width = 512
bump = bpy.data.images.new('Hero fine metal bump',width=width,height=width,alpha=False)
bump.colorspace_settings.name = 'Non-Color'
pixels = []
for y in range(width):
    for x in range(width):
        point = Vector((16*x/width,16*y/width,.371))
        value = .5 + .25*noise.noise(point,noise_basis='PERLIN_NEW') + .125*noise.noise(point*2,noise_basis='PERLIN_NEW')
        pixels.extend((value,value,value,1))
bump.pixels.foreach_set(pixels)
bump.filepath_raw = str(OUT/'metal-bump.png')
bump.file_format = 'PNG'
bump.save()
(OUT/'metal-bump.png.json').write_text(json.dumps({
    'source':'reel/build_matcher_finish.py',
    'description':'Authored deterministic isotropic machining height, 512 squared, linear grayscale. Fine Perlin detail approximates the hero material noise; live bump distance is 0.002 times strength 0.12. Roughness and base color retain the original material values.',
    'createdAt':datetime.now(timezone.utc).isoformat()
},indent=2)+'\n')
print('AUTHORED hero color lookup and isotropic metal bump',flush=True)
