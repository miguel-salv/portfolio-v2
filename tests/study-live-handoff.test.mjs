import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {matcherPresentation,shouldLoadStudyMechanism,studyTimeline} from '../src/scripts/studies/home-motion-state.js';

const source=readFileSync(new URL('../src/scripts/studies/home-motion.js',import.meta.url),'utf8');
function handoff(){
  const updates=[],pauses=[],events=[];
  const scope={viewer:null,liveReady:false,liveLoading:false,liveFailed:false,liveRevealPending:false,liveAssembly:0,departureAssembly:1,lastLivePhase:null,
    lastLiveState:'',lastOwner:'poster',mode:'inside',part:'capacitors',values:{m1:20,m2:165},controlled:true,currentCamera:{position:[1,2,3],rotorOffset:[0,0]},
    catalogue:{},signal:{aborted:false},liveMount:{hidden:true,style:{visibility:'hidden'}},surface:{dataset:{},dispatchEvent:event=>events.push(event.detail)},root:{dataset:{}},
    panel:{querySelector:()=>({hidden:true})},status:{textContent:''},CustomEvent:class{constructor(_type,{detail}){this.detail=detail;}},
    usable:()=>true,staticMode:()=>false,request(){},matcherPresentation,shouldLoadStudyMechanism,
    async loadMatcher(){return {createMatcherModel:async(_mount,options)=>{options.onPose({assembly:0});return {update(state,options){updates.push({state,options});},pause:value=>pauses.push(value),dispose(){scope.disposed=true;}};}};}};
  const owner=source.slice(source.indexOf('  function setOwner('),source.indexOf('  function recordMediaCadence('));
  const mechanism=source.slice(source.indexOf('  function liveState('),source.indexOf('  function copy(')).replace("await import('../matcher-model.js')","await loadMatcher()");
  runInNewContext(owner+mechanism,scope);
  return {scope,updates,pauses,events};
}

test('the first live frame is closed and matched before visible inspection begins',async()=>{
  const h=handoff(),state=studyTimeline(.245),camera=h.scope.currentCamera;
  await h.scope.prepareLive(camera,state);
  assert.equal(h.scope.liveReady,true);assert.equal(h.scope.liveRevealPending,true);
  assert.equal(h.scope.liveMount.style.visibility,'hidden');
  assert.equal(h.updates.at(-1).state.mode,'machine');assert.equal(h.updates.at(-1).state.progress,0);
  assert.equal(h.updates.at(-1).state.m1,20);assert.equal(h.updates.at(-1).state.m2,165);
  h.scope.setOwner('live',state);
  assert.equal(h.scope.liveMount.style.visibility,'visible');assert.equal(h.scope.liveRevealPending,false);
  assert.equal(h.updates.at(-1).state.mode,'inside');assert.equal(h.updates.at(-1).options.duration,400);
  assert.equal(h.events.length,1);
});

test('a cancelled inspection uses the current mode when the loaded frame takes ownership',async()=>{
  const h=handoff(),state=studyTimeline(.245);
  const loading=h.scope.prepareLive(h.scope.currentCamera,state);
  h.scope.mode='tune';h.scope.values={m1:7,m2:177};
  await loading;h.scope.setOwner('live',state);
  assert.equal(h.updates.at(-1).state.mode,'tune');
  assert.equal(h.updates.at(-1).state.m1,7);assert.equal(h.updates.at(-1).state.m2,177);
});

test('a scroll interruption closes from the last actually drawn assembly pose',async()=>{
  const h=handoff();await h.scope.prepareLive(h.scope.currentCamera,studyTimeline(.245));
  h.scope.setOwner('live',studyTimeline(.245));h.scope.liveAssembly=.42;
  h.scope.updateLive(h.scope.currentCamera,studyTimeline(.39));
  assert.equal(h.updates.at(-1).state.progress,.42);
  h.scope.updateLive(h.scope.currentCamera,studyTimeline(.435));
  assert.equal(h.updates.at(-1).state.progress,0);
});
test('cancelling an unmodified first inspection keeps the offline machine owner',async()=>{
  const h=handoff();h.scope.controlled=false;
  const loading=h.scope.prepareLive(h.scope.currentCamera,studyTimeline(.245));h.scope.mode='machine';
  await loading;
  assert.equal(h.scope.disposed,true);assert.equal(h.scope.viewer,null);assert.equal(h.scope.liveReady,false);
  assert.equal(h.scope.liveRevealPending,false);assert.equal(h.updates.length,0);
});
