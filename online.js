// Player's online features: accounts (username + password, so progress follows the
// player to any phone), chat with the team (text + photos), and Nu added by the team.
import { loadFirebase, compressImage, renderMessages, MAX_TEXT } from './shared.js?v=20261109c';

const cfg = window.CHAT_CONFIG;
const game = window.LuckySpin;
const $ = (id) => document.getElementById(id);

// Usernames are turned into a login e-mail behind the scenes; players never see it.
const EMAIL_DOMAIN = '@players.luckyspin.app';
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const toEmail = (username) => username.trim().toLowerCase() + EMAIL_DOMAIN;
const fromEmail = (email) => String(email || '').split('@')[0];

if (cfg && cfg.firebase && game) start().catch(() => {});

async function start() {
  const fb = await loadFirebase();
  const app = fb.initializeApp(cfg.firebase);
  const auth = fb.getAuth(app);
  const db = fb.getFirestore(app);

  const panel = $('chatPanel');
  const list = $('chatList');
  const form = $('chatForm');
  const input = $('chatInput');
  const photo = $('chatPhoto');
  const note = $('chatNote');
  const dots = document.querySelectorAll('.unread-dot');
  const sendBtn = form.querySelector('button');
  const accountDlg = $('accountDialog');

  let uid = null;      // signed-in account
  let entered = false; // account loaded into the game
  let isOpen = false;
  let playerUnread = false;
  let ready;
  const whenReady = new Promise((r) => { ready = r; });

  const setNote = (text) => { note.textContent = text; note.hidden = !text; };
  const chatRef = () => fb.doc(db, 'chats', uid);
  const playerRef = () => fb.doc(db, 'players', uid);
  const updateBadge = () => { dots.forEach((d) => { d.hidden = !playerUnread || isOpen; }); };

  // ---------- account pop-up ----------
  accountDlg.addEventListener('cancel', (e) => e.preventDefault()); // must log in or sign up
  function showTab(which) {
    $('tabCreate').setAttribute('aria-selected', String(which === 'create'));
    $('tabLogin').setAttribute('aria-selected', String(which === 'login'));
    $('createForm').hidden = which !== 'create';
    $('loginForm').hidden = which !== 'login';
  }
  $('tabCreate').addEventListener('click', () => showTab('create'));
  $('tabLogin').addEventListener('click', () => showTab('login'));
  function showAccount(tab = 'create', message = '') {
    showTab(tab);
    $(tab === 'create' ? 'createMsg' : 'loginMsg').textContent = message;
    if (!accountDlg.open) accountDlg.showModal();
  }
  function busy(formEl, on) {
    const btn = formEl.querySelector('button[type=submit]');
    btn.disabled = on;
    btn.dataset.label = btn.dataset.label || btn.textContent;
    btn.textContent = on ? 'Please wait…' : btn.dataset.label;
  }

  $('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('createMsg');
    const username = $('createUser').value.trim();
    const password = $('createPass').value;
    const gender = (document.querySelector('input[name="cgender"]:checked') || {}).value;
    if (!USERNAME_RE.test(username)) { msg.textContent = 'Username must be 3–20 letters, numbers or _ (no spaces).'; return; }
    if (password.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; return; }
    if (!gender) { msg.textContent = 'Please choose your gender.'; return; }
    msg.textContent = '';
    busy(e.target, true);
    try {
      const current = auth.currentUser;
      let user;
      if (current && current.isAnonymous) {
        // Players from the earlier version keep their chat and progress.
        const cred = fb.EmailAuthProvider.credential(toEmail(username), password);
        user = (await fb.linkWithCredential(current, cred)).user;
      } else {
        user = (await fb.createUserWithEmailAndPassword(auth, toEmail(username), password)).user;
      }
      // One welcome gift per phone: devices/{deviceId} remembers the first account made on this phone.
      const gift = await claimWelcomeGift(user.uid, username);
      await enter(user, 'created', { username, gender, gift });
    } catch (err) {
      const code = err && err.code;
      msg.textContent = code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use'
        ? 'That username is taken. Please choose another.'
        : code === 'auth/weak-password' ? 'Password must be at least 6 characters.'
          : code === 'auth/network-request-failed' ? 'No internet connection. Please try again.'
            : 'Could not create the account. Please try again.';
    } finally {
      busy(e.target, false);
    }
  });

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('loginMsg');
    const username = $('loginUser').value.trim();
    const password = $('loginPass').value;
    if (!username || !password) { msg.textContent = 'Enter your username and password.'; return; }
    if (!USERNAME_RE.test(username)) { msg.textContent = 'Wrong username or password.'; return; }
    msg.textContent = '';
    busy(e.target, true);
    try {
      const user = (await fb.signInWithEmailAndPassword(auth, toEmail(username), password)).user;
      await enter(user, 'login');
    } catch (err) {
      const code = err && err.code;
      msg.textContent = code === 'auth/too-many-requests' ? 'Too many tries. Please wait a minute and try again.'
        : code === 'auth/network-request-failed' ? 'No internet connection. Please try again.'
          : code === 'load-failed' ? 'Could not load your account. Check your connection and try again.'
            : 'Wrong username or password.';
      if (code === 'load-failed') fb.signOut(auth).catch(() => {});
    } finally {
      busy(e.target, false);
    }
  });

  function markDeviceUsed(ownerUid, username) {
    game.ensureDeviceId();
    try { localStorage.setItem('soma.giftUsed', '1'); } catch (_) { /* ignore */ }
    const ref = fb.doc(db, 'devices', game.deviceId());
    fb.getDoc(ref).then((snap) => {
      if (!snap.exists()) return fb.setDoc(ref, { uid: ownerUid, username: String(username || '').slice(0, 20), createdAt: fb.serverTimestamp() });
      return null;
    }).catch(() => {});
  }

  // Returns true if this phone has not had a welcome gift yet (and records it), false otherwise.
  async function claimWelcomeGift(newUid, username) {
    try { if (localStorage.getItem('soma.giftUsed')) return false; } catch (_) { /* ignore */ }
    const ref = fb.doc(db, 'devices', game.deviceId());
    try {
      const snap = await Promise.race([fb.getDoc(ref), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
      if (snap.exists() && snap.data().uid !== newUid) return false;
      if (!snap.exists()) fb.setDoc(ref, { uid: newUid, username, createdAt: fb.serverTimestamp() }).catch(() => {});
    } catch (_) { /* offline or slow: still give the gift rather than block a new player */ }
    try { localStorage.setItem('soma.giftUsed', '1'); } catch (_) { /* ignore */ }
    return true;
  }

  // ---------- loading an account into the game ----------
  async function enter(user, mode, extra = {}) {
    uid = user.uid;
    if (mode === 'created') {
      if (game.idOwner === uid) game.adopt({ ...extra, owner: uid }); // earlier anonymous player
      else game.startFresh({ ...extra, owner: uid });
    } else {
      let data = null;
      try {
        const snap = await fb.getDoc(playerRef());
        data = snap.exists() ? snap.data() : null;
      } catch (_) {
        uid = null;
        const err = new Error('load failed');
        err.code = 'load-failed';
        throw err;
      }
      const localIsMine = game.localOwner === uid;
      // Use the online copy unless this phone has the same account and is at least as far along.
      if (data && !(localIsMine && game.spins >= (data.spins || 0))) game.importState(data, uid);
      else if (!localIsMine) game.startFresh({ username: fromEmail(user.email), gender: '', owner: uid });
      // otherwise this phone's progress for this account is kept and saved below
    }
    entered = true;
    // Any account used on this phone (even one made before the one-gift-per-phone check) marks the
    // phone, so a new account here does not get another welcome gift.
    if (mode !== 'created') markDeviceUsed(user.uid, game.username || fromEmail(user.email));
    if (accountDlg.open) accountDlg.close();
    document.querySelector('[data-action="logout"]').hidden = false;
    startListeners();
    // Show the pop-ups without waiting for the network: on a weak mobile signal the saves below can take
    // a long time (or wait until the signal returns), and players were left with no pop-up at all.
    // Give the ID check a moment first so the welcome usually shows the final ID.
    const idReady = claimId();
    await Promise.race([idReady, new Promise((r) => setTimeout(r, 2500))]);
    game.accountReady();
    showPlayerCount();
    if (mode === 'created') { countNewPlayer(); sendWelcomeMessage(); }
    if (mode === 'created') game.showWelcome(extra.gift === false);
    if (mode === 'created') joinedPending = true; // the first save records when the account was created
    idReady.finally(saveNow);
  }

  // ---------- automatic welcome message from the team (new accounts) ----------
  // Appears in the player's chat as a message from the team, with the red dot on the chat buttons.
  // The text must match firestore.rules exactly.
  const WELCOME_TEXT = 'Kuzuzangpo and welcome to SOMA Games! 🙏 Feel free to chat and connect with us if you have any inquiries.';
  async function sendWelcomeMessage() {
    try {
      await fb.addDoc(fb.collection(chatRef(), 'messages'), { from: 'admin', text: WELCOME_TEXT, createdAt: fb.serverTimestamp() });
      await fb.setDoc(chatRef(), {
        playerId: game.playerId, name: game.name, lastMessage: 'You: 👋 Welcome message (automatic)',
        updatedAt: fb.serverTimestamp(), unread: false, playerUnread: true,
      }, { merge: true });
    } catch (_) { /* not essential */ }
  }

  // ---------- real player count (stats/players.count) ----------
  // +1 for every new account; the owner page also sets it to the real number of accounts.
  const countRef = () => fb.doc(db, 'stats', 'players');
  function countNewPlayer() {
    fb.setDoc(countRef(), { count: fb.increment(1) }, { merge: true }).catch(() => {});
  }
  let countShown = false;
  function showPlayerCount() {
    if (countShown) return;
    countShown = true;
    fb.onSnapshot(countRef(), (snap) => {
      const n = snap.exists() ? Number(snap.data().count) : 0;
      $('playerCount').hidden = !(n > 0);
      $('playerCountNum').textContent = n.toLocaleString('en-US');
    }, () => {});
  }

  // ---------- saving progress to the account ----------
  let saveTimer = null;
  let joinedPending = false;
  function saveNow() {
    clearTimeout(saveTimer);
    if (!uid || !entered) return Promise.resolve();
    const data = { ...game.exportState(), updatedAt: fb.serverTimestamp() };
    if (joinedPending) data.joinedAt = fb.serverTimestamp(); // for the owner's "New players" list
    return fb.setDoc(playerRef(), data, { merge: true })
      .then(() => { if (data.joinedAt) joinedPending = false; })
      .catch(() => {});
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 1200);
  }
  game.onChange(saveSoon);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

  window.LuckyAccount = {
    async logout() {
      await saveNow();
      await fb.signOut(auth).catch(() => {});
      game.clearLocal();
      location.reload();
    },
  };

  // Reserve this player's ID number in ids/{number} so no two players share one.
  // The database only allows creating an ID that nobody has yet; if it is taken,
  // pick a new number and try again.
  async function claimId() {
    if (game.idOwner === uid) return;
    for (let tries = 0; tries < 8; tries++) {
      try {
        await fb.setDoc(fb.doc(db, 'ids', game.playerId), { uid });
        game.confirmId(uid);
        return;
      } catch (err) {
        if (err && err.code === 'permission-denied') game.newPlayerId(); // taken
        else return; // offline or other problem: try again next time
      }
    }
  }

  // ---------- chat ----------
  setNote('Log in to chat with the team.');

  function setOpen(open) {
    isOpen = open;
    panel.hidden = !open;
    if (open) { markRead(); list.scrollTop = list.scrollHeight; }
    updateBadge();
  }
  $('chatClose').addEventListener('click', () => setOpen(false));

  function markRead() {
    if (uid && playerUnread) {
      playerUnread = false;
      fb.setDoc(chatRef(), { playerUnread: false }, { merge: true }).catch(() => {});
    }
  }

  async function sendMessage(fields, preview) {
    await whenReady;
    await fb.addDoc(fb.collection(chatRef(), 'messages'), { from: 'player', ...fields, createdAt: fb.serverTimestamp() });
    await fb.setDoc(chatRef(), {
      playerId: game.playerId,
      name: game.name,
      lastMessage: preview.slice(0, 200),
      updatedAt: fb.serverTimestamp(),
      unread: true,
    }, { merge: true });
  }

  // Lets the game's menu open the chat and send recharge requests.
  window.LuckyChat = {
    open: () => setOpen(true),
    send: (text) => sendMessage({ text: text.slice(0, MAX_TEXT) }, text),
  };

  // ---------- big-win announcements ----------
  // Wins of ×2 or more (at least Nu 100) are posted to wins/; every other player online sees a short
  // message such as "Tashi (ID 627182) hit ×3 in SOMA Drop and won Nu 300" that fades after ~3.5 s.
  // Players who were away see the wins they missed (up to 8 from the last 24 hours) when they come
  // back, each marked with how long ago it happened. Each win is shown to a phone only once.
  const MISSED_MAX = 8;
  const MISSED_HOURS = 24;
  const SEEN_KEY = 'soma.winsSeenAt';
  const feedQueue = [];
  let feedBusy = false;
  function ago(ms) {
    const min = Math.floor((Date.now() - ms) / 60000);
    if (min < 2) return '';
    if (min < 60) return ` · ${min} min ago`;
    const h = Math.floor(min / 60);
    return ` · ${h} hour${h === 1 ? '' : 's'} ago`;
  }
  function feedText(w) {
    const who = `${w.name || 'A player'}${w.playerId ? ` (ID ${w.playerId})` : ''}`;
    const nu = `Nu ${Number(w.amount).toLocaleString('en-US')}`;
    const when = w.at ? ago(w.at) : '';
    if (w.label === 'JACKPOT') return `🏆 ${who} won the JACKPOT in ${w.game}: ${nu}!${when}`;
    if (w.label) return `🎉 ${who} hit ${w.label} in ${w.game} and won ${nu}${when}`;
    return `🎉 ${who} won ${nu} in ${w.game}${when}`;
  }
  function markSeen(ms) {
    try { if (ms > Number(localStorage.getItem(SEEN_KEY) || 0)) localStorage.setItem(SEEN_KEY, String(ms)); } catch (_) { /* ignore */ }
  }
  function showNextWin() {
    if (feedBusy || !feedQueue.length) return;
    feedBusy = true;
    const el = $('winToast');
    const w = feedQueue.shift();
    el.textContent = feedText(w);
    if (w.at) markSeen(w.at);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); feedBusy = false; setTimeout(showNextWin, 400); }, 3600);
  }
  window.LuckyFeed = {
    post(win) {
      if (!uid) return;
      fb.addDoc(fb.collection(db, 'wins'), {
        uid, name: game.name, playerId: game.playerId, game: win.game, label: win.label || '', amount: win.amount,
        createdAt: fb.serverTimestamp(),
      }).catch(() => {});
    },
  };
  function listenForWins() {
    // Start from the last win this phone has seen (at most MISSED_HOURS back), so wins that happened
    // while the player was away are shown too.
    let seen = 0;
    try { seen = Number(localStorage.getItem(SEEN_KEY) || 0); } catch (_) { /* ignore */ }
    const floor = Date.now() - MISSED_HOURS * 3600 * 1000;
    const since = fb.Timestamp.fromDate(new Date(Math.max(seen, floor)));
    fb.onSnapshot(
      fb.query(fb.collection(db, 'wins'), fb.where('createdAt', '>', since), fb.orderBy('createdAt'), fb.limitToLast(MISSED_MAX)),
      (snap) => {
        for (const ch of snap.docChanges()) {
          const d = ch.doc.data({ serverTimestamps: 'estimate' });
          const at = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().getTime() : Date.now();
          if (ch.type !== 'added') continue;
          if (d.uid === uid) { markSeen(at); continue; } // players see their own wins on the board
          feedQueue.push({ ...d, at });
          if (feedQueue.length > MISSED_MAX) feedQueue.shift(); // keep it to the latest few
        }
        showNextWin();
      },
      () => {},
    );
  }

  function startListeners() {
    ready();
    try { listenForWins(); } catch (_) { /* announcements are optional; chat and recharges keep working */ }
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

    // Nu added by the team arrive here; apply each once, then remove it.
    fb.onSnapshot(fb.collection(db, 'players', uid, 'grants'), (snap) => {
      for (const d of snap.docs) {
        const g = d.data();
        game.applyGift(d.id, Number(g.amount));
        fb.deleteDoc(d.ref).catch(() => {});
      }
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
      const image = await compressImage(file);
      await sendMessage({ image }, '📷 Photo');
      setNote('');
    } catch (err) {
      setNote(err.message && !err.code ? err.message : 'Photo not sent. Try again.');
    }
  });

  // ---------- owner tools (only when the owner is signed in on the owner page on this phone) ----------
  // The owner page signs in under its own Firebase app named 'owner'; the game reads that sign-in.
  // Players can never sign in as the owner, so they never see the link or the notifications.
  function startOwnerTools() {
    const ownerApp = fb.initializeApp(cfg.firebase, 'owner');
    const ownerAuth = fb.getAuth(ownerApp);
    const ownerDb = fb.getFirestore(ownerApp);
    const link = document.querySelector('[data-action="owner"]');
    const toast = $('ownerToast');
    let unsub = null;
    let hideTimer = null;

    $('ownerToastClose').addEventListener('click', () => { toast.hidden = true; });

    function notify(chatUid, c) {
      const text = String(c.lastMessage || '');
      const isRecharge = text.startsWith('Requested');
      const who = `${c.name || 'A player'}${c.playerId ? ` (ID ${c.playerId})` : ''}`;
      $('ownerToastTitle').textContent = isRecharge ? '💰 Recharge request' : '💬 New message';
      $('ownerToastText').textContent = `${who}\n${text.split('\n')[0]}`;
      $('ownerToastOpen').href = `admin.html?chat=${encodeURIComponent(chatUid)}`;
      toast.hidden = false;
      game.alertSound();
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { toast.hidden = true; }, 20000);
    }

    fb.onAuthStateChanged(ownerAuth, (user) => {
      const isOwner = !!user && user.uid === cfg.adminUid;
      link.hidden = !isOwner;
      if (unsub) { unsub(); unsub = null; }
      if (!isOwner) { $('ownerDot').hidden = true; return; }
      const openedAt = Date.now();
      const seen = new Map(); // chat uid -> latest message time already handled
      unsub = fb.onSnapshot(
        fb.query(fb.collection(ownerDb, 'chats'), fb.orderBy('updatedAt', 'desc'), fb.limit(100)),
        (snap) => {
          let unread = 0;
          for (const d of snap.docs) {
            const c = d.data({ serverTimestamps: 'estimate' });
            const t = c.updatedAt && c.updatedAt.toDate ? c.updatedAt.toDate().getTime() : 0;
            const handled = seen.get(d.id) || openedAt;
            if (c.unread) unread++;
            if (c.unread && t > handled) notify(d.id, c); // only messages that arrive while the game is open
            seen.set(d.id, Math.max(handled, t));
          }
          $('ownerCount').textContent = String(unread);
          $('ownerCount').hidden = !unread;
          $('ownerDot').hidden = !unread;
        },
        () => {},
      );
    });
  }
  startOwnerTools();

  // ---------- start: already logged in on this phone? ----------
  let checked = false;
  fb.onAuthStateChanged(auth, (user) => {
    if (checked) return;
    checked = true;
    if (user && !user.isAnonymous) {
      enter(user, 'resume').catch(() => showAccount('login', 'Could not load your account. Check your connection and log in again.'));
    } else {
      showAccount(game.localOwner ? 'login' : 'create');
    }
  });
}
