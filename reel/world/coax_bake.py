"""Bake an inextensible cable with tabletop, lip, drawer and floor contact.

Position constraints run offline. The resulting per-frame curve points scrub in
Blender without a handler or a new simulation, including in reverse.
"""
import math

import bpy
import numpy as np
from mathutils import Vector


def resample(points, count):
    points=np.asarray(points,dtype=float)
    length=np.linalg.norm(np.diff(points,axis=0),axis=1)
    arc=np.r_[0,np.cumsum(length)]
    u=np.linspace(0,arc[-1],count)
    return np.stack([np.interp(u,arc,points[:,axis]) for axis in range(3)],axis=1)


def rounded_box_contact(points, low, high, rounding, radius):
    low=np.asarray(low)+rounding
    high=np.asarray(high)-rounding
    nearest=np.clip(points,low,high)
    delta=points-nearest
    distance=np.linalg.norm(delta,axis=1)
    shell=rounding+radius
    hit=(distance>1e-10)&(distance<shell)
    points[hit]=nearest[hit]+delta[hit]*(shell/distance[hit,None])
    interior=distance<=1e-10
    indices=np.flatnonzero(interior)
    if len(indices):
        p=points[indices]
        depths=np.concatenate((p-low,high-p),axis=1)
        face=depths.argmin(axis=1)
        for i,f in zip(indices,face):
            axis=f%3
            points[i,axis]=low[axis]-shell if f<3 else high[axis]+shell


def plug_floor_height(points):
    """Support the whole tilted metal plug, rather than only its cable endpoint."""
    tangent = points[-1] - points[-2]
    axial_z = float(tangent[2] / max(np.linalg.norm(tangent), 1e-12))
    radial_z = math.sqrt(max(0, 1 - axial_z * axial_z))
    bottom = min(center * axial_z - half_depth * abs(axial_z) - radius * radial_z
                 for center, half_depth, radius in
                 ((-.006, .006, .0055), (-.014, .0025, .0032)))
    return -bottom + .00005


def rest_configuration(animatic, count=128):
    anchor=tuple(animatic.SPEC['animatic']['coax_attachment_m'])
    radius=.0022
    # The fixed route leaves the REAR port, bends down behind the chassis and
    # runs along its right side through two guides. Only the hanging slack moves.
    prefix=[anchor,(anchor[0]-.002,anchor[1]+.024,anchor[2]),
            (2.04,4.65,.937),(2.10,4.66,.912),(2.18,4.60,.9084),
            (2.27,4.51,.9084),(2.35,4.35,.9084),(2.42,4.19,.9024),
            (2.43,4.10,.9024),(2.45,4.04,.9024)]
    # A loose U already hangs over the lip. The free plug rolls over the edge,
    # the bottom of the U lands first, then the short free end settles beside it.
    controls=prefix+[(2.47,3.97,.900),(2.47,3.92,.86),(2.46,3.88,.69),
                     (2.42,3.86,.49),(2.36,3.85,.40),(2.29,3.85,.42),
                     (2.24,3.86,.55),(2.24,3.90,.74),(2.26,3.976,.9024)]
    dense=[]
    for i in range(len(controls)-1):
        p0=np.array(controls[max(0,i-1)])
        p1=np.array(controls[i]);p2=np.array(controls[i+1]);p3=np.array(controls[min(i+2,len(controls)-1)])
        for j in range(6):
            t=j/6
            dense.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    dense.append(np.asarray(controls[-1]))
    p=resample(dense,count)
    prefix_length=sum(np.linalg.norm(np.array(b)-np.array(a)) for a,b in zip(prefix,prefix[1:]))
    return p,prefix_length,radius


def bake(animatic, count=128):
    p,prefix_length,radius=rest_configuration(animatic,count)
    length=float(np.linalg.norm(np.diff(p,axis=0),axis=1).sum())
    step=length/(count-1)
    pinned=max(3,int(prefix_length/step)+1)
    fixed=p[:pinned].copy()
    rest=p.copy()
    old=p.copy()
    mass=np.ones(count);mass[:pinned]=0
    mass[-3:]=.28  # heavier metal connector at the free end
    substeps=8
    dt=1/30/substeps
    frames=[]
    tail_anchor=p[-1].copy()
    preroll=True
    neighbour=np.abs(np.arange(count)[:,None]-np.arange(count)[None,:])
    max_error=0

    def contact():
        rounded_box_contact(p,(.45,3.95,.845),(2.85,4.95,.900),.008,radius)
        rounded_box_contact(p,(1.125,4.06,.900),(2.375,4.94,.906),.0015,radius)
        rounded_box_contact(p,(1.98,4.00,.63),(2.62,4.90,.85),.006,radius)
        p[:,2]=np.maximum(p[:,2],radius)
        # The last segment passes through the rigid sleeve. Move both of its
        # endpoints together on contact so the floor cannot tip the sleeve up
        # simply by pushing its free endpoint higher than its neck.
        p[-2:,2] += max(0, plug_floor_height(p) - p[-1,2])
        p[:pinned]=fixed
        if preroll:p[-1]=tail_anchor

    # Keep a physical 30 fps clock throughout the authored release/settle interval.
    # Compressing a longer simulation into that interval made gravity too fast.
    carrier=next(c for c in animatic.SPEC['staging'] if c['id']=='coax-slack')
    simulation_frames=carrier['settled_frame']-carrier['release_frame']
    # Relax the hanging U while the free plug still rests on the lip. Starting
    # from an unrelaxed drawn curve gave the plug a 35 mm upward spring at release.
    # Reset velocity after this offline pre-roll; no warm-up is needed on opening.
    for frame in range(-29,simulation_frames+1):
        preroll=frame<=0
        mass[-1]=0 if preroll else .28
        for sub in range(substeps):
            velocity=(p-old)*.988
            # Dry sliding friction only at support contacts, not in free flight.
            on_table=(p[:,1]>3.955)&(p[:,2]<.913)&(p[:,2]>.900)
            on_floor=p[:,2]<radius+.001
            velocity[on_table,:2]*=.80
            velocity[on_floor,:2]*=.94
            old[:]=p
            p+=velocity
            p[:,2]-=9.81*dt*dt
            p[:pinned]=fixed
            smoothing=(p[:-2]+p[2:]-2*p[1:-1])*.04
            p[1:-1]+=smoothing*mass[1:-1,None]
            for iteration in range(140):
                for parity in (0,1):
                    i=np.arange(parity,count-1,2)
                    delta=p[i+1]-p[i]
                    d=np.linalg.norm(delta,axis=1)
                    weight=mass[i]+mass[i+1]
                    correction=delta*((d-step)/np.maximum(d,1e-12)/np.maximum(weight,1))[:,None]
                    p[i]+=correction*mass[i,None]
                    p[i+1]-=correction*mass[i+1,None]
                if iteration%4==0 and iteration<100:
                    # Limit local turn to about 32 degrees. Rubber cable bridges
                    # the lip in a rounded bend instead of folding at one particle.
                    delta=p[2:]-p[:-2]
                    distance=np.linalg.norm(delta,axis=1)
                    weight=mass[2:]+mass[:-2]
                    gap=np.minimum(distance-1.925*step,0)
                    correction=delta*(gap/np.maximum(distance,1e-12)/np.maximum(weight,1)*.6)[:,None]
                    p[:-2]+=correction*mass[:-2,None]
                    p[2:]-=correction*mass[2:,None]
                contact()
            # Non-neighbouring sections cannot pass through one another.
            delta=p[:,None,:]-p[None,:,:]
            distance=np.linalg.norm(delta,axis=2)
            pairs=np.argwhere((distance<radius*2)&(distance>1e-8)&(neighbour>3)&np.triu(np.ones_like(distance,dtype=bool),1))
            for i,j in pairs:
                weight=mass[i]+mass[j]
                if weight:
                    correction=delta[i,j]/distance[i,j]*(radius*2-distance[i,j])/weight
                    p[i]+=correction*mass[i];p[j]-=correction*mass[j]
            contact()
        if frame==0:
            old[:]=p
            rest=p.copy()
            frames=[p.copy()]
        elif frame>0:frames.append(p.copy())
        current=np.linalg.norm(np.diff(p,axis=0),axis=1).sum()
        max_error=max(max_error,abs(float(current)-length)/length)
    sampled=frames
    landing=next(i for i,points in enumerate(sampled)
                 if points[-1,2] <= plug_floor_height(points) + .0002)
    return {
        'frames':sampled,'radius':radius,'length_m':length,'max_length_error':max_error,
        'pinned':pinned,'rest':rest,'floor_contact_nodes':int(np.sum(p[:,2]<radius+.001)),
        'start_frame':carrier['release_frame'],'end_frame':carrier['settled_frame'],
        'landing_frame':carrier['release_frame']+landing,
    }


def curve(animatic,cable):
    result=bake(animatic)
    data=cable.data
    data.animation_data_clear()
    while data.splines:data.splines.remove(data.splines[0])
    spline=data.splines.new('POLY');spline.points.add((len(result['frames'][0])-1)*4)
    data.bevel_depth=result['radius'];data.bevel_resolution=3
    data.resolution_u=16
    cable['length_m']=result['length_m']
    cable['baked_length_error_fraction']=result['max_length_error']
    cable['offline_contact_bake']=True
    cable['release_frame']=result['start_frame']
    cable['landing_frame']=result['landing_frame']
    cable['settled_frame']=result['end_frame']
    for obj in list(bpy.data.objects):
        if obj.name.startswith('Coax / free plug'):
            bpy.data.objects.remove(obj,do_unlink=True)
    collection=cable.users_collection[0]
    root=bpy.data.objects.new('Coax / free plug',None);collection.objects.link(root)
    mat=bpy.data.materials.get('Coax / rear connector nickel')
    for suffix,z,r,depth in (('coupling',-.006,.0055,.012),('neck',-.014,.0032,.005)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=r,depth=depth)
        obj=bpy.context.object;obj.name='Coax / free plug '+suffix
        for slot in list(obj.users_collection):slot.objects.unlink(obj)
        collection.objects.link(obj);obj.parent=root;obj.location=(0,0,z)
        if mat:obj.data.materials.append(mat)
        edge=obj.modifiers.new('Plug edges','BEVEL');edge.width=.00035;edge.segments=3
    root.rotation_mode='QUATERNION'
    return result


def pose(cable,result,frame):
    index=min(len(result['frames'])-1,max(0,frame-result['start_frame']))
    smooth=render_points(result['frames'][index],result['radius'])
    for point,value in zip(cable.data.splines[0].points,smooth):
        point.co=(*value,1)
    plug=bpy.data.objects.get('Coax / free plug')
    if plug:
        points=result['frames'][index]
        plug.location=points[-1]
        tangent=Vector(points[-1]-points[-2])
        q=tangent.to_track_quat('Z','Y')
        if q.dot(plug.rotation_quaternion)<0:q.negate()
        plug.rotation_quaternion=q


def render_points(points,radius=.0022):
    """Smooth the simulation polyline so rubber does not look like hinged rods."""
    points=np.asarray(points)
    dense=[]
    for i in range(len(points)-1):
        a,b,c,d=[points[max(0,min(len(points)-1,j))] for j in (i-1,i,i+1,i+2)]
        for sub in range(4):
            t=sub/4
            dense.append(.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    dense.append(points[-1]);dense=np.asarray(dense)
    rounded_box_contact(dense,(.45,3.95,.845),(2.85,4.95,.900),.008,radius)
    rounded_box_contact(dense,(1.125,4.06,.900),(2.375,4.94,.906),.0015,radius)
    dense[:,2]=np.maximum(dense[:,2],radius)
    return dense
