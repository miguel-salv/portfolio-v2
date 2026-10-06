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

async function harness(run,{reduce=false,delayed=false,filmMetadata=metadata}={}){
  const saved=new Map(),install=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  const frames=new Map(),nodes=[],requests=[],poses=[];let id=0,now=0,releaseMetadata;
  const queries=new Map();
  const abort=new AbortController();
  class Node extends EventTarget{
    constructor(tag){super();this.tagName=tag.toUpperCase();this.style={};this.dataset={};this.attributes={};this.readyState=0;this.duration=61/30;this.seeking=false;this.time=0;this.hidden=false;this.writes=0;this.trace=[];nodes.push(this);}
    getContext(){
      return this.context||(this.context={
        globalCompositeOperation:'source-over',
        clearRect:()=>{this.pixels=[0,0,0,0,0,0,0,0];},
        drawImage:source=>{
          const incoming=source.pixels||[0,0,0,255,0,0,0,0];
          const old=this.pixels||[];
          this.pixels=incoming.map((value,i)=>this.context.globalCompositeOperation==='copy'||incoming[(i-i%4)+3]?value:old[i]||0);
          this.draws=(this.draws||0)+1;
        },
        getImageData:()=>({data:this.pixels})
      });
    }
    setAttribute(name,value){this.attributes[name]=value;}
    getAttribute(name){return name==='src'?this.src:this.attributes[name]??null;}
    removeAttribute(name){if(name==='src')this.src='';delete this.attributes[name];}
    remove(){this.removed=true;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);}
    canPlayType(){return 'probably';}
    pause(){} load(){} get currentTime(){return this.time;}
    set currentTime(value){this.time=value;this.seeking=true;this.writes++;this.trace.push(Math.round(value*30));}
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
  install('fetch',async source=>{requests.push(source);if(delayed)await new Promise(resolve=>{releaseMetadata=resolve;});return {ok:true,json:async()=>filmMetadata};});
  const mount={dataset:{},children:[],append(node){this.children.push(node);node.parentNode=this;},getBoundingClientRect:()=>({width:1080,height:810})};
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

test('one attached canvas replaces transparent silhouettes and keeps its pixels through empty seeks',async()=>{
  await harness(async h=>{
    const video=h.video(),canvas=h.mount.children[0];
    assert.deepEqual(h.mount.children,[canvas]);assert.equal(canvas.tagName,'CANVAS');
    assert.equal(video.parentNode,undefined,'the decoder can never become a visible layer');
    video.pixels=[1,2,3,255,0,0,0,0];video.decode(true);
    assert.deepEqual(canvas.pixels,video.pixels);
    h.viewer.update({mode:'machine',progress:1});
    while(!video.seeking)h.tick();
    video.pixels=[0,0,0,0,0,0,0,0];video.decode();
    assert.deepEqual(canvas.pixels,[1,2,3,255,0,0,0,0]);
    assert.equal(h.mount.dataset.filmFrame,'0');assert.equal(h.viewer.isReady(),true);
    while(!video.seeking)h.tick();
    video.pixels=[0,0,0,0,4,5,6,255];video.decode();
    assert.deepEqual(canvas.pixels,video.pixels,'old opaque pixels must be erased by new transparency');
    h.viewer.update({mode:'machine',progress:0});h.settle();
    assert.deepEqual(h.mount.children,[canvas]);
    h.abort.abort();assert.deepEqual(h.mount.children,[]);
  });
});

test('assembly completion follows the committed final canvas frame, never a pending seek',async()=>{
  await harness(async h=>{
    const video=h.video();video.decode(true);
    assert.equal(h.poses.at(-1).assemblyComplete,false);
    h.viewer.update({mode:'machine',progress:1});
    while(!video.seeking)h.tick();
    assert.equal(h.poses.at(-1).assemblyComplete,false);
    video.decode();h.settle();
    assert.equal(h.mount.dataset.filmFrame,'30');assert.equal(h.poses.at(-1).assemblyComplete,true);
    h.viewer.update({progress:0});h.settle();
    assert.equal(h.poses.at(-1).assemblyComplete,false);
  });
});

test('late decode uses the latest selection with one video, then reverses to the seated hero',async()=>{
  await harness(async h=>{
    h.viewer.update({mode:'inside',part:'motors'});
    h.viewer.update({mode:'inside',part:'control'});
    h.viewer.update({mode:'inside',part:'capacitors'});
    assert.equal(h.requests.length,1);assert.equal(h.nodes.filter(n=>n.src?.includes('.webm')).length,1);
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
    const canvas=h.mount.children[0];
    const desktop=h.video();desktop.decode(true);h.viewer.update({mode:'inside',part:'capacitors'});h.settle();
    const phone=h.queries.get('(max-width: 760px)');phone.matches=true;phone.dispatchEvent(new Event('change'));
    for(let i=0;i<8;i++)await Promise.resolve();
    const replacement=h.nodes.find(n=>n.src?.includes('matcher-portrait'));
    assert.ok(replacement);assert.equal(desktop.removed,undefined);assert.equal(h.viewer.isReady(),true);
    h.viewer.update({part:'motors'});h.settle();assert.equal(desktop.removed,undefined);
    phone.matches=false;phone.dispatchEvent(new Event('change'));
    assert.equal(replacement.removed,true);replacement.decode(true);h.settle();
    assert.equal(h.video(),desktop);assert.equal(h.mount.dataset.filmFrame,'50');assert.equal(desktop.removed,undefined);
    assert.deepEqual(h.mount.children,[canvas]);
    assert.equal(replacement.parentNode,undefined);
  });
});
test('a decoding failure retains the last painted frame until its still fallback is ready',async()=>{
  await harness(async h=>{
    const video=h.video();video.decode(true);h.viewer.update({mode:'inside',part:'control'});h.tick();
    video.dispatchEvent(new Event('error'));assert.equal(h.viewer.isReady(),true);assert.equal(video.removed,true);
    assert.equal(h.frames.size,0);assert.equal(h.poses.at(-1).ready,false);
    for(let i=0;i<8;i++)await Promise.resolve();
    const image=h.nodes.find(node=>node.tagName==='IMG');assert.ok(image);
    image.dispatchEvent(new Event('load'));assert.equal(h.mount.dataset.filmFrame,'60');assert.equal(h.viewer.isReady(),true);
    h.viewer.update({mode:'machine',progress:1});image.dispatchEvent(new Event('load'));
    assert.equal(h.mount.dataset.filmFrame,'0');assert.equal(h.viewer.isSeated(),true);
  });
});

const routedMetadata={...metadata,frameCount:132,views:{capacitors:40,motors:70,control:100},
  routes:[{from:'capacitors',to:'motors',start:40,end:70},
    {from:'motors',to:'control',start:70,end:100},
    {from:'capacitors',to:'control',start:101,end:131}],
  frames:Array.from({length:132},(_,i)=>({...metadata.frames[Math.min(60,i)]}))};

test('every inspection pair follows its own camera route in both directions',async()=>{
  await harness(async h=>{
    h.video().duration=132/30;h.video().decode(true);
    h.viewer.update({mode:'inside',part:'capacitors'});h.settle();
    for(const [part,expected] of [['control',131],['capacitors',101],['motors',70],['control',100],['motors',70],['capacitors',40]]){
      h.viewer.update({part});h.settle();
      assert.equal(h.mount.dataset.filmFrame,String(expected));
      assert.equal(h.frames.size,0);
    }
    h.viewer.update({part:'control'});h.settle();
    h.viewer.update({mode:'machine',progress:0});h.settle();
    assert.equal(h.mount.dataset.filmFrame,'0');
  },{filmMetadata:routedMetadata});
});
test('inspection reversal stays on its current path; a third selection starts from the decoded endpoint',async()=>{
  await harness(async h=>{
    h.video().duration=132/30;h.video().decode(true);
    h.viewer.update({mode:'inside',part:'capacitors'});h.settle();
    h.viewer.update({part:'control'});h.tick();h.video().decode();
    assert.ok(Number(h.mount.dataset.filmFrame)>=101);
    h.viewer.update({part:'capacitors'});h.settle();
    assert.equal(h.mount.dataset.filmFrame,'101');
    h.viewer.update({part:'control'});h.tick();h.video().decode();
    h.viewer.update({part:'motors'});h.settle();
    assert.equal(h.mount.dataset.filmFrame,'70');
    h.viewer.update({part:'capacitors'});h.tick();h.video().decode();
    h.viewer.pause(true);const held=h.video().currentTime;
    h.viewer.update({part:'control'});h.tick();assert.equal(h.video().currentTime,held);
    h.viewer.pause(false);h.settle();assert.equal(h.mount.dataset.filmFrame,'131');
  },{filmMetadata:routedMetadata});
});

test('a direct route selected while paused rebases only when decoding resumes',async()=>{
  await harness(async h=>{
    h.video().duration=132/30;h.video().decode(true);
    h.viewer.update({mode:'inside',part:'capacitors'});h.settle();
    h.viewer.pause(true);h.viewer.update({part:'control'});h.tick();
    assert.equal(h.mount.dataset.filmFrame,'40');
    h.viewer.pause(false);h.tick();h.video().decode();
    assert.ok(Number(h.mount.dataset.filmFrame)>=101);
    h.settle();assert.equal(h.mount.dataset.filmFrame,'131');
  },{filmMetadata:routedMetadata});
});

const modeMetadata={...routedMetadata,frameCount:180,
  routes:[...routedMetadata.routes,
    {from:'machine',to:'capacitors',start:132,end:147},
    {from:'machine',to:'motors',start:148,end:163},
    {from:'machine',to:'control',start:164,end:179}],
  frames:Array.from({length:180},(_,i)=>({...metadata.frames[Math.min(60,i)]}))};

test('Machine and every Inside camera use dedicated reversible paths without other part views',async()=>{
  await harness(async h=>{
    h.video().duration=6;h.video().decode(true);
    h.viewer.update({mode:'machine',progress:1});h.settle();
    for(const [part,start,end] of [['capacitors',132,147],['motors',148,163],['control',164,179]]){
      h.video().trace.length=0;
      h.viewer.update({mode:'inside',part});h.settle();
      assert.equal(h.mount.dataset.filmFrame,String(end));
      assert.ok(h.video().trace.every(frame=>frame>=start&&frame<=end));
      h.video().trace.length=0;
      h.viewer.update({mode:'machine',progress:1});h.settle();
      assert.equal(h.mount.dataset.filmFrame,'30');
      assert.ok(h.video().trace.every(frame=>(frame>=start&&frame<=end)||frame===30));
    }
  },{filmMetadata:modeMetadata});
});
test('mode changes finish or reverse assembly at the current scroll destination and retain film coverage',async()=>{
  await harness(async h=>{
    h.video().duration=6;h.video().decode(true);
    h.viewer.update({mode:'machine',progress:.25});h.settle();
    assert.equal(h.mount.dataset.filmFrame,'8');
    h.video().trace.length=0;
    h.viewer.update({mode:'inside',part:'control'});h.settle();
    assert.equal(h.mount.dataset.filmFrame,'179');
    assert.ok(h.video().trace.every(frame=>frame<=30||frame>=164));
    h.viewer.update({mode:'machine',progress:0});
    assert.equal(h.viewer.isCovering(),false,'the hero photograph waits for its decoded frame');
    h.settle();assert.equal(h.mount.dataset.filmFrame,'0');assert.equal(h.viewer.isCovering(),true);
  },{filmMetadata:modeMetadata});
});
test('rapid mode reversals stay on the same camera path and paused changes retain their starting pose',async()=>{
  await harness(async h=>{
    h.video().duration=6;h.video().decode(true);
    h.viewer.update({mode:'machine',progress:1});h.settle();
    h.viewer.update({mode:'inside',part:'motors'});h.tick();h.video().decode();
    h.viewer.update({mode:'machine'});h.tick();h.video().decode();
    h.viewer.update({mode:'inside',part:'motors'});h.settle();
    assert.equal(h.mount.dataset.filmFrame,'163');
    h.viewer.pause(true);const held=h.video().currentTime;
    h.viewer.update({mode:'machine',progress:.5});h.tick();assert.equal(h.video().currentTime,held);
    h.viewer.pause(false);h.settle();assert.equal(h.mount.dataset.filmFrame,'15');
    h.viewer.update({mode:'inside',part:'control'});h.tick();h.video().decode();
    h.viewer.update({mode:'machine',progress:.1});h.settle();assert.equal(h.mount.dataset.filmFrame,'3');
  },{filmMetadata:modeMetadata});
});
