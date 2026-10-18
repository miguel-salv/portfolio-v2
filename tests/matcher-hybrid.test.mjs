import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMatcherModel} from '../src/scripts/matcher-hybrid.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
class Layer {
  children=[];style={};dataset={};
  append(...nodes){this.children.push(...nodes);nodes.forEach(n=>n.parent=this);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
}
async function setup({delayed=false,failed=false}={}) {
  globalThis.document={createElement:()=>new Layer()};
  const mount=new Layer(),frames=[],pauses=[],updates=[];
  let filmOptions,liveOptions,release,liveLoads=0,filmSettled=true,disposed=0;
  const film={update(s){updates.push(['film',s]);},pause(p){pauses.push(['film',p]);},isReady:()=>true,isSettled:()=>filmSettled,isSeated:()=>true,dispose(){disposed++;}};
  const live={update(s){updates.push(['live',s]);liveOptions.onPose({ready:true,assembly:0,seated:true});},pause(p){pauses.push(['live',p]);},isSeated:()=>true,dispose(){disposed++;}};
  const pending=delayed?new Promise(resolve=>{release=()=>resolve(live);}):null;
  const model=await createMatcherModel(mount,{signal:new AbortController().signal,onPose:p=>frames.push(p),onError:e=>frames.push({error:e.message})},{
    film:async()=>({createMatcherModel:async(_,o)=>{filmOptions=o;return film;}}),
    live:async()=>({createMatcherModel:async(_,o)=>{liveLoads++;liveOptions=o;if(failed)throw Error('No WebGL');return pending||live;}}),
  });
  return {mount,model,frames,pauses,updates,liveLoads:()=>liveLoads,release,paintFilm:()=>filmOptions.onPose({ready:true,assembly:0,seated:true}),paintLive:()=>liveOptions.onPose({ready:true,assembly:0,seated:true}),setFilmSettled:v=>filmSettled=v,disposed:()=>disposed};
}
const visible=h=>h.mount.children.filter(n=>n.style.opacity!=='0');
test('inspection uses only the offline owner and does not load WebGL',async()=>{
  const h=await setup();h.model.update({mode:'inside',part:'control'});
  assert.equal(h.liveLoads(),0);assert.equal(visible(h).length,1);assert.equal(h.mount.dataset.owner,'film');h.model.dispose();
});
test('tune waits for a valid live frame and adopts the latest shared angles',async()=>{
  const h=await setup({delayed:true});h.model.update({mode:'tune',m1:100,m2:90});await settle();
  assert.equal(visible(h).length,1);assert.equal(h.mount.children[0].style.opacity,'1');
  h.model.update({m1:147,m2:8});h.release();await settle();
  assert.equal(h.mount.dataset.owner,'live');assert.equal(visible(h).length,1);
  const last=h.updates.filter(([id])=>id==='live').at(-1)[1];assert.equal(last.m1,147);assert.equal(last.m2,8);h.model.dispose();
});
test('renderer ownership never overrides the scene ancestor visibility',async()=>{
  const h=await setup();h.model.update({mode:'tune'});await settle();
  assert.equal(h.mount.dataset.owner,'live');
  assert.ok(h.mount.children.every(layer=>layer.style.visibility===undefined));
  assert.equal(h.mount.children.map(layer=>Number(layer.style.opacity)).reduce((a,b)=>a+b,0),1);h.model.dispose();
});
test('leaving tune during its download cannot steal inspection ownership',async()=>{
  const h=await setup({delayed:true});h.model.update({mode:'tune'});await settle();h.model.update({mode:'inside'});h.release();await settle();
  h.paintLive();assert.equal(h.mount.dataset.owner,'film');assert.equal(visible(h).length,1);h.model.dispose();
});
test('return from live keeps that frame until the requested film frame paints',async()=>{
  const h=await setup();h.model.update({mode:'tune'});await settle();assert.equal(h.mount.dataset.owner,'live');
  h.setFilmSettled(false);h.model.update({mode:'inside',part:'motors'});assert.equal(h.mount.dataset.owner,'live');
  h.paintFilm();assert.equal(h.mount.dataset.owner,'film');assert.equal(visible(h).length,1);h.model.dispose();
});
test('WebGL failure retains the film and leaves the tuner state usable',async()=>{
  const h=await setup({failed:true});h.model.update({mode:'tune',m1:1,m2:180});await settle();
  assert.equal(h.mount.dataset.owner,'film');assert.ok(h.frames.some(f=>f.error==='No WebGL'));assert.equal(visible(h).length,1);h.model.dispose();
});
test('a late live completion after disposal cleans itself without a surface or callback',async()=>{
  const h=await setup({delayed:true});h.model.update({mode:'tune'});await settle();h.model.dispose();h.release();await settle();
  assert.equal(h.mount.children.length,0);assert.equal(h.disposed(),2);assert.equal(h.frames.length,0);
});
test('hidden and offscreen pauses reach both renderers; the inactive owner stays parked',async()=>{
  const h=await setup();h.model.update({mode:'tune'});await settle();h.model.pause(true);
  assert.deepEqual(h.pauses.slice(-2),[['film',true],['live',true]]);
  h.model.pause(false);assert.deepEqual(h.pauses.slice(-2),[['film',true],['live',false]]);h.model.dispose();
});
