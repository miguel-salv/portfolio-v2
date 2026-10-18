"""Only the final two exterior tire gates, with visible-ray ownership proof."""
from pathlib import Path
import sys,json
sys.path.insert(0,str(Path(__file__).resolve().parent))
import render as r
from mathutils import Vector

for orientation in ('landscape','portrait'):
    ctx=r.setup('shaft-to-drive',orientation,48);scene=ctx['scene'];cam=ctx['camera']
    resolution=(1280,800) if orientation=='landscape' else (900,1250)
    scene.render.resolution_x,scene.render.resolution_y=resolution
    fm=r.state(ctx,119);data=ctx['endpoint_tread'];rays=[]
    for y in (.001,.25,.5,.75,.999):
        for x in (.001,.25,.5,.75,.999):
            direction=cam.rotation_euler.to_quaternion()@Vector(((x-.5)*36/cam.data.lens,(y-.5)*36/cam.data.lens*resolution[1]/resolution[0],-1)).normalized()
            hit,location,normal,index,obj,matrix=scene.ray_cast(r.bpy.context.evaluated_depsgraph_get(),cam.location,direction)
            distance=(location-cam.location).length if hit else None
            rays.append({'screen':[x,y],'object':obj.name if hit else None,'distance':distance})
    report={'frame':fm,'surface':data,'visibleRays':rays,'allTire':all(ray['object']==data['object'] and ray['distance']>.008 for ray in rays)}
    out=r.WORK/('endpoint-v2-'+orientation);out.mkdir(parents=True,exist_ok=True)
    (out/'rays.json').write_text(json.dumps(report,indent=2)+'\n')
    scene.render.filepath=str(out/'frame_0119.png');r.bpy.ops.render.render(write_still=True)
    print('EXTERIOR_ENDPOINT_GATE',orientation,'allTire',report['allTire'],json.dumps(data),flush=True)
    if not report['allTire']:raise RuntimeError('Final frame exposes something other than the opaque tire exterior')
