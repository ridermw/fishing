// Fishing: species table, cast/bite/reel state machine and the tension mini-game.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { T } from './world.js';

export const SPECIES = [
  { id: 'sardine', name: 'Silver Sardine', zone: 'sea', depth: 'any', time: 'any', w: 40, str: 0.15, value: 8, size: [12, 22], h: 3, colors: { body: '#7f9fb8', belly: '#dfe8ee', fin: '#5d7c96' }, pattern: 'hstripe', hint: 'Anywhere in the sea.' },
  { id: 'mackerel', name: 'Tiger Mackerel', zone: 'sea', depth: 'any', time: 'day', w: 28, str: 0.3, value: 16, size: [25, 42], h: 3, colors: { body: '#3f8a7a', belly: '#e6eef0', fin: '#2e6a5e' }, pattern: 'stripes', hint: 'Sea, during the day.' },
  { id: 'flounder', name: 'Sandy Flounder', zone: 'sea', depth: 'shallow', time: 'any', w: 18, str: 0.35, value: 24, size: [25, 48], h: 5, shape: 'flat', colors: { body: '#a8865a', belly: '#d8c4a0', fin: '#8a6a42', accent: '#6a4a2a' }, pattern: 'spots', hint: 'Shallow sea near the beach.' },
  { id: 'bream', name: 'Rosy Sea Bream', zone: 'sea', depth: 'deep', time: 'day', w: 15, str: 0.45, value: 38, size: [30, 52], h: 5, colors: { body: '#d97a7a', belly: '#f6d8d0', fin: '#b85a62' }, hint: 'Deep sea, by day. Try the end of the pier.' },
  { id: 'puffer', name: 'Puffer Bun', zone: 'sea', depth: 'shallow', time: 'day', w: 10, str: 0.3, value: 42, size: [15, 30], h: 6, shape: 'round', colors: { body: '#e4c04a', belly: '#f8ecc0', fin: '#c49a2a', accent: '#6a5a2a' }, pattern: 'spots', hint: 'Shallow sea on sunny days.' },
  { id: 'squid', name: 'Inkcap Squid', zone: 'sea', depth: 'deep', time: 'night', w: 14, str: 0.5, value: 48, size: [20, 40], h: 4, shape: 'squid', colors: { body: '#e8b8c8', belly: '#f4d8e0', fin: '#c88aa0' }, hint: 'Deep sea after dark.' },
  { id: 'eel', name: 'Lantern Eel', zone: 'sea', depth: 'deep', time: 'night', w: 5, str: 0.75, value: 130, size: [60, 120], h: 2, colors: { body: '#2a3a5a', belly: '#4a5a7a', fin: '#1a2a44', accent: '#7af0ff' }, pattern: 'glow', hint: 'Deep sea, deep in the night.' },
  { id: 'tuna', name: 'Bluefin Tuna', zone: 'sea', depth: 'deep', time: 'day', w: 4, str: 0.9, value: 220, size: [90, 210], h: 5, colors: { body: '#2a4a7a', belly: '#d8e0e8', fin: '#e4c04a' }, hint: 'Rare. Deep sea, daytime.' },
  { id: 'coelacanth', name: 'Old Coelacanth', zone: 'sea', depth: 'deep', time: 'twilight', w: 1.2, str: 1.0, value: 600, size: [120, 190], h: 5, colors: { body: '#3a4a6a', belly: '#6a7a9a', fin: '#2a3a52', accent: '#e8e0c0' }, pattern: 'spots', hint: 'Legendary. Deep sea at dawn or dusk.' },
  { id: 'perch', name: 'Reed Perch', zone: 'fresh', depth: 'any', time: 'any', w: 36, str: 0.2, value: 10, size: [15, 30], h: 4, colors: { body: '#8aa04a', belly: '#e8e0a0', fin: '#d0603a' }, pattern: 'stripes', hint: 'The pond, any time.' },
  { id: 'trout', name: 'Rainbow Trout', zone: 'fresh', depth: 'any', time: 'day', w: 26, str: 0.35, value: 20, size: [25, 50], h: 4, colors: { body: '#8a9a7a', belly: '#f0e4d8', fin: '#6a7a5a', accent: '#e87a8a' }, pattern: 'hstripe', hint: 'The pond, by day.' },
  { id: 'catfish', name: 'Whisker Catfish', zone: 'fresh', depth: 'deep', time: 'night', w: 12, str: 0.55, value: 52, size: [40, 90], h: 4, colors: { body: '#5a5a4a', belly: '#a8a08a', fin: '#3a3a2e' }, hint: 'Middle of the pond at night.' },
  { id: 'koi', name: 'Golden Koi', zone: 'fresh', depth: 'any', time: 'twilight', w: 3, str: 0.7, value: 260, size: [40, 80], h: 4, colors: { body: '#f0a830', belly: '#f8e0a0', fin: '#f4f0e8', accent: '#f4f0e8' }, pattern: 'spots', hint: 'Rare. The pond at dawn or dusk.' },
  { id: 'boot', name: 'Soggy Boot', zone: 'any', depth: 'any', time: 'any', w: 6, str: 0.08, value: 1, size: [26, 30], h: 4, shape: 'boot', colors: { body: '#6b4a2f', belly: '#6b4a2f', fin: '#6b4a2f' }, hint: 'Somebody lost this...' },
];

export const RODS = [
  { name: 'Bamboo Rod', cost: 0, maxT: 1.0, reel: 0.30, boost: 0 },
  { name: 'Fiberglass Rod', cost: 150, maxT: 1.25, reel: 0.38, boost: 0.4 },
  { name: 'Carbon Rod', cost: 600, maxT: 1.55, reel: 0.47, boost: 0.8 },
  { name: 'Driftwood Legend', cost: 2000, maxT: 1.9, reel: 0.56, boost: 1.4 },
];

export function timeOk(time, h) {
  if (time === 'any') return true;
  if (time === 'day') return h >= 6 && h < 19;
  if (time === 'night') return h >= 19 || h < 6;
  if (time === 'twilight') return (h >= 5 && h < 8) || (h >= 17 && h < 20.5);
  return true;
}

export class Fishing {
  constructor(game) {
    this.g = game;
    this.state = 'idle';
    this.t = 0;
    const sc = game.scene;
    const bob = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8402e', emissive: '#e8402e', emissiveIntensity: 0.35 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f4f0e8' }));
    bob.add(top, bot); bob.visible = false; sc.add(bob); this.bobber = bob;
    this.lineGeo = new THREE.BufferGeometry(); this.lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(24 * 3), 3));
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: '#f4f4f0', transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false; this.line.visible = false; sc.add(this.line);
    const rodGeo = new THREE.CylinderGeometry(0.012, 0.03, 1, 5); rodGeo.translate(0, 0.5, 0);
    this.rod = new THREE.Mesh(rodGeo, new THREE.MeshStandardMaterial({ color: '#7a5230' })); this.rod.visible = false; this.rod.castShadow = true; sc.add(this.rod);
    this.ripples = [];
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; sc.add(m); this.ripples.push({ m, t: 1 });
    }
    this.tip = new THREE.Vector3(); this.hand = new THREE.Vector3(); this.bobPos = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.tension = 0; this.progress = 0;
  }

  busy() { return this.state !== 'idle'; }

  waterAhead() {
    const p = this.g.player, w = this.g.world;
    for (let d = 0.8; d <= 2.2; d += 0.35) {
      const i = Math.floor(p.pos.x + p.dir.x * d), j = Math.floor(p.pos.z + p.dir.z * d);
      if (w.isWater(i, j)) return true;
    }
    return false;
  }

  ripple(pos, size = 1) {
    const r = this.ripples.find(r => r.t >= 1) || this.ripples[0];
    r.t = 0; r.size = size; r.m.position.set(pos.x, -0.2, pos.z); r.m.visible = true;
  }

  start() { this.state = 'charge'; this.power = 0; this.powerDir = 1; this.g.player.pose = 'cast'; this.g.ui.power(0); }

  update(dt, act) {
    const g = this.g, p = g.player, ui = g.ui;
    this.t += dt;
    for (const r of this.ripples) if (r.t < 1) {
      r.t += dt * 0.9; const s = (0.1 + r.t * 0.6) * r.size;
      r.m.scale.set(s, s, s); r.m.material.opacity = (1 - r.t) * 0.6; if (r.t >= 1) r.m.visible = false;
    }
    if (this.state === 'idle') { this.rod.visible = this.line.visible = this.bobber.visible = false; return; }

    this.hand.set(p.pos.x + p.dir.x * 0.25, 0.75, p.pos.z + p.dir.z * 0.25 + 0.05);
    const up = new THREE.Vector3(0, 1, 0);
    let tip;
    switch (this.state) {
      case 'charge': {
        this.power += this.powerDir * dt * 1.25;
        if (this.power >= 1) { this.power = 1; this.powerDir = -1; } else if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
        ui.power(this.power);
        tip = this.hand.clone().addScaledVector(p.dir, 0.3 - this.power * 1.0).addScaledVector(up, 1.1 + this.power * 0.35);
        if (!act.held) this.cast();
        break;
      }
      case 'flight': {
        this.ft += dt / 0.6;
        const k = Math.min(1, this.ft);
        tip = this.hand.clone().addScaledVector(p.dir, 0.9).addScaledVector(up, 1.0);
        this.bobPos.lerpVectors(this.from, this.target, k); this.bobPos.y += Math.sin(k * Math.PI) * (1.2 + this.dist * 0.25);
        if (k >= 1) this.land();
        break;
      }
      case 'wait': {
        tip = this.hand.clone().addScaledVector(p.dir, 0.9).addScaledVector(up, 1.0);
        this.timer -= dt;
        this.bobPos.set(this.target.x, -0.2 + Math.sin(this.t * 2.5) * 0.02, this.target.z);
        if (this.nibbleT !== undefined) {
          this.nibbleT -= dt;
          if (this.nibbleT <= 0) { this.nibbleT = 0.6 + Math.random() * 1.5; if (this.timer > 0.6) { this.dip = 0.25; sfx.nibble(); this.ripple(this.bobPos, 0.5); } }
        }
        if (act.pressed) { ui.toast('Too early... reeled in.'); this.reset(); return; }
        if (this.timer <= 0) { this.state = 'bite'; this.window = 0.85 - this.fish.str * 0.25; sfx.bite(); sfx.splash(); this.ripple(this.bobPos, 1.4); ui.exclaim(true); g.shake(0.15); }
        break;
      }
      case 'bite': {
        tip = this.hand.clone().addScaledVector(p.dir, 0.95).addScaledVector(up, 0.7);
        this.window -= dt;
        this.bobPos.set(this.target.x + (Math.random() - 0.5) * 0.05, -0.32, this.target.z);
        if (act.pressed) { ui.exclaim(false); this.hook(); }
        else if (this.window <= 0) { ui.exclaim(false); ui.toast('It got away...'); sfx.lose(); this.reset(); return; }
        break;
      }
      case 'reel': {
        this.reelUpdate(dt, act);
        if (this.state !== 'reel') return;
        const rod = g.rod();
        const jit = this.run ? (Math.random() - 0.5) * 0.06 : 0;
        tip = this.hand.clone().addScaledVector(p.dir, 1.0).addScaledVector(up, 0.95 - this.tension / rod.maxT * 0.45 + jit);
        // fish drags the bobber around and closer as you reel
        const k = this.progress;
        const sway = Math.sin(this.t * (this.run ? 7 : 2)) * (this.run ? 0.5 : 0.2);
        const side = new THREE.Vector3(-p.dir.z, 0, p.dir.x);
        const near = new THREE.Vector3(p.pos.x + p.dir.x * 1.2, 0, p.pos.z + p.dir.z * 1.2);
        this.bobPos.lerpVectors(this.target, near, k * 0.85).addScaledVector(side, sway);
        this.bobPos.y = -0.3 + (Math.random() - 0.5) * (this.run ? 0.08 : 0.02);
        if (Math.random() < dt * (this.run ? 8 : 2)) g.fx.splash(this.bobPos, this.run ? 6 : 2);
        if (Math.random() < dt * 2) this.ripple(this.bobPos, 0.8);
        break;
      }
      case 'reward': {
        tip = this.hand.clone().addScaledVector(up, 1.5);
        this.bobPos.copy(tip);
        if (act.pressed && this.t > 0.6) { ui.hideCatch(); g.showHeldFish(null); this.reset(); return; }
        break;
      }
    }
    if (this.dip) { this.dip = Math.max(0, this.dip - dt); this.bobPos.y -= this.dip * 0.4; }
    this.tip.copy(tip);
    this.drawRod();
  }

  drawRod() {
    this.rod.visible = true;
    const v = this.tip.clone().sub(this.hand);
    this.rod.position.copy(this.hand);
    this.rod.scale.set(1, v.length(), 1);
    this.rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    const showLine = this.state !== 'charge' && this.state !== 'reward';
    this.line.visible = showLine; this.bobber.visible = showLine;
    if (!showLine) return;
    this.bobber.position.copy(this.bobPos);
    const a = this.lineGeo.attributes.position;
    const sag = this.state === 'reel' ? 0.05 : this.state === 'flight' ? 0.2 : 0.6;
    const mid = this.tip.clone().lerp(this.bobPos, 0.5); mid.y -= sag;
    for (let k = 0; k < 24; k++) {
      const t = k / 23, u = 1 - t;
      a.setXYZ(k, u * u * this.tip.x + 2 * u * t * mid.x + t * t * this.bobPos.x,
        u * u * this.tip.y + 2 * u * t * mid.y + t * t * this.bobPos.y,
        u * u * this.tip.z + 2 * u * t * mid.z + t * t * this.bobPos.z);
    }
    a.needsUpdate = true;
  }

  cast() {
    const g = this.g, p = g.player, w = g.world;
    g.ui.power(null);
    sfx.cast();
    this.dist = 1.6 + this.power * 5.2;
    let land = null;
    for (let d = this.dist; d >= 0.8; d -= 0.25) {
      const x = p.pos.x + p.dir.x * d, z = p.pos.z + p.dir.z * d;
      const i = Math.floor(x), j = Math.floor(z);
      if (w.isWater(i, j) && w.typeAt(i, j) !== T.DOCK) { land = new THREE.Vector3(x, -0.2, z); break; }
    }
    this.from = this.hand.clone().addScaledVector(p.dir, 0.9).add(new THREE.Vector3(0, 1, 0));
    this.target = land || new THREE.Vector3(p.pos.x + p.dir.x * this.dist, 0.05, p.pos.z + p.dir.z * this.dist);
    this.dist = this.target.clone().setY(0).distanceTo(new THREE.Vector3(p.pos.x, 0, p.pos.z));
    this.dry = !land;
    this.state = 'flight'; this.ft = 0;
  }

  land() {
    const g = this.g;
    if (this.dry) { g.ui.toast('Your line landed on dry ground.'); this.reset(); return; }
    sfx.plop(); this.ripple(this.target, 1); g.fx.splash(this.target, 6);
    const i = Math.floor(this.target.x), j = Math.floor(this.target.z);
    const zone = g.world.typeAt(i, j) === T.FRESH ? 'fresh' : 'sea';
    const deep = g.world.depthAt(i, j) >= (zone === 'sea' ? 4 : 3);
    this.fish = this.choose(zone, deep, g.hour());
    this.where = { zone, deep };
    this.timer = 2 + Math.random() * 5 * (1 - g.rod().boost * 0.15);
    this.nibbleT = 0.8 + Math.random();
    this.state = 'wait';
  }

  choose(zone, deep, h) {
    const boost = this.g.rod().boost;
    const pool = SPECIES.filter(s => (s.zone === 'any' || s.zone === zone) && (s.depth === 'any' || (s.depth === 'deep') === deep) && timeOk(s.time, h));
    const weights = pool.map(s => s.w * (s.w <= 6 && s.id !== 'boot' ? 1 + boost * 1.5 : 1) * (s.id === 'boot' ? 1 / (1 + boost) : 1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < pool.length; k++) { r -= weights[k]; if (r <= 0) return pool[k]; }
    return pool[0];
  }

  hook() {
    sfx.splash();
    this.state = 'reel';
    this.tension = 0.25; this.progress = 0.22; this.run = false; this.phase = 0.8 + Math.random(); this.tickT = 0;
    this.g.ui.reel(true);
  }

  reelUpdate(dt, act) {
    const g = this.g, rod = g.rod(), f = this.fish, ui = g.ui;
    this.phase -= dt;
    if (this.phase <= 0) {
      this.run = !this.run;
      this.phase = this.run ? 0.5 + Math.random() * (0.6 + f.str) : 0.7 + Math.random() * (1.8 - f.str);
      if (this.run) { sfx.splash(); g.shake(0.1 + f.str * 0.15); }
    }
    const pull = 0.5 + f.str * 1.7;
    if (act.held) {
      this.progress += rod.reel * dt * (this.run ? 0.25 : 1) * (1.15 - f.str * 0.4);
      this.tension += (this.run ? 0.55 * pull : 0.28) * dt;
      this.tickT -= dt; if (this.tickT <= 0) { sfx.tick(); this.tickT = 0.07; }
      if (this.tension > rod.maxT * 0.8 && Math.random() < dt * 6) sfx.strain();
    } else {
      this.tension -= 0.75 * dt;
      this.progress -= (this.run ? 0.07 + 0.09 * f.str : 0.02) * dt;
    }
    this.tension = Math.max(0, this.tension);
    ui.updateReel(this.tension / rod.maxT, this.progress, this.run);
    if (this.tension >= rod.maxT) { ui.reel(false); sfx.snap(); ui.toast('SNAP! The line broke.'); g.shake(0.3); this.reset(); }
    else if (this.progress <= 0) { ui.reel(false); sfx.lose(); ui.toast('The fish slipped away...'); this.reset(); }
    else if (this.progress >= 1) { ui.reel(false); this.landFish(); }
  }

  landFish() {
    const g = this.g, f = this.fish;
    const r = Math.pow(Math.random(), 1.6);
    const size = Math.round((f.size[0] + (f.size[1] - f.size[0]) * r) * 10) / 10;
    const value = Math.max(1, Math.round(f.value * (0.75 + 0.6 * r)));
    const isNew = g.recordCatch(f, size, value);
    sfx.catch(); sfx.splash(); g.fx.splash(this.bobPos, 14);
    g.ui.showCatch(f, size, value, isNew);
    g.showHeldFish(f);
    this.state = 'reward'; this.t = 0;
    g.player.pose = 'cheer';
  }

  reset() {
    this.state = 'idle'; this.g.player.pose = null;
    this.g.ui.power(null); this.g.ui.reel(false); this.g.ui.exclaim(false);
    this.rod.visible = this.line.visible = this.bobber.visible = false;
  }
}
