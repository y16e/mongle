/* Mongle landing page: live mini effect cards + wallpaper gallery */
'use strict';

const CARDS = [
  { fx: 'snow', title: '❄️ 눈', text: '창 위에 소복이 쌓여요. 끌면 미끄러지고, 던지면 날아가요.', bg: ['#1e2f5e', '#4a6694'], scene: 'winter' },
  { fx: 'leaves', title: '🍂 낙엽', text: '바스락 쌓인 낙엽을 포인터로 쓸어 보세요.', bg: ['#c9784a', '#f2b878'], scene: 'autumn' },
  { fx: 'meteors', title: '🌠 별똥별', text: '창에 부딪히면 반짝이는 불꽃으로 부서져요.', bg: ['#050817', '#1a1a45'], scene: 'stars' },
  { fx: 'rain', title: '🌧️ 비', text: '닿는 곳마다 톡톡 튀고, 가끔 번개도 쳐요.', bg: ['#3d4652', '#7a838e'], scene: 'rain' },
  { fx: 'sakura', title: '🌸 벚꽃', text: '흩날리던 꽃잎이 창 위에서 잠깐 쉬어 가요.', bg: ['#d98bb0', '#f6c9d8'], scene: 'spring' },
  { fx: 'fireflies', title: '✨ 반딧불이', text: '포인터를 멈추면 은은한 불빛이 모여들어요.', bg: ['#06120f', '#1f4a3a'], scene: 'fireflies' },
];

const r = (a, b) => a + Math.random() * (b - a);
const DPR = Math.min(devicePixelRatio || 1, 2);

function makeCard(c) {
  const a = document.createElement('a');
  a.className = 'fx-card';
  a.href = `play/?fx=${c.fx}&scene=${c.scene}`;
  a.style.background = `linear-gradient(160deg, ${c.bg[0]}, ${c.bg[1]})`;
  a.innerHTML = `<canvas></canvas><div class="mini-win"></div><h3>${c.title}</h3><p>${c.text}</p><span class="try">직접 해 보기 →</span>`;
  document.getElementById('fx-grid').appendChild(a);
  return { ...c, el: a, cv: a.querySelector('canvas'), ps: [], pile: [], t: 0, visible: false, mouse: null };
}

const cards = CARDS.map(makeCard);

function sizeCard(c) {
  const b = c.el.getBoundingClientRect();
  c.w = b.width; c.h = b.height;
  c.cv.width = b.width * DPR; c.cv.height = b.height * DPR;
  const win = c.el.querySelector('.mini-win').getBoundingClientRect();
  c.win = { x: win.left - b.left, y: win.top - b.top, w: win.width };
  c.pile = new Array(Math.ceil(c.win.w / 4)).fill(0);
}

function spawn(c) {
  const { w } = c;
  switch (c.fx) {
    case 'snow': if (Math.random() < .5) c.ps.push({ x: r(0, w), y: -5, vy: r(.4, 1), r: r(1, 2.6), ph: r(0, 6) }); break;
    case 'leaves': if (Math.random() < .04) c.ps.push({ x: r(0, w), y: -10, vy: r(.6, 1), r: r(5, 8), ph: r(0, 6), col: ['#d9541e', '#f0b23a', '#c4361b'][(Math.random() * 3) | 0], rot: r(0, 6) }); break;
    case 'sakura': if (Math.random() < .08) c.ps.push({ x: r(0, w), y: -10, vy: r(.4, .8), r: r(3, 5), ph: r(0, 6), col: '#ffd0e0', rot: r(0, 6) }); break;
    case 'rain': for (let i = 0; i < 3; i++) c.ps.push({ x: r(-20, w), y: r(-30, -5), vy: r(9, 13), r: 1 }); break;
    case 'meteors': if (Math.random() < .015) c.ps.push({ x: r(-40, w * .6), y: r(-20, 30), vx: r(4, 6), vy: r(3, 5), r: 1 }); break;
    case 'fireflies': while (c.ps.length < 22) c.ps.push({ x: r(0, w), y: r(0, c.h), vx: 0, vy: 0, a: r(0, 6), ph: r(0, 6), r: 1 }); break;
  }
}

function hitWin(c, p) {
  const W = c.win;
  if (p.x < W.x || p.x > W.x + W.w) return false;
  const i = Math.floor((p.x - W.x) / 4);
  const top = W.y - (c.pile[i] || 0);
  return p.y >= top && p.y - (p.vy || 0) < top;
}

function step(c) {
  c.t++;
  spawn(c);
  const ctx = c.cv.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, c.w, c.h);
  const sparks = [];
  for (let i = c.ps.length - 1; i >= 0; i--) {
    const p = c.ps[i];
    let dead = false;
    if (c.fx === 'fireflies') {
      if (c.mouse) { p.vx += (c.mouse.x + Math.cos(p.ph + c.t * .02) * 30 - p.x) * .004; p.vy += (c.mouse.y + Math.sin(p.ph + c.t * .02) * 22 - p.y) * .004; }
      else { p.a += r(-.2, .2); p.vx += Math.cos(p.a) * .03; p.vy += Math.sin(p.a) * .03; }
      p.vx *= .97; p.vy *= .97; p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > c.w) p.vx *= -1; if (p.y < 0 || p.y > c.h) p.vy *= -1;
      const b = Math.sin(c.t * .05 + p.ph) * .5 + .5;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
      g.addColorStop(0, `rgba(240,255,170,${.3 + b * .7})`); g.addColorStop(1, 'rgba(200,255,120,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
      continue;
    }
    if (c.fx === 'meteors') { p.x += p.vx; p.y += p.vy; }
    else { p.ph += .04; p.x += Math.sin(p.ph) * (c.fx === 'snow' ? .3 : .9); p.y += p.vy; if (p.rot !== undefined) p.rot += .03; }
    if (!p.spark && !p.drop && hitWin(c, p)) {
      dead = true;
      const i2 = Math.floor((p.x - c.win.x) / 4);
      if (c.fx === 'snow') { c.pile[i2] = Math.min(14, c.pile[i2] + .5); for (let k = 0; k < c.pile.length - 1; k++) { const d = c.pile[k] - c.pile[k + 1]; if (Math.abs(d) > 1.2) { const t = (Math.abs(d) - 1.2) * .3 * Math.sign(d); c.pile[k] -= t; c.pile[k + 1] += t; } } }
      if (c.fx === 'meteors') for (let k = 0; k < 18; k++) c.ps.push({ spark: 1, x: p.x, y: p.y, vx: r(-2.5, 2.5), vy: r(-3, -.5), life: 1, r: 1 });
      if (c.fx === 'rain') for (let k = 0; k < 2; k++) c.ps.push({ drop: 1, x: p.x, y: p.y - 1, vx: r(-1.5, 1.5), vy: r(-2.5, -1), life: 1, r: 1 });
      if (c.fx === 'leaves' || c.fx === 'sakura') { p.rest = 160; p.y = c.win.y - 2; p.vy = 0; dead = false; }
    }
    if (p.rest !== undefined && p.vy === 0) { p.rest--; p.y = c.win.y - 2; p.x -= Math.sin(p.ph) * (c.fx === 'snow' ? .3 : .9); if (p.rest <= 0) dead = true; }
    if (p.spark || p.drop) { p.vy += .12; p.x += p.vx; p.y += p.vy; p.life -= .03; if (p.life <= 0) dead = true; }
    if (dead || p.y > c.h + 20 || p.x > c.w + 60) { c.ps.splice(i, 1); continue; }

    if (c.fx === 'snow') { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    else if (c.fx === 'rain') {
      ctx.strokeStyle = 'rgba(210,225,255,.6)'; ctx.lineWidth = 1;
      if (p.drop) { ctx.fillStyle = `rgba(210,225,255,${p.life})`; ctx.fillRect(p.x, p.y, 1.5, 1.5); }
      else { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 1, p.y - 12); ctx.stroke(); }
    } else if (c.fx === 'meteors') {
      if (p.spark) { ctx.fillStyle = `rgba(255,220,140,${p.life})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, 7); ctx.fill(); }
      else {
        const g = ctx.createLinearGradient(p.x, p.y, p.x - p.vx * 18, p.y - p.vy * 18);
        g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(160,190,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 18, p.y - p.vy * 18); ctx.stroke();
      }
    } else {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, p.vy ? Math.cos(p.ph * 1.3) : .6);
      ctx.globalAlpha = p.rest !== undefined && p.vy === 0 ? Math.min(1, p.rest / 40) : 1;
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .55, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
  }
  if (c.fx === 'snow') {
    const W = c.win;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(W.x, W.y);
    c.pile.forEach((h, i) => ctx.lineTo(W.x + i * 4 + 2, W.y - h));
    ctx.lineTo(W.x + W.w, W.y); ctx.fill();
  }
}

const io = new IntersectionObserver((es) => es.forEach((e) => { const c = cards.find((x) => x.el === e.target); c.visible = e.isIntersecting; }));
cards.forEach((c) => {
  io.observe(c.el);
  c.el.addEventListener('pointermove', (e) => { const b = c.el.getBoundingClientRect(); c.mouse = { x: e.clientX - b.left, y: e.clientY - b.top }; });
  c.el.addEventListener('pointerleave', () => { c.mouse = null; });
});
const sizeAll = () => cards.forEach(sizeCard);
addEventListener('resize', sizeAll);
sizeAll();
(function loop() { cards.forEach((c) => c.visible && step(c)); requestAnimationFrame(loop); })();

/* wallpaper gallery (drawScene comes from play/scenes.js) */
const grid = document.getElementById('wp-grid');
const order = ['dawn', 'sunrise', 'morning', 'noon', 'golden', 'sunset', 'dusk', 'night', 'winter', 'rain', 'stars', 'fireflies', 'autumn', 'spring'];
order.forEach((k) => {
  const a = document.createElement('a');
  a.href = `play/?scene=${k}`;
  const cv = document.createElement('canvas'); cv.width = 400; cv.height = 250;
  drawScene(cv.getContext('2d'), 400, 250, k);
  a.appendChild(cv);
  const s = document.createElement('span'); s.textContent = SCENES[k].name;
  a.appendChild(s);
  grid.appendChild(a);
});
