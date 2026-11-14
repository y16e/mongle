/* Mongle scenes — procedural wallpapers (shared by the demo, the site and the Mac app) */
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/* =========================================================
   Scenes (procedural wallpapers)
   ========================================================= */
const SCENES = {
  dawn:     { name: '새벽',     sky: ['#1b2550', '#5b4a86', '#e59a86'], stars: .35, body: { t: 'sun', x: .72, y: .66, r: .028, c: '#ffd6b0', g: 'rgba(255,170,140,.45)' }, mtn: ['#4a3f6e', '#2e2850', '#1a1732'] },
  sunrise:  { name: '일출',     sky: ['#4a5da8', '#f2a27a', '#ffe1a8'], body: { t: 'sun', x: .3, y: .6, r: .045, c: '#fff4d8', g: 'rgba(255,200,140,.55)' }, mtn: ['#9a7392', '#664c70', '#3a2d4a'] },
  morning:  { name: '아침',     sky: ['#5aa6e6', '#9fd0f2', '#e9f6fd'], body: { t: 'sun', x: .78, y: .2, r: .035, c: '#fffbea', g: 'rgba(255,250,220,.6)' }, mtn: ['#8fb1cc', '#6890b0', '#456b8a'] },
  noon:     { name: '한낮',     sky: ['#1f7fd8', '#5fb2ef', '#c9e8fb'], body: { t: 'sun', x: .5, y: .1, r: .035, c: '#ffffff', g: 'rgba(255,255,240,.7)' }, mtn: ['#7aa6c6', '#5482a6', '#355f80'], trees: 'round', treeColors: ['#3f7a4a', '#4f8c55', '#33683d'] },
  golden:   { name: '골든 아워', sky: ['#d97a3e', '#f3b46b', '#fde3ad'], body: { t: 'sun', x: .68, y: .5, r: .04, c: '#fff1c8', g: 'rgba(255,210,120,.6)' }, mtn: ['#c07a52', '#8d5038', '#55302a'] },
  sunset:   { name: '일몰',     sky: ['#2b2358', '#a8466a', '#f39457'], body: { t: 'sun', x: .42, y: .62, r: .055, c: '#ffcf8a', g: 'rgba(255,140,90,.6)' }, mtn: ['#7a3a5e', '#4a2645', '#25152b'] },
  dusk:     { name: '해 질 녘', sky: ['#11173a', '#33305f', '#7e5578'], stars: .6, mtn: ['#3e3259', '#28203f', '#141026'] },
  night:    { name: '밤',       sky: ['#050817', '#0c1638', '#1b2a58'], stars: 1, body: { t: 'moon', x: .78, y: .18, r: .03, c: '#fdf6dc', g: 'rgba(200,215,255,.35)' }, mtn: ['#1f2a4c', '#151d38', '#0b1022'] },
  winter:   { name: '겨울',     sky: ['#0b1430', '#1e2f5e', '#4a6694'], stars: .8, body: { t: 'moon', x: .82, y: .16, r: .03, c: '#fdf6dc', g: 'rgba(200,215,255,.4)' }, mtn: ['#3d5683', '#253a63', '#13213f'], snowcaps: true, trees: 'pine', treeColors: ['#0d1a33', '#102040'] },
  rain:     { name: '비',       sky: ['#3d4652', '#5d6773', '#8a939c'], fog: true, mtn: ['#6e7984', '#555f6a', '#3a424c'], trees: 'pine', treeColors: ['#2f3740', '#353e48'] },
  stars:    { name: '별',       sky: ['#02030b', '#0a0f2b', '#1a1a45'], stars: 2.6, milky: true, mtn: ['#13163a', '#0c0e28', '#050616'] },
  fireflies:{ name: '반딧불이', sky: ['#06120f', '#0d2a24', '#1f4a3a'], stars: .45, body: { t: 'moon', x: .2, y: .16, r: .022, c: '#f4f8dc', g: 'rgba(200,255,200,.25)' }, mtn: ['#123a30', '#0b2820', '#051510'], trees: 'pine', treeColors: ['#03100b', '#061a12'], glow: true },
  autumn:   { name: '가을',     sky: ['#e0864a', '#f2b878', '#fbe3bb'], body: { t: 'sun', x: .25, y: .3, r: .04, c: '#fff4dc', g: 'rgba(255,220,150,.55)' }, mtn: ['#c9784a', '#9a4c2c', '#5e2a1c'], trees: 'round', treeColors: ['#d9541e', '#e88a2a', '#b8341a', '#f0b23a'] },
  spring:   { name: '봄',       sky: ['#8ec5f0', '#f6c9d8', '#fde7ee'], body: { t: 'sun', x: .8, y: .2, r: .035, c: '#fffaf0', g: 'rgba(255,240,240,.6)' }, mtn: ['#a9bdd4', '#8aa2bd', '#7a9a6e'], trees: 'round', treeColors: ['#f7a8c4', '#f4bdd2', '#ee8fb3', '#fbd3e1'] },
};
const SCENE_KEYS = ['auto', ...Object.keys(SCENES)];

function sceneForHour(h) {
  if (h >= 4 && h < 6) return 'dawn';
  if (h >= 6 && h < 8) return 'sunrise';
  if (h >= 8 && h < 11) return 'morning';
  if (h >= 11 && h < 15) return 'noon';
  if (h >= 15 && h < 17) return 'golden';
  if (h >= 17 && h < 19) return 'sunset';
  if (h >= 19 && h < 20) return 'dusk';
  return 'night';
}
const resolveScene = (k) => (k === 'auto' ? sceneForHour(new Date().getHours()) : k);

function drawScene(ctx, W, H, key) {
  const s = SCENES[key];
  const rnd = mulberry32(hashStr(key));
  const U = Math.min(W, H);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, s.sky[0]); g.addColorStop(0.55, s.sky[1]); g.addColorStop(1, s.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  if (s.milky) {
    ctx.save();
    ctx.translate(W * 0.5, H * 0.35); ctx.rotate(-0.5);
    const mg = ctx.createLinearGradient(0, -H * 0.18, 0, H * 0.18);
    mg.addColorStop(0, 'rgba(140,120,220,0)'); mg.addColorStop(.5, 'rgba(190,170,255,.22)'); mg.addColorStop(1, 'rgba(140,120,220,0)');
    ctx.fillStyle = mg; ctx.fillRect(-W, -H * 0.18, W * 2, H * 0.36);
    for (let i = 0; i < W * H / 900; i++) {
      const x = (rnd() - .5) * W * 2, y = (rnd() + rnd() + rnd() - 1.5) * H * 0.12;
      ctx.fillStyle = `rgba(255,255,255,${rnd() * .5})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  if (s.stars) {
    const n = Math.round(s.stars * W * H / 3500);
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H * 0.72;
      const r = rnd() < .04 ? rnd() * 1.4 + .8 : rnd() * .9 + .2;
      ctx.fillStyle = `rgba(255,255,255,${(rnd() * .7 + .3) * (1 - y / (H * .8))})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }

  if (s.body) {
    const b = s.body, bx = b.x * W, by = b.y * H, br = b.r * U * 1.6;
    const gg = ctx.createRadialGradient(bx, by, br * .5, bx, by, br * 7);
    gg.addColorStop(0, b.g); gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg; ctx.fillRect(bx - br * 7, by - br * 7, br * 14, br * 14);
    if (b.t === 'moon') {
      const oc = document.createElement('canvas'); oc.width = oc.height = Math.ceil(br * 2 + 4);
      const o = oc.getContext('2d'), c = oc.width / 2;
      o.fillStyle = b.c; o.beginPath(); o.arc(c, c, br, 0, 7); o.fill();
      o.globalCompositeOperation = 'destination-out';
      o.beginPath(); o.arc(c + br * .55, c - br * .25, br * .92, 0, 7); o.fill();
      ctx.drawImage(oc, bx - c, by - c);
    } else {
      ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
    }
  }

  const n = s.mtn.length;
  s.mtn.forEach((col, i) => {
    const base = H * (0.6 + i * 0.1);
    const amp = H * (0.15 - i * 0.03);
    const f = [rnd() * 2 + 1.5, rnd() * 5 + 4, rnd() * 11 + 9].map((v) => v / W);
    const p = [rnd() * 6, rnd() * 6, rnd() * 6];
    const ridge = (x) => base - amp * (0.5 + 0.5 * (0.55 * Math.sin(x * f[0] * 3.14 + p[0]) + 0.3 * Math.sin(x * f[1] * 3.14 + p[1]) + 0.15 * Math.sin(x * f[2] * 3.14 + p[2])));
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, ridge(x));
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();

    if (s.snowcaps && i < n - 1) {
      ctx.save(); ctx.clip();
      ctx.beginPath();
      const pts = [];
      for (let x = 0; x <= W + 8; x += 8) pts.push([x, ridge(x)]);
      pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y - 2) : ctx.moveTo(x, y - 2)));
      for (let j = pts.length - 1; j >= 0; j--) {
        const [x, y] = pts[j];
        const peak = (base - y) / amp; // 0..1
        const depth = Math.max(0, peak - .45) * amp * .9 * (0.8 + .4 * Math.sin(x * .05));
        ctx.lineTo(x, y + depth);
      }
      ctx.closePath(); ctx.fillStyle = 'rgba(235,242,255,.9)'; ctx.fill();
      ctx.restore();
    }

    if (s.fog) {
      const fg = ctx.createLinearGradient(0, base - amp, 0, H);
      fg.addColorStop(0, 'rgba(220,225,232,0)'); fg.addColorStop(1, 'rgba(220,225,232,.35)');
      ctx.fillStyle = fg; ctx.fillRect(0, base - amp, W, H);
    }

    if (s.trees && i === n - 1) {
      const scale = H / 900;
      for (let x = -20; x < W + 20; x += rnd() * 26 * scale + 10) {
        const gy = ridge(x) + 6;
        const th = (rnd() * 50 + 28) * scale;
        const c = s.treeColors[(rnd() * s.treeColors.length) | 0];
        if (s.trees === 'pine') {
          ctx.fillStyle = c;
          for (let k = 0; k < 3; k++) {
            const yy = gy - th * k * .28, ww = th * (.42 - k * .1);
            ctx.beginPath(); ctx.moveTo(x - ww, yy); ctx.lineTo(x, yy - th * .5); ctx.lineTo(x + ww, yy); ctx.fill();
          }
          if (s.snowcaps) { ctx.fillStyle = 'rgba(230,238,255,.75)'; ctx.beginPath(); ctx.moveTo(x - th * .1, gy - th * .64); ctx.lineTo(x, gy - th * .78); ctx.lineTo(x + th * .1, gy - th * .64); ctx.fill(); }
        } else {
          ctx.fillStyle = 'rgba(60,35,25,.8)'; ctx.fillRect(x - 1.5 * scale, gy - th * .45, 3 * scale, th * .45);
          ctx.fillStyle = c;
          for (let k = 0; k < 4; k++) {
            ctx.beginPath(); ctx.arc(x + (rnd() - .5) * th * .35, gy - th * .55 + (rnd() - .5) * th * .25, th * (.18 + rnd() * .12), 0, 7); ctx.fill();
          }
        }
      }
    }
  });

  if (s.glow) {
    for (let i = 0; i < 40; i++) {
      const x = rnd() * W, y = H * (.65 + rnd() * .33), r = rnd() * 3 + 1;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      gg.addColorStop(0, 'rgba(230,255,150,.7)'); gg.addColorStop(1, 'rgba(230,255,150,0)');
      ctx.fillStyle = gg; ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    }
  }
}

