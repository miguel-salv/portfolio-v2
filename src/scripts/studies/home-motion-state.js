// The same scroll coordinate describes artwork, copy, and ownership. Media
// readiness changes the displayed surface, never the page's scroll position.
export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
export const smooth = value => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
const range = (value, start, end) => clamp((value - start) / (end - start));

export const STUDY_MARKS = Object.freeze({
  pushStart: .015, pushEnd: .18, matcherEnd: .39, wheelCut: .50,
  vehicleStop: .585, vehicleCopyStart: .57, vehicleCopyEnd: .655, vehicleGo: .665,
  robotCut: .72, robotCopyStart: .79, end: 1,
});

// The car pulls out (45-95), waits under its copy (95-100), then leaves
// (100-119). Scroll stays linear within each part.
const VEHICLE_SPANS = [[45,95,'wheelCut','vehicleStop'],[95,100,'vehicleStop','vehicleGo'],[100,119,'vehicleGo','robotCut']];
const vehicleFrame = p => {
  const m=STUDY_MARKS,[a,b,start,end]=VEHICLE_SPANS.find(([,,,end])=>p<m[end])||VEHICLE_SPANS[2];
  return a+(b-a)*range(p,m[start],m[end]);
};
const vehicleProgress = frame => {
  const m=STUDY_MARKS,[a,b,start,end]=VEHICLE_SPANS.find(([,b])=>frame<=b)||VEHICLE_SPANS[2];
  return m[start]+(m[end]-m[start])*clamp((frame-a)/(b-a));
};

export function studyTimeline(progress) {
  const p = clamp(progress), m = STUDY_MARKS;
  if (p < m.pushEnd) return {
    progress:p, chapter:'hero', copy:p < .10 ? 'hero' : null,
    film:'hero-push', frame:48 * range(p,m.pushStart,m.pushEnd),
    matcher:true, camera:'bench', livePhase:'opening',
  };
  if (p < m.matcherEnd) return {
    progress:p, chapter:'matcher', copy:'matcher', film:'hero-push', frame:48,
    matcher:true, camera:'bench', livePhase:'inspect',
  };
  if (p < m.wheelCut) return {
    progress:p, chapter:'matcher', copy:null, film:'shaft-to-drive',
    frame:44 * range(p,m.matcherEnd,m.wheelCut), matcher:true,
    camera:'shaft', livePhase:'departure',
  };
  if (p < m.robotCut) return {
    progress:p, chapter:'vehicle', copy:p >= m.vehicleCopyStart && p <= m.vehicleCopyEnd ? 'vehicle' : null,
    film:'shaft-to-drive', frame:vehicleFrame(p),
    matcher:false, camera:'vehicle', livePhase:null,
  };
  return {
    progress:p, chapter:'robot', copy:p >= m.robotCopyStart ? 'robot' : null,
    film:'bottle-collect', frame:119 * range(p,m.robotCut,1),
    matcher:false, camera:'robot', livePhase:null,
  };
}

export function chapterDestination(chapter) {
  return ({hero:0, matcher:.245, vehicle:.62, robot:.865})[chapter] ?? 0;
}

// Authored shots keep the offline material finish. Variable inspection or a
// remembered capacitor pose requires the mechanism, including at the opening.
export function shouldLoadStudyMechanism({mode='machine',controlled=false}={}) {
  return mode!=='machine'||controlled;
}

// A completed decode owns its corresponding camera, annotations and pose.
// Scroll can already request a newer frame without relabeling these pixels.
export function displayedFilmTimeline(state,frame){
  const m=STUDY_MARKS;
  if(state.film==='shaft-to-drive'){
    const beforeCut=frame<45;
    const p=beforeCut?m.matcherEnd+(m.wheelCut-m.matcherEnd)*clamp(frame/44):vehicleProgress(frame);
    return {...studyTimeline(Math.min(p,(beforeCut?m.wheelCut:m.robotCut)-1e-9)),frame};
  }
  return {...studyTimeline(m.robotCut+(1-m.robotCut)*clamp(frame/119)),frame};
}

export function canPresentStudyFrame(state,frame){
  if(!Number.isFinite(frame)||frame<0||Math.abs(frame-state.frame)>8)return false;
  return state.film!=='shaft-to-drive'||((frame<45)===state.matcher);
}

export function matcherPresentation(state,{mode,part,values,controlled,camera,departureAssembly}){
  let shownMode=mode,assembly=0;
  if(state.livePhase==='opening')shownMode='machine';
  if(state.livePhase==='departure'){
    shownMode='machine';assembly=clamp(departureAssembly??(mode==='inside'?1:0))*(1-smooth(range(state.progress,.39,.435)));
  }
  return {mode:shownMode,part,...values,progress:assembly,
    cameraFrame:controlled?{...camera,rotorOffset:[0,0]}:camera};
}

export function interpolateCamera(frames, frame) {
  if (!frames?.length) return null;
  const index=clamp(frame,0,frames.length-1), first=Math.floor(index), last=Math.min(first+1,frames.length-1), t=index-first;
  const a=frames[first].camera || frames[first], b=frames[last].camera || frames[last];
  const mix=(x,y)=>x+(y-x)*t;
  const vector=key=>a[key]?.map((x,i)=>mix(x,(b[key]||a[key])[i]));
  return {position:vector('position'),target:vector('target') || [0,0,0],projectedOrigin:vector('projectedOrigin'),near:a.near??.008,
    bounce:a.bounce?{...a.bounce,power:mix(a.bounce.power,b.bounce?.power??a.bounce.power)}:null,rotorOffset:vector('rotorOffset')||[0,0],
    span:mix(a.span,b.span), resolution:a.resolution,
    matcherFilmFrame:a.matcherFilmFrame ? Object.fromEntries(Object.keys(a.matcherFilmFrame).map(key=>[key,mix(a.matcherFilmFrame[key],b.matcherFilmFrame?.[key]??a.matcherFilmFrame[key])])) : undefined,
    horizontalSpan:a.horizontalSpan !== undefined ? mix(a.horizontalSpan,b.horizontalSpan) : undefined,
    verticalSpan:a.verticalSpan !== undefined ? mix(a.verticalSpan,b.verticalSpan) : undefined};
}

// A movie is object-fit:cover. The live camera gets exactly the same crop,
// instead of fitting the machine independently and creating a second outline.
export function cameraForViewport(camera, source, viewport) {
  const cover=Math.max(viewport.width/source.width,viewport.height/source.height);
  const spanX=camera.horizontalSpan ?? camera.span*Math.min(1,source.width/source.height);
  const spanY=camera.verticalSpan ?? camera.span*Math.min(1,source.height/source.width);
  return {...camera, spanX:spanX*viewport.width/(source.width*cover),spanY:spanY*viewport.height/(source.height*cover)};
}

// The dive is a perspective push the live (orthographic) matcher cannot
// follow, so the rendered film owns the whole departure.
export function selectStudyOwner({matcher, livePhase = null, liveReady, emptyReady, filmReady, posterReady = true, current = 'poster'}) {
  if (matcher && livePhase !== 'departure' && liveReady && emptyReady) return 'live';
  if (filmReady) return 'film';
  return posterReady ? 'poster' : current;
}
