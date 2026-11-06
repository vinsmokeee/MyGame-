// Shared by the game (index.html) and the admin page (admin.html).
//
// Coin codes look like:  LS1.<playerId>.<amount>.<nonce>.<signature>
// The signature is ECDSA P-256 / SHA-256 over "LS1.<playerId>.<amount>.<nonce>".
// Only the holder of the admin private key can create valid codes; this file
// contains just the PUBLIC key, which can verify codes but not create them.
window.CoinCodes = (() => {
  'use strict';

  const PUBLIC_KEY = {
    kty: 'EC',
    crv: 'P-256',
    x: '-6uTcKFf0IpyLpe6TsPPg-FpiizULFOQXc8gbA3bbT4',
    y: 'FGA3Q384beVms-87yHevJV9euuinRCAVVWId-G9_iAk',
  };
  const PREFIX = 'LS1';
  const MAX_AMOUNT = 1000000;
  const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
  const SIG = { name: 'ECDSA', hash: 'SHA-256' };
  const ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function randomId(len) {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
  }

  function toB64url(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }

  const normalizeId = (id) => String(id || '').trim().toUpperCase();

  // Throws an Error with a player-friendly message if the code is not usable.
  async function verify(code, playerId) {
    const parts = String(code || '').replace(/\s+/g, '').split('.');
    if (parts.length !== 5 || parts[0] !== PREFIX) throw new Error('That is not a valid coin code.');
    const [, pid, amt, nonce, sig] = parts;
    const amount = Number(amt);
    if (!/^\d+$/.test(amt) || amount < 1 || amount > MAX_AMOUNT || !nonce) {
      throw new Error('That is not a valid coin code.');
    }
    if (pid !== normalizeId(playerId)) throw new Error('This code was made for a different player ID.');
    if (!crypto.subtle) throw new Error('This browser cannot check coin codes here.');
    let ok = false;
    try {
      const key = await crypto.subtle.importKey('jwk', PUBLIC_KEY, ALG, false, ['verify']);
      ok = await crypto.subtle.verify(SIG, key, fromB64url(sig), new TextEncoder().encode(parts.slice(0, 4).join('.')));
    } catch (_) { ok = false; }
    if (!ok) throw new Error('That coin code is not genuine.');
    return { amount, nonce };
  }

  // ----- admin side -----
  function parseAdminKey(token) {
    const t = String(token || '').trim();
    if (!t.startsWith('LSKEY.')) throw new Error('That is not an admin key.');
    let k;
    try { k = JSON.parse(new TextDecoder().decode(fromB64url(t.slice(6)))); } catch (_) { k = null; }
    if (!k || !k.d || !k.x || !k.y) throw new Error('That admin key is damaged.');
    return { kty: 'EC', crv: 'P-256', x: k.x, y: k.y, d: k.d };
  }
  const matchesGame = (jwk) => jwk.x === PUBLIC_KEY.x && jwk.y === PUBLIC_KEY.y;

  async function createCode(adminJwk, playerId, amount) {
    const pid = normalizeId(playerId);
    if (!/^[A-Z0-9]{4,12}$/.test(pid)) throw new Error('Enter the player ID shown in their game.');
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
      throw new Error(`Amount must be a whole number from 1 to ${MAX_AMOUNT.toLocaleString()}.`);
    }
    const key = await crypto.subtle.importKey('jwk', adminJwk, ALG, false, ['sign']);
    const body = `${PREFIX}.${pid}.${amount}.${randomId(8)}`;
    const sig = await crypto.subtle.sign(SIG, key, new TextEncoder().encode(body));
    return `${body}.${toB64url(sig)}`;
  }

  async function generateAdminKey() {
    const kp = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
    const j = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const token = 'LSKEY.' + toB64url(new TextEncoder().encode(JSON.stringify({ x: j.x, y: j.y, d: j.d })));
    return { token, publicKey: { kty: 'EC', crv: 'P-256', x: j.x, y: j.y } };
  }

  return { verify, randomId, createCode, parseAdminKey, matchesGame, generateAdminKey, MAX_AMOUNT };
})();
