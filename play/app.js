/* Mongle — 몽글몽글 데스크탑 날씨 */
'use strict';

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const COL = 3;          // snow heightmap column width (px)
const MENU_H = 28;
const MAX_PARTS = 2200;
// Running inside the Mac app (WKWebView overlay over the real desktop)?
const NATIVE = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mongle);
if (NATIVE) document.documentElement.classList.add('native');

/* =========================================================
   State
   ========================================================= */
const EFFECTS = [
  { key: 'snow',      name: '눈',       icon: '❄️' },
  { key: 'leaves',    name: '낙엽',     icon: '🍂' },
  { key: 'meteors',   name: '별똥별',   icon: '🌠' },
  { key: 'rain',      name: '비',       icon: '🌧️' },
  { key: 'sakura',    name: '벚꽃',     icon: '🌸' },
  { key: 'fireflies', name: '반딧불이', icon: '✨' },
  { key: 'pause',     name: '일시 정지', icon: '⏸️' },
];
const saved = JSON.parse(localStorage.getItem('mongle') || '{}');
const state = {
  effect: saved.effect || 'snow',
  scene: saved.scene || 'auto',
  intensity: saved.intensity || 1,
};
const save = () => localStorage.setItem('mongle', JSON.stringify(state));
const query = new URLSearchParams(location.search);
if (query.get('fx')) state.effect = query.get('fx');
if (query.get('scene')) state.scene = query.get('scene');

let W = innerWidth, H = innerHeight, T = 0;
const parts = [];
const flies = [];
let spawnAcc = 0, lightningT = 300, flash = 0, bolt = null;
const pointer = { x: -999, y: -999, lx: -999, ly: -999, vx: 0, vy: 0, inside: false, lastMove: 0 };

/* =========================================================
   Surfaces: anything snow/leaves can land on
   ========================================================= */
class Surface {
  constructor(kind, host, PH, maxH) {
    this.kind = kind; this.PH = PH; this.maxH = maxH;
    this.x = 0; this.y = 0; this.w = 0; this.h = 0;
    this.px = null; this.py = null; this.vx = 0; this.vy = 0;
    this.snow = new Float32Array(0);
    this.rest = [];
    this.slide = 0; this.spillL = 0; this.spillR = 0; this.shedAcc = 0;
    this.dirty = true; this.z = 0;
    this.cv = null;
    if (host) {
      this.cv = document.createElement('canvas'); this.cv.className = 'pile';
      this.ctx = this.cv.getContext('2d');
      host.appendChild(this.cv);
    }
  }
  setRect(x, y, w, h) {
    this.x = x; this.y = y; this.h = h;
    if (w !== this.w) {
      this.w = w;
      const n = Math.max(1, Math.ceil(w / COL));
      const old = this.snow; this.snow = new Float32Array(n);
      this.snow.set(old.subarray(0, Math.min(n, old.length)));
      if (this.cv) {
        this.cv.width = Math.ceil(w * DPR); this.cv.height = Math.ceil(this.PH * DPR);
        this.cv.style.width = w + 'px'; this.cv.style.height = this.PH + 'px';
      }
      this.dirty = true;
    }
  }
  col(wx) { return Math.floor((wx - this.x) / COL); }
  heightAt(wx) { const c = this.col(wx); return c >= 0 && c < this.snow.length ? this.snow[c] : 0; }
  line(wx) { return this.y - this.heightAt(wx); }
  addSnow(wx, amt) {
    const c = clamp(this.col(wx), 0, this.snow.length - 1);
    this.snow[c] = Math.min(this.maxH, this.snow[c] + amt);
    this.dirty = true;
  }
  addRest(r) {
    this.rest.push(r);
    if (this.rest.length > (this.kind === 'ground' ? 220 : 70)) this.rest.shift();
    this.dirty = true;
  }
  relax(k) {
    const h = this.snow, n = h.length;
    if (n < 2) return;
    let any = false;
    const S = 1.4;
    for (let pass = 0; pass < 2; pass++) {
      const fwd = pass === 0;
      for (let j = 0; j < n - 1; j++) {
        const i = fwd ? j : n - 2 - j;
        const d = h[i] - h[i + 1];
        if (d > S) { const t = (d - S) * .3; h[i] -= t; h[i + 1] += t; any = true; }
        else if (d < -S) { const t = (-d - S) * .3; h[i] += t; h[i + 1] -= t; any = true; }
      }
    }
    if (this.kind !== 'ground') {
      const E = 3.5;
      if (h[0] > E) { const t = (h[0] - E) * .08 * k; h[0] -= t; this.spillL += t; any = true; }
      if (h[n - 1] > E) { const t = (h[n - 1] - E) * .08 * k; h[n - 1] -= t; this.spillR += t; any = true; }
    }
    if (any) this.dirty = true;
  }
  melt(k) {
    const h = this.snow; let any = false;
    for (let i = 0; i < h.length; i++) if (h[i] > 0) { h[i] = Math.max(0, h[i] - .006 * k); any = true; }
    if (any) this.dirty = true;
  }
  draw() {
    if (!this.cv) { this.dirty = false; return; }
    const c = this.ctx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, this.w, this.PH);
    this.paint(c);
  }
  paint(c) {
    const h = this.snow, n = h.length, PH = this.PH;
    let maxh = 0; for (let i = 0; i < n; i++) if (h[i] > maxh) maxh = h[i];
    if (maxh > .25) {
      c.beginPath(); c.moveTo(0, PH); c.lineTo(0, PH - h[0] * .6);
      for (let i = 0; i < n - 1; i++) {
        const x = (i + .5) * COL, y = PH - h[i];
        const nx = (i + 1.5) * COL, ny = PH - h[i + 1];
        c.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
      }
      c.lineTo(this.w, PH - h[n - 1] * .6); c.lineTo(this.w, PH); c.closePath();
      const g = c.createLinearGradient(0, PH - maxh, 0, PH);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dfe8f6');
      c.shadowColor = 'rgba(80,110,170,.35)'; c.shadowBlur = 3; c.shadowOffsetY = -.5;
      c.fillStyle = g; c.fill();
      c.shadowColor = 'transparent';
    }
    for (const r of this.rest) {
      const y = PH - (h[clamp(Math.floor(r.rx / COL), 0, n - 1)] || 0) - r.size * .25;
      c.globalAlpha = r.t === 'petal' ? clamp(r.life / 60, 0, 1) : 1;
      if (r.t === 'leaf') drawLeaf(c, r.rx, y, r.size, r.rot, r.color, .45);
      else drawPetal(c, r.rx, y, r.size, r.rot, r.color, .6);
    }
    c.globalAlpha = 1;
    this.dirty = false;
  }
}

/* =========================================================
   Windows
   ========================================================= */
const desktop = $('#desktop');
const wins = [];
let zTop = 10;

function makeWindow({ title, w, h, x, y, html, dark, kind }) {
  const el = document.createElement('div');
  el.className = 'win' + (dark ? ' dark' : '');
  el.style.width = w + 'px'; el.style.height = h + 'px';
  el.innerHTML = `<div class="titlebar"><div class="lights"><i title="닫기"></i><i></i><i></i></div><div class="title">${title}</div></div>`;
  const content = document.createElement('div');
  content.className = 'win-content';
  content.innerHTML = html || '';
  el.appendChild(content);
  desktop.appendChild(el);

  const win = { el, kind, x, y, w, h, surface: new Surface('win', el, 40, 26) };
  win.surface.setRect(x, y, w, h);
  wins.push(win);
  place(win); focus(win);

  const bar = el.querySelector('.titlebar');
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.matches('.lights i')) return;
    focus(win);
    drag = { ox: e.clientX - win.x, oy: e.clientY - win.y };
    el.classList.add('dragging');
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    win.x = e.clientX - drag.ox;
    win.y = clamp(e.clientY - drag.oy, MENU_H + 4, H - 40);
    place(win);
  });
  const end = () => { drag = null; el.classList.remove('dragging'); };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  el.addEventListener('pointerdown', () => focus(win));
  el.querySelector('.lights i').addEventListener('click', () => closeWindow(win));
  return win;
}
function place(win) { win.el.style.transform = `translate(${win.x}px, ${win.y}px)`; }
function focus(win) { win.el.style.zIndex = ++zTop; win.surface.z = zTop; }

function closeWindow(win) {
  const s = win.surface;
  // everything sitting on the window tumbles down
  for (let c = 0; c < s.snow.length; c++) {
    for (let a = s.snow[c]; a > 0.8; a -= 1.4) spawnSnow(s.x + (c + .5) * COL, s.y - a, rand(-1, 1), rand(-1, 0));
  }
  for (const r of s.rest) detachRest(s, r, rand(-1.5, 1.5), rand(-2, 0));
  wins.splice(wins.indexOf(win), 1);
  if (win.el) win.el.remove();
}

/* =========================================================
   Particles
   ========================================================= */
function spawnSnow(x, y, vx = 0, vy = rand(.5, 1), r = rand(1, 3)) {
  if (parts.length < MAX_PARTS) parts.push({ t: 'snow', x, y, vx, vy, r, ph: rand(0, 6.28) });
}
const LEAF_COLORS = ['#d9541e', '#e88a2a', '#c4361b', '#f0b23a', '#a8461f', '#e06a2c'];
const PETAL_COLORS = ['#ffc7da', '#ffb3cc', '#ffd9e6', '#f8a5c2'];

function detachRest(s, r, vx, vy) {
  const x = s.x + r.rx, y = s.y - s.heightAt(s.x + r.rx) - 3;
  parts.push({ t: r.t, x, y, vx, vy, rot: r.rot, vr: rand(-.15, .15), size: r.size, color: r.color, ph: rand(0, 6.28) });
}

function burst(x, y) {
  const n = (rand(26, 40) * Math.min(1.5, state.intensity)) | 0;
  for (let i = 0; i < n; i++) {
    const a = rand(Math.PI, Math.PI * 2), sp = rand(1, 5);
    parts.push({ t: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rand(.012, .03), hue: pick([45, 50, 190, 280, 30]) });
  }
}

function collisionOrder() {
  const sorted = [...wins].sort((a, b) => b.surface.z - a.surface.z).map((w) => w.surface);
  const list = [{ s: dockSurface, occ: [] }];
  sorted.forEach((s, i) => list.push({ s, occ: [...sorted.slice(0, i), dockSurface] }));
  list.push({ s: groundSurface, occ: [...sorted, dockSurface] });
  return list;
}
function collide(p, order) {
  for (const { s, occ } of order) {
    if (p.x < s.x || p.x > s.x + s.w) continue;
    const L = s.line(p.x);
    if (p.py <= L && p.y >= L) {
      let hidden = false;
      for (const o of occ) if (p.x >= o.x && p.x <= o.x + o.w && L >= o.y - 2 && L <= o.y + o.h) { hidden = true; break; }
      if (!hidden) return { s, y: L };
    }
  }
  return null;
}

/* =========================================================
   Update
   ========================================================= */
function updateSurfaces(k) {
  const snowing = state.effect === 'snow';
  for (const win of wins) {
    const s = win.surface;
    s.setRect(win.x, win.y, win.w, win.h);
    if (s.px === null) { s.px = s.x; s.py = s.y; }
    const dx = s.x - s.px, dy = s.y - s.py;
    s.px = s.x; s.py = s.y;
    s.vx = s.vx * .5 + (dx / k) * .5;
    s.vy = s.vy * .5 + (dy / k) * .5;

    // pile lags behind horizontal motion → slides off the edges
    if (dx) {
      s.slide -= dx * .35;
      const h = s.snow, n = h.length;
      while (s.slide >= COL) {      // shift right
        s.slide -= COL; s.spillR += h[n - 1];
        for (let i = n - 1; i > 0; i--) h[i] = h[i - 1];
        h[0] = 0; s.dirty = true;
      }
      while (s.slide <= -COL) {     // shift left
        s.slide += COL; s.spillL += h[0];
        for (let i = 0; i < n - 1; i++) h[i] = h[i + 1];
        h[n - 1] = 0; s.dirty = true;
      }
      for (let i = s.rest.length - 1; i >= 0; i--) {
        const r = s.rest[i];
        r.rx -= dx * .35;
        if (r.rx < 0 || r.rx > s.w) { detachRest(s, r, s.vx * .4 + rand(-1, 1), rand(-1, 0)); s.rest.splice(i, 1); s.dirty = true; }
      }
    } else s.slide *= .9;

    // fling: fast motion throws the pile into the air
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > 5) {
      const f = Math.min(.35, (sp - 5) / 45) * k;
      const h = s.snow;
      for (let c = 0; c < h.length; c++) {
        const take = h[c] * f; if (take < .01) continue;
        h[c] -= take; s.shedAcc += take;
        while (s.shedAcc > 1) {
          s.shedAcc -= 1;
          spawnSnow(s.x + (c + .5) * COL + rand(-1, 1), s.y - h[c] - rand(0, 4),
            s.vx * rand(.6, 1.1) + rand(-1, 1), s.vy * rand(.6, 1.1) - rand(0, 2), rand(1.2, 2.8));
        }
      }
      s.dirty = true;
      if (sp > 8 && s.rest.length) {
        for (const r of s.rest) detachRest(s, r, s.vx * rand(.5, 1) + rand(-1, 1), s.vy * rand(.5, 1) - rand(0, 2));
        s.rest.length = 0;
      }
    }
  }
  if (NATIVE) dockSurface.setRect(-99999, -99999, 1, 0);
  else {
    const dr = $('#dock').getBoundingClientRect();
    dockSurface.setRect(dr.left, dr.top, dr.width, dr.height);
  }
  groundSurface.setRect(0, H, W, 0);

  for (const s of allSurfaces()) {
    s.relax(k);
    if (!snowing) s.melt(k);
    while (s.spillL > 1) { s.spillL -= 1; spawnSnow(s.x - 2, s.y - rand(0, 3), Math.min(s.vx * .4, 0) - rand(0, .6), rand(0, .6), rand(1.2, 2.6)); }
    while (s.spillR > 1) { s.spillR -= 1; spawnSnow(s.x + s.w + 2, s.y - rand(0, 3), Math.max(s.vx * .4, 0) + rand(0, .6), rand(0, .6), rand(1.2, 2.6)); }
    // petals rest a moment, then fade away
    for (let i = s.rest.length - 1; i >= 0; i--) {
      const r = s.rest[i];
      if (r.t === 'petal') { r.life -= k; s.dirty = true; if (r.life <= 0) s.rest.splice(i, 1); }
    }
    // sweep with the pointer
    const psp = Math.hypot(pointer.vx, pointer.vy);
    if (psp > 1.2 && s.rest.length) {
      for (let i = s.rest.length - 1; i >= 0; i--) {
        const r = s.rest[i];
        const wx = s.x + r.rx, wy = s.y - s.heightAt(wx) - 3;
        if (Math.abs(wx - pointer.x) < 28 && Math.abs(wy - pointer.y) < 22) {
          detachRest(s, r, pointer.vx * .5 + rand(-1, 1), Math.min(-1, pointer.vy * .5) - rand(1, 3));
          s.rest.splice(i, 1); s.dirty = true;
        }
      }
    }
    if (s.dirty) s.draw();
  }
}
const allSurfaces = () => [...wins.map((w) => w.surface), dockSurface, groundSurface];

function spawn(k) {
  const I = state.intensity, scale = W / 1400;
  const e = state.effect;
  const rate = { snow: 2.4 * scale, leaves: .14 * scale, meteors: .03, rain: 8 * scale, sakura: .4 * scale }[e] || 0;
  spawnAcc += rate * I * k;
  while (spawnAcc >= 1) {
    spawnAcc -= 1;
    if (parts.length >= MAX_PARTS) break;
    if (e === 'snow') spawnSnow(rand(-60, W + 60), rand(-20, -5));
    else if (e === 'leaves') parts.push({ t: 'leaf', x: rand(-40, W + 40), y: -20, vx: 0, vy: 1, rot: rand(0, 6.28), vr: rand(-.06, .06), size: rand(6, 10), color: pick(LEAF_COLORS), ph: rand(0, 6.28) });
    else if (e === 'sakura') parts.push({ t: 'petal', x: rand(-40, W + 40), y: -15, vx: 0, vy: .6, rot: rand(0, 6.28), vr: rand(-.05, .05), size: rand(4, 6.5), color: pick(PETAL_COLORS), ph: rand(0, 6.28) });
    else if (e === 'rain') { const vy = rand(14, 19); parts.push({ t: 'rain', x: rand(-100, W + 50), y: rand(-60, -10), vx: 1.6 + wind() * 2, vy, len: vy * rand(1, 1.6) }); }
    else if (e === 'meteors') {
      const dir = Math.random() < .5 ? 1 : -1, sp = rand(9, 15);
      const a = rand(.6, 1.0);
      parts.push({ t: 'meteor', x: dir > 0 ? rand(-100, W * .6) : rand(W * .4, W + 100), y: rand(-40, H * .15), vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp, len: rand(90, 180), hue: pick([45, 200, 280, 20]) });
    }
  }

  if (e === 'rain') {
    lightningT -= k;
    if (lightningT <= 0) { lightningT = rand(360, 900) / I; strike(); }
  }

  const want = e === 'fireflies' ? Math.round(36 * I * Math.max(.6, scale)) : 0;
  while (flies.length < want) flies.push({ x: rand(0, W), y: rand(H * .3, H), vx: 0, vy: 0, wa: rand(0, 6.28), ph: rand(0, 6.28), bl: rand(.03, .08), R: rand(16, 70), sp: rand(.6, 1.6), a: 0 });
  for (const f of flies) f.dying = flies.indexOf(f) >= want;
}

function strike() {
  flash = 1;
  const pts = [];
  let x = rand(W * .1, W * .9), y = MENU_H;
  const end = rand(H * .45, H * .85);
  while (y < end) { pts.push([x, y]); x += rand(-35, 35); y += rand(18, 45); }
  pts.push([x, y]);
  const branches = [];
  for (let b = 0; b < 3; b++) {
    const s = pts[(rand(1, pts.length - 2)) | 0]; if (!s) continue;
    let [bx, by] = s; const br = [[bx, by]]; const d = Math.random() < .5 ? -1 : 1;
    for (let i = 0; i < 5; i++) { bx += d * rand(10, 30); by += rand(12, 30); br.push([bx, by]); }
    branches.push(br);
  }
  bolt = { pts, branches, life: 1 };
}

const wind = () => Math.sin(T * .002) * .5 + Math.sin(T * .0007) * .3;

function updateParticles(k) {
  const order = collisionOrder();
  const wnd = wind();
  const psp = Math.hypot(pointer.vx, pointer.vy);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.py = p.y;
    let dead = false;
    switch (p.t) {
      case 'snow': {
        p.vx += (wnd + Math.sin(T * .02 + p.ph) * .35 - p.vx) * .025 * k;
        p.vy += (.45 + p.r * .3 - p.vy) * .035 * k;
        p.x += p.vx * k; p.y += p.vy * k;
        const hit = p.vy > 0 && collide(p, order);
        if (hit) { hit.s.addSnow(p.x, p.r * .42); dead = true; }
        break;
      }
      case 'leaf':
      case 'petal': {
        const leaf = p.t === 'leaf';
        p.ph += (leaf ? .035 : .045) * k;
        p.vx += (wnd * (leaf ? 1.6 : 1.2) + Math.sin(p.ph) * (leaf ? 1.4 : .9) - p.vx) * .04 * k;
        p.vy += ((leaf ? .95 : .6) + Math.cos(p.ph * 2) * .35 - p.vy) * .04 * k;
        p.rot += (p.vr + Math.sin(p.ph) * .02) * k;
        if (psp > 1) {
          const dx = p.x - pointer.x, dy = p.y - pointer.y;
          if (dx * dx + dy * dy < 1600) { p.vx += pointer.vx * .12; p.vy += pointer.vy * .12; }
        }
        p.x += p.vx * k; p.y += p.vy * k;
        const hit = p.vy > 0 && collide(p, order);
        if (hit) {
          hit.s.addRest({ t: p.t, rx: p.x - hit.s.x, rot: leaf ? rand(-.4, .4) + (Math.random() < .5 ? 0 : Math.PI) : p.rot, size: p.size, color: p.color, life: rand(240, 480) });
          dead = true;
        }
        break;
      }
      case 'meteor': {
        p.x += p.vx * k; p.y += p.vy * k;
        const hit = collide(p, order);
        if (hit) { burst(p.x, hit.y); dead = true; }
        break;
      }
      case 'spark': {
        p.vy += .1 * k; p.vx *= .985; p.x += p.vx * k; p.y += p.vy * k;
        p.life -= p.decay * k; if (p.life <= 0) dead = true;
        break;
      }
      case 'rain': {
        p.x += p.vx * k; p.y += p.vy * k;
        const hit = collide(p, order);
        if (hit) {
          for (let j = 0, n = (rand(2, 4)) | 0; j < n; j++)
            parts.push({ t: 'splash', x: p.x, y: hit.y - 1, vx: rand(-1.8, 1.8) + p.vx * .2, vy: rand(-3, -1), life: 1 });
          dead = true;
        }
        break;
      }
      case 'splash': {
        p.vy += .3 * k; p.x += p.vx * k; p.y += p.vy * k; p.life -= .05 * k;
        if (p.life <= 0) dead = true;
        break;
      }
    }
    if (dead || p.y > H + 60 || p.x < -260 || p.x > W + 260) { parts[i] = parts[parts.length - 1]; parts.pop(); }
  }

  // fireflies
  const idle = pointer.inside && performance.now() - pointer.lastMove > 700;
  for (let i = flies.length - 1; i >= 0; i--) {
    const f = flies[i];
    f.a = f.dying ? f.a - .02 * k : Math.min(1, f.a + .01 * k);
    if (f.a <= 0 && f.dying) { flies.splice(i, 1); continue; }
    let ax, ay, lim;
    if (idle) {
      const ang = f.ph + T * .012 * f.sp;
      const tx = pointer.x + Math.cos(ang) * f.R, ty = pointer.y + Math.sin(ang) * f.R * .75;
      ax = (tx - f.x) * .003; ay = (ty - f.y) * .003; lim = 3.2;
    } else {
      f.wa += rand(-.18, .18) * k;
      ax = Math.cos(f.wa) * .035; ay = Math.sin(f.wa) * .035; lim = 1.1;
      if (f.x < 20) ax += .05; if (f.x > W - 20) ax -= .05;
      if (f.y < MENU_H + 20) ay += .05; if (f.y > H - 20) ay -= .05;
    }
    f.vx = (f.vx + ax * k) * .985; f.vy = (f.vy + ay * k) * .985;
    const sp = Math.hypot(f.vx, f.vy); if (sp > lim) { f.vx *= lim / sp; f.vy *= lim / sp; }
    f.x += f.vx * k; f.y += f.vy * k;
  }

  if (bolt) { bolt.life -= .07 * k; if (bolt.life <= 0) bolt = null; }
  if (flash > 0) { flash -= .045 * k; if (flash < .5 && flash > .44 && Math.random() < .5) flash = .8; }
}

/* =========================================================
   Render
   ========================================================= */
const fx = $('#fx'), fctx = fx.getContext('2d');
const glow = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const g = c.getContext('2d'), gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  gr.addColorStop(0, 'rgba(255,255,210,1)'); gr.addColorStop(.18, 'rgba(225,255,140,.85)');
  gr.addColorStop(.45, 'rgba(180,255,90,.25)'); gr.addColorStop(1, 'rgba(160,255,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 48, 48); return c;
})();

function drawLeaf(c, x, y, s, rot, color, flip = 1) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, flip);
  c.fillStyle = color;
  c.beginPath(); c.moveTo(-s, 0);
  c.quadraticCurveTo(-s * .1, -s * .8, s, 0);
  c.quadraticCurveTo(-s * .1, s * .8, -s, 0); c.fill();
  c.strokeStyle = 'rgba(70,30,10,.45)'; c.lineWidth = .8;
  c.beginPath(); c.moveTo(-s * 1.35, 0); c.lineTo(s * .8, 0); c.stroke();
  c.restore();
}
function drawPetal(c, x, y, s, rot, color, flip = 1) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, flip);
  c.fillStyle = color;
  c.beginPath(); c.moveTo(0, -s);
  c.bezierCurveTo(s * .9, -s * .7, s * .7, s * .8, 0, s);
  c.bezierCurveTo(-s * .7, s * .8, -s * .9, -s * .7, 0, -s); c.fill();
  c.fillStyle = 'rgba(255,255,255,.35)';
  c.beginPath(); c.ellipse(-s * .15, -s * .2, s * .2, s * .45, .3, 0, 7); c.fill();
  c.restore();
}

function render() {
  const c = fctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);

  // snow (two batches for depth)
  c.fillStyle = 'rgba(255,255,255,.95)';
  c.beginPath();
  for (const p of parts) if (p.t === 'snow' && p.r >= 2) { c.moveTo(p.x + p.r, p.y); c.arc(p.x, p.y, p.r, 0, 7); }
  c.fill();
  c.fillStyle = 'rgba(255,255,255,.75)';
  c.beginPath();
  for (const p of parts) if (p.t === 'snow' && p.r < 2) { c.moveTo(p.x + p.r, p.y); c.arc(p.x, p.y, p.r, 0, 7); }
  c.fill();

  // rain
  c.strokeStyle = 'rgba(200,220,255,.55)'; c.lineWidth = 1.1;
  c.beginPath();
  for (const p of parts) if (p.t === 'rain') { c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * p.len / p.vy, p.y - p.len); }
  c.stroke();
  c.fillStyle = 'rgba(210,228,255,.8)';
  for (const p of parts) if (p.t === 'splash') { c.globalAlpha = p.life; c.fillRect(p.x, p.y, 1.6, 1.6); }
  c.globalAlpha = 1;

  for (const p of parts) {
    if (p.t === 'leaf') drawLeaf(c, p.x, p.y, p.size, p.rot, p.color, Math.cos(p.ph * 1.3));
    else if (p.t === 'petal') drawPetal(c, p.x, p.y, p.size, p.rot, p.color, Math.cos(p.ph * 1.6));
  }

  // meteors + sparks (additive)
  c.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    if (p.t === 'meteor') {
      const sp = Math.hypot(p.vx, p.vy), tx = p.x - p.vx / sp * p.len, ty = p.y - p.vy / sp * p.len;
      const g = c.createLinearGradient(p.x, p.y, tx, ty);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.15, `hsla(${p.hue},100%,75%,.7)`); g.addColorStop(1, `hsla(${p.hue},100%,60%,0)`);
      c.strokeStyle = g; c.lineWidth = 2.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(tx, ty); c.stroke();
      c.drawImage(glow, p.x - 12, p.y - 12, 24, 24);
    } else if (p.t === 'spark') {
      c.fillStyle = `hsla(${p.hue},100%,${60 + p.life * 30}%,${p.life})`;
      c.beginPath(); c.arc(p.x, p.y, 1.2 + p.life * 1.3, 0, 7); c.fill();
    }
  }
  for (const f of flies) {
    const b = (Math.sin(T * f.bl + f.ph) * .5 + .5);
    c.globalAlpha = f.a * (.25 + .75 * b * b);
    const s = 18 + b * 10;
    c.drawImage(glow, f.x - s / 2, f.y - s / 2, s, s);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';

  // lightning
  if (flash > 0) { c.fillStyle = `rgba(225,232,255,${flash * (NATIVE ? .18 : .32)})`; c.fillRect(0, 0, W, H); }
  if (bolt) {
    c.save();
    c.strokeStyle = `rgba(245,248,255,${bolt.life})`; c.shadowColor = 'rgba(170,200,255,.9)'; c.shadowBlur = 18;
    c.lineJoin = 'round';
    const line = (pts, w) => { c.lineWidth = w; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };
    line(bolt.pts, 2.6);
    bolt.branches.forEach((b) => line(b, 1.2));
    c.restore();
  }
}

/* =========================================================
   Wallpaper
   ========================================================= */
const wp = $('#wallpaper'), wctx = wp.getContext('2d');
let currentSceneKey = null;
function paintWallpaper(force) {
  if (NATIVE) return;
  const key = resolveScene(state.scene);
  if (!force && key === currentSceneKey) return;
  currentSceneKey = key;
  wp.width = W * DPR; wp.height = H * DPR;
  wctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawScene(wctx, W, H, key);
}

/* =========================================================
   UI
   ========================================================= */
const panel = $('#panel');
function togglePanel(force) {
  const open = force ?? panel.hidden;
  panel.hidden = !open;
  $('#logo').classList.toggle('open', open);
}
$('#logo').addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
$('#mb-effect').addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
document.addEventListener('pointerdown', (e) => {
  if (!panel.hidden && !panel.contains(e.target) && !e.target.closest('#menubar') && !e.target.closest('#dock')) togglePanel(false);
});

function setEffect(key) {
  state.effect = key; save();
  document.querySelectorAll('#effects button').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
  const e = EFFECTS.find((x) => x.key === key);
  $('#mb-effect').textContent = `${e.icon} ${e.name}`;
}
function setScene(key) {
  state.scene = key; save();
  document.querySelectorAll('#scenes button').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
  paintWallpaper(true);
}

EFFECTS.forEach((e) => {
  const b = document.createElement('button');
  b.dataset.key = e.key; b.innerHTML = `<span>${e.icon}</span>${e.name}`;
  b.addEventListener('click', () => setEffect(e.key));
  $('#effects').appendChild(b);
});
SCENE_KEYS.forEach((k) => {
  const b = document.createElement('button');
  b.dataset.key = k;
  const cv = document.createElement('canvas'); cv.width = 224; cv.height = 140;
  drawScene(cv.getContext('2d'), 224, 140, resolveScene(k));
  b.appendChild(cv);
  const label = document.createElement('em'); label.textContent = k === 'auto' ? '자동 (시간대)' : SCENES[k].name;
  b.appendChild(label);
  b.addEventListener('click', () => setScene(k));
  $('#scenes').appendChild(b);
});
const slider = $('#intensity');
slider.value = state.intensity;
slider.addEventListener('input', () => { state.intensity = +slider.value; save(); });

let winCount = 0;
function addRandomWindow() {
  winCount++;
  const w = rand(260, 420) | 0, h = rand(170, 300) | 0;
  makeWindow({
    title: `새 창 ${winCount}`, w, h,
    x: rand(20, Math.max(30, W - w - 20)) | 0, y: rand(MENU_H + 60, Math.max(MENU_H + 70, H - h - 120)) | 0,
    html: '<div class="empty">드래그해서 휙 던져 보세요</div>', dark: Math.random() < .3,
  });
}
$('#add-win').addEventListener('click', addRandomWindow);
$('#clear-all').addEventListener('click', () => {
  parts.length = 0;
  for (const s of allSurfaces()) { s.snow.fill(0); s.rest.length = 0; s.dirty = true; }
});

addEventListener('keydown', (e) => {
  if (e.target.isContentEditable || e.target.tagName === 'INPUT') return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 6) setEffect(EFFECTS[n - 1].key);
  else if (e.key === '0') setEffect('pause');
  else if (e.key === 'n' || e.key === 'N') addRandomWindow();
  else if (e.key === 'Escape') togglePanel(false);
});

addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; pointer.lastMove = performance.now();
}, { capture: true });
document.documentElement.addEventListener('pointerleave', () => { pointer.inside = false; });

function tickClock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });
  if (state.scene === 'auto') paintWallpaper(false);
}

/* =========================================================
   Dock + starter windows
   ========================================================= */
const dock = $('#dock');
const dockSurface = new Surface('dock', NATIVE ? null : dock, 30, 18);
const groundSurface = new Surface('ground', NATIVE ? null : $('#ground'), 60, 46);

const STARTERS = {
  welcome: () => makeWindow({
    kind: 'welcome', title: 'Mongle에 오신 걸 환영해요', w: 400, h: 330,
    x: Math.max(20, W * .08) | 0, y: Math.max(MENU_H + 70, H * .16) | 0,
    html: `<h2>☁︎ 내 화면에 몽글몽글 날씨</h2>
      <ul>
        <li><b>눈</b>은 창 위에 쌓여요. 창을 끌면 미끄러지고, <b>휙 던지면</b> 날아가요.</li>
        <li><b>낙엽</b>은 포인터로 쓸어 보세요.</li>
        <li><b>별똥별</b>은 창에 부딪혀 불꽃으로 부서져요.</li>
        <li><b>반딧불이</b>는 포인터를 멈춘 곳에 모여요.</li>
      </ul>
      <p>왼쪽 위 <b>☁︎ Mongle</b>에서 날씨와 배경화면을 바꿔요. 단축키 <kbd>1</kbd>–<kbd>6</kbd>.</p>`,
  }),
  note: () => makeWindow({
    kind: 'note', title: '메모', w: 300, h: 240,
    x: (W * .62) | 0, y: Math.max(MENU_H + 50, H * .1) | 0, dark: false,
    html: '<div class="note" contenteditable="true">오늘의 할 일 ☕️<br>· 창 위에 눈 잔뜩 쌓기<br>· 휙 던져서 눈 날리기<br>· 반딧불이랑 놀기</div>',
  }),
  photo: () => {
    const win = makeWindow({ kind: 'photo', title: '사진 — 겨울 산.png', w: 340, h: 240, x: (W * .48) | 0, y: (H * .5) | 0, dark: true });
    win.el.querySelector('.win-content').remove();
    const box = document.createElement('div'); box.className = 'photo';
    const cv = document.createElement('canvas'); cv.width = 680; cv.height = 408;
    drawScene(cv.getContext('2d'), 680, 408, 'winter');
    box.appendChild(cv); win.el.appendChild(box);
    return win;
  },
};
const DOCK_ITEMS = [
  { icon: '☁️', bg: 'linear-gradient(#7cc4ff,#3a78f2)', act: () => togglePanel() },
  { icon: '👋', bg: 'linear-gradient(#ffe08a,#ffb340)', act: () => openStarter('welcome') },
  { icon: '📝', bg: 'linear-gradient(#fff6c2,#ffd84d)', act: () => openStarter('note') },
  { icon: '🏔️', bg: 'linear-gradient(#c8d8ff,#6f8de0)', act: () => openStarter('photo') },
  { icon: '🗂️', bg: 'linear-gradient(#a6e3ff,#38a8e8)', act: addRandomWindow },
];
function openStarter(kind) {
  const w = wins.find((x) => x.kind === kind);
  if (w) focus(w); else STARTERS[kind]();
}
DOCK_ITEMS.forEach((d) => {
  const b = document.createElement('button');
  b.textContent = d.icon; b.style.background = d.bg;
  b.addEventListener('click', d.act);
  dock.appendChild(b);
});

/* =========================================================
   Boot
   ========================================================= */
function resize() {
  W = innerWidth; H = innerHeight;
  fx.width = W * DPR; fx.height = H * DPR;
  paintWallpaper(true);
  for (const w of wins) { w.x = clamp(w.x, -w.w + 80, W - 80); w.y = clamp(w.y, MENU_H + 4, H - 40); place(w); }
}
let booted = false;
function bootWindows() {
  if (NATIVE) return;
  if (booted || innerWidth < 320 || innerHeight < 320) return; // wait for a real viewport
  booted = true;
  STARTERS.photo(); STARTERS.note(); STARTERS.welcome();
}
addEventListener('resize', () => { resize(); bootWindows(); });
resize();
bootWindows();
setEffect(state.effect);
setScene(state.scene);
tickClock(); setInterval(tickClock, 15000);

let last = performance.now();
function frame(now) {
  const k = clamp((now - last) / 16.667, .2, 3); last = now; T += k;
  pointer.vx = pointer.lx < -900 ? 0 : (pointer.x - pointer.lx) / k;
  pointer.vy = pointer.ly < -900 ? 0 : (pointer.y - pointer.ly) / k;
  pointer.lx = pointer.x; pointer.ly = pointer.y;
  if (state.effect !== 'pause') spawn(k); else spawn(0);
  updateSurfaces(k);
  updateParticles(k);
  render();
  if (NATIVE) renderPiles();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* =========================================================
   Native bridge (Mac app)
   The Swift side feeds real window frames + the mouse position.
   ========================================================= */
let pctx = null;
const parked = new Map();   // windows on another Space / minimised keep their snow
if (NATIVE) {
  const pc = document.createElement('canvas');
  pc.id = 'piles';
  document.body.insertBefore(pc, $('#fx'));
  pctx = pc.getContext('2d');
  const sizePiles = () => { pc.width = W * DPR; pc.height = H * DPR; };
  addEventListener('resize', sizePiles); sizePiles();
}

function renderPiles() {
  const c = pctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);
  const g = groundSurface;
  c.save(); c.translate(0, H - g.PH); g.paint(c); c.restore();
  // paint back-to-front; each window erases whatever lower piles it covers
  const sorted = [...wins].sort((a, b) => a.surface.z - b.surface.z);
  for (const w of sorted) {
    const s = w.surface;
    c.clearRect(s.x, s.y, s.w, s.h);
    c.save(); c.translate(s.x, s.y - s.PH); s.paint(c); c.restore();
  }
}

// list: front-to-back [{id, x, y, w, h}] in page coordinates
window.mongleSetWindows = (list) => {
  const seen = new Set();
  list.forEach((r, i) => {
    seen.add(r.id);
    let w = wins.find((x) => x.id === r.id);
    if (!w) {
      w = parked.get(r.id);
      if (w) parked.delete(r.id);
      else {
        w = { kind: 'native', id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, surface: new Surface('win', null, 40, 26) };
        w.surface.setRect(r.x, r.y, r.w, r.h);
      }
      w.surface.px = r.x; w.surface.py = r.y; w.surface.vx = w.surface.vy = 0;
      wins.push(w);
    }
    w.x = r.x; w.y = r.y; w.w = r.w; w.h = r.h;
    w.surface.z = list.length - i;
  });
  for (let i = wins.length - 1; i >= 0; i--) {
    const w = wins[i];
    if (!seen.has(w.id)) { wins.splice(i, 1); parked.set(w.id, w); }
  }
  if (parked.size > 120) parked.delete(parked.keys().next().value);
};

window.mongleSetPointer = (x, y) => {
  if (x !== pointer.x || y !== pointer.y) pointer.lastMove = performance.now();
  pointer.x = x; pointer.y = y; pointer.inside = true;
};

window.mongleApply = (opts) => {
  if (opts.intensity) { state.intensity = opts.intensity; save(); }
  if (opts.effect) setEffect(opts.effect);
  if (opts.clear) $('#clear-all').click();
};

// returns a PNG data URL of a scene at the given pixel size
window.mongleRenderWallpaper = (key, w, h) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  drawScene(cv.getContext('2d'), w, h, resolveScene(key));
  return cv.toDataURL('image/png');
};

if (NATIVE) window.webkit.messageHandlers.mongle.postMessage({ type: 'ready' });
