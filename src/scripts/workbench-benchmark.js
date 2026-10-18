// Opt-in, finite review instrumentation: /?benchmark=1. No production idle loop.
let cleanup=()=>{};
function initBenchmark(){
  cleanup();
  if(!new URLSearchParams(location.search).has('benchmark'))return;
  const body=document.body;
  let raf=0,last=0,start=0,stopped=false;
  const intervals=[];
  const commits=[];
  const scene=document.querySelector('[data-journey]');
  let priorFrame='',priorCommit=0;
  const sceneObserver=scene?new MutationObserver(()=>{
    const value=scene.dataset.sceneFrame;
    if(!value||value===priorFrame||scene.dataset.sceneOwner!=='cinema')return;
    const now=performance.now();
    if(priorCommit&&now-priorCommit<250)commits.push(now-priorCommit);
    priorCommit=now;priorFrame=value;
  }):null;
  sceneObserver?.observe(scene,{attributes:true,attributeFilter:['data-scene-frame']});
  const finish=()=>{
    if(stopped)return;stopped=true;cancelAnimationFrame(raf);
    body.dataset.benchPaint=JSON.stringify(performance.getEntriesByType('paint').map(({name,startTime})=>({name,ms:Math.round(startTime)})));
    const sorted=intervals.slice().sort((a,b)=>a-b),percentile=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0;
    body.dataset.benchFrames=JSON.stringify({samples:intervals.length,medianMs:percentile(.5),p95Ms:percentile(.95),over33Ms:intervals.filter(t=>t>33.4).length,viewport:[innerWidth,innerHeight],devicePixelRatio});
    sceneObserver?.disconnect();
    const decoded=commits.slice().sort((a,b)=>a-b);
    body.dataset.benchScene=JSON.stringify({commits:commits.length,medianMs:decoded[Math.floor(decoded.length*.5)]||0,p95Ms:decoded[Math.floor(decoded.length*.95)]||0,over33Ms:commits.filter(t=>t>33.4).length});
  };
  function frame(now){
    if(document.hidden){finish();return;}
    if(!start)start=now;
    if(last)intervals.push(now-last);last=now;
    if(now-start>=10000)finish();else raf=requestAnimationFrame(frame);
  }
  raf=requestAnimationFrame(frame);
  const observer=typeof PerformanceObserver==='function'?new PerformanceObserver(list=>{
    const last=list.getEntries().at(-1);if(last)body.dataset.benchLcp=String(Math.round(last.startTime));
  }):null;
  try{observer?.observe({type:'largest-contentful-paint',buffered:true});}catch{}
  cleanup=()=>{finish();observer?.disconnect();};
}
if(typeof document!=='undefined'){
 document.addEventListener('astro:page-load',initBenchmark);
 document.addEventListener('astro:before-preparation',()=>cleanup());
}
