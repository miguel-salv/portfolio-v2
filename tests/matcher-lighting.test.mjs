import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../src/vendor/three-0.170.0.module.min.js';
import {appendShadowDetail,decodeSurfaceContact} from '../src/scripts/matcher-shadow-detail.js';

const asset = name => readFileSync(new URL(`../public/assets/matcher/${name}`, import.meta.url));
const studio = JSON.parse(readFileSync(new URL('../reel/matcher_studio.json', import.meta.url)));

test('live rectangular lights retain the hero emitter roll', () => {
  const source = readFileSync(new URL('../src/scripts/matcher-model.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('  const area='), source.indexOf('  // Same linear colors'));
  const scope = { THREE, scene: new THREE.Scene(), studioLights: [] };
  runInNewContext(code + '\nthis.addArea=area;', scope);
  // Independent Blender to_track_quat('-Z','Y') reference, not a Three lookAt.
  const expected = [
    [.89442718,.44721359,0, -.37686738,.75373471,.53838187, .24077164,-.48154342,.84270102],
    [.19611612,-.98058063,0, .49724516,.09944906,.86189157, -.84515423,-.1690308,.5070926],
    [-.98058087,.19611609,0, -.14944056,-.74720335,.64757627, .12700015,.63500077,.76200068],
    [.76822126,.6401844,0, -.08130344,.09756414,.99190271, .63500065,-.7620008,.12700003],
  ];
  studio.lights.forEach((light,index) => {
    scope.addArea(light.color,1,light.width,light.height,light.position);
    const emitter = scope.studioLights[index]; emitter.updateMatrix();
    const actual = [0,1,2,4,5,6,8,9,10].map(i => emitter.matrix.elements[i]);
    actual.forEach((value,i) => assert.ok(Math.abs(value-expected[index][i]) < 1e-5));
  });
});

test('hero color lookup agrees with independently rendered Blender swatches', () => {
  const data = asset('hero-color-lut.bin');
  assert.equal(data.subarray(0,4).toString(),'MLT1');
  const size=data.readUInt32LE(4),minimum=data.readFloatLE(8),range=data.readFloatLE(12)-minimum;
  assert.equal(data.length,16+size**3*4);
  const sample = rgb => {
    const xyz=rgb.map(value=>Math.max(0,Math.min(size-1,(Math.log2(Math.max(value,2**minimum))-minimum)/range*(size-1))));
    const base=xyz.map(value=>Math.min(size-2,Math.floor(value))),fraction=xyz.map((value,i)=>value-base[i]);
    const result=[0,0,0];
    for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
      const weight=(x?fraction[0]:1-fraction[0])*(y?fraction[1]:1-fraction[1])*(z?fraction[2]:1-fraction[2]);
      const offset=16+4*((base[2]+z)*size**2+(base[1]+y)*size+base[0]+x);
      result.forEach((_,i)=>{result[i]+=weight*data[offset+i];});
    }
    return result;
  };
  // Blender 5.2: linear Rec.709 -> AgX / Medium High Contrast -> sRGB.
  for(const [rgb,reference] of [
    [[.18,.18,.18],[118,118,118]], [[.025,.13,.29],[7,102,149]],
    [[1,1,1],[208,208,208]], [[4,4,4],[245,245,245]],
  ])sample(rgb).forEach((value,i)=>assert.ok(Math.abs(value-reference[i])<=6));
});

test('precomputed studio shadows match the assembly and leave moving rotors neutral', () => {
  const data=asset('studio-visibility.bin'),manifest=JSON.parse(asset('assembly.json'));
  assert.equal(data.subarray(0,4).toString(),'MVS1');
  assert.deepEqual(data.subarray(4,36),createHash('sha256').update(asset('assembly.bin')).digest());
  assert.deepEqual(data.subarray(36,68),createHash('sha256').update(JSON.stringify(studio.lights)).digest());
  let offset=68;
  for(const part of manifest.parts){
    const count=part.positions[1]/3*4;
    if(part.group.startsWith('rotor'))assert.ok(data.subarray(offset,offset+count).every(value=>value===255));
    offset+=count;
  }
  assert.equal(offset,data.length);
});

test('moving capacitor shadows cover a continuous rotation and use the current assembly', () => {
  const data=asset('rotor-visibility.bin'),manifest=JSON.parse(asset('assembly.json'));
  assert.equal(data.subarray(0,4).toString(),'MVR1');
  assert.deepEqual(data.subarray(4,36),createHash('sha256').update(asset('assembly.bin')).digest());
  assert.deepEqual(data.subarray(36,68),createHash('sha256').update(JSON.stringify(studio.lights)).digest());
  const poses=data.readUInt32LE(68),first=data.readFloatLE(72),step=data.readFloatLE(76);
  assert.equal(first,-180);assert.equal(first+(poses-1)*step,180);
  let offset=80;
  for(const part of manifest.parts.filter(part=>part.group.startsWith('rotor'))){
    const stride=part.positions[1]/3*4;
    // The wrapped endpoints agree, and poses actually change rather than
    // attaching the same frozen shadow to the moving plate stack.
    const beginning=data.subarray(offset,offset+stride),end=data.subarray(offset+(poses-1)*stride,offset+poses*stride);
    assert.deepEqual(beginning,end);
    assert.notDeepEqual(beginning,data.subarray(offset+6*stride,offset+7*stride));
    assert.ok(data.subarray(offset,offset+poses*stride).some(value=>value===0));
    assert.ok(data.subarray(offset,offset+poses*stride).some(value=>value===255));
    offset+=poses*stride;
  }
  assert.equal(offset,data.length);
});

test('surface shadow islands preserve every triangle and copied shading attribute',()=>{
  const metadata=JSON.parse(asset('shadow-detail.json')),manifest=JSON.parse(asset('assembly.json'));
  const binary=asset('assembly.bin');
  // Real rotor geometry exercises seams shared by neighboring plate faces.
  const partIndex=manifest.parts.findIndex(part=>part.group==='rotor1'),part=manifest.parts[partIndex];
  const floats=field=>new Float32Array(binary.buffer,binary.byteOffset+part[field][0],part[field][1]).slice();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(floats('positions'),3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(floats('normals'),3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(floats('uvs'),2));
  const original=new Uint32Array(binary.buffer,binary.byteOffset+part.indices[0],part.indices[1]).slice();
  geometry.setIndex(new THREE.BufferAttribute(original.slice(),1));
  const count=geometry.attributes.position.count;
  const shade=Uint8Array.from({length:count*4},(_,i)=>i%256);
  geometry.setAttribute('studioVisibility',new THREE.BufferAttribute(shade,4,true).setUsage(THREE.DynamicDrawUsage));
  const positions=geometry.attributes.position.array.slice();
  const tiles=metadata.rotors.tiles.filter(tile=>tile.part===partIndex);
  const sources=appendShadowDetail(THREE,geometry,tiles,metadata.rotors.width,metadata.rotors.height);
  assert.equal(geometry.index.count,original.length);
  original.forEach((source,index)=>{
    const target=geometry.index.array[index];
    assert.deepEqual(geometry.attributes.position.array.subarray(target*3,target*3+3),positions.subarray(source*3,source*3+3));
  });
  sources.forEach((source,index)=>assert.deepEqual(geometry.attributes.studioVisibility.array.subarray((count+index)*4,(count+index+1)*4),shade.subarray(source*4,source*4+4)));
  assert.equal(geometry.attributes.studioVisibility.normalized,true);
  assert.equal(geometry.attributes.studioVisibility.usage,THREE.DynamicDrawUsage);
});

test('surface shadow textures match their bake inputs and fit phone texture limits',()=>{
  const metadata=JSON.parse(asset('shadow-detail.json')),manifest=JSON.parse(asset('assembly.json'));
  assert.equal(metadata.geometrySHA256,createHash('sha256').update(asset('assembly.bin')).digest('hex'));
  assert.equal(metadata.lightsSHA256,createHash('sha256').update(JSON.stringify(studio.lights)).digest('hex'));
  for(const [name,hash] of Object.entries(metadata.textures))assert.equal(createHash('sha256').update(asset(name)).digest('hex'),hash);
  assert.ok(metadata.rotors.height*metadata.rotors.angles.length<=4096);
  for(const layout of [metadata.fixed,metadata.rotors]){
    assert.ok(layout.width<=4096&&layout.height<=4096);
    const used=new Set();
    for(const tile of layout.tiles){
      assert.ok(tile.triangle>=0&&tile.triangle<manifest.parts[tile.part].indices[1]/3);
      assert.ok(tile.x>=0&&tile.y>=0&&tile.x+tile.size<=layout.width&&tile.y+tile.size<=layout.height);
      for(let y=tile.y;y<tile.y+tile.size;y++)for(let x=tile.x;x<tile.x+tile.size;x++){
        const pixel=y*layout.width+x;assert.ok(!used.has(pixel));used.add(pixel);
      }
    }
  }
});

test('surface contact shading decodes completely and wraps moving shadows continuously',()=>{
  const metadata=JSON.parse(asset('shadow-detail.json')),file=gunzipSync(asset('surface-contact.bin.gz'));
  assert.deepEqual(file.subarray(4,36),createHash('sha256').update(asset('shadow-detail.json')).digest());
  const fixed=metadata.fixed.width*metadata.fixed.height,stride=metadata.rotors.width*metadata.rotors.height;
  const buffer=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),length=fixed+stride*13;
  const decoded=decodeSurfaceContact(buffer,length);
  assert.equal(decoded.length,length);
  assert.deepEqual(decoded.subarray(fixed,fixed+stride),decoded.subarray(fixed+12*stride,fixed+13*stride));
  assert.notDeepEqual(decoded.subarray(fixed,fixed+stride),decoded.subarray(fixed+6*stride,fixed+7*stride));
  assert.ok(decoded.subarray(fixed).some(value=>value<100));
  assert.ok(decoded.some(value=>value===255));
  // Reject corrupt and incomplete runs rather than accepting shifted poses.
  const corrupt=buffer.slice(0);new DataView(corrupt).setUint16(40,0,true);
  assert.equal(decodeSurfaceContact(corrupt,length),null);
  assert.equal(decodeSurfaceContact(buffer.slice(0,-3),length),null);
  assert.equal(decodeSurfaceContact(buffer,length+1),null);
});
