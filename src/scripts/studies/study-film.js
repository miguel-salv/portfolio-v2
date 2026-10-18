// One bounded decoder per near chapter. Seeks coalesce to the latest target;
// stale callbacks can never publish after navigation, replacement or disposal.
export function createStudyFilm({src,fallbackSrc,fps=30,frameCount,signal,progressive=false,onFrame=()=>{},onError=()=>{},makeVideo=()=>document.createElement('video')}) {
  const video=makeVideo();
  video.muted=true;video.playsInline=true;video.preload='auto';
  let target=0,painted=-1,disposed=false,active=true,seeking=false,usingFallback=false;
  const last=()=>Math.max(0,(frameCount-1)/fps);
  const allowed=()=>!disposed&&!signal?.aborted&&active;
  function publish(time){
    if(!allowed()||video.seeking||video.readyState<2)return;
    const frame=Math.round(time*fps),wanted=Math.round(target*fps);
    if(!progressive&&Math.abs(frame-wanted)>1){drive();return;}
    if(frame===painted)return;
    painted=frame;onFrame(video,frame);
  }
  function paintReady(){
    if(!allowed()||video.seeking||video.readyState<2)return;
    if(!progressive&&Math.abs(video.currentTime-target)>.6/fps){drive();return;}
    // seeked means the decoded currentTime is available to drawImage. We do
    // not start playback or an idle rAF merely to receive a frame callback.
    publish(video.currentTime);
  }
  function drive(){
    if(!allowed()||seeking||video.seeking||video.readyState<1)return;
    if(Math.abs(video.currentTime-target)<=.6/fps){paintReady();return;}
    seeking=true;
    try{video.currentTime=target;}catch(error){seeking=false;onError(error);}
  }
  const ready=()=>{seeking=false;paintReady();drive();};
  const metadata=()=>{
    // Mobile browsers may preload only metadata for a paused inline movie.
    // Request one drawable frame without autoplaying a whole scene.
    if(allowed()&&video.readyState===1&&!video.seeking){
      seeking=true;video.currentTime=target||Math.min(last(),1/(fps*8));
    }
  };
  const failed=()=>{
    if(disposed)return;
    if(fallbackSrc&&!usingFallback){usingFallback=true;seeking=false;painted=-1;video.src=fallbackSrc;video.load();return;}
    onError(new Error('Cinematic media unavailable'));
  };
  video.addEventListener('loadeddata',ready);
  video.addEventListener('loadedmetadata',metadata);
  video.addEventListener('seeked',ready);
  video.addEventListener('error',failed);
  video.src=src;video.load();
  function dispose(){
    if(disposed)return;disposed=true;video.pause();
    signal?.removeEventListener('abort',dispose);
    video.removeEventListener('loadeddata',ready);video.removeEventListener('loadedmetadata',metadata);video.removeEventListener('seeked',ready);video.removeEventListener('error',failed);
    video.removeAttribute('src');video.load();
  }
  signal?.addEventListener('abort',dispose,{once:true});
  if(signal?.aborted)dispose();
  return {
    seek(frame){if(disposed)return;target=Math.min(last(),Math.max(0,Math.round(frame)/fps));drive();},
    pause(value=true){active=!value;video.pause();if(!value)drive();},
    repaint(){painted=-1;paintReady();},
    dispose,
    get ready(){return !disposed&&video.readyState>=2;},
    get frame(){return painted;},
    get target(){return Math.round(target*fps);},
    get element(){return video;},
  };
}
