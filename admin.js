// Owner tools: see players, give Nu, and chat (text + photos).
import { loadFirebase, compressImage, renderMessages, fmtNu, fmtTime, MAX_TEXT } from './shared.js';

const cfg = window.CHAT_CONFIG;
const $ = (id) => document.getElementById(id);
const baseTitle = document.title;
const MAX_GIFT = 1000000000;

if (cfg && cfg.firebase) start().catch(() => { $('notReady').hidden = false; });

async function start() {
  const fb = await loadFirebase();
  // Separate app name so the owner's sign-in never replaces the player's own game sign-in in this browser.
  const app = fb.initializeApp(cfg.firebase, 'owner');
  const auth = fb.getAuth(app);
  const db = fb.getFirestore(app);

  $('notReady').hidden = true;
  $('login').hidden = false;

  let players = new Map(); // uid -> player
  let chats = [];
  let unsubs = [];
  let unsubThread = null;
  let current = null; // uid of open chat

  const status = (el, text, ok) => { el.textContent = text; el.className = 'status ' + (ok ? 'ok' : 'err'); };
  const playerLabel = (uid, fallback = {}) => {
    const p = players.get(uid) || {};
    return { name: p.name || fallback.name || 'Unknown player', id: p.playerId || fallback.playerId || '' };
  };

  // ----- sign-in -----
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    status($('loginMsg'), 'Signing in…', true);
    try {
      await fb.signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPass').value);
      $('loginPass').value = '';
      status($('loginMsg'), '', true);
    } catch (_) {
      status($('loginMsg'), 'Sign-in failed. Check the email and password.', false);
    }
  });
  $('signOut').addEventListener('click', () => fb.signOut(auth));

  fb.onAuthStateChanged(auth, (user) => {
    unsubs.forEach((u) => u()); unsubs = [];
    closeThread();
    if (user && user.uid !== cfg.adminUid) {
      fb.signOut(auth);
      status($('loginMsg'), 'That account is not the owner account.', false);
      return;
    }
    $('login').hidden = !!user;
    $('dash').hidden = !user;
    if (!user) { setCount(0); return; }

    unsubs.push(fb.onSnapshot(
      fb.query(fb.collection(db, 'players'), fb.orderBy('updatedAt', 'desc'), fb.limit(500)),
      (snap) => {
        players = new Map(snap.docs.map((d) => [d.id, { uid: d.id, ...d.data({ serverTimestamps: 'estimate' }) }]));
        renderPlayers();
        renderIndex();
        if (current) renderThreadHead();
      },
      () => status($('threadMsg'), 'Could not load players. Check the Firestore rules.', false),
    ));
    unsubs.push(fb.onSnapshot(
      fb.query(fb.collection(db, 'chats'), fb.orderBy('updatedAt', 'desc'), fb.limit(200)),
      (snap) => {
        chats = snap.docs.map((d) => ({ uid: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        renderIndex();
      },
    ));
  });

  // ----- tabs -----
  function showTab(which) {
    $('tabPlayers').setAttribute('aria-selected', String(which === 'players'));
    $('tabInbox').setAttribute('aria-selected', String(which === 'inbox'));
    $('playersView').hidden = which !== 'players';
    $('inboxView').hidden = which !== 'inbox';
  }
  $('tabPlayers').addEventListener('click', () => showTab('players'));
  $('tabInbox').addEventListener('click', () => showTab('inbox'));

  function setCount(n) {
    $('inboxCount').hidden = !n;
    $('inboxCount').textContent = n;
    document.title = n ? `(${n}) ${baseTitle}` : baseTitle;
  }

  // ----- giving Nu -----
  const rechargeText = (amount) => `Recharge of ${fmtNu(amount)} successfully added`;
  async function giveNu(uid, amount) {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_GIFT) {
      throw new Error(`Enter a whole number from 1 to ${MAX_GIFT.toLocaleString('en-US')}.`);
    }
    await fb.addDoc(fb.collection(db, 'players', uid, 'grants'), { amount, createdAt: fb.serverTimestamp() });
  }

  // ----- players tab -----
  $('search').addEventListener('input', renderPlayers);
  // Rows are kept and updated in place, so typed amounts and "Sent" messages survive live updates.
  const rows = new Map(); // uid -> li
  function renderPlayers() {
    const q = $('search').value.trim().toLowerCase();
    const ul = $('playerList');
    const shown = [...players.values()].filter((p) => !q
      || [p.name, p.playerId, p.username].some((v) => String(v || '').toLowerCase().includes(q)));
    ul.replaceChildren();
    if (!shown.length) {
      const li = document.createElement('li');
      li.className = 'chat-empty';
      li.textContent = players.size ? 'No players match.' : 'No players yet. They appear here once they open the game.';
      ul.append(li);
    }
    for (const p of shown) {
      const li = rows.get(p.uid) || createRow(p.uid);
      li.querySelector('.idtag').textContent = `ID ${p.playerId || '?'}`;
      li.querySelector('.nm').textContent = p.name || 'Unnamed';
      li.querySelector('.meta').textContent = fmtTime(p.updatedAt);
      li.querySelector('.sub').textContent = [p.username && `@${p.username}`, p.gender, `Balance ${fmtNu(p.nu || 0)}`, `${p.spins || 0} spins`].filter(Boolean).join(' · ');
      ul.append(li);
    }
  }
  function createRow(uid) {
    {
      const li = document.createElement('li');
      li.className = 'item';
      li.innerHTML = `
        <div class="item-top"><span class="who"><span class="idtag"></span><span class="nm"></span></span><span class="meta"></span></div>
        <div class="sub"></div>
        <form class="actions">
          <input type="number" inputmode="numeric" min="1" step="1" value="100" aria-label="Nu to give">
          <button class="primary small" type="submit">Add Nu</button>
          <button class="secondary small" type="button" data-chat>💬 Chat</button>
        </form>
        <p class="status" role="status"></p>`;
      const form = li.querySelector('form');
      const msg = li.querySelector('.status');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = Number(form.querySelector('input').value);
        const name = (players.get(uid) || {}).name || 'player';
        try {
          await giveNu(uid, amount);
          await send({ text: rechargeText(amount) }, rechargeText(amount), uid).catch(() => {});
          status(msg, `Sent ${fmtNu(amount)} to ${name} (ID ${(players.get(uid) || {}).playerId || '?'}).`, true);
        } catch (err) { status(msg, err.message || 'Could not send Nu.', false); }
      });
      li.querySelector('[data-chat]').addEventListener('click', () => { showTab('inbox'); openThread(uid); });
      rows.set(uid, li);
      return li;
    }
  }

  // ----- inbox -----
  function renderIndex() {
    setCount(chats.filter((c) => c.unread).length);
    const ul = $('chatIndex');
    ul.innerHTML = '';
    if (!chats.length) {
      const li = document.createElement('li');
      li.className = 'chat-empty';
      li.textContent = 'No messages yet.';
      ul.append(li);
    }
    for (const c of chats) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'item' + (c.unread ? ' unread' : '');
      const who = playerLabel(c.uid, c);
      b.innerHTML = '<div class="item-top"><span class="who"><span class="idtag"></span><span class="nm"></span></span><span class="meta"></span></div><div class="sub"></div>';
      b.querySelector('.idtag').textContent = `ID ${who.id || '?'}`;
      b.querySelector('.nm').textContent = who.name;
      b.querySelector('.meta').textContent = fmtTime(c.updatedAt);
      b.querySelector('.sub').textContent = c.lastMessage || '';
      b.addEventListener('click', () => openThread(c.uid));
      li.append(b);
      ul.append(li);
    }
  }

  function renderThreadHead() {
    const c = chats.find((x) => x.uid === current) || {};
    const who = playerLabel(current, c);
    const p = players.get(current);
    $('threadName').textContent = who.name;
    $('threadMeta').textContent = [`ID ${who.id || '?'}`, p && p.gender, p && fmtNu(p.nu || 0)].filter(Boolean).join(' · ');
  }

  function openThread(uid) {
    closeThread();
    current = uid;
    $('chatIndex').hidden = true;
    $('thread').hidden = false;
    status($('threadMsg'), '', true);
    renderThreadHead();
    const chatRef = fb.doc(db, 'chats', uid);
    let first = true;
    unsubThread = fb.onSnapshot(
      fb.query(fb.collection(chatRef, 'messages'), fb.orderBy('createdAt'), fb.limitToLast(200)),
      (snap) => {
        renderMessages($('threadList'), snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' })), 'admin', 'No messages yet.');
        if (first) $('threadList').scrollTop = $('threadList').scrollHeight;
        first = false;
        if ((chats.find((x) => x.uid === uid) || {}).unread) {
          fb.setDoc(chatRef, { unread: false }, { merge: true }).catch(() => {});
        }
      },
    );
  }

  function closeThread() {
    if (unsubThread) { unsubThread(); unsubThread = null; }
    current = null;
    $('thread').hidden = true;
    $('chatIndex').hidden = false;
  }
  $('backToInbox').addEventListener('click', closeThread);

  async function send(fields, preview, uid = current) {
    const chatRef = fb.doc(db, 'chats', uid);
    await fb.addDoc(fb.collection(chatRef, 'messages'), { from: 'admin', ...fields, createdAt: fb.serverTimestamp() });
    const who = playerLabel(uid);
    const extra = {};
    if (who.id) extra.playerId = who.id;
    if (players.get(uid)) extra.name = who.name;
    await fb.setDoc(chatRef, {
      ...extra, lastMessage: ('You: ' + preview).slice(0, 200), updatedAt: fb.serverTimestamp(), playerUnread: true, unread: false,
    }, { merge: true });
  }

  $('replyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('replyInput').value.trim().slice(0, MAX_TEXT);
    if (!text || !current) return;
    try {
      await send({ text }, text);
      $('replyInput').value = '';
      status($('threadMsg'), '', true);
    } catch (_) { status($('threadMsg'), 'Reply not sent. Try again.', false); }
  });

  $('replyPhoto').addEventListener('change', async () => {
    const file = $('replyPhoto').files[0];
    $('replyPhoto').value = '';
    if (!file || !current) return;
    status($('threadMsg'), 'Sending photo…', true);
    try {
      await send({ image: await compressImage(file) }, '📷 Photo');
      status($('threadMsg'), '', true);
    } catch (err) { status($('threadMsg'), err.message && !err.code ? err.message : 'Photo not sent.', false); }
  });

  $('threadGift').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current) return;
    const amount = Number($('threadGiftAmount').value);
    try {
      await giveNu(current, amount);
      await send({ text: rechargeText(amount) }, rechargeText(amount));
      status($('threadMsg'), `Sent ${fmtNu(amount)}.`, true);
    } catch (err) { status($('threadMsg'), err.message || 'Could not send Nu.', false); }
  });
}
