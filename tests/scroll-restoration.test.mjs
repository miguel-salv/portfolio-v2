import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const layout=readFileSync(new URL('../src/layouts/BaseLayout.astro',import.meta.url),'utf8');
const bootstrap=[...layout.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(code=>code.includes('portfolio-scroll-y'));
function boot({hash='#project-robot',savedY=2200,type='navigate',pending=''}={}){
  const storage=new Map([['portfolio-scroll-y',JSON.stringify({path:'/',y:savedY})]]);
  if(pending)storage.set('portfolio-scroll',pending);
  const tokens=new Set(),timers=[],scrolls=[];
  const location={pathname:'/',search:'',hash};
  const window={scrollY:0,scrollTo:(x,y)=>scrolls.push(y)};
  const history={scrollRestoration:'auto',state:{index:0},replaceState(state,_unused,url){this.state=state;location.hash=url.includes('#')?'#'+url.split('#')[1]:'';}};
  const document={documentElement:{classList:{contains:name=>tokens.has(name),add:name=>tokens.add(name),remove:name=>tokens.delete(name)}},getElementById:()=>({getBoundingClientRect:()=>({top:4200})})};
  runInNewContext(bootstrap,{document,window,history,location,performance:{getEntriesByType:()=>[{type}]},sessionStorage:{getItem:key=>storage.get(key)??null,removeItem:key=>storage.delete(key)},setTimeout:fn=>timers.push(fn),getComputedStyle:()=>({scrollMarginTop:'80'}),scrollY:0});
  return {window,location,history,timers,scrolls};
}
test('new explicit deep links take priority over a prior scroll record',()=>{
  const h=boot();assert.equal(h.window.__portfolioHash,'#project-robot');
  assert.equal(h.window.__portfolioScrollY,undefined);assert.equal(h.window.__portfolioExplicitHash,true);
});
test('new explicit deep links survive a prior top-of-page record',()=>{
  const h=boot({savedY:0,hash:'#project-vehicle'});
  assert.equal(h.window.__portfolioHash,'#project-vehicle');assert.equal(h.window.__portfolioExplicitHash,true);
});
test('reload and Back/Forward retain the exact saved scroll position',()=>{
  for(const type of ['reload','back_forward']){
    const h=boot({type,savedY:3500,hash:'#project-matcher'});
    assert.equal(h.window.__portfolioScrollY,3500);assert.equal(h.window.__portfolioExplicitHash,false);
  }
});
test('command destinations take priority and the script-failure watchdog follows the hash',()=>{
  const h=boot({type:'reload',savedY:3500,pending:'#project-robot',hash:''});
  assert.equal(h.window.__portfolioScrollY,undefined);assert.equal(h.window.__portfolioHash,'#project-robot');
  h.timers[0]();assert.equal(h.scrolls.at(-1),4120);
});
test('hiding an initial hash retains the router history entry',()=>{
  const h=boot();
  assert.equal(h.history.state.index,0);
});
test('restoring a hash retains router index, scroll position, and custom state',()=>{
  const core=readFileSync(new URL('../src/scripts/portfolio-core.js',import.meta.url),'utf8');
  const stateHelper=core.slice(core.indexOf('function astroHistoryState('),core.indexOf('function writeHistoryScroll('));
  const hashHelper=core.slice(core.indexOf('function restoreHashOnUrl('),core.indexOf('function pinScrollRestoration('));
  const history={state:{index:47,scrollX:0,scrollY:1200,custom:'retained'},replaceState(state,_unused,url){this.state=state;this.url=url;}};
  const scope={history,location:{pathname:'/',search:'?test'},window:{scrollY:1755}};
  runInNewContext(stateHelper+hashHelper,scope);
  scope.restoreHashOnUrl('#project-robot');
  assert.deepEqual(JSON.parse(JSON.stringify(history.state)),{index:47,scrollX:0,scrollY:1755,custom:'retained'});
  assert.equal(history.url,'/?test#project-robot');
});
