/*
 * Mesa Trails game flow: title menu, controller hand-out, turns, scoring.
 * It holds no DOM code; ui.js turns its state into pictures and feeds it
 * actions from controllers, the keyboard and the pointer.
 *
 * Actions: up down left right a b x y lb rb lt rt view
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MesaApp = factory(root.MesaEngine);
})(this, function (E) {
  'use strict';

  const SAVE_KEY = 'mesa-trails-save-v1';
  const QUICK_DECK = 36;
  const DIR_STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const FEATURE_NAMES = { trail: 'trail', mesa: 'mesa', scrub: 'scrubland', oasis: 'oasis' };

  function App(opts) {
    const o = opts || {};
    this.storage = o.storage || null;
    this.now = o.now || (() => Date.now());
    this.seed = o.seed;
    this.screen = 'title';
    this.menu = { focus: 3, players: 2, quick: false, ownPads: false };
    this.bindings = [];
    this.joinIndex = 0;
    this.game = null;
    this.tile = null;
    this.rot = 0;
    this.phase = 'place';
    this.cursor = { x: 0, y: 1 };
    this.placed = null;
    this.options = [];
    this.optionIndex = 0;
    this.legal = [];
    this.legalCursor = -1;
    this.zoom = 1;
    this.toasts = [];
    this.flashes = [];
    this.banner = null;
    this.help = false;
    this.finalEvents = [];
    this.lastEvents = [];
  }

  App.prototype.menuItems = function () {
    const items = ['players', 'length', 'pads', 'start'];
    if (this.hasSave()) items.push('continue');
    return items;
  };

  App.prototype.hasSave = function () {
    if (!this.storage) return false;
    try { return !!this.storage.getItem(SAVE_KEY); } catch (e) { return false; }
  };

  App.prototype.toast = function (text, color) {
    this.toasts.push({ text, color: color || null, until: this.now() + 3200 });
    if (this.toasts.length > 4) this.toasts.shift();
  };

  App.prototype.player = function () {
    return this.game.players[this.game.current];
  };

  // Is this input allowed to act? pad is a controller index, or null for keyboard and pointer.
  App.prototype.mayAct = function (pad) {
    if (this.screen !== 'play' || pad == null) return true;
    const owner = this.bindings[this.game.current];
    return owner == null || owner === pad;
  };

  App.prototype.handle = function (action, pad) {
    if (action === 'view') { this.help = !this.help; return; }
    if (this.help && (action === 'b' || action === 'a')) { this.help = false; return; }
    switch (this.screen) {
      case 'title': return this.handleTitle(action);
      case 'join': return this.handleJoin(action, pad);
      case 'play':
        if (!this.mayAct(pad)) {
          this.toast("It's " + this.player().name + "'s turn: use their controller");
          return;
        }
        return this.phase === 'place' ? this.handlePlace(action) : this.handleScout(action);
      case 'over': return this.handleOver(action);
      default: return undefined;
    }
  };

  App.prototype.handleTitle = function (action) {
    const items = this.menuItems();
    const m = this.menu;
    m.focus = Math.min(m.focus, items.length - 1);
    const item = items[m.focus];
    if (action === 'up') m.focus = (m.focus + items.length - 1) % items.length;
    else if (action === 'down') m.focus = (m.focus + 1) % items.length;
    else if (action === 'left' || action === 'right' || action === 'a') {
      const step = action === 'left' ? -1 : 1;
      if (item === 'players') m.players = 2 + ((m.players - 2 + step + 3) % 3);
      else if (item === 'length') m.quick = !m.quick;
      else if (item === 'pads') m.ownPads = !m.ownPads;
      else if (item === 'start' && action === 'a') this.beginSetup();
      else if (item === 'continue' && action === 'a') this.loadSaved();
    }
  };

  App.prototype.beginSetup = function () {
    this.bindings = new Array(this.menu.players).fill(null);
    if (this.menu.ownPads) {
      this.joinIndex = 0;
      this.screen = 'join';
    } else {
      this.startGame();
    }
  };

  App.prototype.handleJoin = function (action, pad) {
    if (action === 'b') { this.screen = 'title'; return; }
    if (action !== 'a') return;
    const name = E.PLAYER_NAMES[this.joinIndex];
    this.bindings[this.joinIndex] = pad == null ? null : pad;
    this.toast(name + (pad == null ? ' will use the keyboard or pointer' : ' has controller ' + (pad + 1)), E.PLAYER_COLORS[this.joinIndex]);
    this.joinIndex++;
    if (this.joinIndex >= this.menu.players) this.startGame();
  };

  App.prototype.startGame = function () {
    this.game = E.newGame({
      players: this.menu.players,
      seed: this.seed,
      deckSize: this.menu.quick ? QUICK_DECK : undefined,
    });
    this.screen = 'play';
    this.flashes = [];
    this.toasts = [];
    this.beginTurn();
  };

  App.prototype.beginTurn = function () {
    const before = this.game.discarded.length;
    this.tile = E.drawPlayable(this.game);
    const skipped = this.game.discarded.length - before;
    if (skipped > 0) this.toast(skipped === 1 ? 'A tile that fit nowhere was set aside' : skipped + ' tiles that fit nowhere were set aside');
    if (!this.tile) { this.endGame(); return; }
    this.phase = 'place';
    this.rot = 0;
    this.placed = null;
    this.options = [];
    this.legal = E.legalPlacements(this.game, this.tile);
    this.legalCursor = -1;
    // Start the cursor on the nearest open spot to where the last tile went.
    if (!this.legal.some((p) => p.x === this.cursor.x && p.y === this.cursor.y)) {
      this.jumpToLegal(true);
    } else {
      this.fitRotation();
    }
    this.banner = { text: this.player().name + "'s turn", color: this.player().color, until: this.now() + 1400 };
    this.save();
  };

  // Pick the first rotation that fits at the cursor, if any.
  App.prototype.fitRotation = function () {
    for (let i = 0; i < 4; i++) {
      const r = (this.rot + i) % 4;
      if (E.canPlace(this.game, this.tile, r, this.cursor.x, this.cursor.y)) { this.rot = r; return true; }
    }
    return false;
  };

  App.prototype.jumpToLegal = function (nearest) {
    if (!this.legal.length) return;
    const cells = [];
    const seen = new Set();
    this.legal.forEach((p) => {
      const k = p.x + ',' + p.y;
      if (!seen.has(k)) { seen.add(k); cells.push({ x: p.x, y: p.y }); }
    });
    let idx;
    if (nearest) {
      let best = Infinity;
      cells.forEach((c, i) => {
        const d = Math.abs(c.x - this.cursor.x) + Math.abs(c.y - this.cursor.y);
        if (d < best) { best = d; idx = i; }
      });
    } else {
      idx = (this.legalCursor + 1) % cells.length;
    }
    this.legalCursor = idx;
    this.cursor = { x: cells[idx].x, y: cells[idx].y };
    this.fitRotation();
  };

  App.prototype.bounds = function () {
    let minX = 0; let maxX = 0; let minY = 0; let maxY = 0;
    Object.values(this.game.tiles).forEach((t) => {
      minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x);
      minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y);
    });
    return { minX, maxX, minY, maxY };
  };

  App.prototype.canPlaceHere = function () {
    return E.canPlace(this.game, this.tile, this.rot, this.cursor.x, this.cursor.y);
  };

  App.prototype.handlePlace = function (action) {
    if (DIR_STEP[action]) {
      const [dx, dy] = DIR_STEP[action];
      const b = this.bounds();
      this.cursor = {
        x: Math.max(b.minX - 2, Math.min(b.maxX + 2, this.cursor.x + dx)),
        y: Math.max(b.minY - 2, Math.min(b.maxY + 2, this.cursor.y + dy)),
      };
      return;
    }
    switch (action) {
      case 'x':
      case 'rb': this.rot = (this.rot + 1) % 4; break;
      case 'lb': this.rot = (this.rot + 3) % 4; break;
      case 'y': this.jumpToLegal(false); break;
      case 'lt': this.zoom = Math.max(0.5, +(this.zoom - 0.15).toFixed(2)); break;
      case 'rt': this.zoom = Math.min(1.8, +(this.zoom + 0.15).toFixed(2)); break;
      case 'a': this.placeTile(); break;
      default: break;
    }
  };

  App.prototype.placeTile = function () {
    if (!this.canPlaceHere()) {
      const fitsHere = this.legal.some((p) => p.x === this.cursor.x && p.y === this.cursor.y);
      this.toast(fitsHere ? "Doesn't fit this way round: rotate it" : "That tile can't go there");
      return false;
    }
    const { x, y } = this.cursor;
    E.putTile(this.game, this.tile, this.rot, x, y);
    this.placed = { x, y };
    this.options = E.scoutOptions(this.game, x, y);
    if (!this.options.length) {
      this.finishTurn();
      return true;
    }
    this.phase = 'scout';
    // Default to "no scout" so a quick double press never spends one by accident.
    this.optionIndex = this.options.length;
    return true;
  };

  App.prototype.currentOption = function () {
    return this.optionIndex < this.options.length ? this.options[this.optionIndex] : null;
  };

  App.prototype.handleScout = function (action) {
    const n = this.options.length + 1; // last choice is "no scout"
    if (action === 'right' || action === 'down' || action === 'rb') this.optionIndex = (this.optionIndex + 1) % n;
    else if (action === 'left' || action === 'up' || action === 'lb') this.optionIndex = (this.optionIndex + n - 1) % n;
    else if (action === 'b') this.finishTurn();
    else if (action === 'x') this.takeBack();
    else if (action === 'a') {
      const opt = this.currentOption();
      if (opt) E.placeScout(this.game, this.placed.x, this.placed.y, opt.f);
      this.finishTurn();
    }
  };

  App.prototype.takeBack = function () {
    if (!this.placed) return;
    delete this.game.tiles[E.key(this.placed.x, this.placed.y)];
    this.cursor = { x: this.placed.x, y: this.placed.y };
    this.placed = null;
    this.options = [];
    this.phase = 'place';
  };

  App.prototype.describe = function (ev) {
    const names = ev.players.map((p) => this.game.players[p].name).join(' and ');
    if (ev.type === 'scrub') return names + ' +' + ev.points + ' for scrubland';
    return names + ' +' + ev.points + ' for ' + (ev.final ? 'an unfinished ' : 'a finished ') + FEATURE_NAMES[ev.type];
  };

  App.prototype.finishTurn = function () {
    const events = E.scoreFinished(this.game);
    this.lastEvents = events;
    const until = this.now() + 2200;
    events.forEach((ev) => {
      const color = ev.players.length ? this.game.players[ev.players[0]].color : '#ffffff';
      this.flashes.push({ tiles: ev.tiles, color, until });
      this.toast(this.describe(ev), color);
    });
    this.game.current = (this.game.current + 1) % this.game.players.length;
    this.game.turn++;
    this.beginTurn();
  };

  App.prototype.endGame = function () {
    this.finalEvents = E.scoreEndOfGame(this.game);
    this.finalEvents.forEach((ev) => {
      if (ev.points > 0 && ev.players.length) this.flashes.push({ tiles: ev.tiles, color: this.game.players[ev.players[0]].color, until: this.now() + 4000 });
    });
    this.screen = 'over';
    this.overAt = this.now();
    this.tile = null;
    this.clearSave();
  };

  App.prototype.handleOver = function (action) {
    // A short pause so a quick double press on the last turn doesn't skip the results.
    if (this.now() - this.overAt < 1500) return;
    if (action === 'a') {
      this.screen = 'title';
      this.game = null;
      this.menu.focus = 3;
    }
  };

  App.prototype.save = function () {
    if (!this.storage || !this.game) return;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify({
        game: this.game,
        tile: this.tile,
        bindings: this.bindings,
        ownPads: this.menu.ownPads,
      }));
    } catch (e) { /* storage full or blocked: playing on without saves */ }
  };

  App.prototype.clearSave = function () {
    if (!this.storage) return;
    try { this.storage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  };

  App.prototype.loadSaved = function () {
    let data;
    try { data = JSON.parse(this.storage.getItem(SAVE_KEY)); } catch (e) { data = null; }
    if (!data || !data.game || !data.tile) { this.clearSave(); this.toast('No saved game to continue'); return false; }
    this.game = data.game;
    this.menu.players = this.game.players.length;
    // Controller numbers can change between sessions, so a resumed game lets any controller play.
    this.bindings = new Array(this.game.players.length).fill(null);
    this.screen = 'play';
    this.tile = data.tile;
    this.phase = 'place';
    this.rot = 0;
    this.legal = E.legalPlacements(this.game, this.tile);
    this.jumpToLegal(true);
    this.banner = { text: this.player().name + "'s turn", color: this.player().color, until: this.now() + 1400 };
    if (data.ownPads) this.toast('Resumed: any controller can play each turn');
    return true;
  };

  // Pointer support (Edge's own cursor on Xbox, or a mouse on a PC).
  App.prototype.pointCell = function (x, y) {
    if (this.screen !== 'play') return;
    if (this.phase === 'place') {
      if (this.cursor.x === x && this.cursor.y === y) this.handle('a', null);
      else { this.cursor = { x, y }; this.fitRotation(); }
    }
  };

  App.prototype.pointSpot = function (fx, fy) {
    // fx, fy: position inside the placed tile, 0..1. Picks the nearest scout spot.
    if (this.screen !== 'play' || this.phase !== 'scout') return;
    let best = -1; let dist = 0.2;
    this.options.forEach((o, i) => {
      const d = Math.hypot(o.spot[0] - fx, o.spot[1] - fy);
      if (d < dist) { dist = d; best = i; }
    });
    if (best < 0) return;
    if (this.optionIndex === best) this.handle('a', null);
    else this.optionIndex = best;
  };

  App.prototype.tick = function () {
    const t = this.now();
    this.toasts = this.toasts.filter((m) => m.until > t);
    this.flashes = this.flashes.filter((f) => f.until > t);
    if (this.banner && this.banner.until <= t) this.banner = null;
  };

  App.SAVE_KEY = SAVE_KEY;
  App.QUICK_DECK = QUICK_DECK;
  App.FEATURE_NAMES = FEATURE_NAMES;
  return App;
});
