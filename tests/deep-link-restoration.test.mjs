import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const core=readFileSync(new URL('../src/scripts/portfolio-core.js',import.meta.url),'utf8');
const start=core.indexOf('function lockHashScrollOnLoad()');
const code=core.slice(start,core.indexOf('\nlockHashScrollOnLoad();',start));

test('an explicit demo link wins over the initial top position emitted by an Astro route swap',async()=>{
  let pending='#demo-companion';const restored=[];
  const target={dataset:{},top:2970};
  const scope={window:{},document:{documentElement:{classList:{contains:()=>false,remove(){}}}},
    RESTORE_MIN:64,restoreInFlight:false,sessionStorage:{getItem:()=>pending,removeItem:()=>pending=''},
    readStoredScrollRecord:()=>({y:0}),readStoredScrollY:()=>0,pinScrollRestoration(){},
    resolveHashTarget:hash=>hash==='#demo-companion'?target:null,hashScrollY:node=>node.top,
    whenLayoutReady:()=>Promise.resolve(),finishRestoreTo:(y,hash)=>restored.push({y,hash}),
    holdPinTop:()=>assert.fail('Explicit destination must not be discarded'),schedulePageReveals(){}};
  runInNewContext(code+'\nlockHashScrollOnLoad();',scope);
  await Promise.resolve();
  assert.deepEqual(restored,[{y:2970,hash:'#demo-companion'}]);assert.equal(pending,'');
});
test('a cinematic chapter destination delegates its position to the chapter controller',async()=>{
  const restored=[];
  const target={dataset:{studyChapter:'matcher'},top:64};
  const scope={window:{__portfolioExplicitHash:true,__portfolioHash:'#project-matcher'},document:{documentElement:{classList:{contains:()=>false,remove(){}}}},
    RESTORE_MIN:64,restoreInFlight:false,sessionStorage:{getItem:()=>null,removeItem(){}},
    readStoredScrollRecord:()=>({y:901}),readStoredScrollY:()=>901,pinScrollRestoration(){},
    resolveHashTarget:()=>target,hashScrollY:node=>node.top,
    whenLayoutReady:()=>Promise.resolve(),finishRestoreTo:(y,hash,chapter)=>restored.push({y,hash,chapter}),
    holdPinTop:()=>assert.fail('Explicit chapter must not be discarded'),schedulePageReveals(){}};
  runInNewContext(code+'\nlockHashScrollOnLoad();',scope);await Promise.resolve();
  assert.deepEqual(restored,[{y:64,hash:'#project-matcher',chapter:true}]);
});
