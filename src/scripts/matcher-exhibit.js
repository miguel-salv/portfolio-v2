let cleanup=()=>{};
function initMatcherExhibit(){
  cleanup();
  const root=document.querySelector('[data-matcher-exhibit]');if(!root)return;
  const abort=new AbortController(),{signal}=abort;
  const visual=root.querySelector('[data-matcher-visual]');
  const model=root.querySelector('[data-matcher-model]');
  const mount=root.querySelector('[data-matcher-canvas]');
  const render=root.querySelector('[data-matcher-render]');
  const portrait=root.querySelector('[data-matcher-portrait]');
  const lab=root.querySelector('[data-matcher-lab]');
  const tuning=root.querySelector('[data-matcher-tuning]');
  const callouts=root.querySelector('[data-matcher-callouts]');
  const angles=root.querySelector('[data-matcher-angles]');
  const caption=root.querySelector('[data-matcher-caption]');
  const modes=[...root.querySelectorAll('[data-matcher-mode]')];
  const buttons=[...root.querySelectorAll('[data-matcher-part]')];
  const panels=[...root.querySelectorAll('[data-matcher-panel]')];
  const journey=root.closest('[data-journey]');
  const heroLinked=journey?.dataset.heroHandoff!==undefined;
  const toggle=root.querySelector('[data-instrument-toggle]');
  const live=root.querySelector('[data-matcher-live]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let viewer=null,loading=false,visible=false,mode='machine',part='capacitors',progress=0;
  let participating=true,apertureAnimation=null,heroReturn=null;
  let values={m1:72,m2:108};
  const captionText={machine:'Three capacitor stacks. One control loop.',inside:'Follow the hardware. Select a component.',tune:'Capacitor positions follow the modeled tuning loop.',lab:'The real matcher, deployed at CMU Hacker Fab.'};
  root.querySelector('[data-matcher-modes]').hidden=false;
  const portraitLead=.12;
  const smooth=value=>{const t=Math.min(1,Math.max(0,value));return t*t*t*(t*(t*6-15)+10);};
  const hasHeroSeat=()=>heroLinked&&!journey.classList.contains('is-static')&&!reduced.matches;
  function syncLiveSurface(){
    render.classList.remove('is-decoding','is-decoded');
    portrait?.classList.remove('is-decoding','is-decoded');
    let blend=1;
    if(heroLinked&&mode==='machine'){
      const t=hasHeroSeat()?Math.min(1,Math.max(0,(progress-.025)/(portraitLead-.025))):Number(progress>0);
      blend=smooth(t);
    }
    if(heroReturn)blend=1-smooth((heroReturn.blend-.65)/.35);
    model.style.setProperty('--matcher-live-blend',String(blend));
    model.classList.toggle('is-live',Boolean(viewer)&&blend>0);
    const usesPortrait=Boolean(portrait?.complete&&portrait.naturalWidth)&&(mode==='machine'||Boolean(heroReturn));
    model.classList.toggle('uses-portrait',usesPortrait);
    // Hidden is authoritative: an inactive portrait must never show through
    // the transparent live canvas, including while changing modes.
    if(portrait)portrait.hidden=!usesPortrait;
    render.style.opacity=usesPortrait||viewer?'0':'1';
  }
  function update(options={}){
    // Keep the live pose seated while the glossy portrait hands over its surface.
    const poseProgress=mode==='machine'&&hasHeroSeat()?smooth((progress-portraitLead)/(1-portraitLead)):progress;
    viewer?.update({mode,part,...values,progress:poseProgress},options);
    if(heroReturn)viewer?.returnToMachine(Math.min(1,heroReturn.blend/.65));
    syncLiveSurface();
  }
  function syncViewer(){viewer?.pause(!visible||!participating||document.hidden||mode==='lab'||mode==='tune');}
  function cancelAperture(){
    if(!apertureAnimation)return;
    const {node,animation}=apertureAnimation;
    apertureAnimation=null;animation.cancel();node.style.willChange='';
  }
  function revealAperture(node){
    cancelAperture();
    if(!node?.animate||reduced.matches||document.hidden)return;
    node.style.willChange='clip-path';
    const animation=node.animate([{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)'}],{duration:320,easing:'cubic-bezier(.16,1,.3,1)'});
    apertureAnimation={node,animation};
    Promise.resolve(animation.finished).catch(()=>{}).finally(()=>{
      if(apertureAnimation?.animation===animation){node.style.willChange='';apertureAnimation=null;}
    });
  }
  function anchorPoints(points){
    const labels={capacitors:[7,19],motors:[73,63],control:[7,85]};
    for(const [name,point] of Object.entries(points)){
      const leader=callouts.querySelector(`[data-leader="${name}"]`);const [x,y]=labels[name];
      leader?.setAttribute('d',`M${x} ${y}L${point[0].toFixed(2)} ${y}L${point[0].toFixed(2)} ${point[1].toFixed(2)}`);
    }
  }
  async function loadViewer(explicit=false){
    if(viewer||loading||(!explicit&&(reduced.matches||navigator.connection?.saveData)))return;
    loading=true;
    try{
      const {createMatcherModel}=await import('./matcher-model.js');
      if(signal.aborted)return;
      const next=await createMatcherModel(mount,{signal,onAnchors:anchorPoints,heroLinked});
      if(signal.aborted){next?.dispose();return;}
      viewer=next;syncViewer();update({scrub:true});
      document.dispatchEvent(new CustomEvent('portfolio:matcher-render-ready'));
    }catch(error){
      if(!signal.aborted){root.dataset.renderer='fallback';live.textContent='The rendered inspection view is available. Tuner controls still work.';}
    }finally{loading=false;}
  }
  function selectPart(next){
    if(!['capacitors','motors','control'].includes(next)||next===part)return;
    cancelHeroReturn();
    part=next;
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.matcherPart===part)));
    root.querySelectorAll('[data-matcher-detail]').forEach(detail=>detail.hidden=detail.dataset.matcherDetail!==part);
    update({duration:mode==='inside'?300:0});
    if(mode==='inside')live.textContent=root.querySelector(`[data-matcher-detail="${part}"] h4`)?.textContent||'';
  }
  function cancelHeroReturn(){
    const interrupted=Boolean(heroReturn);
    heroReturn=null;
    delete root.dataset.heroReturning;
    delete root.dataset.heroReturnProgress;
    delete root.dataset.heroReturnSurface;
    root.style.removeProperty('--matcher-return-opacity');
    callouts.inert=false;
    root.querySelector('.matcher-inspection').inert=false;
    if(interrupted)syncLiveSurface();
    return interrupted;
  }
  function showMode(next,{announce=true,duration=420}={}){
    if(!captionText[next])return;
    const interrupted=cancelHeroReturn();
    if(next===mode){if(interrupted)update({duration:300});return;}
    const previous=mode;
    cancelAperture();
    if(mode==='tune'&&next!=='tune'&&toggle?.getAttribute('aria-expanded')==='true')toggle.click();
    mode=next;root.dataset.mode=mode;
    visual.hidden=mode==='tune';
    tuning.hidden=mode!=='tune';
    modes.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.matcherMode===mode)));
    panels.forEach(panel=>panel.hidden=panel.dataset.matcherPanel!==mode);
    model.hidden=mode==='lab';lab.hidden=mode!=='lab';callouts.hidden=mode!=='inside';angles.hidden=mode!=='tune';
    caption.textContent=captionText[mode];
    render.src=mode==='inside'||mode==='tune'?'/assets/matcher/inside.webp':heroLinked?'/assets/workshop/hardware-portrait.webp':'/assets/matcher/overview.webp';
    if(mode==='tune'&&toggle?.getAttribute('aria-expanded')!=='true')toggle.click();
    syncViewer();update({duration:previous!==mode?duration:0});
    if(previous!==mode&&(mode==='tune'||mode==='lab'||previous==='tune'||previous==='lab'))revealAperture(mode==='tune'?tuning:mode==='lab'?lab:model);
    if(mode==='inside')loadViewer(true);
    if(announce)live.textContent=captionText[mode];
  }
  modes.forEach(button=>button.addEventListener('click',()=>showMode(button.dataset.matcherMode),{signal}));
  buttons.forEach(button=>button.addEventListener('click',()=>selectPart(button.dataset.matcherPart),{signal}));
  document.addEventListener('portfolio:hero-matcher-progress',event=>{
    if(!heroLinked)return;
    const {distance,scrollingUp,inactive,scroll=window.scrollY}=event.detail;
    if(inactive||document.hidden){if(cancelHeroReturn())update({scrub:true});return;}
    if(mode!=='inside')return;
    if(!heroReturn){
      if(!scrollingUp||distance>520)return;
      if(scroll<=0){showMode('machine',{announce:false,duration:0});return;}
      // Starting Inside during the opening handoff gets a continuous return too.
      const end=distance>0?scroll-distance:Math.max(0,scroll-360);
      heroReturn={start:scroll,end,blend:0};
      root.dataset.heroReturning='true';
      callouts.inert=true;
      root.querySelector('.matcher-inspection').inert=true;
    }
    const blend=Math.min(1,Math.max(0,(heroReturn.start-scroll)/Math.max(1,heroReturn.start-heroReturn.end)));
    heroReturn.blend=blend;
    // Scroll owns this pose, including a reversal or a jump through the boundary.
    viewer?.returnToMachine(Math.min(1,blend/.65));
    // Recover the matching lens and pose first; fade aligned surfaces afterward.
    const surfaceBlend=smooth((blend-.65)/.35);
    root.dataset.heroReturnProgress=String(smooth(blend));
    root.dataset.heroReturnSurface=String(viewer?1-surfaceBlend:0);
    syncLiveSurface();
    root.style.setProperty('--matcher-return-opacity',String(Math.max(0,1-blend*2)));
    if(blend>=1)showMode('machine',{announce:false,duration:0});
    else if(scroll>heroReturn.start+80){cancelHeroReturn();update({scrub:true});}
  },{signal});
  document.addEventListener('portfolio:matcher-state',event=>{
    values={m1:event.detail.m1,m2:event.detail.m2};
    root.querySelector('[data-matcher-c1]').textContent=`${Math.round(values.m1)}°`;
    root.querySelector('[data-matcher-c2]').textContent=`${Math.round(values.m2)}°`;update();
  },{signal});
  document.addEventListener('portfolio:journey-progress',event=>{
    participating=event.detail.participants?event.detail.participants.includes('matcher'):event.detail.id==='matcher';
    if(!participating){
      cancelAperture();
      if(cancelHeroReturn())update({scrub:true});
      if(mode==='tune')showMode('machine',{announce:false});
      viewer?.pause(true);return;
    }
    const nextProgress=event.detail.locals?.matcher??event.detail.local;
    const changed=nextProgress!==progress;
    progress=nextProgress;
    syncViewer();
    // Rest notifications and film decoding use the same scroll coordinate.
    // They must not interrupt an explicit camera selection or redraw a parked
    // matcher during a hardware boundary. Only new scroll input owns the pose.
    if(changed&&mode==='machine')update({scrub:true});
  },{signal});
  // Preserve old tuner anchors from the command palette and saved links.
  const openTunerHash=()=>{if(location.hash==='#instrument-bench'){
    document.dispatchEvent(new CustomEvent('portfolio:journey-hash',{detail:{id:'matcher'}}));showMode('tune');
  }};
  window.addEventListener('hashchange',openTunerHash,{signal});
  document.addEventListener('click',event=>{
    const a=event.target instanceof Element?event.target.closest('a[href]'):null;
    if(a&&new URL(a.href).hash==='#instrument-bench'&&new URL(a.href).pathname===location.pathname)openTunerHash();
  },{signal});
  const observer=new IntersectionObserver(entries=>{
    visible=entries.some(entry=>entry.isIntersecting);
    syncViewer();
    if(visible&&mode!=='lab'&&mode!=='tune')loadViewer();
  },{rootMargin:'120px 0px'});observer.observe(root.querySelector('.matcher-aperture'));
  portrait?.addEventListener('load',()=>{syncLiveSurface();document.dispatchEvent(new CustomEvent('portfolio:matcher-render-ready'));},{signal});
  syncLiveSurface();
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAperture();if(cancelHeroReturn())update({scrub:true});}syncViewer();},{signal});
  reduced.addEventListener('change',()=>{cancelAperture();cancelHeroReturn();update({scrub:true});},{signal});
  window.addEventListener('resize',()=>{cancelAperture();cancelHeroReturn();update({scrub:true});},{signal,passive:true});
  if(location.hash==='#instrument-bench')requestAnimationFrame(openTunerHash);
  cleanup=()=>{abort.abort();cancelAperture();cancelHeroReturn();observer.disconnect();viewer?.dispose();};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initMatcherExhibit,{once:true});else initMatcherExhibit();
document.addEventListener('astro:page-load',initMatcherExhibit);
document.addEventListener('astro:before-preparation',()=>cleanup());
