import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const code = readFileSync(new URL('../src/scripts/project-journey.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
class Node extends EventTarget {
  dataset = {}; attrs = {}; inert = false;
  classList = { tokens:new Set(), add:(...t)=>t.forEach(x=>this.classList.tokens.add(x)), remove:(...t)=>t.forEach(x=>this.classList.tokens.delete(x)), contains:t=>this.classList.tokens.has(t), toggle:(t,on)=>on ? this.classList.tokens.add(t) : this.classList.tokens.delete(t) };
  style = { setProperty() {} };
  setAttribute(key,value) { this.attrs[key]=value; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  removeAttribute(key) { delete this.attrs[key]; if(key==='src')this.src=''; }
  querySelectorAll() { return []; }
}
class Video extends Node {
  src=''; readyState=0; duration=3; currentTime=0; seeking=false; loads=0;
  pause() {}
  load() {
    this.loads++;
    this.readyState=0;
    const src=this.src;
    if(src)queueMicrotask(()=>{ if(this.src!==src)return; this.readyState=4; this.dispatchEvent(new Event(this.fail?'error':'loadeddata')); });
  }
  canPlayType() { return 'probably'; }
}
function setup({reduce=false,fail=false}={}) {
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
  const document=new EventTarget();document.readyState='complete';document.querySelector=()=>root;document.createElement=()=>new Video();
  const window=new EventTarget();window.scrollY=0;
  const queries=new Map();window.matchMedia=q=>{if(!queries.has(q)){const e=new EventTarget();e.matches=q.includes('reduce')?reduce:false;queries.set(q,e);}return queries.get(q);};
  window.scrollTo=({top})=>{y=top;window.scrollY=y;window.dispatchEvent(new Event('scroll'));};
  let id=0; const pending=new Map();
  const requestAnimationFrame=fn=>{const key=++id;pending.set(key,fn);queueMicrotask(()=>{if(pending.has(key)){pending.delete(key);fn();}});return key;};
  runInNewContext(code,{document,window,AbortController,IntersectionObserver:class {observe(){}disconnect(){}},requestAnimationFrame,cancelAnimationFrame:key=>pending.delete(key),getComputedStyle:()=>({top:'0'}),setTimeout,clearTimeout,fetch:async()=>({ok:false}),console});
  return {root,chapters,videos,buttons,document,window,queries,dispose:()=>document.dispatchEvent(new Event('astro:before-preparation'))};
}
test('Astro reinitialization preserves a loaded, visible opening video', async()=>{
  const h=setup();await settle();
  assert.ok(h.root.classList.contains('has-video'));
  h.document.dispatchEvent(new Event('astro:page-load'));await settle();
  assert.ok(h.videos[0].src.endsWith('matcher-landscape.webm'));
  assert.equal(h.videos[0].readyState,4);
  assert.ok(h.root.classList.contains('has-video'));h.dispose();
});
test('scene jumps and reverse navigation present the corresponding asset and copy',async()=>{
  const h=setup();await settle();
  for(const index of [2,1,0]) {
    h.buttons[index].dispatchEvent(new Event('click'));await settle();
    assert.equal(h.root.dataset.activeChapter,h.chapters[index].dataset.journeyChapter);
    assert.ok(h.videos[index%2].src.includes(h.chapters[index].dataset.journeyChapter));
    assert.equal(h.chapters[index].inert,false);
  }
  h.dispose();
});
test('reduced motion exposes all explanations without loading videos',async()=>{
  const h=setup({reduce:true});await settle();
  assert.ok(h.root.classList.contains('is-static'));
  assert.ok(h.chapters.every(c=>!c.inert&&c.proofs.every(p=>p.attrs['aria-hidden']==='false')));
  assert.ok(h.videos.every(v=>!v.src));h.dispose();
});
test('video failure keeps the scene poster visible',async()=>{
  const h=setup({fail:true});await settle();
  assert.equal(h.root.classList.contains('has-video'),false);
  assert.equal(h.root.dataset.activeChapter,'matcher');h.dispose();
});
