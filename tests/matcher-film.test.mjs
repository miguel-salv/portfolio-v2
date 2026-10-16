import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
test('the shipped portrait keeps its opening projection through the first moving frame and every reversal',()=>{
  const film=JSON.parse(readFileSync(new URL('../public/assets/matcher/film/portrait.json',import.meta.url),'utf8'));
  const projection=frame=>50-film.frames[frame].anchors.capacitors[0];
  const opening=projection(0);
  assert.ok(Math.abs(projection(1)-opening)<.005,'the first moving frame must retain the hero size');
  for(let frame=1;frame<=film.assemblyEnd;frame++){
    assert.ok(Math.abs(projection(frame)/projection(frame-1)-1)<.01,'adjacent poses must not snap in either scroll direction');
  }
});

test('a stalled initial film falls back after twelve seconds even with repeated scroll input',async()=>{
  await harness(async h=>{
    const video=h.video();
    h.advance(11000);
    h.viewer.update({progress:.5});h.viewer.update({progress:1});
    assert.equal(h.errors.length,0);
    h.advance(1000);await h.flush();
    assert.equal(h.errors.length,1);assert.equal(video.removed,true);
    const image=h.nodes.find(node=>node.tagName==='IMG'&&!node.removed);
    assert.ok(image.src.endsWith('landscape-machine.webp'));
    image.dispatchEvent(new Event('load'));
    assert.equal(h.viewer.isReady(),true);assert.equal(h.poses.at(-1).still,true);
    assert.equal(h.timers.size,0);
  });
});
test('a stalled seek retains the last canvas until its static replacement loads',async()=>{
  await harness(async h=>{
    const video=h.video(),canvas=h.mount.children[0];
    video.pixels=[1,2,3,255,0,0,0,0];video.decode(true);
    h.viewer.update({progress:1});h.tick();
    assert.equal(video.seeking,true);
    h.advance(12000);await h.flush();
    assert.equal(h.errors.length,1);assert.equal(video.removed,true);
    assert.deepEqual(canvas.pixels,[1,2,3,255,0,0,0,0]);
    const image=h.nodes.find(node=>node.tagName==='IMG'&&!node.removed);
    image.pixels=[0,0,0,0,4,5,6,255];image.dispatchEvent(new Event('load'));
    assert.deepEqual(canvas.pixels,image.pixels);
    assert.deepEqual(h.mount.children,[canvas]);
  });
});
test('decoded progress renews the stall deadline and reaching rest removes it',async()=>{
  await harness(async h=>{
    h.video().decode(true);h.viewer.update({progress:1});
    h.advance(11000);h.tick();h.video().decode();
    h.advance(11000);assert.equal(h.errors.length,0);
    h.settle();assert.equal(h.mount.dataset.filmFrame,'30');
    assert.equal(h.timers.size,0);h.advance(20000);assert.equal(h.errors.length,0);
  });
});
test('paused, hidden and disposed films cannot expire an active stall deadline',async()=>{
  await harness(async h=>{
    h.viewer.pause(true);h.advance(20000);assert.equal(h.errors.length,0);
    h.viewer.pause(false);h.advance(11000);
    document.hidden=true;h.advance(1000);assert.equal(h.errors.length,0);
    document.hidden=false;h.viewer.pause(false);assert.equal(h.timers.size,1);
    h.abort.abort();assert.equal(h.timers.size,0);
    h.advance(20000);assert.equal(h.errors.length,0);assert.equal(h.video(),undefined);
  });
});
test('stalled metadata aborts its request and reports fallback instead of leaving initialization pending',async()=>{
  await harness(async h=>{
    assert.equal(h.errors.length,1);assert.equal(h.timers.size,0);
    assert.equal(h.video(),undefined);assert.equal(h.viewer.isReady(),false);
  },{stalledMetadata:true});
});
test('seek notifications without a new displayed frame cannot renew the deadline',async()=>{
  await harness(async h=>{
    const video=h.video();video.decode(true);h.viewer.update({progress:1});
    while(h.frames.size){h.tick();video.time=0;video.decode();}
    assert.equal(h.mount.dataset.filmFrame,'0');
    h.advance(12000);await h.flush();assert.equal(h.errors.length,1);
  });
});
test('re-encoded media uses its content signature instead of the older render signature',async()=>{
  await harness(async h=>{
    assert.ok(h.video().src.endsWith('?v=new-encoding'));
  },{filmMetadata:{...metadata,signature:'old-render',mediaSignature:'new-encoding'}});
});

const openingMetadata={...metadata,assemblyMedia:{frameCount:31,signature:'opening-encoding',
  webm:'/assets/matcher/film/matcher-landscape-assembly.webm',
  mov:'/assets/matcher/film/matcher-landscape-assembly.mov'}};

test('the smaller opening film retains the full forward and reverse assembly action',async()=>{
  await harness(async h=>{
    const opening=h.video();opening.duration=31/30;
    assert.ok(opening.src.endsWith('matcher-landscape-assembly.webm?v=opening-encoding'));
    opening.decode(true);h.viewer.update({progress:1});h.settle();
    assert.equal(h.mount.dataset.filmFrame,'30');assert.equal(h.poses.at(-1).assemblyComplete,true);
    h.viewer.update({progress:0});h.settle();
    assert.equal(h.mount.dataset.filmFrame,'0');assert.equal(h.viewer.isSeated(),true);
    assert.equal(h.nodes.filter(n=>n.tagName==='VIDEO'&&n.src).length,1);
  },{filmMetadata:openingMetadata});
});

test('Inside upgrades on demand, follows the latest selection and reuses the complete film afterward',async()=>{
  await harness(async h=>{
    const opening=h.video();opening.duration=31/30;opening.decode(true);
    const canvas=h.mount.children[0],held=[...canvas.pixels];
    h.viewer.update({mode:'inside',part:'capacitors'});
    assert.equal(h.viewer.isReady(),false);assert.deepEqual(canvas.pixels,held);
    h.viewer.update({part:'control'});await h.flush();
    const complete=h.nodes.find(n=>n.tagName==='VIDEO'&&n!==opening&&n.src);
    assert.ok(complete.src.includes('matcher-landscape.webm?'));
    complete.decode(true);h.settle();
    assert.equal(h.mount.dataset.filmFrame,'60');assert.equal(h.viewer.isReady(),true);
    assert.equal(opening.removed,true);
    h.viewer.update({mode:'machine',progress:0});h.settle();
    assert.equal(h.video(),complete);assert.equal(h.viewer.isSeated(),true);
    h.viewer.update({mode:'inside',part:'motors'});h.settle();
    assert.equal(h.video(),complete);assert.equal(h.mount.dataset.filmFrame,'50');
    assert.equal(h.requests.length,1,'the full manifest is shared by both media profiles');
  },{filmMetadata:openingMetadata});
});

test('Inside selected before cold metadata arrives loads only the complete inspection film',async()=>{
  await harness(async h=>{
    h.viewer.update({mode:'inside',part:'control'});
    h.releaseMetadata();await h.flush();
    const complete=h.video();
    assert.ok(complete.src.includes('matcher-landscape.webm?'));
    assert.equal(h.nodes.filter(n=>n.src?.includes('-assembly.')).length,0);
    complete.decode(true);h.settle();assert.equal(h.mount.dataset.filmFrame,'60');
  },{filmMetadata:openingMetadata,delayed:true,holdMetadata:true});
});

test('a reversal during the inspection upgrade adopts the latest Machine destination',async()=>{
  await harness(async h=>{
    const opening=h.video();opening.duration=31/30;opening.decode(true);
    h.viewer.update({mode:'inside',part:'control'});
    h.viewer.update({mode:'machine',progress:1});await h.flush();
    const complete=h.nodes.find(n=>n.tagName==='VIDEO'&&n!==opening&&n.src);
    complete.decode(true);h.settle();
    assert.equal(h.video(),complete);assert.equal(h.mount.dataset.filmFrame,'30');
    assert.equal(h.frames.size,0);assert.equal(h.viewer.isReady(),true);
    h.viewer.update({progress:0});h.settle();assert.equal(h.viewer.isSeated(),true);
  },{filmMetadata:openingMetadata});
});

test('inspection upgrade failure preserves the component still fallback and stops media work',async()=>{
  await harness(async h=>{
    const opening=h.video();opening.duration=31/30;opening.decode(true);
    h.viewer.update({mode:'inside',part:'control'});await h.flush();
    const complete=h.nodes.find(n=>n.tagName==='VIDEO'&&n!==opening&&n.src);
    complete.dispatchEvent(new Event('error'));await h.flush();
    const still=h.nodes.find(n=>n.tagName==='IMG'&&!n.removed);
    assert.ok(still.src.endsWith('landscape-control.webp'));
    still.dispatchEvent(new Event('load'));
    assert.equal(h.mount.dataset.filmFrame,'60');assert.equal(h.viewer.isReady(),true);
    assert.equal(h.video(),undefined);assert.equal(h.frames.size,0);
  },{filmMetadata:openingMetadata});
});

test('section navigation seats an inspection pose directly, including a reversal before decode',async()=>{
  await harness(async h=>{
    const video=h.video();video.decode(true);
    h.viewer.update({mode:'inside',part:'control'},{immediate:true});h.tick();
    assert.equal(h.viewer.isSettled(),false);
    assert.equal(video.trace.at(-1),60);
    h.viewer.update({mode:'machine',progress:0},{immediate:true});
    video.decode();h.tick();video.decode();h.settle();
    assert.equal(h.mount.dataset.filmFrame,'0');assert.equal(h.viewer.isSettled(),true);
    assert.equal(video.trace.filter(frame=>frame!==0&&frame!==60).length,0,'header navigation cannot play intervening camera frames');
    h.viewer.update({progress:1});h.tick();
    assert.ok(video.trace.at(-1)>0&&video.trace.at(-1)<30,'manual scroll retains the assembly motion');
  });
});

async function harness(run,{reduce=false,delayed=false,holdMetadata=false,stalledMetadata=false,quantizedFrames=false,frameCallbacks=false,ignoreCopy=false,filmMetadata=metadata}={}){
  const saved=new Map(),install=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  const frames=new Map(),timers=new Map(),nodes=[],requests=[],poses=[],errors=[],loadingStates=[];
  let id=0,now=0,timerClock=0,releaseMetadata;
  const advance=milliseconds=>{
    const until=timerClock+milliseconds;
    for(;;){
      const next=[...timers.entries()].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      timerClock=next[1].at;timers.delete(next[0]);next[1].callback();
    }
    timerClock=until;
  };
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  const queries=new Map();
  const abort=new AbortController();
  class Node extends EventTarget{
    constructor(tag){super();this.tagName=tag.toUpperCase();this.style={};this.dataset={};this.attributes={};this.readyState=0;this.duration=61/30;this.seeking=false;this.time=0;this.hidden=false;this.writes=0;this.trace=[];nodes.push(this);
      if(frameCallbacks&&this.tagName==='VIDEO'){
        this.requestVideoFrameCallback=callback=>{this.frameCallback=callback;return ++id;};
        this.cancelVideoFrameCallback=()=>{this.frameCallback=null;};
      }
    }
    getContext(){
      return this.context||(this.context={
        globalCompositeOperation:'source-over',
        clearRect:()=>{this.pixels=[0,0,0,0,0,0,0,0];},
        drawImage:source=>{
          const incoming=source.pixels||[0,0,0,255,0,0,0,0];
          const old=this.pixels||[];
          this.pixels=incoming.map((value,i)=>(!ignoreCopy&&this.context.globalCompositeOperation==='copy')||incoming[(i-i%4)+3]?value:old[i]||0);
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
    pause(){} load(){this.callbackBeforeLoad=Boolean(this.frameCallback);} get currentTime(){return this.time;}
    paintFrame(mediaTime=this.time){const callback=this.frameCallback;this.frameCallback=null;callback?.(now,{mediaTime});}
    set currentTime(value){this.time=value;this.seeking=true;this.writes++;this.trace.push(Math.round(value*30));}
    decode(first=false){
      if(quantizedFrames){
        // WebM timestamps are rounded to milliseconds. A seek just before a
        // frame's actual timestamp displays the preceding camera pose.
        let decoded=0;
        for(let frame=1;frame<filmMetadata.frameCount;frame++){
          if(Math.round(frame/filmMetadata.fps*1000)/1000>this.time)break;
          decoded=frame;
        }
        this.pixels=[decoded,0,0,255,0,0,0,0];
      }
      this.readyState=4;this.seeking=false;this.dispatchEvent(new Event(first?'loadeddata':'seeked'));
    }
  }
  install('document',{hidden:false,createElement:tag=>new Node(tag)});
  install('navigator',{vendor:'Google Inc.'});
  install('matchMedia',query=>{
    if(!queries.has(query)){const q=new EventTarget();q.matches=query.includes('reduce')&&reduce;queries.set(query,q);}return queries.get(query);
  });
  install('ResizeObserver',class{observe(){} disconnect(){}});
  install('requestAnimationFrame',cb=>{frames.set(++id,cb);return id;});
  install('cancelAnimationFrame',key=>frames.delete(key));
  install('setTimeout',(callback,delay)=>{timers.set(++id,{callback,at:timerClock+delay});return id;});
  install('clearTimeout',key=>timers.delete(key));
  install('fetch',async(source,{signal}={})=>{
    requests.push(source);
    if(stalledMetadata)await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Request aborted')),{once:true}));
    if(delayed)await new Promise(resolve=>{releaseMetadata=resolve;});
    return {ok:true,json:async()=>filmMetadata};
  });
  const mount={dataset:{},children:[],append(node){this.children.push(node);node.parentNode=this;},getBoundingClientRect:()=>({width:1080,height:810})};
  const tick=()=>{now+=16;const batch=[...frames.values()];frames.clear();batch.forEach(cb=>cb(now));};
  const settle=()=>{for(let i=0;i<300&&frames.size;i++){tick();nodes.filter(n=>n.tagName==='VIDEO'&&!n.removed&&n.seeking).forEach(n=>n.decode());}};
  let viewer;
  try{
    const loading=createMatcherModel(mount,{signal:abort.signal,onPose:pose=>poses.push(pose),onError:()=>errors.push(true),onLoading:value=>loadingStates.push(value)});
    if(delayed&&!holdMetadata){await Promise.resolve();releaseMetadata();}
    if(stalledMetadata)advance(12000);
    viewer=await loading;
    await flush();
    await run({viewer,nodes,requests,frames,timers,poses,errors,loadingStates,releaseMetadata:()=>releaseMetadata(),queries,tick,settle,advance,flush,mount,abort,video:()=>nodes.find(n=>n.tagName==='VIDEO'&&n.src&&!n.removed)});
  }finally{viewer?.dispose();abort.abort();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('cold metadata loading accepts input immediately and reveals only the latest requested view',async()=>{
  await harness(async h=>{
    assert.equal(h.video(),undefined,'the controller is usable before metadata arrives');
    h.viewer.update({mode:'inside',part:'capacitors'});
    h.viewer.update({part:'control'});
    h.viewer.update({part:'motors'});
    assert.deepEqual(h.loadingStates,[true]);
    h.releaseMetadata();await h.flush();
    const video=h.video();assert.ok(video);
    video.decode(true);assert.equal(h.viewer.isReady(),false,'a stale opening frame cannot replace the selected still');
    h.tick();video.decode();h.settle();
    assert.equal(h.mount.dataset.filmFrame,'50');
    assert.equal(h.viewer.isReady(),true);assert.deepEqual(h.loadingStates,[true,false]);
    assert.equal(h.requests.length,1);
  },{delayed:true,holdMetadata:true});
});

test('an unbuffered view retains immediate still feedback until its latest destination decodes',async()=>{
  await harness(async h=>{
    const video=h.video();video.decode(true);
    video.buffered={length:1,start:()=>0,end:()=>.5};
    h.viewer.update({mode:'inside',part:'control'});
    assert.equal(h.viewer.isReady(),false);assert.equal(h.loadingStates.at(-1),true);
    h.viewer.update({part:'motors'});h.tick();video.decode();h.settle();
    assert.equal(h.mount.dataset.filmFrame,'50');assert.equal(h.viewer.isReady(),true);
    assert.equal(h.loadingStates.at(-1),false);
  });
});

test('Safari canvas commits only drawable frames and uses their decoded timestamp',async()=>{
  await harness(async h=>{
    const video=h.video();assert.equal(video.callbackBeforeLoad,true);
    video.decode(true);assert.equal(h.viewer.isReady(),false,'loadeddata alone does not guarantee drawable pixels');
    video.paintFrame(0);assert.equal(h.viewer.isReady(),true);
    h.viewer.update({progress:1});h.tick();assert.ok(video.frameCallback);
    video.decode();assert.equal(h.mount.dataset.filmFrame,'0','seeked cannot expose a premature canvas frame');
    video.paintFrame(3/30);assert.equal(h.mount.dataset.filmFrame,'3','the canvas pose uses mediaTime rather than the seek destination');
    for(let i=0;i<5&&!video.frameCallback;i++)h.tick();assert.ok(video.frameCallback);
    const late=video.frameCallback;h.abort.abort();assert.equal(video.frameCallback,null);
    late(0,{mediaTime:1});assert.equal(h.mount.children.length,0,'late pixels cannot restore a disposed surface');
  },{frameCallbacks:true});
});

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

test('transparent frames erase old silhouettes even when Safari ignores copy compositing',async()=>{
  await harness(async h=>{
    const video=h.video(),canvas=h.mount.children[0];
    video.pixels=[1,2,3,255,0,0,0,0];video.decode(true);
    const poses=[
      [.5,[0,0,0,0,4,5,6,255]],
      [1,[7,8,9,255,0,0,0,0]],
      [.25,[0,0,0,0,10,11,12,128]],
      [0,[13,14,15,255,0,0,0,0]],
    ];
    for(const [progress,pixels] of poses){
      h.viewer.update({progress},{immediate:true});h.tick();
      video.pixels=pixels;video.decode();
      assert.deepEqual(canvas.pixels,pixels,'transparent regions must erase the previous pose in both buffers');
    }
    assert.deepEqual(h.mount.children,[canvas]);
  },{ignoreCopy:true});
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

test('a cached component still cannot hide an unbuffered camera path on first inspection',async()=>{
  await harness(async h=>{
    const video=h.video();video.duration=6;video.decode(true);
    video.buffered={length:1,start:()=>0,end:()=>2};
    h.viewer.update({mode:'inside',part:'capacitors'});
    assert.equal(h.loadingStates.at(-1),true,'the wide-camera route at 4.4 seconds is not cached yet');
    h.tick();video.decode();h.settle();
    assert.equal(h.mount.dataset.filmFrame,'40','show the available component directly instead of waiting for its orbit');
    assert.equal(h.viewer.isReady(),true);
  },{filmMetadata:modeMetadata});
});

test('Controller to Air Capacitors holds the decoded capacitor endpoint across rounded video timestamps',async()=>{
  await harness(async h=>{
    const video=h.video(),canvas=h.mount.children[0];
    video.duration=6;video.decode(true);
    h.viewer.update({mode:'inside',part:'capacitors'});h.settle();
    h.viewer.update({part:'control'});h.settle();
    h.viewer.update({part:'capacitors'});h.settle();
    assert.equal(h.mount.dataset.filmFrame,'101');
    assert.equal(canvas.pixels[0],101,'the held pixels must be capacitors, not the adjacent controller frame 100');
    h.viewer.pause(true);h.viewer.pause(false);h.viewer.update({part:'capacitors'});h.settle();
    assert.equal(canvas.pixels[0],101,'repeated updates retain the decoded endpoint');
    for(const [part,expected] of [['motors',70],['control',100],['capacitors',101],['control',131]]){
      h.viewer.update({part});h.settle();
      assert.equal(canvas.pixels[0],expected);
    }
    h.viewer.update({mode:'machine',progress:0});h.settle();
    assert.equal(canvas.pixels[0],0);
  },{filmMetadata:modeMetadata,quantizedFrames:true});
});

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
