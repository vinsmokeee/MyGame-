# SOMA Games

One link, one account, one Nu balance, several games. Open `index.html` in a modern browser, or visit
https://vinsmokeee.github.io/MyGame-/ (GitHub Pages). No build step is needed.

- **Lobby** (`index.html`): log in or create an account, see your balance and ID, then pick a game.
  `#spin` opens SOMA Spin, `#drop` opens SOMA Drop. The ☰ menu (All games, Contact us / Recharge Nu, Note, Log out) and the
  free **Nu 20 every 10 plays** bonus are shared by all games.
- **One wallet:** recharges and Nu added from the owner page work in every game (`window.LuckySpin.spend/settle`).
- **Adding a game:** add a `view-<name>` section and a lobby card in `index.html`, and a script that uses the
  shared wallet (see `drop.js`).

- **Big-win announcements:** every win of ×2 or more (×2, ×3, ×5, big prizes, Jackpot) at every bet in any game are posted to `wins/` and shown to
  every other player online for about 3.5 seconds, e.g. "Tashi (ID 627182) hit ×3 in SOMA Drop and won Nu 300".
  Players who were away see the wins they missed (up to 8 from the last 24 hours, marked "· 25 min ago") when they
  come back; each win is shown once per phone.
- The owner page shows each player's spins and drops separately (`drops` in the account).

## SOMA Drop (`drop.js`)
A Plinko-style board with 12 rows of pins. Bets Nu 20/50/100/500. Layout JACKPOT ×5 ×3 ×2 ×2 ×0.3 ×0.3 ×0.3 ×2 ×2 ×3 ×5
JACKPOT. Never more than 3 ×0.3 in a row: the next ball lands on ×2 or ×3. ×2 about 1 in 4, ×3 1 in 31, ×5 1 in 170,
JACKPOT ×100 about 1 in 2,500; players get back about 86–95%. Chances are `p` / `f` in `SLOTS` in `drop.js`. Sound effects for the drop, pins and landing; 🔊 toggles sound.

## SOMA Spin
- Players start with Nu 200, pick a bet (Nu 20/50/100/500) and press **SPIN** (or Space).
- Never more than 2 LOSE in a row (about 41% of spins are LOSE). ×0.5 about 1 in 3, ×2 1 in 8, ×3 1 in 20,
  ×5 1 in 50. Three big prizes pay their listed amount at a Nu 100 bet (smaller share at lower bets, 5× at Nu 500): Nu 1,000 (~1 in 180),
  Nu 10,000 (~1 in 2,200) and the Jackpot Nu 50,000 (~1 in 15,000). Over time players get back about 82–87% of
  their bets (including the spin bonus). Tune `p` in `SEGMENTS` and `MAX_LOSE_RUN` in `game.js`.
- Players create an account (username, password, gender) or log in. Their progress (Nu, ID, history, chat)
  is saved to Firebase, so they can log in from any phone. ☰ Menu → Log out. New accounts then see a welcome
  pop-up with their ID and the prize note. (Usernames are stored as `username@players.luckyspin.app` logins.)
- Each player has a unique 6-digit **ID number** (shown as "Your ID"), so the owner can find them even if names repeat.
- Every 10 spins gives a free **Nu 20** bonus.
- Players can set their own name (✏️ Edit name).
- The ☰ menu has **Contact us / Recharge Nu**: the chat with the owner (text and photos), with a **💰 Recharge Nu** button at the top that sends a recharge request (minimum Nu 100). A red dot on ☰ shows a new reply.
- Progress is saved in the player's browser.

## Owner tools (`admin.html`)
Sign in with the owner's Firebase email/password to:
- **Players:** see every player's name, ID and balance; give any amount of Nu at any time (it arrives in their game automatically).
- **Inbox:** read and reply to player chats (text and photos), and give Nu from inside a chat. Messages and photos you send by hand have a **Delete** link (e.g. sent to the wrong player); recharge records stay as history.

When the owner is signed in on `admin.html` on the same phone, the game also shows **🛠 Owner page** in the ☰ menu
and a banner (with a sound) whenever a player sends a recharge request or message; **Open** goes straight to that
player's chat (`admin.html?chat=<uid>`). Players never see these.

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
