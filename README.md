# Lucky Spin

A browser prize-wheel game played with **Nu** (play points). Open `index.html` in a modern browser, or visit
https://vinsmokeee.github.io/MyGame-/ when GitHub Pages is on. No build step is needed.

## How to play
- Players start with Nu 200, pick a bet (Nu 20/50/100) and press **SPIN** (or Space).
- About 1 spin in 3 wins (×1.5, ×2, ×3, ×5) and 1 in 10 gives the bet back; over time players get back a bit
  less than they bet. Two big prizes pay in full at a Nu 100 bet, with a smaller share at lower bets:
  **Mega Nu 10,000** (about 1 in 650 spins) and the **Jackpot Nu 50,000** (about 1 in 7,000 spins).
  Tune `SEGMENTS` / `oneIn` in `game.js`.
- Each player has a unique 6-digit **ID number** (shown as "Your ID"), so the owner can find them even if names repeat.
- Every 10 spins gives a free **Nu 50** bonus.
- Players can set their own name (✏️ Edit name).
- The ☰ menu has **Contact us** (chat with the owner, text and photos) and **Recharge Nu** (sends the owner a request, minimum Nu 100). A red dot on ☰ shows a new reply.
- Progress is saved in the player's browser.

## Owner tools (`admin.html`)
Sign in with the owner's Firebase email/password to:
- **Players:** see every player's name, ID and balance; give any amount of Nu at any time (it arrives in their game automatically).
- **Inbox:** read and reply to player chats (text and photos), and give Nu from inside a chat.

## Online setup (Firebase, free plan)
Chat, gifts and the player list use Firebase:
1. Create a Firebase project; enable **Anonymous** and **Email/Password** sign-in; add the owner as a user.
2. Create a **Firestore** database, then publish `firestore.rules` (the owner's User UID is in `isAdmin()`).
3. Fill in `chat-config.js` with the web app config and `adminUid`.

Until `chat-config.js` is filled in, Contact us shows a "not available yet" note and the game works offline.
Photos are shrunk in the browser and stored with the message, so Cloud Storage (a paid feature) is not needed.

## Files
- `index.html`, `style.css`, `game.js`: the game
- `online.js`: player chat, owner gifts and profile sync
- `admin.html`, `admin.js`: owner tools
- `shared.js`: chat helpers used by both
- `chat-config.js`: Firebase settings; `firestore.rules`: database security rules
