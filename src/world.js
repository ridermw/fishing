// World generation + rendering for Driftmoor Cove.
import * as THREE from 'three';
import * as P from './pixel.js';

export const T = { GRASS: 0, SAND: 1, PATH: 2, COBBLE: 3, SEA: 4, FRESH: 5, DOCK: 6, CLIFF: 7 };
export const W = 72, H = 58;
export const PLAY = { x0: 8, x1: 64 };

const WATER_VS = /* glsl */`
varying vec3 vW; varying float vDepth;
void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vec4 mv = viewMatrix*wp; vDepth = -mv.z; gl_Position = projectionMatrix*mv; }`;
const WATER_FS = /* glsl */`
uniform float uTime; uniform sampler2D uInfo; uniform vec2 uSize; uniform vec3 uLight; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uNight;
varying vec3 vW; varying float vDepth;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec2 p = (floor(vW.xz*16.0)+0.5)/16.0;
  vec4 info = texture2D(uInfo, p/uSize);
  float d = info.r*255.0/24.0;
  float fresh = step(0.5, info.g);
  vec3 sea = mix(vec3(0.33,0.80,0.80), vec3(0.06,0.30,0.55), smoothstep(0.55, 5.0, d));
  vec3 pond = mix(vec3(0.38,0.66,0.50), vec3(0.10,0.32,0.36), smoothstep(0.55, 3.5, d));
  vec3 col = mix(sea, pond, fresh);
  float w = sin(p.x*2.1 + uTime*1.1 + sin(p.y*1.3 + uTime*0.6)*2.0) + sin(p.y*2.7 - uTime*0.8 + p.x*0.4);
  col *= 0.9 + 0.1*step(0.7, w);
  col += vec3(0.10,0.14,0.16) * step(1.55, w);
  float band = sin(d*9.0 - uTime*2.2);
  float foam = step(0.55, band) * (1.0 - smoothstep(0.7, 1.5, d)) + (1.0 - smoothstep(0.62, 0.72, d));
  col = mix(col, vec3(0.95,0.98,1.0), clamp(foam,0.0,1.0)*0.85);
  col *= uLight;
  float sp = hash(floor(p*4.0) + floor(uTime*3.0));
  col += vec3(1.0,0.95,0.8) * step(0.993, sp) * (1.0 - fresh*0.5) * (0.6 + uNight*0.6);
  float f = smoothstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(mix(col, uFog, f), 0.9);
  #include <colorspace_fragment>
}`;
const FALL_FS = /* glsl */`
uniform float uTime; uniform vec3 uLight; uniform float uSpeed; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec2 q = floor(vUv*vec2(16.0, 48.0));
  float s = hash(vec2(q.x, floor(q.y*0.25 + uTime*uSpeed)));
  vec3 col = mix(vec3(0.45,0.72,0.86), vec3(0.92,0.97,1.0), step(0.55, s));
  col = mix(col, vec3(0.3,0.55,0.75), step(0.9, s)*0.6);
  gl_FragColor = vec4(col*uLight*1.15, 0.92);
  #include <colorspace_fragment>
}`;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.type = new Uint8Array(W * H);
    this.height = new Uint8Array(W * H);
    this.blocked = new Uint8Array(W * H);
    this.dist = new Float32Array(W * H);
    this.animated = [];
    this.lanterns = [];
    this.windowMats = [];
    this.tex = {};
    this.gen();
    this.computeDistance();
    this.build();
  }

  idx(i, j) { return j * W + i; }
  inside(i, j) { return i >= 0 && j >= 0 && i < W && j < H; }
  typeAt(i, j) { return this.inside(i, j) ? this.type[this.idx(i, j)] : (j > 40 ? T.SEA : T.GRASS); }
  isWater(i, j) { const t = this.typeAt(i, j); return t === T.SEA || t === T.FRESH; }
  walkable(x, z) {
    const i = Math.floor(x), j = Math.floor(z);
    if (!this.inside(i, j) || i < PLAY.x0 || i >= PLAY.x1) return false;
    const t = this.type[this.idx(i, j)];
    if (t === T.SEA || t === T.FRESH || t === T.CLIFF) return false;
    return !this.blocked[this.idx(i, j)];
  }
  depthAt(i, j) { return this.inside(i, j) ? this.dist[this.idx(i, j)] : 10; }

  gen() {
    const set = (i, j, t) => { if (this.inside(i, j)) this.type[this.idx(i, j)] = t; };
    const rect = (i0, j0, w, h, t) => { for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) set(i, j, t); };
    this.shore = []; this.cliff = [];
    for (let i = 0; i < W; i++) {
      this.shore[i] = 40 + Math.round(1.5 * Math.sin(i * 0.21) + 0.8 * Math.sin(i * 0.57 + 1.3));
      this.cliff[i] = 9 + Math.round(1.2 * Math.sin(i * 0.27) + 0.8 * Math.sin(i * 0.11 + 2));
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let t = T.GRASS;
      if (j >= this.shore[i]) t = T.SEA; else if (j >= this.shore[i] - 3) t = T.SAND;
      if (j < this.cliff[i]) { t = T.CLIFF; this.height[this.idx(i, j)] = j < this.cliff[i] - 3 ? 3 : 2; }
      set(i, j, t);
    }
    // pond + stream fed by a waterfall
    this.pond = { x: 20, z: 19 };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const dx = (i + 0.5 - 20) / 6.2, dz = (j + 0.5 - 19) / 4.2;
      if (dx * dx + dz * dz < 1 + 0.12 * Math.sin(i * 1.3 + j * 0.7)) set(i, j, T.FRESH);
    }
    this.river = [19, 20];
    for (let j = 0; j < 19; j++) for (const i of this.river) {
      if (this.type[this.idx(i, j)] === T.CLIFF) this.height[this.idx(i, j)] = 2;
      else set(i, j, T.FRESH);
    }
    // village plaza, roads, dock
    rect(31, 21, 16, 8, T.COBBLE);
    const s = Math.min(this.shore[37], this.shore[38]);
    this.dockStart = s;
    for (let j = 29; j < s; j++) { set(37, j, T.COBBLE); set(38, j, T.COBBLE); }
    for (let j = s; j < s + 9; j++) { set(37, j, T.DOCK); set(38, j, T.DOCK); }
    rect(34, s + 7, 8, 2, T.DOCK);
    rect(25, 24, 6, 2, T.PATH);
    rect(47, 24, 17, 2, T.PATH);
    rect(14, 24, 2, 1, T.PATH);
    this.houses = [
      { i: 29, j: 15, w: 5, d: 4, roof: 'red' },
      { i: 36, j: 14, w: 5, d: 4, roof: 'blue' },
      { i: 43, j: 15, w: 4, d: 4, roof: 'thatch' },
      { i: 50, j: 19, w: 5, d: 4, roof: 'red' },
      { i: 55, j: 28, w: 4, d: 3, roof: 'blue' },
      { i: 24, j: 29, w: 4, d: 3, roof: 'thatch' },
    ];
    for (const h of this.houses) {
      const door = h.i + Math.floor(h.w / 2);
      h.door = door;
      for (let j = h.j; j < h.j + h.d; j++) for (let i = h.i; i < h.i + h.w; i++) this.block(i, j);
      for (let j = h.j + h.d; j < H; j++) {
        const t = this.typeAt(door, j);
        if (t === T.COBBLE || t === T.PATH || t === T.SAND || t === T.SEA) break;
        set(door, j, T.COBBLE);
      }
    }
    // fountain and market stall
    this.fountain = { x: 36, z: 24 };
    for (const [i, j] of [[35, 23], [36, 23], [35, 24], [36, 24]]) this.block(i, j);
    this.stall = { x: 41.5, z: 27.5 };
    for (let i = 40; i <= 42; i++) this.block(i, 27);
    this.spawn = { x: 37.5, z: 31.5 };
  }

  block(i, j) { if (this.inside(i, j)) this.blocked[this.idx(i, j)] = 1; }

  computeDistance() {
    const q = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const t = this.type[this.idx(i, j)];
      const water = t === T.SEA || t === T.FRESH || t === T.DOCK;
      this.dist[this.idx(i, j)] = water ? 1e9 : 0;
      if (!water) q.push([i, j]);
    }
    let head = 0;
    while (head < q.length) {
      const [i, j] = q[head++]; const d = this.dist[this.idx(i, j)];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (!this.inside(a, b)) continue;
        if (this.dist[this.idx(a, b)] > d + 1) { this.dist[this.idx(a, b)] = d + 1; q.push([a, b]); }
      }
    }
  }

  texture(name, fn, opts) { if (!this.tex[name]) this.tex[name] = P.toTexture(fn(), opts); return this.tex[name]; }
  mat(name, fn, extra = {}) { return new THREE.MeshStandardMaterial({ map: this.texture(name, fn), roughness: 0.95, metalness: 0, ...extra }); }

  instanced(geo, mats, list, { shadow = true, tint = 0.08, seed = 1 } = {}) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mats, list.length);
    const o = new THREE.Object3D(); const r = P.rng(seed); const col = new THREE.Color();
    list.forEach((it, k) => {
      o.position.set(it[0], it[1], it[2]);
      o.rotation.set(0, it[4] || 0, 0);
      const sc = it[3] ?? 1; o.scale.set(Array.isArray(sc) ? sc[0] : sc, Array.isArray(sc) ? sc[1] : sc, Array.isArray(sc) ? sc[2] : sc);
      o.updateMatrix(); m.setMatrixAt(k, o.matrix);
      if (it[5]) col.set(it[5]); else col.setRGB(1, 1, 1);
      const f = 1 - tint / 2 + r() * tint; col.multiplyScalar(f);
      m.setColorAt(k, col);
    });
    m.castShadow = shadow; m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  build() {
    const sc = this.scene;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const grassTop = this.mat('grass', () => P.grassTex(1));
    const grassSide = this.mat('grassSide', () => P.grassSideTex(2));
    const dirtSide = this.mat('dirtSide', () => P.dirtSideTex(4));
    const sandTop = this.mat('sand', () => P.sandTex(5));
    const sandSide = this.mat('sandSide', () => P.sandSideTex(6));
    const path = this.mat('dirt', () => P.dirtTex(3));
    const cobble = this.mat('cobble', () => P.cobbleTex(7));
    const stone = this.mat('stone', () => P.stoneTex(8));
    const plank = this.mat('plank', () => P.plankTex(9));
    const faces = (top, side) => [side, side, top, side, side, side];

    const L = { g: [], s: [], p: [], c: [], st: [], d: [] };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const t = this.type[this.idx(i, j)], x = i + 0.5, z = j + 0.5;
      if (t === T.GRASS) L.g.push([x, -0.5, z]);
      else if (t === T.SAND) L.s.push([x, -0.5, z]);
      else if (t === T.PATH) L.p.push([x, -0.5, z]);
      else if (t === T.COBBLE) L.c.push([x, -0.5, z]);
      else if (t === T.DOCK) L.d.push([x, -0.07, z]);
      else if (t === T.CLIFF) {
        const h = this.height[this.idx(i, j)];
        for (let k = 0; k < h; k++) L.st.push([x, k - 0.5, z]);
        L.g.push([x, h - 0.5, z]);
      } else {
        // sea/fresh floor: dip the seabed so shallow water reads lighter
        const d = this.dist[this.idx(i, j)];
        if (d <= 2) (t === T.FRESH ? L.p : L.s).push([x, -1.1 - d * 0.25, z]);
      }
    }
    this.instanced(box, faces(grassTop, grassSide), L.g, { shadow: false, seed: 2 });
    this.instanced(box, faces(sandTop, sandSide), L.s, { shadow: false, seed: 3 });
    this.instanced(box, faces(path, dirtSide), L.p, { shadow: false, seed: 4 });
    this.instanced(box, faces(cobble, stone), L.c, { shadow: false, seed: 5 });
    this.instanced(box, stone, L.st, { shadow: true, seed: 6, tint: 0.15 });
    this.instanced(new THREE.BoxGeometry(1, 0.14, 1), plank, L.d, { shadow: true, seed: 7, tint: 0.12 });

    // land beyond the map edges so the diorama never shows a void
    const far = (x, z, w, d, y) => {
      const t = this.texture('grass', () => P.grassTex(1)).clone(); t.repeat.set(w, d); t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
      m.rotation.x = -Math.PI / 2; m.position.set(x + w / 2, y, z + d / 2); m.receiveShadow = true; sc.add(m);
    };
    far(-40, -40, 40, 78, 0); far(W, -40, 40, 78, 0); far(0, -40, W, 40, 3);

    this.buildWater();
    this.buildDock();
    this.buildHouses();
    this.buildTrees();
    this.buildProps();
    this.buildPlants();
    this.buildWaterfall();
  }

  buildWater() {
    const data = new Uint8Array(W * H * 4);
    for (let k = 0; k < W * H; k++) {
      const t = this.type[k];
      data[k * 4] = Math.min(255, Math.round(Math.min(this.dist[k], 10) * 24));
      data[k * 4 + 1] = t === T.FRESH ? 255 : 0;
      data[k * 4 + 3] = 255;
    }
    const info = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    info.magFilter = THREE.LinearFilter; info.minFilter = THREE.LinearFilter; info.needsUpdate = true;
    this.waterMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uInfo: { value: info }, uSize: { value: new THREE.Vector2(W, H) },
        uLight: { value: new THREE.Color(1, 1, 1) }, uFog: { value: new THREE.Color() }, uFogNear: { value: 30 }, uFogFar: { value: 70 }, uNight: { value: 0 },
      },
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.waterMat);
    water.rotation.x = -Math.PI / 2; water.position.set(W / 2, -0.22, H / 2);
    this.scene.add(water);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#2c4f5e', roughness: 1 }));
    bed.rotation.x = -Math.PI / 2; bed.position.set(W / 2, -2.2, H / 2); this.scene.add(bed);
  }

  buildDock() {
    const posts = [];
    for (let j = this.dockStart; j < this.dockStart + 9; j++) for (const i of [37, 39]) if (j % 2 === 0) posts.push([i, -0.6, j + 0.5, [1, 1.5, 1]]);
    for (let i = 34; i <= 42; i += 2) for (const j of [this.dockStart + 7, this.dockStart + 9]) posts.push([i, -0.6, j, [1, 1.5, 1]]);
    const post = new THREE.CylinderGeometry(0.09, 0.1, 1, 6);
    this.instanced(post, this.mat('bark', () => P.barkTex(10)), posts, { seed: 8 });
    // posts poking above the deck
    this.instanced(post, this.mat('bark', () => P.barkTex(10)), posts.filter((_, k) => k % 2 === 0).map(p => [p[0], 0.15, p[2], [1, 0.4, 1]]), { seed: 9 });

    // moored rowing boat
    const hull = new THREE.BoxGeometry(1, 0.42, 2.6, 1, 1, 4);
    const pos = hull.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const z = pos.getZ(k), y = pos.getY(k);
      const taper = z > 0.6 ? 1 - (z - 0.6) / 0.9 : 1;
      pos.setX(k, pos.getX(k) * Math.max(0.05, taper) * (y < 0 ? 0.75 : 1));
      if (z > 1.0) pos.setY(k, y + 0.12);
    }
    hull.computeVertexNormals();
    const boat = new THREE.Group();
    const hm = new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ map: this.texture('plankV', () => P.plankTex(21, false)), color: '#c8d8e8', roughness: 0.9 }));
    hm.castShadow = true; boat.add(hm);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.25), this.mat('plank', () => P.plankTex(9)));
    seat.position.set(0, 0.16, -0.2); boat.add(seat);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.08, 1.5), new THREE.MeshStandardMaterial({ color: '#c9473a', roughness: 0.8 }));
    trim.position.set(0, 0.12, -0.45); boat.add(trim);
    boat.position.set(35.6, -0.12, this.dockStart + 3.5);
    boat.rotation.y = 0.12;
    this.scene.add(boat);
    this.animated.push(t => { boat.position.y = -0.12 + Math.sin(t * 1.3) * 0.04; boat.rotation.z = Math.sin(t * 1.1) * 0.04; });
  }

  buildHouses() {
    let seed = 30;
    for (const h of this.houses) {
      const g = new THREE.Group();
      const wallH = 2.2;
      const mk = (wTiles, kind) => {
        const { map, emissive } = P.wallTex(wTiles, kind, seed++);
        const m = new THREE.MeshStandardMaterial({
          map: P.toTexture(map, { repeat: false }), emissiveMap: P.toTexture(emissive, { repeat: false }),
          emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0, roughness: 0.95,
        });
        this.windowMats.push(m); return m;
      };
      const front = mk(h.w, 'front'), back = mk(h.w, 'back'), side = mk(h.d, 'side');
      const plain = new THREE.MeshStandardMaterial({ color: '#d8ccb0' });
      const walls = new THREE.Mesh(new THREE.BoxGeometry(h.w - 0.1, wallH, h.d - 0.1), [side, side, plain, plain, front, back]);
      walls.position.y = wallH / 2; walls.castShadow = walls.receiveShadow = true; g.add(walls);

      // gabled roof (ridge along x)
      const ow = h.w + 0.5, od = h.d + 0.7, rh = h.d * 0.55;
      const roofT = this.texture('roof_' + h.roof, () => P.roofTex(h.roof, seed));
      const slope = Math.hypot(od / 2, rh);
      const geo = new THREE.BufferGeometry();
      const x0 = -ow / 2, x1 = ow / 2, zf = od / 2, zb = -od / 2;
      const v = [
        x0, 0, zf, x1, 0, zf, x1, rh, 0, x0, 0, zf, x1, rh, 0, x0, rh, 0,
        x1, 0, zb, x0, 0, zb, x0, rh, 0, x1, 0, zb, x0, rh, 0, x1, rh, 0,
      ];
      const uv = [
        0, 0, ow, 0, ow, slope, 0, 0, ow, slope, 0, slope,
        0, 0, ow, 0, ow, slope, 0, 0, ow, slope, 0, slope,
      ];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const roof = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: roofT, roughness: 0.9, side: THREE.DoubleSide }));
      roof.position.y = wallH; roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
      const gable = new THREE.Shape([new THREE.Vector2(-(h.d - 0.1) / 2, 0), new THREE.Vector2((h.d - 0.1) / 2, 0), new THREE.Vector2(0, rh * (h.d - 0.1) / od)]);
      const gm = new THREE.MeshStandardMaterial({ map: this.texture('plankV', () => P.plankTex(21, false)), roughness: 0.95 });
      for (const sx of [-1, 1]) {
        const gg = new THREE.Mesh(new THREE.ShapeGeometry(gable), gm);
        gg.rotation.y = sx * Math.PI / 2; gg.position.set(sx * (h.w - 0.1) / 2, wallH, 0); gg.castShadow = true; g.add(gg);
      }
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(ow + 0.1, 0.12, 0.16), new THREE.MeshStandardMaterial({ color: '#5a3a22' }));
      ridge.position.y = wallH + rh; g.add(ridge);
      const chim = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.2, 0.45), this.mat('stone', () => P.stoneTex(8)));
      chim.position.set(h.w / 2 - 1, wallH + rh * 0.7, -0.4); chim.castShadow = true; g.add(chim);
      h.chimney = new THREE.Vector3(h.i + h.w / 2 + h.w / 2 - 1, wallH + rh * 0.7 + 0.7, h.j + h.d / 2 - 0.4);

      g.position.set(h.i + h.w / 2, 0, h.j + h.d / 2);
      this.scene.add(g);
    }
  }

  buildTrees() {
    const r = P.rng(99);
    const near = (i, j, rad, fn) => { for (let b = j - rad; b <= j + rad; b++) for (let a = i - rad; a <= i + rad; a++) if (fn(this.typeAt(a, b), a, b)) return true; return false; };
    const trunks = [], leaves = [], pines = [], rocks = [];
    const autumn = ['#5c9a3e', '#4a8a36', '#6aa843', '#5c9a3e', '#e08a2e', '#cf4b2e', '#e4b83c', '#4a8a36'];
    this.treeSpots = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const t = this.type[this.idx(i, j)];
      if (t === T.CLIFF) {
        if (j < this.cliff[i] - 1 && !this.river.includes(i) && r() < 0.22) {
          const h = this.height[this.idx(i, j)];
          pines.push([i + 0.5 + (r() - 0.5) * 0.4, h, j + 0.5, 0.8 + r() * 0.5]);
        }
        continue;
      }
      if (t !== T.GRASS || this.blocked[this.idx(i, j)]) continue;
      const border = i < PLAY.x0 + 1 || i >= PLAY.x1 - 1;
      if (!border && near(i, j, 1, tt => tt === T.PATH || tt === T.COBBLE || tt === T.DOCK || tt === T.FRESH || tt === T.SAND)) continue;
      if (!border && near(i, j, 1, (tt, a, b) => this.blocked[this.idx(a, b)] && this.inside(a, b))) continue;
      if (Math.abs(i + 0.5 - this.spawn.x) < 3 && Math.abs(j + 0.5 - this.spawn.z) < 3) continue;
      const n = Math.sin(i * 0.35) * Math.cos(j * 0.41) + Math.sin((i + j) * 0.17);
      const p = border ? 0.8 : j < this.cliff[i] + 3 ? 0.3 : n > 0.7 ? 0.45 : 0.05;
      if (r() > p) continue;
      this.block(i, j);
      const x = i + 0.5 + (r() - 0.5) * 0.3, z = j + 0.5 + (r() - 0.5) * 0.3;
      if (j < this.cliff[i] + 3 && r() < 0.6) { pines.push([x, 0, z, 0.9 + r() * 0.5]); continue; }
      const th = 1.0 + r() * 0.7, col = autumn[(r() * autumn.length) | 0];
      trunks.push([x, th / 2, z, [1, th, 1]]);
      const clumps = 3 + ((r() * 2) | 0);
      for (let k = 0; k < clumps; k++) {
        const s = 0.75 + r() * 0.45;
        leaves.push([x + (r() - 0.5) * 0.9, th + 0.35 + k * 0.38 + r() * 0.2, z + (r() - 0.5) * 0.7, s, r() * 6, col]);
      }
    }
    // rocks on beach & pond edge
    for (let k = 0; k < 70; k++) {
      const i = PLAY.x0 + ((r() * (PLAY.x1 - PLAY.x0)) | 0), j = 12 + ((r() * 34) | 0);
      const t = this.typeAt(i, j);
      if ((t === T.SAND || (t === T.GRASS && near(i, j, 1, tt => tt === T.FRESH))) && !this.blocked[this.idx(i, j)] && Math.abs(i - 37.5) > 2) {
        rocks.push([i + 0.5, 0.1, j + 0.5, [0.35 + r() * 0.3, 0.25 + r() * 0.2, 0.35 + r() * 0.3], r() * 6]);
        this.block(i, j);
      }
    }
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.17, 1, 6);
    this.instanced(trunkGeo, this.mat('bark', () => P.barkTex(10)), trunks, { seed: 11 });
    const leafGeo = new THREE.IcosahedronGeometry(0.62, 0);
    const leafMat = this.mat('leaf', () => P.leafTex(11), { flatShading: true });
    this.leaves = this.instanced(leafGeo, leafMat, leaves, { seed: 12, tint: 0.18 });
    const pineGeo = new THREE.ConeGeometry(0.75, 1.3, 7);
    const pineList = [];
    pines.forEach(([x, y, z, s]) => {
      pineList.push([x, y + 0.3 * s, z, [s * 0.2, s * 0.6, s * 0.2], 0, '#6b4a2f']);
      for (let k = 0; k < 3; k++) pineList.push([x, y + (0.85 + k * 0.55) * s, z, s * (1 - k * 0.22), k, k === 2 ? '#3f7a52' : '#2f6644']);
    });
    this.instanced(pineGeo, this.mat('leaf', () => P.leafTex(11), { flatShading: true }), pineList, { seed: 13, tint: 0.15 });
    this.instanced(new THREE.DodecahedronGeometry(1, 0), this.mat('stone', () => P.stoneTex(8), { flatShading: true }), rocks, { seed: 14, tint: 0.2 });
  }

  buildPlants() {
    const r = P.rng(7);
    const kinds = ['grass', 'grass', 'grass', 'red', 'yellow', 'white', 'blue'];
    const lists = Object.fromEntries(kinds.map(k => [k, []]));
    for (let j = 0; j < H; j++) for (let i = PLAY.x0 - 2; i < PLAY.x1 + 2; i++) {
      const t = this.typeAt(i, j);
      if (t !== T.GRASS || this.blocked[this.idx(i, j)]) continue;
      const n = 1 + ((r() * 3) | 0);
      for (let k = 0; k < n; k++) if (r() < 0.35) lists[kinds[(r() * kinds.length) | 0]].push([i + r(), 0, j + r(), 0.4 + r() * 0.35, r() * 3]);
    }
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
    const g2 = geo.clone(); g2.rotateY(Math.PI / 2);
    const cross = mergeGeos([geo, g2]);
    this.swayUniform = { value: 0 };
    let seed = 50;
    for (const k of new Set(kinds)) {
      const m = new THREE.MeshStandardMaterial({ map: P.toTexture(P.tuftCanvas(k, seed++), { repeat: false, mips: false }), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
      m.onBeforeCompile = sh => {
        sh.uniforms.uSway = this.swayUniform;
        sh.vertexShader = 'uniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n transformed.x += sin(uSway*2.0 + instanceMatrix[3].x*0.7 + instanceMatrix[3].z*0.5) * 0.12 * position.y;');
      };
      this.instanced(cross, m, lists[k], { shadow: false, seed: seed, tint: 0.2 });
    }
  }

  buildProps() {
    const sc = this.scene;
    const crate = this.mat('crate', () => P.crateTex(12));
    const barrel = this.mat('barrel', () => P.barrelTex(13));
    const s = this.dockStart;
    const crates = [[36.5, 0.3, s - 1.5], [39.6, 0.3, s + 7.5], [39.6, 0.9, s + 7.6, 0.6], [43.5, 0.3, 27.3], [33.4, 0.3, 21.6], [56.5, 0.3, 31.6]];
    crates.forEach(c => { this.block(Math.floor(c[0]), Math.floor(c[2])); });
    this.instanced(new THREE.BoxGeometry(0.6, 0.6, 0.6), crate, crates.map(c => [c[0], c[1], c[2], c[3] || 1, 0.2]), { seed: 15 });
    const barrels = [[39.5, 0.35, s - 1.4], [34.4, 0.35, 21.6], [28.6, 0.35, 19.4], [49.6, 0.35, 23.4]];
    barrels.forEach(c => this.block(Math.floor(c[0]), Math.floor(c[2])));
    this.instanced(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 10), barrel, barrels, { seed: 16 });

    // fountain
    const f = this.fountain, stone = this.mat('stone', () => P.stoneTex(8));
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.5, 8), stone); basin.position.set(f.x, 0.25, f.z); basin.castShadow = basin.receiveShadow = true; sc.add(basin);
    const fw = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.05, 8), new THREE.MeshStandardMaterial({ color: '#5fc4d6', emissive: '#1a6a8a', emissiveIntensity: 0.6, roughness: 0.2 }));
    fw.position.set(f.x, 0.44, f.z); sc.add(fw);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 8), stone); col.position.set(f.x, 0.95, f.z); col.castShadow = true; sc.add(col);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.18, 8), stone); bowl.position.set(f.x, 1.5, f.z); bowl.castShadow = true; sc.add(bowl);

    // market stall
    const st = this.stall, wood = this.mat('plank', () => P.plankTex(9));
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 0.9), crate); counter.position.set(st.x, 0.45, st.z); counter.castShadow = counter.receiveShadow = true; sc.add(counter);
    const ice = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: '#cfeaf2', roughness: 0.3 })); ice.position.set(st.x, 0.93, st.z); sc.add(ice);
    const fishCols = ['#9fb8c8', '#d98a8a', '#c8b060', '#7a9ab8', '#b8c8d0'];
    fishCols.forEach((c, k) => { const fm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.14), new THREE.MeshStandardMaterial({ color: c })); fm.position.set(st.x - 1.0 + k * 0.5, 1.0, st.z + (k % 2 ? 0.1 : -0.1)); fm.rotation.y = (k % 2 ? 0.3 : -0.2); sc.add(fm); });
    for (const dx of [-1.45, 1.45]) for (const dz of [-0.4, 0.4]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, dz < 0 ? 2.4 : 2.0, 0.1), wood);
      p.position.set(st.x + dx, dz < 0 ? 1.2 : 1.0, st.z + dz); p.castShadow = true; sc.add(p);
    }
    const awnT = P.toTexture(P.stripeTex('#2f8f8a', '#f2ead8'), { repeat: true, mips: false }); awnT.repeat.set(3, 1);
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.3), new THREE.MeshStandardMaterial({ map: awnT, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }));
    awn.position.set(st.x, 2.2, st.z + 0.15); awn.rotation.x = -1.05; awn.castShadow = true; sc.add(awn);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshStandardMaterial({ map: P.toTexture(P.signTex('FRESH FISH', 64, 16), { repeat: false, mips: false }) }));
    sign.position.set(st.x, 2.75, st.z - 0.38); sc.add(sign);

    // welcome sign
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.08), [wood, wood, wood, wood,
      new THREE.MeshStandardMaterial({ map: P.toTexture(P.signTex("DRIFTMOOR COVE", 64, 16), { repeat: false, mips: false }) }), wood]);
    board.position.set(35.4, 1.25, 29.62); board.castShadow = true; sc.add(board);
    for (const dx of [-0.95, 0.95]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), wood); p.position.set(35.4 + dx, 0.65, 29.5); p.castShadow = true; sc.add(p); }
    this.block(34, 29); this.block(35, 29); this.block(36, 29);

    // bunting across the plaza
    const flags = [];
    const pal = ['#d9475a', '#f2c94c', '#3f9ad8', '#5cb85c', '#f08a3a'];
    for (let k = 0; k <= 22; k++) { const t = k / 22; flags.push([31.6 + t * 14.8, 3.1 - Math.sin(t * Math.PI) * 0.6, 21.4, [0.32, 0.36, 1], 0, pal[k % pal.length]]); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0.5, 0, 0.5, 0.5, 0, 0, -0.5, 0], 3)); fg.computeVertexNormals();
    this.instanced(fg, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), flags, { seed: 17, tint: 0 });

    // lanterns with real point lights
    const spots = [[31.5, 21.5], [46.5, 21.5], [31.5, 28.5], [46.5, 28.5], [36.5, 33.5], [39.5, 37.5], [36.5, s + 8.5], [41.5, s + 7.5], [26.5, 23.5]];
    const postGeo = new THREE.BoxGeometry(0.1, 1.7, 0.1), lampGeo = new THREE.BoxGeometry(0.26, 0.3, 0.26);
    const postMat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.7 });
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#ffd38a', emissive: '#ffb347', emissiveIntensity: 0.3 });
    spots.forEach(([x, z]) => {
      this.block(Math.floor(x), Math.floor(z));
      const p = new THREE.Mesh(postGeo, postMat); p.position.set(x, 0.85, z); p.castShadow = true; sc.add(p);
      const l = new THREE.Mesh(lampGeo, this.lampMat); l.position.set(x, 1.8, z); sc.add(l);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 4), postMat); cap.position.set(x, 2.03, z); cap.rotation.y = Math.PI / 4; sc.add(cap);
      const light = new THREE.PointLight('#ffb35c', 0, 12, 1.4); light.position.set(x, 1.85, z); sc.add(light);
      this.lanterns.push(light);
    });
  }

  buildWaterfall() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: FALL_FS, transparent: true,
      uniforms: { uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uSpeed: { value: 6 } },
    });
    const flat = mat.clone(); flat.uniforms.uSpeed = { value: 2 }; flat.uniforms.uLight = mat.uniforms.uLight;
    this.fallMats = [mat, flat];
    for (const i of this.river) {
      const c = this.cliff[i], h = 2;
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(1, h + 0.25), mat);
      fall.position.set(i + 0.5, h / 2 - 0.12, c + 0.02); this.scene.add(fall);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(1, c + 4), flat);
      top.rotation.x = -Math.PI / 2; top.position.set(i + 0.5, h + 0.02, (c - 4) / 2); this.scene.add(top);
    }
    this.fallBase = new THREE.Vector3(20, 0, this.cliff[19] + 0.6);
  }

  // Day/night: returns lighting state used by main for sun, sky and fog.
  update(t, env) {
    this.animated.forEach(fn => fn(t));
    if (this.swayUniform) this.swayUniform.value = t;
    this.waterMat.uniforms.uTime.value = t;
    this.waterMat.uniforms.uLight.value.copy(env.waterLight);
    this.waterMat.uniforms.uFog.value.copy(env.fog);
    this.waterMat.uniforms.uNight.value = env.night;
    this.fallMats.forEach(m => { m.uniforms.uTime.value = t; });
    this.fallMats[0].uniforms.uLight.value.copy(env.waterLight);
    const lamp = env.night;
    this.lanterns.forEach((l, k) => { l.intensity = lamp * (16 + Math.sin(t * 7 + k * 2.1) * 1.2); });
    this.lampMat.emissiveIntensity = 0.3 + lamp * 4.5;
    this.windowMats.forEach(m => { m.emissiveIntensity = 0.05 + lamp * 2.2; });
  }
}

function mergeGeos(geos) {
  const pos = [], nor = [], uv = [], idx = []; let off = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let k = 0; k < p.count; k++) { pos.push(p.getX(k), p.getY(k), p.getZ(k)); nor.push(n.getX(k), n.getY(k), n.getZ(k)); uv.push(u.getX(k), u.getY(k)); }
    const ix = g.index.array; for (let k = 0; k < ix.length; k++) idx.push(ix[k] + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx); return out;
}
