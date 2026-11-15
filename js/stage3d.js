// ManiLadder 3D stage: the benchmark's real arms (Franka Panda + gripper / + LEAP hand, exported from the
// simulator assets by tools/export_robot_glb.py) shown on a small studio pedestal with a rigid or a
// deformable object. app.js drives it with `ml:focus` events; tools/render_icons.html reuses it for icons.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

const BASE = new URL("../", import.meta.url);
const MODELS = { gripper: "assets/models/panda_gripper.glb", dex: "assets/models/panda_leap.glb" };
const LEVEL_HEX = { 1: 0x2ee6c8, 2: 0x5ca0ff, 3: 0xa47dff, 4: 0xff7a3d, 0: 0x5ca0ff };
const TABLE_H = 0.355;
const GAP = 0.105; // half distance between the two tool tips in the dual-arm setup

/* ───────────── shared asset loading ───────────── */
let assetsPromise = null;
export function loadAssets() {
  if (assetsPromise) return assetsPromise;
  const loader = new GLTFLoader();
  const load = (u) => new Promise((res, rej) => loader.load(new URL(u, BASE).href, res, undefined, rej));
  assetsPromise = Promise.all([
    load(MODELS.gripper), load(MODELS.dex),
    fetch(new URL("assets/models/robots.json", BASE)).then((r) => r.json()),
  ]).then(([g, d, meta]) => ({ gripper: prepare(g.scene), dex: prepare(d.scene), tcp: meta.tcp }));
  return assetsPromise;
}

// studio materials: lacquered off-white shells, satin dark joints
function prepare(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    // the exporter writes positions only: rebuild normals, keeping CAD edges sharp
    if (!o.geometry.attributes.normal) o.geometry = toCreasedNormals(o.geometry, 0.55);
    const src = o.material;
    const c = src.color.clone();
    const dark = Math.max(c.r, c.g, c.b) < 0.3;
    o.material = new THREE.MeshPhysicalMaterial({
      color: dark ? c : c.lerp(new THREE.Color(0xf2f4fa), 0.35),
      roughness: dark ? 0.38 : 0.3,
      metalness: dark ? 0.55 : 0.04,
      clearcoat: dark ? 0.2 : 0.85,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.0,
    });
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return root;
}

function cloneWithOwnMaterials(root) {
  const c = root.clone(true);
  c.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
  return c;
}

/* ───────────── objects ───────────── */
function physical(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.18, ...extra });
}

function makeRigid() {
  const g = new THREE.Group();
  const specs = [[0.062, 0x5ca0ff, 0.12], [0.054, 0xff8038, -0.32], [0.046, 0xeef1fb, 0.18]];
  let y = 0;
  for (const [s, color, rot] of specs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), physical(color));
    m.position.y = y + s / 2;
    m.rotation.y = rot;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    y += s;
  }
  return g;
}

function makeCloth() {
  const size = 0.3, n = 44;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const base = Float32Array.from(geo.attributes.position.array);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xff7a3d, roughness: 0.78, metalness: 0, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffc9a8),
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.animate = (t, lift) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i], z = base[i + 2];
      const r2 = x * x + z * z;
      let y = 0.004 + 0.008 * Math.sin(16 * x + t * 1.6) * Math.cos(13 * z + t * 1.2);
      y += lift * Math.exp(-r2 / 0.0045);              // pinched up where the tool grasps it
      const r = Math.sqrt(r2);
      if (r > 0.2) y -= (r - 0.2) * 1.6;                // drapes over the table edge
      p[i + 1] = y;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  mesh.userData.animate(0, 0.07);
  return mesh;
}

function makeTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.018, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x141a2c, roughness: 0.18, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08 }));
  top.position.y = TABLE_H - 0.009;
  top.castShadow = top.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.0035, 8, 96), new THREE.MeshBasicMaterial({ color: 0x5ca0ff }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = TABLE_H;
  rim.userData.rim = true;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, TABLE_H - 0.018, 32),
    new THREE.MeshPhysicalMaterial({ color: 0x1a2135, roughness: 0.3, metalness: 0.7 }));
  leg.position.y = (TABLE_H - 0.018) / 2;
  leg.castShadow = true;
  g.add(top, rim, leg);
  return g;
}

/* one configuration = arms + object; the table is shared and stays put */
function buildSetup(A, cfg) {
  const g = new THREE.Group();
  const src = A[cfg.ee];
  const [tx, , tz] = A.tcp[cfg.ee];
  if (cfg.arm === "single") {
    const a = cloneWithOwnMaterials(src);
    a.position.set(-tx, 0, -tz);
    g.add(a);
  } else {
    const a = cloneWithOwnMaterials(src);           // left arm: mirrored copy, so the LEAP hand is a left hand
    a.scale.z = -1;
    a.position.set(-tx - GAP, 0, tz);
    const b = cloneWithOwnMaterials(src);
    b.rotation.y = Math.PI;
    b.position.set(tx + GAP, 0, tz);
    g.add(a, b);
  }
  const obj = cfg.obj === "deformable" ? makeCloth() : makeRigid();
  obj.position.y = TABLE_H;
  g.add(obj);
  // scan transition: everything above the plane is clipped away
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  g.traverse((o) => { if (o.material) { o.material.clippingPlanes = [plane]; o.material.clipShadows = true; } });
  g.userData = { obj, cfg, plane, h: 0, wait: 0 };
  return g;
}

const SETUP_TOP = 0.98; // highest point of any setup, metres
function setReveal(g, h) {
  g.userData.h = h;
  const e = h * h * (3 - 2 * h);
  g.userData.plane.constant = -0.01 + e * SETUP_TOP;
  g.visible = h > 0.001;
}

/* ───────────── shared renderer setup ───────────── */
function makeRenderer(canvas, preserve = false) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: preserve, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

function makeLights(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.2, 2.6, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -1.1;
  key.shadow.camera.right = key.shadow.camera.top = 1.1;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 6;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  const rimBlue = new THREE.PointLight(0x5ca0ff, 9, 5, 1.6);
  rimBlue.position.set(-1.3, 1.1, -1.1);
  const rimOrange = new THREE.PointLight(0xff8038, 4, 5, 1.6);
  rimOrange.position.set(1.3, 0.9, -1.2);
  scene.add(key, rimBlue, rimOrange);
  return { key, rimBlue, rimOrange };
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.16)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(255,255,255,0.5)";
  for (const [r, w] of [[120, 1.5], [178, 1], [232, 0.8]]) {
    g.lineWidth = w;
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ───────────── live stage ───────────── */
export async function createStage(canvas, { onReady } = {}) {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const lights = makeLights(scene, renderer);
  const camera = new THREE.PerspectiveCamera(30, 2, 0.05, 20);

  const floorMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x5ca0ff, transparent: true, depthWrite: false, opacity: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.ShadowMaterial({ opacity: 0.42 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.receiveShadow = true;
  scene.add(floor, shadow);

  renderer.localClippingEnabled = true;
  const table = makeTable();
  scene.add(table);
  const rim = table.children.find((o) => o.userData.rim);
  // the glowing plane that sweeps through a setup while it builds or dissolves
  const scanMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x5ca0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), scanMat);
  scan.rotation.x = -Math.PI / 2;
  scene.add(scan);

  const A = await loadAssets();
  const setups = new Map();
  const getSetup = (cfg) => {
    const k = `${cfg.obj}|${cfg.arm}|${cfg.ee}`;
    if (!setups.has(k)) {
      const s = buildSetup(A, cfg);
      setReveal(s, 0);
      scene.add(s);
      setups.set(k, s);
    }
    return setups.get(k);
  };

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const view = { az: 0.75, el: 0.28, dist: 2.45, targetDist: 2.45, vAz: 0 };
  const levelColor = new THREE.Color(LEVEL_HEX[0]);
  const levelTarget = new THREE.Color(LEVEL_HEX[0]);
  let current = null, leaving = [], visible = true, dragging = false, lastInteract = -1e9, raf = 0, last = performance.now();

  function setConfig(cfg) {
    const next = getSetup(cfg);
    levelTarget.setHex(LEVEL_HEX[cfg.level || 0]);
    if (next === current) return;
    if (current) leaving.push(current);
    leaving = leaving.filter((g) => g !== next);
    current = next;
    current.userData.wait = leaving.some((g) => g.userData.h > 0.05) ? 0.3 : 0; // let the old setup clear first
    if (reduce) { leaving.forEach((g) => setReveal(g, 0)); leaving = []; setReveal(current, 1); }
    view.targetDist = cfg.arm === "dual" ? 2.45 : 1.85;
    kick();
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    kick();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    // view
    if (!dragging) {
      if (!reduce && now - lastInteract > 2500) view.az += dt * 0.16;
      view.az += view.vAz;
      view.vAz *= 0.92;
    }
    view.dist += (view.targetDist - view.dist) * Math.min(1, dt * 3);
    const target = new THREE.Vector3(0, 0.36, 0);
    const d = view.dist * Math.max(1.4, Math.sqrt(2.2 / camera.aspect)); // fixed vertical fov: keep the arm's height in frame, and step back further on narrow canvases
    camera.position.set(
      target.x + d * Math.cos(view.el) * Math.sin(view.az),
      target.y + d * Math.sin(view.el),
      target.z + d * Math.cos(view.el) * Math.cos(view.az));
    camera.lookAt(target);
    // scan transitions: the old setup dissolves downward, then the new one builds upward
    for (const g of leaving) setReveal(g, Math.max(0, g.userData.h - dt / 0.3));
    leaving = leaving.filter((g) => g.userData.h > 0);
    if (current) {
      if (current.userData.wait > 0) current.userData.wait -= dt;
      else if (current.userData.h < 1) setReveal(current, Math.min(1, current.userData.h + dt / 0.65));
    }
    const active = current && current.userData.h < 1 && current.userData.wait <= 0 ? current : leaving[0];
    if (active) {
      scan.visible = true;
      scan.position.y = Math.max(0.01, active.userData.plane.constant);
      scanMat.opacity = 0.85 * Math.sin(Math.PI * Math.min(1, active.userData.h));
    } else {
      scan.visible = false;
    }
    // level tint on the floor glow, the table rim and the scan plane
    levelColor.lerp(levelTarget, Math.min(1, dt * 4));
    floorMat.color.copy(levelColor);
    rim.material.color.copy(levelColor);
    scanMat.color.copy(levelColor);
    // cloth
    if (current && current.userData.obj.userData.animate && !reduce) current.userData.obj.userData.animate(t, 0.06 + 0.02 * Math.sin(t * 1.3));
    renderer.render(scene, camera);
    raf = visible ? requestAnimationFrame(frame) : 0;
  }
  function kick() { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  // drag to orbit
  let px = 0, py = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; px = e.clientX; py = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.classList.add("grabbing");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    px = e.clientX; py = e.clientY;
    view.az -= dx * 0.009;
    view.vAz = -dx * 0.004;
    view.el = Math.max(0.06, Math.min(0.9, view.el + dy * 0.005));
    lastInteract = performance.now();
  });
  const end = () => { dragging = false; lastInteract = performance.now(); canvas.classList.remove("grabbing"); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("dblclick", () => { view.el = 0.3; lastInteract = -1e9; });

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(canvas);
  resize();
  if (onReady) onReady();
  return { setConfig, lights };
}

/* ───────────── offline icon renderer (tools/render_icons.html) ───────────── */
export async function createIconRenderer(canvas) {
  const renderer = makeRenderer(canvas, true);
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(1);
  const A = await loadAssets();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.02, 20);

  function shot(build, { target, az, el, dist, fit = 0, w = 192, h = 192 }) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const scene = new THREE.Scene();
    makeLights(scene, renderer);
    const obj = build();
    scene.add(obj);
    let tv = target ? new THREE.Vector3(...target) : null;
    if (fit) {  // frame the object's bounding sphere
      const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
      tv = tv || sphere.center;
      const half = THREE.MathUtils.degToRad(camera.fov / 2);
      dist = (sphere.radius * fit) / Math.sin(Math.min(half, Math.atan(Math.tan(half) * camera.aspect)));
    }
    camera.position.set(tv.x + dist * Math.cos(el) * Math.sin(az), tv.y + dist * Math.sin(el), tv.z + dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(tv);
    renderer.render(scene, camera);
    return canvas.toDataURL("image/png");
  }
  const arm = (ee) => () => { const a = cloneWithOwnMaterials(A[ee]); a.position.set(-A.tcp[ee][0], 0, -A.tcp[ee][2]); return a; };
  // end-effector only: clip away everything above the wrist flange and behind the hand
  const tool = (ee, above, behind = 0.12) => () => {
    const a = arm(ee)();
    const planes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), A.tcp[ee][1] + above), new THREE.Plane(new THREE.Vector3(1, 0, 0), behind)];
    a.traverse((o) => { if (o.isMesh) { o.material.clippingPlanes = planes; o.material.clipShadows = true; } });
    return a;
  };
  renderer.localClippingEnabled = true;
  const dual = (ee) => () => {
    const g = new THREE.Group();
    const [tx, , tz] = A.tcp[ee];
    const a = cloneWithOwnMaterials(A[ee]); a.scale.z = -1; a.position.set(-tx - GAP, 0, tz);
    const b = cloneWithOwnMaterials(A[ee]); b.rotation.y = Math.PI; b.position.set(tx + GAP, 0, tz);
    g.add(a, b);
    return g;
  };
  const tcp = (ee, dy) => [0, A.tcp[ee][1] + dy, 0];  // arm() puts the tool tip on the vertical axis
  return {
    icons: {
      "arm-single": () => shot(arm("gripper"), { az: 0.95, el: 0.16, fit: 0.86 }),
      "arm-dual": () => shot(dual("gripper"), { az: 0.28, el: 0.16, fit: 0.8, w: 288 }),
      "ee-gripper": () => shot(tool("gripper", 0.13), { target: tcp("gripper", 0.05), az: 1.05, el: 0.22, dist: 0.6 }),
      "ee-dex": () => shot(tool("dex", 0.095, 0.22), { target: tcp("dex", -0.03), az: 1.05, el: 0.22, dist: 0.74 }),
      "obj-rigid": () => shot(makeRigid, { az: 0.7, el: 0.36, fit: 1.18 }),
      "obj-deform": () => shot(() => { const c = makeCloth(); c.userData.animate(1.2, 0.075); return c; }, { az: 0.7, el: 0.55, fit: 1.02 }),
    },
  };
}
