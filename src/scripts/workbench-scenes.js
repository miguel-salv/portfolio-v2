// Match the HTML foreground aperture to the authored Blender camera, including
// object-fit cropping. Geometry is read only on load/resize, never in a loop.
let cleanup = () => {};
export function projectSceneFrame(frame, image, viewport) {
  const scale = Math.max(viewport.width / image.width, viewport.height / image.height);
  const width = image.width * scale, height = image.height * scale;
  return {
    left: (viewport.width - width) / 2 + frame.left * width,
    top: (viewport.height - height) / 2 + frame.top * height,
    width: frame.width * width,
    height: frame.height * height,
  };
}
function initWorkbenchScenes() {
  cleanup();
  const hero = document.querySelector('[data-workshop-hero]');
  if (!hero) return;
  const abort = new AbortController(), { signal } = abort;
  const room = hero.querySelector('.workshop-room'), source = hero.querySelector('.workshop-scene');
  const portrait = matchMedia('(max-width: 760px)');
  const tablet = matchMedia('(max-width: 1100px) and (orientation: portrait)');
  const orientationNow = () => portrait.matches ? 'phone' : tablet.matches ? 'portrait' : 'landscape';
  const metadata = new Map();
  let disposed = false;
  hero.dataset.sceneAligned = 'false';
  async function align() {
    const orientation = orientationNow();
    try {
      if (!metadata.has(orientation)) metadata.set(orientation, fetch(`/assets/workbench/matcher-light-${orientation}.webp.json`, { signal }).then(r => { if (!r.ok) throw Error('Camera metadata unavailable'); return r.json(); }));
      const scene = await metadata.get(orientation);
      if (disposed || (orientationNow()) !== orientation) return;
      const frame = projectSceneFrame(scene.camera.matcherFilmFrame, { width: scene.resolution[0], height: scene.resolution[1] }, room.getBoundingClientRect());
      for (const [key, value] of Object.entries(frame)) source.style[key] = `${value}px`;
      hero.dataset.sceneAligned = 'true';
      document.dispatchEvent(new CustomEvent('portfolio:matcher-render-ready'));
    } catch {
      // The full scene remains readable when metadata is unavailable.
      hero.dataset.sceneAligned = 'false';
    }
  }
  const observer = new ResizeObserver(align); observer.observe(room);
  portrait.addEventListener('change', align, { signal });
  tablet.addEventListener('change', align, { signal });
  for (const image of hero.querySelectorAll('.workbench-occupied img')) image.addEventListener('error', () => { hero.classList.add('is-scene-unavailable'); }, { signal });
  align();
  cleanup = () => { disposed = true; abort.abort(); observer.disconnect(); };
}
if (typeof document !== 'undefined') {
  document.addEventListener('astro:page-load', initWorkbenchScenes);
  document.addEventListener('astro:before-preparation', () => cleanup());
}
