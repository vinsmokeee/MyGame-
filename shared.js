// Helpers shared by the game (online.js) and the owner's page (admin.js).
export const FIREBASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const MAX_TEXT = 500;
const MAX_IMAGE_CHARS = 900000; // Firestore documents are limited to 1 MB

export async function loadFirebase() {
  const [app, auth, fs] = await Promise.all([
    import(FIREBASE + 'firebase-app.js'),
    import(FIREBASE + 'firebase-auth.js'),
    import(FIREBASE + 'firebase-firestore.js'),
  ]);
  return { ...app, ...auth, ...fs };
}

export const fmtNu = (n) => 'Nu ' + Math.floor(n).toLocaleString('en-US');

export function fmtTime(ts) {
  if (!ts || !ts.toDate) return '';
  const d = ts.toDate();
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

// Shrinks a photo to a JPEG data URL small enough to store with the message.
export async function compressImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Please choose a photo.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That photo could not be opened.'));
      i.src = url;
    });
    for (const [max, q] of [[1280, 0.75], [1024, 0.65], [800, 0.6], [640, 0.5]]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', q);
      if (data.length <= MAX_IMAGE_CHARS) return data;
    }
    throw new Error('That photo is too large.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Renders a list of chat messages. `mine` is the sender value shown on the right.
// With `onDelete`, your own messages get a Delete button (used on the owner page),
// except those `keep(m)` marks as permanent records.
export function renderMessages(list, msgs, mine, emptyText, onDelete, keep) {
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  list.innerHTML = '';
  if (!msgs.length && emptyText) {
    const p = document.createElement('p');
    p.className = 'chat-empty';
    p.textContent = emptyText;
    list.append(p);
  }
  for (const m of msgs) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (m.from === mine ? 'from-me' : 'from-them');
    if (typeof m.image === 'string' && m.image.startsWith('data:image/')) {
      const img = document.createElement('img');
      img.src = m.image;
      img.alt = 'Photo';
      img.loading = 'lazy';
      img.addEventListener('click', () => showLightbox(m.image));
      img.addEventListener('load', () => { if (atBottom) list.scrollTop = list.scrollHeight; });
      div.append(img);
    }
    if (m.text) {
      const text = document.createElement('div');
      text.textContent = m.text;
      div.append(text);
    }
    const t = document.createElement('time');
    t.textContent = fmtTime(m.createdAt);
    if (onDelete && m.from === mine && m.id && !(keep && keep(m))) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'msg-delete';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete this message');
      del.addEventListener('click', () => onDelete(m));
      t.append(' · ', del);
    }
    div.append(t);
    list.append(div);
  }
  if (atBottom || msgs.length < 3) list.scrollTop = list.scrollHeight;
}

function showLightbox(src) {
  let box = document.getElementById('lightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'lightbox';
    box.className = 'lightbox';
    box.append(document.createElement('img'));
    document.body.append(box);
  }
  box.querySelector('img').src = src;
  box.hidden = false;
  box.onclick = () => { box.hidden = true; };
}
