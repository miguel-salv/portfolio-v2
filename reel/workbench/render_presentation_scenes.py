"""Distinct project presentation stills; semantic page UI remains outside assets."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,subprocess,sys
from math import radians
import bpy
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'reel'));sys.path.insert(0,str(ROOT/'reel/workbench'))
from workbench_world import subject,lighting,configure,box,material,bounds,aim
from render_spatial_journey import build,state,STATIONS
OUT=ROOT/'public/assets/workbench'


def export(name,orientation,preview=False):
    scene=bpy.context.scene;portrait=orientation=='portrait'
    scene.render.resolution_x,scene.render.resolution_y=(1080,1500) if portrait else (1800,1350)
    if preview:scene.render.resolution_x//=2;scene.render.resolution_y//=2
    scene.cycles.samples=8 if preview else 96
    output=ROOT/'.impeccable/renders/workbench/presentations' if preview else OUT;output.mkdir(parents=True,exist_ok=True)
    path=output/f'{name}-scene-{orientation}.webp';png=path.with_suffix('.png')
    scene.render.filepath=str(png);bpy.ops.render.render(write_still=True)
    subprocess.run(['cwebp','-quiet','-q','95',str(png),'-o',str(path)],check=True);png.unlink()
    origin=f'Authored Blender Cycles distinct {name} presentation at {scene.cycles.samples} samples. Existing source CAD/committed KiCad geometry or explicit photograph-referenced reconstruction. Physical materials, contact shadows, shared emitter design, transparent background. Vehicle assembly fixture; robot test lane; Companion pale desk; LED keychain macro over its actual schematic. No documentary image is altered.'
    subprocess.run(['/Users/miguelsalvacion/.agents/skills/impeccable/scripts/impeccable','embed-prompt',str(path),'--prompt',origin],check=True,stdout=subprocess.DEVNULL)
    path.with_suffix('.webp.json').write_text(json.dumps({'origin':origin,'prompt':origin,'subject':name,'orientation':orientation,'resolution':[scene.render.resolution_x,scene.render.resolution_y],'alpha':True,'samples':scene.cycles.samples,'source':'reel/workbench/render_presentation_scenes.py; reel/workbench/render_spatial_journey.py; original project CAD/board files and photographs','accuracy':'Photographic reconstructions retain inferred hidden dimensions; presentation separation is illustrative and is not original CAD or measured telemetry. Keychain reverse-mount LED diffusers align to the actual front artwork apertures.','createdAt':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
    from workbench.embed_xmp import embed
    embed(path)
    print('PRESENTATION_RENDER',str(path),flush=True)


def standalone(name):
    objects,ns=subject(name);scene=bpy.context.scene;lighting(scene);configure(scene,96);scene.render.film_transparent=True
    bpy.context.view_layer.update()
    if name=='companion':
        lo,hi=bounds(objects);desk=material('Companion pale desk',(.76,.73,.66),.62,texture=190)
        box('Companion pale physical desk',(0,-.2,lo.z-.08),(7,5.3,.14),desk,.10)
        glass=bpy.data.objects.get('Companion touchscreen');glass.dimensions.z=1.5
        image=bpy.data.images.load(str(ROOT/'reel/workbench/companion-display-reference.png'),check_existing=True)
        display=material('Companion actual photographed display',(.1,.12,.28),.3)
        tex=display.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
        bsdf=display.node_tree.nodes['Principled BSDF'];bsdf.inputs['Emission Strength'].default_value=.45
        display.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);display.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Emission Color'])
        bpy.ops.mesh.primitive_plane_add(size=1,location=(0,-.81,-.65),rotation=(radians(90),0,0))
        panel=bpy.context.object;panel.name='Companion documented clock screen';panel.scale=(1.96,1.44,1);panel.data.materials.append(display)
        target=Vector((-.25,0,-.15));offset=Vector((3,-14,6))
    else:
        transform=Matrix.Translation(Vector((0,0,.95))) @ Matrix.Rotation(radians(-23),4,'Z') @ Matrix.Rotation(radians(45),4,'X')
        for obj in objects:obj.matrix_world=transform @ obj.matrix_world
        paper=material('Keychain actual schematic sheet',(.85,.82,.74),.86)
        box('Keychain schematic physical sheet',(0,0,-.6),(5.8,4.2,.035),paper,.025)
        image=bpy.data.images.load(str(ROOT/'src/assets/keychain-schematic.jpg'),check_existing=True)
        ink=material('Keychain actual schematic artwork',(.85,.82,.74),.9)
        tex=ink.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;ink.node_tree.links.new(tex.outputs['Color'],ink.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
        bpy.ops.mesh.primitive_plane_add(size=1,location=(0,0,-.577));obj=bpy.context.object;obj.name='Keychain original schematic print';obj.scale=(5.65,4.05,1);obj.data.materials.append(ink)
        target=Vector((0,0,.3));offset=Vector((5,-10,9))
    cam=bpy.data.objects.new(name+' presentation camera',bpy.data.cameras.new(name+' presentation camera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.location=target+offset;aim(cam,target)
    return scene,cam,target


def render(names,preview=False):
    if any(n in ('vehicle','robot') for n in names):
        scene,cam,groups,motions,fixtures=build()
        for name in [n for n in names if n in ('vehicle','robot')]:
            state(70 if name=='vehicle' else 175,scene,cam,groups,motions)
            for key,objects in groups.items():
                for obj in objects+fixtures[key]:obj.hide_render=key!=name
            for orientation in ('landscape','portrait'):
                if orientation=='portrait':
                    target=STATIONS[name]+Vector((0,0,.2));cam.location=target+Vector((8,-12,10));aim(cam,target);cam.data.ortho_scale=11.0 if name=='vehicle' else 11.8
                export(name,orientation,preview)
    for name in [n for n in names if n in ('companion','keychain')]:
        scene,cam,target=standalone(name)
        for orientation in ('landscape','portrait'):
            cam.data.ortho_scale=(7.4 if name=='companion' else 7.7) if orientation=='landscape' else (10.0 if name=='companion' else 11.1)
            export(name,orientation,preview)
        if not preview:
            bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'reel/workbench'/f'{name}-presentation.blend'),compress=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--preview',action='store_true');p.add_argument('--subject',choices=['all','vehicle','robot','companion','keychain'],default='all');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    render(['vehicle','robot','companion','keychain'] if a.subject=='all' else [a.subject],a.preview)
