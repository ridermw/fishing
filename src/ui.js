// DOM overlay: HUD, dialog, journal, catch card, mini-game bars.
import { fishCanvas } from './pixel.js';
import { SPECIES } from './fishing.js';

const $ = id => document.getElementById(id);
const iconCache = new Map();
export function fishIcon(sp, sil = false, scale = 4) {
  const key = sp.id + sil + scale;
  if (!iconCache.has(key)) iconCache.set(key, fishCanvas(sp, sil, scale).toDataURL());
  return iconCache.get(key);
}

export class UI {
  constructor(game) {
    this.g = game;
    this.dlg = null;
    this.toastT = 0;
    $('btnJournal').onclick = () => this.toggleJournal();
    $('btnHelp').onclick = () => this.toggleHelp();
    $('btnSound').onclick = () => game.toggleSound();
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { $(b.dataset.close).hidden = true; });
  }

  anyPanel() { return !$('journal').hidden || !$('help').hidden; }
  closePanels() { $('journal').hidden = true; $('help').hidden = true; }

  hud(s, clock, rodName) {
    $('clock').textContent = clock;
    $('coins').textContent = s.coins.toLocaleString();
    $('bag').textContent = s.bag.length;
    $('rodName').textContent = rodName;
  }

  prompt(text, screen) {
    const el = $('prompt');
    if (!text) { el.hidden = true; return; }
    el.hidden = false; el.innerHTML = text;
    if (screen) { el.style.left = screen.x + 'px'; el.style.top = screen.y + 'px'; }
  }

  toast(msg, ms = 2200) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => el.classList.remove('show'), ms);
  }

  power(v) {
    const el = $('power');
    if (v === null) { el.hidden = true; return; }
    el.hidden = false; $('powerFill').style.width = (v * 100).toFixed(1) + '%';
  }

  exclaim(on) { $('exclaim').hidden = !on; }
  placeExclaim(screen) { const e = $('exclaim'); e.style.left = screen.x + 'px'; e.style.top = screen.y + 'px'; }

  reel(on) { $('reel').hidden = !on; }
  updateReel(t, p, run) {
    const tf = $('tensionFill');
    tf.style.width = Math.min(100, t * 100).toFixed(1) + '%';
    tf.className = t > 0.8 ? 'danger' : t > 0.55 ? 'warn' : '';
    $('progressFill').style.width = Math.max(0, Math.min(100, p * 100)).toFixed(1) + '%';
    const st = $('reelStatus');
    st.textContent = run ? "It's running! Ease off!" : 'Calm - reel it in!';
    st.className = run ? 'run' : '';
  }

  showCatch(sp, size, value, isNew) {
    $('catchImg').src = fishIcon(sp, false, 6);
    $('catchName').textContent = sp.name;
    $('catchSize').textContent = `${size} cm`;
    $('catchValue').textContent = `${value} coins`;
    $('catchNew').hidden = !isNew;
    const rare = sp.w <= 1.5 ? 'Legendary' : sp.w <= 6 ? 'Rare' : sp.w <= 16 ? 'Uncommon' : 'Common';
    $('catchRarity').textContent = sp.id === 'boot' ? 'Junk' : rare;
    $('catchRarity').className = 'rarity ' + rare.toLowerCase();
    $('catch').hidden = false;
  }
  hideCatch() { $('catch').hidden = true; }

  // dialog: { name, lines: [..], choices?: [{label, fn}] , onDone? }
  dialog(d) {
    this.dlg = { ...d, line: 0, sel: 0 };
    $('dialog').hidden = false;
    this.renderDialog();
  }
  get dialogOpen() { return !!this.dlg; }
  renderDialog() {
    const d = this.dlg;
    $('dlgName').textContent = d.name;
    $('dlgText').textContent = d.lines[d.line];
    const last = d.line === d.lines.length - 1;
    const ch = $('dlgChoices'); ch.innerHTML = '';
    if (last && d.choices) {
      d.choices.forEach((c, k) => {
        const b = document.createElement('button');
        b.className = 'choice' + (k === d.sel ? ' sel' : '') + (c.disabled ? ' disabled' : '');
        b.textContent = c.label;
        b.onclick = e => { e.stopPropagation(); d.sel = k; this.advance(); };
        ch.appendChild(b);
      });
    }
    $('dlgMore').hidden = last && !!d.choices;
  }
  moveChoice(delta) {
    const d = this.dlg; if (!d || !d.choices || d.line !== d.lines.length - 1) return;
    d.sel = (d.sel + delta + d.choices.length) % d.choices.length; this.renderDialog();
  }
  advance() {
    const d = this.dlg; if (!d) return;
    if (d.line < d.lines.length - 1) { d.line++; this.renderDialog(); return; }
    this.dlg = null; $('dialog').hidden = true;
    if (d.choices) { const c = d.choices[d.sel]; if (c && !c.disabled) c.fn?.(); }
    else d.onDone?.();
  }

  toggleHelp() { $('journal').hidden = true; $('help').hidden = !$('help').hidden; }
  toggleJournal() {
    $('help').hidden = true;
    const el = $('journal'); el.hidden = !el.hidden;
    if (el.hidden) return;
    const s = this.g.save;
    const caught = SPECIES.filter(sp => s.journal[sp.id]).length;
    $('jStats').textContent = `${caught} / ${SPECIES.length} species  ·  ${s.total} caught  ·  ${s.earned.toLocaleString()} coins earned`;
    const grid = $('jGrid'); grid.innerHTML = '';
    for (const sp of SPECIES) {
      const j = s.journal[sp.id];
      const card = document.createElement('div'); card.className = 'jcard' + (j ? '' : ' unknown');
      card.innerHTML = `<img src="${fishIcon(sp, !j, 3)}" alt=""><div class="jname">${j ? sp.name : '???'}</div>
        <div class="jhint">${sp.hint}</div>${j ? `<div class="jrec">x${j.n} · best ${j.best} cm</div>` : ''}`;
      grid.appendChild(card);
    }
  }
}
