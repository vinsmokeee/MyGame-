(() => {
  'use strict';

  const START_NU = 200;
  const FULL_PRIZE_BET = 100; // the big prizes pay their listed amount at this bet
  const SPIN_MS = 5000;
  const STORE_KEY = 'luckySpin.v1';
  const BONUS_EVERY = 10;   // spins
  const BONUS_NU = 20;
  const MIN_RECHARGE = 100;

  const fmtNu = (n) => 'Nu ' + Math.floor(n).toLocaleString('en-US');

  // p = chance per spin (all slices add up to 1). mult = payout as a multiple of the bet.
  // full = big prize paid in full at a Nu 100 bet; smaller bets win a smaller share (bigPrize).
  // Tuned with simulations so players get frequent small results and still slowly lose:
  //   never more than MAX_LOSE_RUN LOSE in a row (about 41% of spins end up LOSE),
  //   x0.5 about 1 in 3, x2 1 in 8, x3 1 in 20, x5 1 in 50,
  //   Nu 1,000 1 in 200, Nu 10,000 1 in 2,500, Jackpot Nu 50,000 1 in 20,000.
  //   With the Nu 20 spin bonus, players get back about 84% of Nu 20 bets, 82% of Nu 50 and 87% of Nu 100.
  const MAX_LOSE_RUN = 2;
  const SEGMENTS = [
    { label: 'x2',      mult: 2,   p: 0.02875, color: '#f97316' },
    { label: 'LOSE',    mult: 0,   p: 0.23894, color: '#334155' },
    { label: 'x0.5',    mult: 0.5, p: 0.075,   color: '#64748b' },
    { label: 'x3',      mult: 3,   p: 0.0225,  color: '#a855f7' },
    { label: 'x5',      mult: 5,   p: 1 / 120, color: '#ec4899' },
    { label: 'x0.5',    mult: 0.5, p: 0.075,   color: '#0ea5e9' },
    { label: 'NU 1K',   full: 1000,  p: 1 / 200,   color: '#166534', big: true },
    { label: 'x2',      mult: 2,   p: 0.02875, color: '#f97316' },
    { label: 'x0.5',    mult: 0.5, p: 0.075,   color: '#64748b' },
    { label: 'NU 10K',  full: 10000, p: 1 / 2500,  color: '#7f1d1d', mega: true },
    { label: 'x2',      mult: 2,   p: 0.02875, color: '#f97316' },
    { label: 'LOSE',    mult: 0,   p: 0.23894, color: '#475569' },
    { label: 'x0.5',    mult: 0.5, p: 0.075,   color: '#0ea5e9' },
    { label: 'x3',      mult: 3,   p: 0.0225,  color: '#a855f7' },
    { label: 'x1',      mult: 1,   p: 0.04,    color: '#22c55e' },
    { label: 'x5',      mult: 5,   p: 1 / 120, color: '#ec4899' },
    { label: 'x2',      mult: 2,   p: 0.02875, color: '#f97316' },
    { label: 'JACKPOT', full: 50000, p: 1 / 20000, color: '#eab308', jackpot: true },
  ];
  for (const x of SEGMENTS) x.weight = x.p;
  // Big prize for a bet: full at Nu 100; at Nu 50 a quarter, at Nu 20 one twenty-fifth.
  // Below Nu 100 a smaller share (Nu 50 = a quarter, Nu 20 = 1/25); above it, in proportion (Nu 500 = 5x).
  const bigPrize = (seg, bet) => Math.round(seg.full * (bet <= FULL_PRIZE_BET ? (bet / FULL_PRIZE_BET) ** 2 : bet / FULL_PRIZE_BET));
  // Big slices show the actual amount for the chosen bet, e.g. "NU 400" at Nu 20, "NU 10,000" at Nu 100.
  const segLabel = (seg) => ((seg.mega || seg.big) ? `NU ${bigPrize(seg, Number(betSel.value)).toLocaleString('en-US')}` : seg.label.replace(/^x/, '×'));
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
    return normalize(s);
  }
  // Fills in anything missing; a brand-new player starts with the Nu 200 welcome gift.
  function normalize(s) {
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
  // Classic casino look: crimson / black slices, gold rim and dividers, emerald for the
  // Nu 1,000 / 10,000 slices and solid gold for the Jackpot.
  const THEME = {
    crimson: ['#5e0f1c', '#9e1d33'], onyx: ['#0c0d11', '#26282f'], emerald: ['#06301f', '#0f6b44'],
    gold: ['#8a6414', '#f4d27c'], ivory: '#fbf3df', silver: '#a3a7b0', goldText: '#f4d27c', darkText: '#2a1d00',
  };
  const sliceStyle = (seg, i) => {
    if (seg.jackpot) return { fill: THEME.gold, text: THEME.darkText };
    if (seg.full) return { fill: THEME.emerald, text: THEME.goldText };
    if (isLose(seg)) return { fill: THEME.onyx, text: THEME.silver };
    return { fill: i % 2 ? THEME.onyx : THEME.crimson, text: THEME.ivory };
  };
  const nice = (label) => label.replace(/^x/, '×');

  function drawWheel() {
    const size = wheel.width;
    const c = size / 2;
    const rimOuter = c - 2;
    const r = c - 26; // slices
    ctx.clearRect(0, 0, size, size);

    // gold rim
    const rim = ctx.createLinearGradient(0, 0, size, size);
    [['#6e4f0f', 0], ['#f6dc8d', 0.22], ['#a87b1c', 0.45], ['#fbe7a8', 0.62], ['#8a6414', 0.82], ['#e9c66a', 1]]
      .forEach(([col, at]) => rim.addColorStop(at, col));
    ctx.beginPath();
    ctx.arc(c, c, rimOuter, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1206';
    ctx.fill();

    for (let i = 0; i < N; i++) {
      // segment 0 is centred at the top (-PI/2) when rotation is 0
      const start = rotation - Math.PI / 2 - ARC / 2 + i * ARC;
      const seg = SEGMENTS[i];
      const st = sliceStyle(seg, i);
      const g = ctx.createRadialGradient(c, c, r * 0.15, c, c, r);
      g.addColorStop(0, st.fill[0]);
      g.addColorStop(1, st.fill[1]);
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, r, start, start + ARC);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();

      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(start + ARC / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = st.text;
      ctx.font = `800 ${seg.full ? 21 : 28}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.shadowColor = seg.jackpot ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.6)';
      ctx.shadowBlur = 3;
      ctx.fillText(segLabel(seg), r - 18, 1);
      ctx.restore();
    }

    // thin gold dividers
    ctx.save();
    ctx.strokeStyle = 'rgba(232, 196, 106, .9)';
    ctx.lineWidth = 2;
    for (let i = 0; i < N; i++) {
      const a = rotation - Math.PI / 2 - ARC / 2 + i * ARC;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r * 0.2, c + Math.sin(a) * r * 0.2);
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // warm light bulbs on the rim (they twinkle while the wheel turns)
    const phase = Math.floor(rotation * 4) % 2;
    for (let i = 0; i < N * 2; i++) {
      const a = rotation + (i * Math.PI) / N;
      const bright = (i + phase) % 2 === 0;
      ctx.save();
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * (c - 13), c + Math.sin(a) * (c - 13), 5, 0, Math.PI * 2);
      ctx.fillStyle = bright ? '#fff8e1' : '#d9b65c';
      ctx.shadowColor = bright ? 'rgba(255, 236, 170, .95)' : 'transparent';
      ctx.shadowBlur = bright ? 10 : 0;
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- game logic ----------
  const isLose = (seg) => !seg.full && seg.mult === 0;
  // After MAX_LOSE_RUN LOSE results in a row, the next spin is never LOSE.
  function pickSegment() {
    const noLose = (state.loseRun || 0) >= MAX_LOSE_RUN;
    const total = SEGMENTS.reduce((s, x) => s + (noLose && isLose(x) ? 0 : x.weight), 0);
    let roll = Math.random() * total;
    for (let i = 0; i < N; i++) {
      if (noLose && isLose(SEGMENTS[i])) continue;
      roll -= SEGMENTS[i].weight;
      if (roll < 0) return i;
    }
    return SEGMENTS.findIndex((x) => x.label === 'x0.5');
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

  // Every play in any game counts toward the free bonus (every BONUS_EVERY plays).
  function countPlay() {
    state.spins += 1;
    return state.spins % BONUS_EVERY === 0;
  }
  function giveBonus() {
    state.nu += BONUS_NU;
    state.best = Math.max(state.best, state.nu);
    addHistory('Play bonus', BONUS_NU);
  }

  function spin() {
    if (spinning) return;
    const bet = Number(betSel.value);
    if (state.nu < bet) {
      setMessage(state.nu < minBet()
        ? 'You are out of Nu. Open ☰ Menu → Contact us / Recharge Nu to top up.'
        : `Not enough Nu for a ${fmtNu(bet)} bet. Pick a smaller bet.`, 'lose');
      return;
    }
    ensureAudio();
    spinning = true;
    state.nu -= bet;
    const bonusDue = countPlay();
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
      else finish(target, bet, bonusDue);
    }
    requestAnimationFrame(frame);
  }

  function finish(index, bet, bonusDue) {
    const seg = SEGMENTS[index];
    state.loseRun = isLose(seg) ? (state.loseRun || 0) + 1 : 0;
    const payout = seg.full ? bigPrize(seg, bet) : Math.floor(bet * seg.mult);
    const net = payout - bet;
    state.nu += payout;
    addHistory(seg.jackpot ? 'Jackpot' : seg.full ? 'Big win' : nice(seg.label), net);
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
      text = `${nice(seg.label)}! You won ${fmtNu(payout)}.`; kind = 'win';
      if (seg.mult >= 3) confetti(100);
      chime([523, 659, 784]);
    } else if (net === 0) {
      text = `${nice(seg.label)}: you got your ${fmtNu(bet)} back.`;
      chime([440]);
    } else {
      text = payout > 0 ? `${nice(seg.label)}: ${fmtNu(payout)} back.` : 'No luck this time.'; kind = 'lose';
      chime([330, 247]);
    }

    if (bonusDue) {
      giveBonus();
      text += ` +${fmtNu(BONUS_NU)} bonus for ${BONUS_EVERY} plays!`;
      if (kind !== 'jackpot') kind = 'win';
      if (net <= 0) setTimeout(() => chime([659, 880]), 500);
    }
    state.best = Math.max(state.best, state.nu);
    setMessage(text, kind);
    if (state.nu < minBet()) {
      setTimeout(() => setMessage('You are out of Nu. Open ☰ Menu → Contact us / Recharge Nu to top up.', 'lose'), 2200);
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
    $('bonusText').textContent = `${left} more play${left === 1 ? '' : 's'} to get a free ${fmtNu(BONUS_NU)}`;
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

  // Prize list under the wheel. Big prizes show the amount for the chosen bet and update when it changes.
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
      sw.style.background = seg.jackpot ? '#e9c66a' : seg.full ? '#0f6b44' : isLose(seg) ? '#26282f' : '#9e1d33';
      const name = document.createElement('span');
      if (seg.full) {
        name.textContent = (seg.jackpot ? 'Jackpot: ' : '') + fmtNu(bigPrize(seg, bet));
        if (seg.jackpot) name.className = 'legend-big';
      } else {
        name.textContent = seg.mult === 0 ? 'Lose bet' : seg.mult === 1 ? 'Bet back (×1)'
          : seg.mult === 0.5 ? 'Half back (×0.5)' : `×${seg.mult} bet`;
      }
      li.append(sw, name);
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
    if (action === 'nav') return; // the link itself switches the game
    if (action === 'contact') {
      if (window.LuckyChat) window.LuckyChat.open(); else chatUnavailable();
    } else if (action === 'note') {
      // Same content as the welcome pop-up and prize note, any time from the menu.
      $('noteId').textContent = state.playerId;
      $('noteWelcomeList').innerHTML = $('welcomeList').innerHTML;
      fillPrizeLines($('notePrizeGames'));
      $('noteDialog').showModal();
    } else if (action === 'logout') {
      if (window.LuckyAccount) window.LuckyAccount.logout();
    }
  });
  // Recharge is inside the chat now (button at the top of Contact us).
  $('chatRecharge').addEventListener('click', () => {
    $('rechargeMsg').textContent = '';
    $('rechargeDialog').showModal();
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
      const when = new Date().toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
      });
      await window.LuckyChat.send(
        `Requested ${fmtNu(amount)}\nName: ${state.name}\nID: ${state.playerId}\nDate & time: ${when}`,
      );
      $('rechargeDialog').close();
      window.LuckyChat.open();
      setMessage(`Requested ${fmtNu(amount)}. The team will add it soon.`, 'win');
    } catch (_) {
      $('rechargeMsg').textContent = 'Could not send the request. Check your connection and try again.';
    }
  });

  // ---------- first visit: name + gender, then welcome with their ID ----------
  // Prize note: what the three big slices pay at each bet (same formula the wheel uses).
  // Prize notes. Each game adds itself to window.SOMA_PRIZES with an id (its view), a title and the
  // prizes it pays for a bet. The first time a player opens a game, that game's note pops up once;
  // ☰ → Note lists every game. Lines read "Nu 20 bet = Prize Nu 40, Nu 400, ...".
  window.SOMA_PRIZES = window.SOMA_PRIZES || [];
  window.SOMA_PRIZES.unshift({
    id: 'spin',
    title: '🎡 SOMA Spin',
    prizes: (bet) => SEGMENTS.filter((x) => x.full).sort((a, b) => a.full - b.full).map((seg) => bigPrize(seg, bet)),
  });
  function fillPrizeLines(box, onlyId) {
    box.replaceChildren();
    for (const g of window.SOMA_PRIZES) {
      if (onlyId && g.id !== onlyId) continue;
      const h = document.createElement('h4');
      h.textContent = g.title;
      const list = document.createElement('ul');
      list.className = 'prize-note-list';
      for (const opt of betSel.options) {
        const bet = Number(opt.value);
        const li = document.createElement('li');
        const b = document.createElement('strong');
        b.textContent = `${fmtNu(bet)} bet`;
        // non-breaking spaces keep each amount ("Nu 12,500") on one line
        li.append(b, ` = Prize ${g.prizes(bet).map((n) => fmtNu(n).replace(' ', '\u00a0')).join(', ')}`);
        list.append(li);
      }
      if (onlyId) box.append(list); // the pop-up title already names the game
      else box.append(h, list);
    }
  }
  // Which games' notes this player has seen, e.g. { spin: true, drop: true }.
  const seenNotes = () => (state.prizeNoteSeen && typeof state.prizeNoteSeen === 'object' ? state.prizeNoteSeen : {});
  let accountReady = !(window.CHAT_CONFIG && window.CHAT_CONFIG.firebase); // online: wait until logged in
  // Shows the note for the game on screen, once per player per game.
  function maybeShowGameNote() {
    const id = currentView;
    const g = window.SOMA_PRIZES.find((x) => x.id === id);
    if (!accountReady || !g || seenNotes()[id] || document.querySelector('dialog[open]')) return;
    fillPrizeLines($('prizeNoteGames'), id);
    $('prizeNoteTitle').textContent = `*Note: ${g.title.replace(/^\S+\s/, '')}`;
    state.prizeNoteSeen = { ...seenNotes(), [id]: true };
    save();
    $('prizeNoteDialog').showModal();
  }
  // After the welcome pop-up, show the note if the player is already in a game.
  $('welcomeDialog').addEventListener('close', () => setTimeout(maybeShowGameNote, 0));

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
    $('nameHint').textContent = state.username
      ? `This changes the name the team sees. You still log in with your username: ${state.username}`
      : 'This is the name the team sees.';
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
    setMessage('You can bet Nu 20, 50, 100, 500.');
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
    if (e.code === 'Space' && currentView === 'spin' && !document.querySelector('dialog[open]')
        && !['SELECT', 'BUTTON', 'INPUT', 'TEXTAREA', 'SUMMARY'].includes(e.target.tagName)) {
      e.preventDefault();
      spin();
    }
  });

  // ---------- API for online.js (chat, owner gifts, profile sync) ----------
  // Fields saved to the player's online account (so they can log in on any phone).
  const ACCOUNT_FIELDS = ['name', 'username', 'gender', 'playerId', 'nu', 'best', 'spins', 'history', 'grants', 'prizeNoteSeen'];
  function refreshAll() {
    save();
    buildLegend();
    drawWheel();
    render();
  }

  // ---------- lobby and games (one page: #spin, #drop, or the lobby) ----------
  let currentView = 'home';
  function showView() {
    const name = { '#spin': 'spin', '#drop': 'drop' }[location.hash] || 'home';
    currentView = name;
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
    const view = $(`view-${name}`);
    $('pageTitle').textContent = view.dataset.title;
    document.title = name === 'home' ? 'SOMA Games' : `${view.dataset.title} · SOMA Games`;
    document.body.dataset.view = name;
    if (name === 'spin') drawWheel();
    window.dispatchEvent(new CustomEvent('soma:view', { detail: name }));
    setTimeout(maybeShowGameNote, 0); // after every game has loaded
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', showView);

  window.LuckySpin = {
    // ----- accounts (used by online.js) -----
    get localOwner() { return state.uid || null; },
    // Called by online.js once the player is logged in (notes wait until then).
    accountReady() { accountReady = true; setTimeout(maybeShowGameNote, 0); },
    exportState() {
      const out = {};
      for (const k of ACCOUNT_FIELDS) if (state[k] !== undefined) out[k] = state[k];
      return out;
    },
    // Load a player's saved account into the game.
    importState(data, owner) {
      const s = {};
      for (const k of ACCOUNT_FIELDS) if (data[k] !== undefined) s[k] = data[k];
      state = normalize(s);
      state.uid = owner;
      state.idOwner = owner;
      refreshAll();
    },
    // A new account: fresh start with the Nu 200 welcome gift.
    startFresh({ username, gender, owner }) {
      state = normalize(null);
      Object.assign(state, { name: username, username, gender, uid: owner });
      refreshAll();
    },
    // Turn this phone's existing progress into an account (keeps Nu, ID and history).
    adopt({ username, gender, owner }) {
      Object.assign(state, { name: username, username, gender, uid: owner });
      refreshAll();
    },
    clearLocal() { try { localStorage.removeItem(STORE_KEY); } catch (_) { /* ignore */ } },
    showWelcome() { $('welcomeId').textContent = state.playerId; $('welcomeDialog').showModal(); },
    maybeShowGameNote,
    // ----- shared wallet for the other SOMA games -----
    get view() { return currentView; },
    // Takes a bet from the balance. Returns { ok, bonusDue } (bonusDue: this play earns the free bonus).
    spend(amount) {
      if (!(amount > 0) || state.nu < amount) return { ok: false };
      state.nu -= amount;
      const bonusDue = countPlay();
      save();
      render();
      return { ok: true, bonusDue };
    },
    // Pays out a result, records it in the history, and adds the bonus if due.
    settle({ payout, net, label, bonusDue }) {
      state.nu += payout;
      addHistory(label, net);
      if (bonusDue) giveBonus();
      state.best = Math.max(state.best, state.nu);
      save();
      render();
    },
    celebrate(level) {
      ensureAudio();
      if (level === 'jackpot') { confetti(500); chime([523, 659, 784, 1047, 1319, 1568, 2093]); }
      else if (level === 'big') { confetti(120); chime([523, 659, 784, 1047]); }
      else if (level === 'win') chime([523, 659, 784]);
      else if (level === 'bonus') chime([659, 880]);
      else chime([330, 247]);
    },
    get bonusNu() { return BONUS_NU; },
    get bonusEvery() { return BONUS_EVERY; },
    // Short alert sound for the owner's notifications (works once sound has been allowed by a tap).
    alertSound() { if (audio) { ensureAudio(); chime([880, 1175, 1568]); } },
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
      addHistory('Recharge', Math.floor(amount));
      save();
      render();
      if (!spinning) setMessage(`Recharge of ${fmtNu(amount)} successfully added`, 'win');
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
  showView();
  // With online accounts, online.js shows the log-in / create-account pop-up instead.
  if (!(window.CHAT_CONFIG && window.CHAT_CONFIG.firebase)) {
    if (!state.gender) startSignup();
  }
})();
