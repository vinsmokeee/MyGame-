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
