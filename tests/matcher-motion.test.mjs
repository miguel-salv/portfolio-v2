import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {stepMechanism,matcherAssemblyPose} from '../src/scripts/mechanism-motion.js';

const exhibitCode = readFileSync(new URL('../src/scripts/matcher-exhibit.js', import.meta.url), 'utf8');
const modelCode = readFileSync(new URL('../src/scripts/matcher-model.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
class Node extends EventTarget {
  dataset = {}; hidden = false; attrs = {}; textContent = ''; animations = [];
  style = { willChange: '', setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
  tokens = new Set();
  classList = { toggle: (name, value) => { if (value) this.tokens.add(name); else this.tokens.delete(name); }, remove: (...names) => names.forEach(name => this.tokens.delete(name)), contains: name => this.tokens.has(name) };
  children = [];
  insertBefore(node, next) {
    if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
    const index = next ? this.children.indexOf(next) : -1;
    if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
    node.parentNode = this;
  }
  getBoundingClientRect() { return {top:100,bottom:400,height:300,width:390}; }
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  click() { this.dispatchEvent(new Event('click')); }
  animate(frames, options) {
    const animation = { frames, options, cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
    this.animations.push(animation); return animation;
  }
}
function setupExhibit({ reduce = false, unavailable = false, flow = false, observe = true, delayed = false, saveData = false } = {}) {
  const root = new Node(), window = new EventTarget(), document = new EventTarget();
  window.innerHeight = 844;
  document.readyState = 'complete'; document.hidden = false; document.querySelector = () => root;
  const query = new EventTarget(); query.matches = reduce;
  const phone = new EventTarget(); phone.matches = flow;
  const modes = ['machine','inside','tune','lab'].map(id => { const n = new Node(); n.dataset.matcherMode = id; return n; });
  const parts = ['capacitors','motors','control'].map(id => { const n = new Node(); n.dataset.matcherPart = id; return n; });
  const panels = modes.map(mode => { const n = new Node(); n.dataset.matcherPanel = mode.dataset.matcherMode; return n; });
  const details = parts.map(part => { const n = new Node(); n.dataset.matcherDetail = part.dataset.matcherPart; return n; });
  const names = ['visual','model','canvas','render','lab','tuning','callouts','angles','caption','modes','live','c1','c2','inspection'];
  const nodes = Object.fromEntries(names.map(name => [name,new Node()]));
  if (flow) { nodes.portrait = new Node(); nodes.portrait.complete = true; nodes.portrait.naturalWidth = 1000; }
  nodes.inspection.insertBefore(nodes.modes,null);
  const toggle = new Node(); toggle.setAttribute('aria-expanded','false');
  toggle.addEventListener('click', () => toggle.setAttribute('aria-expanded',String(toggle.getAttribute('aria-expanded') !== 'true')));
  root.querySelector = selector => {
    if (selector === '[data-instrument-toggle]') return toggle;
    if (selector === '.matcher-aperture') return nodes.visual;
    if (selector === '.matcher-inspection') return nodes.inspection;
    const part = selector.match(/data-matcher-detail="([^"]+)"/);
    if (part) return { textContent: part[1] };
    const name = selector.match(/^\[data-matcher-([^\]]+)\]$/)?.[1];
    return nodes[name] ?? null;
  };
  root.querySelectorAll = selector => ({ '[data-matcher-mode]': modes, '[data-matcher-part]': parts, '[data-matcher-panel]': panels, '[data-matcher-detail]': details })[selector] ?? [];
  const journey = new Node();
  if (flow) { journey.dataset = { heroHandoff: '', heroFlow: 'true' }; journey.tokens.add('is-static'); }
  root.closest = () => journey;
  const updates = [], pauses = [], returns = [], timers=new Map(); let disposed = 0, observer, nextTimer=0;
  const viewer = { update(state, options) { updates.push({ ...state, ...options }); }, returnToMachine(value) { returns.push(value); }, pause(value) { pauses.push(value); }, dispose() { disposed++; } };
  let loads=0,release;
  const pending=delayed?new Promise(resolve=>{release=()=>resolve(viewer);}):null;
  const module = { createMatcherModel: async () => { loads++;if (unavailable) throw new Error('Unavailable'); return pending||viewer; } };
  const code = exhibitCode.replace("await import('./matcher-film.js')", 'await getModelModule()');
  runInNewContext(code, { document, window, matchMedia: media => media.includes('reduce') ? query : phone, setTimeout:(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),navigator: {connection:{saveData}}, location: { hash: '' }, AbortController, CustomEvent, Element: Node, URL, requestAnimationFrame: fn => fn(), getModelModule: async () => module, IntersectionObserver: class { constructor(cb) { observer = cb; } observe() {} disconnect() {} } });
  if(observe)observer([{isIntersecting:true}]);
  return { root, modes, parts, panels, nodes, toggle, updates, pauses, returns, query, phone, window, document, journey, timers, loads:()=>loads,release, observe: onscreen=>observer([{isIntersecting:onscreen}]), tick:()=>{const pending=[...timers.entries()];timers.clear();pending.forEach(([,timer])=>timer.callback());}, disposed: () => disposed, dispose: () => document.dispatchEvent(new Event('astro:before-preparation')) };
}

test('first-load phone CAD prepares before observer delivery and adopts scroll received during loading',async()=>{
  const h=setupExhibit({flow:true,observe:false,delayed:true});await settle();
  assert.equal(h.loads(),1);assert.equal(h.updates.length,0);
  h.document.dispatchEvent(new CustomEvent('portfolio:hero-matcher-progress',{detail:{nativeFlow:true,distance:180}}));
  h.observe(true);h.release();await settle();
  assert.equal(h.loads(),1);assert.ok(h.updates.at(-1).progress>.5);
  assert.equal(h.updates.at(-1).scroll,true);assert.equal(h.pauses.at(-1),false);
  h.dispose();
});

test('first-load preparation respects reduced motion and Save-Data until explicit inspection',async()=>{
  for(const option of [{reduce:true},{saveData:true}]){
    const h=setupExhibit({flow:true,observe:false,...option});await settle();assert.equal(h.loads(),0);
    h.modes[1].click();await settle();assert.equal(h.loads(),1);h.dispose();
  }
});

test('phone CAD hands over its surface before the assembly opens, and reverses its target', async () => {
  const h=setupExhibit({flow:true});await settle();
  const scroll=distance=>h.document.dispatchEvent(new CustomEvent('portfolio:hero-matcher-progress',{detail:{nativeFlow:true,distance}}));
  scroll(-10);assert.equal(h.nodes.model.style['--matcher-live-blend'],'0');
  scroll(20);assert.ok(Number(h.nodes.model.style['--matcher-live-blend'])>0);assert.equal(h.updates.at(-1).progress,0);
  scroll(180);assert.equal(h.nodes.model.style['--matcher-live-blend'],'1');
  assert.ok(h.updates.at(-1).progress>.5);assert.equal(h.updates.at(-1).scroll,true);
  scroll(80);assert.ok(h.updates.at(-1).progress<.3);
  scroll(-1);assert.equal(h.updates.at(-1).progress,0);assert.equal(h.timers.size,0);
  h.dispose();
});

test('phone portrait remains visible when CAD is unavailable or motion is reduced', async () => {
  for (const option of [{ unavailable: true }, { reduce: true }]) {
    const h = setupExhibit({ flow: true, ...option }); await settle();
    h.document.dispatchEvent(new CustomEvent('portfolio:journey-progress', { detail: { id: 'matcher', local: .6, participants: ['matcher'] } }));
    h.document.dispatchEvent(new CustomEvent('portfolio:hero-matcher-progress', { detail: { nativeFlow: true, distance: 400, scroll: 1100 } }));
    assert.equal(h.nodes.model.style['--matcher-live-blend'], '0');
    assert.equal(h.nodes.portrait.hidden, false);
    h.dispose();
  }
});

test('phone inspection keeps the selected component through reverse scrolling and return to the top', async () => {
  const h = setupExhibit({ flow: true }); await settle();
  h.modes[1].click(); h.parts[1].click();
  for(const scroll of [400,100,0]) h.document.dispatchEvent(new CustomEvent('portfolio:hero-matcher-progress', { detail: {
    nativeFlow: true, distance: scroll - 90, scroll, scrollingUp: true,
  } }));
  assert.equal(h.root.dataset.mode,'inside');
  assert.equal(h.root.dataset.heroReturning,undefined);
  assert.equal(h.nodes.portrait.hidden,true);
  assert.equal(h.updates.at(-1).part,'motors');
  assert.equal(h.returns.length,0);
  h.modes[0].click(); assert.equal(h.root.dataset.mode,'machine');
  assert.equal(h.nodes.portrait.hidden,false);
  h.dispose();
});
test('matcher modes interrupt the aperture and select the latest mode immediately', async () => {
  const h = setupExhibit(); await settle();
  h.modes[1].click(); h.parts[1].click(); h.parts[2].click();
  assert.equal(h.updates.at(-1).part,'control');
  assert.equal(h.updates.at(-1).duration,300);
  h.modes[2].click();
  const tuneReveal = h.nodes.tuning.animations.at(-1);
  assert.equal(tuneReveal.options.duration,320);
  assert.equal(h.nodes.visual.hidden,true);
  assert.equal(h.pauses.at(-1),true);
  h.modes[3].click();
  assert.equal(tuneReveal.cancelled,true);
  const labReveal = h.nodes.lab.animations.at(-1);
  h.modes[0].click();
  assert.equal(labReveal.cancelled,true);
  assert.equal(h.root.dataset.mode,'machine');
  assert.equal(h.nodes.tuning.hidden,true);
  assert.equal(h.toggle.getAttribute('aria-expanded'),'false');
  assert.equal(h.panels[0].hidden,false);
  assert.ok(h.panels.slice(1).every(panel=>panel.hidden));
  assert.equal(h.updates.at(-1).duration,420);
  assert.equal(h.pauses.at(-1),false);
  h.dispose(); assert.equal(h.disposed(),1);
});
test('outgoing matcher stays available through the boundary and pauses only after exit', async () => {
  const h = setupExhibit(); await settle();
  h.modes[2].click();
  h.document.dispatchEvent(new CustomEvent('portfolio:journey-progress',{detail:{id:'vehicle',local:0,locals:{matcher:1},participants:['matcher','vehicle']}}));
  assert.equal(h.root.dataset.mode,'tune');
  h.document.dispatchEvent(new CustomEvent('portfolio:journey-progress',{detail:{id:'vehicle',local:.2,participants:['vehicle']}}));
  assert.equal(h.root.dataset.mode,'machine');
  assert.equal(h.pauses.at(-1),true);
  h.dispose();
});
test('preference and resize cancel motion; cleanup prevents later input', async () => {
  const h = setupExhibit(); await settle();
  h.modes[3].click(); const first = h.nodes.lab.animations.at(-1);
  h.window.dispatchEvent(new Event('resize'));
  assert.equal(first.cancelled,true); assert.notEqual(h.updates.at(-1).scrub,true);
  h.modes[2].click(); const second = h.nodes.tuning.animations.at(-1);
  h.query.matches=true; h.query.dispatchEvent(new Event('change'));
  assert.equal(second.cancelled,true); assert.equal(h.updates.at(-1).scrub,true);
  h.modes[3].click(); assert.equal(h.nodes.lab.animations.length,1);
  h.dispose(); const count=h.updates.length; h.modes[1].click();
  assert.equal(h.updates.length,count); assert.equal(h.disposed(),1);
});
test('unavailable CAD retains an operable raster exhibit and tuner', async () => {
  const h = setupExhibit({unavailable:true}); await settle();
  assert.equal(h.root.dataset.renderer,'fallback');
  h.modes[1].click(); await settle();
  assert.equal(h.nodes.model.hidden,false); assert.ok(h.nodes.render.src.includes('landscape-capacitors.webp'));
  h.modes[2].click(); assert.equal(h.nodes.tuning.hidden,false);
  h.dispose();
});

// Run the camera controller against vector math and a manual frame clock.
// This verifies actual interruption and time behavior without requiring WebGL.
class Vector {
  constructor(x=0,y=0,z=0) { this.set(x,y,z); }
  set(x,y,z) { Object.assign(this,{x,y,z}); return this; }
  copy(v) { return this.set(v.x,v.y,v.z); }
  clone() { return new Vector(this.x,this.y,this.z); }
  lerpVectors(a,b,t) { return this.set(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t); }
}
function pose() {
  let clock=0,nextId=0; const frames=new Map();
  const camera={position:new Vector(7,-10,7)}, cameraTarget=new Vector(7,-10,7);
  const rotors=[{rotation:{y:0}},{rotation:{y:0}}], rotorTargets=[0,0];
  const scope={camera,cameraTarget,rotors,rotorTargets,state:{mode:'machine',part:'capacitors',m1:72,m2:108,progress:0},tween:null,returnPose:null,projectionMix:0,projectionTarget:0,machinePosition:[7,-10,7],heroLinked:false,raf:0,disposed:false,paused:false,pausedAt:0,assemblyMix:0,assemblyTarget:0,assemblyTween:null,scrollingPose:false,lastFrame:null,stepMechanism,matcherAssemblyPose,motion:{matches:false},parts:[],performance:{now:()=>clock},THREE:{MathUtils:{degToRad:n=>n*Math.PI/180}},draw(){},requestAnimationFrame:cb=>{const id=++nextId;frames.set(id,cb);return id;},cancelAnimationFrame:id=>frames.delete(id)};
  const code=modelCode.slice(modelCode.indexOf('  function frame(now)'),modelCode.indexOf('  const resize=()=>'));
  runInNewContext(code,scope);
  return {scope,update:(state,options)=>scope.update(state,options),at(now){clock=now;const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(now));},pending:()=>frames.size,position:()=>({...camera.position})};
}
test('camera pose depends on elapsed time, across different frame cadences',()=>{
  const a=pose(),b=pose(); a.update({mode:'inside'},{duration:420});b.update({mode:'inside'},{duration:420});
  [16,32,64,128,210].forEach(t=>a.at(t));b.at(210);
  assert.deepEqual(a.position(),b.position());
  a.at(420); assert.deepEqual(a.position(),{x:3,y:-5,z:11});assert.equal(a.pending(),0);
});
test('tuning notifications preserve unfinished assembly and camera transitions',()=>{
  const h=pose();h.update({mode:'inside'},{duration:420});h.at(100);
  const displayed=h.scope.assemblyMix,position=h.position();
  h.update({m1:80,m2:104});h.at(100);
  assert.equal(h.scope.assemblyMix,displayed);assert.deepEqual(h.position(),position);
  h.at(420);assert.equal(h.scope.assemblyMix,1);assert.equal(h.pending(),0);
});
test('reduced-motion inspection opens immediately and Machine keeps its documentary rest pose',()=>{
  const h=pose();h.scope.motion.matches=true;h.update({mode:'inside'},{duration:420});
  assert.equal(h.scope.assemblyMix,1);assert.equal(h.pending(),0);
  h.update({mode:'machine',progress:1},{scroll:true});
  assert.equal(h.scope.assemblyMix,0);assert.equal(h.pending(),0);
});
test('camera interruption begins at the displayed pose; direct scroll cancels its clock',()=>{
  const h=pose();h.update({mode:'inside'},{duration:420});h.at(100);
  const displayed=h.position();h.update({part:'motors'},{duration:300});h.at(100);
  assert.deepEqual(h.position(),displayed);
  h.at(400);assert.deepEqual(h.position(),{x:7,y:-11,z:4});
  h.update({part:'control'},{duration:300});assert.equal(h.pending(),1);
  h.update({mode:'machine',progress:.5},{scrub:true});
  assert.deepEqual(h.position(),{x:7,y:-10,z:7});assert.equal(h.pending(),0);
});
test('parked matcher motion resumes its displayed pose and honors new input while paused',()=>{
  const h=pose();h.update({mode:'machine',progress:.5},{duration:1000});h.at(200);
  const rotation=h.scope.rotors[0].rotation.y;
  h.scope.pause(true);assert.equal(h.pending(),0);
  h.at(10000);h.scope.pause(false);h.at(10000);
  assert.equal(h.scope.rotors[0].rotation.y,rotation);
  h.at(10800);assert.equal(h.scope.tween,null);
  h.scope.pause(true);h.at(20000);
  const position=h.position();h.update({mode:'inside',part:'motors'},{duration:300});
  h.at(25000);h.scope.pause(false);h.at(25000);
  assert.deepEqual(h.position(),position);
  h.at(25300);assert.deepEqual(h.position(),{x:7,y:-11,z:4});assert.equal(h.pending(),0);
});

test('deep-link restoration uses the chapter controller, while history preserves exact scroll',()=>{
  const core=readFileSync(new URL('../src/scripts/portfolio-core.js',import.meta.url),'utf8');
  const code=core.slice(core.indexOf('function finishRestoreTo('),core.indexOf('function readStoredScrollRecord('));
  const events=[],frames=[];let live=true;
  const scope={window:{scrollTo:(x,y)=>events.push({y}),requestAnimationFrame:cb=>frames.push(cb)},resolveHashTarget:()=>({dataset:{journeyChapter:'vehicle'},closest:()=>({dataset:{journeyLive:live?'1':undefined}})}),scrollToHash:(hash,behavior)=>events.push({hash,behavior}),restoreHashOnUrl(){},persistPageScroll(){},revealRestoredScroll(){}};
  runInNewContext(code,scope);
  scope.finishRestoreTo(1000,'#project-vehicle',true);frames.shift()();
  assert.deepEqual(events,[{hash:'#project-vehicle',behavior:'auto'},{hash:'#project-vehicle',behavior:'auto'}]);
  events.length=0;scope.finishRestoreTo(3500,'#project-matcher');frames.shift()();
  assert.deepEqual(events,[{y:3500},{y:3500}]);
  live=false;events.length=0;scope.finishRestoreTo(1000,'#project-vehicle',true);frames.shift()();
  assert.deepEqual(events,[{y:1000},{y:1000}]);
});

test('unchanged journey progress leaves the requested camera transition uninterrupted',async()=>{
  const h=setupExhibit();await settle();
  const dispatch=progress=>h.document.dispatchEvent(new CustomEvent('portfolio:journey-progress',{detail:{id:'matcher',local:progress,participants:['matcher']}}));
  dispatch(.6);h.modes[1].click();h.modes[0].click();
  const count=h.updates.length;
  assert.equal(h.updates.at(-1).duration,420);
  dispatch(.6);
  assert.equal(h.updates.length,count);
  dispatch(.7);
  assert.equal(h.updates.at(-1).scroll,true);assert.equal(h.updates.at(-1).progress,.7);
  h.dispose();
});

test('reselecting the current matcher mode preserves its active reveal',async()=>{
  const h=setupExhibit();await settle();h.modes[2].click();
  const animation=h.nodes.tuning.animations.at(-1),count=h.updates.length;
  h.modes[2].click();
  assert.equal(animation.cancelled,false);assert.equal(h.nodes.tuning.animations.length,1);assert.equal(h.updates.length,count);
  h.dispose();assert.equal(animation.cancelled,true);
});

test('phone mode controls stay before the artwork and return to their original parent on resize or teardown', async () => {
  const h=setupExhibit({flow:true}); await settle();
  assert.equal(h.nodes.modes.parentNode,h.nodes.visual);
  h.modes[2].click(); assert.equal(h.nodes.tuning.animations.length,0);
  h.phone.matches=false; h.phone.dispatchEvent(new Event('change'));
  assert.equal(h.nodes.modes.parentNode,h.nodes.inspection);
  h.phone.matches=true; h.phone.dispatchEvent(new Event('change'));
  h.dispose(); assert.equal(h.nodes.modes.parentNode,h.nodes.inspection);
});

test('Inside owns its open inspection through forward and reverse scroll; Machine joins the latest target', async () => {
  for(const flow of [true,false]){
    const h=setupExhibit({flow});await settle();
    const progress=p=>h.document.dispatchEvent(new CustomEvent('portfolio:journey-progress',{detail:{id:'matcher',local:p,participants:['matcher']}}));
    const scroll=distance=>h.document.dispatchEvent(new CustomEvent('portfolio:hero-matcher-progress',{detail:{nativeFlow:flow,distance,scroll:distance,scrollingUp:true}}));
    progress(.6);scroll(200);h.modes[1].click();h.parts[2].click();
    const count=h.updates.length;
    progress(.1);scroll(-1);progress(.85);scroll(260);
    assert.equal(h.updates.length,count);assert.equal(h.root.dataset.mode,'inside');assert.equal(h.updates.at(-1).part,'control');
    h.modes[0].click();assert.equal(h.updates.at(-1).mode,'machine');assert.equal(h.updates.at(-1).duration,420);
    assert.ok(h.updates.at(-1).progress>.8);assert.equal(h.root.dataset.heroReturning,undefined);
    h.dispose();
  }
});

test('scroll-driven matcher pauses for offscreen, hidden and paused states and leaves no demo timers', async () => {
  const h=setupExhibit({flow:true});await settle();
  const scroll=()=>h.document.dispatchEvent(new CustomEvent('portfolio:hero-matcher-progress',{detail:{nativeFlow:true,distance:200}}));
  scroll();assert.equal(h.timers.size,0);
  h.journey.dataset.motionPaused='true';scroll();assert.equal(h.pauses.at(-1),true);
  h.journey.dataset.motionPaused='false';scroll();assert.equal(h.pauses.at(-1),false);
  h.observe(false);assert.equal(h.pauses.at(-1),true);
  h.observe(true);assert.equal(h.pauses.at(-1),false);
  h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.pauses.at(-1),true);
  h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.pauses.at(-1),false);
  h.dispose();assert.equal(h.timers.size,0);
});

test('matcher assembly reaches an open hold and reassembles with a planted camera', () => {
  const h=pose(),position=h.position();
  h.update({mode:'machine',progress:1},{scrub:true});
  assert.deepEqual(h.position(),position);assert.equal(h.scope.assemblyMix,1);
  assert.ok(h.scope.rotors[0].rotation.y>0);assert.ok(h.scope.rotors[1].rotation.y<0);
  h.update({mode:'machine',progress:0},{scrub:true});assert.deepEqual(h.position(),position);
  assert.equal(h.scope.assemblyMix,0);assert.equal(h.scope.rotors[0].rotation.y,0);
});

test('large scroll jumps and reversals cap assembly speed and stop requesting frames at rest',()=>{
  const h=pose();h.update({mode:'machine',progress:1},{scroll:true});h.at(0);h.at(1000);
  assert.ok(h.scope.assemblyMix<.1);const displayed=h.scope.assemblyMix;
  h.update({progress:0},{scroll:true});assert.equal(h.scope.assemblyMix,displayed);h.at(1016);
  assert.ok(h.scope.assemblyMix<displayed);for(let i=0;i<120;i++)h.at(1032+i*16);
  assert.equal(h.scope.assemblyMix,0);assert.equal(h.pending(),0);
});
