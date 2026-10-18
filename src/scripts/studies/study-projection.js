// Exact affine projection between two orthographic views with the same angle.
// Used only on the bench push. The shaft move has its own rendered background.
export function plateProjection(base, camera, source, viewport) {
  const b=base.camera, cover=Math.max(viewport.width/source.width,viewport.height/source.height);
  const horizontal=camera.horizontalSpan ?? camera.span*Math.min(1,source.width/source.height);
  const scale=cover*source.width*b.horizontalSpan/(base.resolution[0]*horizontal);
  const origin=frame=>frame.projectedOrigin || [frame.matcherFilmFrame.left+frame.matcherFilmFrame.width/2,frame.matcherFilmFrame.top+frame.matcherFilmFrame.height/2];
  const [bx,by]=origin(b),[cx,cy]=origin(camera);
  return {
    x:(viewport.width-source.width*cover)/2+cx*source.width*cover-bx*base.resolution[0]*scale,
    y:(viewport.height-source.height*cover)/2+cy*source.height*cover-by*base.resolution[1]*scale,
    width:base.resolution[0]*scale,height:base.resolution[1]*scale,
  };
}

export function coverRect(source,viewport) {
  const scale=Math.max(viewport.width/source.width,viewport.height/source.height);
  return {x:(viewport.width-source.width*scale)/2,y:(viewport.height-source.height*scale)/2,width:source.width*scale,height:source.height*scale};
}

export function interpolateRect(a,b,progress) {
  return Object.fromEntries(['left','top','width','height'].map(key=>[key,a[key]+(b[key]-a[key])*progress]));
}

// Ordinary-flow figures are complete apertures, not waypoints for a moving
// rectangle. Only the opening bridges two figures: its visible aperture stays
// filled until the departing hero has scrolled behind the header.
export function flowSceneRect(state,{hero,seats,header,scrollY,viewportHeight}) {
  if(state.progress<.18){
    const t=Math.max(0,Math.min(1,state.progress/.18));
    const ease=t*t*t*(t*(t*6-15)+10);
    const top=Math.max(hero.top-scrollY,header+12*ease);
    const bottom=Math.min(viewportHeight,seats.matcher.top+seats.matcher.height-scrollY);
    return {left:hero.left,top,width:hero.width,height:Math.max(1,bottom-top)};
  }
  const rect=seats[state.chapter==='hero'?'matcher':state.chapter];
  return {...rect,top:rect.top-scrollY};
}
