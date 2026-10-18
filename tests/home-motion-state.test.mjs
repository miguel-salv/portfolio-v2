import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studyTimeline,displayedFilmTimeline,canPresentStudyFrame,STUDY_MARKS,chapterDestination,shouldLoadStudyMechanism,interpolateCamera,cameraForViewport,selectStudyOwner,matcherPresentation} from '../src/scripts/studies/home-motion-state.js';

test('passive travel retains offline rendering while inspection and remembered poses request the mechanism',()=>{
  assert.equal(shouldLoadStudyMechanism(),false);
  assert.equal(shouldLoadStudyMechanism({mode:'machine',controlled:false}),false);
  assert.equal(shouldLoadStudyMechanism({mode:'inside',controlled:false}),true);
  assert.equal(shouldLoadStudyMechanism({mode:'tune',controlled:false}),true);
  assert.equal(shouldLoadStudyMechanism({mode:'machine',controlled:true}),true);
  assert.equal(selectStudyOwner({matcher:true,liveReady:false,emptyReady:false,filmReady:true}),'film');
});

test('the matcher survives the opening through the macro cut',()=>{
    assert.equal(studyTimeline(0).matcher,true);
    assert.equal(studyTimeline(.18).chapter,'matcher');
    assert.equal(studyTimeline(STUDY_MARKS.wheelCut-1e-6).matcher,true);
    assert.equal(studyTimeline(STUDY_MARKS.wheelCut).matcher,false);
});
test('completed film samples retain their own subject and annotation timing',()=>{
  const vehicle=studyTimeline(.68);
  assert.equal(displayedFilmTimeline(vehicle,44).matcher,true);
  assert.equal(displayedFilmTimeline(vehicle,45).chapter,'vehicle');
  assert.equal(displayedFilmTimeline(vehicle,45).copy,null);
  assert.equal(displayedFilmTimeline(vehicle,88).copy,'vehicle');
  assert.equal(displayedFilmTimeline(vehicle,119).chapter,'vehicle');
  assert.equal(displayedFilmTimeline(vehicle,119).copy,null);
  const robot=studyTimeline(.95);
  assert.equal(displayedFilmTimeline(robot,18).copy,null);
  assert.equal(displayedFilmTimeline(robot,78).copy,'robot');
});
test('loading and fast reversals cannot expose the wrong side of a cut or an old preloaded frame',()=>{
  const shaft=studyTimeline(STUDY_MARKS.wheelCut-1e-9),wheel=studyTimeline(STUDY_MARKS.wheelCut),robot=studyTimeline(.865);
  assert.equal(canPresentStudyFrame(shaft,44),true);
  assert.equal(canPresentStudyFrame(shaft,45),false);
  assert.equal(canPresentStudyFrame(wheel,44),false);
  assert.equal(canPresentStudyFrame(wheel,45),true);
  assert.equal(canPresentStudyFrame(robot,0),false);
  assert.equal(canPresentStudyFrame(robot,60),true);
  assert.equal(canPresentStudyFrame(studyTimeline(.57),84),true);
  assert.equal(canPresentStudyFrame(studyTimeline(.7199),90),false);
});
test('a selected capacitor pose overrides authored rotation through departure and reversal',()=>{
  const interaction={mode:'inside',part:'motors',values:{m1:1,m2:163},controlled:true,camera:{rotorOffset:[18,0]}};
  for(const p of [.245,.39,.41,.435,.479,.41,.245,.08,0]){
    const pose=matcherPresentation(studyTimeline(p),interaction);
    assert.equal(pose.m1,1);assert.equal(pose.m2,163);assert.equal(pose.part,'motors');
    assert.deepEqual(pose.cameraFrame.rotorOffset,[0,0]);
  }
  assert.equal(matcherPresentation(studyTimeline(.39),interaction).progress,1);
  assert.equal(matcherPresentation(studyTimeline(.435),interaction).progress,0);
  assert.equal(matcherPresentation(studyTimeline(.245),interaction).mode,'inside');
  assert.deepEqual(interaction.camera.rotorOffset,[18,0]);
});
test('the cinematic shaft follows its authored turn until a visitor takes control',()=>{
  const camera={rotorOffset:[12.5,0]},interaction={mode:'machine',part:'capacitors',values:{m1:72,m2:108},camera,controlled:false};
  assert.deepEqual(matcherPresentation(studyTimeline(.45),interaction).cameraFrame.rotorOffset,[12.5,0]);
});
test('scroll departure closes from the visible partial inspection rather than a fully opened substitute',()=>{
  for(const mode of ['inside','machine','tune']){
    const interaction={mode,part:'capacitors',values:{m1:20,m2:165},controlled:true,camera:{},departureAssembly:.37};
    assert.equal(matcherPresentation(studyTimeline(.39),interaction).progress,.37);
    const midway=matcherPresentation(studyTimeline(.4125),interaction).progress;
    assert.ok(midway>0&&midway<.37);
    assert.equal(matcherPresentation(studyTimeline(.435),interaction).progress,0);
  }
});
test('forward, reverse and skipped samples describe the identical state',()=>{
  const points=[0,.08,.23,.46,.48,.61,.72,.86,1];
  const expected=points.map(studyTimeline);
  [...points].reverse().forEach((p,i)=>assert.deepEqual(studyTimeline(p),expected[points.length-1-i]));
  for(const i of [8,1,4,2,6,0])assert.deepEqual(studyTimeline(points[i]),expected[i]);
});
test('chapter links land on complete readable compositions',()=>{
  for(const chapter of ['hero','matcher','vehicle','robot'])assert.equal(studyTimeline(chapterDestination(chapter)).copy,chapter);
});
test('the car waits under its copy and leaves only after the copy has gone',()=>{
  const m=STUDY_MARKS;
  assert.equal(studyTimeline(m.vehicleStop).frame,95);
  assert.equal(studyTimeline(m.vehicleGo).frame,100);
  for(const p of [m.vehicleCopyStart,m.vehicleStop,m.vehicleCopyEnd])assert.equal(studyTimeline(p).copy,'vehicle');
  assert.ok(studyTimeline(m.vehicleCopyStart).frame>85);
  assert.ok(studyTimeline(m.vehicleCopyEnd).frame<=100);
  assert.equal(studyTimeline(m.vehicleGo+.01).copy,null);
  for(const p of [.52,.58,.62,.69,.715]){
    const state=studyTimeline(p);
    assert.ok(Math.abs(displayedFilmTimeline(state,state.frame).progress-p)<1e-6);
  }
});
test('match and occlusion boundaries select exact first frames',()=>{
  assert.equal(studyTimeline(STUDY_MARKS.wheelCut).frame,45);
  assert.equal(studyTimeline(STUDY_MARKS.robotCut).frame,0);
  assert.equal(studyTimeline(1).frame,119);
});
test('intermediate camera poses and portrait crops use film projection',()=>{
  const camera=interpolateCamera([{position:[8,-12,9],target:[0,0,0],span:14},{position:[8,-12,9],target:[0,0,0],span:8}],.5);
  assert.equal(camera.span,11);
  const projected=cameraForViewport(camera,{width:1600,height:1000},{width:1023,height:976});
  assert.equal(projected.spanY,6.875);
  assert.ok(Math.abs(projected.spanX/projected.spanY-1023/976)<1e-9);
});
test('a rendering transfer requires both the live paint and its empty background',()=>{
  assert.equal(selectStudyOwner({matcher:true,liveReady:true,emptyReady:false,filmReady:true}),'film');
  assert.equal(selectStudyOwner({matcher:true,liveReady:false,emptyReady:true,filmReady:true}),'film');
  assert.equal(selectStudyOwner({matcher:true,liveReady:true,emptyReady:true,filmReady:true}),'live');
  assert.equal(selectStudyOwner({matcher:true,livePhase:'departure',liveReady:true,emptyReady:true,filmReady:true}),'film');
  assert.equal(selectStudyOwner({matcher:true,livePhase:'inspect',liveReady:true,emptyReady:true,filmReady:false}),'live');
  assert.equal(selectStudyOwner({matcher:false,liveReady:true,emptyReady:true,filmReady:false}),'poster');
  assert.equal(selectStudyOwner({matcher:false,filmReady:false,posterReady:false,current:'film'}),'film');
});
