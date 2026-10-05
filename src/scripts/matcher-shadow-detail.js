// Add UV seams only where a triangle has surface-sampled studio shadows.
// Positions, normals, material UVs and triangle winding remain unchanged.
export function appendShadowDetail(THREE,geometry,tiles,width,height){
  const count=geometry.attributes.position.count;
  const sourceIndices=[];
  const indices=new Uint32Array(geometry.index.array);
  const uv=new Float32Array((count+tiles.length*3)*3);
  for(const [index,tile] of tiles.entries()){
    const start=tile.triangle*3,base=count+index*3;
    sourceIndices.push(...indices.subarray(start,start+3));
    indices.set([base,base+1,base+2],start);
    const left=(tile.x+2.5)/width,right=(tile.x+tile.size-2.5)/width;
    const bottom=(tile.y+2.5)/height,top=(tile.y+tile.size-2.5)/height;
    uv.set([left,bottom,1,right,bottom,1,left,top,1],base*3);
  }
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    const data=new attribute.array.constructor((count+sourceIndices.length)*attribute.itemSize);
    data.set(attribute.array);
    sourceIndices.forEach((source,index)=>data.set(attribute.array.subarray(source*attribute.itemSize,(source+1)*attribute.itemSize),(count+index)*attribute.itemSize));
    geometry.setAttribute(name,new THREE.BufferAttribute(data,attribute.itemSize,attribute.normalized).setUsage(attribute.usage));
  }
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  geometry.setAttribute('shadowDetailUv',new THREE.BufferAttribute(uv,3));
  return sourceIndices;
}

export function decodeSurfaceContact(buffer,expectedLength){
  if(buffer.byteLength<43||(buffer.byteLength-40)%3!==0||new TextDecoder().decode(buffer.slice(0,4))!=='MAC1')return null;
  const header=new DataView(buffer);
  if(header.getUint32(36,true)!==expectedLength)return null;
  const data=new Uint8Array(expectedLength);let offset=0;
  for(let i=40;i<buffer.byteLength;i+=3){
    const count=header.getUint16(i,true);
    if(!count||offset+count>expectedLength)return null;
    data.fill(header.getUint8(i+2),offset,offset+count);offset+=count;
  }
  return offset===expectedLength?data:null;
}
