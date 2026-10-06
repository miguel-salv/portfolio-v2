// Scroll owns the destination; the displayed artwork has a speed limit.
// This catches fast wheels/trackpads made of small events as well as jumps.
export function createJourneyTransition({duration=500,ready=()=>true}={}){
  let shown=null,lastTime=null,running=false;
  const dominant=layers=>layers.reduce((a,b)=>Math.abs(b.x)<=Math.abs(a.x)?b:a).index;
  return {
    get running(){return running;},
    sample(wanted,now){
      const elapsed=lastTime===null?0:Math.min(64,Math.max(0,now-lastTime));
      lastTime=now;
      if(!shown){shown=wanted;return shown;}
      if(!wanted.layers.every(layer=>ready(layer.index))){running=false;return shown;}

      const destination=wanted.index;
      const target=wanted.layers.find(layer=>layer.index===destination);
      const outgoing=shown.layers.filter(layer=>!wanted.layers.some(next=>next.index===layer.index)&&Math.abs(layer.x)<100)
        .sort((a,b)=>Math.abs(a.x)-Math.abs(b.x))[0];
      const left=Math.min(...wanted.layers.map(layer=>layer.x)),right=Math.max(...wanted.layers.map(layer=>layer.x));
      const anchor=wanted.layers.find(layer=>shown.layers.some(old=>old.index===layer.index));
      const origin=anchor?shown.layers.find(old=>old.index===anchor.index).x+target.x-anchor.x:
        (outgoing?.x??0)+(destination>shown.index?100+target.x-left:-100+target.x-right);
      const layers=[...(outgoing?[{
        index:outgoing.index,x:outgoing.x,
        target:outgoing.index<destination?left-100:right+100
      }]:[]),...wanted.layers.map(layer=>({
        index:layer.index,
        x:shown.layers.find(old=>old.index===layer.index)?.x??origin+layer.x-target.x,
        target:layer.x
      }))];
      const distance=Math.max(...layers.map(layer=>Math.abs(layer.target-layer.x)));
      const speed=100/duration;
      const limit=speed*elapsed;
      if(distance<=limit+.001){shown=wanted;running=false;return shown;}
      // Decelerate only near rest. A common step keeps neighboring models
      // one aperture apart, rather than letting their speeds overlap them.
      const step=running?Math.min(limit,elapsed*Math.sqrt(2*speed*distance/120)):limit;
      const fraction=step/distance;
      const painted=layers.map(layer=>({index:layer.index,x:layer.x+(layer.target-layer.x)*fraction}));
      const locals=shown.locals.slice();
      wanted.layers.forEach(layer=>{locals[layer.index]=wanted.locals[layer.index];});
      const to=painted.find(layer=>layer.index===(wanted.boundary?.to??destination));
      const eased=Math.min(1,Math.max(0,1-Math.abs(to.x)/100));
      const boundary=wanted.boundary?{...wanted.boundary,progress:eased,eased}:outgoing?{
        from:outgoing.index,to:destination,progress:eased,eased
      }:null;
      shown={...wanted,index:dominant(painted),locals,layers:painted,boundary};
      running=true;
      return shown;
    },
    reset(){shown=null;lastTime=null;running=false;}
  };
}

// Admit one neighboring chapter at a time while the artwork catches up.
// Progress may extend outside [0,1] so leaving the stage is paced as well.
export function createJourneyPacer({count=3,half=.04,ready=()=>true}={}){
  let centered=null;
  const landing=index=>index/count+(index===0?.025:.065);
  return {
    observe(state){
      const layer=state.layers.find(layer=>layer.index===state.index);
      if(layer&&Math.abs(layer.x)<.001)centered=state.index;
    },
    limit(progress){
      if(centered===null)return progress;
      const next=progress>(centered+1)/count-half?1:progress<centered/count+half?-1:0;
      if(next>0){
        const released=ready(centered);
        const end=centered===count-1?(released?Infinity:1):released?landing(centered+1):(centered+1)/count-half;
        return Math.min(progress,end);
      }
      if(next<0){
        const start=centered===0?-Infinity:landing(centered-1);
        return Math.max(progress,start);
      }
      return progress;
    },
    reset(){centered=null;}
  };
}
