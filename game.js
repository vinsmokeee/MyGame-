(() => {
  'use strict';

  const START_COINS = 100;
  const SPIN_MS = 5000;
  const STORE_KEY = 'luckySpin.v1';

  // multiplier = payout as a multiple of the bet; weight = relative chance.
  const SEGMENTS = [
    { label: 'x2',      mult: 2,   weight: 14, color: '#f97316' },
    { label: 'LOSE',    mult: 0,   weight: 20, color: '#334155' },
    { label: 'x1',      mult: 1,   weight: 18, color: '#0ea5e9' },
    { label: 'x3',      mult: 3,   weight: 8,  color: '#a855f7' },
    { label: 'LOSE',    mult: 0,   weight: 20, color: '#475569' },
    { label: 'x0.5',    mult: 0.5, weight: 16, color: '#14b8a6' },
    { label: 'x5',      mult: 5,   weight: 4,  color: '#ec4899' },
    { label: 'LOSE',    mult: 0,   weight: 20, color: '#334155' },
    { label: 'x1',      mult: 1,   weight: 18, color: '#22c55e' },
    { label: 'x2',      mult: 2,   weight: 14, color: '#ef4444' },
    { label: 'x0.5',    mult: 0.5, weight: 16, color: '#06b6d4' },
    { label: 'JACKPOT', mult: 20,  weight: 1,  color: '#eab308', jackpot: true },
  ];
  const N = SEGMENTS.length;
  const ARC = (Math.PI * 2) / N;
  const TOTAL_WEIGHT = SEGMENTS.reduce((s, x) => s + x.weight, 0);

  const $ = (id) => document.getElementById(id);
  const wheel = $('wheel');
  const ctx = wheel.getContext('2d');
  const spinBtn = $('spin');
  const betSel = $('bet');
  const msg = $('message');
  const pointer = document.querySelector('.pointer');

  let state = load() || { coins: START_COINS, best: START_COINS, spins: 0, history: [] };
  let rotation = 0;          // current wheel rotation, radians
  let spinning = false;
  let soundOn = true;
  let audio = null;

  // ---------- persistence ----------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Number.isFinite(s.coins)) return s;
    } catch (_) { /* storage unavailable */ }
    return null;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  }

  // ---------- drawing ----------
  function drawWheel() {
    const size = wheel.width;
    const c = size / 2;
    const r = c - 14;
    ctx.clearRect(0, 0, size, size);

    // outer rim
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#2b2459';
    ctx.fill();

    for (let i = 0; i < N; i++) {
      // segment 0 is centred at the top (-PI/2) when rotation is 0
      const start = rotation - Math.PI / 2 - ARC / 2 + i * ARC;
      const seg = SEGMENTS[i];
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, r, start, start + ARC);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(start + ARC / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${seg.jackpot ? 26 : 32}px system-ui, sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = 4;
      ctx.fillText(seg.label, r - 22, 0);
      ctx.restore();
    }

    // rim lights
    for (let i = 0; i < N * 2; i++) {
      const a = rotation + (i * Math.PI) / N;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * (c - 8), c + Math.sin(a) * (c - 8), 4, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#fff6c2' : '#ffd447';
      ctx.fill();
    }
  }

  // ---------- game logic ----------
  function pickSegment() {
    let roll = Math.random() * TOTAL_WEIGHT;
    for (let i = 0; i < N; i++) {
      roll -= SEGMENTS[i].weight;
      if (roll < 0) return i;
    }
    return N - 1;
  }

  // Index of the segment under the pointer for a given rotation.
  function segmentAt(rot) {
    const norm = ((-rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.round(norm / ARC) % N;
  }

  const easeOut = (t) => 1 - Math.pow(1 - t, 4);

  function spin() {
    if (spinning) return;
    const bet = Number(betSel.value);
    if (state.coins < bet) {
      setMessage(state.coins <= 0 ? 'Out of coins! Start a new game.' : `Not enough coins for a ${bet} bet.`, 'lose');
      return;
    }
    ensureAudio();
    spinning = true;
    state.coins -= bet;
    state.spins += 1;
    render();
    setMessage('Spinning…');

    const target = pickSegment();
    // land somewhere inside the target segment, not exactly on a border
    const jitter = (Math.random() - 0.5) * ARC * 0.7;
    const targetAngle = -(target * ARC) + jitter;
    const current = rotation % (Math.PI * 2);
    let delta = targetAngle - current;
    delta = ((delta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const turns = 6 + Math.floor(Math.random() * 3);
    const from = rotation;
    const to = rotation + delta + turns * Math.PI * 2;

    const t0 = performance.now();
    let lastSeg = segmentAt(from);

    function frame(now) {
      const t = Math.min(1, (now - t0) / SPIN_MS);
      rotation = from + (to - from) * easeOut(t);
      drawWheel();
      const seg = segmentAt(rotation);
      if (seg !== lastSeg) {
        lastSeg = seg;
        tick();
      }
      if (t < 1) requestAnimationFrame(frame);
      else finish(target, bet);
    }
    requestAnimationFrame(frame);
  }

  function finish(index, bet) {
    const seg = SEGMENTS[index];
    const payout = Math.floor(bet * seg.mult);
    state.coins += payout;
    state.best = Math.max(state.best, state.coins);
    const net = payout - bet;
    state.history.unshift({ label: seg.label, net });
    state.history = state.history.slice(0, 30);
    spinning = false;

    if (seg.jackpot) {
      setMessage(`JACKPOT! You won ${payout} coins!`, 'jackpot');
      confetti(250);
      chime([523, 659, 784, 1047, 1319]);
    } else if (net > 0) {
      setMessage(`${seg.label}! You won ${payout} coins (+${net}).`, 'win');
      if (seg.mult >= 3) confetti(100);
      chime([523, 659, 784]);
    } else if (net === 0) {
      setMessage(`${seg.label} — you got your ${bet} coins back.`);
      chime([440]);
    } else {
      setMessage(payout > 0 ? `${seg.label} — ${payout} coins back (${net}).` : `No luck this time (${net}).`, 'lose');
      chime([330, 247]);
    }
    if (state.coins < 10) setTimeout(() => setMessage('Out of coins! Press "New game" to start over.', 'lose'), 1800);
    save();
    render();
  }

  function setMessage(text, kind = '') {
    msg.textContent = text;
    msg.className = 'message' + (kind ? ' ' + kind : '');
  }

  function render() {
    $('coins').textContent = state.coins;
    $('best').textContent = state.best;
    $('spins').textContent = state.spins;
    spinBtn.disabled = spinning || state.coins < Number(betSel.value);
    betSel.disabled = spinning;
    $('reset').disabled = spinning;
    const hist = $('history');
    hist.innerHTML = '';
    for (const h of state.history) {
      const li = document.createElement('li');
      const a = document.createElement('span');
      a.textContent = h.label;
      const b = document.createElement('span');
      b.textContent = (h.net > 0 ? '+' : '') + h.net;
      b.className = h.net > 0 ? 'pos' : h.net < 0 ? 'neg' : '';
      li.append(a, b);
      hist.append(li);
    }
  }

  function buildLegend() {
    const groups = new Map();
    for (const s of SEGMENTS) {
      const g = groups.get(s.label) || { ...s, weight: 0 };
      g.weight += s.weight;
      groups.set(s.label, g);
    }
    const legend = $('legend');
    [...groups.values()].sort((a, b) => b.mult - a.mult).forEach((g) => {
      const li = document.createElement('li');
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = g.color;
      const name = document.createElement('span');
      name.textContent = g.mult === 0 ? 'Lose bet' : g.jackpot ? `Jackpot (x${g.mult} bet)` : `${g.label} bet`;
      const odds = document.createElement('span');
      odds.className = 'odds';
      odds.textContent = ((g.weight / TOTAL_WEIGHT) * 100).toFixed(1) + '%';
      li.append(sw, name, odds);
      legend.append(li);
    });
  }

  // ---------- sound ----------
  function ensureAudio() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audio = null; }
    }
    if (audio && audio.state === 'suspended') audio.resume();
  }
  function beep(freq, start, dur, vol = 0.15, type = 'triangle') {
    if (!soundOn || !audio) return;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + start + dur);
    o.connect(g).connect(audio.destination);
    o.start(audio.currentTime + start);
    o.stop(audio.currentTime + start + dur);
  }
  function tick() {
    beep(1200, 0, 0.03, 0.06, 'square');
    pointer.classList.remove('tick');
    void pointer.offsetWidth;
    pointer.classList.add('tick');
  }
  function chime(notes) { notes.forEach((f, i) => beep(f, i * 0.12, 0.35)); }

  // ---------- confetti ----------
  const cv = $('confetti');
  const cctx = cv.getContext('2d');
  let particles = [];
  let confettiRunning = false;
  function confetti(count) {
    cv.width = innerWidth;
    cv.height = innerHeight;
    const colors = ['#ffd447', '#ec4899', '#22c55e', '#0ea5e9', '#f97316', '#a855f7'];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: innerWidth / 2, y: innerHeight / 3,
        vx: (Math.random() - 0.5) * 16, vy: Math.random() * -14 - 4,
        size: 5 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        color: colors[i % colors.length], life: 0,
      });
    }
    if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(stepConfetti); }
  }
  function stepConfetti() {
    cctx.clearRect(0, 0, cv.width, cv.height);
    particles = particles.filter((p) => p.y < cv.height + 20 && p.life < 300);
    for (const p of particles) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life++;
      cctx.save();
      cctx.translate(p.x, p.y);
      cctx.rotate(p.rot);
      cctx.fillStyle = p.color;
      cctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      cctx.restore();
    }
    if (particles.length) requestAnimationFrame(stepConfetti);
    else { confettiRunning = false; cctx.clearRect(0, 0, cv.width, cv.height); }
  }

  // ---------- events ----------
  spinBtn.addEventListener('click', spin);
  betSel.addEventListener('change', () => { setMessage(`Each spin costs ${betSel.value} coins.`); render(); });
  $('reset').addEventListener('click', () => {
    if (spinning) return;
    state = { coins: START_COINS, best: Math.max(state.best, START_COINS), spins: 0, history: [] };
    save();
    setMessage('New game! You have 100 coins.');
    render();
  });
  $('sound').addEventListener('click', (e) => {
    soundOn = !soundOn;
    e.currentTarget.textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
    e.currentTarget.setAttribute('aria-pressed', String(soundOn));
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      spin();
    }
  });

  buildLegend();
  drawWheel();
  render();
})();
