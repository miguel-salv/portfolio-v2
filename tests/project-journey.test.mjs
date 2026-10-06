import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {createMechanismScrubber,nativeMechanismProgress} from '../src/scripts/mechanism-motion.js';
import {createJourneyTransition,createJourneyPacer} from '../src/scripts/journey-transition.js';

const code = readFileSync(new URL('../src/scripts/project-journey.js', import.meta.url), 'utf8').replace(/^import .*mechanism-motion.*\n/m,'').replace(/^import .*journey-transition.*\n/m,'');
const settle = () => new Promise(resolve => setImmediate(resolve));
function motionAt(p) {
  const helper=code.slice(code.indexOf('function continuousJourneyState'),code.indexOf('const SEAT_MS'));
  return JSON.parse(JSON.stringify(runInNewContext(helper+'\ncontinuousJourneyState(p)',{p,clamp:n=>Math.min(1,Math.max(0,n))})));
}
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
  getBoundingClientRect() { return { top:0, bottom:800, left:0, width:200, height:800 }; }
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
  get paused() { return !this.playing; }
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
function setup({reduce=false,compact=false,stageCompact=false,short=false,fail=false,hidden=false,vendor='',workshop=false,exhibit=false,continuous=false,phone=false,matcher=false,restoring=false}={}) {
  const root=new Node(), intro=new Node(), introStill=new Node(), introLoop=new Video();
  if (workshop) root.dataset = { introEnd:'0', matcherLoop:'', continuousLoops:'', handoffDuration:'600' };
  if (exhibit) root.dataset = { introEnd:'0', matcherExhibitStage:'', continuousLoops:'', handoffDuration:'600' };
  if (continuous) root.dataset = { introEnd:'0', matcherExhibitStage:'', continuousLoops:'', continuousJourney:'' };
  introStill.getBoundingClientRect=()=>({top:400,bottom:800});
  let y=0;
  const videos=[];
  const poster=new Node();
  const chapters=['matcher','vehicle','robot'].map((id)=>{
    const chapter=new Node();
    chapter.id=`project-${id}`;
    chapter.offsetHeight=800;
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
      ? {top:80,bottom:700,height:620}
      : {top:2000,bottom:2800,height:800};
    chapter.still.getBoundingClientRect=()=>chapter.getBoundingClientRect();
  });
  chapters[0].scrolledIntoView=true;
  const pair=[new Video(),new Video()]; pair.forEach(v=>v.fail=fail); videos.push(...pair);
  const films=['vehicle','robot'].map((id,i)=>{
    const scene=new Node();scene.dataset.journeyFilm=id;
    scene.querySelector=selector=>selector==='[data-journey-video]'?pair[i]:null;
    pair[i].closest=selector=>selector==='[data-journey-film]'?scene:null;
    return scene;
  });
  const matcherPlane=new Node(),rail=new Node(),indicator=new Node();
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
    '[data-matcher-plane]':matcherPlane,
    '.journey-chapters':rail,
    '[data-journey-indicator]':continuous?indicator:null,
  })[s];
  track.querySelectorAll=s=>({
    '[data-journey-video]':pair,
    '[data-journey-chapter]':chapters,
    '[data-journey-film]':continuous?films:[],
  })[s]||[];
  const buttons=chapters.map(c=>{const b=new Node();b.dataset.scene=c.dataset.journeyChapter;return b;});
  buttons.forEach((button,i)=>{button.getBoundingClientRect=()=>({left:i*240,width:200,top:0,bottom:48});});
  const startStory=new Node();
  const tuner=new Node();
  const motionButton=new Node();
  const matcherExhibit=matcher?new Node():null;
  if(matcherExhibit)matcherExhibit.dataset={mode:'machine',renderer:'film',assemblyComplete:'false'};
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
    '[data-journey-motion]':motionButton,
    '[data-matcher-exhibit]':matcherExhibit,
    '.matcher-aperture':matcher?chapters[0].still:null,
  })[s];
  root.querySelectorAll=s=>({
    '.project-journey-track':[track],
    '[data-scene]':buttons,
    '[data-journey-video]':videos,
    '[data-journey-chapter]':chapters,
  })[s]||[];
  const document=new EventTarget();document.readyState='complete';document.hidden=hidden;document.querySelector=()=>root;document.createElement=()=>new Video();
  const window=new EventTarget();window.scrollY=0;window.innerHeight=900;window.location={hash:'',href:'http://localhost/',origin:'http://localhost',pathname:'/'};
  window.__portfolioRestoringScroll = restoring;
  const queries=new Map();window.matchMedia=q=>{if(!queries.has(q)){const e=new EventTarget();e.matches=q.includes('reduce')?reduce:q.includes('max-width: 1100px')?(stageCompact||compact):q.includes('max-width: 620px')?compact:q.includes('max-width: 760px')?phone:q.includes('max-height: 759px')?short:false;queries.set(q,e);}return queries.get(q);};
  const scrollCalls=[];
  window.scrollTo=options=>{scrollCalls.push(options);y=options.top;window.scrollY=y;window.dispatchEvent(new Event('scroll'));};
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
  let id=0,frameClock=0; const pending=new Map();
  const requestAnimationFrame=fn=>{const key=++id;pending.set(key,fn);queueMicrotask(()=>{if(pending.has(key)){pending.delete(key);frameClock+=16;fn(frameClock);}});return key;};
  runInNewContext(code,{document,window,Element:Node,URL,createJourneyTransition,createJourneyPacer,performance:{now:()=>frameClock},nativeMechanismProgress,createMechanismScrubber:(video,options)=>createMechanismScrubber(video,{...options,requestFrame:requestAnimationFrame,cancelFrame:key=>pending.delete(key),isHidden:()=>document.hidden}),navigator:{vendor},AbortController,CustomEvent,IntersectionObserver:class {observe(){}disconnect(){}},requestAnimationFrame,cancelAnimationFrame:key=>pending.delete(key),getComputedStyle:()=>({top:'0'}),setTimeout,clearTimeout,fetch:async()=>({ok:false}),console,location:window.location});
  return {root,track,introStill,introLoop,chapters,videos,buttons,startStory,poster,tuner,motionButton,matcherExhibit,document,window,queries,films,matcherPlane,indicator,scrollCalls,now:()=>frameClock,advance:ms=>{frameClock+=ms;},scrollActive:()=>scrollActive,dispose:()=>document.dispatchEvent(new Event('astro:before-preparation'))};
}
test('Apple browsers load HEVC-with-alpha films instead of VP9', async()=>{
  const h=setup({vendor:'Apple Computer, Inc.'});await settle();
  assert.ok(h.videos[0].src.endsWith('matcher-landscape.mov'));
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.ok(h.videos.some(video=>video.src.endsWith('/catalogue/vehicle-landscape.mov')));
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  assert.ok(h.videos.some(video=>video.src.endsWith('/catalogue/robot-landscape.mov')));
  h.dispose();
});
test('compact Apple chapters loop HEVC portrait films', async()=>{
  const h=setup({compact:true,vendor:'Apple Computer, Inc.'});await settle();
  assert.ok(h.introLoop.src.endsWith('matcher-portrait.mov'));
  h.dispose();
});
test('Astro reinitialization preserves a loaded opening film under the poster', async()=>{
  const h=setup();await settle();
  assert.equal(h.root.classList.contains('has-video'),false);
  h.document.dispatchEvent(new Event('astro:page-load'));await settle();
  assert.ok(h.videos[0].src.endsWith('matcher-landscape.webm'));
  assert.equal(h.videos[0].readyState,4);
  assert.equal(h.root.classList.contains('has-video'),false);
  assert.ok(h.videos.some(video => video.classList.contains('is-front') && video.src.includes('matcher')));
  h.dispose();
});
test('intro keeps the matcher poster over the film so the alpha shadow does not double-composite',async()=>{
  const h=setup();
  assert.equal(h.root.classList.contains('has-video'),false);
  await settle();
  assert.equal(h.root.classList.contains('has-video'),false);
  assert.ok(h.videos.some(video => video.classList.contains('is-front') && video.src.includes('matcher')));
  h.startStory.dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.classList.contains('is-intro'),false);
  assert.ok(h.root.classList.contains('has-video'));
  h.dispose();
});
test('opening matcher film keeps the poster and skips chapter optics',async()=>{
  const h=setup();await settle();
  assert.equal(h.root.classList.contains('has-video'),false);
  assert.ok(h.videos.some(video => video.classList.contains('is-front') && video.src.includes('matcher')));
  assert.equal(h.videos.every(video => video.animations.length===0),true);
  assert.equal(h.poster.animations.length,0);
  h.document.dispatchEvent(new Event('astro:page-load'));await settle();
  assert.equal(h.videos.every(video => video.animations.length===0),true);
  assert.equal(h.poster.animations.length,0);
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.ok(h.root.classList.contains('has-video'));
  assert.ok(h.videos.some(video => video.animations.length>0));
  h.dispose();
});
test('forward, reverse, and direct scene transitions set direction and the matching asset',async()=>{
  const h=setup();await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.equal(h.root.dataset.sceneDirection,'forward');
  assert.ok(h.videos.some(video => video.src.endsWith('/catalogue/vehicle-landscape.webm')));
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.equal(h.root.dataset.sceneDirection,'reverse');
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.root.dataset.sceneDirection,'forward');
  assert.ok(h.videos.some(video => video.src.endsWith('/catalogue/robot-landscape.webm')));
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
test('user chapter jumps seat the rail; scroll-driven changes do not',async()=>{
  const h=setup();await settle();
  h.buttons[1].dispatchEvent(new Event('click'));
  assert.ok(h.buttons[1].classList.contains('is-seating'));
  assert.equal(h.buttons[0].classList.contains('is-seating'),false);
  await settle();
  const travel=8100;
  h.window.scrollTo({top:0.506*travel});await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.equal(h.buttons[0].classList.contains('is-seating'),false);
  await new Promise((resolve)=>setTimeout(resolve,180));
  assert.equal(h.buttons[1].classList.contains('is-seating'),false);
  h.dispose();
});
test('reduced motion skips the chapter rail detent',async()=>{
  const h=setup({reduce:true});await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.buttons[1].classList.contains('is-seating'),false);
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
  assert.ok(String(h.poster.src).endsWith('/catalogue/robot-landscape-poster.webp'));
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
test('chapter handoffs stay opaque and travel with navigation direction',async()=>{
  const h=setup();await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  const vehicle=h.videos.find(video => video.src.includes('vehicle'));
  const matcher=h.videos.find(video => video.src.includes('matcher'));
  const vehicleIn=vehicle.animations.at(-1);
  const matcherOut=matcher.animations.at(-1);
  assert.equal(vehicleIn.keyframes[0].transform,'translate3d(110%,0,0)');
  assert.equal(vehicleIn.keyframes[1].transform,'none');
  assert.equal(matcherOut.keyframes[1].transform,'translate3d(-110%,0,0)');
  assert.ok([...vehicleIn.keyframes,...matcherOut.keyframes].every(frame=>frame.opacity===1));
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  const matcherIn=h.videos.find(video => video.src.includes('matcher')).animations.at(-1);
  assert.equal(matcherIn.keyframes[0].transform,'translate3d(-110%,0,0)');
  assert.ok(matcherIn.keyframes.every(frame=>frame.opacity===1));
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  const robot=h.videos.find(video => video.src.includes('robot')).animations.at(-1);
  assert.equal(robot.keyframes[0].transform,'translate3d(110%,0,0)');
  assert.ok(robot.keyframes.every(frame=>frame.opacity===1));
  h.dispose();
});
test('failed video uses the same opaque directional poster handoff',async()=>{
  const h=setup({fail:true});await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  const posterCut=h.poster.animations.at(-1);
  assert.ok(posterCut);
  assert.equal(posterCut.keyframes[0].transform,'translate3d(110%,0,0)');
  assert.ok(posterCut.keyframes.every(frame=>frame.opacity===1));
  assert.equal(posterCut.keyframes[1].transform,'none');
  h.dispose();
});
test('reduced motion does not run chapter motion',async()=>{
  const h=setup({reduce:true});await settle();
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.videos.every(video => video.animations.length===0),true);
  assert.equal(h.poster.animations.length,0);
  h.dispose();
});
test('reinitialization keeps a single scroll listener and the visible buffer',async()=>{
  const h=setup();await settle();
  assert.equal(h.scrollActive(),1);
  assert.equal(h.root.classList.contains('has-video'),false);
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
  assert.ok(h.chapters[1].loop.src.endsWith('/catalogue/vehicle-portrait.webm'));
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.chapters[0].loop.playing,false);
  assert.ok(h.chapters[2].loop.src.endsWith('/catalogue/robot-portrait.webm'));
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
test('legacy boot matches fallback queries; catalogue enhancement waits for its controller',()=>{
  const astro=readFileSync(new URL('../src/components/ProjectJourney.astro', import.meta.url),'utf8');
  assert.match(code,/\(prefers-reduced-motion: reduce\)/);
  assert.match(code,/\(max-width: 620px\)/);
  assert.match(code,/\(min-width: 1101px\) and \(max-height: 759px\)/);
  assert.match(code,/\(max-width: 1100px\)/);
  assert.match(astro,/prefers-reduced-motion: reduce/);
  assert.match(astro,/max-width: 1100px/);
  assert.match(astro,/min-width: 1101px\) and \(max-height: 759px/);
  const selected=readFileSync(new URL('../src/components/SelectedWork.astro', import.meta.url),'utf8');
  assert.match(selected,/data-continuous-journey/);
  assert.doesNotMatch(selected,/classList\.add\(['"]is-enhanced/);
  assert.match(astro,/root\.classList\.add\("is-enhanced"\)/);
  assert.match(astro,/root\.classList\.add\("is-static"\)/);
});
test('active evidence stays fully opaque throughout a mid-track handoff',async()=>{
  const h=setup();await settle();
  assert.equal(h.track.style.props['--scene-opacity'],'1');
  h.buttons[0].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.track.style.props['--scene-opacity'],'1');
  const travel=8100;
  h.window.scrollTo({top:0.506*travel});await settle();
  const matcherEdge=Number(h.track.style.props['--scene-opacity']);
  assert.equal(matcherEdge,1);
  await new Promise((resolve)=>setTimeout(resolve,100));
  assert.equal(h.track.style.props['--scene-opacity'],'1');
  assert.ok(h.root.classList.contains('is-hud-resting'));
  h.buttons[2].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.track.style.props['--scene-opacity'],'1');
  h.window.scrollTo({top:travel});await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.track.style.props['--scene-opacity'],'1');
  h.dispose();
});


test('workshop starts on matcher and smoothly hands off directly in both directions', async()=>{
  const h=setup({workshop:true});await settle();
  assert.equal(h.root.classList.contains('is-intro'),false);
  assert.ok(h.root.classList.contains('has-video'));
  h.buttons[2].click();await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.ok(h.videos.find(v=>v.src.includes('robot')).animations.some(a=>a.options.duration===600));
  h.buttons[0].click();await settle();
  assert.equal(h.root.dataset.sceneDirection,'reverse');
  assert.ok(h.videos.some(v=>v.classList.contains('is-front')&&v.src.includes('matcher')));
  h.dispose();
});
test('compact workshop matcher loops while visible and stops on hidden documents', async()=>{
  const h=setup({compact:true,workshop:true});await settle();
  assert.equal(h.chapters[0].loop.playing,true);
  assert.ok(h.chapters[0].still.classList.contains('has-loop'));
  h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));await settle();
  assert.equal(h.chapters[0].loop.playing,false);
  h.dispose();
});
test('reduced-motion workshop keeps matcher static without loading a loop', async()=>{
  const h=setup({compact:true,reduce:true,workshop:true});await settle();
  assert.equal(h.chapters[0].loop.src,'');
  assert.equal(h.chapters[0].loop.playing,false);
  assert.equal(h.chapters[0].node?.inert ?? h.chapters[0].inert,false);
  h.dispose();
});

test('interactive matcher leaves film buffers idle and preserves return handoffs',async()=>{
  const h=setup({exhibit:true});await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.ok(h.videos.every(video=>!video.src));
  h.buttons[1].click();await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.ok(h.videos.find(video=>video.src.includes('vehicle')).animations.some(animation=>animation.options.duration===600));
  h.buttons[0].click();await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.ok(h.videos.every(video=>!video.playing));
  assert.ok(h.videos.every(video=>!video.src.includes('matcher')));
  h.buttons[1].click();await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.equal(h.chapters[0].inert,true);
  assert.ok(h.videos.find(video=>video.src.includes('vehicle')).animations.length>=2);
  h.dispose();
});


test('intermediate and short windows expose every chapter in native flow',async()=>{
  for (const options of [{stageCompact:true},{short:true}]) {
    const h=setup({...options,exhibit:true});await settle();
    assert.ok(h.root.classList.contains('is-static'));
    assert.ok(h.chapters.every(chapter=>!chapter.inert));
    h.buttons[2].dispatchEvent(new Event('click'));await settle();
    assert.equal(h.root.dataset.activeChapter,'robot');
    assert.ok(h.chapters[2].scrolledIntoView);
    assert.ok(h.chapters.every(chapter=>!chapter.inert));
    h.dispose();
  }
});

test('resizing into native flow reinitializes without duplicate scroll listeners',async()=>{
  const h=setup({exhibit:true});await settle();
  const media=h.queries.get('(max-width: 1100px)');
  media.matches=true;media.dispatchEvent(new Event('change'));await settle();
  assert.ok(h.root.classList.contains('is-static'));
  assert.equal(h.scrollActive(),1);
  assert.ok(h.chapters.every(chapter=>!chapter.inert));
  h.dispose();
  assert.equal(h.scrollActive(),0);
});

test('continuous boundaries have two opaque, reversible neighbors and resting endpoints',()=>{
  for(const center of [1/3,2/3]){
    const middle=motionAt(center);
    assert.equal(middle.layers.length,2);
    assert.ok(Math.abs(middle.layers[0].x+50)<1e-8);
    assert.ok(Math.abs(middle.layers[1].x-50)<1e-8);
    assert.equal(middle.locals[middle.boundary.from],1);
    assert.equal(middle.locals[middle.boundary.to],0);
    const before=motionAt(center-.04),after=motionAt(center+.04);
    assert.ok(Math.abs(before.layers[0].x)<1e-8);
    assert.ok(Math.abs(after.layers.at(-1).x)<1e-8);
    for(const p of [center-.03,center,center+.03]){
      const forward=motionAt(p);motionAt(center+.08);
      assert.deepEqual(motionAt(p),forward);
      assert.equal(forward.layers[1].x-forward.layers[0].x,100);
    }
  }
  assert.equal(motionAt(-1).locals[0],0);
  assert.equal(motionAt(2).locals[2],1);
});

test('continuous matcher survives the copy midpoint and shares position with its rail',async()=>{
  const h=setup({continuous:true});await settle();
  let detail;
  h.document.addEventListener('portfolio:journey-progress',event=>{detail=event.detail;});
  h.window.scrollTo({top:8100/3});await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.equal(h.chapters[0].classList.contains('is-participating'),true);
  assert.equal(h.chapters[0].inert,true);
  assert.equal(h.films[0].classList.contains('is-participating'),true);
  assert.ok(h.matcherPlane.style.transform.includes('-50'));
  assert.ok(Math.abs(parseFloat(h.indicator.style.transform.match(/translate3d\(([^p]+)/)[1])-120)<1e-8);
  assert.deepEqual([...detail.participants],['matcher','vehicle']);
  assert.equal(detail.locals.matcher,1);
  assert.equal(h.videos.flatMap(video=>video.animations).length,0);
  h.window.scrollTo({top:8100*.42});await settle();
  assert.equal(h.chapters[0].classList.contains('is-participating'),false);
  h.window.scrollTo({top:8100*.32});await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.equal(h.films[0].classList.contains('is-participating'),true);
  h.dispose();
});

test('continuous fast scrolling and late decoding retain the latest chapter and its own buffer',async()=>{
  const h=setup({continuous:true});await settle();
  h.videos.forEach(video=>{video.hold=true;});
  h.window.scrollTo({top:8100*.5});await settle();
  h.window.scrollTo({top:8100*.9});await settle();
  h.videos[0].release();await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.films[0].classList.contains('is-participating'),false);
  assert.equal(h.films[1].classList.contains('is-participating'),true);
  assert.equal(h.videos[0].dataset.chapter,'vehicle');
  h.videos[1].release();await settle();
  assert.equal(h.films[1].classList.contains('has-video'),true);
  h.dispose();
});

test('a fast scroll beyond the entire stage visits each chapter and discards overflow at its end',async()=>{
  const h=setup({continuous:true});await settle();
  const visits=[{id:h.root.dataset.activeChapter,y:h.window.scrollY,time:h.now()}];
  let exitBlocked=false;
  h.document.addEventListener('portfolio:journey-progress',event=>{
    const edge=event.detail.boundary?.eased;
    if((!event.detail.boundary||edge===0||edge===1)&&!visits.some(visit=>visit.id===event.detail.id)){
      visits.push({id:event.detail.id,y:h.window.scrollY,time:h.now()});
      if(event.detail.id==='robot'){
        const wheel=new Event('wheel',{cancelable:true});
        Object.defineProperty(wheel,'deltaY',{value:16200});
        h.window.dispatchEvent(wheel);
        exitBlocked=wheel.defaultPrevented;
      }
    }
  });
  h.window.scrollTo({top:16200});await settle();
  assert.deepEqual(visits.map(visit=>visit.id),['matcher','vehicle','robot']);
  assert.ok(visits.every(visit=>visit.y<=8100),'each model must arrive while the sticky stage is still on screen');
  assert.equal(h.window.scrollY,8100,'queued overflow must not launch the page past the models');
  assert.equal(exitBlocked,true,'the final model stays until its action completes');
  h.advance(200);
  h.window.scrollTo({top:8700});await settle();
  assert.equal(h.window.scrollY,8700,'fresh scroll after the final hold continues normally');
  h.window.scrollTo({top:9300});await settle();
  assert.equal(h.window.scrollY,9300,'scrolling outside the models remains native');
  h.dispose();
});

test('repeated large wheel inputs cannot accumulate a jump past the models',async()=>{
  const h=setup({continuous:true});await settle();
  for(let i=0;i<12;i++){
    const wheel=new Event('wheel',{cancelable:true});
    Object.defineProperty(wheel,'deltaY',{value:12000});
    h.window.dispatchEvent(wheel);
    assert.equal(wheel.defaultPrevented,true);
  }
  await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.window.scrollY,8100);
  assert.ok(h.scrollCalls.every(call=>call.top<=8100),'no deferred correction may leave the stage');
  h.advance(200);
  const next=new Event('wheel',{cancelable:true});
  Object.defineProperty(next,'deltaY',{value:400});
  h.window.dispatchEvent(next);await settle();
  assert.equal(next.defaultPrevented,false,'new input after the stage uses normal scrolling');
  h.window.scrollTo({top:8500});await settle();
  assert.equal(h.window.scrollY,8500);
  h.dispose();
});

test('a fast pass cannot leave the matcher until its painted assembly is complete',async()=>{
  const h=setup({continuous:true,matcher:true});await settle();
  let handedOff=false;
  h.document.addEventListener('portfolio:journey-progress',event=>{
    if(event.detail.boundary?.from===0&&event.detail.boundary.eased>.001){
      assert.equal(h.matcherExhibit.dataset.assemblyComplete,'true');handedOff=true;
    }
  });
  const wheel=new Event('wheel',{cancelable:true});
  Object.defineProperty(wheel,'deltaY',{value:12000});h.window.dispatchEvent(wheel);await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');
  assert.ok(Math.abs(h.window.scrollY-8100*(1/3-.04))<.01);
  h.advance(5500);h.window.scrollTo({top:12000});await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher','elapsed time cannot replace the displayed assembly');
  h.matcherExhibit.dataset.assemblyComplete='true';
  h.document.dispatchEvent(new CustomEvent('portfolio:matcher-motion'));await settle();
  assert.equal(handedOff,true,'the final canvas paint wakes the held scroll');
  assert.equal(h.window.scrollY,8100,'gesture overflow stays inside the models');
  h.dispose();
});

test('native flow finishes all three actions in view without slowing normal page scrolling',async()=>{
  const h=setup({continuous:true,short:true,matcher:true});await settle();
  h.chapters.forEach((chapter,i)=>chapter.still.getBoundingClientRect=()=>({top:1000*(i+1)-h.window.scrollY,bottom:1000*(i+1)+600-h.window.scrollY,height:600}));
  const wheel=delta=>{const event=new Event('wheel',{cancelable:true});Object.defineProperty(event,'deltaY',{value:delta});h.window.dispatchEvent(event);return event;};
  assert.equal(wheel(12000).defaultPrevented,true);await settle();
  assert.equal(h.window.scrollY,850);assert.equal(h.root.dataset.finishMatcher,'true');
  h.matcherExhibit.dataset.assemblyComplete='true';h.document.dispatchEvent(new CustomEvent('portfolio:matcher-motion'));
  assert.equal(wheel(12000).defaultPrevented,true);await settle();
  assert.equal(h.window.scrollY,1850);assert.equal(h.chapters[1].loop.currentTime,3-1/30);
  assert.equal(wheel(12000).defaultPrevented,true);await settle();
  assert.equal(h.window.scrollY,2850);assert.equal(h.chapters[2].loop.currentTime,3-1/30);
  assert.equal(wheel(400).defaultPrevented,false,'decoded completion releases without a timed pause');
  h.window.scrollTo({top:3250});await settle();assert.equal(h.window.scrollY,3250);
  h.dispose();
  assert.equal(h.root.dataset.finishMatcher,undefined,'native completion ownership cannot survive a viewport reinitialization');
});

test('robot exit waits for its decoded grip and resumes without replaying overflow',async()=>{
  const h=setup({continuous:true});await settle();
  h.buttons[2].click();await settle();
  const robot=h.videos[1];robot.seeking=true;
  const fling=()=>{
    const wheel=new Event('wheel',{cancelable:true});
    Object.defineProperty(wheel,'deltaY',{value:12000});
    h.window.dispatchEvent(wheel);
    return wheel;
  };
  assert.equal(fling().defaultPrevented,true);await settle();
  assert.equal(h.window.scrollY,8100);
  h.advance(500);
  assert.equal(fling().defaultPrevented,true,'elapsed time cannot release an unfinished grip');
  assert.equal(h.window.scrollY,8100);
  robot.seeking=false;robot.dispatchEvent(new Event('seeked'));await settle();
  assert.equal(Number(robot.dataset.motionProgress),1);
  assert.equal(robot.currentTime,3-1/30,'the last authored grip frame has been shown');
  const next=new Event('wheel',{cancelable:true});
  Object.defineProperty(next,'deltaY',{value:400});
  h.window.dispatchEvent(next);await settle();
  assert.equal(next.defaultPrevented,false,'the displayed final grip releases scrolling immediately');
  h.window.scrollTo({top:8500});await settle();
  assert.equal(h.window.scrollY,8500,'fresh input advances only its own distance');
  h.dispose();
});

test('fractional wheel and native scroll cannot escape the robot endpoint before the grip',async()=>{
  const h=setup({continuous:true});await settle();
  h.buttons[2].click();await settle();
  const robot=h.videos[1];robot.seeking=true;
  const wheel=delta=>{
    const event=new Event('wheel',{cancelable:true});
    Object.defineProperty(event,'deltaY',{value:delta});
    h.window.dispatchEvent(event);return event;
  };
  wheel(12000);await settle();
  assert.equal(h.window.scrollY,8100);
  assert.equal(wheel(.5).defaultPrevented,true,'even half a pixel must remain behind the completion gate');
  h.window.scrollTo({top:8100.5});await settle();
  assert.equal(h.window.scrollY,8100,'a native fractional scroll is corrected too');
  assert.equal(wheel(12000).defaultPrevented,true);
  h.advance(5500);
  assert.equal(wheel(12000).defaultPrevented,true,'elapsed time cannot stand in for the actual grip');
  assert.equal(h.window.scrollY,8100);
  robot.dataset.failed='1';
  assert.equal(wheel(400).defaultPrevented,false,'an explicit media failure releases the fallback');
  h.dispose();
});

test('short windows keep the native robot aperture visible until the grip is decoded',async()=>{
  const h=setup({continuous:true,short:true});await settle();
  h.chapters[1].still.getBoundingClientRect=()=>({top:-1000-h.window.scrollY,bottom:-200-h.window.scrollY,height:800});
  const robot=h.chapters[2];
  robot.still.getBoundingClientRect=()=>({top:3000-h.window.scrollY,bottom:3600-h.window.scrollY,height:600});
  robot.loop.seeking=true;
  const wheel=delta=>{
    const event=new Event('wheel',{cancelable:true});
    Object.defineProperty(event,'deltaY',{value:delta});
    h.window.dispatchEvent(event);return event;
  };
  assert.equal(wheel(12000).defaultPrevented,true);await settle();
  assert.equal(h.window.scrollY,2850,'the complete aperture remains centered');
  assert.equal(robot.loop.dataset.motionTarget,'1');
  h.advance(5500);
  assert.equal(wheel(.5).defaultPrevented,true);
  assert.equal(wheel(12000).defaultPrevented,true);
  robot.loop.seeking=false;robot.loop.dispatchEvent(new Event('seeked'));await settle();
  assert.equal(wheel(400).defaultPrevented,false);
  h.window.scrollTo({top:3250});await settle();
  assert.equal(h.window.scrollY,3250);
  assert.equal(robot.loop.dataset.motionTarget,'1','the grip stays closed while the model leaves');
  assert.equal(robot.loop.currentTime,3-1/30);
  h.dispose();
});

test('fresh touch scrolling restores completion checks after intentional chapter navigation',async()=>{
  const h=setup({continuous:true,short:true});await settle();
  h.buttons[2].click();await settle();
  h.chapters[1].still.getBoundingClientRect=()=>({top:-1000-h.window.scrollY,bottom:-200-h.window.scrollY,height:800});
  const robot=h.chapters[2];
  robot.still.getBoundingClientRect=()=>({top:3000-h.window.scrollY,bottom:3600-h.window.scrollY,height:600});
  robot.loop.seeking=true;
  h.window.dispatchEvent(new Event('touchstart'));h.window.scrollTo({top:12000});await settle();
  assert.equal(h.window.scrollY,2850,'touch scrolling cannot reuse a link navigation bypass');
  robot.loop.seeking=false;robot.loop.dispatchEvent(new Event('seeked'));await settle();
  h.dispose();
});

test('cross-page scroll restoration reaches sections after the models before normal pacing resumes',async()=>{
  for (const short of [false, true]) {
    const h=setup({continuous:true,matcher:true,restoring:true,short});await settle();
    h.chapters[0].still.getBoundingClientRect=()=>({top:80-h.window.scrollY,bottom:700-h.window.scrollY,height:620});
    h.window.dispatchEvent(new Event('touchstart'));
    h.window.scrollTo({top:9300});await settle();
    assert.equal(h.window.scrollY,9300,'restoring Career or Contact must bypass incomplete model actions');
    delete h.window.__portfolioRestoringScroll;
    h.buttons[0].click();await settle();
    h.window.scrollTo({top:0});await settle();
    h.window.dispatchEvent(new Event('touchstart'));
    h.window.scrollTo({top:9300});await settle();
    assert.ok(h.window.scrollY<8100,`fresh user input restores model completion checks (short=${short})`);
    h.dispose();
  }
});

test('a fast forward pass finishes the vehicle before its handoff to the robot',async()=>{
  const h=setup({continuous:true});await settle();
  let finished=false;
  h.document.addEventListener('portfolio:journey-progress',event=>{
    if(event.detail.boundary?.from===1&&event.detail.boundary.to===2&&event.detail.boundary.eased>.001){
      assert.equal(Number(h.videos[0].dataset.motionProgress),1);
      assert.equal(h.videos[0].seeking,false);
      finished=true;
    }
  });
  h.window.scrollTo({top:16200});await settle();
  assert.equal(finished,true);
  h.dispose();
});

test('continuous failed films keep their chapter visible with a poster',async()=>{
  const h=setup({continuous:true,fail:true});await settle();
  h.window.scrollTo({top:8100*.75});await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  assert.equal(h.films[1].classList.contains('is-participating'),true);
  assert.equal(h.films[1].classList.contains('has-video'),false);
  assert.equal(h.chapters[2].attrs['aria-hidden'],'false');
  h.dispose();
});

test('leaving the sticky stage hides fixed matcher content immediately while scene media loads',async()=>{
  const h=setup({continuous:true});await settle();
  h.videos[1].hold=true;
  const stage=h.track.querySelector('.project-journey-stage');
  stage.getBoundingClientRect=()=>({top:-2000,bottom:-1057});
  h.window.__portfolioRestoringScroll=true;
  h.window.scrollTo({top:9000});await settle();
  assert.equal(h.root.dataset.journeyOutside,'true');
  assert.equal(h.root.dataset.activeChapter,'robot','an offscreen transition cannot retain the matcher chapter');
  assert.equal(h.films[0].classList.contains('is-participating'),false);
  assert.equal(h.matcherPlane.style.transform,'translate3d(100%,0,0)');
  h.document.dispatchEvent(new CustomEvent('portfolio:matcher-render-ready'));await settle();
  assert.equal(h.root.dataset.journeyOutside,'true');h.dispose();
});

test('header navigation seats the chosen chapter without replaying the model transitions',async()=>{
  const h=setup({continuous:true});await settle();
  h.window.scrollTo({top:7500});await settle();
  assert.equal(h.root.dataset.activeChapter,'robot');
  h.window.__portfolioSectionNavigation=true;
  h.document.dispatchEvent(new Event('portfolio:section-navigation-start'));
  h.document.dispatchEvent(new CustomEvent('portfolio:journey-hash',{detail:{id:'matcher'}}));
  h.document.dispatchEvent(new CustomEvent('portfolio:section-navigation-settle',{detail:{ready(){}}}));
  assert.equal(h.root.dataset.activeChapter,'matcher','the first destination paint is already seated');
  assert.equal(h.matcherPlane.style.transform,'translate3d(0%,0,0)');
  assert.equal(h.films.every(scene=>!scene.classList.contains('is-participating')),true);
  await settle();
  assert.equal(h.root.dataset.activeChapter,'matcher');h.dispose();
});

test('continuous rail uses native smooth navigation and user input cancels ownership',async()=>{
  const h=setup({continuous:true});await settle();
  h.buttons[2].click();await settle();
  assert.equal(h.scrollCalls.at(-1).behavior,'smooth');
  h.window.dispatchEvent(new Event('wheel'));
  assert.equal(h.scrollCalls.at(-1).behavior,'instant');
  h.document.dispatchEvent(new CustomEvent('portfolio:journey-hash',{detail:{id:'vehicle',smooth:true}}));await settle();
  assert.equal(h.scrollCalls.at(-1).behavior,'smooth');
  h.window.location.hash='#project-vehicle';
  h.window.dispatchEvent(new Event('hashchange'));await settle();
  assert.equal(h.scrollCalls.at(-1).behavior,'auto');
  h.dispose();
});

test('an internal link handled by page navigation can still bypass model pacing',async()=>{
  const h=setup({continuous:true});await settle();
  const link=new Node();link.href='http://localhost/#about';
  link.closest=selector=>selector==='a[href]'?link:null;
  const click=new Event('click',{cancelable:true});
  Object.defineProperties(click,{target:{value:link},button:{value:0}});
  click.preventDefault();
  h.document.dispatchEvent(click);
  h.window.scrollTo({top:16200});await settle();
  assert.equal(h.window.scrollY,16200,'About and other explicit links must reach their destination');
  h.dispose();
});

test('continuous cleanup and reduced motion leave native chapters available',async()=>{
  const h=setup({continuous:true});await settle();
  h.window.scrollTo({top:8100/3});await settle();
  const query=[...h.queries.entries()].find(([key])=>key.includes('reduce'))[1];
  query.matches=true;query.dispatchEvent(new Event('change'));await settle();
  assert.equal(h.root.classList.contains('is-static'),true);
  assert.ok(h.chapters.every(chapter=>!chapter.inert&&chapter.attrs['aria-hidden']==='false'));
  assert.equal(h.scrollActive(),1);
  assert.equal(h.matcherPlane.style.transform,'');
  h.dispose();
  assert.equal(h.root.classList.contains('is-enhanced'),false);
  assert.ok(h.chapters.every(chapter=>!chapter.inert&&chapter.attrs['aria-hidden']===undefined));
  assert.equal(h.scrollActive(),0);
});

test('continuous rail aligns its indicator with chapter buttons in wrapped native flow',async()=>{
  const h=setup({continuous:true,compact:true});await settle();
  assert.ok(h.indicator.style.transform.includes(',-752px,0)'));
  h.dispose();
});

test('continuous native films freeze their displayed frame through pause and join the latest position on resume',async()=>{
  const h=setup({continuous:true,compact:true});await settle();
  h.buttons[1].click();await settle();
  const {loop,still}=h.chapters[1];
  assert.equal(loop.playing,false);assert.equal(still.classList.contains('has-loop'),true);
  h.motionButton.click(); const frozen=loop.currentTime;
  h.chapters[1].still.getBoundingClientRect=()=>({top:500,bottom:760,height:260});
  h.window.dispatchEvent(new Event('scroll'));await settle();
  assert.equal(loop.currentTime,frozen);assert.equal(still.classList.contains('has-loop'),true);
  h.motionButton.click();await settle();
  assert.equal(loop.playing,false);assert.ok(loop.currentTime<frozen);
  const query=h.queries.get('(prefers-reduced-motion: reduce)');
  query.matches=true;query.dispatchEvent(new Event('change'));await settle();
  assert.equal(loop.playing,false);assert.equal(still.classList.contains('has-loop'),false);
  h.dispose();
});

test('native film startup reveals decoded frames without starting playback or duplicate loads',async()=>{
  const h=setup({continuous:true,compact:true});await settle();
  const {loop,still}=h.chapters[1];let playCalls=0;
  loop.play=()=>{playCalls++;return Promise.resolve();};
  h.buttons[1].click();await settle();
  const loads=loop.loads;
  for(let i=0;i<12;i++)h.window.dispatchEvent(new Event('scroll'));
  await settle();assert.equal(playCalls,0);assert.equal(loop.loads,loads);
  assert.equal(still.classList.contains('has-loop'),true);
  h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));await settle();
  const frozen=loop.currentTime;
  h.window.dispatchEvent(new Event('scroll'));await settle();assert.equal(loop.currentTime,frozen);
  h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));await settle();
  assert.equal(playCalls,0);assert.equal(still.classList.contains('has-loop'),true);
  h.dispose();assert.equal(still.classList.contains('has-loop'),false);
});

test('phone films advance on downward scroll, hold their endpoint and reverse on upward scroll', async () => {
  const h=setup({continuous:true,compact:true,phone:true});
  const chapter=h.chapters[1],loop=chapter.loop;let top=675;
  chapter.still.getBoundingClientRect=()=>({top,bottom:top+260,height:260});
  h.buttons[1].click();await settle();assert.equal(loop.currentTime,0);
  top=400;h.window.dispatchEvent(new Event('scroll'));await settle();const middle=loop.currentTime;
  assert.ok(middle>0);assert.equal(loop.playing,false);assert.equal(loop.loop,false);
  top=100;h.window.dispatchEvent(new Event('scroll'));await settle();const end=loop.currentTime;
  assert.ok(end>middle);assert.ok(end<loop.duration);
  h.window.dispatchEvent(new Event('scroll'));await settle();assert.equal(loop.currentTime,end);
  top=400;h.window.dispatchEvent(new Event('scroll'));await settle();assert.equal(loop.currentTime,middle);
  top=675;h.window.dispatchEvent(new Event('scroll'));await settle();assert.equal(loop.currentTime,0);
  h.dispose();assert.equal(chapter.still.classList.contains('has-loop'),false);
});

test('phone films retain posters on decode failure and reduced motion', async () => {
  for(const reduce of [false,true]) {
    const h=setup({continuous:true,compact:true,phone:true,reduce});
    const loop=h.chapters[1].loop; loop.fail=true;
    h.buttons[1].click(); await settle();
    assert.equal(loop.playing,false);
    assert.equal(h.chapters[1].still.classList.contains('has-loop'),false);
    h.dispose();
  }
});

test('phone mechanisms remain paused offscreen and rejoin their visible scroll pose', async () => {
  const h=setup({continuous:true,compact:true,phone:true});
  h.buttons[1].click();await settle();const loop=h.chapters[1].loop;
  h.buttons[2].click();await settle();const frozen=loop.currentTime;
  h.window.dispatchEvent(new Event('scroll'));await settle();
  assert.equal(loop.playing,false);assert.equal(loop.currentTime,frozen);
  h.buttons[1].click();await settle();assert.equal(loop.playing,false);
  assert.ok(loop.currentTime>0);h.dispose();
});

test('phone mechanisms stay at rest until artwork enters the reading area', async () => {
  const h=setup({continuous:true,compact:true,phone:true});
  const chapter=h.chapters[1],loop=chapter.loop;let top=860;
  chapter.still.getBoundingClientRect=()=>({top,bottom:top+260,height:260});
  h.buttons[1].click();await settle();assert.equal(loop.currentTime,0);
  top=600;h.window.dispatchEvent(new Event('scroll'));await settle();assert.ok(loop.currentTime>0);
  top=120;h.window.dispatchEvent(new Event('scroll'));await settle();assert.ok(loop.currentTime>2.8);
  top=860;h.window.dispatchEvent(new Event('scroll'));await settle();assert.equal(loop.currentTime,0);
  assert.equal(loop.playing,false);h.dispose();
});
