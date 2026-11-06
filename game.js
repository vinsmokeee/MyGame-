(() => {
  'use strict';

  const START_NU = 200;
  const MAX_BET = 100;      // the big prizes pay in full at this bet
  const SPIN_MS = 5000;
  const STORE_KEY = 'luckySpin.v1';
  const BONUS_EVERY = 10;   // spins
  const BONUS_NU = 50;
  const MIN_RECHARGE = 100;

  const fmtNu = (n) => 'Nu ' + Math.floor(n).toLocaleString('en-US');

  // p = chance per spin (all slices add up to 1). mult = payout as a multiple of the bet.
  // full = big prize paid in full at a Nu 100 bet; smaller bets win a smaller share (bigPrize).
  // Tuned with simulations: LOSE 54%, a win about 1 spin in 4, and over time players get
  // back about 88% of Nu 50/100 bets (about 98% of Nu 20 bets, with the spin bonus).
  //   x5 1 in 30 · Nu 1,000 1 in 200 · Nu 10,000 1 in 2,500 · Jackpot Nu 50,000 1 in 20,000
  const SEGMENTS = [
    { label: 'x1.5',    mult: 1.5, p: 0.05,    color: '#0ea5e9' },
    { label: 'LOSE',    mult: 0,   p: 0.27,    color: '#334155' },
    { label: 'x2',      mult: 2,   p: 0.0275,  color: '#f97316' },
    { label: 'x0.5',    mult: 0.5, p: 0.04811, color: '#64748b' },
    { label: 'x5',      mult: 5,   p: 1 / 60,  color: '#ec4899' },
    { label: 'x1',      mult: 1,   p: 0.05,    color: '#22c55e' },
    { label: 'NU 1K',   full: 1000,  p: 1 / 200,   color: '#166534', big: true },
    { label: 'x1.5',    mult: 1.5, p: 0.05,    color: '#0ea5e9' },
    { label: 'x3',      mult: 3,   p: 0.02,    color: '#a855f7' },
    { label: 'NU 10K',  full: 10000, p: 1 / 2500,  color: '#7f1d1d', mega: true },
    { label: 'x0.5',    mult: 0.5, p: 0.04811, color: '#64748b' },
    { label: 'LOSE',    mult: 0,   p: 0.27,    color: '#475569' },
    { label: 'x2',      mult: 2,   p: 0.0275,  color: '#f97316' },
    { label: 'x5',      mult: 5,   p: 1 / 60,  color: '#ec4899' },
    { label: 'x1',      mult: 1,   p: 0.05,    color: '#22c55e' },
    { label: 'x1.5',    mult: 1.5, p: 0.05,    color: '#0ea5e9' },
    { label: 'JACKPOT', full: 50000, p: 1 / 20000, color: '#eab308', jackpot: true },
  ];
  for (const x of SEGMENTS) x.weight = x.p;
  // Big prize for a bet: full at Nu 100; at Nu 50 a quarter, at Nu 20 one twenty-fifth.
  const bigPrize = (seg, bet) => Math.round(seg.full * Math.min(1, bet / MAX_BET) ** 2);
  const shortNu = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));
  const segLabel = (seg) => ((seg.mega || seg.big) ? `NU ${shortNu(bigPrize(seg, Number(betSel.value)))}` : seg.label);
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

  // 6-digit player ID number (100000-999999). online.js makes sure it is unique.
  const randomIdNumber = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const isIdNumber = (id) => /^[1-9]\d{5}$/.test(String(id || ''));

  let state = load();
  let rotation = 0;
  let spinning = false;
  let soundOn = true;
  let audio = null;
  const listeners = [];

  // ---------- persistence ----------
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (_) { /* storage unavailable */ }
    const fresh = !s || typeof s !== 'object';
    if (fresh) s = {};
    if (!Number.isFinite(s.nu)) s.nu = Number.isFinite(s.coins) ? s.coins : START_NU; // older saves used "coins"
    delete s.coins;
    delete s.redeemed;
    if (!Number.isFinite(s.best)) s.best = s.nu;
    if (!Number.isFinite(s.spins)) s.spins = 0;
    if (!Array.isArray(s.history)) s.history = [];
    if (!Array.isArray(s.grants)) s.grants = [];
    if (!isIdNumber(s.playerId)) { s.playerId = randomIdNumber(); delete s.idOwner; } // older saves used letters
    if (!s.name) s.name = 'Player ' + s.playerId.slice(-4);
    if (fresh) s.history = [{ label: 'Welcome gift', net: START_NU }];
    return s;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
    listeners.forEach((cb) => { try { cb(); } catch (_) { /* ignore */ } });
  }

  // ---------- drawing ----------
  function drawWheel() {
    const size = wheel.width;
    const c = size / 2;
    const r = c - 14;
    ctx.clearRect(0, 0, size, size);

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
      if (seg.mega) {
        const g = ctx.createRadialGradient(c, c, r * 0.2, c, c, r);
        g.addColorStop(0, '#450a0a');
        g.addColorStop(1, '#b91c1c');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = seg.color;
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(start + ARC / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = seg.mega ? '#ffd447' : '#fff';
      ctx.font = `800 ${seg.full ? 23 : 28}px system-ui, sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 4;
      ctx.fillText(segLabel(seg), r - 20, 0);
      ctx.restore();
    }

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
    return 1; // a LOSE segment
  }

  function segmentAt(rot) {
    const norm = ((-rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.round(norm / ARC) % N;
  }

  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  const minBet = () => Number(betSel.options[0].value);

  function addHistory(label, net) {
    state.history.unshift({ label, net });
    state.history = state.history.slice(0, 30);
  }

  function spin() {
    if (spinning) return;
    const bet = Number(betSel.value);
    if (state.nu < bet) {
      setMessage(state.nu < minBet()
        ? 'You are out of Nu. Open ☰ Menu → Recharge Nu to top up.'
        : `Not enough Nu for a ${fmtNu(bet)} bet. Pick a smaller bet.`, 'lose');
      return;
    }
    ensureAudio();
    spinning = true;
    state.nu -= bet;
    state.spins += 1;
    render();
    setMessage('Spinning…');

    const target = pickSegment();
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
      if (seg !== lastSeg) { lastSeg = seg; tick(); }
      if (t < 1) requestAnimationFrame(frame);
      else finish(target, bet);
    }
    requestAnimationFrame(frame);
  }

  function finish(index, bet) {
    const seg = SEGMENTS[index];
    const payout = seg.full ? bigPrize(seg, bet) : Math.floor(bet * seg.mult);
    const net = payout - bet;
    state.nu += payout;
    addHistory(seg.jackpot ? 'Jackpot' : seg.mega ? 'Nu 10,000 prize' : seg.big ? 'Nu 1,000 prize' : seg.label, net);
    spinning = false;

    let text;
    let kind = '';
    if (seg.big) {
      text = `🎉 BIG WIN! You won ${fmtNu(payout)}!`; kind = 'jackpot';
      confetti(200); chime([523, 659, 784, 1047, 1319]);
    } else if (seg.mega) {
      text = `🎉 MEGA WIN! You won ${fmtNu(payout)}!`; kind = 'jackpot';
      confetti(400); chime([523, 659, 784, 1047, 1319, 1568]);
    } else if (seg.jackpot) {
      text = `🏆 JACKPOT! You won ${fmtNu(payout)}!`; kind = 'jackpot';
      confetti(600); chime([523, 659, 784, 1047, 1319, 1568, 2093]);
    } else if (net > 0) {
      text = `${seg.label}! You won ${fmtNu(payout)}.`; kind = 'win';
      if (seg.mult >= 3) confetti(100);
      chime([523, 659, 784]);
    } else if (net === 0) {
      text = `${seg.label}: you got your ${fmtNu(bet)} back.`;
      chime([440]);
    } else {
      text = payout > 0 ? `${seg.label}: ${fmtNu(payout)} back.` : 'No luck this time.'; kind = 'lose';
      chime([330, 247]);
    }

    if (state.spins % BONUS_EVERY === 0) {
      state.nu += BONUS_NU;
      addHistory('Spin bonus', BONUS_NU);
      text += ` +${fmtNu(BONUS_NU)} bonus for ${BONUS_EVERY} spins!`;
      if (kind !== 'jackpot') kind = 'win';
      if (net <= 0) setTimeout(() => chime([659, 880]), 500);
    }
    state.best = Math.max(state.best, state.nu);
    setMessage(text, kind);
    if (state.nu < minBet()) {
      setTimeout(() => setMessage('You are out of Nu. Open ☰ Menu → Recharge Nu to top up.', 'lose'), 2200);
    }
    save();
    render();
  }

  function setMessage(text, kind = '') {
    msg.textContent = text;
    msg.className = 'message' + (kind ? ' ' + kind : '');
  }

  function render() {
    $('nu').textContent = fmtNu(state.nu);
    $('best').textContent = fmtNu(state.best);
    $('spins').textContent = state.spins.toLocaleString('en-US');
    $('playerName').textContent = state.name;
    $('playerId').textContent = state.playerId;
    spinBtn.disabled = spinning || state.nu < Number(betSel.value);
    betSel.disabled = spinning;

    const done = state.spins % BONUS_EVERY;
    const left = BONUS_EVERY - done;
    $('bonusText').textContent = `${left} more spin${left === 1 ? '' : 's'} to get a free ${fmtNu(BONUS_NU)}`;
    $('bonusFill').style.width = `${(done / BONUS_EVERY) * 100}%`;

    const hist = $('history');
    hist.innerHTML = '';
    for (const h of state.history) {
      const li = document.createElement('li');
      const a = document.createElement('span');
      a.textContent = h.label;
      const b = document.createElement('span');
      b.textContent = (h.net > 0 ? '+' : h.net < 0 ? '−' : '') + fmtNu(Math.abs(h.net));
      b.className = h.net > 0 ? 'pos' : h.net < 0 ? 'neg' : '';
      li.append(a, b);
      hist.append(li);
    }
  }

  function buildLegend() {
    const bet = Number(betSel.value);
    const seen = new Map();
    for (const seg of SEGMENTS) if (!seen.has(seg.label)) seen.set(seg.label, seg);
    const value = (seg) => (seg.full ? 1e9 + seg.full : seg.mult);
    const legend = $('legend');
    legend.replaceChildren();
    [...seen.values()].sort((a, b) => value(b) - value(a)).forEach((seg) => {
      const li = document.createElement('li');
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = seg.mega ? '#b91c1c' : seg.color;
      const name = document.createElement('span');
      if (seg.full) {
        const title = seg.jackpot ? 'Jackpot' : `${fmtNu(seg.full)} prize`;
        name.textContent = bet >= MAX_BET ? (seg.jackpot ? `Jackpot: ${fmtNu(seg.full)}` : title)
          : `${title}: ${fmtNu(bigPrize(seg, bet))} at this bet`;
      } else {
        name.textContent = seg.mult === 0 ? 'Lose bet' : seg.mult === 1 ? 'Bet back (×1)'
          : seg.mult === 0.5 ? 'Half back (×0.5)' : `×${seg.mult} bet`;
      }
      li.append(sw, name);
      legend.append(li);
    });
    if (bet < MAX_BET) {
      const li = document.createElement('li');
      li.className = 'legend-note';
      li.textContent = `Bet ${fmtNu(MAX_BET)} to win the full Nu 1,000, Nu 10,000 and Nu 50,000 Jackpot prizes.`;
      legend.append(li);
    }
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

  // ---------- menu & dialogs ----------
  const menu = $('menu');
  const backdrop = $('menuBackdrop');
  function setMenu(open) {
    menu.hidden = !open;
    backdrop.hidden = !open;
    $('menuBtn').setAttribute('aria-expanded', String(open));
  }
  $('menuBtn').addEventListener('click', () => setMenu(menu.hidden));
  $('menuClose').addEventListener('click', () => setMenu(false));
  backdrop.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  function info(title, text) {
    $('infoTitle').textContent = title;
    $('infoText').textContent = text;
    $('infoDialog').showModal();
  }
  const chatUnavailable = () => info('Not available yet', 'Chat with the owner is not switched on yet. Please try again later.');

  menu.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    setMenu(false);
    if (action === 'contact') {
      if (window.LuckyChat) window.LuckyChat.open(); else chatUnavailable();
    } else if (action === 'recharge') {
      $('rechargeMsg').textContent = '';
      $('rechargeDialog').showModal();
    }
  });

  $('rechargeForm').addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const amount = Number($('rechargeAmount').value);
    if (!Number.isInteger(amount) || amount < MIN_RECHARGE) {
      $('rechargeMsg').textContent = `Minimum recharge is ${fmtNu(MIN_RECHARGE)}.`;
      return;
    }
    if (!window.LuckyChat) { $('rechargeDialog').close(); chatUnavailable(); return; }
    try {
      await window.LuckyChat.send(`💰 Recharge request: ${fmtNu(amount)}`);
      $('rechargeDialog').close();
      window.LuckyChat.open();
      setMessage(`Recharge request for ${fmtNu(amount)} sent to the owner.`, 'win');
    } catch (_) {
      $('rechargeMsg').textContent = 'Could not send the request. Check your connection and try again.';
    }
  });

  // ---------- first visit: name + gender, then welcome with their ID ----------
  function startSignup() {
    const dlg = $('signupDialog');
    if (!/^Player \d{4}$/.test(state.name)) $('signupName').value = state.name;
    dlg.addEventListener('cancel', (e) => e.preventDefault()); // must be filled in
    dlg.showModal();
  }
  $('signupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('signupName').value.replace(/\s+/g, ' ').trim().slice(0, 20);
    const gender = (document.querySelector('input[name="gender"]:checked') || {}).value;
    if (!name) { $('signupMsg').textContent = 'Please enter your name.'; return; }
    if (!gender) { $('signupMsg').textContent = 'Please choose your gender.'; return; }
    state.name = name;
    state.gender = gender;
    save();
    render();
    $('signupDialog').close();
    $('welcomeId').textContent = state.playerId;
    $('welcomeDialog').showModal();
  });

  $('editName').addEventListener('click', () => {
    $('nameInput').value = state.name;
    $('nameMsg').textContent = '';
    $('nameDialog').showModal();
    $('nameInput').select();
  });
  $('nameForm').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    const name = $('nameInput').value.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name) { e.preventDefault(); $('nameMsg').textContent = 'Please enter a name.'; return; }
    state.name = name;
    save();
    render();
  });

  // ---------- other events ----------
  spinBtn.addEventListener('click', spin);
  betSel.addEventListener('change', () => {
    setMessage('You can bet Nu 20, 50, 100.');
    buildLegend();
    drawWheel();
    render();
  });
  $('sound').addEventListener('click', (e) => {
    soundOn = !soundOn;
    e.currentTarget.textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
    e.currentTarget.setAttribute('aria-pressed', String(soundOn));
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !document.querySelector('dialog[open]')
        && !['SELECT', 'BUTTON', 'INPUT', 'TEXTAREA', 'SUMMARY'].includes(e.target.tagName)) {
      e.preventDefault();
      spin();
    }
  });

  // ---------- API for online.js (chat, owner gifts, profile sync) ----------
  window.LuckySpin = {
    get playerId() { return state.playerId; },
    // Which online account has confirmed this ID number as its own.
    get idOwner() { return state.idOwner || null; },
    confirmId(owner) { state.idOwner = owner; save(); },
    // Pick a new ID number (used when the current one is already taken).
    newPlayerId() { state.playerId = randomIdNumber(); delete state.idOwner; save(); render(); return state.playerId; },
    get name() { return state.name; },
    get gender() { return state.gender || ''; },
    get nu() { return state.nu; },
    get spins() { return state.spins; },
    onChange(cb) { listeners.push(cb); },
    // Adds Nu sent by the owner. Each gift id is applied only once.
    applyGift(id, amount) {
      if (!id || state.grants.includes(id) || !Number.isFinite(amount) || amount <= 0) return false;
      state.grants.push(id);
      state.grants = state.grants.slice(-500);
      state.nu += Math.floor(amount);
      state.best = Math.max(state.best, state.nu);
      addHistory('Gift from owner', Math.floor(amount));
      save();
      render();
      if (!spinning) setMessage(`🎁 The owner sent you ${fmtNu(amount)}!`, 'win');
      ensureAudio();
      chime([523, 659, 784, 1047]);
      confetti(150);
      return true;
    },
  };

  buildLegend();
  drawWheel();
  render();
  save();
  if (!state.gender) startSignup();
})();
