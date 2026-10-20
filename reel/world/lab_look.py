"""World-space surface finishes and the fixed room lighting rig.

No station geometry, camera keys or actor motion are changed here. Texture
distances are metres; the existing photographed oak keeps its original maps.
"""
import math
import bpy


def wall_bounce(lab):
    name='Desk lamp / spill toward pinboard'
    obj=bpy.data.objects.get(name)
    if obj is None:
        data=bpy.data.lights.new('Desk lamp / wall spill','AREA')
        obj=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(obj)
    if obj.data.type!='AREA':
        old=obj.data;name=old.name;old.name=name+' / replaced spotlight'
        obj.data=bpy.data.lights.new(name,'AREA')
        if old.users==0:bpy.data.lights.remove(old)
    data=obj.data;data.shape='RECTANGLE'
    data.size=1.10;data.size_y=.48
    data.color=lab.kelvin_rgb(3000)
    obj.location=(5.52,5.02,.96)
    lab.look_at(obj,(5.55,6.39,1.70))
    return obj


def rig(lab):
    lab.ensure_floor_fill()
    obj=bpy.data.objects['Room / soft ceiling bounce']
    obj.location=(3.80,3.70,3.42);lab.look_at(obj,(3.80,3.55,.2))
    obj.data.shape='RECTANGLE';obj.data.size=5.5;obj.data.size_y=4.3
    wall_bounce(lab)


def surface(lab, name, low, high, rough=(.8,.9), scale=1, fine_scale=1200, height=.0001):
    mat=bpy.data.materials.get(name)
    if mat is None:return None
    tree=mat.node_tree;n=tree.nodes;l=tree.links;n.clear()
    output=n.new('ShaderNodeOutputMaterial');bsdf=n.new('ShaderNodeBsdfPrincipled')
    l.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
    bsdf.inputs['Specular IOR Level'].default_value=.28
    position=n.new('ShaderNodeNewGeometry').outputs['Position']
    def noise(label,freq,vector=position):
        node=n.new('ShaderNodeTexNoise');node.name='Lab look / '+label
        node.inputs['Scale'].default_value=freq;node.inputs['Detail'].default_value=2
        l.new(vector,node.inputs['Vector']);return node.outputs['Fac']
    def ramp(label,source,a,b):
        node=n.new('ShaderNodeValToRGB');node.name='Lab look / '+label
        node.color_ramp.elements[0].color=(*a,1);node.color_ramp.elements[1].color=(*b,1)
        l.new(source,node.inputs[0]);return node.outputs['Color']
    color=ramp('subtle coating variation',noise('coating',scale),low,high)
    l.new(color,bsdf.inputs['Base Color'])
    r=n.new('ShaderNodeMapRange');r.name='Lab look / satin roughness'
    r.inputs['To Min'].default_value=rough[0];r.inputs['To Max'].default_value=rough[1]
    l.new(noise('roughness variation',scale*6),r.inputs['Value']);l.new(r.outputs['Result'],bsdf.inputs['Roughness'])
    bump=n.new('ShaderNodeBump');bump.name='Lab look / physical microtexture'
    bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=height
    l.new(noise('micrograin',fine_scale),bump.inputs['Height']);l.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
    mat.diffuse_color=(*[(a+b)/2 for a,b in zip(low,high)],1)
    mat['finish']='world-space procedural coating, physical metre scale'
    return mat,bsdf,position,noise,bump


def metric_oak_uv():
    count=0
    for obj in bpy.data.objects:
        if obj.type!='MESH' or not obj.name.startswith(('Context /','Room detail /')):continue
        if not any(m and m.name in ('Bench / photographed oak veneer','Desk / satin photographed oak veneer') for m in obj.data.materials):continue
        uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='Metric oak cut')
        extent=[max(v.co[i] for v in obj.data.vertices)-min(v.co[i] for v in obj.data.vertices) for i in range(3)]
        for face in obj.data.polygons:
            axis=max(range(3),key=lambda i:abs(face.normal[i]))
            axes=sorted((i for i in range(3) if i!=axis),key=lambda i:extent[i])
            for li in face.loop_indices:
                p=obj.matrix_world@obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv=(p[axes[0]]/1.8,p[axes[1]]/1.8)
        count+=1
    return count


def rug_finish(lab):
    """Fine matte weave with a quiet stitched binding, separate from the throw."""
    rug = surface(lab,'Room detail / dense chair rug',(.270,.235,.175),(.295,.260,.195),
                  (.91,.97),5,1600,.000085)
    if rug:
        rug[1].inputs['Sheen Weight'].default_value = .18
    surface(lab,'Room detail / rug binding',(.235,.205,.150),(.260,.225,.165),
            (.90,.96),12,1800,.000055)


def surfaces(lab):
    surface(lab,'Room / mineral paint',(.57,.52,.44),(.63,.58,.50),(.86,.95),.7,1350,.00013)
    surface(lab,'Room detail / ceiling plaster',(.60,.57,.50),(.66,.625,.55),(.89,.96),.6,1350,.00011)
    surface(lab,'Room detail / sage paneling',(.145,.18,.135),(.185,.225,.175),(.63,.76),3,1400,.000055)
    floor=surface(lab,'Room / epoxy floor',(.067,.074,.064),(.084,.092,.078),(.47,.61),1.7,1800,.000055)
    if floor:
        mat,bsdf,p,noise,bump=floor;n=mat.node_tree.nodes;l=mat.node_tree.links
        stretched=n.new('ShaderNodeVectorMath');stretched.operation='MULTIPLY'
        l.new(p,stretched.inputs[0]);stretched.inputs[1].default_value=(90,2,1)
        scuff=noise('fine traffic scuffs',2.3,stretched.outputs['Vector'])
        mask=n.new('ShaderNodeMapRange');mask.clamp=True
        mask.inputs['From Min'].default_value=.64;mask.inputs['From Max'].default_value=.82
        mask.inputs['To Min'].default_value=0;mask.inputs['To Max'].default_value=.075
        l.new(scuff,mask.inputs['Value'])
        old=bsdf.inputs['Roughness'].links[0].from_socket
        add=n.new('ShaderNodeMath');add.operation='ADD';l.new(old,add.inputs[0]);l.new(mask.outputs['Result'],add.inputs[1]);l.new(add.outputs[0],bsdf.inputs['Roughness'])
        mat['wear']='subtle directional roughness scuffs; no added floor geometry'
    surface(lab,'Pinboard cork',(.31,.205,.107),(.44,.318,.185),(.86,.94),110,720,.00065)
    for name in ('Context / cabinet enamel','Context / muted blue bins','Context / graphite steel'):
        mat=bpy.data.materials.get(name)
        if not mat:continue
        c=(.48,.46,.39) if name=='Context / cabinet enamel' else tuple(mat.diffuse_color[:3])
        surface(lab,name,tuple(v*.97 for v in c),tuple(v*1.03 for v in c),(.56,.68),12,1800,.000045)
    rug_finish(lab)
    fabric=surface(lab,'Room detail / woven oat',(.30,.255,.187),(.40,.345,.260),(.88,.97),4,1600,.00025)
    if fabric:
        mat,bsdf,p,noise,bump=fabric;n=mat.node_tree.nodes;l=mat.node_tree.links
        separate=n.new('ShaderNodeSeparateXYZ');l.new(p,separate.inputs[0])
        add=n.new('ShaderNodeMath');add.operation='ADD';l.new(separate.outputs['Y'],add.inputs[0]);l.new(separate.outputs['Z'],add.inputs[1])
        combine=n.new('ShaderNodeCombineXYZ');l.new(separate.outputs['X'],combine.inputs['X']);l.new(add.outputs[0],combine.inputs['Y'])
        weaves=[]
        for direction in ('X','Y'):
            wave=n.new('ShaderNodeTexWave');wave.bands_direction=direction;wave.inputs['Scale'].default_value=800
            l.new(combine.outputs[0],wave.inputs['Vector']);weaves.append(wave.outputs['Fac'])
        weave=n.new('ShaderNodeMath');weave.operation='MULTIPLY';l.new(weaves[0],weave.inputs[0]);l.new(weaves[1],weave.inputs[1])
        grain=n.new('ShaderNodeBump');grain.inputs['Strength'].default_value=.20;grain.inputs['Distance'].default_value=.00024
        l.new(weave.outputs[0],grain.inputs['Height']);l.new(bump.outputs['Normal'],grain.inputs['Normal']);l.new(grain.outputs['Normal'],bsdf.inputs['Normal'])
    for name in ('Room detail / terracotta','Room detail / book cloth','Room detail / green book cloth','Room detail / leaf green','Room detail / leaf light'):
        mat=bpy.data.materials.get(name)
        if mat:
            color=tuple(mat.diffuse_color[:3]);is_leaf='leaf ' in name
            surface(lab,name,tuple(v*.95 for v in color),tuple(v*1.05 for v in color),(.44,.58) if is_leaf else (.78,.92),12 if is_leaf else 25,1500,.000045 if is_leaf else .00009)
            if 'leaf ' in name:
                bsdf=lab.principled(mat)
                bsdf.inputs['Subsurface Weight'].default_value=.045
                bsdf.inputs['Subsurface Radius'].default_value=(.0003,.0005,.0002)
    collection=bpy.data.collections.get('Device / companion')
    if collection:
        shell=lab.named_mesh(list(collection.objects),'Shell')
        for mat in shell.data.materials:
            bsdf=lab.principled(mat);bsdf.inputs['Roughness'].default_value=.64
            bsdf.inputs['Specular IOR Level'].default_value=.24
            # Fine print grain adds tactile scale while keeping the imported shell color.
            for node in list(mat.node_tree.nodes):
                if node.name.startswith('Lab look /'):mat.node_tree.nodes.remove(node)
            nodes=mat.node_tree.nodes;links=mat.node_tree.links
            p=nodes.new('ShaderNodeNewGeometry');p.name='Lab look / plastic position'
            noise=nodes.new('ShaderNodeTexNoise');noise.name='Lab look / printed polymer';noise.inputs['Scale'].default_value=2400
            links.new(p.outputs['Position'],noise.inputs['Vector'])
            bump=nodes.new('ShaderNodeBump');bump.name='Lab look / print grain';bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.000045
            links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
    for mat in bpy.data.materials:
        if not mat.name.startswith('Companion / photographed paper eyes'):continue
        bsdf=lab.principled(mat);n=mat.node_tree.nodes;l=mat.node_tree.links
        for node in list(n):
            if node.name.startswith('Lab look /'):n.remove(node)
        photo=next(node for node in n if node.type=='TEX_IMAGE')
        gray=n.new('ShaderNodeRGBToBW');gray.name='Lab look / paper luminance'
        l.new(photo.outputs['Color'],gray.inputs['Color'])
        ink=n.new('ShaderNodeValToRGB');ink.name='Lab look / paper albedo'
        ink.color_ramp.elements[0].position=.015;ink.color_ramp.elements[0].color=(.004,.005,.006,1)
        ink.color_ramp.elements[1].position=.42;ink.color_ramp.elements[1].color=(.80,.82,.78,1)
        l.new(gray.outputs[0],ink.inputs[0]);l.new(ink.outputs['Color'],bsdf.inputs['Base Color'])
        bsdf.inputs['Specular IOR Level'].default_value=.18
        # Retain the real paper outlines/detail, remove the photograph's warm
        # lighting from the albedo so the scene illuminates white paper once.
    return {'oak_objects_with_metric_uv':metric_oak_uv(),'surfaces':['mineral paint','satin epoxy and fine scuffs','cork','powder coat','printed polymer']}


def refinements(lab):
    """Small desktop review corrections; retain source color, grain and geometry."""
    spec=lab.WORLD['room']['surface_finish']['desktop_refinements']
    metals={}
    for name,key in (('Exhibit — cast aluminum','matcher_cast_roughness'),
                     ('Exhibit — capacitor aluminum','matcher_plate_roughness')):
        mat=bpy.data.materials.get(name)
        if mat:
            bsdf=lab.principled(mat)
            bsdf.inputs['Roughness'].default_value=spec[key]
            metals[name]=spec[key]
    desk=bpy.data.objects.get('Context / personal desk top')
    if desk:
        name='Desk / satin photographed oak veneer'
        mat=bpy.data.materials.get(name)
        if mat is None:
            mat=bpy.data.materials['Bench / photographed oak veneer'].copy();mat.name=name
        ramps=[node for node in mat.node_tree.nodes if node.type=='MAP_RANGE'
               and node.inputs['Value'].is_linked
               and node.inputs['Value'].links[0].from_node.type=='TEX_IMAGE']
        if len(ramps)!=1:raise RuntimeError('Expected one photographed oak roughness map')
        ramps[0].inputs['To Min'].default_value=spec['desk_roughness_range'][0]
        ramps[0].inputs['To Max'].default_value=spec['desk_roughness_range'][1]
        lab.principled(mat).inputs['Specular IOR Level'].default_value=spec['desk_specular_ior_level']
        desk.data.materials.clear();desk.data.materials.append(mat)
        mat['finish']='Satin desk variant; original photographed color, normal and height maps retained'
    return {'matcher_roughness':metals,'desk_roughness_range':spec['desk_roughness_range'],
            'desk_specular_ior_level':spec['desk_specular_ior_level']}


def apply(lab):
    rig(lab)
    result=surfaces(lab)
    result['desktop_refinements']=refinements(lab)
    if bpy.data.collections.get('Room / lived-in details'):
        lab.load_py('lab_details',lab.ROOT/'reel/world/lab_details.py').wear(lab)
    return result
