const key='portfolio-home-motion-state-v1';
const defaults=Object.freeze({m1:72,m2:108,mode:'machine',part:'capacitors',controlled:false});
let memory={...defaults};
export function normalizeStudySession(value={}){
  const angle=(name)=>Number.isFinite(value[name])?Math.min(180,Math.max(0,value[name])):defaults[name];
  return {m1:angle('m1'),m2:angle('m2'),controlled:value.controlled===true||angle('m1')!==72||angle('m2')!==108,
    mode:['machine','inside','tune'].includes(value.mode)?value.mode:'machine',
    part:['capacitors','motors','control'].includes(value.part)?value.part:'capacitors'};
}
export function readStudySession(storage){
  try{const saved=storage?.getItem(key);if(saved)memory=normalizeStudySession(JSON.parse(saved));}catch{}
  return {...memory};
}
export function saveStudySession(value,storage){
  memory=normalizeStudySession(value);
  try{storage?.setItem(key,JSON.stringify(memory));}catch{}
  return {...memory};
}
