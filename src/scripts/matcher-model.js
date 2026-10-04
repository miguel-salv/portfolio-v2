// Optional, demand-rendered CAD. The raster composition is the first paint.
export async function createMatcherModel(mount, { signal, onAnchors, heroLinked=false }) {
  const [THREE, { RGBELoader }, { RectAreaLightUniformsLib }, manifestResponse, binaryResponse, hdrResponse, metalResponse, plasticResponse] = await Promise.all([
    import('../vendor/three-0.170.0.module.min.js'),
    import('../vendor/RGBELoader-0.170.0.js'),
    import('../vendor/RectAreaLightUniformsLib-0.170.0.js'),
    fetch('/assets/matcher/assembly.json', { signal }),
    fetch('/assets/matcher/assembly.bin', { signal }),
    fetch('/assets/matcher/studio-reflections.hdr', { signal }),
    fetch('/assets/matcher/metal-roughness.png', { signal }),
    fetch('/assets/matcher/plastic-roughness.png', { signal }),
  ]);
  if ([manifestResponse,binaryResponse,hdrResponse,metalResponse,plasticResponse].some(response=>!response.ok)) throw new Error('Matcher assets unavailable');
  const [manifest, binary, hdrBuffer, metalBitmap, plasticBitmap] = await Promise.all([
    manifestResponse.json(), binaryResponse.arrayBuffer(), hdrResponse.arrayBuffer(),
    metalResponse.blob().then(blob=>createImageBitmap(blob)), plasticResponse.blob().then(blob=>createImageBitmap(blob)),
  ]);
  if (signal.aborted) { metalBitmap.close();plasticBitmap.close();return null; }
  const surfaceMaps=[metalBitmap,plasticBitmap].map(bitmap=>{
    const texture=new THREE.Texture(bitmap);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;return texture;
  });
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  if (!THREE.UniformsLib.LTC_FLOAT_1) RectAreaLightUniformsLib.init();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // The portrait is rendered with AgX: keep the same highlight shoulder live.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  mount.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26,1,.1,80);
  // The original monograph uses this orthographic pose and a 7.8-unit width.
  // Keep inspection perspective separate from the portrait's seated projection.
  const portraitCamera = new THREE.OrthographicCamera(-1,1,1,-1,.1,80);
  const portraitProjection=new THREE.Matrix4();
  portraitCamera.up.set(0,0,1);
  const machinePosition=heroLinked?[8,-12,9]:[7,-10,7];
  const spaciousPortrait=matchMedia('(min-width: 1101px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)');
  let viewSpan=3.3;
  camera.up.set(0,0,1);
  const parts = [];
  const rotors = manifest.rotors.map(point => { const group = new THREE.Group(); group.position.fromArray(point); scene.add(group); return group; });
  for (const part of manifest.parts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(binary, ...part.positions),3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(binary, ...part.normals),3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(binary, ...part.uvs),2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(binary, ...part.indices),1));
    const color = new THREE.Color().setRGB(...part.color);
    const metal=part.metallic>.7, printed=part.material.includes('printed blue'), glass=part.material.includes('OLED glass');
    if (glass) color.multiplyScalar(.4);
    const material = new THREE.MeshPhysicalMaterial({
      color, roughness: glass?.26:Math.max(.19,part.roughness), metalness: glass?0:part.metallic,
      roughnessMap:metal?surfaceMaps[0]:printed?surfaceMaps[1]:null,
      bumpMap:printed?surfaceMaps[1]:metal?surfaceMaps[0]:null,bumpScale:printed?.006:.0015,
      clearcoat:printed?.12:0,clearcoatRoughness:.4,
      specularIntensity:glass?.12:1,
      envMapIntensity:glass?.12:.85,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry,material);
    mesh.castShadow=true; mesh.receiveShadow=true;
    if (part.group.startsWith('rotor')) {
      const rotor=rotors[Number(part.group.slice(-1))-1];
      geometry.translate(-rotor.position.x,-rotor.position.y,-rotor.position.z);
      rotor.add(mesh);
    } else scene.add(mesh);
    parts.push({mesh, group:part.group, color});
  }
  // Authored high-range strip-light raster, shared by all three live states.
  const hdr=new RGBELoader().parse(hdrBuffer);
  const reflection=new THREE.DataTexture(hdr.data,hdr.width,hdr.height,THREE.RGBAFormat,hdr.type);
  reflection.colorSpace=THREE.LinearSRGBColorSpace;reflection.mapping=THREE.EquirectangularReflectionMapping;
  reflection.minFilter=reflection.magFilter=THREE.LinearFilter;reflection.flipY=true;reflection.needsUpdate=true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(reflection);
  scene.environment = environment.texture;
  scene.environmentIntensity = .7;scene.environmentRotation.set(Math.PI/2,0,0);
  pmrem.dispose();reflection.dispose();
  scene.add(new THREE.HemisphereLight(0xf1f3f5,0x45484b,.22));
  const addLight=(position,intensity,shadow=false)=>{
    const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(...position);light.castShadow=shadow;
    if(shadow){light.shadow.mapSize.set(1024,1024); Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:30});light.shadow.bias=-.0001; light.shadow.normalBias=.008;light.shadow.radius=6;light.shadow.blurSamples=12;}
    scene.add(light);
  };
  // A high key keeps the ground projection under the enclosure rather than
  // leaving an enclosure-sized silhouette behind the live model.
  addLight([2,-4,7],.45,true);addLight([-5,-1,3],.08);
  // Finite softboxes produce a reflected sweep across flat metal faces.
  // Perspective viewing makes each surface point see its own studio angle.
  const studioLights=[];
  const area=(color,intensity,width,height,position)=>{
    const light=new THREE.RectAreaLight(color,intensity,width,height);
    light.position.set(...position);light.lookAt(0,0,0);scene.add(light);studioLights.push(light);
  };
  // Match the portrait's warm long key, quiet cool fill and narrow back edge.
  area(0xfff5e0,4,5,2,[2,-4,7]);
  area(0xffffff,7,4,1,[1,5,6]);
  area(0xd6e6ff,.8,4,4,[-5,-1,3]);
  area(0xffebcc,1.2,3,.6,[5,-6,1]);
  const bounds=new THREE.Box3().setFromObject(scene);
  const frameCorners=[];
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])frameCorners.push(new THREE.Vector3(x,y,z));
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(18,18),new THREE.ShadowMaterial({opacity:.08}));
  floor.position.z=bounds.min.z-.015;floor.receiveShadow=true;scene.add(floor);
  const anchors={capacitors:new THREE.Vector3().fromArray(manifest.rotors[0]).add(new THREE.Vector3(0,.15,.2)),motors:new THREE.Vector3(0,-1.9,-.1),control:new THREE.Vector3(0,-2.3,.8)};
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let state={mode:'machine',part:'capacitors',m1:72,m2:108,progress:0}, raf=0, disposed=false, paused=false, tween=null, returnPose=null, projectionMix=0, projectionTarget=0;
  const cameraTarget=new THREE.Vector3(...machinePosition);
  const rotorTargets=[0,0];
  camera.position.copy(cameraTarget);
  const readAnchors=(activeCamera=camera)=>{
    activeCamera.updateMatrixWorld();
    const points={};
    for(const [name,point] of Object.entries(anchors)){const projected=point.clone().project(activeCamera);points[name]=[(projected.x+1)*50,(1-projected.y)*50];}
    onAnchors?.(points);
  };
  function draw(){
    if(disposed||paused||document.hidden)return;
    camera.lookAt(0,0,0);
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(viewSpan/camera.position.length()));
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const extent=Math.max(...frameCorners.map(point=>{const p=point.clone().project(camera);return Math.max(Math.abs(p.x),Math.abs(p.y));}));
    if(extent>.9){camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*extent/.9));camera.updateProjectionMatrix();}
    if(heroLinked){
      portraitCamera.position.copy(camera.position);portraitCamera.lookAt(0,0,0);
      // Normalize perspective at the model origin before blending projections.
      // This keeps the same outline at rest and avoids a lens switch on Inside.
      const depth=camera.position.length();
      for(let i=0;i<16;i++)portraitCamera.projectionMatrix.elements[i]=portraitProjection.elements[i]*(1-projectionMix)+camera.projectionMatrix.elements[i]/depth*projectionMix;
      portraitCamera.projectionMatrixInverse.copy(portraitCamera.projectionMatrix).invert();
      portraitCamera.updateMatrixWorld();
      renderer.render(scene,portraitCamera);readAnchors(portraitCamera);return;
    }
    renderer.render(scene,camera);readAnchors();
  }
  function frame(now){
    raf=0;if(disposed||paused)return;
    if(tween){
      const t=Math.min(1,Math.max(0,(now-tween.start)/tween.duration));
      const eased=1-Math.pow(1-t,4);
      camera.position.lerpVectors(tween.camera,cameraTarget,eased);
      projectionMix=tween.projection+(projectionTarget-tween.projection)*eased;
      rotorTargets.forEach((target,i)=>{rotors[i].rotation.y=tween.rotors[i]+(target-tween.rotors[i])*eased;});
      if(t===1)tween=null;
    }else{
      camera.position.copy(cameraTarget);
      projectionMix=projectionTarget;
      rotorTargets.forEach((target,i)=>{rotors[i].rotation.y=target;});
    }
    draw();
    if(tween)raf=requestAnimationFrame(frame);
  }
  function request(){if(!raf&&!disposed&&!paused)raf=requestAnimationFrame(frame);}
  function update(next,{duration=0,scrub=false}={}){
    returnPose=null;
    state={...state,...next};
    const inside=state.mode==='inside'||state.mode==='tune';
    projectionTarget=inside?1:0;
    cameraTarget.set(...(inside?[3,-5,11]:machinePosition));
    if(state.mode==='inside'&&state.part==='control')cameraTarget.set(4,-11,5);
    if(state.mode==='inside'&&state.part==='motors')cameraTarget.set(7,-11,4);
    const reveal=state.mode==='machine'&&!motion.matches?Math.sin(Math.min(1,Math.max(0,state.progress))*Math.PI):0;
    if(reveal)cameraTarget.set(machinePosition[0]-4.5*reveal,machinePosition[1]+4.5*reveal,machinePosition[2]+4*reveal);
    // The portrait's neutral shafts own the seat; saved tuning values return
    // during exploration, without changing the interactive tuner state.
    const motorTravel=heroLinked&&state.mode==='machine'?Math.min(1,Math.max(0,state.progress/.15)):1;
    const motorBlend=motorTravel*motorTravel*(3-2*motorTravel);
    rotorTargets[0]=THREE.MathUtils.degToRad((state.m1-72)*motorBlend+40*reveal);
    rotorTargets[1]=THREE.MathUtils.degToRad((state.m2-108)*motorBlend-40*reveal);
    for(const part of parts){
      const selected=state.mode==='inside'&&(part.group===state.part||(state.part==='capacitors'&&part.group.startsWith('rotor')));
      part.mesh.material.emissive.set(selected?0x78402c:0x000000);part.mesh.material.emissiveIntensity=selected?.17:0;
    }
    if(motion.matches||scrub){
      tween=null;cancelAnimationFrame(raf);raf=0;
      camera.position.copy(cameraTarget);projectionMix=projectionTarget;
      rotorTargets.forEach((target,i)=>{rotors[i].rotation.y=target;});draw();
    }else{
      if(duration>0)tween={camera:camera.position.clone(),projection:projectionMix,rotors:rotorTargets.map((_,i)=>rotors[i].rotation.y),start:performance.now(),duration};
      request();
    }
  }
  function returnToMachine(progress){
    if(disposed)return;
    if(!returnPose)returnPose={camera:camera.position.clone(),projection:projectionMix,rotors:rotors.map(rotor=>rotor.rotation.y),emission:parts.map(part=>part.mesh.material.emissiveIntensity)};
    tween=null;cancelAnimationFrame(raf);raf=0;
    const t=Math.min(1,Math.max(0,progress));
    const eased=t*t*t*(t*(t*6-15)+10);
    cameraTarget.set(...machinePosition);
    camera.position.lerpVectors(returnPose.camera,cameraTarget,eased);
    projectionMix=returnPose.projection*(1-eased);
    const targets=heroLinked?[0,0]:[THREE.MathUtils.degToRad(state.m1-72),THREE.MathUtils.degToRad(state.m2-108)];
    rotors.forEach((rotor,i)=>{rotor.rotation.y=returnPose.rotors[i]+(targets[i]-returnPose.rotors[i])*eased;});
    parts.forEach((part,i)=>{part.mesh.material.emissiveIntensity=returnPose.emission[i]*(1-eased);});
    draw();
  }
  const resize=()=>{
    if(disposed)return;
    const {width,height}=mount.getBoundingClientRect();if(width<1||height<1)return;
    renderer.setSize(width,height,false);
    // Match object-fit: contain and the portrait's desktop scale/vertical seat.
    const portraitWidth=Math.min(width,height*4/3)*(spaciousPortrait.matches?.84:1);
    const spanX=7.8*width/portraitWidth,spanY=spanX*height/width;
    const shift=spaciousPortrait.matches?spanY*.04:0;
    portraitCamera.left=-spanX/2;portraitCamera.right=spanX/2;
    portraitCamera.top=spanY/2+shift;portraitCamera.bottom=-spanY/2+shift;
    portraitCamera.updateProjectionMatrix();
    portraitProjection.copy(portraitCamera.projectionMatrix);
    viewSpan=width/height>1.5?2.85:3.3;camera.aspect=width/height;draw();
  };
  const observer=new ResizeObserver(resize);observer.observe(mount);resize();update({});
  return {update,returnToMachine,pause(value){if(paused===value)return;paused=value;if(value){cancelAnimationFrame(raf);raf=0;tween=null;}else request();},dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();parts.forEach(({mesh})=>{mesh.geometry.dispose();mesh.material.dispose();});studioLights.forEach(light=>light.dispose());floor.geometry.dispose();floor.material.dispose();environment.dispose();surfaceMaps.forEach(texture=>texture.dispose());metalBitmap.close();plasticBitmap.close();renderer.dispose();renderer.domElement.remove();}};
}
