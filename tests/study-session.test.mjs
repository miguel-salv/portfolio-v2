import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStudySession,readStudySession,saveStudySession} from '../src/scripts/studies/study-session.js';

test('a return visit restores both capacitor axes, inspection selection, and mode',()=>{
  let saved;const storage={getItem:()=>saved,setItem:(_key,value)=>saved=value};
  const pose={m1:19.25,m2:164.5,mode:'inside',part:'motors',controlled:true};
  saveStudySession(pose,storage);assert.deepEqual(readStudySession(storage),pose);
});
test('unavailable storage still retains the current pose in memory',()=>{
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  const pose={m1:1,m2:108,mode:'tune',part:'capacitors',controlled:true};
  assert.deepEqual(saveStudySession(pose,storage),pose);assert.deepEqual(readStudySession(storage),pose);
});
test('untrusted saved values cannot send the mechanism beyond its travel limits',()=>{
  assert.deepEqual(normalizeStudySession({m1:-100,m2:999,mode:'bad',part:'bad'}),{m1:0,m2:180,mode:'machine',part:'capacitors',controlled:true});
  assert.deepEqual(normalizeStudySession({m1:NaN,m2:Infinity}),{m1:72,m2:108,mode:'machine',part:'capacitors',controlled:false});
});
