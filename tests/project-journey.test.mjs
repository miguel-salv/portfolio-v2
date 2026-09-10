import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const code = readFileSync(new URL('../src/scripts/project-journey.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
class Node extends EventTarget {
  dataset = {}; attrs = {}; inert = false; src = '';
  animations = [];
  classList = { tokens:new Set(), add:(...t)=>t.forEach(x=>this.classList.tokens.add(x)), remove:(...t)=>t.forEach(x=>this.classList.tokens.delete(x)), contains:t=>this.classList.tokens.has(t), toggle:(t,on)=>on ? this.classList.tokens.add(t) : this.classList.tokens.delete(t) };
  style = { transform:'', opacity:'', clipPath:'', willChange:'', props:{}, setProperty(key,value){ this.props[key]=String(value); } };
  setAttribute(key,value) { this.attrs[key]=value; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  removeAttribute(key) { delete this.attrs[key]; if(key==='src')this.src=''; }
  querySelectorAll() { return []; }
  closest(selector) { return selector === '[inert]' && this.inert ? this : null; }
  focus() { this.focused = true; }
  blur() { this.focused = false; }
  getBoundingClientRect() { return { top:0, bottom:800 }; }
  scrollIntoView() { this.scrolledIntoView = true; }
  click() { this.dispatchEvent(new Event('click')); }
  animate(keyframes, options) {
    const animation = { keyframes, options, playState:'running', finished:Promise.resolve(), cancel(){ this.playState='cancelled'; }, finish(){ this.playState='finished'; } };
    this.animations.push(animation);
    return animation;
  }
}
class Video extends Node {
  readyState=0; duration=3; currentTime=0; seeking=false; loads=0; hold=false; fail=false; release=null; playing=false; playbackRate=1;
  pause() { this.playing=false; }
  play() { this.playing=true; return Promise.resolve(); }
  load() {
    this.loads++;
    this.readyState=0;
    const src=this.src;
    const finish=()=>{ if(this.src!==src)return; this.readyState=4; this.dispatchEvent(new Event(this.fail?'error':'loadeddata')); };
    if(this.hold){ this.release=finish; return; }
    queueMicrotask(finish);
  }
  canPlayType() { return 'probably'; }
}
function setup({reduce=false,compact=false,fail=false,hidden=false}={}) {
  const root=new Node(), intro=new Node(), introStill=new Node(), introLoop=new Video();
  introStill.getBoundingClientRect=()=>({top:400,bottom:800});
  let y=0;
  const videos=[];
  const poster=new Node();
  const chapters=['matcher','vehicle','robot'].map((id)=>{
    const chapter=new Node();
    chapter.id=`project-${id}`;
    chapter.dataset={journeyChapter:id,duration:'1',textSide:id==='vehicle'?'right':'left'};
    chapter.still=new Node();
    chapter.loop=new Video();
    chapter.querySelector=s=>{
      if(s==='.project-journey-still') return chapter.still;
      if(s==='[data-journey-loop]') return chapter.loop;
      return null;
    };
    chapter.querySelectorAll=()=>[];
    return chapter;
  });
  chapters.forEach((chapter)=>{
    chapter.scrollIntoView=()=>{
      chapters.forEach((other)=>{ other.scrolledIntoView=false; });
      chapter.scrolledIntoView=true;
    };
    chapter.getBoundingClientRect=()=>chapter.scrolledIntoView
      ? {top:80,bottom:700}
      : {top:2000,bottom:2800};
    chapter.still.getBoundingClientRect=()=>chapter.getBoundingClientRect();
  });
  chapters[0].scrolledIntoView=true;
  const pair=[new Video(),new Video()]; pair.forEach(v=>v.fail=fail); videos.push(...pair);
  const stage=new Node(); stage.offsetHeight=900;
  const track=new Node();
  track.dataset={journeyTrack:'duplex',textSide:'left'};
  track.offsetHeight=9000;
  track.getBoundingClientRect=()=>({top:-y});
  track.querySelector=s=>({
    '.project-journey-stage':stage,
    '.journey-intro':intro,
    '.journey-intro-still':introStill,
    '[data-intro-loop]':introLoop,
    '[data-journey-poster]':poster,
  })[s];
  track.querySelectorAll=s=>({
    '[data-journey-video]':pair,
    '[data-journey-chapter]':chapters,
  })[s]||[];
  const buttons=chapters.map(c=>{const b=new Node();b.dataset.scene=c.dataset.journeyChapter;return b;});
  const startStory=new Node();
  const tuner=new Node();
  tuner.setAttribute('aria-expanded','false');
  tuner.addEventListener('click',()=>{
    const open=tuner.getAttribute('aria-expanded')!=='true';
    tuner.setAttribute('aria-expanded',String(open));
    if(open) root.classList.add('is-tuning');
    else root.classList.remove('is-tuning');
  });
  root.querySelector=s=>({
    '.journey-intro':intro,
    '[data-start-story]':startStory,
    '.project-journey-track':track,
    '[data-instrument-toggle]':tuner,
  })[s];
  root.querySelectorAll=s=>({
    '.project-journey-track':[track],
    '[data-scene]':buttons,
    '[data-journey-video]':videos,
    '[data-journey-chapter]':chapters,
  })[s]||[];
  const document=new EventTarget();document.readyState='complete';document.hidden=hidden;document.querySelector=()=>root;document.createElement=()=>new Video();
  const window=new EventTarget();window.scrollY=0;window.innerHeight=900;window.location={hash:''};
  const queries=new Map();window.matchMedia=q=>{if(!queries.has(q)){const e=new EventTarget();e.matches=q.includes('reduce')?reduce:q.includes('max-width: 900px')?compact:false;queries.set(q,e);}return queries.get(q);};
  window.scrollTo=({top})=>{y=top;window.scrollY=y;window.dispatchEvent(new Event('scroll'));};
  let scrollActive=0;
  const add=window.addEventListener.bind(window);
  window.addEventListener=(type,fn,opts)=>{
    if(type==='scroll'){
      scrollActive++;
      const signal=opts&&typeof opts==='object'?opts.signal:null;
      signal?.addEventListener('abort',()=>{scrollActive--;},{once:true});
    }
    return add(type,fn,opts);
  };
  let id=0; const pending=new Map();
  const requestAnimationFrame=fn=>{const key=++id;pending.set(key,fn);queueMicrotask(()=>{if(pending.has(key)){pending.delete(key);fn();}});return key;};
  runInNewContext(code,{document,window,AbortController,IntersectionObserver:class {observe(){}disconnect(){}},requestAnimationFrame,cancelAnimationFrame:key=>pending.delete(key),getComputedStyle:()=>({top:'0'}),setTimeout,clearTimeout,fetch:async()=>({ok:false}),console,location:window.location});
  return {root,track,introStill,introLoop,chapters,videos,buttons,startStory,poster,tuner,document,window,queries,scrollActive:()=>scrollActive,dispose:()=>document.dispatchEvent(new Event('astro:before-preparation'))};
}
test('Astro reinitialization preserves a loaded, visible opening video', async()=>{
  const h=setup();await settle();
  assert.ok(h.root.classList.contains('has-video'));
  h.document.dispatchEvent(new Event('astro:page-load'));await settle();
  assert.ok(h.videos[0].src.endsWith('matcher-landscape.webm'));
  assert.equal(h.videos[0].readyState,4);
  assert.ok(h.root.classList.contains('has-video'));
  assert.ok(h.videos.some(video => video.classList.contains('is-front') && video.src.includes('matcher')));
  h.dispose();
});
test('forward, reverse, and direct scene transitions set direction and the matching asset',async()=>{
  const h=setup();await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.equal(h.root.dataset.sceneDirection,'forward');
  assert.ok(h.videos.some(video => video.src.includes('vehicle')));
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.equal(h.root.dataset.sceneDirection,'reverse');
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.root.dataset.sceneDirection,'forward');
  assert.ok(h.videos.some(video => video.src.includes('robot')));
  h.dispose();
});
test('rapidly superseded scene transitions resolve to the latest chapter',async()=>{
  const h=setup();await settle();
  h.videos.forEach(video => { video.hold=true; });
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  h.videos.forEach(video => video.release?.());await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.ok(h.videos.some(video => video.src.includes('vehicle') && video.classList.contains('is-front')));
  h.dispose();
});
test('scrolling back to matcher at the vehicle edge keeps the matcher film in front',async()=>{
  const h=setup();await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.ok(h.videos.some(video => video.src.includes('vehicle') && video.classList.contains('is-front')));
  const travel=8100;
  h.window.scrollTo({top:0.506*travel});await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  const front=h.videos.find(video => video.classList.contains('is-front'));
  assert.ok(front?.src.includes('matcher'), `expected matcher film, got ${front?.src || 'none'}`);
  h.dispose();
});
test('intro keeps the matcher CAD on stage through the first chapter',async()=>{
  const h=setup();await settle();
  assert.ok(h.root.classList.contains('is-intro'));
  assert.equal(h.root.style.props['--portrait-lift'],'0');
  assert.equal(h.root.style.props['--matcher-enter'],'1');
  const travel=8100;
  h.window.scrollTo({top:0.10*travel});await settle();
  assert.equal(h.root.style.props['--portrait-lift'],'0');
  assert.equal(h.root.style.props['--matcher-enter'],'1');
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.equal(h.root.classList.contains('is-intro'),false);
  assert.ok(h.root.classList.contains('is-matcher-handoff'));
  assert.equal(h.root.style.props['--portrait-lift'],'0');
  assert.equal(h.root.style.props['--matcher-enter'],'1');
  h.dispose();
});
test('matcher card handoff plays only when leaving the intro',async()=>{
  const h=setup();await settle();
  assert.equal(h.root.classList.contains('is-matcher-handoff'),false);
  h.startStory.dispatchEvent(new Event('click'));await settle();
  assert.ok(h.root.classList.contains('is-matcher-handoff'));
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.equal(h.root.classList.contains('is-matcher-handoff'),false);
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.equal(h.root.classList.contains('is-matcher-handoff'),false);
  h.window.scrollTo({top:0});await settle();
  assert.ok(h.root.classList.contains('is-intro'));
  assert.equal(h.root.classList.contains('is-matcher-handoff'),false);
  h.startStory.dispatchEvent(new Event('click'));await settle();
  assert.ok(h.root.classList.contains('is-matcher-handoff'));
  h.dispose();
});
test('reduced motion document flow does not run the matcher card handoff',async()=>{
  const h=setup({reduce:true});await settle();
  assert.equal(h.root.classList.contains('is-matcher-handoff'),false);
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.classList.contains('is-matcher-handoff'),false);
  h.dispose();
});
test('unloaded incoming video retains the outgoing frame',async()=>{
  const h=setup();await settle();
  const outgoing=h.videos.find(video => video.classList.contains('is-front'));
  assert.ok(outgoing?.src.includes('matcher'));
  h.videos.forEach(video => { video.hold=true; });
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.ok(outgoing.classList.contains('is-front'));
  assert.ok(h.videos.some(video => video.src.includes('vehicle') && !video.classList.contains('is-front')));
  h.dispose();
});
test('failed video switching cleanly to the correct poster',async()=>{
  const h=setup({fail:true});await settle();
  assert.equal(h.root.classList.contains('has-video'),false);
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.ok(String(h.poster.src).includes('matcher'));
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.ok(String(h.poster.src).includes('robot'));
  assert.equal(h.track.classList.contains('has-video'),false);
  h.dispose();
});
test('hidden-document and reduced-motion cancel in-flight handoffs',async()=>{
  const h=setup();await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  const running=h.videos.flatMap(video => video.animations).concat(h.poster.animations);
  assert.ok(running.some(animation => animation.playState==='running'));
  h.document.hidden=true;
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.ok(running.every(animation => animation.playState!=='running'));
  assert.ok(h.videos.every(video => video.style.clipPath==='' && video.style.transform==='' && video.style.willChange===''));
  h.document.hidden=false;
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  const next=h.videos.flatMap(video => video.animations);
  const reduce=h.queries.get('(prefers-reduced-motion: reduce)');
  reduce.matches=true;
  reduce.dispatchEvent(new Event('change'));
  await settle();
  assert.ok(next.every(animation => animation.playState!=='running'));
  h.dispose();
});
test('chapter optics clip toward the destination CAD slot',async()=>{
  const h=setup();await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  const vehicle=h.videos.find(video => video.src.includes('vehicle'));
  const matcher=h.videos.find(video => video.src.includes('matcher'));
  const vehicleIn=vehicle.animations.at(-1);
  const matcherOut=matcher.animations.at(-1);
  assert.equal(vehicleIn.keyframes[0].clipPath,'inset(0 100% 0 0)');
  assert.equal(vehicleIn.keyframes[0].transform,'translate3d(-16px,0,0)');
  assert.equal(vehicleIn.keyframes[1].clipPath,'inset(0)');
  assert.equal(matcherOut.keyframes[1].clipPath,'inset(0 0 0 100%)');
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  const matcherIn=h.videos.find(video => video.src.includes('matcher')).animations.at(-1);
  assert.equal(matcherIn.keyframes[0].clipPath,'inset(0 0 0 100%)');
  assert.equal(matcherIn.keyframes[0].transform,'translate3d(16px,0,0)');
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  const robot=h.videos.find(video => video.src.includes('robot')).animations.at(-1);
  assert.equal(robot.keyframes[0].clipPath,'inset(0 0 0 100%)');
  h.dispose();
});
test('failed poster handoff uses the same clip rack',async()=>{
  const h=setup({fail:true});await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  const posterCut=h.poster.animations.at(-1);
  assert.ok(posterCut);
  assert.equal(posterCut.keyframes[0].clipPath,'inset(0 100% 0 0)');
  assert.equal(posterCut.keyframes[0].opacity,1);
  assert.equal(posterCut.keyframes[1].clipPath,'inset(0)');
  h.dispose();
});
test('reduced motion does not run chapter clip optics',async()=>{
  const h=setup({reduce:true});await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.videos.every(video => video.animations.length===0),true);
  assert.equal(h.poster.animations.length,0);
  h.dispose();
});
test('reinitialization keeps a single scroll listener and the visible buffer',async()=>{
  const h=setup();await settle();
  assert.equal(h.scrollActive(),1);
  assert.ok(h.root.classList.contains('has-video'));
  h.document.dispatchEvent(new Event('astro:page-load'));await settle();
  assert.equal(h.scrollActive(),1);
  assert.ok(h.videos.some(video => video.src.includes('matcher') && video.readyState===4));
  h.dispose();
});
test('one track owns three progress phases and leaves the rail unset in the intro',async()=>{
  const h=setup();await settle();
  assert.equal(h.chapters.length,3);
  assert.equal(h.track.dataset.journeyTrack,'duplex');
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.ok(h.root.classList.contains('is-intro'));
  assert.ok(h.buttons.every(button => button.getAttribute('aria-current')==null));
  h.dispose();
});
test('rail clicks jump to in-track progress offsets instead of separate tracks',async()=>{
  const h=setup();await settle();
  const start=h.window.scrollY;
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  const matcher=h.window.scrollY;
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  const vehicle=h.window.scrollY;
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  const robot=h.window.scrollY;
  assert.ok(matcher>start);
  assert.ok(vehicle>matcher);
  assert.ok(robot>vehicle);
  assert.equal(h.buttons[2].getAttribute('aria-current'),'true');
  assert.equal(h.buttons[0].getAttribute('aria-current'),null);
  assert.equal(h.buttons[1].getAttribute('aria-current'),null);
  h.dispose();
});
test('deep links map project hashes onto the matching phase',async()=>{
  const h=setup();await settle();
  h.window.location.hash='#project-vehicle';
  h.window.dispatchEvent(new Event('hashchange'));
  await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.ok(h.videos.some(video => video.src.includes('vehicle')));
  h.window.location.hash='#project-robot';
  h.window.dispatchEvent(new Event('hashchange'));
  await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  h.dispose();
});
test('header project hashes jump even when the location hash is already set',async()=>{
  const h=setup();await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  h.document.dispatchEvent(new CustomEvent('portfolio:journey-hash',{detail:{id:'matcher'}}));
  await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  h.document.dispatchEvent(new CustomEvent('portfolio:journey-hash',{detail:{id:'matcher'}}));
  await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  h.dispose();
});
test('reduced motion uses a static document flow without video',async()=>{
  const h=setup({reduce:true});await settle();
  assert.ok(h.root.classList.contains('is-static'));
  assert.equal(h.root.classList.contains('has-video'),false);
  assert.ok(h.chapters.every(chapter => chapter.classList.contains('is-active') && !chapter.inert));
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.ok(h.chapters[2].scrolledIntoView);
  assert.equal(h.videos.every(video => !video.src),true);
  h.dispose();
});
test('intro start control jumps into the first chapter',async()=>{
  const h=setup();await settle();
  assert.ok(h.root.classList.contains('is-intro'));
  h.startStory.dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.equal(h.root.classList.contains('is-intro'),false);
  assert.ok(h.window.scrollY>0);
  h.dispose();
});
test('desktop reduced motion keeps chapter rail state in sync with scroll',async()=>{
  const h=setup({reduce:true});await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  h.chapters[0].getBoundingClientRect=()=>({top:-800,bottom:-100});
  h.chapters[0].still.getBoundingClientRect=h.chapters[0].getBoundingClientRect;
  h.chapters[2].getBoundingClientRect=()=>({top:80,bottom:700});
  h.chapters[2].still.getBoundingClientRect=h.chapters[2].getBoundingClientRect;
  h.window.dispatchEvent(new Event('scroll'));await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.buttons[2].getAttribute('aria-current'),'true');
  assert.equal(h.buttons[0].getAttribute('aria-current'),null);
  assert.ok(h.chapters.every(chapter => chapter.classList.contains('is-active') && !chapter.inert));
  assert.ok(h.chapters.every(chapter => chapter.getAttribute('aria-hidden') === 'false'));
  h.dispose();
});
test('compact chapters loop the visible portrait film and leave the sticky stage idle',async()=>{
  const h=setup({compact:true});await settle();
  assert.ok(h.root.classList.contains('is-static'));
  assert.equal(h.root.classList.contains('has-video'),false);
  assert.equal(h.videos.every(video => !video.src),true);
  assert.ok(h.introLoop.src.endsWith('matcher-portrait.webm'));
  assert.equal(h.introLoop.playing,false);
  assert.equal(h.introStill.classList.contains('has-loop'),false);
  h.window.scrollTo({top:24});await settle();
  assert.equal(h.introLoop.playing,true);
  assert.ok(h.introStill.classList.contains('has-loop'));
  h.introLoop.currentTime=1.4;
  h.window.scrollTo({top:0});await settle();
  assert.equal(h.introLoop.playing,true);
  assert.equal(h.introLoop.currentTime,1.4);
  assert.ok(h.introStill.classList.contains('has-loop'));
  h.introLoop.dispatchEvent(new Event('ended'));
  await settle();
  assert.equal(h.introLoop.playing,false);
  assert.equal(h.introLoop.currentTime,0);
  assert.ok(h.introStill.classList.contains('has-loop'));
  assert.equal(h.chapters[0].loop.src,'');
  assert.equal(h.chapters[0].loop.playing,false);
  assert.equal(h.chapters[0].still.classList.contains('has-loop'),false);
  assert.equal(h.chapters[1].loop.playing,false);
  assert.ok(h.chapters[1].loop.src.endsWith('vehicle-portrait.webm'));
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.chapters[0].loop.playing,false);
  assert.ok(h.chapters[2].loop.src.endsWith('robot-portrait.webm'));
  assert.equal(h.chapters[2].loop.playing,true);
  assert.equal(h.chapters[2].loop.playbackRate,.75);
  assert.ok(h.chapters[2].still.classList.contains('has-loop'));
  h.dispose();
});
test('compact films start as the still enters from the bottom of the viewport',async()=>{
  const h=setup({compact:true});await settle();
  h.chapters[1].still.getBoundingClientRect=()=>({top:720,bottom:1280});
  h.window.dispatchEvent(new Event('scroll'));
  await settle();
  assert.equal(h.chapters[0].loop.playing,false);
  assert.equal(h.chapters[1].loop.playing,true);
  h.dispose();
});
test('compact reduced motion keeps stills and does not load chapter loops',async()=>{
  const h=setup({compact:true,reduce:true});await settle();
  assert.ok(h.root.classList.contains('is-static'));
  assert.equal(h.introLoop.src,'');
  assert.equal(h.introStill.classList.contains('has-loop'),false);
  assert.equal(h.chapters.every(chapter => !chapter.loop.src),true);
  assert.equal(h.chapters.every(chapter => !chapter.still.classList.contains('has-loop')),true);
  h.dispose();
});
test('leaving the matcher chapter closes an open tuner',async()=>{
  const h=setup();await settle();
  h.tuner.click();
  assert.equal(h.tuner.getAttribute('aria-expanded'),'true');
  assert.ok(h.root.classList.contains('is-tuning'));
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.equal(h.tuner.getAttribute('aria-expanded'),'false');
  assert.equal(h.root.classList.contains('is-tuning'),false);
  h.dispose();
});
test('chapter progress token advances while the CAD film scrubs',async()=>{
  const h=setup();await settle();
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  const start=Number(h.track.style.props['--chapter-progress']);
  assert.ok(start>=0 && start<0.25, `expected early matcher progress, got ${start}`);
  const travel=8100;
  h.window.scrollTo({top:0.40*travel});await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  const mid=Number(h.track.style.props['--chapter-progress']);
  assert.ok(mid>start, `expected progress to advance, ${start} -> ${mid}`);
  h.dispose();
});
test('active evidence stays fully opaque except at a mid-track handoff',async()=>{
  const h=setup();await settle();
  assert.equal(h.track.style.props['--scene-opacity'],'1');
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.track.style.props['--scene-opacity'],'1');
  const travel=8100;
  h.window.scrollTo({top:0.506*travel});await settle();
  const matcherEdge=Number(h.track.style.props['--scene-opacity']);
  assert.ok(matcherEdge<0.7,`expected a handoff fade, got ${matcherEdge}`);
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.track.style.props['--scene-opacity'],'1');
  h.window.scrollTo({top:travel});await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.track.style.props['--scene-opacity'],'1');
  h.dispose();
});
