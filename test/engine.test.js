'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

// An empty table with no start tile, for building exact layouts.
function blank(players = 2) {
  const s = E.newGame({ players, seed: 1 });
  s.tiles = {};
  return s;
}

test('every tile type covers each of the 12 edge slots exactly once', () => {
  for (const def of Object.values(E.TYPES)) {
    const seen = [];
    def.features.forEach((f) => seen.push(...f.slots));
    assert.deepEqual(seen.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], def.id);
  }
});

test('every edge is a clean trail, mesa or scrub edge', () => {
  for (const def of Object.values(E.TYPES)) {
    for (let d = 0; d < 4; d++) {
      const kinds = [0, 1, 2].map((i) => def.features[def.slotFeature[3 * d + i]].type);
      if (kinds[1] === 'trail') assert.deepEqual([kinds[0], kinds[2]], ['scrub', 'scrub'], def.id + ' edge ' + d);
      else assert.ok(kinds[0] === kinds[1] && kinds[1] === kinds[2], def.id + ' edge ' + d);
    }
  }
});

test('scrub features only list mesas that exist on the same tile', () => {
  for (const def of Object.values(E.TYPES)) {
    def.features.forEach((f) => {
      if (f.type !== 'scrub') return;
      f.adj.forEach((m) => assert.equal(def.features[m].type, 'mesa', def.id));
    });
  }
});

test('the deck has 71 tiles and a quick game deck can be shorter', () => {
  assert.equal(E.newGame({ seed: 3 }).deck.length, 71);
  assert.equal(E.newGame({ seed: 3, deckSize: 36 }).deck.length, 36);
});

test('rotation turns edges clockwise', () => {
  // A mesa edge tile faces north unrotated, east after one turn, west after three.
  assert.equal(E.edgeKind('mesa-cap', 0, 0), 'mesa');
  assert.equal(E.edgeKind('mesa-cap', 1, 1), 'mesa');
  assert.equal(E.edgeKind('mesa-cap', 1, 0), 'scrub');
  assert.equal(E.edgeKind('mesa-cap', 3, 3), 'mesa');
  // A bending trail runs south and west unrotated, west and north after one turn.
  assert.equal(E.edgeKind('curve', 1, 3), 'trail');
  assert.equal(E.edgeKind('curve', 1, 0), 'trail');
  assert.equal(E.edgeKind('curve', 1, 2), 'scrub');
});

test('facing slots pair up across a shared edge', () => {
  assert.equal(E.facingSlot(0), 8);
  assert.equal(E.facingSlot(1), 7);
  assert.equal(E.facingSlot(3), 11);
  assert.equal(E.facingSlot(5), 9);
  for (let w = 0; w < 12; w++) assert.equal(E.facingSlot(E.facingSlot(w)), w);
});

test('a tile must touch the map and match every neighbour', () => {
  const s = E.newGame({ seed: 1 }); // start tile: mesa north, trail east-west
  assert.equal(E.canPlace(s, 'straight', 1, 1, 0), true, 'east-west trail continues the trail');
  assert.equal(E.canPlace(s, 'straight', 0, 1, 0), false, 'north-south trail meets a trail edge with scrub');
  assert.equal(E.canPlace(s, 'mesa-cap', 2, 0, -1), true, 'mesa facing south closes the mesa');
  assert.equal(E.canPlace(s, 'mesa-cap', 0, 0, -1), false, 'scrub cannot meet the mesa');
  assert.equal(E.canPlace(s, 'straight', 1, 5, 5), false, 'must touch an existing tile');
  assert.equal(E.canPlace(s, 'straight', 1, 0, 0), false, 'cell is taken');
});

test('legal placements list every fitting spot and rotation', () => {
  const s = E.newGame({ seed: 1 });
  const spots = E.legalPlacements(s, 'oasis');
  // An all-scrub tile fits only south of the start tile (any rotation).
  assert.deepEqual(spots.map((p) => p.x + ',' + p.y + ',' + p.rot), ['0,1,0', '0,1,1', '0,1,2', '0,1,3']);
});

test('a finished trail scores 1 per tile to the scout owner and sends the scout home', () => {
  const s = E.newGame({ seed: 1 });
  assert.ok(E.placeScout(s, 0, 0, 1, 0)); // scout on the start tile's trail
  assert.equal(s.players[0].scouts, E.SCOUTS_PER_PLAYER - 1);
  E.putTile(s, 'tee', 0, 1, 0); // fork ends the trail to the east
  assert.deepEqual(E.scoreFinished(s), []);
  E.putTile(s, 'tee', 0, -1, 0); // fork ends it to the west
  const events = E.scoreFinished(s);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'trail');
  assert.equal(events[0].points, 3);
  assert.deepEqual(events[0].players, [0]);
  assert.equal(s.players[0].score, 3);
  assert.equal(s.players[0].scouts, E.SCOUTS_PER_PLAYER);
  assert.equal(E.tileAt(s, 0, 0).scouts.length, 0);
});

test('a closed ring of four bends is a finished trail worth 4', () => {
  const s = blank();
  const want = { '0,0': [1, 2], '1,0': [2, 3], '1,1': [3, 0], '0,1': [0, 1] };
  for (const [k, dirs] of Object.entries(want)) {
    const [x, y] = k.split(',').map(Number);
    const rot = [0, 1, 2, 3].find((r) => dirs.every((d) => E.edgeKind('curve', r, d) === 'trail'));
    E.putTile(s, 'curve', rot, x, y);
  }
  E.tileAt(s, 0, 0).scouts.push({ f: 0, player: 1 });
  const events = E.scoreFinished(s);
  assert.equal(events.length, 1);
  assert.equal(events[0].points, 4);
  assert.equal(s.players[1].score, 4);
});

test('a finished mesa scores 2 per tile plus 2 per spring', () => {
  const s = E.newGame({ seed: 1 });
  E.placeScout(s, 0, 0, 0, 1); // player 1 on the start mesa
  E.putTile(s, 'mesa-band-s', 0, 0, -1); // ridge with spring, open to the north
  assert.deepEqual(E.scoreFinished(s), []);
  E.putTile(s, 'mesa-cap', 2, 0, -2); // closes it
  const [ev] = E.scoreFinished(s);
  assert.equal(ev.type, 'mesa');
  assert.equal(ev.points, 3 * 2 + 2);
  assert.equal(s.players[1].score, 8);
});

test('two separate mesa edges on one tile stay separate', () => {
  const s = blank();
  E.putTile(s, 'caps-opposite', 0, 0, 0);
  E.putTile(s, 'mesa-cap', 2, 0, -1);
  E.tileAt(s, 0, 0).scouts.push({ f: 0, player: 0 }); // north mesa: closed by the cap above
  E.tileAt(s, 0, 0).scouts.push({ f: 1, player: 1 }); // south mesa: still open
  const events = E.scoreFinished(s);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].players, [0]);
  assert.equal(events[0].points, 4);
  assert.equal(E.tileAt(s, 0, 0).scouts.length, 1);
});

test('an oasis surrounded by 8 tiles scores 9', () => {
  const s = blank();
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) E.putTile(s, 'oasis', 0, x, y);
  E.tileAt(s, 0, 0).scouts.push({ f: 0, player: 0 });
  const events = E.scoreFinished(s);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'oasis');
  assert.equal(events[0].points, 9);
});

test('ties share the points; a larger group wins alone', () => {
  const tie = E.newGame({ seed: 1, players: 3 });
  E.putTile(tie, 'tee', 0, 1, 0);
  E.putTile(tie, 'straight', 1, -1, 0);
  E.tileAt(tie, 1, 0).scouts.push({ f: 2, player: 0 });
  E.tileAt(tie, -1, 0).scouts.push({ f: 0, player: 1 });
  E.putTile(tie, 'tee', 0, -2, 0);
  const [ev] = E.scoreFinished(tie);
  assert.deepEqual(ev.players, [0, 1]);
  assert.equal(tie.players[0].score, 4);
  assert.equal(tie.players[1].score, 4);
  assert.equal(tie.players[2].score, 0);

  const win = E.newGame({ seed: 1, players: 2 });
  E.putTile(win, 'straight', 1, 1, 0);
  E.putTile(win, 'straight', 1, -1, 0);
  E.tileAt(win, 1, 0).scouts.push({ f: 0, player: 0 });
  E.tileAt(win, -1, 0).scouts.push({ f: 0, player: 0 });
  E.tileAt(win, 0, 0).scouts.push({ f: 1, player: 1 });
  E.putTile(win, 'tee', 0, 2, 0);
  E.putTile(win, 'tee', 0, -2, 0);
  const [ev2] = E.scoreFinished(win);
  assert.deepEqual(ev2.players, [0]);
  assert.equal(win.players[0].score, 5);
  assert.equal(win.players[1].score, 0);
});

test('a scout cannot join a region that already has one', () => {
  const s = E.newGame({ seed: 1 });
  E.placeScout(s, 0, 0, 1, 0);
  E.putTile(s, 'straight', 1, 1, 0);
  const opts = E.scoutOptions(s, 1, 0, 1).map((o) => E.TYPES.straight.features[o.f].type);
  assert.ok(!opts.includes('trail'), 'trail already taken');
  assert.equal(E.placeScout(s, 1, 0, 0, 1), false);
  assert.equal(s.players[1].scouts, E.SCOUTS_PER_PLAYER);
});

test('no scout options when the player has none left', () => {
  const s = E.newGame({ seed: 1 });
  s.players[0].scouts = 0;
  E.putTile(s, 'straight', 1, 1, 0);
  assert.deepEqual(E.scoutOptions(s, 1, 0, 0), []);
});

test('end of game: unfinished trail, mesa, oasis and scrub score', () => {
  const s = E.newGame({ seed: 1 });
  // Finished mesa to the north (no scout) so the scrub has something to score.
  E.putTile(s, 'mesa-cap', 2, 0, -1);
  E.putTile(s, 'straight', 1, 1, 0); // trail continues east, still open
  E.tileAt(s, 0, 0).scouts.push({ f: 1, player: 0 }); // trail: 2 tiles
  E.tileAt(s, 0, 0).scouts.push({ f: 2, player: 1 }); // scrub between mesa and trail
  E.putTile(s, 'mesa-cap', 0, 0, 1); // mesa facing north on the south side: open
  // Its scrub joins the start tile's south scrub; leave it empty.
  E.putTile(s, 'mesa-three-s', 2, 0, 2);
  E.tileAt(s, 0, 2).scouts.push({ f: 0, player: 1 });
  const events = E.scoreEndOfGame(s);
  const byType = Object.fromEntries(events.map((e) => [e.type, e]));
  assert.equal(byType.trail.points, 2);
  assert.equal(byType.scrub.points, 3, 'one finished mesa beside the scrub');
  assert.ok(byType.mesa, 'unfinished mesa scores at the end');
  assert.equal(s.finished, true);
  assert.equal(s.players[0].score, 2);
  assert.equal(s.players[1].score, 3 + byType.mesa.points);
});

test('unfinished mesa scores 1 per tile and 1 per spring at the end', () => {
  const s = blank();
  E.putTile(s, 'mesa-band-s', 0, 0, 0);
  E.putTile(s, 'mesa-band', 0, 0, 1);
  E.tileAt(s, 0, 0).scouts.push({ f: 0, player: 0 });
  const [ev] = E.scoreEndOfGame(s);
  assert.equal(ev.points, 2 + 1);
});

test('unfinished oasis scores 1 plus its neighbours at the end', () => {
  const s = blank();
  E.putTile(s, 'oasis', 0, 0, 0);
  E.putTile(s, 'oasis', 0, 1, 0);
  E.putTile(s, 'oasis', 0, 1, 1);
  E.tileAt(s, 0, 0).scouts.push({ f: 0, player: 0 });
  const [ev] = E.scoreEndOfGame(s);
  assert.equal(ev.points, 3);
});

test('tiles that fit nowhere are set aside when drawn', () => {
  const s = blank();
  E.putTile(s, 'mesa-full-s', 0, 0, 0); // only mesa edges are open
  s.deck = ['mesa-cap', 'straight', 'oasis'];
  assert.equal(E.drawPlayable(s), 'mesa-cap');
  assert.deepEqual(s.discarded, ['oasis', 'straight']);
  assert.equal(E.drawPlayable(s), null);
});

test('random full games finish with every scout accounted for', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rnd = E.mulberry32(seed * 7919);
    const s = E.newGame({ seed, players: 2 + (seed % 3) });
    let id;
    while ((id = E.drawPlayable(s))) {
      const spots = E.legalPlacements(s, id);
      const pick = spots[Math.floor(rnd() * spots.length)];
      assert.ok(E.canPlace(s, id, pick.rot, pick.x, pick.y));
      E.putTile(s, id, pick.rot, pick.x, pick.y);
      const opts = E.scoutOptions(s, pick.x, pick.y);
      if (opts.length && rnd() < 0.6) assert.ok(E.placeScout(s, pick.x, pick.y, opts[Math.floor(rnd() * opts.length)].f));
      E.scoreFinished(s);
      s.current = (s.current + 1) % s.players.length;
    }
    // Every edge on the table matches its neighbour.
    for (const t of Object.values(s.tiles)) {
      for (let d = 0; d < 4; d++) {
        const n = E.tileAt(s, t.x + E.DIRS[d][0], t.y + E.DIRS[d][1]);
        if (n) assert.equal(E.edgeKind(t.type, t.rot, d), E.edgeKind(n.type, n.rot, (d + 2) % 4));
      }
    }
    E.scoreEndOfGame(s);
    s.players.forEach((p, i) => {
      let onBoard = 0;
      Object.values(s.tiles).forEach((t) => t.scouts.forEach((sc) => { if (sc.player === i) onBoard++; }));
      assert.equal(p.scouts + onBoard, E.SCOUTS_PER_PLAYER);
      assert.ok(p.score >= 0);
    });
    assert.equal(Object.keys(s.tiles).length + s.discarded.length, 72);
  }
});
