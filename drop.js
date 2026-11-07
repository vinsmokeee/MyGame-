// SOMA Drop: a Plinko-style game in the SOMA lobby. It uses the same account and the same
// Nu balance as Lucky Spin (window.LuckySpin is the shared wallet), so recharges and Nu added
// by the team work in every game.
(() => {
  'use strict';
  const game = window.LuckySpin;
  if (!game) return;

  // ---------- settings ----------
  // Slots from left to right (13 slots, 12 rows of pins). m = multiple of the bet, p = chance per drop.
  // JACKPOT in the middle, prizes getting smaller towards the edges. Each slot's chance is set directly
  // (the ball's bounce path is then drawn to that slot). Totals per drop: ×0.5 85.4%, ×2 10.7%,
  // ×3 3.2%, ×5 0.59%, JACKPOT 1 in 2,048. Players get back about 82% of their bets over time
  // (plus the shared free bonus every 10 plays).
  const P05 = 3498 / 4096 / 6;
  const P2 = 440 / 4096 / 2;
  const P3 = 132 / 4096 / 2;
  const P5 = 24 / 4096 / 2;
  const PJP = 2 / 4096;
  const SLOTS = [
    { t: '×0.5', m: 0.5, p: P05 }, { t: '×0.5', m: 0.5, p: P05 }, { t: '×0.5', m: 0.5, p: P05 },
    { t: '×2', m: 2, p: P2 }, { t: '×3', m: 3, p: P3 }, { t: '×5', m: 5, p: P5 },
    { t: 'JACKPOT', m: 100, p: PJP },
    { t: '×5', m: 5, p: P5 }, { t: '×3', m: 3, p: P3 }, { t: '×2', m: 2, p: P2 },
    { t: '×0.5', m: 0.5, p: P05 }, { t: '×0.5', m: 0.5, p: P05 }, { t: '×0.5', m: 0.5, p: P05 },
  ];
  const BETS = [20, 50, 100, 500];
  const MAX_BALLS = 6; // balls in the air at once

  // Same casino colours as the Lucky Spin wheel.
  const slotColor = (m) => (m >= 100 ? ['#8a6414', '#f4d27c'] : m >= 5 ? ['#7a1426', '#c0263f']
    : m >= 3 ? ['#5e0f1c', '#9e1d33'] : m >= 2 ? ['#06301f', '#0f6b44'] : ['#15171e', '#2a2d36']);
  const slotText = (m) => (m >= 100 ? '#2a1d00' : m <= 0.5 ? '#a3a7b0' : '#fbf3df');

  // Prizes listed in the shared Note pop-up (the winning slots, smallest to largest).
  window.SOMA_PRIZES = window.SOMA_PRIZES || [];
  window.SOMA_PRIZES.push({
    title: '🎯 SOMA Drop',
    prizes: (b) => [...new Set(SLOTS.filter((s) => s.m > 1).map((s) => s.m))].sort((x, y) => x - y).map((m) => Math.floor(b * m)),
  });

  const $ = (id) => document.getElementById(id);
  const fmtNu = (n) => 'Nu ' + Math.floor(n).toLocaleString('en-US');
  let bet = BETS[0];

  // ---------- message + prize table ----------
  const msgEl = $('dropMessage');
  const say = (text, cls = '') => { msgEl.textContent = text; msgEl.className = 'message' + (cls ? ' ' + cls : ''); };

  (function buildPrizes() {
    const kinds = [];
    for (const s of SLOTS) if (!kinds.some((k) => k.m === s.m)) kinds.push(s);
    kinds.sort((a, b) => b.m - a.m);
    const tr = document.createElement('tr');
    for (const text of ['Bet', ...kinds.map((k) => k.t)]) {
      const th = document.createElement('th');
      th.textContent = text;
      if (text === 'JACKPOT') th.className = 'jp';
      tr.append(th);
    }
    $('payHead').append(tr);
    for (const b of BETS) {
      const row = document.createElement('tr');
      const first = document.createElement('td');
      first.textContent = 'Nu ' + b;
      row.append(first);
      for (const k of kinds) {
        const td = document.createElement('td');
        td.textContent = Math.floor(b * k.m).toLocaleString('en-US');
        if (k.m >= 100) td.className = 'jp';
        row.append(td);
      }
      $('payBody').append(row);
    }
  })();

  document.querySelectorAll('#dropBets button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#dropBets button').forEach((x) => x.classList.toggle('on', x === b));
      bet = Number(b.dataset.bet);
      say(`Bet ${fmtNu(bet)}. Press DROP.`);
    });
  });

  // ---------- board ----------
  const W = 360;
  const H = 520;
  const N = SLOTS.length;
  const ROWS = N - 1;
  const CW = W / N;
  const PIN_R = 3.5;
  const BALL_R = 6.5;
  const SLOT_TOP = 440;
  const LAND_Y = 494;
  const HOP_FRAMES = 14;
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = W + ' / ' + H;
  ctx.scale(dpr, dpr);

  const pinY = (r) => 50 + r * 31;
  const pinX = (r, m) => W / 2 + (2 * m - r) * (CW / 2);
  const pins = [];
  for (let r = 0; r < ROWS; r++) for (let m = 0; m <= r; m++) pins.push({ x: pinX(r, m), y: pinY(r) });

  // Fair left/right flips at each row, from the browser's secure random numbers.
  // Secure random number in [0, 1).
  function rand() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  // Pick the slot by its chance, then a random bounce path that ends there
  // (slot k = k bounces to the right out of 12 rows, in a random order).
  function pickSlot() {
    const total = SLOTS.reduce((s, x) => s + x.p, 0);
    let r = rand() * total;
    for (let i = 0; i < SLOTS.length; i++) { r -= SLOTS[i].p; if (r < 0) return i; }
    return 0;
  }
  function pathTo(slot) {
    const path = Array.from({ length: ROWS }, (_, i) => (i < slot ? 1 : 0));
    for (let i = path.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [path[i], path[j]] = [path[j], path[i]];
    }
    return path;
  }

  let balls = [];
  let pops = [];
  const flash = {};

  function dropBall() {
    if (balls.filter((b) => !b.done).length >= MAX_BALLS) return;
    const paid = game.spend(bet);
    if (!paid.ok) {
      say(game.nu < BETS[0] ? 'You are out of Nu. Open ☰ Menu → Recharge Nu to top up.' : `Not enough Nu for a ${fmtNu(bet)} bet. Pick a smaller one.`, 'lose');
      return;
    }
    const slot = pickSlot();
    const path = pathTo(slot);
    const pts = [{ x: W / 2, y: 14 }];
    let k = 0;
    for (let r = 0; r < ROWS; r++) {
      pts.push({ x: pinX(r, k) + (Math.random() - 0.5) * 2, y: pinY(r) - PIN_R - BALL_R });
      k += path[r];
    }
    pts.push({ x: (slot + 0.5) * CW, y: LAND_Y });
    balls.push({ bet, slot, bonusDue: paid.bonusDue, pts, seg: 0, f: 0, x: W / 2, y: 14, done: false, fade: 1 });
    startLoop();
  }
  $('dropBtn').addEventListener('click', dropBall);
  canvas.addEventListener('click', dropBall);

  function step(b) {
    b.f += 1;
    const a = b.pts[b.seg];
    const c = b.pts[b.seg + 1];
    const last = b.seg === b.pts.length - 2;
    const frames = last ? 22 : b.seg === 0 ? 12 : HOP_FRAMES;
    const t = Math.min(1, b.f / frames);
    b.x = a.x + (c.x - a.x) * t;
    b.y = a.y + (c.y - a.y) * (last ? t * t : t) - (last ? 0 : 7 * 4 * t * (1 - t));
    if (t >= 1) {
      b.seg += 1;
      b.f = 0;
      if (b.seg >= b.pts.length - 1) land(b);
    }
  }

  function land(b) {
    if (b.done) return;
    b.done = true;
    b.x = b.pts[b.pts.length - 1].x;
    b.y = LAND_Y;
    const slot = SLOTS[b.slot];
    const payout = Math.floor(b.bet * slot.m);
    game.settle({ payout, net: payout - b.bet, label: `Drop ${slot.t}`, bonusDue: b.bonusDue });
    flash[b.slot] = 1;
    pops.push({ x: Math.max(30, Math.min(W - 30, (b.slot + 0.5) * CW)), y: LAND_Y - 22, t: 1, txt: '+' + fmtNu(payout), c: slotColor(slot.m)[1] });
    let text;
    if (slot.m >= 100) { text = `🎉 JACKPOT! You won ${fmtNu(payout)}!`; game.celebrate('jackpot'); say(text, 'jackpot'); }
    else if (payout > b.bet) { text = `${slot.t}! You won ${fmtNu(payout)}.`; game.celebrate(slot.m >= 5 ? 'big' : 'win'); say(text, 'win'); }
    else { text = `${slot.t}: ${fmtNu(payout)} back.`; say(text, 'lose'); }
    if (b.bonusDue) say(`${text} +${fmtNu(game.bonusNu)} bonus for ${game.bonusEvery} plays!`, slot.m >= 100 ? 'jackpot' : 'win');
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b1d24');
    g.addColorStop(1, '#0b0c10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // slots
    for (let i = 0; i < N; i++) {
      const sl = SLOTS[i];
      const x = i * CW;
      const f = flash[i] || 0;
      const [c0, c1] = slotColor(sl.m);
      const sg = ctx.createLinearGradient(0, SLOT_TOP, 0, H);
      sg.addColorStop(0, c1);
      sg.addColorStop(1, c0);
      ctx.fillStyle = sg;
      ctx.globalAlpha = 0.85 + f * 0.15;
      roundRect(x + 1.5, SLOT_TOP + 8, CW - 3, H - SLOT_TOP - 12, 5);
      ctx.fill();
      if (f) {
        ctx.globalAlpha = f * 0.6;
        ctx.fillStyle = '#fff3c4';
        roundRect(x + 1.5, SLOT_TOP + 8, CW - 3, H - SLOT_TOP - 12, 5);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = slotText(sl.m);
      if (sl.m >= 100) {
        ctx.font = '800 7px system-ui, sans-serif';
        ctx.fillText('JACK', x + CW / 2, H - 30);
        ctx.fillText('POT', x + CW / 2, H - 20);
      } else {
        ctx.font = '800 10px system-ui, sans-serif';
        ctx.fillText(sl.t, x + CW / 2, H - 26);
      }
      if (flash[i]) flash[i] = Math.max(0, f - 0.03);
    }
    // gold slot dividers and pins
    ctx.strokeStyle = 'rgba(232, 196, 106, .75)';
    ctx.lineWidth = 1.5;
    for (let k = 1; k < N; k++) {
      ctx.beginPath();
      ctx.moveTo(k * CW, SLOT_TOP);
      ctx.lineTo(k * CW, H - 4);
      ctx.stroke();
    }
    for (const p of pins) {
      const pg = ctx.createRadialGradient(p.x - 1, p.y - 1, 0.5, p.x, p.y, PIN_R);
      pg.addColorStop(0, '#fff1c4');
      pg.addColorStop(1, '#b8862a');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PIN_R, 0, 7);
      ctx.fill();
    }
    // balls
    for (const b of balls) {
      ctx.globalAlpha = b.fade;
      const gr = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.4, '#f4d27c');
      gr.addColorStop(1, '#8a6414');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const p of pops) {
      ctx.globalAlpha = Math.max(0, p.t);
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(p.txt, p.x, p.y);
      ctx.fillStyle = '#fbf3df';
      ctx.fillText(p.txt, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }

  // Animate only while something is moving (saves battery).
  let looping = false;
  function loop() {
    for (const b of balls) if (!b.done) step(b);
    for (const b of balls) if (b.done) b.fade -= 0.02;
    balls = balls.filter((b) => b.fade > 0);
    for (const p of pops) { p.t -= 0.015; p.y -= 0.5; }
    pops = pops.filter((p) => p.t > 0);
    draw();
    const busy = balls.length || pops.length || Object.values(flash).some((v) => v > 0);
    if (busy) requestAnimationFrame(loop);
    else looping = false;
  }
  function startLoop() {
    if (!looping) { looping = true; requestAnimationFrame(loop); }
  }

  window.addEventListener('soma:view', (e) => { if (e.detail === 'drop') draw(); });
  draw();
})();
