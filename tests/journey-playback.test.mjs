import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createJourneyPlayback} from '../src/scripts/journey-playback.js';
import {spatialProjection} from '../src/scripts/spatial-journey.js';
class Video extends EventTarget {
 constructor(){super();Object.assign(this,{duration:421/60,readyState:4,currentTime:0,seeking:false,paused:true,callbacks:new Map(),next:0});}
 requestVideoFrameCallback(fn){this.callbacks.set(++this.next,fn);return this.next;}
 cancelVideoFrameCallback(id){this.callbacks.delete(id);}
 play(){this.paused=false;return Promise.resolve();}
 pause(){this.paused=true;}
 getAttribute(name){return this[name]||null;}
 removeAttribute(name){delete this[name];}
 load(){this.loads=(this.loads||0)+1;}
 decoded(time){this.currentTime=time;this.dispatchEvent(new Event('seeked'));}
 frame(time){this.currentTime=time;const callbacks=[...this.callbacks.values()];this.callbacks.clear();callbacks.forEach(fn=>fn(0,{mediaTime:time}));}
}
function setup(){const forward=new Video(),reverse=new Video(),frames=[];const player=createJourneyPlayback(forward,{reverseSource:'/reverse.webm',makeVideo:()=>reverse,isHidden:()=>false,onFrame:(node,frame)=>frames.push({reverse:node===reverse,frame})});return {forward,reverse,frames,player};}
test('native playback seats cold navigation and delivers actual presented frames',()=>{
 const f=setup();f.player.setTarget(40/210,true,true);f.forward.decoded(40/30);assert.equal(f.frames.at(-1).frame,40);assert.ok(f.player.settled);
 f.player.setTarget(90/210);assert.equal(f.forward.paused,false);f.forward.frame(41/30);assert.equal(f.frames.at(-1).frame,41);f.player.dispose();
});
test('reversal seats the same decoded world pose before backward playback',()=>{
 const f=setup();f.player.setTarget(80/210,true,true);f.forward.decoded(80/30);f.player.setTarget(20/210);
 assert.equal(f.forward.paused,true);assert.equal(f.reverse.src,'/reverse.webm');assert.equal(f.frames.at(-1).frame,80);
 f.reverse.decoded(7-80/30);assert.deepEqual(f.frames.at(-1),{reverse:true,frame:80});assert.equal(f.reverse.paused,false);
 f.reverse.frame(7-79.5/30);assert.equal(f.frames.at(-1).frame,79.5);f.player.dispose();
});
test('pause and disposal cancel native callbacks and reject late decoder ownership',()=>{
 const f=setup();f.player.setTarget(0,true,true);f.player.setTarget(.8);f.player.pause();const count=f.frames.length;f.forward.frame(.1);assert.equal(f.frames.length,count);assert.equal(f.forward.callbacks.size,0);
 f.player.dispose();f.reverse.decoded(1);assert.equal(f.frames.length,count);assert.equal(f.reverse.src,undefined);
});
test('camera travel uses the complete window, then returns to exact handoff framing',()=>{
 const base={left:626,top:240,width:700,height:525},viewport={width:1440,height:943};
 assert.deepEqual(spatialProjection(base,viewport,0),{...base,expansion:0});assert.deepEqual(spatialProjection(base,viewport,40),{...base,expansion:0});
 for(const frame of [10,20,28.5,30,110,119,130]){const projection=spatialProjection(base,viewport,frame);assert.equal(projection.left,0);assert.equal(projection.width,1440);assert.equal(projection.expansion,1);}
 assert.deepEqual(spatialProjection(base,viewport,140),{...base,expansion:0});
});
