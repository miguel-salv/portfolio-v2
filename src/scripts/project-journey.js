const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const compact = window.matchMedia('(max-width: 900px)');
const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
let cleanup = () => {};

function initJourney() {
  cleanup();
  const root = document.querySelector('[data-journey]');
  if (!root) return;
  const abort = new AbortController();
  const { signal } = abort;
  const track = root.querySelector('.project-journey-track');
  const stage = root.querySelector('.project-journey-stage');
  const intro = root.querySelector('.journey-intro');
  const poster = root.querySelector('[data-journey-poster]');
  const videos = [...root.querySelectorAll('[data-journey-video]')];
  const buttons = [...root.querySelectorAll('[data-scene]')];
  const chapters = [...root.querySelectorAll('[data-journey-chapter]')].map(node => ({
    node, id: node.dataset.journeyChapter, duration: Number(node.dataset.duration),
    proofs: [...node.querySelectorAll('.moment-proof')], ends: [], side: node.dataset.journeyChapter === 'vehicle' ? 'right' : 'left',
  }));
  let current = 0, target = 0, raf = 0, generation = 0, active = -1, near = true;
  const introEnd = .065;
  const total = chapters.reduce((sum,c) => sum+c.duration,0);
  const stateAt = progress => {
    let start = introEnd;
    for (let i=0;i<chapters.length;i++) {
      const span = (1-introEnd)*chapters[i].duration/total;
      if (progress < start+span || i === chapters.length-1) return { index:i, local:clamp((progress-start)/span) };
      start += span;
    }
  };
  const variant = () => compact.matches ? 'portrait' : 'landscape';
  const asset = (chapter, extension) => `/assets/stories/moments/${chapter.id}-${variant()}${extension}`;
  const codec = document.createElement('video').canPlayType('video/webm; codecs="vp9"') ? '.webm' : '.mov';
  const staticMode = reduced.matches;
  root.classList.toggle('is-static',staticMode);
  root.classList.add('is-enhanced');

  function seek(video, local) {
    if (!Number.isFinite(video.duration) || video.readyState < 2) return;
    video.dataset.wantedTime = String(Math.min(video.duration-1/30,local*video.duration));
    if (!video.seeking && Math.abs(video.currentTime-Number(video.dataset.wantedTime)) > 1/35) {
      video.currentTime=Number(video.dataset.wantedTime);
    }
  }
  function load(video, chapter) {
    const src=asset(chapter,codec);
    if (video.dataset.source===src) return video._loading || Promise.resolve();
    video.dataset.source=src;
    video.dataset.ready='';
    video.dataset.failed='';
    video.dataset.chapter=chapter.id;
    video._loading = new Promise(resolve => {
      let timer;
      const done = () => { clearTimeout(timer); video.removeEventListener('loadeddata',ready); video.removeEventListener('error',failed); resolve(); };
      const ready = () => { video.dataset.ready='1'; done(); };
      const failed = () => { video.dataset.failed='1'; done(); };
      video.addEventListener('loadeddata',ready,{once:true});
      video.addEventListener('error',failed,{once:true});
      timer=setTimeout(failed,12000);
      video.preload='auto'; video.src=src; video.load();
      signal.addEventListener('abort',done,{once:true});
    });
    return video._loading;
  }
  videos.forEach(video => video.addEventListener('seeked',() => {
    const wanted=Number(video.dataset.wantedTime);
    if (Number.isFinite(wanted) && Math.abs(video.currentTime-wanted)>1/35) video.currentTime=wanted;
  },{signal}));

  function present(index, local) {
    if (!near || staticMode) return;
    const chapter=chapters[index];
    const selected=videos[index%2];
    if (active!==index || selected.dataset.source!==asset(chapter,codec)) {
      active=index;
      const token=++generation;
      poster.src=asset(chapter,'-poster.webp');
      // Hold the decoded outgoing frame until the incoming asset is ready.
      load(selected,chapter).then(() => {
        if (signal.aborted || token!==generation) return;
        if (selected.dataset.failed) { videos.forEach(v=>v.classList.remove('is-front')); root.classList.remove('has-video'); return; }
        seek(selected,stateAt(current).local);
        videos.forEach(v=>v.classList.toggle('is-front',v===selected)); root.classList.add('has-video');
      });
    }
    if (selected.dataset.ready) seek(selected,local);
    if (local>.65 && index+1<chapters.length) load(videos[(index+1)%2],chapters[index+1]);
  }
  function paint() {
    const { index,local }=stateAt(current);
    const isIntro=current<introEnd*.8;
    root.classList.toggle('is-intro',isIntro);
    intro.inert=!isIntro && !staticMode;
    root.dataset.activeChapter=chapters[index].id;
    root.dataset.textSide=chapters[index].side;
    root.style.setProperty('--chapter-progress',local.toFixed(4));
    // Both neighboring compositions share a short, visible settling interval.
    root.style.setProperty('--scene-opacity',String(.45+.55*Math.min(1,local/.035,(1-local)/.035)));
    chapters.forEach((c,i)=> {
      const shown=staticMode || (i===index&&!isIntro);
      c.node.classList.toggle('is-active',shown); c.node.inert=!shown;
      const step=c.ends.length ? Math.min(c.ends.findIndex(end=>local<end) < 0 ? c.proofs.length-1 : c.ends.findIndex(end=>local<end),c.proofs.length-1) : Math.min(c.proofs.length-1,Math.floor(local*c.proofs.length));
      c.proofs.forEach((proof,j)=>{
        const visible=staticMode || j===step;
        proof.classList.toggle('is-active',visible);
        proof.setAttribute('aria-hidden',String(!visible));
      });
    });
    buttons.forEach((button,i)=>button.setAttribute('aria-current',String(i===index&&!isIntro)));
    present(index,local);
  }
  function tick() {
    current += (target-current)*.22;
    if (Math.abs(target-current)<.0003) current=target;
    paint();
    raf=current===target ? 0 : requestAnimationFrame(tick);
  }
  function sync(immediate = false) {
    if (staticMode) return;
    const travel=Math.max(1,track.offsetHeight-stage.offsetHeight);
    const top=parseFloat(getComputedStyle(stage).top)||0;
    target=clamp((top-track.getBoundingClientRect().top)/travel);
    if (immediate === true) current=target;
    if (!raf) raf=requestAnimationFrame(tick);
  }
  function jumpTo(index) {
    let start=introEnd;
    for(let i=0;i<index;i++)start+=(1-introEnd)*chapters[i].duration/total;
    if(staticMode) { chapters[index].node.scrollIntoView(); return; }
    const pin=parseFloat(getComputedStyle(stage).top)||0;
    const y=track.getBoundingClientRect().top+window.scrollY-pin+(start+.012)*(track.offsetHeight-stage.offsetHeight);
    current=target=start+.012;
    paint();
    window.scrollTo({top:y,behavior:'auto'});
  }
  buttons.forEach((button,index)=>button.addEventListener('click',()=>jumpTo(index),{signal}));
  root.querySelector('[data-start-story]')?.addEventListener('click',()=>jumpTo(0),{signal});
  const observer = new IntersectionObserver(entries=>{
    near=entries[0].isIntersecting;
    if(near)sync();
  },{rootMargin:'50% 0px'});
  observer.observe(root);
  fetch('/assets/stories/moments/moments-timeline.json',{signal}).then(r=>r.ok?r.json():null).then(data=>{
    chapters.forEach(c=>{
      const shots=data?.moments?.[c.id]?.shots;
      if(shots) { c.ends=shots.map(s=>s.progress[1]); c.side=shots[0]?.text_side||c.side; }
    });
    if(!signal.aborted)paint();
  }).catch(()=>{});
  window.addEventListener('scroll',sync,{passive:true,signal});
  window.addEventListener('resize',sync,{passive:true,signal});
  compact.addEventListener('change',()=>{active=-1;sync();},{signal});
  reduced.addEventListener('change',initJourney,{signal});
  if(staticMode)paint(); else sync(true);
  cleanup=()=>{
    abort.abort();observer.disconnect();cancelAnimationFrame(raf);generation++;
    root.classList.remove('has-video');
    videos.forEach(v=>{v.pause();v.classList.remove('is-front');delete v.dataset.source;delete v.dataset.ready;delete v.dataset.failed;delete v.dataset.wantedTime;v._loading=null;v.removeAttribute('src');v.load();});
  };
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initJourney,{once:true}); else initJourney();
document.addEventListener('astro:page-load',initJourney);
document.addEventListener('astro:before-preparation',()=>cleanup());
