'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

// Plays a whole game with computer players only. Checks every move is legal.
function playOut(levels, seed, deckSize) {
  const g = E.newGame({ players: levels.length, seed, deckSize });
  let slowest = 0;
  for (;;) {
    const tile = E.drawPlayable(g);
    if (!tile) break;
    const t0 = Date.now();
    const m = AI.chooseMove(g, tile, levels[g.current], E.mulberry32(seed * 101 + g.turn));
    slowest = Math.max(slowest, Date.now() - t0);
    assert.ok(E.canPlace(g, tile, m.rot, m.x, m.y), 'move is legal');
    E.putTile(g, tile, m.rot, m.x, m.y);
    if (m.f != null) assert.ok(E.placeScout(g, m.x, m.y, m.f), 'scout spot is free');
    E.scoreFinished(g);
    g.current = (g.current + 1) % g.players.length;
    g.turn++;
  }
  E.scoreEndOfGame(g);
  return { scores: g.players.map((p) => p.score), slowest, tiles: Object.keys(g.tiles).length };
}

test('every level plays only legal moves through a whole game', () => {
  const r = playOut(['easy', 'medium', 'hard'], 3, 40);
  assert.ok(r.tiles > 30);
  r.scores.forEach((s) => assert.ok(s >= 0));
});

test('the tile is never left on the board while the AI thinks', () => {
  const g = E.newGame({ players: 2, seed: 9 });
  const before = Object.keys(g.tiles).length;
  AI.chooseMove(g, 'curve', 'hard', E.mulberry32(1));
  assert.equal(Object.keys(g.tiles).length, before);
});

test('hard closes its own mesa when the tile allows it', () => {
  const g = E.newGame({ players: 2, seed: 1 });
  // Gold already has a scout on the start tile's mesa (its north edge).
  E.tileAt(g, 0, 0).scouts.push({ f: 0, player: 0 });
  g.players[0].scouts--;
  const m = AI.chooseMove(g, 'mesa-cap', 'hard', E.mulberry32(2));
  E.putTile(g, 'mesa-cap', m.rot, m.x, m.y);
  E.scoreFinished(g);
  assert.deepEqual([m.x, m.y], [0, -1]);
  assert.equal(g.players[0].score, 4, 'two-tile mesa scores 4');
});

test('harder levels win more: hard beats easy, medium beats easy', () => {
  let hardWins = 0;
  let mediumWins = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const swap = seed % 2 === 0;
    const a = playOut(swap ? ['easy', 'hard'] : ['hard', 'easy'], seed, 45).scores;
    if ((swap ? a[1] : a[0]) > (swap ? a[0] : a[1])) hardWins++;
    const b = playOut(swap ? ['easy', 'medium'] : ['medium', 'easy'], seed, 45).scores;
    if ((swap ? b[1] : b[0]) > (swap ? b[0] : b[1])) mediumWins++;
  }
  assert.ok(hardWins >= 3, 'hard won ' + hardWins + ' of 4');
  assert.ok(mediumWins >= 3, 'medium won ' + mediumWins + ' of 4');
});

test('a move takes well under a second on a full board', () => {
  const r = playOut(['hard', 'hard'], 7);
  assert.ok(r.slowest < 400, 'slowest move ' + r.slowest + 'ms');
});
