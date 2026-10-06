import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createJourneyPacer} from '../src/scripts/journey-transition.js';
const view=(index,x=0)=>({index,layers:[{index,x}]});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should equal ${expected}`);

test('a fling admits every model without an extra pause once each is ready',()=>{
  const pacer=createJourneyPacer();pacer.observe(view(0),0);
  const requested=1.7;
  close(pacer.limit(requested,500),1/3+.065);
  pacer.observe(view(1,20),800);
  close(pacer.limit(requested,850),1/3+.065,'a partly visible neighbor is not a completed visit');
  pacer.observe(view(1),900);
  close(pacer.limit(requested,900),2/3+.065);
  close(pacer.limit(requested,1100),2/3+.065);
  pacer.observe(view(2),1700);
  assert.equal(pacer.limit(requested,1700),requested);
  assert.equal(pacer.limit(requested,1900),requested);
});

test('fast reverse scrolling visits the middle model before returning to the hero',()=>{
  const pacer=createJourneyPacer();pacer.observe(view(2),0);
  close(pacer.limit(-.8,500),1/3+.065);
  pacer.observe(view(1),1000);
  close(pacer.limit(-.8,1000),.025);
  close(pacer.limit(-.8,1200),.025);
  pacer.observe(view(0),1700);
  assert.equal(pacer.limit(-.8,1700),-.8);
  assert.equal(pacer.limit(-.8,1900),-.8);
});

test('direction reversals and ready chapters respond immediately while in-chapter scrolling stays native',()=>{
  const pacer=createJourneyPacer();pacer.observe(view(0),0);
  assert.equal(pacer.limit(.15,50),.15);
  pacer.limit(.9,500);pacer.observe(view(1),800);
  close(pacer.limit(.9,800),2/3+.065);
  close(pacer.limit(.1,832),.1);
  assert.equal(pacer.limit(.5,900),.5);
});

test('reset releases pacing for resize, hidden pages and navigation',()=>{
  const pacer=createJourneyPacer();pacer.observe(view(0),0);
  assert.ok(pacer.limit(1.5,500)<1.5);
  pacer.reset();assert.equal(pacer.limit(1.5,516),1.5);
});

test('forward travel waits at each action endpoint until the displayed film is complete',()=>{
  let complete=false;
  const pacer=createJourneyPacer({ready:()=>complete});pacer.observe(view(1),0);
  close(pacer.limit(.95,500),2/3-.04,'vehicle stays centered while its wheels finish');
  close(pacer.limit(.95,2500),2/3-.04);
  complete=true;close(pacer.limit(.95,2500),2/3+.065,'completion releases at the same timestamp');
  pacer.observe(view(2),3100);complete=false;
  assert.equal(pacer.limit(1.5,3500),1,'robot remains pinned until the grip is decoded');
  complete=true;assert.equal(pacer.limit(1.5,3500),1.5);
});

test('unfinished films allow reversal but time alone cannot replace completion',()=>{
  let complete=false;
  const pacer=createJourneyPacer({ready:()=>complete});pacer.observe(view(1),0);
  close(pacer.limit(.95,500),2/3-.04);
  close(pacer.limit(-.5,516),.025);
  pacer.observe(view(2),1000);
  assert.equal(pacer.limit(1.5,1500),1);
  assert.equal(pacer.limit(1.5,5500),1);
  complete=true;assert.equal(pacer.limit(1.5,5501),1.5);
});
