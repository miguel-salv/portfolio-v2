import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMatcherModel,matcherFilmFrame,transparentFilmExtension} from '../src/scripts/matcher-film.js';

const metadata={fps:30,frameCount:61,assemblyEnd:30,views:{capacitors:40,motors:50,control:60},width:1080,height:810,
  frames:Array.from({length:61},(_,i)=>({assembly:Math.min(1,i/30),anchors:{capacitors:[50,25],motors:[75,60],control:[35,75]}}))};

test('film destinations keep scroll inside the assembly action and component views at exact endpoints',()=>{
  assert.equal(matcherFilmFrame({mode:'machine',progress:1},metadata),30);
  assert.equal(matcherFilmFrame({mode:'machine',progress:-1},metadata),0);
  assert.equal(matcherFilmFrame({mode:'machine',progress:NaN},metadata),0);
  assert.equal(matcherFilmFrame({mode:'machine',progress:1},metadata,true),0);
  assert.equal(matcherFilmFrame({mode:'inside',part:'motors'},metadata),50);
  assert.equal(matcherFilmFrame({mode:'inside',part:'control'},metadata,true),60);
});
test('transparent films choose Apple HEVC even when WebKit reports VP9 support',()=>{
  const probe={canPlayType:()=> 'probably'};
  assert.equal(transparentFilmExtension(probe,'Apple Computer, Inc.'),'.mov');
  assert.equal(transparentFilmExtension(probe,'Google Inc.'),'.webm');
  assert.equal(transparentFilmExtension({canPlayType:type=>type.includes('hvc1')?'maybe':''},''),'.mov');
});

async function harness(run,{reduce=false,delayed=false}={}){
  const saved=new Map(),install=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  const frames=new Map(),nodes=[],requests=[],poses=[];let id=0,now=0,releaseMetadata;
  const queries=new Map();
  const abort=new AbortController();
  class Node extends EventTarget{
    constructor(tag){super();this.tagName=tag.toUpperCase();this.dataset={};this.attributes={};this.readyState=0;this.duration=61/30;this.seeking=false;this.time=0;this.hidden=false;this.writes=0;nodes.push(this);}
    setAttribute(name,value){this.attributes[name]=value;}
    getAttribute(name){return name==='src'?this.src:this.attributes[name]??null;}
    removeAttribute(name){if(name==='src')this.src='';delete this.attributes[name];}
    remove(){this.removed=true;}
    canPlayType(){return 'probably';}
    pause(){} load(){} get currentTime(){return this.time;}
    set currentTime(value){this.time=value;this.seeking=true;this.writes++;}
    decode(first=false){this.readyState=4;this.seeking=false;this.dispatchEvent(new Event(first?'loadeddata':'seeked'));}
  }
  install('document',{hidden:false,createElement:tag=>new Node(tag)});
  install('navigator',{vendor:'Google Inc.'});
  install('matchMedia',query=>{
    if(!queries.has(query)){const q=new EventTarget();q.matches=query.includes('reduce')&&reduce;queries.set(query,q);}return queries.get(query);
  });
  install('ResizeObserver',class{observe(){} disconnect(){}});
  install('requestAnimationFrame',cb=>{frames.set(++id,cb);return id;});
  install('cancelAnimationFrame',key=>frames.delete(key));
  install('fetch',async source=>{requests.push(source);if(delayed)await new Promise(resolve=>{releaseMetadata=resolve;});return {ok:true,json:async()=>metadata};});
  const mount={dataset:{},append(){},getBoundingClientRect:()=>({width:1080,height:810})};
  const tick=()=>{now+=16;const batch=[...frames.values()];frames.clear();batch.forEach(cb=>cb(now));};
  const settle=()=>{for(let i=0;i<300&&frames.size;i++){tick();nodes.filter(n=>n.tagName==='VIDEO'&&!n.removed&&n.seeking).forEach(n=>n.decode());}};
  let viewer;
  try{
    const loading=createMatcherModel(mount,{signal:abort.signal,onPose:pose=>poses.push(pose)});
    if(delayed){await Promise.resolve();releaseMetadata();}
    viewer=await loading;
    await run({viewer,nodes,requests,frames,poses,queries,tick,settle,mount,abort,video:()=>nodes.find(n=>n.tagName==='VIDEO'&&n.src&&!n.removed)});
  }finally{viewer?.dispose();abort.abort();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('late decode uses the latest selection with one video, then reverses to the seated hero',async()=>{
  await harness(async h=>{
    h.viewer.update({mode:'inside',part:'motors'});
    h.viewer.update({mode:'inside',part:'control'});
    h.viewer.update({mode:'inside',part:'capacitors'});
    assert.equal(h.requests.length,1);assert.equal(h.nodes.filter(n=>n.src?.endsWith('.webm')).length,1);
    assert.equal(h.viewer.isReady(),false);
    h.video().decode(true);h.settle();
    assert.equal(h.mount.dataset.filmFrame,'40');assert.equal(h.viewer.isSeated(),false);
    h.viewer.update({mode:'inside',part:'control'});h.tick();
    h.viewer.update({mode:'machine',progress:0});h.video().decode();h.settle();
    assert.equal(h.mount.dataset.filmFrame,'0');assert.equal(h.viewer.isSeated(),true);
    assert.equal(h.frames.size,0);assert.equal(h.video().loop,false);
  });
});
test('paused inspection holds its decoded frame and resumes the latest destination without a seek queue',async()=>{
  await harness(async h=>{
    h.video().decode(true);h.viewer.update({mode:'inside',part:'control'});h.tick();h.video().decode();
    h.viewer.pause(true);const held=h.video().currentTime,writes=h.video().writes;
    h.viewer.update({mode:'inside',part:'motors'});h.tick();assert.equal(h.video().currentTime,held);assert.equal(h.video().writes,writes);
    h.viewer.pause(false);h.settle();assert.equal(h.mount.dataset.filmFrame,'50');
    h.abort.abort();assert.equal(h.frames.size,0);assert.equal(h.mount.dataset.filmFrame,undefined);assert.equal(h.video(),undefined);
  });
});
test('reduced motion uses rendered component stills without loading a film',async()=>{
  await harness(async h=>{
    const image=h.nodes.find(n=>n.tagName==='IMG');
    image.dispatchEvent(new Event('load'));
    h.viewer.update({mode:'inside',part:'control'});image.dispatchEvent(new Event('load'));
    assert.ok(image.src.endsWith('landscape-control.webp'));assert.equal(h.mount.dataset.filmFrame,'60');
    assert.equal(h.nodes.filter(n=>n.tagName==='VIDEO'&&n.src).length,0);assert.equal(h.frames.size,0);
    h.viewer.update({mode:'machine',progress:1});image.dispatchEvent(new Event('load'));
    assert.equal(h.viewer.isSeated(),true);
  },{reduce:true});
});
test('responsive replacement keeps the decoded film until ready and ignores a cancelled phone load',async()=>{
  await harness(async h=>{
    const desktop=h.video();desktop.decode(true);h.viewer.update({mode:'inside',part:'capacitors'});h.settle();
    const phone=h.queries.get('(max-width: 760px)');phone.matches=true;phone.dispatchEvent(new Event('change'));
    for(let i=0;i<8;i++)await Promise.resolve();
    const replacement=h.nodes.find(n=>n.src?.includes('matcher-portrait'));
    assert.ok(replacement);assert.equal(desktop.removed,undefined);assert.equal(h.viewer.isReady(),true);
    h.viewer.update({part:'motors'});h.settle();assert.equal(desktop.removed,undefined);
    phone.matches=false;phone.dispatchEvent(new Event('change'));
    assert.equal(replacement.removed,true);replacement.decode(true);h.settle();
    assert.equal(h.video(),desktop);assert.equal(h.mount.dataset.filmFrame,'50');assert.equal(desktop.removed,undefined);
  });
});
test('a decoding failure restores fallback readiness and disposes the failed media',async()=>{
  await harness(async h=>{
    const video=h.video();video.decode(true);h.viewer.update({mode:'inside',part:'control'});h.tick();
    video.dispatchEvent(new Event('error'));assert.equal(h.viewer.isReady(),false);assert.equal(video.removed,true);
    assert.equal(h.frames.size,0);assert.equal(h.poses.at(-1).ready,false);
    for(let i=0;i<8;i++)await Promise.resolve();
    const image=h.nodes.find(node=>node.tagName==='IMG');assert.ok(image);
    image.dispatchEvent(new Event('load'));assert.equal(h.mount.dataset.filmFrame,'60');assert.equal(h.viewer.isReady(),true);
    h.viewer.update({mode:'machine',progress:1});image.dispatchEvent(new Event('load'));
    assert.equal(h.mount.dataset.filmFrame,'0');assert.equal(h.viewer.isSeated(),true);
  });
});
