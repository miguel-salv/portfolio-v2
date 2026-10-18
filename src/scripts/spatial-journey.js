import {createJourneyPlayback} from './journey-playback.js';
import {createMatcherSurface} from './matcher-film.js';

const clamp=value=>Math.min(1,Math.max(0,Number.isFinite(value)?value:0));
export const SPATIAL_START=1/3-.04;
// These are camera stops in one Blender world, rather than slide boundaries.
const stops=[[SPATIAL_START,0],[1/3+.04,40],[2/3-.04,100],[2/3+.04,140],[1,210]];
function interpolate(value,axis){
  const input=axis,output=1-axis;
  if(value<=stops[0][input])return stops[0][output];
  for(let i=1;i<stops.length;i++)if(value<=stops[i][input]){
    const a=stops[i-1],b=stops[i];
    return a[output]+(b[output]-a[output])*(value-a[input])/(b[input]-a[input]);
  }
  return stops.at(-1)[output];
}
export const spatialFrameAtProgress=progress=>interpolate(clamp(progress),0);
export const spatialProgressAtFrame=frame=>interpolate(Math.min(210,Math.max(0,frame)),1);
export function spatialProjection(base,viewport,frame){
  const bridge=frame>0&&frame<40?frame/40:frame>100&&frame<140?(frame-100)/40:0;
  const ease=t=>{t=Math.min(1,Math.max(0,t));return t*t*t*(t*(t*6-15)+10);};
  const expansion=bridge?Math.min(ease(bridge/.25),ease((1-bridge)/.25)):0;
  const width=base.width+(viewport.width-base.width)*expansion,height=width*.75;
  return {left:base.left*(1-expansion),top:base.top+(base.height-height)*.5,width,height,expansion};
}

// A detached decoder stages a validated alpha frame before it can own the
// aperture. The live matcher and this film never composite hardware together.
export function createSpatialJourney({mount,video,source,signal,onChange=()=>{},
  matcherReady=()=>true,seatMatcher=()=>{},makeSurface=createMatcherSurface,
  makeScrubber=createJourneyPlayback,timeout=12000}={}){
  const surface=makeSurface(mount);
  let requested=0,shown=0,decoded=0,owner='matcher',status='idle';
  let active=false,disposed=false,deadline=0,firstFrame=true,direct=false,seating=false;
  let signature='',pendingFrame=0;
  const notify=()=>{
    const next=`${owner}:${shown.toFixed(6)}:${status}`;
    if(next===signature)return;signature=next;
    onChange({owner,progress:shown,status,frame:decoded});
  };
  const clearDeadline=()=>{clearTimeout(deadline);deadline=0;};
  const fail=()=>{
    if(disposed||signal?.aborted)return;
    clearDeadline();status='failed';video.dataset.failed='1';scrubber.pause();
    if(requested>=SPATIAL_START){owner='poster';shown=requested;}
    notify();
  };
  const committed=(source=video,logicalFrame)=>{
    if(disposed||signal?.aborted||!active||source.seeking||source.readyState<2||status!=='ready')return;
    const frame=Math.min(210,Math.max(0,logicalFrame??Math.round(source.currentTime*60)/2));
    // Initial loading/navigation may finish an older seek. Keep the current
    // owner until the decoder actually paints the latest requested destination.
    if(firstFrame&&Math.abs(frame-pendingFrame)>1)return;
    if(requested<SPATIAL_START&&owner==='matcher')return;
    if(frame===0&&!matcherReady()&&!direct)return;
    if(!firstFrame&&frame===decoded&&owner==='cinema')return;
    if(!surface.commit(source,source.videoWidth,source.videoHeight))return;
    clearDeadline();decoded=frame;firstFrame=false;
    if(frame===0&&requested<=SPATIAL_START&&matcherReady()){
      owner='matcher';shown=requested;seating=false;
    }else{owner='cinema';shown=spatialProgressAtFrame(frame);}
    notify();
    if(!scrubber.settled&&!deadline)deadline=setTimeout(fail,timeout);
  };
  const scrubber=makeScrubber(video,{signal,fps:60,onFrame:committed,onState:state=>{if(mount.dataset)mount.dataset.playback=state;},reverseSource:source.replace('journey-landscape','journey-reverse')});
  const ready=()=>{
    if(disposed||signal?.aborted||video.dataset.source!==source)return;
    clearDeadline();status='ready';video.dataset.ready='1';notify();
  };
  const load=()=>{
    if(status!=='idle'||disposed||signal?.aborted)return;
    status='loading';video.dataset.source=source;video.preload='auto';
    video.muted=true;video.playsInline=true;video.src=source;
    deadline=setTimeout(fail,timeout);video.load();notify();
  };
  video.addEventListener('loadeddata',ready,{signal});
  video.addEventListener('error',fail,{signal});
  const dispose=()=>{
    if(disposed)return;disposed=true;clearDeadline();scrubber.dispose();
    video.removeEventListener('loadeddata',ready);video.removeEventListener('error',fail);
    video.pause();video.removeAttribute('src');video.load();surface.dispose();
  };
  signal?.addEventListener('abort',dispose,{once:true});
  return {
    sample(progress,enabled=true,immediate=false){
      if(disposed||signal?.aborted)return {progress,owner:'matcher',status:'disposed'};
      requested=clamp(progress);active=enabled;direct=immediate;
      if(immediate&&requested<SPATIAL_START&&owner!=='matcher'){
        owner='matcher';firstFrame=true;seating=false;
      }
      if(enabled&&requested>.16)load();
      if(!enabled){scrubber.pause();clearDeadline();return {progress:shown,owner,status};}
      if(status==='loading'&&!deadline)deadline=setTimeout(fail,timeout);
      if(requested<SPATIAL_START&&owner==='matcher'){
        shown=requested;seating=false;scrubber.pause();notify();
        return {progress:shown,owner,status};
      }
      if(!seating&&owner==='matcher'){
        seating=true;seatMatcher();
      }
      if(status==='failed'){
        owner=requested>=SPATIAL_START?'poster':'matcher';shown=requested;notify();
        return {progress:shown,owner,status};
      }
      if(status==='ready'){
        const destination=spatialFrameAtProgress(requested);
        // Continuous entry begins on the exact open-matcher frame. Direct
        // chapter navigation seats its requested camera immediately.
        pendingFrame=firstFrame&&!immediate&&owner==='matcher'&&requested<stops[1][0]?0:Math.round(destination);
        const target=(firstFrame?pendingFrame:destination)/210;
        scrubber.setTarget(target,true,immediate||firstFrame);
        if(!scrubber.settled&&!deadline)deadline=setTimeout(fail,timeout);
      }
      if(owner==='matcher')shown=Math.min(requested,SPATIAL_START);
      notify();return {progress:shown,owner,status};
    },
    pause(){active=false;scrubber.pause();clearDeadline();},
    get settled(){return status==='failed'||(status==='ready'&&scrubber.settled);},
    dispose,
  };
}
