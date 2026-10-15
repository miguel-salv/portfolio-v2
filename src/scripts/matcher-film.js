import {createMechanismScrubber} from './mechanism-motion.js';

const clamp=value=>Math.min(1,Math.max(0,Number.isFinite(value)?value:0));
const stallTimeout=12000;
export function matcherFilmFrame(state,metadata,reduced=false){
  if(state.mode==='inside')return metadata.views[state.part]??metadata.views.capacitors;
  return reduced?0:Math.round(clamp(state.progress)*metadata.assemblyEnd);
}
export function transparentFilmExtension(probe,vendor=''){
  const hevc=probe.canPlayType('video/mp4; codecs="hvc1"');
  const vp9=probe.canPlayType('video/webm; codecs="vp9"');
  return hevc&&(/Apple/.test(vendor)||!vp9)?'.mov':'.webm';
}
// One attached canvas is the only live artwork. Decoders and staging canvases
// stay detached, so neither CSS nor an asynchronous seek can composite poses.
export function createMatcherSurface(mount){
  const canvas=document.createElement('canvas');
  canvas.className='matcher-film';canvas.setAttribute('aria-hidden','true');
  const buffer=document.createElement('canvas'),probe=document.createElement('canvas');
  const output=canvas.getContext('2d'),staging=buffer.getContext('2d');
  const sample=probe.getContext('2d',{willReadFrequently:true});
  probe.width=32;probe.height=32;
  let ready=false,disposed=false;
  mount.append(canvas);
  return {
    get ready(){return ready&&!disposed;},
    commit(source,width,height){
      if(disposed||!width||!height)return false;
      try{
        if(buffer.width!==width)buffer.width=width;
        if(buffer.height!==height)buffer.height=height;
        // Clear explicitly: Safari's video draw path can ignore copy compositing
        // and leave earlier silhouettes beneath the new transparent frame.
        staging.globalCompositeOperation='source-over';
        staging.clearRect(0,0,width,height);
        staging.drawImage(source,0,0,width,height);
        // Validate the staged snapshot, so an empty decoder frame never clears
        // the displayed artwork and the video is sampled only once per commit.
        sample.clearRect(0,0,32,32);sample.drawImage(buffer,0,0,32,32);
        const pixels=sample.getImageData(0,0,32,32).data;
        let visible=false;
        for(let i=3;i<pixels.length;i+=4)if(pixels[i]>=16){visible=true;break;}
        if(!visible)return false;
        if(canvas.width!==width)canvas.width=width;
        if(canvas.height!==height)canvas.height=height;
        output.globalCompositeOperation='source-over';
        output.clearRect(0,0,width,height);
        output.drawImage(buffer,0,0,width,height);
        ready=true;return true;
      }catch{return false;}
    },
    dispose(){disposed=true;canvas.remove();}
  };
}
// A finite film with a bounded seek span owns the hardware's surface. The tuner
// remains independent; prerecorded shaft motion is a mechanism demonstration.
export async function createMatcherModel(mount,{signal,onAnchors,onPose,onError,onLoading,heroLinked=false}){
  const phone=matchMedia('(max-width: 760px)');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const spacious=matchMedia('(min-width: 1101px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)');
  const extension=transparentFilmExtension(document.createElement('video'),navigator.vendor);
  const metadataCache=new Map();
  const resources=new Set();
  const surface=createMatcherSurface(mount);
  let current=null,pending=null,loadingKey='',state={mode:'machine',part:'capacitors',progress:0},paused=false,disposed=false,mediaFailed=false,generation=0,immediate=false;
  let buffering=true;
  const setBuffering=value=>{if(buffering===value)return;buffering=value;onLoading?.(value);};
  onLoading?.(true);
  const variant=()=>phone.matches?'portrait':'landscape';
  const target=record=>matcherFilmFrame(state,record.metadata,record.still);
  const ready=()=>surface.ready&&!buffering;
  const isSeated=()=>ready()&&Boolean(current)&&current.frame===0&&target(current)===0;
  const isCovering=()=>ready()&&Boolean(current)&&current.frame===0;
  let box={width:0,height:0};
  const clearDeadline=record=>{clearTimeout(record.deadline);record.deadline=0;};
  // Only decoded progress renews this deadline. Scroll input, stalled network
  // events and repeated paints of the same pose must not extend the wait.
  function watch(record){
    if(record.still||record.failed||record.abort.signal.aborted)return;
    if(paused||document.hidden||(record.ready&&record.frame===record.destinationFrame)){
      clearDeadline(record);return;
    }
    if(!record.deadline)record.deadline=setTimeout(()=>{
      record.deadline=0;
      if(!paused&&!document.hidden)record.fail();
    },stallTimeout);
  }
  async function fetchMetadata(name){
    const request=new AbortController();
    const cancel=()=>request.abort();
    signal.addEventListener('abort',cancel,{once:true});
    if(signal.aborted)cancel();
    const deadline=setTimeout(cancel,stallTimeout);
    try{
      const response=await fetch(`/assets/matcher/film/${name}.json`,{signal:request.signal,cache:'no-cache'});
      if(!response.ok)throw new Error('Inspection metadata unavailable');
      return await response.json();
    }finally{clearTimeout(deadline);signal.removeEventListener('abort',cancel);}
  }
  const release=record=>{
    if(!record)return;
    clearDeadline(record);
    if(record.frameRequest)record.node.cancelVideoFrameCallback?.(record.frameRequest);
    record.abort.abort();record.scrubber?.dispose();
    if(record.node.tagName==='VIDEO'){
      record.node.pause();record.node.removeAttribute('src');record.node.load();
    }
    record.node.remove();resources.delete(record);
  };
  function present(record,frame){
    if(disposed||record.failed||signal.aborted||record!==current)return;
    const nextFrame=Math.min(record.metadata.frameCount-1,Math.max(0,frame));
    // Cold selections already show their component still. Do not replace it
    // with an older pose while the requested video frame is being fetched.
    if(record.snap&&nextFrame!==target(record))return;
    if(!surface.commit(record.node,record.metadata.width,record.metadata.height))return;
    if(!record.ready||record.frame!==nextFrame)clearDeadline(record);
    record.frame=nextFrame;record.ready=true;
    if (record.snap && record.frame === target(record)) record.snap = false;
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
    setBuffering(false);
    onPose?.({assembly:sample.assembly,assemblyComplete:record.frame===record.metadata.assemblyEnd,
      seated:isSeated(),cover:isCovering(),ready:true,still:record.still});
    watch(record);
  }
  function drive(record){
    if(!record||disposed)return;
    let frame=target(record),start;
    if(record.snap){
      record.route=null;record.opening=false;record.pendingStart=undefined;
      record.camera=state.mode==='inside'?state.part:'machine';record.restingFrame=frame;
    }else if(!record.still&&record.metadata.routes){
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
    record.scrubber.setTarget(frame/span,!paused&&!document.hidden,Boolean(record.snap),record.snap?0:pace,start);
    watch(record);
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
      if(!metadataCache.has(name))metadataCache.set(name,fetchMetadata(name));
      const metadata=await metadataCache.get(name);
      if(disposed||signal.aborted||version!==generation)return;
      const node=document.createElement(still?'img':'video');
      node.hidden=true;node.setAttribute('aria-hidden','true');
      record={node,metadata,variant:name,still,ready:false,frame:0,snap:immediate||buffering,abort:new AbortController()};
      pending=record;
      resources.add(record);
      const local=record.abort.signal;
      const failed=()=>{
        if(disposed||record.failed||local.aborted||(version!==generation&&current!==record))return;
        record.failed=true;record.scrubber?.pause();record.node.hidden=true;
        if(version===generation){loadingKey='';pending=null;release(current);current=null;}
        else if(current===record)current=null;
        release(record);
        setBuffering(false);onError?.();onPose?.({assembly:0,seated:false,ready:false});
        if(!record.still){mediaFailed=true;load();}
      };
      record.fail=failed;
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
        // WebM timestamps round to milliseconds. Seek a quarter-frame inside
        // each pose: a boundary seek at 101/30 otherwise displays frame 100,
        // the controller camera immediately before the capacitor route.
        record.scrubber=createMechanismScrubber(node,{signal:local,seekFrameOffset:.25,speed:1.2*metadata.assemblyEnd/(metadata.frameCount-1),onFrame:()=>{
          if(typeof node.requestVideoFrameCallback==='function')return;
          if(adopt())present(record,Math.round(node.currentTime*metadata.fps));
        },onBeforeSeek:()=>requestDecodedFrame()});
        // Safari can fire seeked before the new pixels can be copied. Register
        // before loading/seeking and use the decoded frame's own timestamp.
        function requestDecodedFrame(){
          if(record.frameRequest||local.aborted||typeof node.requestVideoFrameCallback!=='function')return;
          record.frameRequest=node.requestVideoFrameCallback((now,frame)=>{
            record.frameRequest=0;
            if(local.aborted||!adopt())return;
            present(record,Math.round(frame.mediaTime*metadata.fps));
          });
        }
        requestDecodedFrame();
        node.src=`/assets/matcher/film/matcher-${name}${extension}?v=${metadata.mediaSignature||metadata.signature||metadata.frameCount}`;
        node.load();
        // Set the pending destination before the first decode, so late loading
        // and a reversal during loading both adopt the latest input.
        drive(record);
      }
    }catch(error){
      if(record)release(record);
      if(!disposed&&!signal.aborted&&version===generation){loadingKey='';pending=null;metadataCache.delete(name);setBuffering(false);onError?.();}
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
  const dispose=()=>{if(disposed)return;disposed=true;generation++;observer.disconnect();resources.forEach(release);surface.dispose();delete mount.dataset.filmFrame;};
  signal.addEventListener('abort',dispose,{once:true});
  // Return the controller immediately so input received during metadata/media
  // loading updates the pending destination instead of waiting for a viewer.
  load();
  if(signal.aborted){dispose();return null;}
  return {
    update(next,options={}){
      const previous=state;
      state={...state,...next};
      const changedView=state.mode!==previous.mode||(state.mode==='inside'&&state.part!==previous.part);
      if(changedView&&current&&!current.still&&current.node.buffered){
        const ranges=current.node.buffered;
        const from=current.camera??'machine',to=state.mode==='inside'?state.part:'machine';
        const route=current.metadata.routes?.find(route=>(route.from===from&&route.to===to)||(route.to===from&&route.from===to));
        // Inspection routes can sit much later in the file than the component
        // still. Check the camera path too before promising a warm transition.
        const frames=[target(current),...(route?[route.start,route.end]:[]),
          ...(current.route?[current.route.start,current.route.end]:[])];
        const buffered=frames.every(frame=>{
          const time=(frame+.25)/current.metadata.fps;
          for(let i=0;i<ranges.length;i++)if(time>=ranges.start(i)&&time<ranges.end(i))return true;
          return false;
        });
        if(!buffered)setBuffering(true);
      }
      immediate=options.immediate===true||buffering;
      if(immediate)resources.forEach(record=>{record.snap=true;});
      drive(current);load();
    },
    pause(value){paused=value;if(value)resources.forEach(record=>{clearDeadline(record);record.scrubber?.pause();});else{drive(current);drive(pending);}},
    isReady:ready,isSeated,isCovering,isSettled:()=>ready()&&Boolean(current)&&current.frame===target(current)&&!current.snap,dispose,
  };
}
