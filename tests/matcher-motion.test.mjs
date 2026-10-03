import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const exhibitCode = readFileSync(new URL('../src/scripts/matcher-exhibit.js', import.meta.url), 'utf8');
const modelCode = readFileSync(new URL('../src/scripts/matcher-model.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
class Node extends EventTarget {
  dataset = {}; hidden = false; attrs = {}; textContent = ''; animations = [];
  style = { willChange: '' };
  classList = { toggle() {} };
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  click() { this.dispatchEvent(new Event('click')); }
  animate(frames, options) {
    const animation = { frames, options, cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
    this.animations.push(animation); return animation;
  }
}
function setupExhibit({ reduce = false, unavailable = false } = {}) {
  const root = new Node(), window = new EventTarget(), document = new EventTarget();
  document.readyState = 'complete'; document.hidden = false; document.querySelector = () => root;
  const query = new EventTarget(); query.matches = reduce;
  const modes = ['machine','inside','tune','lab'].map(id => { const n = new Node(); n.dataset.matcherMode = id; return n; });
  const parts = ['capacitors','motors','control'].map(id => { const n = new Node(); n.dataset.matcherPart = id; return n; });
  const panels = modes.map(mode => { const n = new Node(); n.dataset.matcherPanel = mode.dataset.matcherMode; return n; });
  const details = parts.map(part => { const n = new Node(); n.dataset.matcherDetail = part.dataset.matcherPart; return n; });
  const names = ['visual','model','canvas','render','lab','tuning','callouts','angles','caption','modes','live','c1','c2'];
  const nodes = Object.fromEntries(names.map(name => [name,new Node()]));
  const toggle = new Node(); toggle.setAttribute('aria-expanded','false');
  toggle.addEventListener('click', () => toggle.setAttribute('aria-expanded',String(toggle.getAttribute('aria-expanded') !== 'true')));
  root.querySelector = selector => {
    if (selector === '[data-instrument-toggle]') return toggle;
    if (selector === '.matcher-aperture') return nodes.visual;
    const part = selector.match(/data-matcher-detail="([^"]+)"/);
    if (part) return { textContent: part[1] };
    const name = selector.match(/^\[data-matcher-([^\]]+)\]$/)?.[1];
    return nodes[name] ?? null;
  };
  root.querySelectorAll = selector => ({ '[data-matcher-mode]': modes, '[data-matcher-part]': parts, '[data-matcher-panel]': panels, '[data-matcher-detail]': details })[selector] ?? [];
  root.closest = () => new Node();
  const updates = [], pauses = []; let disposed = 0, observer;
  const viewer = { update(state, options) { updates.push({ ...state, ...options }); }, pause(value) { pauses.push(value); }, dispose() { disposed++; } };
  const module = { createMatcherModel: async () => { if (unavailable) throw new Error('Unavailable'); return viewer; } };
  const code = exhibitCode.replace("await import('./matcher-model.js')", 'await getModelModule()');
  runInNewContext(code, { document, window, matchMedia: () => query, navigator: {}, location: { hash: '' }, AbortController, CustomEvent, Element: Node, URL, requestAnimationFrame: fn => fn(), getModelModule: async () => module, IntersectionObserver: class { constructor(cb) { observer = cb; } observe() {} disconnect() {} } });
  observer([{isIntersecting:true}]);
  return { root, modes, parts, panels, nodes, toggle, updates, pauses, query, window, document, disposed: () => disposed, dispose: () => document.dispatchEvent(new Event('astro:before-preparation')) };
}
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
  assert.equal(first.cancelled,true); assert.equal(h.updates.at(-1).scrub,true);
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
  assert.equal(h.nodes.model.hidden,false); assert.ok(h.nodes.render.src.includes('inside.webp'));
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
  const scope={camera,cameraTarget,rotors,rotorTargets,state:{mode:'machine',part:'capacitors',m1:72,m2:108,progress:0},tween:null,raf:0,disposed:false,paused:false,motion:{matches:false},parts:[],performance:{now:()=>clock},THREE:{MathUtils:{degToRad:n=>n*Math.PI/180}},draw(){},requestAnimationFrame:cb=>{const id=++nextId;frames.set(id,cb);return id;},cancelAnimationFrame:id=>frames.delete(id)};
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
test('camera interruption begins at the displayed pose; direct scroll cancels its clock',()=>{
  const h=pose();h.update({mode:'inside'},{duration:420});h.at(100);
  const displayed=h.position();h.update({part:'motors'},{duration:300});h.at(100);
  assert.deepEqual(h.position(),displayed);
  h.at(400);assert.deepEqual(h.position(),{x:7,y:-11,z:4});
  h.update({part:'control'},{duration:300});assert.equal(h.pending(),1);
  h.update({mode:'machine',progress:.5},{scrub:true});
  assert.deepEqual(h.position(),{x:2.5,y:-5.5,z:11});assert.equal(h.pending(),0);
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
  assert.equal(h.updates.at(-1).scrub,true);assert.equal(h.updates.at(-1).progress,.7);
  h.dispose();
});

test('reselecting the current matcher mode preserves its active reveal',async()=>{
  const h=setupExhibit();await settle();h.modes[2].click();
  const animation=h.nodes.tuning.animations.at(-1),count=h.updates.length;
  h.modes[2].click();
  assert.equal(animation.cancelled,false);assert.equal(h.nodes.tuning.animations.length,1);assert.equal(h.updates.length,count);
  h.dispose();assert.equal(animation.cancelled,true);
});
