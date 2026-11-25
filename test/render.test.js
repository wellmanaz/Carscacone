'use strict';
// Runs the drawing code against a stand-in canvas to catch errors without a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const App = require('../js/app.js');
const { Renderer, drawTileArt } = require('../js/render.js');

function fakeContext(log) {
  const gradient = { addColorStop() {} };
  const state = {};
  return new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      return (...args) => {
        args.forEach((a) => { if (typeof a === 'number') assert.ok(Number.isFinite(a), String(prop) + ' got ' + a); });
        log.push(prop);
      };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function fakeCanvas(log) {
  return { width: 300, height: 150, getContext: () => fakeContext(log) };
}

test('every tile type draws in every rotation', () => {
  for (const id of Object.keys(E.TYPES)) {
    for (let rot = 0; rot < 4; rot++) {
      const log = [];
      drawTileArt(fakeContext(log), id, rot);
      assert.ok(log.includes('fillRect'), id);
    }
  }
});

test('the board draws on every screen', () => {
  const log = [];
  const renderer = new Renderer(fakeCanvas(log), { makeCanvas: () => fakeCanvas(log) });
  renderer.resize(1920, 1080, 1, { x: 0, y: 0, w: 1500, h: 1080 });
  let t = 0;
  const app = new App({ seed: 5, now: () => (t += 16) });
  renderer.draw(app, t);
  app.handle('a');
  let turns = 0;
  while (app.screen === 'play' && turns < 80) {
    renderer.draw(app, t);
    app.handle('y');
    renderer.draw(app, t);
    app.handle('a');
    if (app.phase === 'scout') {
      app.handle('right');
      renderer.draw(app, t);
      app.handle('a');
    }
    turns++;
  }
  renderer.draw(app, t);
  assert.equal(app.screen, 'over');
  assert.ok(log.filter((c) => c === 'drawImage').length > 100);
  const cell = renderer.cellAt(750, 540, app.zoom);
  assert.ok(Number.isInteger(cell.x) && Number.isInteger(cell.y));
});
