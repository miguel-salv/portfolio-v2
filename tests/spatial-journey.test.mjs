import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SPATIAL_START,spatialFrameAtProgress,spatialProgressAtFrame,createSpatialJourney} from '../src/scripts/spatial-journey.js';

function fixture(){
  const video=new EventTarget();Object.assign(video,{dataset:{},readyState:0,currentTime:0,videoWidth:1080,videoHeight:810,seeking:false,
    load(){this.loads=(this.loads||0)+1;},pause(){this.paused=true;},removeAttribute(){this.src='';}});
  let onFrame,target=0,enabled=false,immediate=false,ready=true,valid=true,disposed=false,seats=0;
  const changes=[],commits=[];
  const abort=new AbortController();
  const player=createSpatialJourney({mount:{},video,source:'/journey.webm',signal:abort.signal,timeout:1000,
    matcherReady:()=>ready,seatMatcher:()=>seats++,onChange:state=>changes.push(state),
    makeSurface:()=>({commit(){commits.push(video.currentTime);return valid;},dispose(){disposed=true;}}),
    makeScrubber:(_video,options)=>{onFrame=options.onFrame;return {
      setTarget(t,e,i){target=t;enabled=e;immediate=i;},pause(){enabled=false;},dispose(){enabled=false;},get settled(){return Math.abs(video.currentTime-target*7)<1/60;}
    };}
  });
  const load=()=>{video.readyState=4;video.dispatchEvent(new Event('loadeddata'));};
  const decode=frame=>{video.currentTime=frame/30;onFrame();};
  return {player,video,abort,changes,commits,load,decode,get target(){return target;},get enabled(){return enabled;},get immediate(){return immediate;},get disposed(){return disposed;},get seats(){return seats;},set ready(v){ready=v;},set valid(v){valid=v;}};
}
test('world camera clock is reversible and shares the exact narrative stops',()=>{
  for(const [p,frame] of [[SPATIAL_START,0],[1/3+.04,40],[2/3-.04,100],[2/3+.04,140],[1,210]]){
    assert.ok(Math.abs(spatialFrameAtProgress(p)-frame)<1e-9);
    assert.ok(Math.abs(spatialProgressAtFrame(frame)-p)<1e-9);
  }
  for(let i=0;i<=210;i++)assert.ok(Math.abs(spatialFrameAtProgress(spatialProgressAtFrame(i))-i)<1e-8);
});
test('first paint does not download the cinema; approaching the mechanism preloads once',()=>{
  const f=fixture();f.player.sample(.1);assert.equal(f.video.loads,undefined);
  f.player.sample(.2);f.player.sample(.25);assert.equal(f.video.loads,1);assert.equal(f.player.sample(.25).owner,'matcher');f.player.dispose();
});
test('a camera handoff waits for the exact open matcher and a valid alpha frame',()=>{
  const f=fixture();f.player.sample(.3);f.load();f.ready=false;
  f.player.sample(.3);f.decode(0);assert.equal(f.changes.at(-1).owner,'matcher');
  f.ready=true;f.valid=false;f.decode(0);assert.equal(f.changes.at(-1).owner,'matcher');
  f.valid=true;f.decode(0);assert.equal(f.changes.at(-1).owner,'cinema');assert.equal(f.seats,1);f.player.dispose();
});
test('copy and chapter navigation follow the decoded camera, including a reversal',()=>{
  const f=fixture();f.player.sample(.3);f.load();f.player.sample(.3);f.decode(0);
  f.player.sample(.65);f.decode(80);assert.ok(Math.abs(f.changes.at(-1).progress-spatialProgressAtFrame(80))<1e-9);
  f.decode(80.5);assert.ok(Math.abs(f.changes.at(-1).progress-spatialProgressAtFrame(80.5))<1e-9,'60fps camera frames retain their half-frame position on the original timeline');
  f.player.sample(.4);f.decode(65);assert.ok(Math.abs(f.changes.at(-1).progress-spatialProgressAtFrame(65))<1e-9);
  f.player.sample(.2);f.decode(0);assert.equal(f.changes.at(-1).owner,'matcher');assert.equal(f.changes.at(-1).progress,.2);f.player.dispose();
});
test('direct navigation never exposes the old decoder frame',()=>{
  const f=fixture();f.player.sample(.8,true,true);f.load();f.player.sample(.8,true,true);
  f.decode(0);assert.equal(f.changes.at(-1).owner,'matcher');
  f.decode(Math.round(spatialFrameAtProgress(.8)));assert.equal(f.changes.at(-1).owner,'cinema');
  assert.equal(f.player.sample(.1,true,true).owner,'matcher');f.player.dispose();
});
test('a cold resize or restored middle chapter seats its camera without replaying the opening',()=>{
  const f=fixture();f.player.sample(.7);f.load();f.player.sample(.7);
  assert.ok(Math.abs(f.target-spatialFrameAtProgress(.7)/210)<.003);
  f.decode(0);assert.equal(f.changes.at(-1).owner,'matcher');
  f.decode(Math.round(spatialFrameAtProgress(.7)));assert.equal(f.changes.at(-1).owner,'cinema');f.player.dispose();
});
test('failed film preserves a meaningful poster and returning releases it',()=>{
  const f=fixture();f.player.sample(.5);f.video.dispatchEvent(new Event('error'));
  assert.equal(f.player.sample(.5).owner,'poster');assert.equal(f.player.sample(.1).owner,'matcher');f.player.dispose();
});
test('offscreen and disposal pause work and prevent a late decoder from stealing ownership',()=>{
  const f=fixture();f.player.sample(.5);f.load();f.player.sample(.5);f.player.sample(.5,false);f.decode(0);
  assert.equal(f.enabled,false);assert.equal(f.changes.at(-1).owner,'matcher');
  f.abort.abort();f.decode(80);assert.equal(f.disposed,true);assert.equal(f.video.src,'');assert.equal(f.changes.at(-1).owner,'matcher');
});
