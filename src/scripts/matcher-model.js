// Optional, demand-rendered CAD. The raster composition is the first paint.
export async function createMatcherModel(mount, { signal, onAnchors }) {
  const [THREE, manifestResponse, binaryResponse] = await Promise.all([
    import('../vendor/three-0.170.0.module.min.js'),
    fetch('/assets/matcher/assembly.json', { signal }),
    fetch('/assets/matcher/assembly.bin', { signal }),
  ]);
  if (!manifestResponse.ok || !binaryResponse.ok) throw new Error('Matcher geometry unavailable');
  const [manifest, binary] = await Promise.all([manifestResponse.json(), binaryResponse.arrayBuffer()]);
  if (signal.aborted) return null;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4.5,4.5,3.3,-3.3,.1,80);
  camera.up.set(0,0,1);
  const parts = [];
  const rotors = manifest.rotors.map(point => { const group = new THREE.Group(); group.position.fromArray(point); scene.add(group); return group; });
  for (const part of manifest.parts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(binary, ...part.positions),3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(binary, ...part.normals),3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(binary, ...part.indices),1));
    const color = new THREE.Color().setRGB(...part.color);
    const material = new THREE.MeshStandardMaterial({ color, roughness: Math.max(.28,part.roughness), metalness: Math.min(.48,part.metallic), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry,material);
    mesh.castShadow=true; mesh.receiveShadow=true;
    if (part.group.startsWith('rotor')) {
      const rotor=rotors[Number(part.group.slice(-1))-1];
      geometry.translate(-rotor.position.x,-rotor.position.y,-rotor.position.z);
      rotor.add(mesh);
    } else scene.add(mesh);
    parts.push({mesh, group:part.group, color});
  }
  scene.add(new THREE.HemisphereLight(0xf8eee0,0x677b88,2.8));
  const addLight=(position,intensity,shadow=false)=>{
    const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(...position);light.castShadow=shadow;
    if(shadow){light.shadow.mapSize.set(1024,1024); Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:30});light.shadow.bias=-.001; light.shadow.normalBias=.02;light.shadow.radius=4;}
    scene.add(light);
  };
  addLight([3,-4,8],3,true);addLight([-5,-2,3],2);addLight([1,6,6],2.6);
  const bounds=new THREE.Box3().setFromObject(scene);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(18,18),new THREE.ShadowMaterial({opacity:.12}));
  floor.position.z=bounds.min.z-.015;floor.receiveShadow=true;scene.add(floor);
  const anchors={capacitors:new THREE.Vector3().fromArray(manifest.rotors[0]).lerp(new THREE.Vector3().fromArray(manifest.rotors[1]),.5),motors:new THREE.Vector3(0,-1.9,-.1),control:new THREE.Vector3(0,-2.3,.8)};
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let state={mode:'machine',part:'capacitors',m1:72,m2:108,progress:0}, raf=0, disposed=false, paused=false, start=0;
  const cameraTarget=new THREE.Vector3(7,-10,7);
  camera.position.copy(cameraTarget);
  const readAnchors=()=>{
    camera.updateMatrixWorld();
    const points={};
    for(const [name,point] of Object.entries(anchors)){const projected=point.clone().project(camera);points[name]=[(projected.x+1)*50,(1-projected.y)*50];}
    onAnchors?.(points);
  };
  function draw(){
    if(disposed||paused||document.hidden)return;
    camera.lookAt(0,0,0);renderer.render(scene,camera);readAnchors();
  }
  function frame(now){
    raf=0;if(disposed||paused)return;
    if(!start)start=now;
    const delta=camera.position.distanceTo(cameraTarget);
    camera.position.lerp(cameraTarget,.16);
    draw();
    if(delta>.01&&now-start<1100)raf=requestAnimationFrame(frame);
    else{camera.position.copy(cameraTarget);draw();start=0;}
  }
  function request(){if(!raf&&!disposed&&!paused)raf=requestAnimationFrame(frame);}
  function update(next){
    state={...state,...next};
    const inside=state.mode==='inside'||state.mode==='tune';
    cameraTarget.set(...(inside?[3,-5,11]:[7,-10,7]));
    if(state.mode==='inside'&&state.part==='control')cameraTarget.set(4,-11,5);
    if(state.mode==='inside'&&state.part==='motors')cameraTarget.set(7,-11,4);
    if(state.mode==='machine'&&!motion.matches)cameraTarget.x+=Math.min(1,Math.max(0,state.progress))*1.4;
    rotors[0].rotation.y=THREE.MathUtils.degToRad(state.m1-72);
    rotors[1].rotation.y=THREE.MathUtils.degToRad(state.m2-108);
    for(const part of parts){
      const selected=state.mode==='inside'&&(part.group===state.part||(state.part==='capacitors'&&part.group.startsWith('rotor')));
      part.mesh.material.emissive.set(selected?0x78402c:0x000000);part.mesh.material.emissiveIntensity=selected?.17:0;
    }
    if(motion.matches){camera.position.copy(cameraTarget);draw();}else request();
  }
  const resize=()=>{
    if(disposed)return;
    const {width,height}=mount.getBoundingClientRect();if(width<1||height<1)return;
    renderer.setSize(width,height,false);
    const span=3.4;camera.left=-span*width/height;camera.right=span*width/height;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();draw();
  };
  const observer=new ResizeObserver(resize);observer.observe(mount);resize();update({});
  return {update,pause(value){paused=value;if(value){cancelAnimationFrame(raf);raf=0;}else request();},dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();parts.forEach(({mesh})=>{mesh.geometry.dispose();mesh.material.dispose();});floor.geometry.dispose();floor.material.dispose();renderer.dispose();renderer.domElement.remove();}};
}
