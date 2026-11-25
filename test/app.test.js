'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const App = require('../js/app.js');

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

function newApp(extra) {
  let t = 1000;
  const app = new App(Object.assign({ seed: 42, now: () => (t += 10) }, extra));
  return app;
}

test('title menu starts on Start and changes options', () => {
  const app = newApp();
  assert.equal(app.menuItems()[app.menu.focus], 'start');
  app.handle('up'); app.handle('up'); app.handle('up');
  assert.equal(app.menuItems()[app.menu.focus], 'players');
  app.handle('right'); assert.equal(app.menu.players, 3);
  app.handle('right'); assert.equal(app.menu.players, 4);
  app.handle('right'); assert.equal(app.menu.players, 2);
  app.handle('left'); assert.equal(app.menu.players, 4);
  app.handle('down'); app.handle('a'); assert.equal(app.menu.quick, true);
  app.handle('down'); app.handle('down'); app.handle('a');
  assert.equal(app.screen, 'play');
  assert.equal(app.game.players.length, 4);
  assert.equal(app.game.deck.length + 1, App.QUICK_DECK, 'one tile already drawn');
});

test('a turn: jump to a fitting spot, place, skip the scout, next player', () => {
  const app = newApp();
  app.handle('a'); // Start
  const tile = app.tile;
  app.handle('y');
  assert.ok(app.canPlaceHere());
  app.handle('a');
  assert.ok(E.tileAt(app.game, app.cursor.x, app.cursor.y));
  assert.equal(E.tileAt(app.game, app.cursor.x, app.cursor.y).type, tile);
  if (app.phase === 'scout') {
    assert.equal(app.currentOption(), null, '"no scout" is picked by default');
    app.handle('a');
  }
  assert.equal(app.game.current, 1);
  assert.equal(app.phase, 'place');
  assert.equal(Object.keys(app.game.tiles).length, 2);
});

test('placing a scout spends one and shows on the tile', () => {
  const app = newApp();
  app.handle('a');
  for (let guard = 0; guard < 20 && app.game.players[0].scouts === E.SCOUTS_PER_PLAYER; guard++) {
    app.handle('y');
    app.handle('a');
    if (app.phase === 'scout') {
      app.handle('right');
      assert.ok(app.currentOption());
      app.handle('a');
    }
  }
  const onBoard = Object.values(app.game.tiles).reduce((n, t) => n + t.scouts.length, 0);
  const spent = app.game.players.reduce((n, p) => n + E.SCOUTS_PER_PLAYER - p.scouts, 0);
  assert.equal(onBoard, spent);
});

test('an illegal spot is refused with a message', () => {
  const app = newApp();
  app.handle('a');
  app.cursor = { x: 0, y: 0 }; // the start tile's own cell
  const before = Object.keys(app.game.tiles).length;
  app.handle('a');
  assert.equal(Object.keys(app.game.tiles).length, before);
  assert.equal(app.phase, 'place');
  assert.ok(app.toasts.length > 0);
});

test('X in the scout step takes the tile back', () => {
  const app = newApp();
  app.handle('a');
  let guard = 0;
  while (guard++ < 30) {
    app.handle('y');
    app.handle('a');
    if (app.phase === 'scout') break;
  }
  assert.equal(app.phase, 'scout');
  const { x, y } = app.placed;
  const tile = app.tile;
  const who = app.game.current;
  app.handle('x');
  assert.equal(app.phase, 'place');
  assert.equal(E.tileAt(app.game, x, y), null);
  assert.equal(app.tile, tile);
  assert.equal(app.game.current, who);
});

test('rotation buttons turn the tile both ways', () => {
  const app = newApp();
  app.handle('a');
  app.rot = 0;
  app.handle('rb'); assert.equal(app.rot, 1);
  app.handle('x'); assert.equal(app.rot, 2);
  app.handle('lb'); app.handle('lb'); app.handle('lb'); assert.equal(app.rot, 3);
});

test('with one controller each, only the current player\'s controller acts', () => {
  const app = newApp();
  app.menu.ownPads = true;
  app.handle('a', 0); // Start
  assert.equal(app.screen, 'join');
  app.handle('a', 2); // Gold takes controller 3
  app.handle('a', 0); // Sky takes controller 1
  assert.equal(app.screen, 'play');
  assert.deepEqual(app.bindings, [2, 0]);
  const cursor = Object.assign({}, app.cursor);
  app.handle('right', 0);
  assert.deepEqual(app.cursor, cursor, "Sky's controller can't move Gold's tile");
  app.handle('right', 2);
  assert.notDeepEqual(app.cursor, cursor);
  app.handle('left', null); // keyboard always works
  assert.deepEqual(app.cursor, cursor);
});

test('the game saves each turn and can be continued', () => {
  const storage = memoryStorage();
  const app = newApp({ storage });
  app.handle('a');
  app.handle('y'); app.handle('a');
  if (app.phase === 'scout') app.handle('b');
  assert.ok(storage.getItem(App.SAVE_KEY));
  const again = newApp({ storage });
  assert.ok(again.menuItems().includes('continue'));
  again.menu.focus = again.menuItems().indexOf('continue');
  again.handle('a');
  assert.equal(again.screen, 'play');
  assert.equal(Object.keys(again.game.tiles).length, Object.keys(app.game.tiles).length);
  assert.equal(again.game.current, app.game.current);
  assert.equal(again.tile, app.tile);
});

test('pointer: first click moves the cursor, second click places', () => {
  const app = newApp();
  app.handle('a');
  const spot = app.legal[0];
  app.cursor = { x: 50, y: 50 };
  app.pointCell(spot.x, spot.y);
  assert.deepEqual(app.cursor, { x: spot.x, y: spot.y });
  assert.ok(app.canPlaceHere(), 'rotation was fitted to the clicked cell');
  app.pointCell(spot.x, spot.y);
  assert.ok(E.tileAt(app.game, spot.x, spot.y));
});

test('a whole quick game plays out to the results screen', () => {
  const storage = memoryStorage();
  let clock = 1000;
  const app = new App({ seed: 42, storage, now: () => (clock += 10) });
  app.menu.quick = true;
  app.menu.players = 3;
  app.handle('a');
  let turns = 0;
  while (app.screen === 'play' && turns < 100) {
    app.handle('y');
    app.handle('a');
    if (app.phase === 'scout') {
      if (turns % 3 === 0) app.handle('right');
      app.handle('a');
    }
    turns++;
  }
  assert.equal(app.screen, 'over');
  assert.equal(storage.getItem(App.SAVE_KEY), null, 'finished games are not offered for continuing');
  assert.equal(E.ranking(app.game).length, 3);
  app.finalEvents.forEach((ev) => assert.match(app.describe(ev), /\+\d+ for /));
  app.handle('a');
  assert.equal(app.screen, 'over', 'results stay up for a moment');
  clock += 2000;
  app.handle('a');
  assert.equal(app.screen, 'title');
});
