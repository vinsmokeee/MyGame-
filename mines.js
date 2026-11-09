// SOMA Mines: a 5×5 board hides 💎 gems and 💣 mines. The player picks the bet and how many mines
// (1, 3, 5 or 10), then taps tiles. Each gem raises the prize; a mine ends the round. Cash out any
// time. Uses the shared SOMA account and Nu balance (window.LuckySpin).
(() => {
  'use strict';
  const game = window.LuckySpin;
  if (!game) return;

  // ---------- settings ----------
  const BETS = [20, 50, 100, 500];
  const MINE_CHOICES = [1, 3, 5, 10];
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
  let mines = 3;
  let round = null; // { bet, mines, mineSet, gems, over, bonusDue }

  // ---------- prize table + first-time note ----------
  window.SOMA_PRIZES = window.SOMA_PRIZES || [];
  window.SOMA_PRIZES.push({
    id: 'mines',
    title: '💎 SOMA Mines',
    help: [
      'Pick your bet.',
      'Choose how many mines are hidden: 1, 3, 5 or 10. More mines = bigger prizes, but more danger!',
      'Tap tiles to find 💎 gems. Every gem raises your prize.',
      'Cash out any time, before you hit a 💣 mine!',
      'Example prizes below: 3 mines, after finding 3, 5 and 8 gems.',
    ],
    // with 3 mines: prize after 3, 5 and 8 gems
    prizes: (b) => [3, 5, 8].map((g) => payoutFor(b, 3, g)),
  });

  function buildPayTable() {
    const gemsCols = [1, 2, 3, 5, 8];
    const head = $('minesPayHead');
    const body = $('minesPayBody');
    head.replaceChildren();
    body.replaceChildren();
    const tr = document.createElement('tr');
    for (const t of ['Mines', ...gemsCols.map((g) => `${g} 💎`)]) { const th = document.createElement('th'); th.textContent = t; tr.append(th); }
    head.append(tr);
    for (const m of MINE_CHOICES) {
      const row = document.createElement('tr');
      const first = document.createElement('td');
      first.textContent = `${m} 💣`;
      row.append(first);
      for (const g of gemsCols) { const td = document.createElement('td'); td.textContent = g <= TILES - m ? fmtX(mult(m, g)) : '—'; if (m === mines) td.className = 'jp'; row.append(td); }
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
    for (const t of tiles) { t.className = 'mine-tile'; t.textContent = ''; t.disabled = false; }
  }

  const msgEl = $('minesMessage');
  const say = (text, cls = '') => { msgEl.textContent = text; msgEl.className = 'message' + (cls ? ' ' + cls : ''); };

  function updateInfo() {
    const playing = round && !round.over;
    const m = playing ? round.mines : mines;
    const g = playing ? round.gems : 0;
    const b = playing ? round.bet : bet;
    const next = g < TILES - m ? mult(m, g + 1) : 0;
    $('minesNext').textContent = next ? `${fmtX(next)} → ${fmtNu(Math.min(MAX_WIN, b * next))}` : '—';
    $('minesNow').textContent = playing && g > 0 ? `${fmtX(mult(m, g))} = ${fmtNu(payoutFor(b, m, g))}` : '—';
    const canCash = playing && g > 0;
    $('minesCash').disabled = !canCash;
    $('minesCash').textContent = canCash ? `CASH OUT ${fmtNu(payoutFor(b, m, g))}` : 'CASH OUT';
    document.querySelectorAll('#minesBets button, #minesCount button').forEach((x) => { x.disabled = !!playing; });
  }

  document.querySelectorAll('#minesBets button').forEach((b) => {
    b.addEventListener('click', () => {
      if (round && !round.over) return;
      document.querySelectorAll('#minesBets button').forEach((x) => x.classList.toggle('on', x === b));
      bet = Number(b.dataset.bet);
      say(`Bet ${fmtNu(bet)} with ${mines} mine${mines === 1 ? '' : 's'}. Tap any tile to start.`);
      updateInfo();
    });
  });
  document.querySelectorAll('#minesCount button').forEach((b) => {
    b.addEventListener('click', () => {
      if (round && !round.over) return;
      document.querySelectorAll('#minesCount button').forEach((x) => x.classList.toggle('on', x === b));
      mines = Number(b.dataset.mines);
      say(`${mines} mine${mines === 1 ? '' : 's'} hidden. ${mines >= 5 ? 'Big prizes, big danger!' : mines === 1 ? 'Safer, smaller prizes.' : 'Tap any tile to start.'}`);
      buildPayTable();
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
      tiles[i].classList.add('boom');
      tiles[i].textContent = '💥';
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
    tiles[i].textContent = '💎';
    sfx.gem(round.gems);
    if (round.gems === TILES - round.mines) { // every gem found
      cashOut(true);
      return;
    }
    const now = payoutFor(round.bet, round.mines, round.gems);
    say(`💎 Gem ${round.gems}! Prize ${fmtX(mult(round.mines, round.gems))} = ${fmtNu(now)}. Cash out or keep going?`, now > round.bet ? 'win' : '');
    updateInfo();
  }

  function finish(payout) {
    round.over = true;
    // show where everything was
    tiles.forEach((t, i) => {
      t.disabled = true;
      if (t.classList.contains('gem') || t.classList.contains('boom')) return;
      if (round.mineSet.has(i)) { t.classList.add('shown-mine'); t.textContent = '💣'; } else { t.classList.add('shown-gem'); t.textContent = '💎'; }
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
    }, 2200);
  }

  function cashOut(all) {
    if (!round || round.over || round.gems === 0) return;
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
  // Leaving the page mid-round with gems found cashes out for the player.
  window.addEventListener('pagehide', () => { if (round && !round.over && round.gems > 0) cashOut(false); });

  buildPayTable();
  updateInfo();
})();
