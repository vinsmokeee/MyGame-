// SOMA Drop: a Plinko-style points game. Players log in with their Lucky Spin account, so the name and
// ID are the same in both games. Chat goes to the same owner inbox as Lucky Spin (chats/{uid}).
// Nu are play points only, not real money.
import { loadFirebase, compressImage, renderMessages, fmtNu, MAX_TEXT } from './shared.js';

// ---------- settings you can change ----------
const START_NU = 1000;   // Drop balance for a player's first game
const REFILL_NU = 500;   // free refill when a player has less than the smallest bet
const BETS = [10, 50, 100, 500];
// Slots from left to right (13 slots, 12 rows of pins). m = multiplier of the bet.
// Most balls land in the middle, so the middle pays ×0.5; the edges are rare and pay the most.
const SLOTS = [
  { t: 'JACKPOT', m: 100, c: '#ff3df2' },
  { t: '×5', m: 5, c: '#ff8a3d' },
  { t: '×3', m: 3, c: '#ffd447' },
  { t: '×2', m: 2, c: '#4ade80' },
  { t: '×0.5', m: 0.5, c: '#5d8bff' },
  { t: '×0.5', m: 0.5, c: '#5d8bff' },
  { t: '×0.5', m: 0.5, c: '#5d8bff' },
  { t: '×0.5', m: 0.5, c: '#5d8bff' },
  { t: '×0.5', m: 0.5, c: '#5d8bff' },
  { t: '×2', m: 2, c: '#4ade80' },
  { t: '×3', m: 3, c: '#ffd447' },
  { t: '×5', m: 5, c: '#ff8a3d' },
  { t: 'JACKPOT', m: 100, c: '#ff3df2' },
];
// Lines shown under the payout table. Edit these to list your real prizes.
const PRIZE_NOTES = [
  'Land in a JACKPOT slot (the two edges) to win 100× your bet.',
  'Most balls land in the middle (×0.5). The edges pay the most but are rare.',
  'Nu are play points only. No real money is paid in or out.',
];

const cfg = window.CHAT_CONFIG;
const $ = (id) => document.getElementById(id);
const EMAIL_DOMAIN = '@players.luckyspin.app';
const toEmail = (username) => username.trim().toLowerCase() + EMAIL_DOMAIN;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

// ---------- state ----------
let uid = null;
let profile = { name: '', playerId: '' };
let bal = { nu: START_NU, best: START_NU, drops: 0 };
let bet = 50;
let loggedIn = false;
let remoteOk = true; // false once an online save is refused (e.g. rules not updated yet)
let saveRemote = () => Promise.resolve();

const localKey = () => 'somaDrop:' + (uid || 'guest');
function saveLocal() { try { localStorage.setItem(localKey(), JSON.stringify(bal)); } catch (_) { /* ignore */ } }
function loadLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(localKey()));
    if (v && Number.isFinite(v.nu)) return { nu: v.nu, best: v.best || v.nu, drops: v.drops || 0 };
  } catch (_) { /* ignore */ }
  return null;
}
let saveTimer = null;
function saveSoon(now) {
  saveLocal();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveRemote(), now ? 0 : 1000);
}

// ---------- page text ----------
const msgEl = $('message');
function say(text, cls = '') { msgEl.textContent = text; msgEl.className = 'message ' + cls; }
function render() {
  $('nu').textContent = fmtNu(bal.nu);
  $('best').textContent = fmtNu(bal.best);
  $('drops').textContent = String(bal.drops);
  $('playerName').textContent = profile.name || 'Not logged in';
  $('playerId').textContent = profile.playerId || '------';
  $('dropBtn').disabled = !loggedIn;
  $('refill').hidden = !(loggedIn && bal.nu < BETS[0]);
}

function buildPrizes() {
  const head = $('payHead');
  const body = $('payBody');
  const kinds = [];
  for (const s of SLOTS) if (!kinds.some((k) => k.m === s.m)) kinds.push(s);
  kinds.sort((a, b) => b.m - a.m);
  const tr = document.createElement('tr');
  const corner = document.createElement('th');
  corner.textContent = 'Bet';
  tr.append(corner);
  for (const k of kinds) {
    const th = document.createElement('th');
    th.textContent = k.m >= 100 ? 'JACKPOT' : k.t;
    if (k.m >= 100) th.className = 'jp';
    tr.append(th);
  }
  head.append(tr);
  for (const b of BETS) {
    const row = document.createElement('tr');
    const first = document.createElement('td');
    first.textContent = 'Nu ' + b;
    row.append(first);
    for (const k of kinds) {
      const td = document.createElement('td');
      td.textContent = (Math.floor(b * k.m * 10) / 10).toLocaleString('en-US');
      if (k.m >= 100) td.className = 'jp';
      row.append(td);
    }
    body.append(row);
  }
  for (const line of PRIZE_NOTES) {
    const li = document.createElement('li');
    li.textContent = line;
    $('prizeNotes').append(li);
  }
}

document.querySelectorAll('#bets button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#bets button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    bet = Number(b.dataset.bet);
  });
});
$('refill').addEventListener('click', () => {
  bal.nu += REFILL_NU;
  bal.best = Math.max(bal.best, bal.nu);
  saveSoon(true);
  render();
  say(`${fmtNu(REFILL_NU)} added. Good luck! 🍀`, 'win');
});

// ---------- board ----------
// The slot is decided fairly when the ball is dropped: at each of the 12 rows of pins the ball goes left or
// right with equal chance (like a real Plinko board), so most balls land in the middle and the edges are rare.
// The animation then shows the ball hopping down exactly that path. Where you tap makes no difference.
const W = 360;
const H = 520;
const N = SLOTS.length; // 13 slots = 12 rows of pins
const ROWS = N - 1;
const CW = W / N;
const PIN_R = 3.5;
const BALL_R = 6;
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
const pinX = (r, m) => W / 2 + (2 * m - r) * (CW / 2); // pin m (0..r) in row r
const pins = [];
for (let r = 0; r < ROWS; r++) for (let m = 0; m <= r; m++) pins.push({ x: pinX(r, m), y: pinY(r) });

// Fair coin flips from the browser's secure random numbers.
function flips() {
  const a = new Uint8Array(ROWS);
  crypto.getRandomValues(a);
  return Array.from(a, (v) => v & 1);
}

let balls = [];
let pops = [];
const flash = {};

function dropBall() {
  if (!loggedIn) { say('Log in to play.', 'lose'); return; }
  if (bal.nu < bet) { say('Not enough Nu for that bet. Pick a smaller one.', 'lose'); return; }
  if (balls.filter((b) => !b.done).length >= 8) return;
  bal.nu -= bet;
  bal.drops += 1;
  saveSoon(true); // save the bet right away so reloading the page cannot cancel it
  render();
  const path = flips();
  const slot = path.reduce((s, v) => s + v, 0);
  // Waypoints: top of the board, above each pin the ball hits, then the slot.
  const pts = [{ x: W / 2, y: 14 }];
  let k = 0;
  for (let r = 0; r < ROWS; r++) {
    pts.push({ x: pinX(r, k) + (Math.random() - 0.5) * 2, y: pinY(r) - PIN_R - BALL_R });
    k += path[r];
  }
  pts.push({ x: (slot + 0.5) * CW, y: LAND_Y });
  balls.push({ bet, slot, pts, seg: 0, f: 0, x: W / 2, y: 14, done: false, fade: 1 });
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
  // Hops arc up a little after each pin; the last drop into the slot just falls.
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
  const win = Math.floor(b.bet * slot.m * 10) / 10;
  bal.nu += win;
  bal.best = Math.max(bal.best, bal.nu);
  saveSoon();
  render();
  flash[b.slot] = 1;
  pops.push({ x: Math.max(30, Math.min(W - 30, (b.slot + 0.5) * CW)), y: LAND_Y - 20, t: 1, txt: '+' + fmtNu(win), c: slot.c });
  if (slot.m >= 100) say(`🎉 JACKPOT! You won ${fmtNu(win)}!`, 'jackpot');
  else if (win >= b.bet) say(`${slot.t} → ${fmtNu(win)}`, 'win');
  else say(`${slot.t} → ${fmtNu(win)}`, 'lose');
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
  g.addColorStop(0, '#1a1448');
  g.addColorStop(1, '#0d0a26');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < N; i++) {
    const sl = SLOTS[i];
    const x = i * CW;
    const f = flash[i] || 0;
    ctx.fillStyle = sl.c;
    ctx.globalAlpha = 0.22 + f * 0.6;
    roundRect(x + 1.5, SLOT_TOP + 8, CW - 3, H - SLOT_TOP - 12, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (sl.m >= 100) {
      ctx.font = 'bold 7px system-ui';
      ctx.fillStyle = sl.c;
      ctx.fillText('JACK', x + CW / 2, H - 22);
      ctx.fillText('POT', x + CW / 2, H - 13);
      ctx.font = '11px system-ui';
      ctx.fillText('💎', x + CW / 2, H - 38);
    } else {
      ctx.font = 'bold 10px system-ui';
      ctx.fillStyle = '#fff';
      ctx.fillText(sl.t, x + CW / 2, H - 22);
    }
    if (flash[i]) flash[i] = Math.max(0, f - 0.03);
  }
  ctx.strokeStyle = '#6a58d6';
  ctx.lineWidth = 2;
  for (let k = 1; k < N; k++) {
    ctx.beginPath();
    ctx.moveTo(k * CW, SLOT_TOP);
    ctx.lineTo(k * CW, H - 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#d9d2ff';
  for (const p of pins) { ctx.beginPath(); ctx.arc(p.x, p.y, PIN_R, 0, 7); ctx.fill(); }

  for (const b of balls) {
    ctx.globalAlpha = b.fade;
    const gr = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R);
    gr.addColorStop(0, '#fff7c2');
    gr.addColorStop(1, '#ffa800');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const p of pops) {
    ctx.globalAlpha = Math.max(0, p.t);
    ctx.fillStyle = p.c;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(p.txt, p.x, p.y);
    ctx.fillText(p.txt, p.x, p.y);
    ctx.globalAlpha = 1;
  }
}

function loop() {
  for (const b of balls) if (!b.done) step(b);
  for (const b of balls) if (b.done) b.fade -= 0.02;
  balls = balls.filter((b) => b.fade > 0);
  for (const p of pops) { p.t -= 0.015; p.y -= 0.5; }
  pops = pops.filter((p) => p.t > 0);
  draw();
  requestAnimationFrame(loop);
}

buildPrizes();
render();
loop();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSoon(true); });

// ---------- online: login, profile, balance, chat ----------
if (cfg && cfg.firebase) start().catch(() => { say('Could not connect. Check your internet and reload.', 'lose'); });
else say('Online features are not set up yet.', 'lose');

async function start() {
  const fb = await loadFirebase();
  const app = fb.initializeApp(cfg.firebase); // same default app as Lucky Spin, so the login is shared
  const auth = fb.getAuth(app);
  const db = fb.getFirestore(app);
  const dlg = $('accountDialog');

  dlg.addEventListener('cancel', (e) => e.preventDefault());

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('loginMsg');
    const username = $('loginUser').value.trim();
    const password = $('loginPass').value;
    if (!username || !password) { msg.textContent = 'Enter your username and password.'; return; }
    if (!USERNAME_RE.test(username)) { msg.textContent = 'Wrong username or password.'; return; }
    msg.textContent = '';
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const user = (await fb.signInWithEmailAndPassword(auth, toEmail(username), password)).user;
      await enter(user);
    } catch (err) {
      const code = err && err.code;
      msg.textContent = code === 'auth/too-many-requests' ? 'Too many tries. Please wait a minute and try again.'
        : code === 'auth/network-request-failed' ? 'No internet connection. Please try again.'
          : code === 'no-profile' ? 'Open Lucky Spin once first so your ID is created, then come back.'
            : 'Wrong username or password.';
    } finally {
      btn.disabled = false;
    }
  });

  async function enter(user) {
    if (user.isAnonymous) { const e = new Error('no profile'); e.code = 'no-profile'; throw e; }
    uid = user.uid;
    const snap = await fb.getDoc(fb.doc(db, 'players', uid));
    const data = snap.exists() ? snap.data() : null;
    if (!data || !data.playerId) { uid = null; const e = new Error('no profile'); e.code = 'no-profile'; throw e; }
    profile = { name: data.name || data.username || 'Player', playerId: String(data.playerId) };

    // Balance: the online copy if there is one, otherwise this phone's copy, otherwise a fresh start.
    const local = loadLocal();
    if (Number.isFinite(data.dropNu)) bal = { nu: data.dropNu, best: data.dropBest || data.dropNu, drops: data.drops || 0 };
    else if (local) bal = local;
    else bal = { nu: START_NU, best: START_NU, drops: 0 };

    saveRemote = () => {
      if (!uid || !remoteOk) return Promise.resolve();
      return fb.setDoc(fb.doc(db, 'players', uid),
        { dropNu: bal.nu, dropBest: bal.best, drops: bal.drops, updatedAt: fb.serverTimestamp() }, { merge: true })
        .catch((err) => { if (err && err.code === 'permission-denied') remoteOk = false; });
    };

    loggedIn = true;
    if (dlg.open) dlg.close();
    render();
    say(`Welcome, ${profile.name}! Pick a bet and drop the ball.`);
    saveSoon(true);
    startChat();
  }

  // ----- chat with the owner (same inbox as Lucky Spin) -----
  const panel = $('chatPanel');
  const list = $('chatList');
  const form = $('chatForm');
  const input = $('chatInput');
  const photo = $('chatPhoto');
  const note = $('chatNote');
  const sendBtn = form.querySelector('button');
  const dot = $('chatDot');
  let isOpen = false;
  let playerUnread = false;
  let chatStarted = false;

  const setNote = (text) => { note.textContent = text; note.hidden = !text; };
  const chatRef = () => fb.doc(db, 'chats', uid);
  const updateBadge = () => { dot.hidden = !playerUnread || isOpen; };
  function markRead() {
    if (uid && playerUnread) {
      playerUnread = false;
      fb.setDoc(chatRef(), { playerUnread: false }, { merge: true }).catch(() => {});
    }
  }
  function setOpen(open) {
    isOpen = open;
    panel.hidden = !open;
    if (open) { markRead(); list.scrollTop = list.scrollHeight; }
    updateBadge();
  }
  $('contactBtn').addEventListener('click', () => setOpen(true));
  $('chatClose').addEventListener('click', () => setOpen(false));
  setNote('Log in to chat with the team.');

  async function sendMessage(fields, preview) {
    await fb.addDoc(fb.collection(chatRef(), 'messages'), { from: 'player', ...fields, createdAt: fb.serverTimestamp() });
    await fb.setDoc(chatRef(), {
      playerId: profile.playerId,
      name: profile.name,
      lastMessage: preview.slice(0, 200),
      updatedAt: fb.serverTimestamp(),
      unread: true,
    }, { merge: true });
  }

  function startChat() {
    if (chatStarted) return;
    chatStarted = true;
    setNote('');
    input.disabled = false;
    photo.disabled = false;
    sendBtn.disabled = false;
    fb.onSnapshot(
      fb.query(fb.collection(chatRef(), 'messages'), fb.orderBy('createdAt'), fb.limitToLast(100)),
      (snap) => renderMessages(list, snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' })), 'player',
        'Send us a message and we will reply here. You can also send photos with 📷.'),
      () => setNote('Chat is unavailable right now.'),
    );
    fb.onSnapshot(chatRef(), (snap) => {
      const data = snap.data();
      playerUnread = !!(data && data.playerUnread);
      if (isOpen) markRead();
      updateBadge();
    }, () => {});
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, MAX_TEXT);
    if (!text) return;
    sendBtn.disabled = true;
    try {
      await sendMessage({ text }, text);
      input.value = '';
      setNote('');
    } catch (_) {
      setNote('Message not sent. Check your connection and try again.');
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });
  photo.addEventListener('change', async () => {
    const file = photo.files[0];
    photo.value = '';
    if (!file) return;
    setNote('Sending photo…');
    try {
      await sendMessage({ image: await compressImage(file) }, '📷 Photo');
      setNote('');
    } catch (err) {
      setNote(err.message && !err.code ? err.message : 'Photo not sent. Try again.');
    }
  });

  // ----- already logged in to Lucky Spin on this phone? -----
  let checked = false;
  fb.onAuthStateChanged(auth, (user) => {
    if (checked) return;
    checked = true;
    if (user && !user.isAnonymous) {
      enter(user).catch(() => { dlg.showModal(); });
    } else {
      dlg.showModal();
    }
  });
}
