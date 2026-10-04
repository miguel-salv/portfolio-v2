import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountContextSwitch } from '../src/scripts/context-switch.js';

class Node extends EventTarget {
  constructor() {
    super(); this.dataset = {}; this.style = {}; this.attrs = {}; this.children = []; this.textContent = ''; this.isConnected = true;
    const classes = new Set(); this.classList = { add: value => classes.add(value), toggle: (value,on) => on ? classes.add(value) : classes.delete(value), contains: value => classes.has(value) };
  }
  setAttribute(key,value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  focus() { this.focused = true; }
  remove() { this.removed = true; this.isConnected = false; }
  animate() { const animation = { cancelled: false, cancel() { this.cancelled = true; } }; (this.animations ||= []).push(animation); return animation; }
  click(props = {}) { const event = new Event('click', {cancelable: true}); Object.assign(event,{ button: 0, ...props }); this.dispatchEvent(event); return event; }
}
function contextHarness(reduced = false) {
  const motion = new EventTarget(); motion.matches = reduced;
  const original = globalThis.matchMedia; globalThis.matchMedia = () => motion;
  const names = ['controls','next','back','reset','count','title','description'];
  const controls = Object.fromEntries(names.map(name => [name,new Node()])); controls.next.firstChild = new Node();
  const nodes = ['thread-a','thread-b','handler','tick','tcb','save','store','select','restore'].flatMap(name => [0,1].map(() => { const node=new Node(); node.dataset.contextNode=name; return node; }));
  const edges = ['tick','handler','tcb','restore','thread-b'].map(name => { const node=new Node(); node.dataset.contextEdge=name; return node; });
  const root=new Node(); root.querySelector=selector=>controls[selector.match(/context-(\w+)/)[1]]; root.querySelectorAll=selector=>selector.includes('node')?nodes:edges;
  root.getBoundingClientRect = () => ({top:120,bottom:800,height:680});
  root.scrollIntoView = options => { root.scrolled = options; };
  globalThis.getComputedStyle = () => ({scrollMarginTop:'118px'}); globalThis.innerHeight=844;
  const cleanup=mountContextSwitch(root); globalThis.matchMedia=original;
  return { ...controls,root,nodes,edges,motion,cleanup };
}

test('context walkthrough can complete, replay, go backwards and restore the whole static diagram', () => {
  const h=contextHarness(); h.next.click(); assert.equal(h.title.textContent,'Thread A is running'); assert.equal(h.back.disabled,true);
  for(let i=0;i<6;i++)h.next.click(); assert.equal(h.title.textContent,'Thread B resumes'); assert.equal(h.next.firstChild.textContent,'Replay');
  h.next.click(); assert.equal(h.count.textContent,'1 / 7'); h.next.click(); h.back.click(); assert.equal(h.count.textContent,'1 / 7');
  h.reset.click(); assert.equal(h.count.textContent,'Overview'); assert.ok(h.nodes.every(node=>!node.classList.contains('is-current'))); h.cleanup();
});
test('rapid and reverse steps cancel outgoing traces; teardown prevents further input', () => {
  const h=contextHarness(); h.next.click(); h.next.click(); const trace=h.edges[0].animations[0]; h.next.click(); assert.equal(trace.cancelled,true);
  h.back.click(); assert.equal(h.count.textContent,'2 / 7'); const active=h.edges[0].animations.at(-1); h.cleanup(); assert.equal(active.cancelled,true);
  h.next.click(); assert.equal(h.count.textContent,'2 / 7');
});
test('reduced motion preserves every context stage without a trace animation', () => {
  const h=contextHarness(true); for(let i=0;i<7;i++)h.next.click(); assert.equal(h.count.textContent,'7 / 7'); assert.ok(h.edges.every(edge=>!edge.animations)); h.cleanup();
});
test('changing the motion preference cancels an in-flight context trace without changing the stage', () => {
  const h=contextHarness(); h.next.click(); h.next.click(); h.motion.matches=true; h.motion.dispatchEvent(new Event('change')); assert.equal(h.edges[0].animations[0].cancelled,true); assert.equal(h.count.textContent,'2 / 7'); h.cleanup();
});
test('context controls bring the whole compact diagram into view only when it fits', () => {
  const h=contextHarness(); h.root.getBoundingClientRect=()=>({top:-240,bottom:440,height:680}); h.next.click(); assert.equal(h.root.scrolled.block,'start');
  delete h.root.scrolled; h.root.getBoundingClientRect=()=>({top:-240,bottom:800,height:1040}); h.next.click(); assert.equal(h.root.scrolled,undefined); h.cleanup();
});
test('scheduler selection stays inside PendSV and returns to its wrapper before thread execution resumes', () => {
  const h=contextHarness(); for(let i=0;i<5;i++)h.next.click();
  assert.ok(h.nodes.filter(n=>n.dataset.contextNode==='handler').every(n=>n.classList.contains('is-current')));
  assert.ok(h.nodes.filter(n=>n.dataset.contextNode==='tcb').every(n=>n.classList.contains('is-current')));
  const selection=h.edges.find(n=>n.dataset.contextEdge==='tcb').animations[0];
  h.next.click(); assert.equal(selection.cancelled,true);
  assert.ok(h.edges.find(n=>n.dataset.contextEdge==='restore').classList.contains('is-current'));
  assert.match(h.description.textContent,/same PendSV wrapper/);
  assert.ok(h.nodes.filter(n=>n.dataset.contextNode==='thread-b').every(n=>!n.classList.contains('is-current')));
  h.next.click(); assert.ok(h.edges.find(n=>n.dataset.contextEdge==='thread-b').classList.contains('is-current')); h.cleanup();
});

function actorHarness(reduced=false) {
  const timers=new Map(), tweens=new Map(); let id=0;
  const motion=new EventTarget(); motion.matches=reduced;
  const scope={ spr:()=>new Node(), asset:name=>name, prefersReducedMotion:()=>motion.matches, playKirbyHop(){}, easeInCubic:x=>x, easeOutCubic:x=>x,
    window:{ matchMedia:()=>motion, setTimeout:fn=>{timers.set(++id,fn);return id;} }, clearTimeout:key=>timers.delete(key), cancelAnim:key=>tweens.delete(key), tween:options=>tweens.set(options.key,options) };
  const source=readFileSync(new URL('../src/scripts/demos/companion/kirby-actor.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function','function'); runInNewContext(source,scope);
  const actor=scope.createKirbyActor(new Node(),128,132,true);
  function drain() { for(let n=0;(timers.size||tweens.size)&&n<20;n++){
    if(tweens.size){const [key,tween]=tweens.entries().next().value;tweens.delete(key);tween.onUpdate(tween.to);tween.onDone?.();}
    else {const [key,fn]=timers.entries().next().value;timers.delete(key);fn();}
  } }
  return {scope,actor,timers,tweens,motion,drain};
}
test('Kirby rests with no idle timer or animation; an existing tap hop finishes at exact rest', () => {
  const h=actorHarness(); assert.equal(h.timers.size,0); assert.equal(h.tweens.size,0); h.actor.el.click(); assert.equal(h.actor.el.src,'kirby-squash.png'); h.drain(); assert.equal(h.actor.el.src,'kirby-idle.png'); assert.equal(h.actor.el.style.top,'132px'); assert.equal(h.timers.size,0); assert.equal(h.tweens.size,0); h.actor.destroy();
});
test('repeated hops keep one finite animation and stale callbacks cannot revive it after pause', () => {
  const h=actorHarness(); h.actor.el.click(); const stale=[...h.tweens.values()][0].onDone; h.actor.el.click(); assert.equal(h.tweens.size,1); h.actor.pause(); stale(); assert.equal(h.tweens.size,0); assert.equal(h.actor.el.src,'kirby-idle.png'); h.actor.el.click(); assert.equal(h.tweens.size,0); h.actor.resume(); h.actor.el.click(); h.drain(); h.actor.destroy();
});
test('actor animation keys do not collide between Clock and Star Catcher', () => {
  const h=actorHarness(); const other=h.scope.createKirbyActor(new Node(),128,132,true); h.actor.el.click(); other.el.click(); assert.equal(h.tweens.size,2); h.actor.destroy(); assert.equal(h.tweens.size,1); other.destroy(); assert.equal(h.tweens.size,0);
});
test('Kirby uses a still tap response for reduced motion and preference changes restore rest', () => {
  const h=actorHarness(true); h.actor.el.click(); assert.equal(h.tweens.size,0); assert.equal(h.actor.el.style.top,'132px'); h.drain(); h.motion.matches=false; h.actor.el.click(); h.motion.matches=true; h.motion.dispatchEvent(new Event('change')); assert.equal(h.actor.el.src,'kirby-idle.png'); assert.equal(h.timers.size,0); assert.equal(h.tweens.size,0); h.actor.destroy();
});

function photoHarness() {
  const children=[], links=[new Node(),new Node()], document=new Node(); document.querySelectorAll=()=>links;
  document.body={append:node=>children.push(node)};
  document.createElement=tag=>{const node=new Node();node.tag=tag;if(tag==='dialog'){node.open=false;node.showModal=()=>{node.open=true;};node.close=()=>{node.open=false;node.dispatchEvent(new Event('close'));};}return node;};
  links.forEach((link,i)=>{link.href=`/photo-${i}.jpg`;link.closest=selector=>({querySelector:()=>selector==='.photo-aperture'?{alt:`Photo ${i}`}:{textContent:`Caption ${i}`}});});
  const motion=new EventTarget(); motion.matches=false;
  const scope={document,HTMLDialogElement:Node,AbortController,matchMedia:()=>motion};
  const source=readFileSync(new URL('../src/scripts/photo-inspection.js',import.meta.url),'utf8').replace('export function','function');runInNewContext(source,scope);
  const cleanup=scope.mountPhotoInspection(); const dialog=children[0],close=dialog.children[0],figure=dialog.children[1],image=figure.children[0],status=dialog.children[2];
  return {links,dialog,close,image,status,figure,cleanup};
}
test('image inspection preserves modified links, loads the chosen original, and restores opener focus', () => {
  const h=photoHarness(); const modified=h.links[0].click({metaKey:true}); assert.equal(modified.defaultPrevented,false); assert.equal(h.dialog.open,false);
  const normal=h.links[0].click(); assert.equal(normal.defaultPrevented,true); assert.equal(h.image.src,'/photo-0.jpg'); assert.equal(h.close.focused,true); h.dialog.close(); assert.equal(h.links[0].focused,true); h.cleanup();
});
test('image loading failure remains actionable; reopening and navigation cancel prior animation and modal', () => {
  const h=photoHarness(); h.links[0].click(); const first=h.figure.animations[0]; h.image.dispatchEvent(new Event('error')); assert.match(h.status.textContent,/Try opening the original/);
  h.dialog.close(); assert.equal(first.cancelled,true); h.links[1].click(); assert.equal(h.image.alt,'Photo 1'); h.cleanup(); assert.equal(h.dialog.open,false); assert.equal(h.dialog.removed,true); const count=h.figure.animations.length; h.links[0].click(); assert.equal(h.figure.animations.length,count);
});
