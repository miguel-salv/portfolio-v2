import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plateProjection,coverRect,flowSceneRect} from '../src/scripts/studies/study-projection.js';
test('the original plate at its own camera exactly equals object-fit cover',()=>{
  const camera={horizontalSpan:14,projectedOrigin:[.658,.526]};
  const base={camera,resolution:[2400,1500]};
  for(const viewport of [{width:320,height:700},{width:390,height:844},{width:1023,height:976},{width:1280,height:720},{width:1920,height:1080}]){
    const actual=plateProjection(base,camera,{width:2400,height:1500},viewport),expected=coverRect({width:2400,height:1500},viewport);
    for(const key of ['x','y','width','height'])assert.ok(Math.abs(actual[key]-expected[key])<1e-8);
  }
});
test('pan and zoom keep the same world origin at the authored projected point',()=>{
  const base={resolution:[2400,1500],camera:{horizontalSpan:14,projectedOrigin:[.658,.526]}};
  const camera={horizontalSpan:8,matcherFilmFrame:{left:.2,top:.1,width:.6,height:.7}};
  const viewport={width:1280,height:800};
  const rect=plateProjection(base,camera,{width:1920,height:1200},viewport);
  assert.ok(Math.abs(rect.x+rect.width*.658-640)<1e-8);
  assert.ok(Math.abs(rect.y+rect.height*.526-360)<1e-8);
});

test('phone films retain the whole figure through forward and reverse travel',()=>{
  const geometry={hero:{left:0,top:53,width:390,height:791},seats:{matcher:{left:0,top:844,width:390,height:390},vehicle:{left:0,top:1800,width:390,height:475.6},robot:{left:0,top:2871,width:390,height:475.6}},header:53,scrollY:2576,viewportHeight:844};
  for(const progress of [.72,.752,.8,.865,1,.81,.721]){
    const actual=flowSceneRect({chapter:'robot',progress},geometry);
    assert.deepEqual(actual,{left:0,top:295,width:390,height:475.6});
  }
  assert.equal(flowSceneRect({chapter:'vehicle',progress:.615},geometry).height,475.6);
});

test('the phone opening fills departing hero pixels and meets the complete matcher aperture',()=>{
  const geometry={hero:{left:0,top:53,width:390,height:791},seats:{matcher:{left:0,top:844,width:390,height:390}},header:53,scrollY:0,viewportHeight:844};
  assert.deepEqual(flowSceneRect({chapter:'hero',progress:0},geometry),geometry.hero);
  const during=flowSceneRect({chapter:'hero',progress:.12},{...geometry,scrollY:553});
  assert.ok(during.top<=65);
  assert.equal(during.top+during.height,681);
  const before=flowSceneRect({chapter:'hero',progress:.18-1e-10},{...geometry,scrollY:779});
  const after=flowSceneRect({chapter:'matcher',progress:.18},{...geometry,scrollY:779});
  for(const key of ['left','top','width','height'])assert.ok(Math.abs(before[key]-after[key])<1e-5);
});
