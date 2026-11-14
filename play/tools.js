/* Mongle snow play — 🧹 broom, 🚜 snowplow, ⛄ snowballs & snowmen
   Loaded after app.js; uses its globals (wins, parts, pointer, Surface helpers …). */
'use strict';

const TOOLS = [
  { key: 'hand',  icon: '🖐️', name: '그냥 보기', hint: '' },
  { key: 'broom', icon: '🧹', name: '빗자루',   hint: '🧹 쌓인 눈을 꾹 누른 채로 쓱쓱 쓸어 보세요' },
  { key: 'plow',  icon: '🚜', name: '제설차',   hint: '🚜 창 위나 바닥을 누르면 제설차가 출동해요' },
  { key: 'ball',  icon: '⛄', name: '눈사람',   hint: '⛄ 쌓인 눈을 누른 채 굴려 눈덩이를 만들고, 집어서 다른 눈덩이 위에 올려요' },
];
const TOOL_KEYS = { h: 'hand', b: 'broom', p: 'plow', s: 'ball' };

let tool = 'hand';
const balls = [];   // {s, rx, r, rot, below, above, loose, carried, x, y, vx, vy}
const plows = [];   // {s, rx, dir, size, carry, front, t}
const play = { down: false, mode: null, ball: null, grabDX: 0, grabDY: 0 };
const ballMax = 64;

/* ---------- toolbar + toast ---------- */
const toolbar = document.getElementById('toolbar');
TOOLS.forEach((t) => {
  const b = document.createElement('button');
  b.dataset.tool = t.key; b.title = t.name;
  b.innerHTML = `<span>${t.icon}</span><em>${t.name}</em>`;
  b.addEventListener('click', () => setTool(t.key));
  toolbar.appendChild(b);
});
if (NATIVE) {
  const done = document.createElement('button');
  done.className = 'done'; done.innerHTML = '<span>✓</span><em>다 놀았어요</em>';
  done.addEventListener('click', () => setTool('hand'));
  toolbar.appendChild(done);
}

const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg, ms = 2600) {
  if (!msg) return;
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function setTool(key) {
  if (!TOOLS.find((t) => t.key === key)) return;
  tool = key;
  play.down = false; play.mode = null;
  const root = document.documentElement;
  TOOLS.forEach((t) => root.classList.toggle('tool-' + t.key, t.key === key));
  root.classList.toggle('playing', key !== 'hand');
  toolbar.querySelectorAll('button[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === key));
  toast(TOOLS.find((t) => t.key === key).hint);
  if (NATIVE) window.webkit.messageHandlers.mongle.postMessage({ type: 'tool', tool: key });
}
window.setTool = setTool;

addEventListener('keydown', (e) => {
  if (e.target.isContentEditable || e.target.tagName === 'INPUT') return;
  const k = TOOL_KEYS[e.key.toLowerCase()];
  if (k) setTool(k);
  if (e.key === 'Escape') setTool('hand');
});

/* ---------- geometry helpers ---------- */
function activeSurfaces() { return collisionOrder(); }   // dock, windows (front→back), ground

// surface whose snow line is near (x, y)
function surfaceNear(x, y, above = 34, below = 22) {
  for (const { s, occ } of activeSurfaces()) {
    if (x < s.x || x > s.x + s.w) continue;
    const L = s.line(x);
    if (y < L - above || y > L + below) continue;
    if (occ.some((o) => x >= o.x && x <= o.x + o.w && L >= o.y - 2 && L <= o.y + o.h)) continue;
    return s;
  }
  return null;
}

function isActive(s) { return s === groundSurface || s === dockSurface || wins.some((w) => w.surface === s); }

function chainOf(b) { const out = []; for (let c = b; c; c = c.above) out.push(c); return out; }
function baseOf(b) { let c = b; while (c.below) c = c.below; return c; }

function layoutBalls() {
  for (const b of balls) {
    if (b.below) continue;
    if (b.s && !b.loose && !b.carried) {
      b.x = b.s.x + b.rx;
      b.y = b.s.line(b.x) - b.r + Math.min(3, b.r * .12);
    }
    let prev = b;
    for (let c = b.above; c; c = c.above) {
      c.x = prev.x; c.y = prev.y - prev.r - c.r * .78;
      prev = c;
    }
  }
}

function ballAt(x, y) {
  let best = null;
  for (const b of balls) {
    if (b.s && !isActive(baseOf(b).s) && !baseOf(b).loose && !baseOf(b).carried) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < b.r + 4 && (!best || b.r < best.r)) best = b;
  }
  return best;
}

function takeSnow(s, x0, x1, rate) {
  const h = s.snow;
  const c0 = Math.max(0, s.col(x0)), c1 = Math.min(h.length - 1, s.col(x1));
  let got = 0;
  for (let c = c0; c <= c1; c++) { const t = Math.min(h[c], rate); h[c] -= t; got += t; }
  if (got) s.dirty = true;
  return got;
}

function puff(x, y, n, vx = 0) {
  for (let i = 0; i < n; i++) spawnSnow(x + rand(-6, 6), y - rand(0, 4), vx + rand(-1.5, 1.5), -rand(.5, 2.5), rand(1, 2.4));
}

function loosen(b, vx, vy) {
  b.s = null; b.loose = true; b.vx = vx; b.vy = vy;
}

/* ---------- pointer handling ---------- */
function onDown(e) {
  if (tool === 'hand') return;
  if (e.target.closest('#menubar, #panel, #toolbar, #dock')) return;
  e.preventDefault(); e.stopPropagation();
  const x = e.clientX, y = e.clientY;
  pointer.x = x; pointer.y = y;
  play.down = true;

  if (tool === 'broom') { play.mode = 'sweep'; return; }

  if (tool === 'plow') {
    const s = surfaceNear(x, y, 60, 40) || (y > H - 90 ? groundSurface : null);
    if (!s) { toast('🚜 창 위쪽 가장자리나 화면 바닥을 눌러 주세요', 1800); return; }
    const size = s === groundSurface ? 46 : s === dockSurface ? 26 : 30;
    const dir = x - s.x < s.w / 2 ? 1 : -1;
    for (let i = plows.length - 1; i >= 0; i--) if (plows[i].s === s) plows.splice(i, 1);
    const rx = dir > 0 ? size * .5 : s.w - size * .5;
    plows.push({ s, rx, dir, size, carry: 0, front: rx + dir * size * .5, t: 0 });
    return;
  }

  if (tool === 'ball') {
    const hit = ballAt(x, y);
    if (hit) {                       // pick up this ball (and anything on it)
      const base = baseOf(hit);
      if (hit !== base) { hit.below.above = null; hit.below = null; }
      else { hit.s = null; hit.loose = false; }
      hit.carried = true;
      play.mode = 'carry'; play.ball = hit; play.grabDX = hit.x - x; play.grabDY = hit.y - y;
      return;
    }
    const s = surfaceNear(x, y);
    if (s && s.heightAt(x) >= .8) {
      const b = { s, rx: x - s.x, r: 7, rot: 0, below: null, above: null, loose: false, carried: false, x, y, vx: 0, vy: 0 };
      takeSnow(s, x - 8, x + 8, 2.5);
      balls.push(b);
      play.mode = 'roll'; play.ball = b;
      return;
    }
    toast('⛄ 눈이 쌓인 곳을 눌러서 굴려 주세요', 1800);
  }
}

function onUp() {
  if (!play.down) return;
  play.down = false;
  const b = play.ball;
  if (play.mode === 'carry' && b) {
    b.carried = false;
    // stack on another ball?
    let target = null;
    for (const o of balls) {
      if (o === b || chainOf(b).includes(o) || o.above) continue;
      if (Math.abs(o.x - b.x) < (o.r + b.r) * .7 && b.y < o.y + o.r * .3 && b.y > o.y - o.r - b.r * 2.2) {
        if (!target || o.y < target.y) target = o;
      }
    }
    if (target) {
      b.below = target; target.above = b; b.loose = false; b.s = null;
      const n = chainOf(baseOf(target)).length;
      if (n === 2) toast('☃️ 눈사람 완성! 하나 더 올리면 모자도 씌워 줄게요');
      else if (n === 3) toast('🎩 멋쟁이 눈사람이 됐어요!');
      else if (n > 3) toast('🗼 와, 눈사람 탑이에요!');
    } else {
      loosen(b, pointer.vx * .5, pointer.vy * .5);
    }
  }
  play.mode = null; play.ball = null;
}

addEventListener('pointerdown', onDown, { capture: true });
addEventListener('pointerup', onUp, { capture: true });
addEventListener('pointercancel', onUp, { capture: true });

document.getElementById('clear-all').addEventListener('click', () => { balls.length = 0; plows.length = 0; });

/* ---------- update (called every frame from app.js) ---------- */
function toolsUpdate(k) {
  const psp = Math.hypot(pointer.vx, pointer.vy);

  // 🧹 broom: sweep snow off whatever it brushes
  if (tool === 'broom' && play.down && psp > .4) {
    for (const { s } of activeSurfaces()) {
      if (pointer.x < s.x - 20 || pointer.x > s.x + s.w + 20) continue;
      const L = s.line(pointer.x);
      if (pointer.y < L - 36 || pointer.y > L + 26) continue;
      const got = takeSnow(s, pointer.x - 22, pointer.x + 22, Math.min(4, .6 + psp * .35) * k);
      for (let a = got; a > 0; a -= 1.3)
        spawnSnow(pointer.x + rand(-18, 18), L - rand(0, 6), pointer.vx * rand(.4, .9) + rand(-1, 1), Math.min(-.5, pointer.vy * .3) - rand(1, 3.5), rand(1, 2.6));
      for (let i = s.rest.length - 1; i >= 0; i--) {
        const r = s.rest[i];
        if (Math.abs(s.x + r.rx - pointer.x) < 24) { detachRest(s, r, pointer.vx * .6 + rand(-1, 1), -rand(1, 3)); s.rest.splice(i, 1); s.dirty = true; }
      }
    }
    for (const b of balls) {                    // nudge snowballs along
      if (b.below || !b.s || b.loose) continue;
      if (Math.abs(b.x - pointer.x) < b.r + 18 && Math.abs(b.y - pointer.y) < b.r + 20) {
        const before = b.rx;
        b.rx = clamp(b.rx + pointer.vx * .5 * k, b.r * .4, b.s.w - b.r * .4);
        b.rot += (b.rx - before) / b.r;
      }
    }
  }

  // ⛄ rolling: the ball follows the pointer along its surface and grows
  if (play.mode === 'roll' && play.ball) {
    const b = play.ball, s = b.s;
    if (!s || !isActive(s)) { play.mode = null; }
    else {
      const target = clamp(pointer.x - s.x, b.r * .4, s.w - b.r * .4);
      const step = clamp(target - b.rx, -14 * k, 14 * k);
      if (Math.abs(step) > .05) {
        b.rx += step; b.rot += step / b.r;
        const x = s.x + b.rx;
        const got = takeSnow(s, x - b.r * .6, x + b.r * .6, Math.min(3, .25 + Math.abs(step) * .18));
        b.r = Math.min(ballMax, Math.sqrt(b.r * b.r + got * COL * 1.1 / Math.PI));
        if (b.r >= ballMax && Math.random() < .1) puff(x, s.y - 2, 2, -Math.sign(step));
      }
    }
  }

  // carried ball follows the pointer
  if (play.mode === 'carry' && play.ball) {
    const b = play.ball;
    b.x = pointer.x + play.grabDX; b.y = pointer.y + play.grabDY;
  }

  // loose balls fall until they land
  const order = activeSurfaces();
  for (const b of balls) {
    if (!b.loose) continue;
    b.vy += .45 * k; b.vx *= .99;
    const prevBottom = b.y + b.r;
    b.x += b.vx * k; b.y += b.vy * k;
    b.rot += b.vx * k / b.r;
    const p = { x: b.x, py: prevBottom, y: b.y + b.r };
    const hit = b.vy > 0 && collide(p, order);
    if (hit) {
      b.loose = false; b.s = hit.s; b.rx = clamp(b.x - hit.s.x, 0, hit.s.w); b.vx = b.vy = 0;
      puff(b.x, hit.y, Math.min(12, b.r / 2 | 0));
    } else if (b.y > H + 200) { b.loose = false; b.dead = true; }
  }

  // windows: balls ride along; a hard fling throws them off; closed windows drop them
  for (const b of balls) {
    if (!b.s || b.below || b.loose || b.carried || b.s.kind !== 'win') continue;
    if (!isActive(b.s)) { if (!NATIVE) loosen(b, 0, 0); continue; }   // native: parked on another Space
    const sp = Math.hypot(b.s.vx, b.s.vy);
    if (sp > 9) loosen(b, b.s.vx * .8, b.s.vy * .8 - 2);
  }

  // 🚜 plows
  for (let i = plows.length - 1; i >= 0; i--) {
    const pl = plows[i], s = pl.s;
    if (!isActive(s)) { plows.splice(i, 1); continue; }
    pl.t += k;
    const speed = (s === groundSurface ? 2.6 : 1.8) * k;
    pl.rx += pl.dir * speed;
    const front = pl.rx + pl.dir * pl.size * .5;
    const a = Math.min(pl.front, front), bnd = Math.max(pl.front, front);
    pl.carry += takeSnow(s, s.x + a, s.x + bnd, 999);
    pl.front = front;
    for (let j = s.rest.length - 1; j >= 0; j--) {
      const r = s.rest[j];
      if (r.rx >= a - 4 && r.rx <= bnd + 4) { detachRest(s, r, pl.dir * rand(2, 4), -rand(1, 3)); s.rest.splice(j, 1); s.dirty = true; }
    }
    for (const b of balls) {                       // shove snowballs ahead
      if (b.s !== s || b.below || b.loose) continue;
      const lead = front + pl.dir * b.r * .9;
      if (pl.dir > 0 ? b.rx < lead && b.rx > pl.rx : b.rx > lead && b.rx < pl.rx) { b.rot += (lead - b.rx) / b.r; b.rx = lead; }
      if (b.rx < -b.r * .3 || b.rx > s.w + b.r * .3) loosen(b, pl.dir * 2.5, -1);
    }
    if (pl.carry > 30 && Math.random() < .25 * k) spawnSnow(s.x + front, s.y - 8, pl.dir * rand(1, 3), -rand(1.5, 3), rand(1, 2.4));
    if (front < -2 || front > s.w + 2) {           // dump it over the edge
      if (s !== groundSurface) {
        const ex = s.x + (pl.dir > 0 ? s.w + 3 : -3);
        for (let n = Math.min(260, pl.carry / 1.1); n > 0; n--) spawnSnow(ex + rand(-4, 4), s.y - rand(0, 14), pl.dir * rand(.5, 2.5), rand(-1.5, .5), rand(1.2, 2.8));
      }
      pl.carry = 0;
    }
    if (pl.rx < -pl.size || pl.rx > s.w + pl.size) plows.splice(i, 1);
  }

  for (let i = balls.length - 1; i >= 0; i--) if (balls[i].dead) {
    const b = balls[i];
    if (b.above) b.above.below = null;
    balls.splice(i, 1);
  }
  layoutBalls();
}

/* ---------- drawing ---------- */
function drawBall(c, b) {
  const g = c.createRadialGradient(b.x - b.r * .35, b.y - b.r * .4, b.r * .1, b.x, b.y, b.r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(.72, '#eef3fb'); g.addColorStop(1, '#c4d2e8');
  c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill();
  c.save(); c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.clip();
  c.strokeStyle = 'rgba(140,165,200,.35)'; c.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a = b.rot + i * 1.57;
    c.beginPath(); c.arc(b.x + Math.cos(a) * b.r * .5, b.y + Math.sin(a) * b.r * .5, b.r * .16, 0, 7); c.stroke();
  }
  c.restore();
}

function drawSnowman(c, chain) {
  const base = chain[0], n = chain.length;
  if (!base.loose && !base.carried) {
    c.fillStyle = 'rgba(40,60,90,.18)';
    c.beginPath(); c.ellipse(base.x, base.y + base.r * .92, base.r * .9, base.r * .15, 0, 0, 7); c.fill();
  }
  // arms go behind the body
  if (n >= 2) {
    const m = chain[Math.max(0, n - 2)];
    c.strokeStyle = '#6b4226'; c.lineCap = 'round'; c.lineWidth = Math.max(1.5, m.r * .07);
    for (const d of [-1, 1]) {
      const sx = m.x + d * m.r * .7, sy = m.y - m.r * .2, ex = m.x + d * m.r * 1.65, ey = m.y - m.r * .85;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey);
      c.moveTo(sx + (ex - sx) * .7, sy + (ey - sy) * .7); c.lineTo(ex + d * m.r * .05, ey + m.r * .25);
      c.stroke();
    }
  }
  chain.forEach((b) => drawBall(c, b));
  if (n < 2) return;
  const top = chain[n - 1], mid = chain[n - 2], r = top.r;
  // buttons
  c.fillStyle = '#2b2d3a';
  const bs = mid.r * .09;
  for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(mid.x, mid.y + i * mid.r * .32, Math.max(1.3, bs), 0, 7); c.fill(); }
  // scarf
  c.fillStyle = '#e8484f';
  c.beginPath(); c.ellipse(top.x, top.y + r * .86, r * .88, r * .17, 0, 0, 7); c.fill();
  c.beginPath(); c.roundRect(top.x + r * .25, top.y + r * .86, r * .28, r * .7, r * .08); c.fill();
  // face
  c.fillStyle = '#2b2d3a';
  for (const d of [-1, 1]) { c.beginPath(); c.arc(top.x + d * r * .32, top.y - r * .16, Math.max(1.4, r * .09), 0, 7); c.fill(); }
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (.25 + i * .125);
    c.beginPath(); c.arc(top.x + Math.cos(a) * r * .45, top.y + r * .05 + Math.sin(a) * r * .38, Math.max(.9, r * .045), 0, 7); c.fill();
  }
  c.fillStyle = 'rgba(255,140,170,.45)';
  for (const d of [-1, 1]) { c.beginPath(); c.ellipse(top.x + d * r * .55, top.y + r * .12, r * .14, r * .08, 0, 0, 7); c.fill(); }
  c.fillStyle = '#ff8a2a';
  c.beginPath(); c.moveTo(top.x - r * .02, top.y - r * .04); c.lineTo(top.x + r * .6, top.y + r * .08); c.lineTo(top.x - r * .02, top.y + r * .18); c.closePath(); c.fill();
  // top hat once there are three
  if (n >= 3) {
    c.fillStyle = '#23242e';
    c.beginPath(); c.roundRect(top.x - r * .78, top.y - r * .93, r * 1.56, r * .14, r * .06); c.fill();
    c.beginPath(); c.roundRect(top.x - r * .48, top.y - r * 1.62, r * .96, r * .74, r * .08); c.fill();
    c.fillStyle = '#e8484f'; c.fillRect(top.x - r * .48, top.y - r * 1.06, r * .96, r * .13);
  }
}

function drawPlow(c, pl) {
  const s = pl.s, x = s.x + pl.rx, y = s.y + 1 + Math.sin(pl.t * .5) * .6;
  // snow piled against the blade
  if (pl.carry > .5) {
    const w = Math.min(pl.size * .9, 5 + Math.sqrt(pl.carry) * 1.6), h = Math.min(pl.size * .75, 3 + Math.sqrt(pl.carry) * 1.3);
    const fx = s.x + pl.front + pl.dir * w * .45;
    c.fillStyle = '#f7faff';
    c.beginPath(); c.ellipse(fx, y, w * .6, h, 0, Math.PI, 0); c.fill();
  }
  c.save();
  c.translate(x, y);
  if (pl.dir > 0) c.scale(-1, 1);          // the emoji faces left
  c.font = `${pl.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'bottom';
  c.fillText('🚜', 0, pl.size * .1);
  c.restore();
}

function drawCursor(c) {
  if (tool !== 'broom' || !pointer.inside) return;
  c.save();
  c.translate(pointer.x, pointer.y);
  c.rotate(clamp(pointer.vx * .04, -.5, .5) + (play.down ? .15 : 0));
  c.font = '38px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('🧹', 8, -12);
  c.restore();
}

function stacks(filter) {
  return balls.filter((b) => !b.below && filter(b)).map(chainOf);
}

// on the effects canvas
function toolsRender(c) {
  if (!NATIVE) {
    for (const pl of plows) drawPlow(c, pl);
    for (const ch of stacks((b) => b.loose || b.carried || (b.s && isActive(b.s)))) drawSnowman(c, ch);
  } else {
    for (const ch of stacks((b) => b.loose || b.carried)) drawSnowman(c, ch);
  }
  drawCursor(c);
}

// native: drawn per surface in z-order so windows in front hide them
function toolsPaintSurface(c, s) {
  for (const pl of plows) if (pl.s === s) drawPlow(c, pl);
  for (const ch of stacks((b) => b.s === s && !b.loose && !b.carried)) drawSnowman(c, ch);
}
