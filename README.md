# Lucky Spin

A browser prize-wheel game played with **Nu** (play points). Open `index.html` in a modern browser, or visit
https://vinsmokeee.github.io/MyGame-/ when GitHub Pages is on. No build step is needed.

## How to play
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
- The ☰ menu has **Contact us** (chat with the owner, text and photos) and **Recharge Nu** (sends the owner a request, minimum Nu 100). A red dot on ☰ shows a new reply.
- Progress is saved in the player's browser.

## SOMA Drop (`drop.html`)
A Plinko-style points game on the same site. Players log in with their Lucky Spin username and password, so
they have the same name and ID in both games (☰ Menu → 🎯 SOMA Drop, and 🎡 Lucky Spin to go back).
- Pick a bet (Nu 10/50/100/500), press DROP or tap the board. 13 slots from the edges in: JACKPOT ×100, ×5, ×3, ×2, then ×0.5 in the middle five. The slot is chosen fairly (12 left/right coin flips) and the ball animates down that path; players get back about 82% of their bets over time.
- Drop has its own balance (starts at Nu 1,000, free Nu 500 refill when out), saved to the player's account as
  `dropNu`, `dropBest`, `drops`. It is separate from the Lucky Spin balance.
- **Contact us** in Drop uses the same chat as Lucky Spin, so messages arrive in the same owner inbox.
- After adding Drop, publish the updated `firestore.rules` (it allows the three new fields). Until then the
  balance is kept only on the player's phone.
- Edit the slots, bets, start balance and the prize lines at the top of `drop.js`.

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
- `index.html`, `style.css`, `game.js`: the Lucky Spin game
- `drop.html`, `drop.css`, `drop.js`: SOMA Drop
- `online.js`: player chat, owner gifts and profile sync
- `admin.html`, `admin.js`: owner tools
- `shared.js`: chat helpers used by both
- `chat-config.js`: Firebase settings; `firestore.rules`: database security rules
