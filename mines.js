// SOMA Mines: a 5×5 board hides 20 💎 gems and 5 💣 mines. Pick a bet and tap tiles: each gem raises the
// prize, a mine loses the bet. Cash out from 2 gems. Uses the shared SOMA account and Nu balance.
(() => {
  'use strict';
  const game = window.LuckySpin;
  if (!game) return;

  // ---------- settings ----------
  const BETS = [20, 50, 100, 500];
  const MINES = 5; // every round hides 5 mines
  const MIN_GEMS_TO_CASH = 2; // cash out unlocks after 2 gems
  const TILES = 25;
  const RTP = 0.88; // share of bets paid back over time, whatever the player does (simulated: ~87–88%)
  const MAX_WIN = 250000; // biggest prize, same as the SOMA Spin jackpot

  const $ = (id) => document.getElementById(id);
  const fmtNu = (n) => 'Nu ' + Math.floor(n).toLocaleString('en-US');
  const fmtX = (m) => '×' + (Math.round(m * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

  // Prize multiplier after `gems` safe picks with `mines` mines: the fair price of surviving, times RTP.
  function choose(n, k) { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }
  function mult(mines, gems) {
    if (gems <= 0) return 0;
    return Math.floor(RTP * choose(TILES, gems) / choose(TILES - mines, gems) * 100) / 100;
  }
  const payoutFor = (bet, mines, gems) => Math.min(MAX_WIN, Math.floor(bet * mult(mines, gems)));

  function randInt(n) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }

  let bet = BETS[0];
  const mines = MINES;
  let round = null; // { bet, mines, mineSet, gems, over, bonusDue }

  // ---------- prize table + first-time note ----------
  window.SOMA_PRIZES = window.SOMA_PRIZES || [];
  window.SOMA_PRIZES.push({
    id: 'mines',
    title: '💎 SOMA Mines',
    help: [
      'Pick your bet and tap any tile.',
      'Find 💎 gems: every gem raises your prize. 5 tiles hide 💣 mines.',
      'Hit a 💣 and you lose your bet.',
      'Cash out from 2 gems, before you hit a mine!',
      'Prizes below: after 3, 5 and 8 gems.',
    ],
    prizes: (b) => [3, 5, 8].map((g) => payoutFor(b, MINES, g)),
  });

  // simple prize table: gems found -> prize for each bet
  function buildPayTable() {
    const gemsRows = [2, 3, 4, 5, 6, 8, 10];
    const head = $('minesPayHead');
    const body = $('minesPayBody');
    head.replaceChildren();
    body.replaceChildren();
    const tr = document.createElement('tr');
    for (const t of ['💎', ...BETS.map((b) => `Nu ${b}`)]) { const th = document.createElement('th'); th.textContent = t; tr.append(th); }
    head.append(tr);
    for (const g of gemsRows) {
      const row = document.createElement('tr');
      const first = document.createElement('td');
      first.textContent = String(g);
      row.append(first);
      for (const b of BETS) { const td = document.createElement('td'); td.textContent = payoutFor(b, MINES, g).toLocaleString('en-US'); if (g >= 8) td.className = 'jp'; row.append(td); }
      body.append(row);
    }
  }

  // ---------- sounds ----------
  const sfx = {
    gem(n) { // brighter with every gem
      const base = 523 * Math.pow(2, Math.min(n, 14) / 12);
      game.sound.beep(base, 0, 0.18, 0.09, 'triangle');
      game.sound.beep(base * 1.5, 0.06, 0.22, 0.06, 'sine');
      game.sound.beep(base * 2, 0.12, 0.2, 0.04, 'sine');
    },
    boom() {
      game.sound.noise(0, 0.6, 0.3, [1500, 90], 'lowpass');
      game.sound.slide(140, 40, 0, 0.45, 0.2, 'sawtooth');
      game.sound.noise(0.05, 0.3, 0.08, [4000, 1500]);
    },
    coins(n) {
      for (let k = 0; k < n; k++) {
        const f = 1800 + Math.random() * 900;
        game.sound.beep(f, k * 0.06, 0.12, 0.05, 'triangle');
        game.sound.beep(f * 1.5, k * 0.06 + 0.01, 0.08, 0.03, 'sine');
      }
    },
  };

  // ---------- art (drawn in the casino style) ----------
  const GEM_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="gA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0f7ff"/><stop offset=".5" stop-color="#7dd3fc"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient>
      <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe7a8"/><stop offset="1" stop-color="#8a6414"/></linearGradient>
    </defs>
    <polygon points="14,22 24,10 40,10 50,22 32,54" fill="url(#gA)" stroke="url(#gB)" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="14,22 50,22 32,54" fill="#38bdf8" opacity=".55"/>
    <polygon points="24,10 32,22 40,10" fill="#f0f9ff" opacity=".85"/>
    <polyline points="14,22 24,10 32,22 40,10 50,22" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.2"/>
    <line x1="32" y1="22" x2="32" y2="54" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>
    <circle cx="22" cy="18" r="2.2" fill="#fff"/>
  </svg>`;
  const BOMB_SVG = (lit) => `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><radialGradient id="bm" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#6b7280"/><stop offset=".5" stop-color="#1f2937"/><stop offset="1" stop-color="#030712"/></radialGradient></defs>
    <circle cx="30" cy="38" r="18" fill="url(#bm)" stroke="#d4a63a" stroke-width="2"/>
    <rect x="36" y="16" width="9" height="8" rx="2" transform="rotate(35 40 20)" fill="#9ca3af" stroke="#d4a63a" stroke-width="1.5"/>
    <path d="M44 16 q6 -6 10 -2" fill="none" stroke="#b45309" stroke-width="2.5" stroke-linecap="round"/>
    ${lit ? '<circle cx="54" cy="14" r="5" fill="#fbbf24"/><circle cx="54" cy="14" r="2.5" fill="#fff7cc"/>' : ''}
    <circle cx="23" cy="31" r="4" fill="#fff" opacity=".25"/>
  </svg>`;

  // ---------- board ----------
  const grid = $('minesGrid');
  const tiles = [];
  for (let i = 0; i < TILES; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mine-tile';
    b.setAttribute('aria-label', `Tile ${i + 1}`);
    b.addEventListener('click', () => pick(i));
    grid.append(b);
    tiles.push(b);
  }
  function resetBoard() {
    for (const t of tiles) { t.className = 'mine-tile'; t.innerHTML = ''; t.disabled = false; }
  }
  function sparks(tile, n, color) {
    for (let k = 0; k < n; k++) {
      const sp = document.createElement('span');
      sp.className = 'spark';
      const a = Math.random() * Math.PI * 2;
      const d = 24 + Math.random() * 30;
      sp.style.left = '50%'; sp.style.top = '50%';
      sp.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      sp.style.setProperty('--dy', `${Math.sin(a) * d}px`);
      if (color) sp.style.background = color;
      tile.append(sp);
      setTimeout(() => sp.remove(), 650);
    }
  }

  const msgEl = $('minesMessage');
  const say = (text, cls = '') => { msgEl.textContent = text; msgEl.className = 'message' + (cls ? ' ' + cls : ''); };

  function updateInfo() {
    const playing = round && !round.over;
    const m = playing ? round.mines : mines;
    const g = playing ? round.gems : 0;
    const b = playing ? round.bet : bet;
    // the prize is shown in one place: the CASH OUT button
    const canCash = playing && g >= MIN_GEMS_TO_CASH;
    $('minesCash').disabled = !canCash;
    $('minesCash').textContent = canCash ? `CASH OUT ${fmtNu(payoutFor(b, m, g))}`
      : playing ? `CASH OUT (find ${MIN_GEMS_TO_CASH - g} more 💎)` : 'CASH OUT';
    document.querySelectorAll('#minesBets button').forEach((x) => { x.disabled = !!playing; });
    $('minesCash').classList.toggle('pulse', !!(canCash && payoutFor(b, m, g) > b));
    $('minesRandom').disabled = !!(round && round.over);
    $('minesGems').textContent = `💎 ${g} / ${TILES - m} · 💣 ${m}`;
  }

  document.querySelectorAll('#minesBets button').forEach((b) => {
    b.addEventListener('click', () => {
      if (round && !round.over) return;
      document.querySelectorAll('#minesBets button').forEach((x) => x.classList.toggle('on', x === b));
      bet = Number(b.dataset.bet);
      say(`Bet ${fmtNu(bet)}. Tap any tile to start.`);
      updateInfo();
    });
  });
  function startRound() {
    const paid = game.spend(bet, 'mines');
    if (!paid.ok) {
      say(game.nu < BETS[0] ? 'You are out of Nu. Open ☰ Menu → Contact us / Recharge Nu to top up.' : `Not enough Nu for a ${fmtNu(bet)} bet. Pick a smaller one.`, 'lose');
      return false;
    }
    // place the mines at random (secure random numbers), before the first tile is opened
    const mineSet = new Set();
    while (mineSet.size < mines) mineSet.add(randInt(TILES));
    resetBoard();
    round = { bet, mines, mineSet, gems: 0, over: false, bonusDue: paid.bonusDue };
    game.sound.start();
    return true;
  }

  function pick(i) {
    if (round && round.over) return; // board is showing the last round; next tap starts a new one below
    if (!round) { if (!startRound()) return; }
    if (tiles[i].disabled) return;
    tiles[i].disabled = true;
    if (round.mineSet.has(i)) {
      tiles[i].classList.add('boom', 'flip');
      tiles[i].innerHTML = BOMB_SVG(true);
      sparks(tiles[i], 14, '#f97316');
      const board = document.querySelector('.mines-board');
      board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
      $('minesFlash').classList.remove('on'); void $('minesFlash').offsetWidth; $('minesFlash').classList.add('on');
      sfx.boom();
      if (window.SomaHaptic) window.SomaHaptic('lose');
      finish(0);
      let text = `💣 BOOM! You hit a mine and lost ${fmtNu(round.bet)}.`;
      if (round.bonusDue) text += ` +${fmtNu(game.bonusNu)} bonus for ${game.bonusEvery} plays!`;
      say(text, 'lose');
      return;
    }
    round.gems += 1;
    tiles[i].classList.add('gem');
    tiles[i].innerHTML = GEM_SVG;
    sparks(tiles[i], 6, '#fbe7a8');
    sfx.gem(round.gems);
    if (round.gems === TILES - round.mines) { // every gem found
      cashOut(true);
      return;
    }
    const now = payoutFor(round.bet, round.mines, round.gems);
    if (round.gems < MIN_GEMS_TO_CASH) say(`💎 Gem ${round.gems}! Find ${MIN_GEMS_TO_CASH - round.gems} more to unlock CASH OUT.`, '');
    else say(`💎 Gem ${round.gems}! Cash out ${fmtNu(now)} or keep going?`, now > round.bet ? 'win' : '');
    updateInfo();
  }

  function finish(payout) {
    round.over = true;
    // show where everything was
    const mineSet = round.mineSet;
    tiles.forEach((t, i) => {
      t.disabled = true;
      if (t.classList.contains('gem') || t.classList.contains('boom')) return;
      setTimeout(() => { // a wave across the board
        if (mineSet.has(i)) { t.classList.add('shown-mine', 'flip'); t.innerHTML = BOMB_SVG(false); } else { t.classList.add('shown-gem', 'flip'); t.innerHTML = GEM_SVG; }
      }, 40 * ((i % 5) + Math.floor(i / 5)));
    });
    const m = mult(round.mines, round.gems);
    game.settle({
      payout, net: payout - round.bet,
      label: payout ? `Mines ${fmtX(m)} (${round.gems} 💎)` : `Mines 💣 (${round.gems} 💎)`,
      bonusDue: round.bonusDue,
    });
    if (payout) game.announceWin('SOMA Mines', fmtX(m), payout, m);
    updateInfo();
    // after a moment, the board is ready for a new round (tap any tile)
    setTimeout(() => {
      round = null;
      resetBoard();
      updateInfo();
    }, 2600);
  }

  function cashOut(all) {
    if (!round || round.over || round.gems < MIN_GEMS_TO_CASH) return;
    const payout = payoutFor(round.bet, round.mines, round.gems);
    const m = mult(round.mines, round.gems);
    finish(payout);
    let text = all ? `🏆 You found every gem! ${fmtX(m)}: ${fmtNu(payout)} added to your balance!`
      : payout > round.bet ? `🎉 Cashed out ${fmtX(m)}: ${fmtNu(payout)} added to your balance!`
        : `Cashed out ${fmtX(m)}: ${fmtNu(payout)} added to your balance.`;
    if (round.bonusDue) text += ` +${fmtNu(game.bonusNu)} bonus for ${game.bonusEvery} plays!`;
    say(text, payout > round.bet ? (m >= 10 ? 'jackpot' : 'win') : '');
    sfx.coins(payout > round.bet ? Math.min(12, 4 + Math.round(Math.log2(m + 1) * 2)) : 3);
    if (payout > round.bet) game.celebrate(m >= 10 ? 'jackpot' : m >= 3 ? 'big' : 'win');
  }
  $('minesCash').addEventListener('click', () => cashOut(false));
  $('minesRandom').addEventListener('click', () => {
    if (round && round.over) return;
    const closed = tiles.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
    if (closed.length) pick(closed[randInt(closed.length)]);
  });
  // Leaving the page mid-round with gems found cashes out for the player.
  window.addEventListener('pagehide', () => { if (round && !round.over && round.gems >= MIN_GEMS_TO_CASH) cashOut(false); });

  buildPayTable();
  updateInfo();
})();
