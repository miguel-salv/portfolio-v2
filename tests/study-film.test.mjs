import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStudyFilm} from '../src/scripts/studies/study-film.js';

function harness(options={}){
  const listeners=new Map(),paints=[],errors=[];
  let time=0;
  const video={readyState:0,seeking:false,pause(){},load(){},removeAttribute(){},
    addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},
    get currentTime(){return time;},set currentTime(value){time=value;this.seeking=true;},
  };
  const abort=new AbortController();
  const film=createStudyFilm({src:'study.mp4',frameCount:120,signal:abort.signal,makeVideo:()=>video,onFrame:(_video,frame)=>paints.push(frame),onError:e=>errors.push(e),...options});
  return {film,video,paints,errors,abort,emit(name){if(name==='seeked')video.seeking=false;if(name==='loadeddata')video.readyState=2;listeners.get(name)?.();}};
}
test('rapid seeking coalesces to the latest frame without publishing an intermediate pose',()=>{
  const h=harness();h.emit('loadeddata');h.film.seek(25);h.film.seek(61);h.film.seek(90);
  h.emit('seeked');assert.deepEqual(h.paints,[0]);
  h.emit('seeked');assert.deepEqual(h.paints,[0,90]);
});
test('pause and abort prevent late frames from taking ownership',()=>{
  const h=harness();h.emit('loadeddata');h.film.seek(60);h.film.pause();h.emit('seeked');
  assert.deepEqual(h.paints,[0]);h.film.pause(false);assert.deepEqual(h.paints,[0,60]);
  h.film.seek(80);h.abort.abort();h.emit('seeked');assert.deepEqual(h.paints,[0,60]);
});
test('reverse targets use the same exact frame coordinates and a settled frame stays idle',()=>{
  const h=harness();h.emit('loadeddata');h.film.seek(100);h.emit('seeked');h.film.seek(20);h.emit('seeked');
  h.film.seek(20);h.emit('seeked');assert.deepEqual(h.paints,[0,100,20]);
});
test('an unavailable codec retries the alternate source while retaining the requested pose',()=>{
  const h=harness({fallbackSrc:'study.webm'});h.film.seek(64);h.emit('error');
  assert.equal(h.video.src,'study.webm');assert.equal(h.film.target,64);assert.equal(h.errors.length,0);
  h.emit('loadeddata');h.emit('seeked');assert.deepEqual(h.paints,[64]);
  h.emit('error');assert.equal(h.errors.length,1);
});
test('metadata-only loading requests a drawable first frame without playback',()=>{
  const h=harness();h.video.readyState=1;h.emit('loadedmetadata');
  assert.ok(h.video.seeking);h.video.readyState=2;h.emit('seeked');
  assert.deepEqual(h.paints,[0]);
});
test('progressive seeking publishes completed frames while coalescing new requests',()=>{
  const h=harness({progressive:true});h.emit('loadeddata');h.film.seek(25);h.film.seek(61);h.film.seek(90);
  h.emit('seeked');assert.deepEqual(h.paints,[0,25]);
  h.emit('seeked');assert.deepEqual(h.paints,[0,25,90]);
  h.film.seek(20);h.abort.abort();h.emit('seeked');assert.deepEqual(h.paints,[0,25,90]);
});
test('an already aborted signal immediately disposes its decoder',()=>{
  const abort=new AbortController();abort.abort();const h=harness({signal:abort.signal});
  h.emit('loadeddata');h.film.seek(50);h.emit('seeked');assert.deepEqual(h.paints,[]);assert.equal(h.film.ready,false);
});
