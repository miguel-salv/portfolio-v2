import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';

// Runtime-selected movies, empty environments, and camera paths do not appear
// in HTML. Verify them alongside ordinary links before this proof is served.
export async function verifyHomeMotion(root){
  const errors=[],paths=new Set(),movies=[];
  let catalogue;
  try{catalogue=JSON.parse(await readFile(resolve(root,'assets/studies/home-motion/catalogue.json'),'utf8'));}
  catch{return ['home-motion: missing asset catalogue'];}
  function collect(value){
    if(typeof value==='string'&&value.startsWith('/assets/'))paths.add(value);
    else if(value&&typeof value==='object'){
      if(value.src?.endsWith('.mp4'))movies.push(value);
      Object.values(value).forEach(collect);
    }
  }
  collect(catalogue);
  for(const path of paths){
    try{const file=await stat(resolve(root,'.'+path));if(!file.isFile()||file.size<10)throw Error();}
    catch{errors.push('home-motion: missing or empty '+path);}
  }
  for(const [orientation,themes] of Object.entries(catalogue.hero||{}))for(const [theme,hero] of Object.entries(themes)){
    try{
      const timeline=JSON.parse(await readFile(resolve(root,'.'+hero.timeline),'utf8'));
      if(timeline.frameCount!==49||timeline.frames?.length!==49||!timeline.affine)throw Error();
      if(timeline.source!==hero.opening.src)throw Error();
      if(!timeline.frames.every(f=>f.camera?.position?.every(Number.isFinite)&&f.camera.span>0))throw Error();
    }catch{errors.push(`home-motion: invalid ${orientation}/${theme} opening camera path`);}
  }
  for(const movie of movies){
    try{
      const data=JSON.parse(await readFile(resolve(root,'.'+movie.metadata),'utf8'));
      const scale=data.frameScale||1,expected=data.fps===60?2:1;
      if(![30,60].includes(data.fps)||scale!==expected||data.frames?.length!==data.frameCount||data.width<600||data.height<600)throw Error();
      const logicalEnd=(data.frameCount-1)/scale;
      if(![44,119].includes(logicalEnd))throw Error();
      if(!data.frames.every(f=>f.camera?.position?.every(Number.isFinite)&&(f.camera.span>0||f.camera.lens>0)))throw Error();
      for(const path of [movie.src,movie.webm])if(!path||(await stat(resolve(root,'.'+path))).size<16384)throw Error();
    }catch{errors.push('home-motion: invalid film or camera contract '+movie.src);}
  }
  return errors;
}
