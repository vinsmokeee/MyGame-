// Telegram Mini App support (only does anything when SOMA Games is opened inside Telegram,
// e.g. from https://t.me/SOMAgamesbot?startapp). The normal website is unchanged.
(() => {
  'use strict';
  // Telegram opens the page with #tgWebAppData=... in the link (and remembers it for the session).
  let inTelegram = /tgWebApp/.test(location.hash);
  try { inTelegram = inTelegram || !!sessionStorage.getItem('__telegram__initParams'); } catch (_) { /* ignore */ }
  if (!inTelegram) return; // normal website: nothing to load
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-web-app.js';
  script.onload = setup;
  document.head.append(script);

  function setup() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) return;
  const can = (v) => typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast(v);

  document.body.classList.add('in-telegram');
  tg.ready();
  tg.expand(); // open at full height
  try {
    // match Telegram's bars to the SOMA Games colours
    tg.setHeaderColor('#14112b');
    tg.setBackgroundColor('#14112b');
    if (can('7.10')) tg.setBottomBarColor('#14112b');
  } catch (_) { /* older Telegram versions */ }
  // don't close the game by accident when swiping down mid-play
  try { if (can('7.7')) tg.disableVerticalSwipes(); } catch (_) { /* older versions */ }

  // Telegram's back button: from a game back to the lobby
  const back = tg.BackButton;
  function syncBack() {
    if (!back) return;
    // only inside a game (#spin, #drop, #cross, ...), not in the lobby
    const inGame = /^#[a-z]+$/.test(location.hash) && document.getElementById('view-' + location.hash.slice(1));
    if (inGame) back.show();
    else back.hide();
  }
  if (back) back.onClick(() => { location.hash = ''; });
  window.addEventListener('hashchange', syncBack);
  syncBack();

  // phone vibration for wins and losses
  const haptic = tg.HapticFeedback;
  window.SomaHaptic = (kind) => {
    try {
      if (!haptic) return;
      if (kind === 'win') haptic.notificationOccurred('success');
      else if (kind === 'lose') haptic.notificationOccurred('error');
      else haptic.impactOccurred(kind === 'big' ? 'heavy' : 'light');
    } catch (_) { /* ignore */ }
  };
  }
})();
