# Lucky Spin

A browser prize-wheel game. Open `index.html` in any modern browser. No build step or server is needed.

## How to play
- You start with 100 coins. Pick a bet (10/25/50/100) and press **SPIN** (or the Space key).
- The wheel pays a multiple of your bet: LOSE, x0.5, x1, x2, x3, x5, or the x20 **JACKPOT**.
- The Prizes panel lists the odds for each result. Recent spins appear in History.
- Coins, best score and history are saved in your browser. **New game** resets you to 100 coins.

## Files
- `index.html`: page layout
- `style.css`: styling (responsive down to phone width)
- `game.js`: wheel drawing, weighted spin logic, sounds (Web Audio) and confetti

## Giving coins (admin)
The owner can hand out coins with signed, one-time **coin codes**:

1. The player reads their **player ID** from the "Coin codes" box in the game.
2. The owner opens `admin.html` (e.g. `https://vinsmokeee.github.io/MyGame-/admin.html`), unlocks it once with the
   private admin key (`LSKEY.…`, never stored in this repo), enters the player ID and amount, and taps **Make code**.
3. The player pastes the code into the game and taps **Redeem**.

Each code works only for that player ID and only once. Codes are ECDSA-signed; `coin-codes.js` holds only the
public key, so nobody else can create valid codes. If the admin key is lost or leaked, create a new one on the admin
page and replace `PUBLIC_KEY` in `coin-codes.js` with the new public key.

Note: progress lives in each player's browser, so this is a fun-game safeguard, not bank-grade security.
