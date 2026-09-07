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
  style = { transform:'', opacity:'', setProperty() {} };
  setAttribute(key,value) { this.attrs[key]=value; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  removeAttribute(key) { delete this.attrs[key]; if(key==='src')this.src=''; }
  querySelectorAll() { return []; }
  animate(keyframes, options) {
    const animation = { keyframes, options, playState:'running', finished:Promise.resolve(), cancel(){ this.playState='cancelled'; }, finish(){ this.playState='finished'; } };
    this.animations.push(animation);
    return animation;
  }
}
class Video extends Node {
  readyState=0; duration=3; currentTime=0; seeking=false; loads=0; hold=false; fail=false; release=null;
  pause() {}
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
function setup({reduce=false,fail=false,hidden=false}={}) {
  const root=new Node(), track=new Node(), stage=new Node(), intro=new Node(), poster=new Node();
  const videos=[new Video(),new Video()]; videos.forEach(v=>v.fail=fail);
  const chapters=['matcher','vehicle','robot'].map((id,i)=>{
    const n=new Node();n.dataset={journeyChapter:id,duration:String(i===1?4:3)};
    n.proofs=Array.from({length:i===1?4:3},()=>new Node());n.querySelectorAll=()=>n.proofs;return n;
  });
  const buttons=chapters.map(c=>{const b=new Node();b.dataset.scene=c.dataset.journeyChapter;return b;});
  track.offsetHeight=9000;stage.offsetHeight=900;
  let y=0;
  track.getBoundingClientRect=()=>({top:-y});
  root.querySelector=s=>({'.project-journey-track':track,'.project-journey-stage':stage,'.journey-intro':intro,'[data-journey-poster]':poster})[s];
  root.querySelectorAll=s=>({'[data-journey-video]':videos,'[data-scene]':buttons,'[data-journey-chapter]':chapters})[s]||[];
  const document=new EventTarget();document.readyState='complete';document.hidden=hidden;document.querySelector=()=>root;document.createElement=()=>new Video();
  const window=new EventTarget();window.scrollY=0;
  const queries=new Map();window.matchMedia=q=>{if(!queries.has(q)){const e=new EventTarget();e.matches=q.includes('reduce')?reduce:false;queries.set(q,e);}return queries.get(q);};
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
  runInNewContext(code,{document,window,AbortController,IntersectionObserver:class {observe(){}disconnect(){}},requestAnimationFrame,cancelAnimationFrame:key=>pending.delete(key),getComputedStyle:()=>({top:'0'}),setTimeout,clearTimeout,fetch:async()=>({ok:false}),console});
  return {root,chapters,videos,buttons,poster,document,window,queries,scrollActive:()=>scrollActive,dispose:()=>document.dispatchEvent(new Event('astro:before-preparation'))};
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
test('unloaded incoming video retains the outgoing frame',async()=>{
  const h=setup();await settle();
  const outgoing=h.videos.find(video => video.classList.contains('is-front'));
  assert.ok(outgoing?.src.includes('matcher'));
  h.videos.forEach(video => { video.hold=true; });
  h.buttons[1].dispatchEvent(new Event('click'));await settle();
  assert.equal(h.root.dataset.activeChapter,'vehicle');
  assert.ok(outgoing.classList.contains('is-front'));
  assert.equal(h.videos.filter(video => video.classList.contains('is-front')).length,1);
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
  assert.equal(h.root.classList.contains('has-video'),false);
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
test('reinitialization keeps a single scroll listener and the visible buffer',async()=>{
  const h=setup();await settle();
  assert.equal(h.scrollActive(),1);
  assert.ok(h.root.classList.contains('has-video'));
  h.document.dispatchEvent(new Event('astro:page-load'));await settle();
  assert.equal(h.scrollActive(),1);
  assert.ok(h.videos.some(video => video.src.includes('matcher') && video.readyState===4));
  h.dispose();
});
test('reduced motion exposes all explanations without loading videos',async()=>{
  const h=setup({reduce:true});await settle();
  assert.ok(h.root.classList.contains('is-static'));
  assert.ok(h.chapters.every(c=>!c.inert&&c.proofs.every(p=>p.attrs['aria-hidden']==='false')));
  assert.ok(h.videos.every(v=>!v.src));h.dispose();
});
