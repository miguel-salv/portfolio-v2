let cleanup=()=>{};
function initMatcherExhibit(){
  cleanup();
  const root=document.querySelector('[data-matcher-exhibit]');if(!root)return;
  const abort=new AbortController(),{signal}=abort;
  const visual=root.querySelector('[data-matcher-visual]');
  const model=root.querySelector('[data-matcher-model]');
  const mount=root.querySelector('[data-matcher-canvas]');
  const render=root.querySelector('[data-matcher-render]');
  const lab=root.querySelector('[data-matcher-lab]');
  const callouts=root.querySelector('[data-matcher-callouts]');
  const angles=root.querySelector('[data-matcher-angles]');
  const caption=root.querySelector('[data-matcher-caption]');
  const modes=[...root.querySelectorAll('[data-matcher-mode]')];
  const buttons=[...root.querySelectorAll('[data-matcher-part]')];
  const panels=[...root.querySelectorAll('[data-matcher-panel]')];
  const journey=root.closest('[data-journey]');
  const toggle=root.querySelector('[data-instrument-toggle]');
  const live=root.querySelector('[data-matcher-live]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let viewer=null,loading=false,visible=false,mode='machine',part='capacitors',progress=0;
  let values={m1:72,m2:108};
  const captionText={machine:'Two capacitors. One control loop.',inside:'Follow the hardware. Select a component.',tune:'Capacitor positions follow the modeled tuning loop.',lab:'The real matcher, deployed at CMU Hacker Fab.'};
  root.querySelector('[data-matcher-modes]').hidden=false;
  function update(){viewer?.update({mode,part,...values,progress});}
  function anchorPoints(points){
    const labels={capacitors:[7,19],motors:[73,63],control:[7,85]};
    for(const [name,point] of Object.entries(points)){
      const leader=root.querySelector(`[data-leader="${name}"]`);const [x,y]=labels[name];
      leader?.setAttribute('d',`M${x} ${y}L${point[0].toFixed(2)} ${y}L${point[0].toFixed(2)} ${point[1].toFixed(2)}`);
    }
  }
  async function loadViewer(explicit=false){
    if(viewer||loading||(!explicit&&(reduced.matches||navigator.connection?.saveData)))return;
    loading=true;
    try{
      const {createMatcherModel}=await import('./matcher-model.js');
      if(signal.aborted)return;
      const next=await createMatcherModel(mount,{signal,onAnchors:anchorPoints});
      if(signal.aborted){next?.dispose();return;}
      viewer=next;viewer?.pause(!visible||mode==='lab');update();
      model.classList.toggle('is-live',Boolean(viewer));
    }catch(error){
      if(!signal.aborted){root.dataset.renderer='fallback';live.textContent='The rendered inspection view is available. Tuner controls still work.';}
    }finally{loading=false;}
  }
  function selectPart(next){
    part=next;
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.matcherPart===part)));
    root.querySelectorAll('[data-matcher-detail]').forEach(detail=>detail.hidden=detail.dataset.matcherDetail!==part);
    update();
    if(mode==='inside')live.textContent=root.querySelector(`[data-matcher-detail="${part}"] h4`)?.textContent||'';
  }
  function showMode(next,{announce=true}={}){
    if(!captionText[next])return;
    if(mode==='tune'&&next!=='tune'&&toggle?.getAttribute('aria-expanded')==='true')toggle.click();
    mode=next;root.dataset.mode=mode;
    modes.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.matcherMode===mode)));
    panels.forEach(panel=>panel.hidden=panel.dataset.matcherPanel!==mode);
    model.hidden=mode==='lab';lab.hidden=mode!=='lab';callouts.hidden=mode!=='inside';angles.hidden=mode!=='tune';
    caption.textContent=captionText[mode];
    render.src=mode==='inside'||mode==='tune'?'/assets/matcher/inside.webp':'/assets/matcher/overview.webp';
    if(mode==='tune'&&toggle?.getAttribute('aria-expanded')!=='true')toggle.click();
    viewer?.pause(!visible||mode==='lab');update();
    if(mode==='inside'||mode==='tune')loadViewer(true);
    if(announce)live.textContent=captionText[mode];
  }
  modes.forEach(button=>button.addEventListener('click',()=>showMode(button.dataset.matcherMode),{signal}));
  buttons.forEach(button=>button.addEventListener('click',()=>selectPart(button.dataset.matcherPart),{signal}));
  document.addEventListener('portfolio:matcher-state',event=>{
    values={m1:event.detail.m1,m2:event.detail.m2};
    root.querySelector('[data-matcher-c1]').textContent=`${Math.round(values.m1)}°`;
    root.querySelector('[data-matcher-c2]').textContent=`${Math.round(values.m2)}°`;update();
  },{signal});
  document.addEventListener('portfolio:journey-progress',event=>{
    if(event.detail.id!=='matcher'){
      if(mode==='tune')showMode('machine',{announce:false});
      viewer?.pause(true);return;
    }
    progress=event.detail.local;
    viewer?.pause(!visible||mode==='lab');update();
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
    viewer?.pause(!visible||mode==='lab'||document.hidden);
    if(visible&&mode!=='lab')loadViewer();
  },{rootMargin:'120px 0px'});observer.observe(visual);
  document.addEventListener('visibilitychange',()=>viewer?.pause(document.hidden||!visible||mode==='lab'),{signal});
  reduced.addEventListener('change',update,{signal});
  if(location.hash==='#instrument-bench')requestAnimationFrame(openTunerHash);
  cleanup=()=>{abort.abort();observer.disconnect();viewer?.dispose();};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initMatcherExhibit,{once:true});else initMatcherExhibit();
document.addEventListener('astro:page-load',initMatcherExhibit);
document.addEventListener('astro:before-preparation',()=>cleanup());
