// Owner's inbox for the in-game chat.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, onSnapshot, query, orderBy, limit, limitToLast, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const cfg = window.CHAT_CONFIG;
const $ = (id) => document.getElementById(id);
const note = $('inboxNote');
const baseTitle = document.title;

if (cfg && cfg.firebase) start();

function start() {
  const app = initializeApp(cfg.firebase);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let unsubIndex = null;
  let unsubThread = null;
  let current = null; // { uid, playerId }

  const setNote = (text) => { note.textContent = text; note.hidden = !text; };
  const threadStatus = (text, ok) => { $('threadMsg').textContent = text; $('threadMsg').className = 'status ' + (ok ? 'ok' : 'err'); };
  setNote('Sign in with your admin account to read messages.');
  $('loginForm').hidden = false;

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    setNote('Signing in…');
    try {
      await signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPass').value);
      $('loginPass').value = '';
    } catch (_) {
      setNote('Sign-in failed. Check the email and password.');
    }
  });
  $('signOut').addEventListener('click', () => signOut(auth));

  onAuthStateChanged(auth, (user) => {
    if (unsubIndex) { unsubIndex(); unsubIndex = null; }
    closeThread();
    if (user && user.uid !== cfg.adminUid) {
      signOut(auth);
      setNote('That account is not the admin account.');
      return;
    }
    $('loginForm').hidden = !!user;
    $('inboxBody').hidden = !user;
    if (!user) { setNote(note.textContent.startsWith('That account') ? note.textContent : 'Sign in with your admin account to read messages.'); setCount(0); return; }
    setNote('');
    unsubIndex = onSnapshot(
      query(collection(db, 'chats'), orderBy('updatedAt', 'desc'), limit(100)),
      (snap) => renderIndex(snap.docs.map((d) => ({ uid: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
      () => setNote('Could not load messages. Check the Firestore rules.'),
    );
  });

  function setCount(n) {
    $('inboxCount').hidden = !n;
    $('inboxCount').textContent = n;
    document.title = n ? `(${n}) ${baseTitle}` : baseTitle;
  }

  function renderIndex(chats) {
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
      if (c.unread) b.className = 'unread';
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = c.playerId || 'Unknown player';
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = fmt(c.updatedAt);
      const last = document.createElement('span');
      last.className = 'last';
      last.textContent = c.lastMessage || '';
      b.append(who, when, last);
      b.addEventListener('click', () => openThread(c));
      li.append(b);
      ul.append(li);
    }
  }

  function openThread(c) {
    closeThread();
    current = { uid: c.uid, playerId: c.playerId };
    $('chatIndex').hidden = true;
    $('thread').hidden = false;
    $('threadTitle').textContent = c.playerId || 'Unknown player';
    threadStatus('', true);
    const chatRef = doc(db, 'chats', c.uid);
    if (c.unread) setDoc(chatRef, { unread: false }, { merge: true }).catch(() => {});
    unsubThread = onSnapshot(
      query(collection(chatRef, 'messages'), orderBy('createdAt'), limitToLast(200)),
      (snap) => {
        renderThread(snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' })));
        // keep it marked read while it is open
        setDoc(chatRef, { unread: false }, { merge: true }).catch(() => {});
      },
    );
    $('replyInput').focus();
  }

  function closeThread() {
    if (unsubThread) { unsubThread(); unsubThread = null; }
    current = null;
    $('thread').hidden = true;
    $('chatIndex').hidden = false;
  }
  $('backToInbox').addEventListener('click', closeThread);

  function renderThread(msgs) {
    const list = $('threadList');
    list.innerHTML = '';
    for (const m of msgs) {
      const div = document.createElement('div');
      div.className = 'chat-msg ' + (m.from === 'admin' ? 'from-me' : 'from-admin');
      const text = document.createElement('div');
      text.textContent = m.text;
      const t = document.createElement('time');
      t.textContent = fmt(m.createdAt);
      div.append(text, t);
      list.append(div);
    }
    list.scrollTop = list.scrollHeight;
  }

  async function send(text) {
    const chatRef = doc(db, 'chats', current.uid);
    await addDoc(collection(chatRef, 'messages'), { from: 'admin', text, createdAt: serverTimestamp() });
    await setDoc(chatRef, {
      lastMessage: 'You: ' + text.slice(0, 190), updatedAt: serverTimestamp(), playerUnread: true, unread: false,
    }, { merge: true });
  }

  $('replyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('replyInput').value.trim().slice(0, 500);
    if (!text || !current) return;
    try {
      await send(text);
      $('replyInput').value = '';
      threadStatus('', true);
    } catch (_) { threadStatus('Reply not sent. Try again.', false); }
  });

  $('coinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current) return;
    if (!window.AdminCoins.ready()) { threadStatus('Unlock the admin key at the top of this page first.', false); return; }
    if (!current.playerId) { threadStatus('This chat has no player ID, so coins cannot be sent.', false); return; }
    const amount = Number($('coinAmount').value);
    try {
      const code = await window.AdminCoins.make(current.playerId, amount);
      await send(`🎁 ${amount.toLocaleString()} coins for you! Tap Redeem coins.\n${code}`);
      threadStatus(`Sent ${amount.toLocaleString()} coins.`, true);
    } catch (err) { threadStatus(err.message || 'Could not send coins.', false); }
  });
}

function fmt(ts) {
  if (!ts || !ts.toDate) return '';
  const d = ts.toDate();
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}
