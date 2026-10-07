// All sound is synthesized with WebAudio — no audio files.
let ctx = null, master = null, ambGain = null, muted = false, birdTimer = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
  // ocean ambience: looping filtered noise with a slow swell
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(4); src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
  ambGain = ctx.createGain(); ambGain.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.035;
  lfo.connect(lfoGain); lfoGain.connect(ambGain.gain);
  src.connect(lp); lp.connect(ambGain); ambGain.connect(master);
  src.start(); lfo.start();
}

function noiseBuffer(sec) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; }
export function isMuted() { return muted; }

function tone(freq, dur, { type = 'square', vol = 0.12, at = 0, slide = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function burst(dur, freq, vol = 0.3, q = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer(dur + 0.05);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}

export const sfx = {
  splash: () => { burst(0.45, 900, 0.35, 0.8); burst(0.2, 2400, 0.12); },
  plop: () => { tone(420, 0.12, { type: 'sine', vol: 0.15, slide: -250 }); burst(0.12, 1600, 0.08); },
  cast: () => { burst(0.25, 3000, 0.08, 3); tone(900, 0.2, { type: 'sine', vol: 0.05, slide: -500 }); },
  bite: () => { tone(880, 0.08, { vol: 0.1 }); tone(1320, 0.12, { vol: 0.1, at: 0.08 }); },
  nibble: () => tone(520, 0.05, { type: 'sine', vol: 0.06 }),
  tick: () => tone(1800 + Math.random() * 300, 0.025, { type: 'square', vol: 0.03 }),
  strain: () => tone(140, 0.12, { type: 'sawtooth', vol: 0.03, slide: 40 }),
  snap: () => { tone(700, 0.35, { type: 'sawtooth', vol: 0.1, slide: -600 }); burst(0.1, 4000, 0.15); },
  lose: () => { tone(392, 0.15, { type: 'triangle', vol: 0.12 }); tone(311, 0.3, { type: 'triangle', vol: 0.12, at: 0.15 }); },
  catch: () => { [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.18, { type: 'triangle', vol: 0.13, at: k * 0.09 })); tone(1318, 0.4, { type: 'triangle', vol: 0.1, at: 0.36 }); },
  coin: () => { tone(988, 0.08, { vol: 0.08 }); tone(1318, 0.25, { vol: 0.08, at: 0.08 }); },
  blip: () => tone(660, 0.05, { type: 'square', vol: 0.05 }),
  meow: () => tone(700, 0.35, { type: 'sine', vol: 0.08, slide: 300 }),
};

// call every frame; chirps birds during the day
export function updateAudio(dt, day) {
  if (!ctx || muted) return;
  birdTimer -= dt;
  if (birdTimer <= 0) {
    birdTimer = 2 + Math.random() * 6;
    if (day > 0.5 && Math.random() < 0.7) {
      const base = 2200 + Math.random() * 1400;
      for (let k = 0; k < 2 + ((Math.random() * 3) | 0); k++) tone(base, 0.07, { type: 'sine', vol: 0.025, at: k * 0.11, slide: Math.random() < 0.5 ? 600 : -500 });
    } else if (day < 0.3 && Math.random() < 0.5) {
      tone(4200, 0.04, { type: 'sine', vol: 0.012 }); tone(4200, 0.04, { type: 'sine', vol: 0.012, at: 0.09 }); // crickets
    }
  }
}
