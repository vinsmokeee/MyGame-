// SOMA Cross: help the chicken cross 10 roads. Each road shows a prize (×0.5 to ×10). After every safe
// hop a barrier protects the chicken and the player can cash out that road's prize, or hop on. A car
// can hit the chicken on any hop. Uses the shared SOMA account and Nu balance (window.LuckySpin).
(() => {
  'use strict';
  const game = window.LuckySpin;
  if (!game) return;

  // ---------- settings ----------
  const BETS = [20, 50, 100, 500];
  const ROADS = 10;
  // Prizes on the roads: random each round. Early roads are mostly small; ×5 from road 4, ×10 from road 8.
  const TIERS = [
    { upTo: 3, w: { 0.5: 20, 1: 30, 2: 35, 3: 15 } },
    { upTo: 7, w: { 0.5: 15, 1: 20, 2: 30, 3: 20, 5: 15 } },
    { upTo: 10, w: { 1: 15, 2: 25, 3: 25, 5: 20, 10: 15 } },
  ];
  // Odds: the chance of still being safe on road i is RTP × FADE^(i-1) ÷ (highest prize reached so far,
  // at least 1). So bigger prizes sit on busier roads, and every hop is random. Simulated over a million
  // rounds per strategy: whatever a player does (even knowing every prize in advance) they get back at
  // most about 87% of their bets over time. Cashing out on the first ×2 wins about 38% of rounds.
  const RTP = 0.88;
  const FADE = 0.97;

  const $ = (id) => document.getElementById(id);
  const fmtNu = (n) => 'Nu ' + Math.floor(n).toLocaleString('en-US');
  const label = (m) => '×' + m;
  let bet = BETS[0];

  function rand() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  function pickWeighted(w) {
    const e = Object.entries(w);
    const total = e.reduce((s, [, v]) => s + v, 0);
    let r = rand() * total;
    for (const [k, v] of e) { r -= v; if (r < 0) return Number(k); }
    return Number(e[0][0]);
  }
  function newRoads() {
    const m = [];
    for (let i = 1; i <= ROADS; i++) m.push(pickWeighted(TIERS.find((t) => i <= t.upTo).w));
    const safe = []; // chance to still be safe on each road
    let top = 1;
    for (let i = 0; i < ROADS; i++) { top = Math.max(top, m[i]); safe.push(RTP * FADE ** i / top); }
    return { m, safe };
  }

  // Prize table and the shared Note
  window.SOMA_PRIZES = window.SOMA_PRIZES || [];
  window.SOMA_PRIZES.push({ id: 'cross', title: '🐔 SOMA Cross', prizes: (b) => [2, 3, 5, 10].map((x) => Math.floor(b * x)) });
  (function buildPrizes() {
    const kinds = [10, 5, 3, 2, 1, 0.5];
    const tr = document.createElement('tr');
    for (const t of ['Bet', ...kinds.map(label)]) { const th = document.createElement('th'); th.textContent = t; if (t === '×10') th.className = 'jp'; tr.append(th); }
    $('crossPayHead').append(tr);
    for (const b of BETS) {
      const row = document.createElement('tr');
      const first = document.createElement('td');
      first.textContent = 'Nu ' + b;
      row.append(first);
      for (const k of kinds) { const td = document.createElement('td'); td.textContent = Math.floor(b * k).toLocaleString('en-US'); if (k === 10) td.className = 'jp'; row.append(td); }
      $('crossPayBody').append(row);
    }
  })();

  // ---------- sounds ----------
  const sfx = {
    cluck() { // chicken hop: two quick clucks
      game.sound.slide(900, 520, 0, 0.07, 0.09, 'square');
      game.sound.slide(1100, 640, 0.09, 0.06, 0.07, 'square');
      game.sound.noise(0, 0.08, 0.03, [2500, 1800]);
    },
    clank() { // barrier drops
      game.sound.noise(0, 0.12, 0.14, [3000, 900]);
      game.sound.beep(220, 0, 0.1, 0.08, 'square');
      game.sound.beep(440, 0.02, 0.08, 0.04, 'triangle');
    },
    reveal(m) { // prize revealed: brighter for bigger prizes
      if (m >= 10) { game.sound.chime([523, 659, 784, 1047, 1319, 1568]); return; }
      if (m >= 5) { game.sound.chime([523, 659, 784, 1047, 1319]); return; }
      if (m >= 3) { game.sound.chime([659, 880, 1175]); return; }
      if (m >= 2) { game.sound.chime([587, 880]); return; }
      if (m >= 1) { game.sound.beep(523, 0.05, 0.2, 0.08); return; }
      game.sound.slide(392, 330, 0.05, 0.25, 0.08, 'triangle'); // ×0.5
    },
    whoosh(vol) { // a car rushing past nearby
      game.sound.noise(0, 0.45, vol, [300, 1600]);
    },
    horn() { // the car that comes for the chicken: horn + tyre screech
      game.sound.beep(392, 0, 0.22, 0.09, 'sawtooth');
      game.sound.beep(494, 0, 0.22, 0.07, 'sawtooth');
      game.sound.noise(0.12, 0.35, 0.09, [4200, 2600]);
    },
    crash() {
      game.sound.noise(0, 0.5, 0.28, [1800, 120], 'lowpass');
      game.sound.slide(160, 45, 0, 0.35, 0.18, 'sawtooth');
      game.sound.noise(0.08, 0.25, 0.08, [5000, 3000]); // glass
      game.sound.slide(1400, 500, 0.3, 0.12, 0.06, 'square'); // a last squawk
    },
    coins(n) { // cash out: a jingle of coins
      for (let k = 0; k < n; k++) {
        const f = 1800 + Math.random() * 900;
        game.sound.beep(f, k * 0.06, 0.12, 0.05, 'triangle');
        game.sound.beep(f * 1.5, k * 0.06 + 0.01, 0.08, 0.03, 'sine');
      }
    },
  };

  // ---------- round state ----------
  let round = null; // { bet, m, safe, at (road index, -1 = start), bonusDue, over }
  let roads = newRoads(); // shown before a round starts
  const msgEl = $('crossMessage');
  const say = (text, cls = '') => { msgEl.textContent = text; msgEl.className = 'message' + (cls ? ' ' + cls : ''); };

  function updateButtons() {
    const playing = round && !round.over;
    const busy = anim.busy;
    $('crossGo').disabled = busy || (playing && round.at >= ROADS - 1);
    $('crossGo').textContent = playing ? 'GO ▶' : `GO · ${fmtNu(bet)}`;
    const canCash = playing && round.at >= 0 && !busy;
    $('crossCash').disabled = !canCash;
    $('crossCash').textContent = canCash ? `CASH OUT ${fmtNu(Math.floor(round.bet * round.m[round.at]))}` : 'CASH OUT';
    document.querySelectorAll('#crossBets button').forEach((b) => { b.disabled = !!playing; });
  }

  document.querySelectorAll('#crossBets button').forEach((b) => {
    b.addEventListener('click', () => {
      if (round && !round.over) return;
      document.querySelectorAll('#crossBets button').forEach((x) => x.classList.toggle('on', x === b));
      bet = Number(b.dataset.bet);
      say(`Bet ${fmtNu(bet)}. Press GO.`);
      updateButtons();
    });
  });

  function go() {
    if (anim.busy) return;
    if (!round || round.over) {
      const paid = game.spend(bet, 'cross');
      if (!paid.ok) {
        say(game.nu < BETS[0] ? 'You are out of Nu. Open ☰ Menu → Contact us / Recharge Nu to top up.' : `Not enough Nu for a ${fmtNu(bet)} bet. Pick a smaller one.`, 'lose');
        return;
      }
      round = { bet, m: roads.m, safe: roads.safe, at: -1, bonusDue: paid.bonusDue, over: false };
      game.sound.start();
    }
    if (round.at >= ROADS - 1) return;
    const next = round.at + 1;
    const prevSafe = round.at < 0 ? 1 : round.safe[round.at];
    const hit = rand() >= round.safe[next] / prevSafe; // decided now, at random
    hop(next, hit);
  }
  $('crossGo').addEventListener('click', go);

  function cashOut(auto) {
    if (!round || round.over || round.at < 0 || anim.busy) return;
    const m = round.m[round.at];
    const payout = Math.floor(round.bet * m);
    round.over = true;
    game.settle({ payout, net: payout - round.bet, label: `Cross ${label(m)} (road ${round.at + 1})`, bonusDue: round.bonusDue });
    game.announceWin('SOMA Cross', label(m), payout, m);
    let text = payout > round.bet ? `🎉 Cashed out ${label(m)}: ${fmtNu(payout)} added to your balance!` : `Cashed out ${label(m)}: ${fmtNu(payout)} added to your balance.`;
    if (round.bonusDue) text += ` +${fmtNu(game.bonusNu)} bonus for ${game.bonusEvery} plays!`;
    say(text, payout > round.bet ? (m >= 5 ? 'jackpot' : 'win') : '');
    if (!auto) {
      sfx.coins(payout > round.bet ? Math.min(12, 4 + Math.round(m * 1.5)) : 3);
      if (m >= 5 || payout > round.bet) game.celebrate(m >= 10 ? 'jackpot' : m >= 5 ? 'big' : 'win');
    }
    endRound();
  }
  $('crossCash').addEventListener('click', () => cashOut(false));
  // Leaving the page mid-round cashes out the current safe road for the player.
  window.addEventListener('pagehide', () => cashOut(true));

  function endRound() {
    setTimeout(() => {
      roads = newRoads();
      chicken.road = -1; chicken.x = colX(-1); chicken.dead = false; chicken.alpha = 1;
      barriers.clear();
      cars = cars.filter((c) => !c.killer);
      startLoop();
      updateButtons();
    }, 1400);
    updateButtons();
  }

  // ---------- drawing ----------
  // The world is wider than the screen: about 5 roads are visible and the view follows the chicken.
  const W = 360; // visible width
  const H = 460;
  const SIDE = 64; // start (grass) and finish areas
  const LW = 66; // road width
  const WORLD_W = SIDE * 2 + LW * ROADS;
  const CY = 300; // where the chicken stands (and the prize markers sit)
  const BARRIER_Y = CY - 62;
  const CAR_W = 46;
  const CAR_H = 82;
  const canvas = $('crossBoard');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = W + ' / ' + H;
  ctx.scale(dpr, dpr);
  const colX = (i) => (i < 0 ? SIDE / 2 + 6 : i >= ROADS ? WORLD_W - SIDE / 2 : SIDE + LW * i + LW / 2);

  const chicken = { road: -1, x: colX(-1), y: CY, dead: false, alpha: 1 };
  const barriers = new Set();
  let cars = []; // { lane, y, speed, color, killer, t0 }
  let feathers = [];
  const anim = { busy: false };
  let camX = 0;
  // same casino palette as SOMA Spin and SOMA Drop: crimson, onyx, gold, ivory, emerald
  const CAR_COLORS = ['#9e1d33', '#c0263f', '#1b1d24', '#d4a63a', '#fbf3df', '#0f6b44'];
  // a little texture for the asphalt, fixed so it does not flicker
  const SPECKS = Array.from({ length: 420 }, () => [rand() * WORLD_W, rand() * H, rand() < 0.5]);

  function hop(next, hit) {
    anim.busy = true;
    updateButtons();
    const from = chicken.x;
    const to = colX(next);
    const t0 = performance.now();
    sfx.cluck();
    chicken.hopFrom = from; chicken.hopTo = to; chicken.hopT0 = t0; chicken.hopping = true;
    if (!hit) {
      // clear the way on the road the chicken lands on safely
      cars = cars.filter((c) => !(c.lane === next && c.y + CAR_H > BARRIER_Y - 10 && c.y < CY + 40));
    } else {
      // a car comes all of a sudden down that road
      cars = cars.filter((c) => c.lane !== next || c.y > CY + 40);
      setTimeout(() => sfx.horn(), 150);
      cars.push({ lane: next, y: -CAR_H - 10, speed: 0, killer: true, color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)], t0: t0 + 170 });
    }
    setTimeout(() => {
      chicken.hopping = false;
      chicken.x = to;
      chicken.road = next;
      round.at = next;
      if (!hit) {
        barriers.add(next);
        chicken.landT = performance.now();
        sfx.clank();
        sfx.reveal(round.m[next]);
        const m = round.m[next];
        const val = Math.floor(round.bet * m);
        if (next >= ROADS - 1) {
          anim.busy = false;
          say(`🏁 Made it across! ${label(m)}`, 'win');
          cashOut(false);
          return;
        }
        say(`Safe on road ${next + 1}: ${label(m)} = ${fmtNu(val)}. Cash out or GO!`, m * round.bet > round.bet ? 'win' : '');
        anim.busy = false;
        updateButtons();
      }
    }, 320);
    if (hit) {
      setTimeout(() => {
        chicken.dead = true;
        chicken.deadT = performance.now();
        for (let k = 0; k < 14; k++) feathers.push({ x: chicken.x, y: CY - 10, vx: (rand() - 0.5) * 5, vy: -rand() * 4 - 1, r: rand() * 6, life: 1 });
        round.over = true;
        sfx.crash();
        if (window.SomaHaptic) window.SomaHaptic('lose');
        game.settle({ payout: 0, net: -round.bet, label: `Cross hit (road ${next + 1})`, bonusDue: round.bonusDue });
        let text = `💥 Hit by a car on road ${next + 1}! You lost ${fmtNu(round.bet)}.`;
        if (round.bonusDue) text += ` +${fmtNu(game.bonusNu)} bonus for ${game.bonusEvery} plays!`;
        say(text, 'lose');
        anim.busy = false;
        endRound();
      }, 640);
    }
    startLoop();
  }
  canvas.addEventListener('click', go);

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- full-body chicken (facing right), about 54 px tall ----
  function drawChicken(x, y, squash, dead, t) {
    ctx.save();
    ctx.translate(x, y);
    if (dead) { ctx.rotate(-Math.PI / 2.2); ctx.scale(1, 0.9); }
    ctx.scale(1 + squash * 0.12, 1 - squash * 0.12);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 22, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    // legs
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const step = dead ? 0 : Math.sin(t / 90) * (chicken.hopping ? 3 : 0);
    for (const dx of [-4, 4]) {
      ctx.beginPath(); ctx.moveTo(dx, 8); ctx.lineTo(dx + step * (dx > 0 ? 1 : -1), 19); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx - 3, 20); ctx.lineTo(dx + 4, 20); ctx.stroke();
    }
    // tail feathers
    ctx.fillStyle = '#f1f1f1';
    ctx.beginPath(); ctx.moveTo(-12, -4); ctx.quadraticCurveTo(-24, -18, -20, -2); ctx.quadraticCurveTo(-26, 2, -14, 6); ctx.closePath(); ctx.fill();
    // body
    const bg = ctx.createRadialGradient(-3, -6, 3, 0, 0, 20);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#d9d4c7');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2); ctx.fill();
    // neck + head
    ctx.beginPath(); ctx.ellipse(9, -11, 7, 9, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(11, -19, 7, 0, Math.PI * 2); ctx.fill();
    // wing
    ctx.fillStyle = '#e4ded0';
    ctx.beginPath(); ctx.ellipse(-2, 1, 9, 6, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(3, 3); ctx.moveTo(-7, 5); ctx.lineTo(2, 6); ctx.stroke();
    // comb
    ctx.fillStyle = '#dc2626';
    for (const [cx, cy, r] of [[7, -26, 3], [11, -28, 3.4], [15, -26, 3]]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
    // beak
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.moveTo(17, -21); ctx.lineTo(24, -18); ctx.lineTo(17, -15); ctx.closePath(); ctx.fill();
    // wattle
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.ellipse(16, -13, 2.2, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    // eye
    if (dead) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(11, -22); ctx.lineTo(15, -18); ctx.moveTo(15, -22); ctx.lineTo(11, -18); ctx.stroke();
    } else {
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(13, -20, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(13.6, -20.6, 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---- car seen from above, driving down ----
  function drawCar(c) {
    const x = SIDE + LW * c.lane + (LW - CAR_W) / 2;
    const y = c.y;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    // wheels
    ctx.fillStyle = '#0b0b0d';
    for (const [wx, wy] of [[-3, 12], [CAR_W - 3, 12], [-3, CAR_H - 26], [CAR_W - 3, CAR_H - 26]]) { rr(x + wx - 2, y + wy, 7, 15, 3); ctx.fill(); }
    // body
    const g = ctx.createLinearGradient(x, 0, x + CAR_W, 0);
    g.addColorStop(0, c.color); g.addColorStop(0.5, '#ffffff22'); g.addColorStop(1, c.color);
    rr(x, y, CAR_W, CAR_H, 12); ctx.fillStyle = c.color; ctx.fill();
    ctx.restore();
    rr(x, y, CAR_W, CAR_H, 12); ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fill();
    // roof + windows (front is at the bottom)
    ctx.fillStyle = 'rgba(15,20,30,.85)';
    rr(x + 7, y + CAR_H - 34, CAR_W - 14, 13, 4); ctx.fill(); // windscreen
    rr(x + 8, y + 14, CAR_W - 16, 9, 3); ctx.fill(); // rear window
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    rr(x + 8, y + 25, CAR_W - 16, CAR_H - 61, 5); ctx.fill(); // roof shine
    // lights
    ctx.fillStyle = '#fff6c2';
    rr(x + 5, y + CAR_H - 6, 10, 4, 2); ctx.fill(); rr(x + CAR_W - 15, y + CAR_H - 6, 10, 4, 2); ctx.fill();
    ctx.fillStyle = '#ef4444';
    rr(x + 5, y + 2, 9, 3, 1.5); ctx.fill(); rr(x + CAR_W - 14, y + 2, 9, 3, 1.5); ctx.fill();
    // headlight beams
    const beam = ctx.createLinearGradient(0, y + CAR_H, 0, y + CAR_H + 40);
    beam.addColorStop(0, 'rgba(255,246,194,.35)'); beam.addColorStop(1, 'rgba(255,246,194,0)');
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(x + 4, y + CAR_H); ctx.lineTo(x + CAR_W - 4, y + CAR_H); ctx.lineTo(x + CAR_W + 4, y + CAR_H + 40); ctx.lineTo(x - 4, y + CAR_H + 40); ctx.closePath(); ctx.fill();
  }

  function drawBarrier(i) {
    const x = SIDE + LW * i + 5;
    const w = LW - 10;
    ctx.save();
    // posts
    ctx.fillStyle = '#b8862a'; ctx.fillRect(x + 2, BARRIER_Y + 8, 4, 12); ctx.fillRect(x + w - 6, BARRIER_Y + 8, 4, 12);
    rr(x, BARRIER_Y, w, 12, 4); ctx.save(); ctx.clip();
    for (let k = -2; k < 10; k++) { ctx.fillStyle = k % 2 ? '#111' : '#f4d27c'; ctx.beginPath(); ctx.moveTo(x + k * 10, BARRIER_Y + 12); ctx.lineTo(x + k * 10 + 10, BARRIER_Y); ctx.lineTo(x + k * 10 + 20, BARRIER_Y); ctx.lineTo(x + k * 10 + 10, BARRIER_Y + 12); ctx.fill(); }
    ctx.restore();
    // warning lights
    const on = Math.floor(performance.now() / 300) % 2;
    for (const [lx, o] of [[x + 6, on], [x + w - 6, 1 - on]]) {
      ctx.beginPath(); ctx.arc(lx, BARRIER_Y - 3, 3, 0, Math.PI * 2);
      ctx.fillStyle = o ? '#fff1c4' : '#8a6414'; ctx.shadowColor = '#f4d27c'; ctx.shadowBlur = o ? 8 : 0; ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawMarker(i, m, state, hidden) {
    // the road's prize, painted on the road where the chicken lands; a gold "?" until the chicken lands safely
    const x = colX(i);
    const r = 22;
    ctx.save();
    if (hidden) {
      const hg = ctx.createRadialGradient(x - 6, CY - 6, 3, x, CY, r);
      hg.addColorStop(0, '#2a2d36'); hg.addColorStop(1, '#0c0d11');
      ctx.beginPath(); ctx.ellipse(x, CY + 6, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fillStyle = hg; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,196,106,.85)'; ctx.stroke();
      ctx.fillStyle = '#f4d27c'; ctx.font = '900 17px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x, CY + 7);
      ctx.restore();
      return;
    }
    const col = m >= 10 ? ['#fbe7a8', '#8a6414'] : m >= 5 ? ['#c0263f', '#5e0f1c'] : m >= 2 ? ['#0f6b44', '#06301f'] : ['#2a2d36', '#0c0d11'];
    ctx.globalAlpha = state === 'passed' ? 0.4 : 1;
    if (state === 'current') { ctx.shadowColor = '#f4d27c'; ctx.shadowBlur = 18; }
    const g = ctx.createRadialGradient(x - 6, CY - 6, 3, x, CY, r);
    g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    ctx.beginPath(); ctx.ellipse(x, CY + 6, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = state === 'current' ? '#fff3c4' : 'rgba(232,196,106,.85)'; ctx.stroke();
    ctx.fillStyle = m >= 10 ? '#2a1d00' : m >= 2 ? '#f4d27c' : '#a3a7b0';
    ctx.font = '900 15px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label(m), x, CY + 7);
    ctx.restore();
  }

  function draw() {
    const now = performance.now();
    // camera follows the chicken
    const target = Math.max(0, Math.min(WORLD_W - W, (chicken.hopping ? chicken.hopTo : chicken.x) - W * 0.38));
    camX += (target - camX) * 0.12;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-Math.round(camX), 0);

    // start: crimson carpet with a gold edge
    const carpet = ctx.createLinearGradient(0, 0, SIDE, 0);
    carpet.addColorStop(0, '#3a0b14'); carpet.addColorStop(1, '#7a1426');
    ctx.fillStyle = carpet; ctx.fillRect(0, 0, SIDE, H);
    ctx.strokeStyle = 'rgba(244,210,124,.18)'; ctx.lineWidth = 1;
    for (let y = -SIDE; y < H; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIDE, y + SIDE); ctx.stroke(); }
    const edge = ctx.createLinearGradient(SIDE - 6, 0, SIDE, 0);
    edge.addColorStop(0, '#8a6414'); edge.addColorStop(0.5, '#fbe7a8'); edge.addColorStop(1, '#8a6414');
    ctx.fillStyle = edge; ctx.fillRect(SIDE - 6, 0, 6, H);
    ctx.save(); ctx.translate(SIDE / 2 - 4, 70); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#f4d27c'; ctx.font = '900 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★ START ★', 0, 0); ctx.restore();

    // asphalt
    const road = ctx.createLinearGradient(SIDE, 0, SIDE + LW * ROADS, 0);
    road.addColorStop(0, '#0f1014'); road.addColorStop(0.5, '#1b1d24'); road.addColorStop(1, '#0f1014');
    ctx.fillStyle = road; ctx.fillRect(SIDE, 0, LW * ROADS, H);
    for (const [sx, sy, light] of SPECKS) {
      if (sx < SIDE || sx > SIDE + LW * ROADS) continue;
      ctx.fillStyle = light ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.25)';
      ctx.fillRect(sx, sy, 2, 2);
    }
    // lane lines (white dashes moving with the traffic)
    ctx.strokeStyle = 'rgba(232,196,106,.7)'; ctx.lineWidth = 2; ctx.setLineDash([18, 16]);
    ctx.lineDashOffset = -(now / 22) % 34;
    for (let i = 1; i < ROADS; i++) { const x = SIDE + LW * i; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.setLineDash([]);
    // road numbers at the top
    ctx.fillStyle = 'rgba(244,210,124,.55)'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < ROADS; i++) ctx.fillText(String(i + 1), colX(i), 16);

    // finish: gold edge and gold/black checks
    const fx = SIDE + LW * ROADS;
    const fedge = ctx.createLinearGradient(fx, 0, fx + 6, 0);
    fedge.addColorStop(0, '#8a6414'); fedge.addColorStop(0.5, '#fbe7a8'); fedge.addColorStop(1, '#8a6414');
    ctx.fillStyle = fedge; ctx.fillRect(fx, 0, 6, H);
    ctx.fillStyle = '#0c0d11'; ctx.fillRect(fx + 6, 0, SIDE - 6, H);
    for (let y = 0; y < H; y += 12) for (let k = 0; k < 2; k++) { ctx.fillStyle = (y / 12 + k) % 2 ? '#0c0d11' : '#d4a63a'; ctx.fillRect(fx + 10 + k * 12, y, 12, 12); }
    ctx.save(); ctx.translate(fx + SIDE / 2 + 12, H / 2); ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#f4d27c'; ctx.font = '900 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★ FINISH ★', 0, 0); ctx.restore();

    // prize markers on every road, at the chicken's height
    const ms = round && (!round.over || chicken.road >= 0) ? round.m : roads.m;
    for (let i = 0; i < ROADS; i++) {
      const state = chicken.road === i && !chicken.dead ? 'current' : (round && !round.over && i < chicken.road) ? 'passed' : '';
      drawMarker(i, ms[i], state, !barriers.has(i)); // revealed only where the chicken landed safely
    }
    for (const i of barriers) drawBarrier(i);
    for (const c of cars) drawCar(c);

    // chicken
    let cx = chicken.x;
    let cy = CY - 14;
    let squash = 0;
    if (chicken.hopping) {
      const t = Math.min(1, (now - chicken.hopT0) / 320);
      cx = chicken.hopFrom + (chicken.hopTo - chicken.hopFrom) * t;
      cy = CY - 14 - Math.sin(t * Math.PI) * 30;
      squash = -Math.sin(t * Math.PI) * 0.6;
    } else if (chicken.landT && now - chicken.landT < 160) {
      squash = 1 - (now - chicken.landT) / 160;
    } else {
      cy += Math.sin(now / 260) * 1.2; // idle bob
    }
    if (!chicken.dead || now - chicken.deadT < 1200) drawChicken(cx, cy, squash, chicken.dead, now);
    // the prize the chicken is standing on, shown just below it
    if (round && !chicken.dead && !chicken.hopping && chicken.road >= 0) {
      const m = round.m[chicken.road];
      const text = `${label(m)} = ${fmtNu(Math.floor(round.bet * m))}`;
      ctx.font = '900 13px system-ui, -apple-system, sans-serif';
      const tw = ctx.measureText(text).width + 18;
      const lx = Math.max(SIDE + 4, Math.min(WORLD_W - SIDE - tw - 4, chicken.x - tw / 2));
      rr(lx, CY + 32, tw, 24, 12);
      ctx.fillStyle = '#f4d27c'; ctx.shadowColor = 'rgba(244,210,124,.6)'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#2a1d00'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, lx + tw / 2, CY + 44);
    }
    // feathers after a hit
    for (const f of feathers) {
      f.x += f.vx; f.y += f.vy; f.vy += 0.15; f.life -= 0.012;
      ctx.save(); ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = '#f5f5f4';
      ctx.translate(f.x, f.y); ctx.rotate(f.r + f.life * 4);
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    feathers = feathers.filter((f) => f.life > 0);
    ctx.restore();

    // edge fade so it reads as a wider street
    const fade = ctx.createLinearGradient(W - 26, 0, W, 0);
    fade.addColorStop(0, 'rgba(11,12,16,0)'); fade.addColorStop(1, 'rgba(11,12,16,.55)');
    ctx.fillStyle = fade; ctx.fillRect(W - 26, 0, 26, H);
  }

  // ambient traffic: cars appear at random on roads without a barrier
  let lastSpawn = 0;
  let lastWhoosh = 0;
  function stepCars(now) {
    if (now - lastSpawn > 380 + rand() * 650) {
      lastSpawn = now;
      const free = [];
      for (let i = 0; i < ROADS; i++) if (!barriers.has(i) && chicken.road !== i) free.push(i);
      if (free.length) {
        const lane = free[Math.floor(rand() * free.length)];
        if (!cars.some((c) => c.lane === lane && c.y < 40)) {
          cars.push({ lane, y: -CAR_H - 10, speed: 3.5 + rand() * 5, color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] });
        }
      }
    }
    for (const c of cars) {
      if (c.killer) { if (now >= c.t0) c.y = -CAR_H - 10 + (now - c.t0) * 0.95; continue; } // races down through the chicken
      const stop = BARRIER_Y - CAR_H - 6; // cars stop at a barrier (if they have not passed it yet)
      const before = c.y;
      if (barriers.has(c.lane) && c.y <= stop) c.y = Math.min(stop, c.y + c.speed);
      else c.y += c.speed;
      // whoosh when a car rushes past right next to the chicken (not too often)
      if (before + CAR_H < CY && c.y + CAR_H >= CY && Math.abs(c.lane - chicken.road) <= 1 && now - lastWhoosh > 350) {
        lastWhoosh = now;
        sfx.whoosh(c.lane === chicken.road + 1 ? 0.07 : 0.04);
      }
    }
    cars = cars.filter((c) => c.y < H + 20);
  }

  let looping = false;
  function loop() {
    const now = performance.now();
    stepCars(now);
    draw();
    if (game.view === 'cross' && document.visibilityState === 'visible') requestAnimationFrame(loop);
    else looping = false;
  }
  function startLoop() {
    if (!looping && game.view === 'cross') { looping = true; requestAnimationFrame(loop); }
  }
  window.addEventListener('soma:view', (e) => { if (e.detail === 'cross') { startLoop(); updateButtons(); } });
  document.addEventListener('visibilitychange', startLoop);
  updateButtons();
  draw();
  startLoop();
})();
