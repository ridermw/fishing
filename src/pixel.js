// Procedural pixel-art generation. Every texture and sprite in the game is drawn here at runtime.
import * as THREE from 'three';

export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgbStr(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
export function shade(h, f) { return rgbStr(hexToRgb(h).map(v => Math.max(0, Math.min(255, v * f)))); }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return { c, g };
}

export function toTexture(c, { repeat = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  if (mips) { t.minFilter = THREE.NearestMipmapLinearFilter; t.anisotropy = 4; }
  else { t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
function noise(g, w, h, r, pal, x0 = 0, y0 = 0) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(g, x0 + x, y0 + y, pick(r, pal));
}

// Tileable voronoi used for cobbles and cliff stone.
function voronoi(w, h, n, r) {
  const pts = []; for (let i = 0; i < n; i++) pts.push([r() * w, r() * h, r()]);
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0, bdx = 0, bdy = 0;
    pts.forEach((p, i) => {
      let dx = x + 0.5 - p[0], dy = y + 0.5 - p[1];
      dx -= Math.round(dx / w) * w; dy -= Math.round(dy / h) * h;
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; best = i; bdx = dx; bdy = dy; } else if (d < d2) d2 = d;
    });
    out.push({ x, y, cell: pts[best][2], edge: d2 - d1, dx: bdx, dy: bdy });
  }
  return out;
}

// ---------- tile textures (16 px per world unit) ----------
const GRASS = ['#5a9a36', '#5a9a36', '#66a83c', '#4e8c30', '#71b343', '#4a8530'];
const DIRT = ['#7a5232', '#6b4529', '#8a5f3a', '#734c2f'];

export function grassTex(seed = 1) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  noise(g, 16, 16, r, GRASS);
  for (let i = 0; i < 14; i++) { const x = (r() * 16) | 0, y = (r() * 15) | 0; px(g, x, y, '#8cc957'); px(g, x, y + 1, '#3f7628'); }
  if (r() < 0.6) px(g, (r() * 16) | 0, (r() * 16) | 0, pick(r, ['#f4e26b', '#ffffff', '#e86a8a']));
  return c;
}
export function grassSideTex(seed = 2) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  noise(g, 16, 16, r, DIRT);
  for (let x = 0; x < 16; x++) {
    const d = 3 + ((r() * 3) | 0);
    for (let y = 0; y < d; y++) px(g, x, y, pick(r, GRASS));
    px(g, x, d, '#3f7628');
  }
  for (let i = 0; i < 5; i++) px(g, (r() * 16) | 0, 7 + ((r() * 9) | 0), '#9a7a5a');
  return c;
}
export function dirtTex(seed = 3) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  noise(g, 16, 16, r, ['#a97c4f', '#9c7046', '#b48858', '#a07448']);
  for (let i = 0; i < 6; i++) { const x = (r() * 15) | 0, y = (r() * 15) | 0; px(g, x, y, '#c9a273'); px(g, x + 1, y + 1, '#7d5634'); }
  return c;
}
export function dirtSideTex(seed = 4) { const { c, g } = makeCanvas(16, 16); noise(g, 16, 16, rng(seed), DIRT); return c; }
export function sandTex(seed = 5) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  noise(g, 16, 16, r, ['#ead59e', '#e2cb8f', '#f1dfac', '#dcc386']);
  for (let i = 0; i < 4; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, '#c9ad72');
  if (r() < 0.5) px(g, (r() * 16) | 0, (r() * 16) | 0, '#fff4e0');
  return c;
}
export function sandSideTex(seed = 6) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  noise(g, 16, 16, r, ['#cdb07a', '#c2a46e', '#d6bb85', '#b8996a']);
  return c;
}
function stoneish(w, h, n, seed, pal, mortar) {
  const { c, g } = makeCanvas(w, h); const r = rng(seed);
  voronoi(w, h, n, r).forEach(p => {
    if (p.edge < 1.15) return px(g, p.x, p.y, mortar);
    const base = pal[Math.floor(p.cell * pal.length)];
    let f = 1;
    if (p.dy < -1.6 && p.dx < 0.5) f = 1.15; else if (p.dy > 1.4) f = 0.82;
    f *= 0.95 + r() * 0.1;
    px(g, p.x, p.y, shade(base, f));
  });
  return c;
}
export function cobbleTex(seed = 7) { return stoneish(16, 16, 7, seed, ['#9b958c', '#a8a196', '#8d877e', '#b3ab9f'], '#5d5850'); }
export function stoneTex(seed = 8) {
  const c = stoneish(16, 16, 5, seed, ['#7c7a76', '#6e6d6a', '#878480', '#73706a'], '#46443f');
  const g = c.getContext('2d'); const r = rng(seed + 9);
  for (let i = 0; i < 6; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, pick(r, ['#5d7a3a', '#6b8a40']));
  return c;
}
export function plankTex(seed = 9, horizontal = true) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  const pal = ['#9a6a3e', '#8d5f36', '#a57446'];
  for (let row = 0; row < 4; row++) {
    const base = pick(r, pal);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
      let col = shade(base, 0.94 + r() * 0.12);
      if (y === 3) col = '#4f331d';
      if (y === 0) col = shade(base, 1.12);
      horizontal ? px(g, x, row * 4 + y, col) : px(g, row * 4 + y, x, col);
    }
    const nx = ((r() * 14) | 0) + 1;
    horizontal ? px(g, nx, row * 4 + 1, '#3a2a1e') : px(g, row * 4 + 1, nx, '#3a2a1e');
  }
  return c;
}
export function barkTex(seed = 10) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  for (let x = 0; x < 16; x++) { const b = pick(r, ['#6b4a2f', '#5d3f27', '#795537']); for (let y = 0; y < 16; y++) px(g, x, y, r() < 0.15 ? '#4a321f' : b); }
  return c;
}
// Grayscale foliage — tinted per-instance so one texture serves green, gold and red trees.
export function leafTex(seed = 11) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  noise(g, 16, 16, r, ['#c8c8c8', '#b4b4b4', '#d8d8d8', '#a6a6a6']);
  for (let i = 0; i < 18; i++) { const x = (r() * 15) | 0, y = (r() * 15) | 0; px(g, x, y, '#f4f4f4'); px(g, x + 1, y + 1, '#8a8a8a'); }
  return c;
}
export function crateTex(seed = 12) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  noise(g, 16, 16, r, ['#b0834f', '#a67a48', '#ba8d58']);
  g.fillStyle = '#6a4826'; g.fillRect(0, 0, 16, 2); g.fillRect(0, 14, 16, 2); g.fillRect(0, 0, 2, 16); g.fillRect(14, 0, 2, 16);
  for (let i = 0; i < 14; i++) { px(g, i + 1, i + 1, '#7a5530'); px(g, i + 1, i, '#7a5530'); }
  return c;
}
export function barrelTex(seed = 13) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  for (let x = 0; x < 16; x++) { const b = x % 4 === 3 ? '#5e3e22' : pick(r, ['#9a6a3e', '#a57446', '#8d5f36']); for (let y = 0; y < 16; y++) px(g, x, y, b); }
  g.fillStyle = '#4a4a50'; g.fillRect(0, 2, 16, 2); g.fillRect(0, 12, 16, 2);
  g.fillStyle = '#7a7a84'; g.fillRect(0, 2, 16, 1); g.fillRect(0, 12, 16, 1);
  return c;
}
export function roofTex(kind = 'red', seed = 14) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  if (kind === 'thatch') {
    noise(g, 16, 16, r, ['#c9a14a', '#b8903e', '#d6b05a', '#a8812f']);
    for (let i = 0; i < 30; i++) { const x = (r() * 16) | 0, y = (r() * 14) | 0; px(g, x, y, '#e2c278'); px(g, x, y + 1, '#8a6a2a'); }
    g.fillStyle = '#7a5a22'; g.fillRect(0, 7, 16, 1); g.fillRect(0, 15, 16, 1);
    return c;
  }
  const pal = kind === 'blue' ? ['#4c6d8e', '#557a9c', '#43617f'] : ['#b8492f', '#c4553a', '#a84129'];
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 2 : 0;
    for (let x = 0; x < 16; x++) {
      const tile = Math.floor((x + off) / 4), base = pal[(tile + row) % pal.length];
      for (let y = 0; y < 4; y++) {
        let col = shade(base, 0.95 + r() * 0.1);
        if (y === 3) col = shade(base, 0.6);
        if ((x + off) % 4 === 0) col = shade(base, 0.75);
        if (y === 0) col = shade(base, 1.15);
        px(g, x, row * 4 + y, col);
      }
    }
  }
  return c;
}
export function stripeTex(a = '#c8463a', b = '#f2ead8') {
  const { c, g } = makeCanvas(16, 16);
  for (let x = 0; x < 16; x++) for (let y = 0; y < 13; y++) px(g, x, y, (Math.floor(x / 4) % 2 ? b : a));
  for (let x = 0; x < 16; x++) { const s = 13 + (x % 4 === 1 || x % 4 === 2 ? 2 : 1); for (let y = 13; y < s; y++) px(g, x, y, (Math.floor(x / 4) % 2 ? b : a)); }
  return c;
}

// Timber-framed plaster wall, with a matching emissive map so windows glow at night.
export function wallTex(wTiles, kind, seed) {
  const W = wTiles * 16, H = 32; const r = rng(seed);
  const { c, g } = makeCanvas(W, H); const e = makeCanvas(W, H);
  e.g.fillStyle = '#000'; e.g.fillRect(0, 0, W, H);
  noise(g, W, H, r, ['#ece0c4', '#e4d6b8', '#f1e7cf', '#ddcfb0']);
  const beam = '#5a3a22';
  g.fillStyle = beam; g.fillRect(0, 0, W, 2); g.fillRect(0, 15, W, 2); g.fillRect(0, H - 2, W, 2);
  g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H);
  for (let x = 16; x < W - 4; x += 16) g.fillRect(x, 0, 2, H);
  // stone base
  for (let x = 0; x < W; x++) for (let y = H - 5; y < H; y++) px(g, x, y, pick(r, ['#8d877e', '#9b958c', '#7c776e']));
  const win = (x, y) => {
    g.fillStyle = '#4a2e1a'; g.fillRect(x - 1, y - 1, 8, 9);
    g.fillStyle = '#2c3b52'; g.fillRect(x, y, 6, 7);
    g.fillStyle = '#5b7394'; g.fillRect(x, y, 2, 2);
    g.fillStyle = '#4a2e1a'; g.fillRect(x + 3, y, 1, 7); g.fillRect(x, y + 3, 6, 1);
    e.g.fillStyle = '#ffb347'; e.g.fillRect(x, y, 6, 7);
    e.g.fillStyle = '#000'; e.g.fillRect(x + 3, y, 1, 7); e.g.fillRect(x, y + 3, 6, 1);
    // flower box
    for (let i = 0; i < 8; i++) { px(g, x - 1 + i, y + 8, '#6a4826'); px(g, x - 1 + i, y + 7, pick(r, ['#d9475a', '#f2c94c', '#3f7628', '#e8789a'])); }
  };
  const door = x => {
    g.fillStyle = '#3a2414'; g.fillRect(x - 1, H - 15, 10, 15);
    for (let y = H - 14; y < H; y++) for (let i = 0; i < 8; i++) px(g, x + i, y, i % 3 === 2 ? '#5e3a1e' : pick(r, ['#8a5a30', '#7d5129']));
    px(g, x + 6, H - 8, '#f2c94c');
    e.g.fillStyle = '#ffcf7a'; e.g.fillRect(x + 2, H - 13, 4, 2);
    g.fillStyle = '#e8c070'; g.fillRect(x + 2, H - 13, 4, 2);
  };
  if (kind === 'front') {
    const mid = Math.floor(W / 2) - 4;
    door(mid);
    for (let x = 6; x < W - 10; x += 16) if (Math.abs(x - mid) > 10) win(x, 18);
    for (let x = 6; x < W - 6; x += 16) win(x + 2, 4);
  } else {
    for (let x = 5; x < W - 8; x += 16) { win(x, 4); win(x, 18); }
  }
  return { map: c, emissive: e.c };
}

// ---------- tiny 3x5 bitmap font for signs ----------
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101',
  L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010',
  W: '101101111111101', Y: '101101010010010', ' ': '000000000000000', "'": '010010000000000',
};
export function signTex(text, w = 64, h = 16, bg = '#7a5232', fg = '#f3e3b8') {
  const { c, g } = makeCanvas(w, h); const r = rng(text.length * 31);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(g, x, y, shade(bg, 0.9 + r() * 0.2));
  g.fillStyle = '#3e2714'; g.strokeStyle = '#3e2714'; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
  const tw = text.length * 4 - 1; let x0 = Math.floor((w - tw) / 2); const y0 = Math.floor((h - 5) / 2);
  for (const ch of text) {
    const bits = FONT[ch] || FONT[' '];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') { px(g, x0 + (i % 3), y0 + Math.floor(i / 3) + 1, '#2a1a0c'); px(g, x0 + (i % 3), y0 + Math.floor(i / 3), fg); }
    x0 += 4;
  }
  return c;
}

// ---------- sprite grids ----------
function grid(w, h) {
  const a = new Array(w * h).fill(null);
  return {
    w, h, a,
    set(x, y, c) { if (x >= 0 && y >= 0 && x < w && y < h) a[y * w + x] = c; },
    get(x, y) { return (x >= 0 && y >= 0 && x < w && y < h) ? a[y * w + x] : null; },
    rect(x, y, ww, hh, c) { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) this.set(x + i, y + j, c); },
  };
}
function outline(s, col) {
  const add = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++)
    if (!s.get(x, y) && (s.get(x - 1, y) || s.get(x + 1, y) || s.get(x, y - 1) || s.get(x, y + 1))) add.push([x, y]);
  add.forEach(([x, y]) => s.set(x, y, col));
}
function blit(g, s, ox, oy, flip = false) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const c = s.get(x, y); if (c) px(g, ox + (flip ? s.w - 1 - x : x), oy + y, c); }
}

// Character: dir 'down' | 'up' | 'side'; frame 0 stand, 1 walkA, 2 walkB, 3 cast/action.
function drawChar(p, dir, frame) {
  const s = grid(16, 24);
  const bob = frame === 1 || frame === 2 ? 1 : 0;
  const dk = c => shade(c, 0.72);
  const coat = p.coat, skin = p.skin;
  // legs
  const leg = (x, y, w, h) => { s.rect(x, y, w, h, p.pants); s.rect(x, y + h, w, 1, p.boots); };
  if (dir === 'side') {
    if (frame === 1) { leg(5, 18, 2, 3); leg(8, 18, 2, 4); s.set(10, 22, p.boots); }
    else if (frame === 2) { leg(8, 18, 2, 3); leg(5, 18, 2, 4); s.set(7, 22, p.boots); }
    else { leg(6, 18, 3, 4); s.set(9, 22, p.boots); }
  } else {
    if (frame === 1) { leg(5, 18, 3, 3); leg(8, 18, 3, 4); }
    else if (frame === 2) { leg(5, 18, 3, 4); leg(8, 18, 3, 3); }
    else { leg(5, 18, 3, 4); leg(8, 18, 3, 4); }
  }
  const b = bob;
  if (dir === 'side') {
    s.rect(5, 12 + b, 6, 6, coat); s.rect(5, 17 + b, 6, 1, dk(coat));
    if (p.apron) s.rect(9, 13 + b, 2, 5, p.apron);
    if (p.basket) { s.rect(3, 13 + b, 3, 4, '#b08a4a'); s.rect(3, 14 + b, 3, 1, '#8a6a32'); }
    s.rect(7, 11 + b, 2, 1, skin);
    s.rect(5, 6 + b, 6, 6, skin); s.set(11, 9 + b, skin);
    s.rect(4, 5 + b, 7, 2, p.hair); s.rect(4, 7 + b, 2, 4, p.hair);
    s.set(9, 8 + b, '#2a1d1a');
    if (p.beard) s.rect(7, 10 + b, 5, 3, p.beard);
    if (p.hat) { s.rect(5, 2 + b, 6, 3, p.hat); s.rect(5, 4 + b, 6, 1, p.hatBand || dk(p.hat)); s.rect(3, 5 + b, 10, 1, dk(p.hat)); }
    if (frame === 3) { s.rect(9, 13 + b, 3, 1, dk(coat)); s.set(12, 13 + b, skin); }
    else { const ax = frame === 1 ? 8 : frame === 2 ? 6 : 7; s.rect(ax, 13 + b, 2, 4, dk(coat)); s.rect(ax, 17 + b, 2, 1, skin); }
  } else {
    s.rect(4, 12 + b, 8, 6, coat); s.rect(11, 12 + b, 1, 6, dk(coat)); s.rect(4, 17 + b, 8, 1, dk(coat));
    if (dir === 'down') { s.rect(8, 13 + b, 1, 4, dk(coat)); if (p.apron) s.rect(5, 14 + b, 6, 5, p.apron); }
    if (dir === 'up' && p.basket) { s.rect(5, 13 + b, 6, 4, '#b08a4a'); s.rect(5, 14 + b, 6, 1, '#8a6a32'); s.rect(5, 16 + b, 6, 1, '#8a6a32'); }
    s.rect(7, 11 + b, 2, 1, skin);
    s.rect(5, 6 + b, 6, 6, skin);
    if (dir === 'down') {
      s.rect(4, 5 + b, 8, 2, p.hair); s.rect(4, 7 + b, 1, 3, p.hair); s.rect(11, 7 + b, 1, 3, p.hair);
      s.set(6, 8 + b, '#2a1d1a'); s.set(9, 8 + b, '#2a1d1a');
      s.set(5, 10 + b, '#e8968a'); s.set(10, 10 + b, '#e8968a');
      if (p.beard) s.rect(5, 10 + b, 6, 3, p.beard);
    } else s.rect(4, 5 + b, 8, 7, p.hair);
    if (p.hat) { s.rect(5, 2 + b, 6, 3, p.hat); s.rect(5, 4 + b, 6, 1, p.hatBand || dk(p.hat)); s.rect(3, 5 + b, 10, 1, dk(p.hat)); }
    if (frame === 3) {
      if (dir === 'down') { s.rect(5, 14 + b, 2, 2, dk(coat)); s.rect(9, 14 + b, 2, 2, dk(coat)); s.rect(7, 15 + b, 2, 1, skin); }
      else { s.rect(3, 11 + b, 1, 3, dk(coat)); s.rect(12, 11 + b, 1, 3, dk(coat)); }
    } else {
      const la = frame === 1 ? -1 : 0, ra = frame === 2 ? -1 : 0;
      s.rect(3, 13 + b + la, 1, 4, dk(coat)); s.set(3, 17 + b + la, skin);
      s.rect(12, 13 + b + ra, 1, 4, dk(coat)); s.set(12, 17 + b + ra, skin);
    }
  }
  outline(s, '#1e1612');
  return s;
}

// Sprite sheet: rows = down, up, left, right; cols = stand, walkA, walkB, cast.
export function characterSheet(p) {
  const { c, g } = makeCanvas(64, 96);
  const rows = [['down', false], ['up', false], ['side', true], ['side', false]];
  rows.forEach(([dir, flip], r) => { for (let f = 0; f < 4; f++) blit(g, drawChar(p, dir, f), f * 16, r * 24, flip); });
  return c;
}

export function catSheet() {
  const { c, g } = makeCanvas(32, 16);
  for (let f = 0; f < 2; f++) {
    const s = grid(16, 16), fur = '#e0954a', dk = '#b06a2a';
    s.rect(3, 9, 9, 4, fur); s.rect(3, 12, 9, 1, dk);
    s.rect(9, 5, 5, 5, fur); s.set(9, 4, fur); s.set(13, 4, fur);
    s.set(10, 7, '#2a1d1a'); s.set(12, 7, '#2a1d1a'); s.set(11, 8, '#e8968a');
    s.rect(4, 10, 6, 1, dk);
    if (f === 0) { s.rect(1, 7, 1, 3, fur); s.set(2, 9, fur); } else { s.rect(1, 8, 2, 1, fur); s.set(0, 7, fur); }
    s.rect(4, 13, 1, 1, fur); s.rect(10, 13, 1, 1, fur);
    outline(s, '#2a1a10');
    blit(g, s, f * 16, 0);
  }
  return c;
}

// ---------- fish icons (32 x 16) ----------
export function fishCanvas(sp, silhouette = false, scale = 1) {
  const s = grid(32, 16); const r = rng(sp.id.length * 97 + sp.id.charCodeAt(0));
  const { body, belly, fin } = sp.colors;
  const dk = c => shade(c, 0.7);
  const shape = sp.shape || 'fish';
  if (shape === 'boot') {
    s.rect(10, 2, 7, 9, '#6b4a2f'); s.rect(10, 9, 14, 4, '#6b4a2f'); s.rect(10, 12, 14, 1, '#3a2614');
    s.rect(10, 2, 7, 1, '#8a6a42'); s.set(12, 5, '#c9b28a'); s.set(14, 5, '#c9b28a'); s.set(12, 7, '#c9b28a'); s.set(14, 7, '#c9b28a');
    s.set(22, 8, '#4a8a3a'); s.set(23, 7, '#4a8a3a');
  } else if (shape === 'squid') {
    for (let x = 14; x < 29; x++) { const hh = Math.round(4 * Math.sin(Math.PI * (x - 13) / 17) + 0.5); s.rect(x, 8 - hh, 1, hh * 2, x > 25 ? fin : body); }
    s.rect(26, 3, 3, 2, fin); s.rect(26, 11, 3, 2, fin);
    for (let t = 0; t < 4; t++) { const y = 5 + t * 2; for (let x = 3; x < 15; x++) s.set(x, y + Math.round(Math.sin(x * 0.8 + t) * 0.8), belly); }
    s.set(16, 7, '#ffffff'); s.set(16, 8, '#1a1a1a');
  } else {
    const x0 = 7, x1 = shape === 'round' ? 24 : 27, cy = 8;
    const len = x1 - x0;
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / len;
      const prof = Math.max(1, Math.round(sp.h * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.52) / 0.55, 2)))));
      for (let y = cy - prof; y <= cy + prof; y++) {
        let col = y > cy + prof * 0.15 ? belly : body;
        if (y < cy - prof * 0.55) col = dk(body);
        if (sp.pattern === 'stripes' && x % 4 === 0 && y < cy) col = dk(body);
        if (sp.pattern === 'hstripe' && y === cy) col = sp.colors.accent || fin;
        s.set(x, y, col);
      }
    }
    if (sp.pattern === 'spots' || sp.pattern === 'glow') for (let i = 0; i < 9; i++) {
      const x = x0 + 2 + ((r() * (len - 4)) | 0), y = cy - 3 + ((r() * 5) | 0);
      if (s.get(x, y)) s.set(x, y, sp.colors.accent || '#ffffff');
    }
    // tail
    for (let x = 2; x < x0; x++) { const th = Math.round((x0 - x) * 0.8) + 1; s.rect(x, cy - th, 1, th * 2 + 1, fin); }
    // dorsal & pelvic fins
    const top = cy - sp.h;
    for (let i = 0; i < 6; i++) s.set(x0 + 5 + i, top - 1 - (i < 3 ? 1 : 0), fin);
    s.rect(x0 + 6, top - 1, 6, 1, fin);
    s.rect(x0 + 8, cy + sp.h, 3, 1, fin);
    if (shape === 'round') for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; s.set(Math.round(16 + Math.cos(a) * (sp.h + 2)), Math.round(cy + Math.sin(a) * (sp.h + 1)), fin); }
    // eye & mouth
    const ex = x1 - 4;
    s.set(ex, cy - 2, '#ffffff'); s.set(ex + 1, cy - 2, '#1a1a1a');
    if (shape === 'flat') { s.set(ex - 2, cy - 3, '#ffffff'); s.set(ex - 1, cy - 3, '#1a1a1a'); }
    s.set(x1, cy + 1, dk(belly));
  }
  outline(s, '#1b1b24');
  if (silhouette) for (let i = 0; i < s.a.length; i++) if (s.a[i]) s.a[i] = s.a[i] === '#1b1b24' ? '#0f1118' : '#2e3442';
  const { c, g } = makeCanvas(32 * scale, 16 * scale);
  g.save(); g.scale(scale, scale); blit(g, s, 0, 0); g.restore();
  return c;
}

// soft round blob used for drop shadows and glows
export function blobTex(color = '0,0,0', alpha = 0.45) {
  const { c, g } = makeCanvas(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5) / 16;
    const a = Math.max(0, 1 - d); px(g, x, y, `rgba(${color},${(Math.round(a * 4) / 4) * alpha})`);
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

export function tuftCanvas(kind, seed) {
  const { c, g } = makeCanvas(16, 16); const r = rng(seed);
  const greens = ['#5a9a36', '#71b343', '#4a8530', '#86c653'];
  for (let i = 0; i < 7; i++) {
    let x = 2 + ((r() * 12) | 0); const h = 5 + ((r() * 8) | 0); const lean = r() < 0.5 ? -1 : 1; const col = pick(r, greens);
    for (let y = 0; y < h; y++) { px(g, x, 15 - y, col); if (y > h / 2 && r() < 0.4) x += lean; }
  }
  if (kind !== 'grass') {
    const petal = { red: '#e0475a', yellow: '#f4d04a', white: '#f4f0ea', blue: '#7a9ae8' }[kind];
    for (let i = 0; i < 3; i++) {
      const x = 3 + ((r() * 10) | 0), y = 3 + ((r() * 6) | 0);
      px(g, x, y, petal); px(g, x - 1, y, petal); px(g, x + 1, y, petal); px(g, x, y - 1, petal); px(g, x, y + 1, petal); px(g, x, y, '#f4b43a');
      for (let k = y + 2; k < 16; k++) px(g, x, k, '#4a8530');
    }
  }
  return c;
}
