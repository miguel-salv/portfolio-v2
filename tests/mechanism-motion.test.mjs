import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepMechanism,matcherAssemblyPose,splitMotorTriangles,createMechanismScrubber} from '../src/scripts/mechanism-motion.js';

test('mechanism approach caps speed at every cadence and reverses immediately',()=>{
  for(const dt of [1/120,1/60,1/30,.5]){
    const next=stepMechanism(.3,1,dt);
    assert.ok(next>.3 && next-.3<=1.2*Math.min(dt,.05)+1e-12);
    assert.ok(stepMechanism(next,0,dt)<next);
  }
  let p=0;for(let i=0;i<180;i++)p=stepMechanism(p,1,1/60);
  assert.equal(p,1);assert.equal(stepMechanism(1,1,10),1);
});

test('matcher opens its controller before hardware and holds a clearly separated final assembly',()=>{
  const early=matcherAssemblyPose(.25),open=matcherAssemblyPose(1);
  assert.ok(early.control[1]<-.5);assert.deepEqual(early.capacitors,[0,0,0]);
  assert.deepEqual(open.control,[.15,-1.15,.16]);
  assert.deepEqual(open.capacitors,[0,0,1.35]);assert.deepEqual(open.motors,[.9,0,.2]);
  assert.equal(open.shafts,1);assert.equal(open.lighting,0);
  assert.deepEqual(matcherAssemblyPose(2),open);assert.equal(matcherAssemblyPose(0).lighting,1);
});

test('motor partition preserves each indexed triangle and its winding',()=>{
  const positions=new Float32Array([-2,0,0,-1,1,0,-1,0,1, 1,0,0,2,1,0,2,0,1]);
  const indices=new Uint32Array([2,1,0,3,5,4,0,2,1]);
  const [left,right]=splitMotorTriangles(positions,indices);
  assert.deepEqual([...left],[2,1,0,0,2,1]);assert.deepEqual([...right],[3,5,4]);
  assert.equal(left.length+right.length,indices.length);
});

function harness(){
  const frames=new Map();let id=0,now=0,hidden=false,time=0,writes=0,presented=0;
  const video=new EventTarget();Object.assign(video,{duration:2,readyState:4,seeking:false,dataset:{source:'forward'},loop:true,pause(){}});
  Object.defineProperty(video,'currentTime',{get:()=>time,set:value=>{time=value;writes++;video.seeking=true;}});
  const abort=new AbortController();
  const scrub=createMechanismScrubber(video,{signal:abort.signal,onFrame:()=>presented++,requestFrame:cb=>{frames.set(++id,cb);return id;},cancelFrame:key=>frames.delete(key),isHidden:()=>hidden});
  return {video,scrub,abort,frames,get writes(){return writes;},get presented(){return presented;},hide(value){hidden=value;},frame(dt=16){now+=dt;const batch=[...frames.values()];frames.clear();batch.forEach(cb=>cb(now));},decode(){video.seeking=false;video.dispatchEvent(new Event('seeked'));},settle(){for(let i=0;i<240&&frames.size;i++){this.frame();this.decode();}}};
}

test('scrubbing waits for decoding, uses the latest reversal and stops requesting frames at rest',()=>{
  const h=harness();h.scrub.setTarget(1);h.frame();
  assert.equal(h.video.seeking,true);assert.equal(h.frames.size,0);const writes=h.writes;
  h.scrub.setTarget(0);h.frame();assert.equal(h.writes,writes);
  h.decode();h.settle();assert.equal(h.video.currentTime,0);assert.equal(h.frames.size,0);
  h.scrub.setTarget(1);h.settle();assert.equal(h.video.currentTime,2-1/30);
  assert.equal(h.video.loop,false);assert.equal(h.frames.size,0);assert.ok(h.presented>0);
  h.scrub.dispose();
});

test('pausing, hidden state, decode failure and disposal cannot advance a film',()=>{
  const h=harness();h.scrub.setTarget(1);h.frame();const frozen=h.video.currentTime;
  h.scrub.pause();h.decode();h.frame(10000);assert.equal(h.video.currentTime,frozen);
  h.hide(true);h.scrub.setTarget(1);assert.equal(h.frames.size,0);
  h.hide(false);h.video.dataset.failed='true';h.scrub.setTarget(1);assert.equal(h.frames.size,0);
  delete h.video.dataset.failed;h.scrub.setTarget(1);h.frame(10000);
  assert.ok(Number(h.video.dataset.motionProgress)<.08);
  h.abort.abort();assert.equal(h.frames.size,0);assert.equal(h.video.dataset.motionProgress,undefined);
  h.decode();h.frame();assert.equal(h.frames.size,0);
});

test('a late initial decode starts the pending action and a changed source starts from its decoded frame',()=>{
  const h=harness();h.video.readyState=0;h.scrub.setTarget(1);assert.equal(h.frames.size,0);
  h.video.readyState=4;h.video.dispatchEvent(new Event('loadeddata'));h.settle();assert.ok(h.video.currentTime>1.9);
  h.video.dataset.source='replacement';h.video.currentTime=0;h.decode();h.scrub.setTarget(1);h.frame();
  assert.ok(Number(h.video.dataset.motionProgress)<.03);h.scrub.dispose();
});
test('millisecond-rounded WebM durations still seek the final authored frame',()=>{
  const h=harness();h.video.duration=2.066;h.scrub.setTarget(1);h.settle();
  assert.equal(h.video.currentTime,61/30);h.scrub.dispose();
});

test('inspection cadence preserves intermediate frames and repeated input does not restart its speed',()=>{
  const h=harness();h.scrub.setTarget(1,true,false,.85);
  let previous=0;
  for(let i=0;i<90&&h.frames.size;i++){
    h.scrub.setTarget(1,true,false,.85);h.frame(50);
    assert.ok(h.video.currentTime-previous<=1/30+1e-9);
    previous=h.video.currentTime;h.decode();
  }
  assert.equal(h.video.currentTime,2-1/30);assert.equal(h.frames.size,0);
  h.scrub.setTarget(0,true,false,.85,1);h.settle();assert.equal(h.video.currentTime,0);
  h.scrub.dispose();
});
