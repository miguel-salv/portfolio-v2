import {createMechanismScrubber} from './mechanism-motion.js';

// Both directions use native media playback. A reversal seats the second
// decoder on the last displayed pose before it can replace that surface.
export function createJourneyPlayback(video,{signal,onFrame,onState=()=>{},fps=60,reverseSource,
  makeVideo=()=>document.createElement('video'),isHidden=()=>document.hidden}={}){
  if(!video.requestVideoFrameCallback||!reverseSource)return createMechanismScrubber(video,{signal,onFrame,fps,speed:.75,isHidden});
  const reverse=makeVideo();reverse.muted=true;reverse.playsInline=true;reverse.preload='auto';
  const records=[{node:video,sign:1,callback:0},{node:reverse,sign:-1,callback:0}];
  let target=0,shown=0,active=false,disposed=false,current=null,waiting=null,fallback=null;
  const end=()=>Math.max(0,(Math.round(video.duration*fps)-1)/fps)||7;
  const logical=(record,time=record.node.currentTime)=>record.sign>0?time:end()-time;
  const media=(record,time)=>record.sign>0?time:end()-time;
  const allowed=()=>active&&!disposed&&!signal?.aborted&&!isHidden();
  function stop(record){record.node.pause();if(record.callback)record.node.cancelVideoFrameCallback(record.callback);record.callback=0;}
  function emit(record,time){
    if(!allowed()||record!==current||record.node.seeking||record.node.readyState<2)return;
    shown=Math.min(end(),Math.max(0,logical(record,time)));
    onFrame?.(record.node,Math.round(shown*fps)/2);
  }
  function request(record){
    if(record.callback||!allowed()||record!==current||record.node.paused)return;
    record.callback=record.node.requestVideoFrameCallback((_now,metadata)=>{
      record.callback=0;if(!allowed()||record!==current)return;
      emit(record,metadata.mediaTime);
      const remaining=(target-shown)*record.sign;
      if(remaining<=.5/fps){stop(record);seat(record,target);return;}
      if(Math.sign(target-shown)!==record.sign){drive();return;}
      request(record);
    });
  }
  function play(record){
    if(!allowed()||record!==current||record.node.seeking)return;
    const remaining=(target-shown)*record.sign;
    if(remaining<=.5/fps){stop(record);return;}
    record.node.playbackRate=1;
    const promise=record.node.play();request(record);
    promise?.then(()=>{onState('playing:'+record.sign);request(record);}).catch(error=>{onState('fallback:'+error.name);useFallback();});
  }
  function seated(record){
    if(!allowed()||record!==waiting||record.node.seeking||record.node.readyState<2)return;
    const wanted=media(record,shown);
    if(Math.abs(record.node.currentTime-wanted)>.75/fps){record.node.currentTime=wanted;return;}
    waiting=null;current=record;onState('seated:'+record.sign);emit(record,record.node.currentTime);play(record);
  }
  function seat(record,time){
    stop(record);shown=time;waiting=record;onState('seeking:'+record.sign+':'+time.toFixed(3));
    if(record===records[1]&&!reverse.getAttribute('src')){reverse.src=reverseSource;reverse.load();}
    if(record.node.readyState>=2&&!record.node.seeking){
      const value=Math.max(0,media(record,time));
      if(Math.abs(record.node.currentTime-value)>.5/fps)record.node.currentTime=value;
      else seated(record);
    }
  }
  function drive(){
    if(!allowed()||fallback)return;
    const direction=target>=shown?1:-1;
    const next=records.find(record=>record.sign===direction);
    if(waiting){if(waiting!==next){stop(waiting);waiting=null;seat(next,shown);}return;}
    if(current!==next){if(current)stop(current);seat(next,shown);return;}
    play(next);
  }
  function useFallback(){
    if(disposed||fallback)return;
    records.forEach(stop);waiting=null;current=null;
    fallback=createMechanismScrubber(video,{signal,onFrame,fps,speed:.75,isHidden});
    fallback.setTarget(target/end(),active,true);
  }
  for(const record of records){
    record.ready=()=>seated(record);
    record.node.addEventListener('loadeddata',record.ready,{signal});
    record.node.addEventListener('seeked',record.ready,{signal});
  }
  reverse.addEventListener('error',useFallback,{signal});
  const pause=()=>{active=false;records.forEach(stop);fallback?.pause();};
  const dispose=()=>{
    if(disposed)return;pause();disposed=true;fallback?.dispose();
    records.forEach(record=>{record.node.removeEventListener('loadeddata',record.ready);record.node.removeEventListener('seeked',record.ready);});
    reverse.removeEventListener('error',useFallback);reverse.removeAttribute('src');reverse.load();
  };
  signal?.addEventListener('abort',dispose,{once:true});
  return {setTarget(value,enabled=true,immediate=false){
    if(disposed||signal?.aborted)return;
    target=Math.round(Math.min(1,Math.max(0,value))*end()*fps)/fps;
    active=enabled&&!isHidden();
    if(fallback){fallback.setTarget(value,active,immediate);return;}
    if(!active){pause();return;}
    if(immediate){records.forEach(stop);waiting=null;seat(records[0],target);return;}
    drive();
  },pause,dispose,get settled(){return fallback?fallback.settled:!waiting&&Math.abs(target-shown)<.75/fps;}};
}
