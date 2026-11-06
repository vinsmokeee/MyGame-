// Player's online features: chat with the owner (text + photos),
// Nu gifts from the owner, and sharing name/balance with the owner.
import { loadFirebase, compressImage, renderMessages, MAX_TEXT } from './shared.js';

const cfg = window.CHAT_CONFIG;
const game = window.LuckySpin;
const $ = (id) => document.getElementById(id);

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

  let uid = null;
  let isOpen = false;
  let playerUnread = false;
  let ready;
  const whenReady = new Promise((r) => { ready = r; });

  const setNote = (text) => { note.textContent = text; note.hidden = !text; };
  const chatRef = () => fb.doc(db, 'chats', uid);
  const updateBadge = () => { dots.forEach((d) => { d.hidden = !playerUnread || isOpen; }); };

  setNote('Connecting…');

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

  // Share name, ID and balance with the owner (throttled).
  let syncTimer = null;
  function syncProfile(delay = 1500) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      if (!uid) return;
      fb.setDoc(fb.doc(db, 'players', uid), {
        name: game.name, playerId: game.playerId, nu: game.nu, spins: game.spins, updatedAt: fb.serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }, delay);
  }
  game.onChange(() => syncProfile());

  fb.onAuthStateChanged(auth, (user) => {
    if (!user || uid) return;
    uid = user.uid;
    ready();
    setNote('');
    input.disabled = false;
    photo.disabled = false;
    sendBtn.disabled = false;
    syncProfile(0);

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

    // Nu sent by the owner arrive here; apply each once, then remove it.
    fb.onSnapshot(fb.collection(db, 'players', uid, 'grants'), (snap) => {
      for (const d of snap.docs) {
        const g = d.data();
        game.applyGift(d.id, Number(g.amount));
        fb.deleteDoc(d.ref).catch(() => {});
      }
    }, () => {});
  });
  fb.signInAnonymously(auth).catch(() => setNote('Chat is unavailable right now.'));

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
}
