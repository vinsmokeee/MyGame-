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
    let text = payout > round.bet ? `🎉 Cashed out ${label(m)}: you won ${fmtNu(payout)}!` : `Cashed out ${label(m)}: ${fmtNu(payout)} back.`;
    if (round.bonusDue) text += ` +${fmtNu(game.bonusNu)} bonus for ${game.bonusEvery} plays!`;
    say(text, payout > round.bet ? (m >= 5 ? 'jackpot' : 'win') : '');
    if (!auto) game.celebrate(m >= 10 ? 'jackpot' : m >= 5 ? 'big' : payout > round.bet ? 'win' : 'bonus');
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
  const W = 360;
  const H = 430;
  const SIDE = 30; // sidewalks
  const LW = (W - 2 * SIDE) / ROADS; // road width
  const CY = H / 2 + 20; // chicken's height on the screen
  const canvas = $('crossBoard');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = W + ' / ' + H;
  ctx.scale(dpr, dpr);
  const colX = (i) => (i < 0 ? SIDE / 2 : SIDE + LW * i + LW / 2);

  const chicken = { road: -1, x: colX(-1), y: CY, dead: false, alpha: 1 };
  const barriers = new Set();
  let cars = []; // { lane, y, speed, color, killer }
  const anim = { busy: false };
  const CAR_COLORS = ['#c0263f', '#0ea5e9', '#f4d27c', '#e5e7eb', '#22c55e', '#a855f7', '#f97316'];

  function hop(next, hit) {
    anim.busy = true;
    updateButtons();
    const from = chicken.x;
    const to = colX(next);
    const t0 = performance.now();
    game.sound.beep(660, 0, 0.06, 0.06, 'square');
    game.sound.beep(990, 0.05, 0.06, 0.05, 'square');
    chicken.hopFrom = from; chicken.hopTo = to; chicken.hopT0 = t0; chicken.hopping = true;
    if (!hit) {
      // clear the way on the road the chicken lands on safely
      cars = cars.filter((c) => !(c.lane === next && c.y > CY - 140 && c.y < CY + 40));
    }
    if (hit) {
      // a car comes all of a sudden down that road
      cars = cars.filter((c) => c.lane !== next || c.y > CY + 40);
      cars.push({ lane: next, y: -60, speed: 0, killer: true, color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)], t0: t0 + 160 });
    }
    setTimeout(() => {
      chicken.hopping = false;
      chicken.x = to;
      chicken.road = next;
      round.at = next;
      if (!hit) {
        barriers.add(next);
        game.sound.beep(180, 0, 0.08, 0.09, 'square');
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
    }, 300);
    if (hit) {
      setTimeout(() => {
        chicken.dead = true;
        round.over = true;
        game.sound.beep(440, 0, 0.12, 0.12, 'sawtooth');
        game.sound.beep(330, 0.1, 0.18, 0.12, 'sawtooth');
        game.settle({ payout: 0, net: -round.bet, label: `Cross hit (road ${next + 1})`, bonusDue: round.bonusDue });
        let text = `💥 Hit by a car on road ${next + 1}! You lost ${fmtNu(round.bet)}.`;
        if (round.bonusDue) text += ` +${fmtNu(game.bonusNu)} bonus for ${game.bonusEvery} plays!`;
        say(text, 'lose');
        anim.busy = false;
        endRound();
      }, 620);
    }
    startLoop();
  }
  canvas.addEventListener('click', go);

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCar(c) {
    const x = SIDE + LW * c.lane + 3;
    const w = LW - 6;
    const h = 46;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6;
    roundRect(x, c.y, w, h, 6);
    ctx.fillStyle = c.color; ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(20,24,32,.75)'; // windscreen
    roundRect(x + 3, c.y + h - 18, w - 6, 9, 3); ctx.fill();
    ctx.fillStyle = '#fff8c4'; // headlights (cars drive down)
    ctx.fillRect(x + 3, c.y + h - 4, 5, 3); ctx.fillRect(x + w - 8, c.y + h - 4, 5, 3);
  }

  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, W, H);
    // sidewalks
    ctx.fillStyle = '#3a3f4b'; ctx.fillRect(0, 0, SIDE, H); ctx.fillRect(W - SIDE, 0, SIDE, H);
    ctx.fillStyle = '#4b5160';
    for (let y = 0; y < H; y += 24) { ctx.fillRect(2, y + 2, SIDE - 4, 20); ctx.fillRect(W - SIDE + 2, y + 2, SIDE - 4, 20); }
    // roads
    ctx.fillStyle = '#16181f'; ctx.fillRect(SIDE, 0, LW * ROADS, H);
    ctx.strokeStyle = 'rgba(244, 210, 124, .5)'; ctx.lineWidth = 1.5; ctx.setLineDash([12, 12]);
    ctx.lineDashOffset = -(now / 40) % 24;
    for (let i = 1; i < ROADS; i++) { const x = SIDE + LW * i; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.setLineDash([]);
    const ms = (round && !round.over) ? round.m : (round && round.over && chicken.road >= 0 ? round.m : roads.m);
    // prize chips at the bottom of each road
    for (let i = 0; i < ROADS; i++) {
      const m = ms[i];
      const x = SIDE + LW * i + 2;
      const passed = round && chicken.road >= i && !round.over;
      const current = chicken.road === i && !chicken.dead;
      roundRect(x, H - 34, LW - 4, 26, 6);
      ctx.fillStyle = current ? '#f4d27c' : m >= 10 ? '#8a6414' : m >= 5 ? '#9e1d33' : m >= 2 ? '#0f6b44' : '#2a2d36';
      ctx.globalAlpha = passed && !current ? 0.45 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = current ? '#2a1d00' : '#fbf3df';
      ctx.font = `800 ${m >= 10 ? 10 : 11}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label(m), x + (LW - 4) / 2, H - 21);
    }
    // barriers on safe roads (above the chicken, so cars stop there)
    for (const i of barriers) {
      const x = SIDE + LW * i + 2;
      const y = CY - 46;
      ctx.save();
      roundRect(x, y, LW - 4, 12, 3); ctx.clip();
      for (let k = -2; k < 6; k++) { ctx.fillStyle = k % 2 ? '#111' : '#f4d27c'; ctx.beginPath(); ctx.moveTo(x + k * 8, y + 12); ctx.lineTo(x + k * 8 + 8, y); ctx.lineTo(x + k * 8 + 16, y); ctx.lineTo(x + k * 8 + 8, y + 12); ctx.fill(); }
      ctx.restore();
    }
    // cars
    for (const c of cars) drawCar(c);
    // chicken
    let cx = chicken.x;
    let cy = chicken.y;
    if (chicken.hopping) {
      const t = Math.min(1, (now - chicken.hopT0) / 300);
      cx = chicken.hopFrom + (chicken.hopTo - chicken.hopFrom) * t;
      cy = CY - Math.sin(t * Math.PI) * 18;
    }
    ctx.save();
    ctx.globalAlpha = chicken.alpha;
    ctx.font = `${chicken.dead ? 26 : 24}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(chicken.dead ? '💥' : '🐔', cx, cy);
    ctx.restore();
    // finish line
    ctx.fillStyle = '#f4d27c'; ctx.font = '800 9px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.save(); ctx.translate(W - SIDE / 2, 40); ctx.rotate(Math.PI / 2); ctx.fillText('FINISH 🏁', 0, 0); ctx.restore();
  }

  // ambient traffic: cars appear at random on roads without a barrier
  let lastSpawn = 0;
  function stepCars(now) {
    if (now - lastSpawn > 450 + rand() * 700) {
      lastSpawn = now;
      const free = [];
      for (let i = 0; i < ROADS; i++) if (!barriers.has(i) && chicken.road !== i) free.push(i);
      if (free.length) {
        const lane = free[Math.floor(rand() * free.length)];
        if (!cars.some((c) => c.lane === lane && c.y < 60)) {
          cars.push({ lane, y: -50, speed: 3 + rand() * 4, color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] });
        }
      }
    }
    for (const c of cars) {
      if (c.killer) { if (now >= c.t0) c.y = -60 + (now - c.t0) * 0.75; continue; } // races down through the chicken
      const stop = CY - 96; // cars stop at a barrier (if they have not passed it yet)
      if (barriers.has(c.lane) && c.y <= stop) c.y = Math.min(stop, c.y + c.speed);
      else c.y += c.speed;
    }
    cars = cars.filter((c) => c.y < H + 10);
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
