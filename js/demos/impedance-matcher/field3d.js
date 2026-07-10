export function createField3D(THREE, opts) {
  const { mount, vswrSurface, vMax, motorMax, sweetM1, sweetM2 } = opts;
  const readPalette = opts.palette;

  const SEG = 64; // Relief mesh resolution
  const GRIDN = 8; // Floor grid divisions
  const HEIGHT = 0.85; // World height at worst-case VSWR

  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const norm = (v) => clamp01((v - 1) / (vMax - 1));
  const xOf = (m1) => (m1 / motorMax) * 2 - 1;
  const zOf = (m2) => (m2 / motorMax) * 2 - 1;
  const yOf = (v) => norm(v) * HEIGHT;
  const yAtDeg = (m1, m2) => yOf(vswrSurface(m1, m2));

  const col = (rgbArr, target) =>
    (target || new THREE.Color()).setStyle(
      `rgb(${rgbArr[0] | 0}, ${rgbArr[1] | 0}, ${rgbArr[2] | 0})`
    );

  // Canvas is absolute (out of layout flow) to avoid a ResizeObserver loop
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.className = "instrument-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  mount.appendChild(canvas);

  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -20, 20);
  camera.position.set(2.1, 1.95, 2.1);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0.32, 0);
  camera.updateMatrixWorld();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.55);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(2.6, 3.2, 1.0);
  scene.add(hemi, dir);

  const floorPts = [];
  const fseg = (x1, z1, x2, z2) => floorPts.push(x1, 0, z1, x2, 0, z2);
  for (let i = 0; i <= GRIDN; i++) {
    const t = (i / GRIDN) * 2 - 1;
    fseg(t, -1, t, 1);
    fseg(-1, t, 1, t);
  }
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute("position", new THREE.Float32BufferAttribute(floorPts, 3));
  const floorMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.24 });
  scene.add(new THREE.LineSegments(floorGeo, floorMat));

  const borderGeo = new THREE.BufferGeometry();
  // prettier-ignore
  borderGeo.setAttribute("position", new THREE.Float32BufferAttribute([
    -1, 0, -1,  1, 0, -1,   1, 0, -1,  1, 0, 1,
     1, 0,  1, -1, 0,  1,  -1, 0,  1, -1, 0, -1,
  ], 3));
  const borderMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 });
  scene.add(new THREE.LineSegments(borderGeo, borderMat));

  const geo = new THREE.PlaneGeometry(2, 2, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  for (let i = 0; i < pos.count; i++) {
    const m1 = ((pos.getX(i) + 1) / 2) * motorMax;
    const m2 = ((pos.getZ(i) + 1) / 2) * motorMax;
    pos.setY(i, yAtDeg(m1, m2));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const targetGroup = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.058, 0.08, 44);
  ringGeo.rotateX(-Math.PI / 2);
  const markMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.95, side: THREE.DoubleSide,
  });
  targetGroup.add(new THREE.Mesh(ringGeo, markMat));
  const bullGeo = new THREE.CircleGeometry(0.03, 36);
  bullGeo.rotateX(-Math.PI / 2);
  const bullMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.95, side: THREE.DoubleSide,
  });
  targetGroup.add(new THREE.Mesh(bullGeo, bullMat));
  const crossGeo = new THREE.BufferGeometry();
  const cc = 0.13;
  const gg = 0.045;
  // prettier-ignore
  crossGeo.setAttribute("position", new THREE.Float32BufferAttribute([
    -cc, 0, 0, -gg, 0, 0,   gg, 0, 0, cc, 0, 0,
    0, 0, -cc, 0, 0, -gg,   0, 0, gg, 0, 0, cc,
  ], 3));
  const crossMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 });
  targetGroup.add(new THREE.LineSegments(crossGeo, crossMat));
  targetGroup.position.set(xOf(sweetM1), 0.002, zOf(sweetM2));
  scene.add(targetGroup);

  const dotGeo = new THREE.RingGeometry(0.028, 0.05, 40);
  dotGeo.rotateX(-Math.PI / 2);
  const dotMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.95, side: THREE.DoubleSide,
  });
  const floorDot = new THREE.Mesh(dotGeo, dotMat);
  scene.add(floorDot);

  const stemGeo = new THREE.BufferGeometry();
  stemGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const stemMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 });
  scene.add(new THREE.Line(stemGeo, stemMat));
  const stemPos = stemGeo.attributes.position;

  const probeMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 });
  const probe = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 18), probeMat);
  scene.add(probe);

  const MAX_TRAIL = 260;
  const trailArr = new Float32Array(MAX_TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailArr, 3));
  trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false });
  scene.add(new THREE.Line(trailGeo, trailMat));

  const good = new THREE.Color();
  const bad = new THREE.Color();
  const accent = new THREE.Color();
  const inkC = new THREE.Color();
  const boneC = new THREE.Color();

  function applyPalette() {
    const p = readPalette();
    col(p.good, good);
    col(p.bad, bad);
    col(p.accent, accent);
    col(p.ink, inkC);
    col(p.bone, boneC);
    for (let i = 0; i < pos.count; i++) {
      const m1 = ((pos.getX(i) + 1) / 2) * motorMax;
      const m2 = ((pos.getZ(i) + 1) / 2) * motorMax;
      const t = Math.pow(norm(vswrSurface(m1, m2)), 0.85);
      colors[i * 3] = good.r + (bad.r - good.r) * t;
      colors[i * 3 + 1] = good.g + (bad.g - good.g) * t;
      colors[i * 3 + 2] = good.b + (bad.b - good.b) * t;
    }
    geo.attributes.color.needsUpdate = true;
    floorMat.color.copy(inkC);
    borderMat.color.copy(inkC);
    markMat.color.copy(good);
    bullMat.color.copy(good);
    crossMat.color.copy(good);
    dotMat.color.copy(inkC);
    stemMat.color.copy(inkC);
    trailMat.color.copy(inkC);
    hemi.color.copy(boneC);
  }
  applyPalette();

  const raycaster = new THREE.Raycaster();
  const basePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function pointerToDeg(event) {
    const rect = canvas.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera({ x: nx, y: ny }, camera);
    if (!raycaster.ray.intersectPlane(basePlane, hit)) return null;
    const m1 = Math.round(((hit.x + 1) / 2) * motorMax);
    const m2 = Math.round(((hit.z + 1) / 2) * motorMax);
    return [
      Math.max(0, Math.min(motorMax, m1)),
      Math.max(0, Math.min(motorMax, m2)),
    ];
  }

  const corners = [];
  for (const cx of [-1, 1])
    for (const cy of [0, HEIGHT])
      for (const cz of [-1, 1]) corners.push(new THREE.Vector3(cx, cy, cz));
  const tmp = new THREE.Vector3();
  function frameCamera(w, h) {
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      tmp.copy(c).applyMatrix4(inv);
      if (tmp.x < minX) minX = tmp.x;
      if (tmp.x > maxX) maxX = tmp.x;
      if (tmp.y < minY) minY = tmp.y;
      if (tmp.y > maxY) maxY = tmp.y;
    }
    const padX = (maxX - minX) * 0.06;
    const padY = (maxY - minY) * 0.06;
    const l = minX - padX, r = maxX + padX, t = maxY + padY, b = minY - padY;
    let cw = r - l, ch = t - b;
    const mx = (l + r) / 2, my = (t + b) / 2;
    const aspect = w / h;
    if (cw / ch < aspect) cw = ch * aspect;
    else ch = cw / aspect;
    camera.left = mx - cw / 2;
    camera.right = mx + cw / 2;
    camera.top = my + ch / 2;
    camera.bottom = my - ch / 2;
    camera.updateProjectionMatrix();
  }

  let lastScene = null;
  let lastW = 0;
  let lastH = 0;
  function render(s) {
    lastScene = s;
    const { m1, m2, trail, matchGlow } = s;
    const px = xOf(m1);
    const pz = zOf(m2);
    const py = yAtDeg(m1, m2);

    floorDot.position.set(px, 0.003, pz);
    probe.position.set(px, py + 0.05, pz);
    probeMat.color.setRGB(
      inkC.r + (good.r - inkC.r) * matchGlow,
      inkC.g + (good.g - inkC.g) * matchGlow,
      inkC.b + (good.b - inkC.b) * matchGlow
    );

    stemPos.setXYZ(0, px, 0, pz);
    stemPos.setXYZ(1, px, py + 0.05, pz);
    stemPos.needsUpdate = true;

    const n = Math.min(trail.length, MAX_TRAIL);
    const start = trail.length - n;
    for (let i = 0; i < n; i++) {
      const p = trail[start + i];
      trailArr[i * 3] = xOf(p.m1);
      trailArr[i * 3 + 1] = yAtDeg(p.m1, p.m2) + 0.012;
      trailArr[i * 3 + 2] = zOf(p.m2);
    }
    trailGeo.setDrawRange(0, n > 1 ? n : 0);
    trailGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }

  function resize() {
    const rect = mount.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === lastW && h === lastH) return; // No-op guard against RO loop
    lastW = w;
    lastH = h;
    renderer.setSize(w, h, false); // Keep the inline 100% style
    frameCamera(w, h);
    if (lastScene) render(lastScene);
    else renderer.render(scene, camera);
  }

  function refreshPalette() {
    applyPalette();
    if (lastScene) render(lastScene);
    else renderer.render(scene, camera);
  }

  const ro = "ResizeObserver" in window ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(mount);
  resize();

  function dispose() {
    if (ro) ro.disconnect();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => mm.dispose());
      }
    });
    renderer.dispose();
    canvas.remove();
  }

  return { el: canvas, render, refreshPalette, resize, pointerToDeg, dispose };
}
