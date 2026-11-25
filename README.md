# Mesa Trails

A tile-laying board game for 2 to 4 players on one TV, built as a plain HTML proof of concept for **Microsoft Edge on Xbox** and played with **regular Xbox controllers** (or a keyboard and mouse on a PC).

Players take turns laying desert tiles so their edges match, then stand scouts on the trails, mesas, oases and scrubland they think will pay off. It's an original game in the tile-laying genre: its own name, theme, tile set and artwork.

No build step and no dependencies: open `index.html` and play.

## Play it

**On a PC:** open `index.html` in Chrome or Edge (double-clicking the file works). Plug in a controller and press A, or use the keyboard.

**On an Xbox:** the page has to be on the web for the Xbox's Edge browser to reach it. The simplest way is GitHub Pages (needs the repository to be public, which it is):

1. On GitHub, open **Settings → Pages**, choose **Deploy from a branch**, pick `main` (or this branch before it's merged) and `/ (root)`, and save.
2. After a minute the game is at `https://wellmanaz.github.io/Carscacone/`.
3. On the Xbox, open **Microsoft Edge**, go to that address, and pin it if you like.
4. Press **A** on a controller to wake it up, then follow the menu.

**If the controller moves a mouse pointer instead of the game cursor:** Edge on Xbox normally uses the controller to drive its own pointer. Other web-game makers report that holding the **Menu** button (three lines), or choosing **Use game controls** when Edge offers it, hands the controller to the page. If that doesn't work, the game also plays with Edge's pointer: point at a cell or a button and press A.

## Setting up a game

The title menu has four rows (D-pad up/down to pick a row, left/right or A to change it):

- **Players:** 2, 3 or 4.
- **Game length:** Full (71 tiles) or Quick (36 tiles).
- **Controllers:**
  - *Pass one around:* any controller plays whoever's turn it is. Works with a single controller, or several if everyone just takes turns.
  - *One each:* each player presses A on their own controller before the game. During play only the current player's controller moves the tile; the others are ignored until their turn.
- **New game** opens the player setup. A game in progress is saved after every turn; **Continue saved game** appears if you leave mid-game.

The player setup screen has one row per player, then **Start game**:

- **A** on a player's row opens an on-screen keyboard to change their name (up to 12 letters, numbers, spaces, apostrophes, hyphens or dots). D-pad to move, **A** to type, **X** delete, **Y** space, **LB** shift, **RT** or the Done key to finish, **B** to cancel. A plugged-in keyboard types straight into the box. The first letter of each word is a capital unless Shift is on. Leave it blank to go back to the default name.
- **Left/right** on a player's row switches them between **Human**, **AI · Easy**, **AI · Medium** and **AI · Hard**. Computer players take their own turns with a short pause between steps so you can follow them; controllers do nothing during their turn except zoom.
- Names and player types are remembered for next time. With *One each* controllers, only the human players join.

The computer players look at every spot and rotation for their tile and every scout they could place, and estimate what each player's features will be worth by the end. *Easy* plays a random spot about half the time and ignores the other players. *Medium* plays for itself with some noise and keeps half an eye on the others. *Hard* plays to beat whoever is strongest, without noise. In test games Hard beat Medium 18 times out of 20, and Medium beat Easy 20 out of 20.

## Controls

| Controller | Keyboard | What it does |
| --- | --- | --- |
| D-pad or either stick | Arrow keys | Move the cursor / choose a scout spot |
| A | Enter or Space | Place the tile / confirm |
| X or RB | R or E | Rotate clockwise |
| LB | Q | Rotate anticlockwise |
| Y | N | Jump to the next spot where the tile fits |
| LT / RT | − / = | Zoom out / in |
| B | Esc | No scout this turn |
| X (after placing) | R | Take the tile back |
| View | H | Rules and controls |

The Menu button is left free on purpose because Edge on Xbox uses it.

## Rules

**Your turn.** You get one tile, shown on the right. Put it next to the map so every edge it touches matches: trail to trail, mesa to mesa, scrub to scrub. Green cells show where it fits in its current rotation. If a tile can't fit anywhere it's set aside and you get another.

**Scouts.** Each player has 7 scouts. After placing, you may stand one on a feature of that tile (trail, mesa, oasis or a patch of scrub), but only if nobody already has a scout anywhere on that connected feature. Features can merge later, so a shared feature can end up with several scouts.

**Scoring during play.** When a feature is finished, whoever has the most scouts on it scores (a tie scores for everyone tied), and those scouts come home.

| Feature | Finished when | Points |
| --- | --- | --- |
| Trail | Both ends stop (a fork, an oasis, a mesa, or a loop) | 1 per tile |
| Mesa | Its cliffs are closed all the way round | 2 per tile, +2 per spring |
| Oasis | All 8 surrounding cells have tiles | 9 |

**End of the game.** When the tiles run out, scouts still on the map score:

- unfinished trail: 1 per tile
- unfinished mesa: 1 per tile and 1 per spring
- unfinished oasis: 1, plus 1 per tile around it
- scrubland: 3 for each *finished* mesa it touches

Most points wins.

## What's in here

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css` | The page and its TV-sized layout |
| `js/tiles.js` | The 24 tile designs and how many of each are in the deck |
| `js/engine.js` | Rules: matching edges, connected features, scoring. No browser code. |
| `js/app.js` | Game flow: menu, player setup and name keyboard, controller hand-out, turns, computer turns, saving |
| `js/ai.js` | Computer players (easy, medium, hard) |
| `js/render.js` | Canvas drawing of tiles, scouts and the board |
| `js/input.js` | Gamepad polling (standard layout), keyboard |
| `js/ui.js` | Connects it all to the page |
| `test/` | `node --test` tests for the rules, the turn flow, the computer players and the drawing code |

Run the tests with Node 18 or newer:

```
npm test
```

To serve it locally (for example to open it from another device on your network): `npm start`, then visit `http://<your-computer>:8080`.

## Status

Proof of concept. What has been checked and what hasn't:

- Rules, turn flow and save/continue are covered by tests, including 25 random full games.
- The page was run end to end in a simulated browser (jsdom with a real canvas), with keyboard play and with two simulated standard-layout controllers, including the one-controller-each mode. Player setup, the name keyboard (typed, clicked and controller-driven) and a computer turn were also run there.
- Computer moves take under 50 ms each on a PC in Node; how long they take on the console is unknown.
- **Not yet tried on a real Xbox.** Unknowns: whether Edge on Xbox hands controller input to the page without switching to game controls, whether it reports more than one controller to a web page, how Back (B) behaves in browsing mode (the game catches Back and treats it as B, and saves every turn in case the page is left), and how it performs on the console.
- Not tried in Safari or Firefox.
