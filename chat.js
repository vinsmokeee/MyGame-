// Player side of the in-game chat with the owner.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, onSnapshot, query, orderBy, limitToLast, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const MAX_LEN = 500;
const CODE_RE = /LS1\.[A-Z0-9]+\.\d+\.[A-Z0-9]+\.[A-Za-z0-9_-]+/;
const cfg = window.CHAT_CONFIG;
const $ = (id) => document.getElementById(id);
const fab = $('chatFab');
const panel = $('chatPanel');
const list = $('chatList');
const form = $('chatForm');
const input = $('chatInput');
const note = $('chatNote');
const badge = $('chatBadge');

if (cfg && cfg.firebase) start();

function start() {
  fab.hidden = false;
  const app = initializeApp(cfg.firebase);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let chatRef = null;
  let isOpen = false;
  let playerUnread = false;

  const setNote = (text) => { note.textContent = text; note.hidden = !text; };
  setNote('Connecting…');

  function setOpen(open) {
    isOpen = open;
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    if (open) {
      markRead();
      list.scrollTop = list.scrollHeight;
      input.focus();
    }
    updateBadge();
  }
  fab.addEventListener('click', () => setOpen(!isOpen));
  $('chatClose').addEventListener('click', () => setOpen(false));

  const updateBadge = () => { badge.hidden = !playerUnread || isOpen; };

  function markRead() {
    if (chatRef && playerUnread) {
      playerUnread = false;
      setDoc(chatRef, { playerUnread: false }, { merge: true }).catch(() => {});
    }
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    chatRef = doc(db, 'chats', user.uid);
    setNote('');
    input.disabled = false;
    form.querySelector('button').disabled = false;
    onSnapshot(
      query(collection(chatRef, 'messages'), orderBy('createdAt'), limitToLast(100)),
      (snap) => renderMessages(snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }))),
      () => setNote('Chat is unavailable right now.'),
    );
    onSnapshot(chatRef, (snap) => {
      const data = snap.data();
      playerUnread = !!(data && data.playerUnread);
      if (isOpen) markRead();
      updateBadge();
    }, () => {});
  });
  signInAnonymously(auth).catch(() => setNote('Chat is unavailable right now.'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, MAX_LEN);
    if (!text || !chatRef) return;
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await addDoc(collection(chatRef, 'messages'), { from: 'player', text, createdAt: serverTimestamp() });
      await setDoc(chatRef, {
        playerId: window.LuckySpin.playerId,
        lastMessage: text.slice(0, 200),
        updatedAt: serverTimestamp(),
        unread: true,
      }, { merge: true });
      input.value = '';
      setNote('');
    } catch (_) {
      setNote('Message not sent. Check your connection and try again.');
    } finally {
      btn.disabled = false;
      input.focus();
    }
  });
}

function renderMessages(msgs) {
  list.innerHTML = '';
  if (!msgs.length) {
    const p = document.createElement('p');
    p.className = 'chat-empty';
    p.textContent = 'Say hi! The owner will reply here.';
    list.append(p);
  }
  for (const m of msgs) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (m.from === 'admin' ? 'from-admin' : 'from-me');
    const text = document.createElement('div');
    text.textContent = m.text;
    div.append(text);
    const code = m.from === 'admin' && (m.text.match(CODE_RE) || [])[0];
    if (code) div.append(redeemButton(code));
    if (m.createdAt && m.createdAt.toDate) {
      const t = document.createElement('time');
      t.textContent = m.createdAt.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      div.append(t);
    }
    list.append(div);
  }
  list.scrollTop = list.scrollHeight;
}

function redeemButton(code) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'primary small';
  const done = () => { btn.textContent = 'Redeemed ✓'; btn.disabled = true; };
  if (window.LuckySpin.isRedeemed(code)) done();
  else btn.textContent = 'Redeem coins';
  btn.addEventListener('click', async () => {
    const ok = await window.LuckySpin.redeemCode(code);
    if (ok) done();
  });
  return btn;
}
