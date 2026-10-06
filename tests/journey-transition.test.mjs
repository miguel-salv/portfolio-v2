import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createJourneyTransition} from '../src/scripts/journey-transition.js';

const state=(index,story=index/3+.1)=>({index,story,locals:[1,.5,0],layers:[{index,x:0}],boundary:null});
const layerX=(state,index)=>state.layers.find(layer=>layer.index===index)?.x;
function advance(motion,target,start,end){
  let shown;
  for(let now=start;now<=end;now+=16)shown=motion.sample(target,now);
  return shown;
}

test('slow scrolling retains authored positions; fast jumps have a half-second speed limit and skip intermediate projects',()=>{
  const motion=createJourneyTransition();motion.sample(state(0,.1),0);
  const normal={...state(0,.11),layers:[{index:0,x:-2},{index:1,x:98}]};
  assert.deepEqual(motion.sample(normal,16),normal);assert.equal(motion.running,false);
  const target=state(2,.9),start=motion.sample(target,32);
  assert.ok(Math.abs(layerX(start,0)+2)<=3.2+.001);
  assert.equal(start.layers.some(layer=>layer.index===1),false);
  assert.equal(motion.running,true);
  const early=advance(motion,target,48,208);
  assert.ok(layerX(early,2)>55,'180 ms cannot complete the swap');
  assert.equal(early.layers.some(layer=>layer.index===1),false);
  assert.deepEqual(advance(motion,target,224,1024),target);
  assert.equal(motion.running,false);
});

test('fast scrolling in small events is limited before the chapter midpoint, with consistent model spacing',()=>{
  const motion=createJourneyTransition();let previous=motion.sample(state(0,.29),0);
  for(let i=1;i<=10;i++){
    const x=-10*i;
    const target={...state(i<5?0:1,.29+i*.008),layers:[{index:0,x},{index:1,x:x+100}],boundary:{from:0,to:1,progress:i/10,eased:i/10}};
    const painted=motion.sample(target,i*16);
    assert.ok(Math.abs(layerX(painted,0)-layerX(previous,0))<=3.2+.001);
    assert.ok(Math.abs(layerX(painted,1)-layerX(painted,0)-100)<.001);
    assert.equal(motion.running,true);
    previous=painted;
  }
  assert.equal(previous.index,0,'the displayed chapter follows the limited movement');
  assert.deepEqual(advance(motion,state(1),176,1200),state(1));
});

test('reversals respond from the displayed positions and stale destinations never replay',()=>{
  const motion=createJourneyTransition();motion.sample(state(0),0);
  const moving=advance(motion,state(2),16,128);
  const reverse=motion.sample(state(0),144);
  assert.ok(layerX(reverse,0)>layerX(moving,0));
  assert.ok(Math.abs(layerX(reverse,0)-layerX(moving,0))<=3.2+.001);
  assert.ok(layerX(reverse,2)>layerX(moving,2));
  const latest=motion.sample(state(1),160);
  assert.equal(latest.layers.some(layer=>layer.index===2),false);
  assert.deepEqual(advance(motion,state(1),176,1200),state(1));
  assert.equal(motion.running,false);
});

test('a pending destination holds the existing model without an idle animation loop',()=>{
  let ready=false;
  const motion=createJourneyTransition({ready:()=>ready});
  const opening=state(0);motion.sample(opening,0);
  assert.deepEqual(motion.sample(state(2),16),opening);assert.equal(motion.running,false);
  assert.deepEqual(motion.sample(state(1),200),opening);
  ready=true;const start=motion.sample(state(1),400);
  assert.equal(start.layers[0].index,0);assert.equal(start.layers[1].index,1);
  assert.equal(motion.running,true);
  motion.reset();assert.equal(motion.running,false);
  assert.deepEqual(motion.sample(state(2),500),state(2));
});

test('a fast scroll stopping inside a boundary keeps every model separated and lands without a snap',()=>{
  const motion=createJourneyTransition();motion.sample(state(0),0);
  const target={...state(1,.65),layers:[{index:1,x:-40},{index:2,x:60}],boundary:{from:1,to:2,progress:.4,eased:.4}};
  let previous=motion.sample(target,16);
  for(let now=32;now<1600;now+=16){
    const painted=motion.sample(target,now);
    for(const layer of painted.layers){
      const old=layerX(previous,layer.index);
      if(old!==undefined)assert.ok(Math.abs(layer.x-old)<=3.2+.001);
    }
    const ordered=[...painted.layers].sort((a,b)=>a.index-b.index);
    for(let i=1;i<ordered.length;i++)assert.ok(Math.abs(ordered[i].x-ordered[i-1].x-100)<.001);
    previous=painted;
  }
  assert.deepEqual(previous,target);assert.equal(motion.running,false);
});

test('forward and reverse model swaps use the same movement cadence',()=>{
  const forward=createJourneyTransition(),reverse=createJourneyTransition();
  forward.sample(state(0),0);reverse.sample(state(1),0);
  for(let now=16;now<=1200;now+=16){
    const down=forward.sample(state(1),now),up=reverse.sample(state(0),now);
    assert.ok(Math.abs(Math.abs(layerX(down,1))-Math.abs(layerX(up,0)))<.001);
    assert.equal(forward.running,reverse.running);
  }
  assert.equal(forward.running,false);assert.equal(reverse.running,false);
});
