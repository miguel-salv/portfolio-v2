import { test } from 'node:test';
import assert from 'node:assert/strict';
import {projectSceneFrame} from '../src/scripts/workbench-scenes.js';
const frame={left:.379914,top:.192191,width:.557143,height:.668571};
test('the authored scene and foreground share exact framing without a cover crop',()=>{
  const p=projectSceneFrame(frame,{width:2400,height:1500},{width:1200,height:750});
  assert.equal(p.left,frame.left*1200);assert.equal(p.top,frame.top*750);
  assert.ok(Math.abs(p.width/p.height-4/3)<.00001);
});
test('wide and tall windows account for the centered object-fit crop',()=>{
  for(const viewport of [{width:1280,height:663},{width:1440,height:943}]){
    const p=projectSceneFrame(frame,{width:2400,height:1500},viewport);
    const scale=Math.max(viewport.width/2400,viewport.height/1500);
    assert.ok(Math.abs(p.left-((viewport.width-2400*scale)/2+frame.left*2400*scale))<1e-9);
    assert.ok(Math.abs(p.top-((viewport.height-1500*scale)/2+frame.top*1500*scale))<1e-9);
    assert.ok(p.width>0&&p.height>0);
  }
});
