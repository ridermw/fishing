// Driftmoor Cove — an HD-2D fishing game. Entry point: renderer, loop, input, actors, day/night.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World, PLAY } from './world.js';
import * as P from './pixel.js';
import { Fishing, RODS, SPECIES } from './fishing.js';
import { UI } from './ui.js';
import { initAudio, sfx, toggleMute, isMuted, updateAudio } from './audio.js';

// ---------- renderer & post ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#a8d4f0', 30, 70);
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
const CAM_OFF = new THREE.Vector3(0, 15.5, 17.5);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.82);
composer.addPass(bloom);
// tilt-shift: blur grows away from a horizontal focus band, giving the miniature-diorama look
const TiltShift = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uFocus: { value: 0.52 }, uBand: { value: 0.16 }, uAmt: { value: 3.2 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocus, uBand, uAmt; varying vec2 vUv;
  void main(){
    float b = clamp((abs(vUv.y - uFocus) - uBand) / 0.35, 0.0, 1.0);
    b = b*b*uAmt;
    vec4 sum = vec4(0.0); float tot = 0.0;
    for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
      vec2 o = vec2(float(i), float(j));
      float w = exp(-dot(o,o)/8.0);
      sum += texture2D(tDiffuse, vUv + o * b / uRes) * w; tot += w;
    }
    gl_FragColor = sum / tot;
  }`,
};
const tilt = new ShaderPass(TiltShift); composer.addPass(tilt);
const Grade = {
  uniforms: { tDiffuse: { value: null }, uWarm: { value: 0 }, uTime: { value: 0 } },
  vertexShader: TiltShift.vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uWarm, uTime; varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    float l = dot(c.rgb, vec3(0.299,0.587,0.114));
    c.rgb = mix(vec3(l), c.rgb, 1.12);
    c.rgb *= mix(vec3(1.0), vec3(1.05,0.98,0.9), uWarm);
    float v = smoothstep(0.95, 0.35, length(vUv - 0.5));
    c.rgb *= mix(0.7, 1.0, v);
    gl_FragColor = c;
  }`,
};
const grade = new ShaderPass(Grade); composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  const pr = renderer.getPixelRatio();
  tilt.uniforms.uRes.value.set(w * pr, h * pr);
  camera.aspect = w / h;
  camera.fov = w < h ? 44 : 30;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- lights ----------
const sun = new THREE.DirectionalLight('#fff4e0', 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#dbeeff', '#5a6b3a', 1.0); scene.add(hemi);

// ---------- world ----------
const world = new World(scene);

// ---------- actors ----------
const DIRS = { down: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 0, -1), left: new THREE.Vector3(-1, 0, 0), right: new THREE.Vector3(1, 0, 0) };
const ROW = { down: 0, up: 1, left: 2, right: 3 };
const shadowTex = P.blobTex();

class Actor {
  constructor(sheetCanvas, x, z, { frames = 4, rows = 4, w = 1, h = 1.5 } = {}) {
    this.tex = P.toTexture(sheetCanvas, { repeat: true, mips: false });
    this.tex.repeat.set(1 / frames, 1 / rows);
    this.frames = frames; this.rows = rows;
    const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, alphaTest: 0.5, roughness: 1, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, w * 0.5), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.mesh, this.shadow);
    this.pos = new THREE.Vector3(x, 0, z);
    this.face = 'down'; this.dir = DIRS.down.clone();
    this.walkT = 0; this.moving = false; this.pose = null;
    this.sync();
  }
  setFrame(row, col) { this.tex.offset.set(col / this.frames, 1 - (row + 1) / this.rows); }
  turn(f) { this.face = f; this.dir.copy(DIRS[f]); }
  animate(dt) {
    let col = 0;
    if (this.pose === 'cast') col = 3;
    else if (this.pose === 'cheer') { col = 3; this.face = 'down'; this.dir.copy(DIRS.down); }
    else if (this.moving) { this.walkT += dt * (this.running ? 11 : 8); col = [1, 0, 2, 0][Math.floor(this.walkT) % 4]; }
    this.setFrame(ROW[this.face], col);
    this.sync();
  }
  sync() {
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.shadow.position.set(this.pos.x, this.pos.y + 0.02, this.pos.z + 0.05);
  }
}

const player = new Actor(P.characterSheet({ coat: '#e9b528', pants: '#2f4f5a', boots: '#4a3326', skin: '#f2c9a0', hair: '#8a4a2a', hat: '#6d7b3a', hatBand: '#4a5426', basket: true }), world.spawn.x, world.spawn.z);
const s0 = world.dockStart;
const npcs = [
  { id: 'marla', name: 'Marla', actor: new Actor(P.characterSheet({ coat: '#c8463a', pants: '#4a3a5a', boots: '#3a2a20', skin: '#e8b88a', hair: '#3a2418', hat: '#3f6aa8', hatBand: '#2f4f80', apron: '#f2ead8' }), world.stall.x, world.stall.z - 1) },
  { id: 'tobin', name: 'Old Tobin', actor: new Actor(P.characterSheet({ coat: '#2f3f5f', pants: '#3a3a3a', boots: '#2a2020', skin: '#e8b890', hair: '#c8c8c0', beard: '#e4e4dc', hat: '#1f2a44', hatBand: '#e4e4dc' }), 40.5, s0 + 8.5) },
  { id: 'pip', name: 'Pip', actor: new Actor(P.characterSheet({ coat: '#5cb85c', pants: '#6a4a2a', boots: '#3a2a20', skin: '#f6d0a8', hair: '#e8c060' }), 27.5, 24.5) },
];
npcs.forEach(n => world.block(Math.floor(n.actor.pos.x), Math.floor(n.actor.pos.z)));
npcs[2].actor.turn('left');
const cat = new Actor(P.catSheet(), 38.6, s0 + 1.2, { frames: 2, rows: 1, w: 0.7, h: 0.7 });
cat.setFrame(0, 0);

// fish held aloft after a catch
const heldFish = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ alphaTest: 0.5, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.15 }));
heldFish.visible = false; scene.add(heldFish);

// ---------- particles ----------
function makePoints(n, color, size, additive = true) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  return pts;
}
const fireflies = makePoints(70, '#d8ff7a', 0.13);
const ffData = Array.from({ length: 70 }, () => ({ x: 10 + Math.random() * 50, z: 12 + Math.random() * 24, y: 0.4 + Math.random() * 1.5, p: Math.random() * 10 }));
const leaves = makePoints(60, '#e8902e', 0.12, false);
const lfData = Array.from({ length: 60 }, () => ({ x: 0, y: -10, z: 0, vx: 0, p: Math.random() * 10 }));
const motes = makePoints(40, '#fff2c0', 0.06);
const splash = makePoints(120, '#e8f8ff', 0.1, false);
const spData = Array.from({ length: 120 }, () => ({ life: 0, x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0 }));
const smoke = makePoints(60, '#d8d4cc', 0.28, false); smoke.material.opacity = 0.45;
const smData = Array.from({ length: 60 }, (_, k) => ({ h: k % world.houses.length, life: Math.random() }));
const fountainDrops = makePoints(40, '#cfefff', 0.07);
const fdData = Array.from({ length: 40 }, () => ({ life: Math.random(), vx: 0, vz: 0 }));
const mist = makePoints(40, '#ffffff', 0.12); mist.material.opacity = 0.5;
const mData = Array.from({ length: 40 }, () => ({ life: Math.random(), x: 0, z: 0 }));

const fx = {
  splash(pos, n = 8) {
    let made = 0;
    for (const p of spData) if (p.life <= 0 && made < n) {
      made++; p.life = 0.5 + Math.random() * 0.4;
      p.x = pos.x; p.y = -0.15; p.z = pos.z;
      const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 1.2;
      p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = 2 + Math.random() * 2;
    }
  },
};

function updateParticles(dt, t, env) {
  let a = fireflies.geometry.attributes.position;
  ffData.forEach((f, k) => a.setXYZ(k, f.x + Math.sin(t * 0.5 + f.p) * 0.8, f.y + Math.sin(t * 1.3 + f.p * 2) * 0.3, f.z + Math.cos(t * 0.4 + f.p) * 0.8));
  a.needsUpdate = true;
  fireflies.material.opacity = env.night * (0.6 + 0.4 * Math.sin(t * 3));

  a = leaves.geometry.attributes.position;
  lfData.forEach((l, k) => {
    if (l.y < -0.1) { l.x = player.pos.x + (Math.random() - 0.5) * 30; l.z = player.pos.z + (Math.random() - 0.7) * 20; l.y = 4 + Math.random() * 4; l.vx = 0.3 + Math.random() * 0.5; }
    l.y -= dt * 0.55; l.x += Math.sin(t * 2 + l.p) * dt * 0.6 + l.vx * dt;
    a.setXYZ(k, l.x, l.y, l.z);
  });
  a.needsUpdate = true; leaves.material.opacity = 0.9;

  a = motes.geometry.attributes.position;
  for (let k = 0; k < 40; k++) a.setXYZ(k, player.pos.x + Math.sin(k * 12.9 + t * 0.1) * 12, 0.5 + ((k * 0.37 + t * 0.05) % 3), player.pos.z + Math.cos(k * 7.3 + t * 0.08) * 8);
  a.needsUpdate = true; motes.material.opacity = (1 - env.night) * 0.6;

  a = splash.geometry.attributes.position;
  spData.forEach((p, k) => {
    if (p.life > 0) { p.life -= dt; p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < -0.25) p.life = 0; }
    a.setXYZ(k, p.x, p.life > 0 ? p.y : -50, p.z);
  });
  a.needsUpdate = true;

  a = smoke.geometry.attributes.position;
  smData.forEach((s, k) => {
    s.life += dt * 0.25; if (s.life > 1) s.life -= 1;
    const c = world.houses[s.h].chimney;
    a.setXYZ(k, c.x + Math.sin(s.life * 6 + k) * 0.2 + s.life * 0.6, c.y + s.life * 2.5, c.z - s.life * 0.3);
  });
  a.needsUpdate = true;

  a = fountainDrops.geometry.attributes.position;
  fdData.forEach((d, k) => {
    d.life += dt * 1.4; if (d.life > 1) { d.life = 0; const an = Math.random() * 6.28; d.vx = Math.cos(an) * 0.45; d.vz = Math.sin(an) * 0.45; }
    const tt = d.life * 0.6;
    a.setXYZ(k, world.fountain.x + d.vx * tt * 1.6, 1.62 + 1.6 * tt - 4.5 * tt * tt, world.fountain.z + d.vz * tt * 1.6);
  });
  a.needsUpdate = true;

  a = mist.geometry.attributes.position;
  mData.forEach((m, k) => {
    m.life += dt * 0.6; if (m.life > 1) { m.life = 0; m.x = world.fallBase.x + (Math.random() - 0.5) * 2; m.z = world.fallBase.z + Math.random() * 0.6; }
    a.setXYZ(k, m.x, -0.1 + m.life * 0.9, m.z + m.life * 0.3);
  });
  a.needsUpdate = true;
}

// ---------- day / night ----------
const KEYS = [
  [0, '#0b1230', '#7088c8', 0.55, '#34488a', '#141826', 0.75, 1],
  [5, '#1c2048', '#7a88c8', 0.5, '#3a4478', '#16161e', 0.7, 0.9],
  [6.3, '#f0a878', '#ffb07a', 1.4, '#f8c8a0', '#4a4a3a', 0.7, 0.3],
  [8, '#f6d0a0', '#ffe2b0', 2.6, '#ffe8cc', '#5a6040', 0.95, 0],
  [12, '#a8d4f0', '#fff6e8', 3.1, '#dbeeff', '#5a6b3a', 1.05, 0],
  [16.5, '#f2c890', '#ffd8a0', 2.6, '#ffe2c0', '#5a5a3a', 0.95, 0],
  [18.6, '#e88a68', '#ff9a5a', 1.4, '#f0a080', '#3a3040', 0.7, 0.35],
  [20, '#2a2450', '#8a7ac8', 0.55, '#3e3a70', '#16141e', 0.7, 0.9],
  [24, '#0b1230', '#7088c8', 0.55, '#34488a', '#141826', 0.75, 1],
];
const cA = new THREE.Color(), cB = new THREE.Color();
const env = { sky: new THREE.Color(), sun: new THREE.Color(), sunI: 1, hemiS: new THREE.Color(), hemiG: new THREE.Color(), hemiI: 1, night: 0, fog: new THREE.Color(), waterLight: new THREE.Color() };
function computeEnv(h) {
  let k = 0; while (k < KEYS.length - 2 && KEYS[k + 1][0] <= h) k++;
  const A = KEYS[k], B = KEYS[k + 1], t = (h - A[0]) / (B[0] - A[0]);
  const lc = (out, i) => out.copy(cA.set(A[i])).lerp(cB.set(B[i]), t);
  lc(env.sky, 1); lc(env.sun, 2); lc(env.hemiS, 4); lc(env.hemiG, 5);
  env.sunI = A[3] + (B[3] - A[3]) * t; env.hemiI = A[6] + (B[6] - A[6]) * t; env.night = A[7] + (B[7] - A[7]) * t;
  env.fog.copy(env.sky);
  env.waterLight.copy(env.sun).lerp(cA.set('#ffffff'), 0.45).multiplyScalar(0.55 + Math.min(1, env.sunI / 3) * 0.5).lerp(cB.set('#4a5c9a'), env.night * 0.55);
  return env;
}

// ---------- game state ----------
const SAVE_KEY = 'driftmoor-cove-v1';
const defaults = () => ({ coins: 0, rod: 0, bag: [], journal: {}, total: 0, earned: 0, day: 1, hour: 7 });
let save;
try { save = { ...defaults(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { save = defaults(); }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage unavailable */ } };

let shakeAmt = 0;
const game = {
  scene, world, player, fx, save,
  ui: null,
  rod: () => RODS[save.rod],
  hour: () => save.hour,
  shake: a => { shakeAmt = Math.max(shakeAmt, a); },
  recordCatch(sp, size, value) {
    const j = save.journal[sp.id]; const isNew = !j;
    save.journal[sp.id] = { n: (j?.n || 0) + 1, best: Math.max(j?.best || 0, size) };
    save.bag.push({ id: sp.id, size, value }); save.total++;
    persist(); return isNew;
  },
  showHeldFish(sp) {
    if (!sp) { heldFish.visible = false; return; }
    heldFish.material.map = P.toTexture(P.fishCanvas(sp), { repeat: false, mips: false }); heldFish.material.needsUpdate = true;
    heldFish.visible = true;
  },
  toggleSound() { const m = toggleMute(); document.getElementById('btnSound').textContent = m ? '♪ off' : '♪ on'; },
};
const ui = new UI(game); game.ui = ui;
const fishing = new Fishing(game);

// ---------- input ----------
const keys = new Set();
const act = { held: false, pressed: false };
let started = false;
const ACTION = new Set(['Space', 'KeyE', 'Enter', 'KeyZ']);
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!started) { start(); return; }
  if (e.repeat) return;
  keys.add(e.code);
  if (ACTION.has(e.code)) { act.held = true; act.pressed = true; }
  if (ui.dialogOpen) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') ui.moveChoice(-1);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') ui.moveChoice(1);
  }
  if (e.code === 'KeyJ' && !fishing.busy()) ui.toggleJournal();
  if (e.code === 'KeyH') ui.toggleHelp();
  if (e.code === 'KeyM') game.toggleSound();
  if (e.code === 'Escape') ui.closePanels();
});
window.addEventListener('keyup', e => { keys.delete(e.code); if (ACTION.has(e.code)) act.held = [...ACTION].some(k => keys.has(k)) || touch.btn; });
window.addEventListener('blur', () => { keys.clear(); act.held = false; });

// touch: left-side virtual stick + action button
const touch = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, btn: false };
const stick = document.getElementById('stick'), knob = document.getElementById('knob'), abtn = document.getElementById('abtn');
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
canvas.addEventListener('touchstart', e => {
  if (!started) { start(); return; }
  for (const t of e.changedTouches) if (touch.id === null && t.clientX < innerWidth * 0.6) {
    touch.id = t.identifier; touch.ox = t.clientX; touch.oy = t.clientY; touch.dx = touch.dy = 0;
    stick.style.left = t.clientX + 'px'; stick.style.top = t.clientY + 'px'; stick.hidden = false;
  }
}, { passive: true });
canvas.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) if (t.identifier === touch.id) {
    let dx = t.clientX - touch.ox, dy = t.clientY - touch.oy; const l = Math.hypot(dx, dy), m = 50;
    if (l > m) { dx *= m / l; dy *= m / l; }
    touch.dx = dx / m; touch.dy = dy / m; knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}, { passive: true });
const endTouch = e => { for (const t of e.changedTouches) if (t.identifier === touch.id) { touch.id = null; touch.dx = touch.dy = 0; stick.hidden = true; knob.style.transform = ''; } };
canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
abtn.addEventListener('touchstart', e => { e.preventDefault(); if (!started) return start(); touch.btn = true; act.held = true; act.pressed = true; });
abtn.addEventListener('touchend', e => { e.preventDefault(); touch.btn = false; act.held = [...ACTION].some(k => keys.has(k)); });
document.getElementById('dialog').addEventListener('click', () => ui.advance());
document.getElementById('catch').addEventListener('click', () => { act.pressed = true; });
document.getElementById('jbtn')?.addEventListener('click', () => ui.toggleJournal());

function start() {
  if (started) return;
  started = true; initAudio();
  document.getElementById('title').classList.add('gone');
  ui.toast(save.total ? 'Welcome back to Driftmoor Cove!' : 'Walk to the water and press Space to fish.', 3500);
}
document.getElementById('title').addEventListener('click', start);

// ---------- NPC conversations ----------
const TIPS = [
  "The deep water past the end of this pier holds the big ones. Bream by day, squid by night.",
  "Folk say a golden koi shows itself in the pond, but only when the sky turns orange.",
  "When a fish runs, let the line go slack. Fight it and you'll snap your line.",
  "An old coelacanth swims these waters at dawn and dusk. Nobody's landed one in forty years.",
  "Marla at the market pays fair. Save up and get yourself a sturdier rod.",
  "Lantern eels glow down deep after dark. Fierce fighters, those.",
];
let tipIdx = 0;
function talk(n) {
  sfx.blip();
  n.actor.turn(faceToward(n.actor.pos, player.pos));
  if (n.id === 'tobin') {
    ui.dialog({ name: n.name, lines: [save.total ? TIPS[tipIdx++ % TIPS.length] : "Ahoy, youngster. First time out? Face the water, hold Space to wind up, and let go to cast.", ] });
  } else if (n.id === 'pip') {
    const caught = SPECIES.filter(s => save.journal[s.id]).length;
    ui.dialog({ name: n.name, lines: caught < SPECIES.length
      ? [`You've found ${caught} of ${SPECIES.length} kinds of fish! I bet there's more in the pond.`, 'Press J to look at your journal.']
      : ["You caught every kind of fish?! You're the best angler in Driftmoor Cove!"] });
  } else if (n.id === 'marla') {
    const worth = save.bag.reduce((a, f) => a + f.value, 0);
    const next = RODS[save.rod + 1];
    const choices = [];
    if (save.bag.length) choices.push({ label: `Sell ${save.bag.length} fish for ${worth} coins`, fn: () => {
      save.coins += worth; save.earned += worth; save.bag = []; persist(); sfx.coin(); ui.toast(`+${worth} coins`);
    } });
    if (next) choices.push({ label: `Buy ${next.name} (${next.cost} coins)`, disabled: save.coins < next.cost, fn: () => {
      save.coins -= next.cost; save.rod++; persist(); sfx.catch(); ui.toast(`You got the ${next.name}!`, 3000);
    } });
    choices.push({ label: 'Just browsing', fn: () => {} });
    ui.dialog({ name: n.name, lines: [save.bag.length ? "Ooh, a fresh haul! Let's have a look." : "Fresh fish, fair prices! Bring me what you catch and I'll pay you for it."], choices });
  }
}
function faceToward(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : (dz > 0 ? 'down' : 'up');
}
function npcInFront() {
  let best = null, bd = 2.3;
  for (const n of npcs) {
    const d = n.actor.pos.clone().sub(player.pos); const dist = d.length();
    if (dist < bd && d.normalize().dot(player.dir) > 0.5) { best = n; bd = dist; }
  }
  return best;
}

// ---------- update ----------
const camTarget = new THREE.Vector3(world.spawn.x, 0, world.spawn.z);
const tmp = new THREE.Vector3();
function toScreen(v) {
  tmp.copy(v).project(camera);
  return { x: (tmp.x * 0.5 + 0.5) * innerWidth, y: (-tmp.y * 0.5 + 0.5) * innerHeight };
}
let gameTime = 0, catT = 0, hudT = 0, saveT = 0;

function update(dt) {
  gameTime += dt;
  // a day lasts 8 real minutes
  if (started) {
    save.hour += dt * (24 / 480);
    if (save.hour >= 24) { save.hour -= 24; save.day++; }
  }
  computeEnv(save.hour);

  // movement
  let mx = 0, mz = 0;
  const locked = !started || ui.dialogOpen || fishing.busy() || ui.anyPanel();
  if (!locked) {
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
    if (touch.id !== null && Math.hypot(touch.dx, touch.dy) > 0.25) { mx = touch.dx; mz = touch.dy; }
  }
  const len = Math.hypot(mx, mz);
  player.moving = len > 0.01;
  player.running = keys.has('ShiftLeft') || keys.has('ShiftRight') || (touch.id !== null && len > 0.95);
  if (player.moving) {
    mx /= Math.max(1, len); mz /= Math.max(1, len);
    if (Math.abs(mx) > Math.abs(mz) + 0.05) player.turn(mx > 0 ? 'right' : 'left'); else if (Math.abs(mz) > 0.05) player.turn(mz > 0 ? 'down' : 'up');
    const sp = (player.running ? 5.2 : 3.1) * dt, r = 0.28;
    const ok = (x, z) => world.walkable(x - r, z - r * 0.6) && world.walkable(x + r, z - r * 0.6) && world.walkable(x - r, z + r * 0.4) && world.walkable(x + r, z + r * 0.4);
    const nx = player.pos.x + mx * sp, nz = player.pos.z + mz * sp;
    if (ok(nx, player.pos.z)) player.pos.x = nx;
    if (ok(player.pos.x, nz)) player.pos.z = nz;
  }
  player.pos.y = world.typeAt(Math.floor(player.pos.x), Math.floor(player.pos.z)) === 6 ? 0.0 : 0;

  // interaction
  let prompt = null;
  if (started && !ui.anyPanel()) {
    if (ui.dialogOpen) { if (act.pressed) ui.advance(); }
    else if (fishing.busy()) fishing.update(dt, act);
    else {
      const n = npcInFront();
      if (n) { prompt = `<b>Space</b> Talk to ${n.name}`; if (act.pressed) talk(n); }
      else if (fishing.waterAhead()) { prompt = '<b>Hold Space</b> Cast'; if (act.pressed) fishing.start(); }
      fishing.update(dt, act);
    }
  }
  act.pressed = false;
  const head = toScreen(tmp.set(player.pos.x, 2.0, player.pos.z));
  ui.prompt(prompt, head);
  ui.placeExclaim(head);

  player.animate(dt);
  npcs.forEach(n => n.actor.animate(dt));
  // Pip wanders a little and looks around
  const pip = npcs[2].actor;
  if (Math.sin(gameTime * 0.3) > 0.9 && !ui.dialogOpen) pip.turn(Math.sin(gameTime * 2.1) > 0 ? 'left' : 'down');
  // dock cat
  catT += dt; cat.setFrame(0, Math.floor(catT * 1.5) % 2);
  if (heldFish.visible) { heldFish.position.set(player.pos.x, 1.95 + Math.sin(gameTime * 4) * 0.05, player.pos.z + 0.1); }

  // camera
  const tx = Math.min(Math.max(player.pos.x, PLAY.x0 + 6), PLAY.x1 - 6);
  const tz = Math.min(Math.max(player.pos.z, 13), 50);
  camTarget.lerp(tmp.set(tx, 0, tz), 1 - Math.exp(-dt * 4));
  camera.position.copy(camTarget).add(CAM_OFF);
  if (shakeAmt > 0) { camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt; shakeAmt = Math.max(0, shakeAmt - dt * 0.8); }
  camera.lookAt(camTarget.x, 0.6, camTarget.z);
  if (!started) { const a = gameTime * 0.08; camera.position.x += Math.sin(a) * 3; camera.lookAt(camTarget.x, 0.6, camTarget.z); }

  // lighting
  const h = save.hour, ang = ((h - 6) / 12) * Math.PI;
  const isDay = h >= 5.5 && h < 19.5;
  const sx = isDay ? -Math.cos(ang) * 14 : 8, sy = isDay ? 6 + Math.max(0, Math.sin(ang)) * 18 : 22;
  sun.position.set(camTarget.x + sx, sy, camTarget.z + 10);
  sun.target.position.copy(camTarget);
  sun.color.copy(env.sun); sun.intensity = env.sunI;
  hemi.color.copy(env.hemiS); hemi.groundColor.copy(env.hemiG); hemi.intensity = env.hemiI;
  scene.background = env.sky; scene.fog.color.copy(env.fog);
  bloom.strength = 0.45 + env.night * 0.5;
  grade.uniforms.uWarm.value = 1 - env.night;
  world.update(gameTime, env);
  updateParticles(dt, gameTime, env);
  updateAudio(dt, 1 - env.night);

  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.25;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10;
    const icon = env.night > 0.5 ? '☾' : '☀';
    ui.hud(save, `${icon} Day ${save.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, RODS[save.rod].name);
  }
  saveT += dt; if (saveT > 10) { saveT = 0; persist(); }
}

// ---------- loop ----------
resize();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt);
  composer.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.getElementById('btnSound').textContent = isMuted() ? '♪ off' : '♪ on';
window.__game = { game, world, player, fishing, save, camera };
