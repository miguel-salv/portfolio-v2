import {mountInstrument} from '../instrument.js';
import {studyTimeline,displayedFilmTimeline,canPresentStudyFrame,chapterDestination,shouldLoadStudyMechanism,interpolateCamera,cameraForViewport,selectStudyOwner,matcherPresentation,clamp,smooth} from './home-motion-state.js';
import {coverRect,plateProjection,flowSceneRect} from './study-projection.js';
import {createStudyFilm} from './study-film.js';
import {readStudySession,saveStudySession} from './study-session.js';

let cleanup=()=>{},activeRoot=null;
function init(){
  const root=document.querySelector('[data-home-motion]');
  if(root&&root===activeRoot)return;
  cleanup();if(!root)return;activeRoot=root;
  const abort=new AbortController(),{signal}=abort;
  const stage=root.querySelector('[data-study-stage]'),hero=root.querySelector('[data-workshop-hero]');
  const surface=root.querySelector('[data-study-surface]'),canvas=surface.querySelector('canvas'),context=canvas.getContext('2d');
  const liveMount=surface.querySelector('[data-study-live]'),panel=root.querySelector('[data-study-matcher]');
  const status=root.querySelector('[data-study-status]');
  const sections=[...root.querySelectorAll('[data-study-chapter]')];
  const seats=Object.fromEntries([...root.querySelectorAll('[data-study-seat]')].map(node=>[node.dataset.studySeat,node]));
  const links=[...root.querySelectorAll('[data-study-chapter-link]')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),flow=matchMedia('(max-width: 760px), (max-height: 619px)');
  const images=new Map(),jsons=new Map(),films=new Map();
  let catalogue=null,raf=0,disposed=false,viewer=null,liveLoading=false,liveReady=false,liveFailed=false;
  let liveRevealPending=false,liveAssembly=0,departureAssembly=1,lastLivePhase=null;
  let storage;try{storage=sessionStorage;}catch{}
  const saved=readStudySession(storage);
  let mode=saved.mode,part=saved.part,values={m1:saved.m1,m2:saved.m2},controlled=saved.controlled,lastLiveState='',displayed=null;
  const retain=()=>saveStudySession({...values,mode,part,controlled},storage);
  let currentRect=null,currentCamera=null,currentMedia=null,currentPoster=null,surfaceOverride=null;
  let geometry=null,measureNeeded=true,lastChapter='',lastOwner='',paintCount=0,recovery=false;
  let ownedDestination=null,pendingFocus=null,pendingChapter=null;
  const pacing=[];let lastFrameTime=0,lastProgress=-1,lastExit=-1;
  const mediaPacing=[];let lastScrollTime=0,lastMediaTime=0,lastMediaFrame='';
  const staticMode=()=>recovery||reduced.matches||Boolean(navigator.connection?.saveData)||!context;
  const heroOrientation=()=>innerWidth<=760?'phone':innerWidth<=1100&&innerHeight>innerWidth?'portrait':'landscape';
  const filmOrientation=()=>innerWidth<=760||innerHeight>innerWidth?'portrait':'landscape';
  const theme=()=>document.documentElement.dataset.theme==='dark'?'dark':'light';
  const request=()=>{if(!raf&&!disposed)raf=requestAnimationFrame(paint);};
  function recover(){
    recovery=true;surface.hidden=true;viewer?.pause(true);
    films.forEach(record=>record.player?.pause(true));
    root.classList.remove('study-is-enhanced','study-has-surface','study-control-surface');root.classList.add('study-is-flow');
    setOwner('poster',displayed||studyTimeline(0));
    hero.classList.remove('study-hero-copy-away','is-handoff-source');
    sections.forEach(node=>{node.hidden=false;node.inert=false;});measureNeeded=true;
    status.textContent='The cinematic assets are unavailable. Project photographs, links, and the modeled tuner remain available.';
  }
  function loadJSON(path){
    if(!path)return null;
    if(!jsons.has(path)){
      const record={value:null,failed:false};jsons.set(path,record);
      fetch(path,{signal}).then(r=>{if(!r.ok)throw Error('Study camera unavailable');return r.json();}).then(value=>{record.value=value;request();}).catch(()=>{record.failed=true;request();});
    }
    return jsons.get(path).value;
  }
  function loadImage(path){
    if(!path)return null;
    if(!images.has(path)){
      const image=new Image();image.decoding='async';
      image.onload=request;image.onerror=request;image.src=path;images.set(path,image);
    }
    const image=images.get(path);return image.complete&&image.naturalWidth?image:null;
  }
  const imageSpec=spec=>typeof spec==='string'?{src:spec,metadata:spec+'.json'}:spec;
  function picture(spec){
    spec=imageSpec(spec);if(!spec)return null;
    const image=loadImage(spec.src),metadata=loadJSON(spec.metadata);
    if(!image||!metadata)return null;
    return {image,metadata:{...metadata,camera:metadata.camera||metadata.frames?.[0]?.camera,
      resolution:metadata.resolution||[metadata.width||image.naturalWidth,metadata.height||image.naturalHeight]}};
  }
  const usable=()=>!disposed&&!document.hidden;
  function film(spec,key){
    if(!spec?.src)return null;
    if(!films.has(key)){
      const record={spec,player:null,frame:-1,failed:false,lastUsed:performance.now()};films.set(key,record);
      const metadata=loadJSON(spec.metadata);
      if(metadata)record.metadata=metadata;
    }
    const record=films.get(key);record.lastUsed=performance.now();
    record.metadata ||= loadJSON(spec.metadata);
    if(record.metadata&&!record.player&&!record.failed){
      record.player=createStudyFilm({src:spec.src,fallbackSrc:spec.webm,fps:record.metadata.fps,frameCount:record.metadata.frameCount,signal,progressive:true,
        onFrame:(video,frame)=>{
          // Freeze the decoded pixels with their camera sample before another
          // seek begins. A video element alone can already be seeking by paint.
          record.image ||= document.createElement('canvas');
          if(record.image.width!==video.videoWidth||record.image.height!==video.videoHeight){record.image.width=video.videoWidth;record.image.height=video.videoHeight;}
          record.image.getContext('2d').drawImage(video,0,0);
          record.frame=frame/(record.metadata.frameScale||1);request();
        },onError:()=>{record.failed=true;request();}});
    }
    if(jsons.get(spec.metadata)?.failed)record.failed=true;
    return record;
  }
  function measure(){
    const rect=root.getBoundingClientRect(),header=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-offset'))||64;
    const heroRect=hero.getBoundingClientRect();
    const absolute=node=>{const r=node.getBoundingClientRect(),chapter=node.closest('.study-chapter');return {left:r.left,top:(chapter?.getBoundingClientRect().top??r.top)+scrollY,width:r.width,height:r.height};};
    const seatRects=Object.fromEntries(Object.entries(seats).map(([key,node])=>[key,absolute(node)]));
    const start=rect.top+scrollY;
    geometry={start,end:start+root.offsetHeight-stage.offsetHeight,header,hero:{left:heroRect.left,top:heroRect.top+scrollY,width:heroRect.width,height:heroRect.height},seats:seatRects};
    if(flow.matches||staticMode()){
      const m=seatRects.matcher,v=seatRects.vehicle,r=seatRects.robot;
      geometry.stops=[[0,start],[.18,m.top-header-12],[.39,m.top+m.height*.40],[.615,v.top-header-12],[.72,r.top-innerHeight*.65],[.865,r.top-header-12],[1,r.top+r.height*.55]];
      // Tall controls expand the document, so strictly increasing coordinates
      // are measured from actual seats rather than assumed screen multiples.
      for(let i=1;i<geometry.stops.length;i++)geometry.stops[i][1]=Math.max(geometry.stops[i][1],geometry.stops[i-1][1]+24);
    }
    measureNeeded=false;
  }
  function progress(){
    if(!flow.matches&&!staticMode())return clamp((scrollY-geometry.start)/(geometry.end-geometry.start));
    const stops=geometry.stops;
    if(scrollY<=stops[0][1])return 0;
    for(let i=1;i<stops.length;i++)if(scrollY<=stops[i][1])return stops[i-1][0]+(stops[i][0]-stops[i-1][0])*clamp((scrollY-stops[i-1][1])/(stops[i][1]-stops[i-1][1]));
    return 1;
  }
  function seatRect(state){
    if(!flow.matches&&!staticMode()){
      const r=stage.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};
    }
    return flowSceneRect(state,{hero:geometry.hero,seats:geometry.seats,header:geometry.header,scrollY,viewportHeight:innerHeight});
  }
  const commitSurface=state=>sizeSurface(surfaceOverride||seatRect(state));
  function sizeSurface(rect){
    currentRect=rect;surface.style.transform='translate3d('+rect.left+'px,'+rect.top+'px,0)';surface.style.width=rect.width+'px';surface.style.height=rect.height+'px';
    const ratio=Math.min(devicePixelRatio||1,1.5),width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
    if(canvas.width!==width||canvas.height!==height){
      const previous=document.createElement('canvas');previous.width=canvas.width;previous.height=canvas.height;
      previous.getContext('2d')?.drawImage(canvas,0,0);canvas.width=width;canvas.height=height;
      context.drawImage(previous,0,0,width,height);
    }
    context.setTransform(ratio,0,0,ratio,0,0);
  }
  function drawCover(image,width=image.videoWidth||image.naturalWidth,height=image.videoHeight||image.naturalHeight){
    const rect=coverRect({width,height},currentRect);context.drawImage(image,rect.x,rect.y,rect.width,rect.height);
  }
  function drawPlate(plate,camera,source){
    const base=plate.metadata.resolution?plate.metadata:{...plate.metadata,resolution:[plate.image.naturalWidth,plate.image.naturalHeight]};
    const rect=plateProjection(base,camera,source,currentRect);context.drawImage(plate.image,rect.x,rect.y,rect.width,rect.height);
  }
  function setOwner(owner,state){
    surface.dataset.owner=owner;liveMount.style.visibility=owner==='live'?'visible':'hidden';
    viewer?.pause(owner!=='live'||!usable());
    // The hidden renderer first paints the assembled device over its matching
    // empty plate. Only the visible owner may begin opening the mechanism.
    if(owner==='live'&&liveRevealPending){liveRevealPending=false;lastLiveState='';updateLive(currentCamera,state,false);}
    root.dataset.studyOwner=owner;root.dataset.studyChapter=state.chapter;
    root.dataset.studyFrame=String(Number(state.frame.toFixed(3)));
    if(owner!==lastOwner){lastOwner=owner;surface.dispatchEvent(new CustomEvent('study:owner',{detail:{owner,chapter:state.chapter}}));}
  }
  function recordMediaCadence(record,frame){
    const now=performance.now(),key=record.spec.src+':'+frame;
    if(key===lastMediaFrame)return;
    if(now-lastScrollTime<160&&lastMediaTime){
      mediaPacing.push(now-lastMediaTime);if(mediaPacing.length>600)mediaPacing.shift();
      if(mediaPacing.length>=8){
        const sorted=[...mediaPacing].sort((a,b)=>a-b);
        root.dataset.studyMediaSamples=String(sorted.length);
        root.dataset.studyMediaMedianMs=sorted[Math.floor(sorted.length*.5)].toFixed(2);
        root.dataset.studyMediaP95Ms=sorted[Math.floor(sorted.length*.95)].toFixed(2);
      }
    }
    lastMediaTime=now-lastScrollTime<160?now:0;lastMediaFrame=key;
  }
  function liveState(camera,state){
    if(state.livePhase==='departure'&&lastLivePhase!=='departure')departureAssembly=lastLivePhase==='inspect'?liveAssembly:mode==='inside'?1:0;
    if(state.livePhase==='opening')departureAssembly=1;
    lastLivePhase=state.livePhase;
    const next=matcherPresentation(state,{mode,part,values,controlled,camera,departureAssembly});
    return liveRevealPending?{...next,mode:'machine',progress:0}:next;
  }
  function updateLive(camera,state,immediate=true){
    if(!viewer||!camera)return;
    const next=liveState(camera,state),key=JSON.stringify(next);
    if(key!==lastLiveState){lastLiveState=key;viewer.update(next,immediate?{scrub:true,preserveAssemblyMotion:state.livePhase==='inspect'}:{duration:400});}
  }
  async function prepareLive(camera,state){
    if(viewer||liveLoading||liveFailed||!camera||!usable())return;
    if(!shouldLoadStudyMechanism({mode,controlled}))return;
    if(staticMode()&&mode==='machine')return;
    liveLoading=true;liveMount.hidden=false;
    try{
      const {createMatcherModel}=await import('../matcher-model.js');
      if(signal.aborted)return;
      const next=await createMatcherModel(liveMount,{signal,heroLinked:true,initialCameraFrame:camera,preserveAngles:true,
        materialOverrides:catalogue.liveMaterials||{'Exhibit — capacitor frame and hardware':{color:[.53,.55,.57],roughness:.25,metallic:.96}},
        onError:()=>{liveFailed=true;liveReady=false;panel.querySelector('[data-study-render-recovery]').hidden=false;request();},
        onPose:pose=>{liveAssembly=pose.assembly;root.dataset.studyAssembly=String(Number(liveAssembly.toFixed(4)));if(!liveReady){liveReady=true;request();}},onAnchors:points=>{
          for(const [name,point] of Object.entries(points)){
            const marker=surface.querySelector('[data-study-marker="'+name+'"]');
            if(marker){marker.style.left=point[0]+'%';marker.style.top=point[1]+'%';}
          }
        }});
      if(signal.aborted||liveFailed){next?.dispose();return;}
      if(!shouldLoadStudyMechanism({mode,controlled})){next?.dispose();liveReady=false;return;}
      viewer=next;liveRevealPending=true;lastLiveState='';updateLive(camera,state);request();
    }catch{
      liveFailed=true;const recovery=panel.querySelector('[data-study-render-recovery]');recovery.hidden=false;
      status.textContent='The live mechanism is unavailable. Rendered hardware and the modeled tuner remain available.';
    }finally{liveLoading=false;}
  }
  function copy(state){
    if(state.chapter==='robot'){
      const marks=currentMedia?.metadata?.markers||{detect:45,approach:78,collect:119};
      const step=state.frame<marks.detect?'detect':state.frame<marks.approach?'approach':'collect';
      root.querySelectorAll('[data-study-operation]').forEach(node=>{if(node.dataset.studyOperation===step)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');});
      const command=root.querySelector('[data-study-command]');
      const text=state.frame<marks.detect?'Camera scans for a bottle.':state.frame<marks.approach?'Bottle localized. Bearing sent over UART.':state.frame<marks.collect-12?'Motor control guides the approach.':'Arm closes around the bottle.';
      if(command.textContent!==text)command.textContent=text;
    }
    if(flow.matches||staticMode()){
      sections.forEach(node=>{node.hidden=false;node.inert=false;});
      const showHero=state.progress<.10;
      hero.classList.toggle('study-hero-copy-away',!showHero&&!staticMode());
      focusDestination(state);return;
    }
    hero.classList.toggle('study-hero-copy-away',state.copy!=='hero');
    sections.forEach(node=>{const shown=node.dataset.studyChapter===state.copy;node.hidden=!shown;node.inert=!shown;});
    links.forEach(link=>{const active=link.dataset.studyChapterLink===state.chapter;if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
    if(lastChapter!==state.chapter){lastChapter=state.chapter;root.dispatchEvent(new CustomEvent('study:chapter',{detail:{chapter:state.chapter}}));}
    focusDestination(state);
  }
  function focusDestination(state){
    if(!pendingFocus||state.copy!==pendingFocus)return;
    const heading=pendingFocus==='hero'?hero.querySelector('h1'):sections.find(node=>node.dataset.studyChapter===pendingFocus)?.querySelector('h2');
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});pendingFocus=null;}
  }
  function posterFor(state,orientation){
    const f=catalogue.films[orientation];
    if(state.chapter==='vehicle')return f.drive.seat||f.drive.poster;
    if(state.chapter==='robot')return state.frame<50?f.robot.bottle||f.robot.seat:f.robot.seat||f.robot.poster;
    return catalogue.hero[heroOrientation()][theme()].seat;
  }
  function fallback(state,orientation){
    const spec=imageSpec(posterFor(state,orientation)),image=loadImage(spec?.src);
    if(!image)return false;
    commitSurface(state);context.clearRect(0,0,currentRect.width,currentRect.height);drawCover(image);
    currentPoster=spec.src;setOwner('poster',state);displayed=state;return true;
  }
  function drawHero(state){
    const info=catalogue.hero[heroOrientation()][theme()];
    const metadata=loadJSON(info.timeline);
    if(!metadata?.frames){if(jsons.get(info.timeline)?.failed)recover();return false;}
    const camera=interpolateCamera(metadata.frames,state.frame),source={width:metadata.width,height:metadata.height};
    const readyEmpty=(state.frame>=47.5?picture(info.emptySeat):null)||picture(info.emptyOpening);
    const occupied=(state.frame>=47.5?picture(info.seat):null)||picture(info.opening);
    // A changing capacitor pose must never be covered by the neutral device
    // while its matching empty environment is still loading.
    if(liveReady&&!readyEmpty&&displayed?.matcher){updateLive(currentCamera,displayed);return false;}
    const plate=liveReady&&readyEmpty?readyEmpty:occupied;
    if(!plate)return false;
    commitSurface(state);
    const nextCamera=cameraForViewport(camera,source,currentRect);
    context.clearRect(0,0,currentRect.width,currentRect.height);drawPlate(plate,camera,source);
    currentCamera=nextCamera;
    if(liveReady&&readyEmpty)viewer?.pause(false);
    prepareLive(currentCamera,state);updateLive(currentCamera,state);
    setOwner(selectStudyOwner({matcher:true,liveReady,emptyReady:Boolean(readyEmpty),filmReady:false}),state);displayed=state;
    return true;
  }
  function renderCinema(state){
    const orientation=filmOrientation(),f=catalogue.films[orientation],isDrive=state.film==='shaft-to-drive';
    const drive=theme()==='dark'&&f.drive.dark?f.drive.dark:f.drive;
    const record=film(isDrive?drive:f.robot,(isDrive?'drive-':'robot-')+orientation+(isDrive?'-'+theme():''));
    const beforeCut=isDrive&&state.matcher;
    record?.player?.pause(!usable());
    record?.player?.seek(state.frame*(record.metadata?.frameScale||1));
    if(beforeCut&&record?.failed)return drawHero({...state,frame:48,livePhase:'inspect',copy:'matcher'});
    if(record?.image&&canPresentStudyFrame(state,record.frame)){
      const frame=record.frame;
      const shown=displayedFilmTimeline(state,frame);
      commitSurface(shown);
      context.clearRect(0,0,currentRect.width,currentRect.height);
      drawCover(record.image,record.metadata.width,record.metadata.height);
      currentCamera=null;
      setOwner(selectStudyOwner({matcher:beforeCut,livePhase:shown.livePhase,liveReady,emptyReady:false,filmReady:true}),shown);displayed=shown;currentMedia=record;
      recordMediaCadence(record,frame);
      return true;
    }
    if(record?.failed||!displayed)return fallback(state,orientation);
    // Hold the existing complete frame during a seek. No blank canvas and no
    // premature live overlay on a stale camera; native scrolling stays free.
    if(displayed?.matcher&&liveReady)updateLive(currentCamera,displayed);
    return false;
  }
  function trimFilms(state){
    const keep=[...films.entries()].sort((a,b)=>b[1].lastUsed-a[1].lastUsed).slice(0,3).map(([key])=>key);
    for(const [key,record] of films){
      const active=state.film==='bottle-collect'?key.startsWith('robot-'):state.film==='shaft-to-drive'&&key.startsWith('drive-');
      record.player?.pause(!active||!usable());
      if(!keep.includes(key)){record.player?.dispose();films.delete(key);}
    }
  }
  function paint(now){
    raf=0;if(!usable()||!catalogue||!context)return;
    if(liveFailed&&viewer){viewer.dispose();viewer=null;}
    if(measureNeeded)measure();
    if(ownedDestination!==null&&Math.abs(scrollY-ownedDestination)<2){ownedDestination=null;root.removeAttribute('data-scroll-owned-active');}
    const p=progress(),state=studyTimeline(p),bounds=root.getBoundingClientRect();
    if(p!==lastProgress&&lastFrameTime&&now-lastFrameTime<100){
      pacing.push(now-lastFrameTime);if(pacing.length>600)pacing.shift();
      if(pacing.length>=12){const sorted=[...pacing].sort((a,b)=>a-b);root.dataset.studyCadenceSamples=String(sorted.length);root.dataset.studyCadenceMedianMs=sorted[Math.floor(sorted.length*.5)].toFixed(2);root.dataset.studyCadenceP95Ms=sorted[Math.floor(sorted.length*.95)].toFixed(2);}
    }
    lastFrameTime=now;lastProgress=p;
    // The stage dissolves into the page before its sticky hold releases.
    const exit=flow.matches||staticMode()?0:smooth((p-.975)/.025);
    if(exit!==lastExit){lastExit=exit;root.style.setProperty('--study-exit',String(Number(exit.toFixed(4))));}
    if(bounds.bottom<geometry.header||bounds.top>innerHeight){surface.hidden=true;viewer?.pause(true);films.forEach(r=>r.player?.pause(true));return;}
    const staticStudy=staticMode();
    if(staticStudy&&mode==='machine'){surface.hidden=true;root.classList.remove('study-control-surface');setOwner('poster',state);return;}
    const matcherBounds=panel.closest('.study-matcher').getBoundingClientRect();
    const operating=(flow.matches||staticStudy)&&mode!=='machine'&&state.progress>=.18&&matcherBounds.bottom>geometry.header+seats.matcher.offsetHeight;
    root.classList.toggle('study-control-surface',operating);
    const shownState=staticStudy||operating?studyTimeline(chapterDestination('matcher')):state;
    surfaceOverride=null;
    if(staticStudy||operating){const r=seats.matcher.getBoundingClientRect();surfaceOverride={left:r.left,top:r.top,width:r.width,height:r.height};}
    const rect=surfaceOverride||seatRect(shownState);
    if(rect.top+rect.height<0||rect.top>innerHeight){surface.hidden=true;viewer?.pause(true);return;}
    // A pending decode retains both the pixels and their complete aperture.
    // A new chapter may move the surface only when it can paint its own frame.
    let painted=false;
    if(shownState.film==='hero-push')painted=drawHero(shownState);
    else painted=renderCinema(shownState);
    if(painted){
      surface.hidden=false;root.classList.add('study-has-surface');
      if(shownState.matcher)hero.classList.add('is-handoff-source');
      copy(displayed||shownState);paintCount++;
      root.dataset.studyPaints=String(paintCount);
    }
    surface.classList.toggle('study-is-inspecting',mode==='inside'&&shownState.livePhase==='inspect');
    trimFilms(shownState);
    // Prime only the next nearby chapter; the first paint has no cinematic
    // download dependency and idle chapters have neither playback nor rAF.
    const f=catalogue.films[filmOrientation()];
    if(!staticStudy&&p>.28&&p<.48)film(theme()==='dark'&&f.drive.dark?f.drive.dark:f.drive,'drive-'+filmOrientation()+'-'+theme());
    if(!staticStudy&&p>.65&&p<.83)film(f.robot,'robot-'+filmOrientation());
  }
  function seekChapter(chapter,{historyEntry=true,smoothScroll=true}={}){
    if(measureNeeded)measure();
    const p=chapterDestination(chapter);
    let y=chapter==='hero'?0:geometry.start+p*(geometry.end-geometry.start);
    if(flow.matches||staticMode()){
      if(chapter==='hero')y=0;
      else y=geometry.seats[chapter].top-geometry.header-12;
    }
    if(historyEntry)history.pushState({...history.state,scrollX:0,scrollY:y},'',chapter==='hero'?'#top':'#project-'+chapter);
    ownedDestination=y;root.setAttribute('data-scroll-owned-active','');
    window.scrollTo({top:y,behavior:reduced.matches||!smoothScroll?'instant':'smooth'});
    if(flow.matches||staticMode())focusDestination({copy:chapter});
    request();
  }
  function chooseMode(next,{navigate=true}={}){
    if(liveFailed){viewer?.dispose();viewer=null;liveFailed=false;liveReady=false;}
    mode=next;if(mode==='tune')controlled=true;panel.dataset.studyMode=mode;
    panel.closest('.study-matcher').classList.toggle('study-is-operating',mode!=='machine');
    panel.querySelectorAll('[data-study-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studyMode===mode)));
    panel.querySelectorAll('[data-study-mode-panel]').forEach(node=>node.hidden=node.dataset.studyModePanel!==mode);
    const toggle=panel.querySelector('[data-instrument-toggle]');
    if((mode==='tune')!==(toggle.getAttribute('aria-expanded')==='true'))toggle.click();
    status.textContent=mode==='tune'?'The modeled tuner controls the two capacitor shafts.':mode==='inside'?'Select a component to inspect its role.':'Complete impedance matcher.';
    lastLiveState='';measureNeeded=true;request();retain();
    if(navigate&&geometry&&!flow.matches&&!staticMode()&&(progress()<.18||progress()>.39))seekChapter('matcher',{historyEntry:false});
    if(navigate&&geometry&&(flow.matches||staticMode())&&mode!=='machine')seekChapter('matcher',{historyEntry:false});
    if(viewer&&currentCamera){viewer.pause(false);updateLive(currentCamera,studyTimeline(chapterDestination('matcher')),false);}
  }
  panel.querySelector('.study-modes').hidden=false;mountInstrument({initialPositions:values});
  panel.querySelectorAll('[data-study-mode]').forEach(button=>button.addEventListener('click',()=>chooseMode(button.dataset.studyMode),{signal}));
  function selectPart(next){
    part=next;panel.querySelectorAll('[data-study-part]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studyPart===part)));
    surface.querySelectorAll('[data-study-marker]').forEach(marker=>marker.classList.toggle('is-selected',marker.dataset.studyMarker===part));
    panel.querySelectorAll('[data-study-detail]').forEach(node=>node.hidden=node.dataset.studyDetail!==part);
    lastLiveState='';request();retain();
  }
  panel.querySelectorAll('[data-study-part]').forEach(button=>button.addEventListener('click',()=>selectPart(button.dataset.studyPart),{signal}));
  surface.querySelectorAll('[data-study-marker]').forEach(button=>{
    button.addEventListener('pointerdown',event=>event.preventDefault(),{signal});
    button.addEventListener('click',()=>{
      selectPart(button.dataset.studyMarker);
      panel.querySelector('[data-study-part="'+button.dataset.studyMarker+'"]')?.focus({preventScroll:true});
    },{signal});
  });
  document.addEventListener('portfolio:matcher-state',event=>{values={m1:event.detail.m1,m2:event.detail.m2};retain();request();},{signal});
  chooseMode(mode,{navigate:false});selectPart(part);
  const ownsClick=event=>event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey;
  function go(event,chapter){if(!ownsClick(event))return;event.preventDefault();if(event.detail===0)pendingFocus=chapter;seekChapter(chapter);}
  links.forEach(link=>link.addEventListener('click',event=>go(event,link.dataset.studyChapterLink),{signal}));
  const explore=hero.querySelector('a[href="#project-matcher"]');
  explore?.setAttribute('data-scroll-owned','');
  explore?.addEventListener('click',event=>go(event,'matcher'),{signal});
  document.querySelectorAll('a[href="#top"]').forEach(link=>{link.setAttribute('data-scroll-owned','');link.addEventListener('click',event=>go(event,'hero'),{signal});});
  const restoreHash=()=>{const chapter=location.hash==='#top'?'hero':location.hash.replace('#project-','');if(['hero','matcher','vehicle','robot'].includes(chapter))seekChapter(chapter,{historyEntry:false});};
  window.addEventListener('hashchange',restoreHash,{signal});
  document.addEventListener('portfolio:study-hash',event=>{
    const chapter=event.detail.hash.replace('#project-','');
    if(!['matcher','vehicle','robot'].includes(chapter))return;
    root.setAttribute('data-scroll-owned-active','');
    if(!catalogue){pendingChapter=chapter;return;}
    seekChapter(chapter,{historyEntry:false,smoothScroll:event.detail.smooth});
  },{signal});
  const interruptNavigation=()=>{ownedDestination=null;pendingFocus=null;root.removeAttribute('data-scroll-owned-active');};
  window.addEventListener('wheel',interruptNavigation,{passive:true,signal});window.addEventListener('touchstart',interruptNavigation,{passive:true,signal});
  window.addEventListener('keydown',event=>{if(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(event.key))interruptNavigation();},{signal});
  window.addEventListener('scroll',()=>{const now=performance.now();if(now-lastScrollTime>250)lastMediaTime=0;lastScrollTime=now;request();},{passive:true,signal});
    const configure=()=>{
      root.classList.toggle('study-is-enhanced',!staticMode());root.classList.toggle('study-is-flow',flow.matches||staticMode());
      if(flow.matches||staticMode())sections.forEach(node=>{node.hidden=false;node.inert=false;});
      measureNeeded=true;request();
    };
  const resize=()=>{measureNeeded=true;lastLiveState='';request();};
  window.addEventListener('resize',resize,{passive:true,signal});
  flow.addEventListener('change',configure,{signal});reduced.addEventListener('change',configure,{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;viewer?.pause(true);films.forEach(r=>r.player?.pause(true));}else request();},{signal});
  const themeObserver=new MutationObserver(()=>{lastLiveState='';request();});themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(root);resizeObserver.observe(panel);
  fetch('/assets/studies/home-motion/catalogue.json',{signal}).then(r=>{if(!r.ok)throw Error('Study assets unavailable');return r.json();}).then(value=>{catalogue=value;configure();if(pendingChapter){seekChapter(pendingChapter,{historyEntry:false,smoothScroll:false});pendingChapter=null;}else restoreHash();}).catch(()=>{if(signal.aborted)return;recover();if(pendingChapter){seekChapter(pendingChapter,{historyEntry:false,smoothScroll:false});pendingChapter=null;}});
  cleanup=()=>{
    disposed=true;activeRoot=null;abort.abort();if(raf)cancelAnimationFrame(raf);raf=0;
    root.removeAttribute('data-scroll-owned-active');
    viewer?.dispose();films.forEach(record=>record.player?.dispose());films.clear();
    themeObserver.disconnect();resizeObserver.disconnect();surface.hidden=true;
    images.forEach(image=>{image.onload=null;image.onerror=null;});
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
document.addEventListener('astro:page-load',init);
document.addEventListener('astro:before-preparation',()=>cleanup());
