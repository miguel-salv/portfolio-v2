// Optional, demand-rendered CAD. The raster composition is the first paint.
import studio from '../../reel/matcher_studio.json';
import {appendShadowDetail,decodeSurfaceContact} from './matcher-shadow-detail.js';
import {stepMechanism,matcherAssemblyPose,splitMotorTriangles} from './mechanism-motion.js';

export async function createMatcherModel(mount, { signal, onAnchors, onPose, heroLinked=false }) {
  const [THREE, { RGBELoader }, { RectAreaLightUniformsLib }, manifestResponse, binaryResponse, hdrResponse, metalResponse, colorResponse, contactBuffer, visibilityBuffer, enclosureBuffer, rotorBuffer, detailAssets] = await Promise.all([
    import('../vendor/three-0.170.0.module.min.js'),
    import('../vendor/RGBELoader-0.170.0.js'),
    import('../vendor/RectAreaLightUniformsLib-0.170.0.js'),
    fetch('/assets/matcher/assembly.json', { signal }),
    fetch('/assets/matcher/assembly.bin', { signal }),
    fetch('/assets/matcher/studio-reflections.hdr', { signal }),
    fetch('/assets/matcher/metal-bump.png', { signal }),
    fetch('/assets/matcher/hero-color-lut.bin', { signal }),
    fetch('/assets/matcher/contact-shading.bin', { signal }).then(response=>response.ok?response.arrayBuffer():null).catch(()=>null),
    fetch('/assets/matcher/studio-visibility.bin', { signal }).then(response=>response.ok?response.arrayBuffer():null).catch(()=>null),
    fetch('/assets/matcher/enclosure-reflections.hdr', { signal }).then(response=>response.ok?response.arrayBuffer():null).catch(()=>null),
    fetch('/assets/matcher/rotor-visibility.bin', { signal }).then(response=>response.ok?response.arrayBuffer():null).catch(()=>null),
    Promise.all([
      ...['shadow-detail.json','shadow-detail-fixed.png','shadow-detail-rotors.png'].map(name=>fetch('/assets/matcher/'+name,{signal}).then(response=>response.ok?response.arrayBuffer():null)),
      typeof DecompressionStream==='function'?fetch('/assets/matcher/surface-contact.bin.gz',{signal}).then(response=>response.ok&&response.body?new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():null).catch(()=>null):null,
    ]).catch(()=>null),
  ]);
  if ([manifestResponse,binaryResponse,hdrResponse,metalResponse,colorResponse].some(response=>!response.ok)) throw new Error('Matcher assets unavailable');
  const [manifest, binary, hdrBuffer, metalBitmap, colorBuffer] = await Promise.all([
    manifestResponse.json(), binaryResponse.arrayBuffer(), hdrResponse.arrayBuffer(),
    metalResponse.blob().then(blob=>createImageBitmap(blob)), colorResponse.arrayBuffer(),
  ]);
  if (signal.aborted) { metalBitmap.close();return null; }
  // The bake is optional and tied to the exact geometry, never reused after a
  // changed export. Invalid/missing shading falls back to ordinary materials.
  const vertexCount=manifest.parts.reduce((count,part)=>count+part.positions[1]/3,0);
  let contactBytes=null,visibilityBytes=null,rotorBake=null;
  const digest=globalThis.crypto?.subtle?new Uint8Array(await crypto.subtle.digest('SHA-256',binary)):null;
  const lightsDigest=digest?new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(studio.lights)))):null;
  if(contactBuffer?.byteLength===vertexCount+36 && new TextDecoder().decode(contactBuffer.slice(0,4))==='MCA1' && digest){
    const expected=new Uint8Array(contactBuffer,4,32);
    if(digest.every((value,index)=>value===expected[index]))contactBytes=new Uint8Array(contactBuffer,36);
  }
  if(visibilityBuffer?.byteLength===vertexCount*4+68 && new TextDecoder().decode(visibilityBuffer.slice(0,4))==='MVS1' && digest){
    const expected=new Uint8Array(visibilityBuffer,4,32);
    const expectedLights=new Uint8Array(visibilityBuffer,36,32);
    if(digest.every((value,index)=>value===expected[index])&&lightsDigest.every((value,index)=>value===expectedLights[index]))visibilityBytes=new Uint8Array(visibilityBuffer,68);
  }
  if(rotorBuffer?.byteLength>=80 && new TextDecoder().decode(rotorBuffer.slice(0,4))==='MVR1' && digest){
    const header=new DataView(rotorBuffer),poses=header.getUint32(68,true),first=header.getFloat32(72,true),step=header.getFloat32(76,true);
    const rotorVertices=manifest.parts.reduce((count,part)=>count+(part.group.startsWith('rotor')?part.positions[1]/3:0),0);
    const expected=new Uint8Array(rotorBuffer,4,32),expectedLights=new Uint8Array(rotorBuffer,36,32);
    if(poses===13&&first===-180&&step===30&&rotorBuffer.byteLength===80+rotorVertices*4*poses&&digest.every((value,index)=>value===expected[index])&&lightsDigest.every((value,index)=>value===expectedLights[index])){
      rotorBake={bytes:new Uint8Array(rotorBuffer,80),poses,first,step};
    }
  }
  let shadowDetail=null;
  if(digest&&detailAssets?.slice(0,3).every(Boolean)){
    try{
      const metadata=JSON.parse(new TextDecoder().decode(detailAssets[0]));
      const hex=bytes=>Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
      const hashes=await Promise.all(detailAssets.slice(1,3).map(buffer=>crypto.subtle.digest('SHA-256',buffer).then(hash=>hex(new Uint8Array(hash)))));
      const moving=metadata.rotors;
      if(metadata.geometrySHA256===hex(digest)&&metadata.lightsSHA256===hex(lightsDigest)&&hashes.every((hash,index)=>hash===metadata.textures[['shadow-detail-fixed.png','shadow-detail-rotors.png'][index]])&&moving.angles.length===13&&moving.angles.every((angle,index)=>angle===-180+index*30)){
        const bitmaps=await Promise.all(detailAssets.slice(1,3).map(buffer=>createImageBitmap(new Blob([buffer],{type:'image/png'}),{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'})));
        if(bitmaps[0].width===metadata.fixed.width&&bitmaps[0].height===metadata.fixed.height&&bitmaps[1].width===moving.width&&bitmaps[1].height===moving.height*13){
          const textures=bitmaps.map(bitmap=>{const texture=new THREE.Texture(bitmap);texture.flipY=false;texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;});
          shadowDetail={metadata,bitmaps,textures,contactTextures:[]};
          if(detailAssets[3]?.byteLength>=40){
            const layoutDigest=new Uint8Array(await crypto.subtle.digest('SHA-256',detailAssets[0]));
            const expected=new Uint8Array(detailAssets[3],4,32),fixedLength=metadata.fixed.width*metadata.fixed.height;
            const contact=layoutDigest.every((value,index)=>value===expected[index])?decodeSurfaceContact(detailAssets[3],fixedLength+moving.width*moving.height*13):null;
            if(contact){
              shadowDetail.contactTextures=[new THREE.DataTexture(contact.subarray(0,fixedLength),metadata.fixed.width,metadata.fixed.height,THREE.RedFormat),new THREE.DataTexture(contact.subarray(fixedLength),moving.width,moving.height*13,THREE.RedFormat)];
              shadowDetail.contactTextures.forEach(texture=>{texture.unpackAlignment=1;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;});
            }
          }
        }else bitmaps.forEach(bitmap=>bitmap.close());
      }
    }catch{/* Optional detail never prevents the base inspection from loading. */}
  }
  if (signal.aborted) { metalBitmap.close();shadowDetail?.textures.forEach(texture=>texture.dispose());shadowDetail?.contactTextures.forEach(texture=>texture.dispose());shadowDetail?.bitmaps.forEach(bitmap=>bitmap.close());return null; }
  const colorHeader=new DataView(colorBuffer);
  const colorSize=colorBuffer.byteLength>=16?colorHeader.getUint32(4,true):0;
  if(new TextDecoder().decode(colorBuffer.slice(0,4))!=='MLT1'||colorSize!==33||colorBuffer.byteLength!==16+4*colorSize**3){metalBitmap.close();throw new Error('Matcher color asset unavailable');}
  const colorMinimum=colorHeader.getFloat32(8,true),colorRange=colorHeader.getFloat32(12,true)-colorMinimum;
  const colorLut=new THREE.Data3DTexture(new Uint8Array(colorBuffer,16),colorSize,colorSize,colorSize);
  colorLut.format=THREE.RGBAFormat;colorLut.type=THREE.UnsignedByteType;colorLut.minFilter=colorLut.magFilter=THREE.LinearFilter;
  colorLut.unpackAlignment=1;colorLut.needsUpdate=true;
  const metalBump=new THREE.Texture(metalBitmap);
  metalBump.wrapS=metalBump.wrapT=THREE.RepeatWrapping;metalBump.repeat.set(8.75,8.75);
  metalBump.colorSpace=THREE.NoColorSpace;metalBump.needsUpdate=true;
  const enclosureBump=metalBump.clone();
  // The hero's Noise texture uses each object's generated coordinates. Its
  // 420 cells span the whole enclosure, rather than each world-space unit.
  enclosureBump.repeat.set(420/(16*3*5.198),420/(16*3*5.198));
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  if (!THREE.UniformsLib.LTC_FLOAT_1) RectAreaLightUniformsLib.init();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // The material shader uses the actual Blender display transform below.
  // Avoid applying a second tone or color-space conversion after that lookup.
  renderer.toneMapping = THREE.NoToneMapping;
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
  const mobilePortrait=matchMedia('(max-width: 760px)');
  const machinePosition=heroLinked?[8,-12,mobilePortrait.matches?10:9]:[7,-10,7];
  const spaciousPortrait=matchMedia('(min-width: 1101px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)');
  let viewSpan=3.3;
  camera.up.set(0,0,1);
  const parts = [];
  const geometries = new Set(), assemblyLighting = {value:1};
  const assembly = Object.fromEntries(['capacitors','control','leftMotor','rightMotor'].map(name=>{
    const group=new THREE.Group();scene.add(group);return [name,group];
  }));
  // The directional key exists only to cast the floor shadow. Let the four
  // authored softboxes light hardware, without the former extra live fill.
  const lightChunk=THREE.ShaderChunk.lights_fragment_begin;
  const studioLightChunk=(lightChunk.slice(0,lightChunk.indexOf('#if ( NUM_DIR_LIGHTS'))+lightChunk.slice(lightChunk.indexOf('#if ( NUM_RECT_AREA_LIGHTS'))).replace(
    'rectAreaLight = rectAreaLights[ i ];',
    'rectAreaLight = rectAreaLights[ i ];\nrectAreaLight.color *= mix(1.0, vStudioVisibility[ i ], assemblyLighting);'
  );
  let contactOffset=0,rotorOffset=0;
  const rotorLighting=[];
  const rotors = manifest.rotors.map(point => { const group = new THREE.Group(); group.position.fromArray(point); assembly.capacitors.add(group); return group; });
  for (const [partIndex,part] of manifest.parts.entries()) {
    const geometry = new THREE.BufferGeometry();
    geometries.add(geometry);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(binary, ...part.positions),3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(binary, ...part.normals),3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(binary, ...part.uvs),2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(binary, ...part.indices),1));
    const count=part.positions[1]/3;
    geometry.setAttribute('contactShade',new THREE.BufferAttribute(contactBytes?contactBytes.subarray(contactOffset,contactOffset+count):new Uint8Array(count).fill(255),1,true));
    geometry.setAttribute('studioVisibility',new THREE.BufferAttribute(visibilityBytes?visibilityBytes.subarray(contactOffset*4,(contactOffset+count)*4):new Uint8Array(count*4).fill(255),4,true));
    contactOffset+=count;
    const movingPart=part.group.startsWith('rotor');
    const detail=shadowDetail&&(!movingPart||rotorBake)?shadowDetail.metadata[movingPart?'rotors':'fixed']:null;
    const tiles=detail?.tiles.filter(tile=>tile.part===partIndex);
    const detailIndices=tiles?.length?appendShadowDetail(THREE,geometry,tiles,detail.width,detail.height):null;
    let poseLighting=null;
    if(rotorBake&&part.group.startsWith('rotor')){
      const stride=geometry.attributes.position.count*4,originalStride=count*4;
      const frames=Array.from({length:rotorBake.poses},(_,index)=>{
        const original=rotorBake.bytes.subarray(rotorOffset+index*originalStride,rotorOffset+(index+1)*originalStride);
        if(!detailIndices)return original;
        const frame=new Uint8Array(stride);frame.set(original);
        detailIndices.forEach((source,i)=>frame.set(original.subarray(source*4,source*4+4),(count+i)*4));
        return frame;
      });
      poseLighting={rotor:rotors[Number(part.group.slice(-1))-1],geometry,frames,stride,bucket:-1,mix:{value:0},surfacePose:{value:new THREE.Vector2()}};
      geometry.attributes.studioVisibility.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('nextStudioVisibility',new THREE.BufferAttribute(new Uint8Array(stride),4,true).setUsage(THREE.DynamicDrawUsage));
      rotorLighting.push(poseLighting);rotorOffset+=originalStride*rotorBake.poses;
    }
    const color = new THREE.Color().setRGB(...part.color);
    const enclosure=part.material.includes('cast aluminum');
    const machined=part.material.includes('cast aluminum')||part.material.includes('capacitor aluminum');
    let enclosureBounds=null;
    if(enclosure){
      geometry.computeBoundingBox();enclosureBounds=geometry.boundingBox.clone();
      const center=enclosureBounds.getCenter(new THREE.Vector3());
      const surfaceCount=geometry.attributes.position.count;
      const localReflection=new Uint8Array(surfaceCount);
      for(let index=0;index<surfaceCount;index++){
        const p=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,index);
        const n=new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal,index);
        localReflection[index]=Math.abs(n.z)<.8&&n.dot(center.clone().sub(p))>0?255:0;
      }
      geometry.setAttribute('localReflection',new THREE.BufferAttribute(localReflection,1,true));
    }
    const material = new THREE.MeshPhysicalMaterial({
      color, roughness:part.roughness, metalness:part.metallic,
      bumpMap:enclosure?enclosureBump:machined?metalBump:null,bumpScale:.002*.12,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile=shader=>{
      shader.uniforms.matcherColorLut={value:colorLut};
      shader.uniforms.matcherExposure={value:studio.live.exposure};
      shader.uniforms.assemblyLighting=assemblyLighting;
      shader.vertexShader='attribute float contactShade;\nattribute vec4 studioVisibility;\nvarying float vContactShade;\nvarying vec4 vStudioVisibility;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvContactShade = contactShade;\nvStudioVisibility = studioVisibility;');
      if(poseLighting){
        shader.uniforms.studioPoseMix=poseLighting.mix;
        shader.vertexShader='attribute vec4 nextStudioVisibility;\nuniform float studioPoseMix;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('vStudioVisibility = studioVisibility;','vStudioVisibility = mix(studioVisibility, nextStudioVisibility, studioPoseMix);');
      }
      shader.fragmentShader='uniform highp sampler3D matcherColorLut;\nuniform float matcherExposure;\nuniform float assemblyLighting;\nvarying float vContactShade;\nvarying vec4 vStudioVisibility;\n'+shader.fragmentShader;
      let surfaceLightChunk=studioLightChunk;
      if(detailIndices){
        shader.uniforms.shadowDetailMap={value:shadowDetail.textures[movingPart?1:0]};
        shader.vertexShader='attribute vec3 shadowDetailUv;\nvarying vec3 vShadowDetailUv;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvShadowDetailUv = shadowDetailUv;');
        shader.fragmentShader='uniform sampler2D shadowDetailMap;\nvarying vec3 vShadowDetailUv;\n'+shader.fragmentShader;
        if(movingPart){shader.uniforms.shadowDetailPose=poseLighting.surfacePose;shader.fragmentShader='uniform vec2 shadowDetailPose;\n'+shader.fragmentShader;}
        const sample=movingPart?'mix(texture2D(shadowDetailMap,vec2(vShadowDetailUv.x,(vShadowDetailUv.y+shadowDetailPose.x)/13.0)),texture2D(shadowDetailMap,vec2(vShadowDetailUv.x,(vShadowDetailUv.y+shadowDetailPose.x+1.0)/13.0)),shadowDetailPose.y)':'texture2D(shadowDetailMap,vShadowDetailUv.xy)';
        surfaceLightChunk=`vec4 surfaceVisibility=vStudioVisibility;\nif(vShadowDetailUv.z>0.5)surfaceVisibility=${sample};\n`+surfaceLightChunk.replace('vStudioVisibility[ i ]','surfaceVisibility[ i ]');
      }
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',surfaceLightChunk);
      let contactChunk='float surfaceContact=vContactShade;';
      if(detailIndices&&shadowDetail.contactTextures.length){
        shader.uniforms.surfaceContactMap={value:shadowDetail.contactTextures[movingPart?1:0]};
        shader.fragmentShader='uniform sampler2D surfaceContactMap;\n'+shader.fragmentShader;
        const sample=movingPart?'mix(texture2D(surfaceContactMap,vec2(vShadowDetailUv.x,(vShadowDetailUv.y+shadowDetailPose.x)/13.0)).r,texture2D(surfaceContactMap,vec2(vShadowDetailUv.x,(vShadowDetailUv.y+shadowDetailPose.x+1.0)/13.0)).r,shadowDetailPose.y)':'texture2D(surfaceContactMap,vShadowDetailUv.xy).r';
        contactChunk+=`\nif(vShadowDetailUv.z>0.5)surfaceContact=${sample};`;
      }
      shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>\n${contactChunk}\nsurfaceContact=mix(1.0,surfaceContact,assemblyLighting);\nreflectedLight.indirectDiffuse *= surfaceContact;\nreflectedLight.indirectSpecular *= surfaceContact;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>',`
        vec3 lookupRgb = (log2(max(gl_FragColor.rgb * matcherExposure, vec3(exp2(${colorMinimum.toFixed(1)})))) - vec3(${colorMinimum.toFixed(1)})) / ${colorRange.toFixed(1)};
        lookupRgb = clamp(lookupRgb, 0.0, 1.0) * ${(colorSize-1)/colorSize} + vec3(${.5/colorSize});
        gl_FragColor.rgb = texture(matcherColorLut, lookupRgb).rgb;
      `);
      if(enclosure&&enclosureEnvironment){
        shader.uniforms.enclosureMap={value:enclosureEnvironment.texture};
        shader.uniforms.enclosureMinimum={value:enclosureBounds.min};
        shader.uniforms.enclosureMaximum={value:enclosureBounds.max};
        shader.uniforms.enclosureProbe={value:new THREE.Vector3(...studio.live.reflectionProbe)};
        shader.vertexShader='attribute float localReflection;\nvarying float vLocalReflection;\nvarying vec3 vEnclosurePosition;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvLocalReflection = localReflection;\nvEnclosurePosition = worldPosition.xyz;');
        shader.fragmentShader='uniform sampler2D enclosureMap;\nuniform vec3 enclosureMinimum;\nuniform vec3 enclosureMaximum;\nuniform vec3 enclosureProbe;\nvarying float vLocalReflection;\nvarying vec3 vEnclosurePosition;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <cube_uv_reflection_fragment>','#include <cube_uv_reflection_fragment>\n'+enclosureCubeChunk);
        const localReflectionChunk=THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
          'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );',`
          vec4 envMapColor;
          if(vLocalReflection > 0.5){
            vec3 safeDirection = mix(vec3(-1.0),vec3(1.0),step(vec3(0.0),reflectVec)) * max(abs(reflectVec),vec3(0.00001));
            vec3 farPlane = max((enclosureMinimum-vEnclosurePosition)/safeDirection, (enclosureMaximum-vEnclosurePosition)/safeDirection);
            float distanceToBox = max(0.0, min(farPlane.x, min(farPlane.y, farPlane.z)));
            vec3 localDirection = normalize(vEnclosurePosition + reflectVec * distanceToBox - enclosureProbe);
            envMapColor = mix(textureCubeUV(envMap, envMapRotation * reflectVec, roughness), enclosureTextureCubeUV(enclosureMap, envMapRotation * localDirection, roughness), assemblyLighting);
          }else{
            envMapColor = textureCubeUV(envMap, envMapRotation * reflectVec, roughness);
          }`
        );
        shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',localReflectionChunk);
      }
    };
    material.customProgramCacheKey=()=>`matcher-hero-finish-v4-${colorMinimum}-${colorRange}-${enclosure&&Boolean(enclosureEnvironment)}-${Boolean(poseLighting)}-${Boolean(detailIndices)}-${Boolean(shadowDetail?.contactTextures.length)}`;
    if(part.group==='motors'){
      const sides=splitMotorTriangles(geometry.attributes.position.array,geometry.index.array);
      sides.forEach((indices,index)=>{
        if(!indices.length)return;
        const subset=new THREE.BufferGeometry();geometries.add(subset);
        for(const [name,attribute] of Object.entries(geometry.attributes))subset.setAttribute(name,attribute);
        subset.setIndex(new THREE.BufferAttribute(indices,1));
        const mesh=new THREE.Mesh(subset,material);mesh.castShadow=true;mesh.receiveShadow=true;
        assembly[index?'rightMotor':'leftMotor'].add(mesh);parts.push({mesh,group:part.group,color});
      });
      continue;
    }
    const mesh = new THREE.Mesh(geometry,material);
    mesh.castShadow=true; mesh.receiveShadow=true;
    if (part.group.startsWith('rotor')) {
      const rotor=rotors[Number(part.group.slice(-1))-1];
      geometry.translate(-rotor.position.x,-rotor.position.y,-rotor.position.z);
      rotor.add(mesh);
    } else (assembly[part.group]||scene).add(mesh);
    parts.push({mesh, group:part.group, color});
  }
  // Authored high-range strip-light raster, shared by all three live states.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const makeEnvironment=buffer=>{
    const hdr=new RGBELoader().parse(buffer);
    const reflection=new THREE.DataTexture(hdr.data,hdr.width,hdr.height,THREE.RGBAFormat,hdr.type);
    reflection.colorSpace=THREE.LinearSRGBColorSpace;reflection.mapping=THREE.EquirectangularReflectionMapping;
    reflection.minFilter=reflection.magFilter=THREE.LinearFilter;reflection.flipY=true;reflection.needsUpdate=true;
    const target=pmrem.fromEquirectangular(reflection);reflection.dispose();return target;
  };
  const environment = makeEnvironment(hdrBuffer);
  const digestHex=digest?Array.from(digest,value=>value.toString(16).padStart(2,'0')).join(''):null;
  const validEnclosure=enclosureBuffer&&digestHex&&new TextDecoder().decode(enclosureBuffer.slice(0,2048)).includes('# Assembly-SHA256: '+digestHex);
  const enclosureEnvironment=validEnclosure?makeEnvironment(enclosureBuffer):null;
  // The probe uses a smaller PMREM atlas. Reuse Three's filtering functions
  // with that atlas's actual dimensions, rather than sampling it as the studio.
  let enclosureCubeChunk='';
  if(enclosureEnvironment){
    const chunk=THREE.ShaderChunk.cube_uv_reflection_fragment;
    enclosureCubeChunk=(chunk.slice(chunk.indexOf('vec3 bilinearCubeUV'),chunk.indexOf('#define cubeUV_r0'))+chunk.slice(chunk.indexOf('vec4 textureCubeUV'),chunk.lastIndexOf('#endif')))
      .replaceAll('bilinearCubeUV','enclosureBilinearCubeUV').replaceAll('textureCubeUV','enclosureTextureCubeUV')
      .replaceAll('CUBEUV_TEXEL_WIDTH',`(1.0 / ${enclosureEnvironment.width}.0)`)
      .replaceAll('CUBEUV_TEXEL_HEIGHT',`(1.0 / ${enclosureEnvironment.height}.0)`)
      .replaceAll('CUBEUV_MAX_MIP',Math.log2(enclosureEnvironment.height/4).toFixed(1));
  }
  scene.environment = environment.texture;
  // The panorama supplies subtle reflected/bounce light; the finite emitters
  // below supply the main light, avoiding a second full-strength studio rig.
  scene.environmentIntensity = 1;
  // Blender's panorama is Z-up with +Y at its center. This maps the Three
  // sampler's X/Y/Z to model Y/Z/X, keeping each card beside its real light.
  scene.environmentRotation.set(Math.PI/2,0,Math.PI/2);
  pmrem.dispose();
  const addLight=(position,intensity,shadow=false)=>{
    const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(...position);light.castShadow=shadow;
    if(shadow){light.shadow.mapSize.set(1024,1024); Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:30});light.shadow.bias=-.0001; light.shadow.normalBias=.008;light.shadow.radius=6;light.shadow.blurSamples=12;}
    scene.add(light);
  };
  // A high key keeps the ground projection under the enclosure rather than
  // leaving an enclosure-sized silhouette behind the live model.
  addLight([2,-4,7],.25,true);
  // Finite softboxes produce a reflected sweep across flat metal faces.
  // Perspective viewing makes each surface point see its own studio angle.
  const studioLights=[];
  const area=(color,intensity,width,height,position)=>{
    const light=new THREE.RectAreaLight(new THREE.Color().setRGB(...color),intensity,width,height);
    light.position.set(...position);light.up.set(0,0,1);light.lookAt(0,0,0);scene.add(light);studioLights.push(light);
  };
  // Same linear colors, poses and emitter dimensions as the hero renderer.
  for(const light of studio.lights){
    const radiance=light.power/(Math.PI*light.width*light.height);
    area(light.color,radiance*studio.live.areaScale,light.width,light.height,light.position);
  }
  const bounds=new THREE.Box3().setFromObject(scene);
  // Fit the actual component boxes, including each indexed motor half. A
  // single expanded enclosure box wastes space around the open inspection.
  const frameParts=parts.map(({mesh})=>{
    const box=new THREE.Box3(),point=new THREE.Vector3();
    for(const index of mesh.geometry.index.array)box.expandByPoint(point.fromBufferAttribute(mesh.geometry.attributes.position,index));
    const corners=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z));
    return {mesh,corners};
  });
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(18,18),new THREE.ShadowMaterial({opacity:.08}));
  floor.position.z=bounds.min.z-.015;floor.receiveShadow=true;scene.add(floor);
  const anchors={capacitors:new THREE.Vector3().fromArray(manifest.rotors[0]).add(new THREE.Vector3(0,.15,.2)),motors:new THREE.Vector3(manifest.rotors[1][0],-1.9,-.1),control:new THREE.Vector3(0,-2.3,.8)};
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let state={mode:'machine',part:'capacitors',m1:72,m2:108,progress:0}, raf=0, disposed=false, paused=false, pausedAt=0, tween=null, projectionMix=0, projectionTarget=0;
  let assemblyMix=0,assemblyTarget=0,assemblyTween=null,scrollingPose=false,lastFrame=null;
  const cameraTarget=new THREE.Vector3(...machinePosition);
  const rotorTargets=[0,0];
  camera.position.copy(cameraTarget);
  const readAnchors=(activeCamera=camera)=>{
    activeCamera.updateMatrixWorld();
    const points={};
    for(const [name,point] of Object.entries(anchors)){
      const group=assembly[name==='motors'?'rightMotor':name];
      const projected=point.clone().add(group.position).project(activeCamera);
      points[name]=[(projected.x+1)*50,(1-projected.y)*50];
    }
    onAnchors?.(points);
  };
  function draw(){
    if(disposed||paused||document.hidden)return;
    const pose=matcherAssemblyPose(assemblyMix);
    assembly.capacitors.position.fromArray(pose.capacitors);
    assembly.control.position.fromArray(pose.control);
    assembly.rightMotor.position.fromArray(pose.motors);
    assembly.leftMotor.position.set(-pose.motors[0],pose.motors[1],pose.motors[2]);
    // Assembled visibility/contact bakes stop describing separated hardware.
    // Ease them out; the existing real-time floor shadow follows every part.
    assemblyLighting.value=pose.lighting;
    // Precomputed area shadows follow the displayed shaft angle, including
    // tweened and return poses. Only crossing a pose boundary uploads buffers.
    for(const pose of rotorLighting){
      const degrees=((THREE.MathUtils.radToDeg(pose.rotor.rotation.y)+180)%360+360)%360-180;
      const position=(degrees-rotorBake.first)/rotorBake.step;
      const bucket=Math.min(rotorBake.poses-2,Math.floor(position));
      pose.mix.value=position-bucket;
      pose.surfacePose.value.set(bucket,pose.mix.value);
      if(bucket!==pose.bucket){
        const current=pose.geometry.attributes.studioVisibility,next=pose.geometry.attributes.nextStudioVisibility;
        current.array=pose.frames[bucket];current.needsUpdate=true;
        next.array=pose.frames[bucket+1];next.needsUpdate=true;
        pose.bucket=bucket;
      }
    }
    camera.lookAt(0,0,0);
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(viewSpan/camera.position.length()));
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
    scene.updateMatrixWorld();
    const extent=Math.max(...frameParts.flatMap(({mesh,corners})=>corners.map(point=>{
      const p=point.clone().applyMatrix4(mesh.matrixWorld).project(camera);
      return Math.max(Math.abs(p.x),Math.abs(p.y));
    })));
    if(extent>.9){camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*extent/.9));camera.updateProjectionMatrix();}
    if(heroLinked){
      portraitCamera.position.copy(camera.position);portraitCamera.lookAt(0,0,0);
      // Normalize perspective at the model origin before blending projections.
      // This keeps the same outline at rest and avoids a lens switch on Inside.
      const depth=camera.position.length();
      for(let i=0;i<16;i++)portraitCamera.projectionMatrix.elements[i]=portraitProjection.elements[i]*(1-projectionMix)+camera.projectionMatrix.elements[i]/depth*projectionMix;
      portraitCamera.projectionMatrixInverse.copy(portraitCamera.projectionMatrix).invert();
      portraitCamera.updateMatrixWorld();
      renderer.render(scene,portraitCamera);readAnchors(portraitCamera);onPose?.({assembly:assemblyMix,seated:isSeated()});return;
    }
    renderer.render(scene,camera);readAnchors();onPose?.({assembly:assemblyMix,seated:isSeated()});
  }
  function frame(now){
    raf=0;if(disposed||paused)return;
    const dt=lastFrame===null?1/60:(now-lastFrame)/1000;lastFrame=now;
    if(tween){
      const t=Math.min(1,Math.max(0,(now-tween.start)/tween.duration));
      const eased=1-Math.pow(1-t,4);
      camera.position.lerpVectors(tween.camera,cameraTarget,eased);
      projectionMix=tween.projection+(projectionTarget-tween.projection)*eased;
      if(t===1)tween=null;
    }else{
      camera.position.copy(cameraTarget);
      projectionMix=projectionTarget;
    }
    if(assemblyTween){
      const t=Math.min(1,Math.max(0,(now-assemblyTween.start)/assemblyTween.duration));
      assemblyMix=assemblyTween.from+(assemblyTarget-assemblyTween.from)*(1-Math.pow(1-t,4));
      if(t===1)assemblyTween=null;
    }else if(scrollingPose)assemblyMix=stepMechanism(assemblyMix,assemblyTarget,dt);
    else assemblyMix=assemblyTarget;
    syncRotors();
    draw();
    if(tween||assemblyTween||Math.abs(assemblyMix-assemblyTarget)>.00001)raf=requestAnimationFrame(frame);
    else lastFrame=null;
  }
  function request(){if(!raf&&!disposed&&!paused)raf=requestAnimationFrame(frame);}
  function syncRotors(){
    const travel=heroLinked&&state.mode==='machine'?Math.min(1,Math.max(0,assemblyMix/.15)):1;
    const blend=travel*travel*(3-2*travel);
    const reveal=motion.matches?0:matcherAssemblyPose(assemblyMix).shafts;
    rotorTargets[0]=THREE.MathUtils.degToRad((state.m1-72)*blend+45*reveal);
    rotorTargets[1]=THREE.MathUtils.degToRad((state.m2-108)*blend-45*reveal);
    rotorTargets.forEach((target,i)=>{rotors[i].rotation.y=target;});
  }
  function isSeated(){return assemblyMix<.002&&projectionMix<.002&&camera.position.clone().sub(cameraTarget).length()<.002;}
  function update(next,{duration=0,scrub=false,scroll=false}={}){
    state={...state,...next};
    const inside=state.mode==='inside'||state.mode==='tune';
    projectionTarget=inside?1:0;
    cameraTarget.set(...(inside?[3,-5,11]:machinePosition));
    if(state.mode==='inside'&&state.part==='control')cameraTarget.set(4,-11,5);
    if(state.mode==='inside'&&state.part==='motors')cameraTarget.set(7,-11,4);
    assemblyTarget=state.mode==='inside'?1:motion.matches?0:state.mode==='machine'?Math.min(1,Math.max(0,state.progress)):0;
    for(const part of parts){
      const selected=state.mode==='inside'&&(part.group===state.part||(state.part==='capacitors'&&part.group.startsWith('rotor')));
      // A quiet neutral lift keeps selection readable without tinting silver.
      part.mesh.material.emissive.set(selected?0xffffff:0x000000);part.mesh.material.emissiveIntensity=selected?.001:0;
    }
    if(motion.matches||scrub){
      tween=null;assemblyTween=null;scrollingPose=false;lastFrame=null;cancelAnimationFrame(raf);raf=0;
      assemblyMix=assemblyTarget;syncRotors();
      camera.position.copy(cameraTarget);projectionMix=projectionTarget;
      draw();
    }else{
      if(duration>0)tween={camera:camera.position.clone(),projection:projectionMix,rotors:rotorTargets.map((_,i)=>rotors[i].rotation.y),start:performance.now(),duration};
      if(scroll){assemblyTween=null;scrollingPose=true;}
      else if(duration>0){assemblyTween={from:assemblyMix,start:performance.now(),duration};scrollingPose=false;}
      else{scrollingPose=true;syncRotors();}
      request();
    }
  }
  function pause(value){
    if(paused===value)return;
    paused=value;
    const now=performance.now();
    if(value){pausedAt=now;lastFrame=null;cancelAnimationFrame(raf);raf=0;}
    else{
      // Exclude parked time from the clock, including new input while paused.
      if(tween)tween.start+=now-Math.max(pausedAt,tween.start);
      if(assemblyTween)assemblyTween.start+=now-Math.max(pausedAt,assemblyTween.start);
      request();
    }
  }
  const resize=()=>{
    if(disposed)return;
    const {width,height}=mount.getBoundingClientRect();if(width<1||height<1)return;
    renderer.setSize(width,height,false);
    // Match both authored portraits, including the phone's square crop/lens.
    const phone=heroLinked&&mobilePortrait.matches;
    if(heroLinked)machinePosition[2]=phone?10:9;
    const portraitWidth=Math.min(width,height*(phone?1:4/3))*(spaciousPortrait.matches?.84:1);
    const spanX=(phone?6.9:7.8)*width/portraitWidth,spanY=spanX*height/width;
    const shift=spaciousPortrait.matches?spanY*.04:0;
    portraitCamera.left=-spanX/2;portraitCamera.right=spanX/2;
    portraitCamera.top=spanY/2+shift;portraitCamera.bottom=-spanY/2+shift;
    portraitCamera.updateProjectionMatrix();
    portraitProjection.copy(portraitCamera.projectionMatrix);
    viewSpan=width/height>1.5?2.85:3.3;camera.aspect=width/height;
    if(state.mode==='machine'&&!tween&&!assemblyTween&&Math.abs(assemblyMix-assemblyTarget)<.00001)update({}, {scrub:true});
    else draw();
  };
  const observer=new ResizeObserver(resize);observer.observe(mount);resize();update({});
  return {update,pause,isSeated,dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();geometries.forEach(geometry=>geometry.dispose());new Set(parts.map(({mesh})=>mesh.material)).forEach(material=>material.dispose());studioLights.forEach(light=>light.dispose());floor.geometry.dispose();floor.material.dispose();environment.dispose();enclosureEnvironment?.dispose();shadowDetail?.textures.forEach(texture=>texture.dispose());shadowDetail?.contactTextures.forEach(texture=>texture.dispose());shadowDetail?.bitmaps.forEach(bitmap=>bitmap.close());metalBump.dispose();enclosureBump.dispose();colorLut.dispose();metalBitmap.close();renderer.dispose();renderer.domElement.remove();}};
}
