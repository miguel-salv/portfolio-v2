import {createMechanismScrubber} from './mechanism-motion.js';

const clamp=value=>Math.min(1,Math.max(0,Number.isFinite(value)?value:0));
export function matcherFilmFrame(state,metadata,reduced=false){
  if(state.mode==='inside')return metadata.views[state.part]??metadata.views.capacitors;
  return reduced?0:Math.round(clamp(state.progress)*metadata.assemblyEnd);
}
export function transparentFilmExtension(probe,vendor=''){
  const hevc=probe.canPlayType('video/mp4; codecs="hvc1"');
  const vp9=probe.canPlayType('video/webm; codecs="vp9"');
  return hevc&&(/Apple/.test(vendor)||!vp9)?'.mov':'.webm';
}
// A finite, all-keyframe film owns the hardware's surface. The existing tuner
// remains independent; prerecorded shaft motion is a mechanism demonstration.
export async function createMatcherModel(mount,{signal,onAnchors,onPose,onError,heroLinked=false}){
  const phone=matchMedia('(max-width: 760px)');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const spacious=matchMedia('(min-width: 1101px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)');
  const extension=transparentFilmExtension(document.createElement('video'),navigator.vendor);
  const metadataCache=new Map();
  const resources=new Set();
  let current=null,pending=null,loadingKey='',state={mode:'machine',part:'capacitors',progress:0},paused=false,disposed=false,mediaFailed=false,generation=0;
  const variant=()=>phone.matches?'portrait':'landscape';
  const target=record=>matcherFilmFrame(state,record.metadata,record.still);
  const ready=()=>Boolean(current?.ready&&!current.failed);
  const isSeated=()=>ready()&&current.frame===0&&target(current)===0;
  const isCovering=()=>ready()&&current.frame===0;
  let box={width:0,height:0};
  const release=record=>{
    if(!record)return;
    record.abort.abort();record.scrubber?.dispose();record.fade?.cancel();
    record.cover?.remove();record.hold?.remove();
    if(record.node.tagName==='VIDEO'){
      record.node.pause();record.node.removeAttribute('src');record.node.load();
    }
    record.node.remove();resources.delete(record);
  };
  function present(record,frame){
    if(disposed||record.failed||signal.aborted||record!==current)return;
    record.frame=Math.min(record.metadata.frameCount-1,Math.max(0,frame));record.ready=true;
    record.node.hidden=false;
    const sample=record.metadata.frames[record.frame];
    if(record.pendingStart!==undefined){
      const route=record.route;
      if(route?record.frame>=route.start&&record.frame<=route.end:record.frame<=record.metadata.views.control)record.pendingStart=undefined;
    }
    // A route's duplicated endpoints have exactly the same camera/assembly.
    // Finish the decoded move before routing a third selection from that pose.
    const wantedCamera=state.mode==='inside'?state.part:'machine';
    if(record.route&&record.frame===record.destinationFrame){
      record.camera=record.route.destination;record.route=null;record.restingFrame=record.frame;
      if(wantedCamera!==record.camera||record.camera==='machine')drive(record);
    }else if(!record.route&&record.frame===record.destinationFrame){
      if(record.opening){
        record.camera='machine';record.opening=false;drive(record);
      }else{record.camera=wantedCamera;record.restingFrame=record.frame;}
    }
    if(!box.width||!box.height)box=mount.getBoundingClientRect();
    const scale=Math.min(box.width/record.metadata.width,box.height/record.metadata.height);
    const width=record.metadata.width*scale,height=record.metadata.height*scale;
    const shrink=heroLinked&&spacious.matches?.84:1;
    const points={};
    for(const [name,[x,y]] of Object.entries(sample.anchors)){
      points[name]=[50+(x-50)*width/Math.max(1,box.width)*shrink,
        50+(y-50)*height/Math.max(1,box.height)*shrink+(shrink<1?4:0)];
    }
    if(state.mode==='inside')onAnchors?.(points);
    mount.dataset.filmFrame=String(record.frame);
    onPose?.({assembly:sample.assembly,seated:isSeated(),cover:isCovering(),ready:true,still:record.still});
  }
  function drive(record){
    if(!record||disposed)return;
    let frame=target(record),start;
    if(!record.still&&record.metadata.routes){
      const wantedCamera=state.mode==='inside'?state.part:'machine';
      const modeRoutes=record.metadata.routes.some(route=>route.from==='machine'||route.to==='machine');
      if(record.route){
        const route=record.route;
        if(wantedCamera===route.from||wantedCamera===route.to)route.destination=wantedCamera;
        else if(wantedCamera==='machine'&&route.queued!==wantedCamera){
          // Return from the nearer decoded inspection endpoint, then use its
          // dedicated wide-camera path. A mode reversal stays on the same path.
          route.destination=Math.abs(record.frame-route.start)<=Math.abs(record.frame-route.end)?route.from:route.to;
          route.queued=wantedCamera;
        }
        frame=route.destination===route.from?route.start:route.end;
      }else{
        const camera=record.camera??'machine';
        if(modeRoutes&&wantedCamera!=='machine'&&camera==='machine'&&record.frame<record.metadata.assemblyEnd){
          record.opening=true;frame=record.metadata.assemblyEnd;
        }else if(wantedCamera!==camera){
          record.opening=false;
          const route=record.metadata.routes.find(r=>
            (r.from===camera&&r.to===wantedCamera)||(r.to===camera&&r.from===wantedCamera));
          if(route){
            record.route={...route,destination:wantedCamera};
            start=(camera===route.from?route.start:route.end)/(record.metadata.frameCount-1);
            frame=wantedCamera===route.to?route.end:route.start;
          }else if(wantedCamera==='machine'&&record.camera){
            start=record.metadata.views[camera]/(record.metadata.frameCount-1);record.camera=null;
          }
        }else if(wantedCamera==='machine'){
          record.opening=false;
          if(record.frame>record.metadata.assemblyEnd)start=record.metadata.assemblyEnd/(record.metadata.frameCount-1);
        }else frame=record.restingFrame;
      }
    }
    if(start!==undefined)record.pendingStart=start;
    start=record.pendingStart;
    record.destinationFrame=frame;
    if(record.still){
      const name=state.mode==='inside'?state.part:'machine';
      const source=`/assets/matcher/film/${record.variant}-${name}.webp`;
      if(record.node.getAttribute('src')!==source){
        record.ready=false;record.node.src=source;
      }else if(record.ready)present(record,frame);
      return;
    }
    const span=record.metadata.frameCount-1;
    // Part changes play the orbit in about a second. Scroll assembly keeps
    // the scrubber's own speed so it can follow the page.
    const pace=record.route?((record.route.from==='machine'||record.route.to==='machine') ? .5 : .85):
      record.opening?0:state.mode==='inside'?.85:0;
    record.scrubber.setTarget(frame/span,!paused&&!document.hidden,false,pace,start);
  }
  async function load(){
    const name=variant(),still=reduced.matches||mediaFailed,key=`${name}-${still}`;
    if(current?.variant===name&&current.still===still&&!current.failed){
      if(loadingKey&&loadingKey!==key){generation++;loadingKey='';release(pending);pending=null;}
      drive(current);return;
    }
    if(loadingKey===key){drive(pending);return;}
    const version=++generation;
    loadingKey=key;
    if(pending){release(pending);pending=null;}
    let record;
    try{
      if(!metadataCache.has(name))metadataCache.set(name,fetch(`/assets/matcher/film/${name}.json`,{signal,cache:'no-cache'}).then(response=>{
        if(!response.ok)throw new Error('Inspection metadata unavailable');return response.json();
      }));
      const metadata=await metadataCache.get(name);
      if(disposed||signal.aborted||version!==generation)return;
      const node=document.createElement(still?'img':'video');
      node.className='matcher-film';node.hidden=true;node.setAttribute('aria-hidden','true');
      record={node,metadata,variant:name,still,ready:false,frame:0,abort:new AbortController()};
      pending=record;
      resources.add(record);
      const local=record.abort.signal;
      const failed=()=>{
        if(disposed||(version!==generation&&current!==record))return;
        record.failed=true;record.scrubber?.pause();record.node.hidden=true;
        if(version===generation){loadingKey='';pending=null;release(current);current=null;}
        else if(current===record)current=null;
        release(record);
        onError?.();onPose?.({assembly:0,seated:false,ready:false});
        if(!record.still){mediaFailed=true;load();}
      };
      const adopt=()=>{
        if(disposed||signal.aborted){release(record);return false;}
        // Keep the last decoded surface visible while its responsive replacement
        // loads. Only a pending, superseded source is stale.
        if(current===record)return true;
        if(version!==generation){release(record);return false;}
        if(current!==record){release(current);current=record;pending=null;loadingKey='';}
        return true;
      };
      node.addEventListener('error',failed,{signal:local});
      if(still){
        node.alt='';
        node.addEventListener('load',()=>{if(adopt())present(record,target(record));},{signal:local});
        drive(record);
      }else{
        node.muted=true;node.playsInline=true;node.preload='auto';node.loop=false;
        node.width=metadata.width;node.height=metadata.height;
        if(node.style)node.style.overflowAnchor='none';
        node.dataset.source=`${name}${extension}`;
        record.scrubber=createMechanismScrubber(node,{signal:local,speed:1.2*metadata.assemblyEnd/(metadata.frameCount-1),onBeforeSeek:(from,to)=>{
          const arriving=Math.round(to*metadata.fps),leaving=Math.round(from*metadata.fps);
          if(arriving!==0&&leaving!==0)return;
          record.seam=true;
          if(!node.videoWidth||typeof node.after!=='function')return;
          let hold=record.hold;
          if(!hold){
            hold=document.createElement('canvas');
            hold.className='matcher-film matcher-film-hold';hold.setAttribute('aria-hidden','true');
            record.hold=hold;node.after(hold);
          }
          if(hold.width!==node.videoWidth)hold.width=node.videoWidth;
          if(hold.height!==node.videoHeight)hold.height=node.videoHeight;
          const ctx=hold.getContext('2d');
          ctx.clearRect(0,0,hold.width,hold.height);
          ctx.drawImage(node,0,0);
          let opaque=true;
          try{opaque=ctx.getImageData(hold.width*.5|0,hold.height*.42|0,1,1).data[3]>=16;}catch{opaque=true;}
          hold.hidden=!opaque;
        },onFrame:()=>{
          if(!adopt())return;
          const shown=Math.round(node.currentTime*metadata.fps);
          record.seam=false;
          present(record,shown);
          const hold=record.hold;
          if(!hold||hold.hidden)return;
          const hide=()=>{if(record.hold===hold)hold.hidden=true;};
          if(typeof node.requestVideoFrameCallback!=='function'){hide();return;}
          node.requestVideoFrameCallback(hide);
          setTimeout(hide,64);
        }});
        node.src=`/assets/matcher/film/matcher-${name}${extension}?v=${metadata.signature||metadata.frameCount}`;
        // Set the pending destination before the first decode, so late loading
        // and a reversal during loading both adopt the latest input.
        drive(record);
      }
      mount.append(node);
    }catch(error){
      if(record)release(record);
      if(!disposed&&!signal.aborted&&version===generation){loadingKey='';pending=null;metadataCache.delete(name);onError?.();}
    }
  }
  const resize=()=>{box={width:0,height:0};if(current?.ready)present(current,current.frame);load();};
  const observer=new ResizeObserver(entries=>{
    const next=entries[0]?.contentRect;
    if(!next?.width||(Math.abs(next.width-box.width)<=.5&&Math.abs(next.height-box.height)<=.5))return;
    box={width:next.width,height:next.height};
    if(current?.ready)present(current,current.frame);
  });observer.observe(mount);
  phone.addEventListener('change',resize,{signal});
  spacious.addEventListener('change',resize,{signal});
  reduced.addEventListener('change',resize,{signal});
  const dispose=()=>{if(disposed)return;disposed=true;generation++;observer.disconnect();resources.forEach(release);delete mount.dataset.filmFrame;};
  signal.addEventListener('abort',dispose,{once:true});
  await load();
  if(signal.aborted){dispose();return null;}
  return {
    update(next){state={...state,...next};drive(current);load();},
    pause(value){paused=value;if(value)resources.forEach(record=>record.scrubber?.pause());else{drive(current);drive(pending);}},
    isReady:ready,isSeated,isCovering,dispose,
  };
}
