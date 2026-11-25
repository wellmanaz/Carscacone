/*
 * Mesa Trails game flow: title menu, player setup (names and AI levels),
 * controller hand-out, turns, scoring, computer turns.
 * It holds no DOM code; ui.js turns its state into pictures and feeds it
 * actions from controllers, the keyboard and the pointer.
 *
 * Actions: up down left right a b x y lb rb lt rt view
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./ai.js'));
  else root.MesaApp = factory(root.MesaEngine, root.MesaAI);
})(this, function (E, AI) {
  'use strict';

  const SAVE_KEY = 'mesa-trails-save-v1';
  const SETUP_KEY = 'mesa-trails-setup-v1';
  const SEAT_TYPES = ['human', 'easy', 'medium', 'hard'];
  const MAX_NAME = 12;
  const NAME_CHAR = /^[\p{L}\p{N} '.-]$/u;
  // On-screen keyboard: 10 columns per row; span is how many columns a key takes.
  const KEYBOARD = [
    '1234567890'.split(''),
    'qwertyuiop'.split(''),
    "asdfghjkl'".split(''),
    'zxcvbnm-.'.split('').concat(['del']),
    [['shift', 2], ['space', 5], ['done', 3]],
  ].map((row) => {
    let col = 0;
    return row.map((k) => {
      const [value, span] = Array.isArray(k) ? k : [k, 1];
      const key = { value, span, col };
      col += span;
      return key;
    });
  });
  const AI_DELAYS = { think: 700, place: 650, scout: 600 };
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
    this.setup = loadSetup(this.storage);
    this.setupFocus = 0;
    this.editor = null;
    this.joinSeats = [];
    this.aiDelays = o.aiDelays || AI_DELAYS;
    this.aiPlan = null;
    this.aiAt = 0;
  }

  function cleanName(text) {
    return Array.from(String(text || '')).filter((c) => NAME_CHAR.test(c)).join('')
      .replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  }

  function loadSetup(storage) {
    const setup = { names: E.PLAYER_NAMES.slice(), types: ['human', 'human', 'human', 'human'] };
    if (!storage) return setup;
    try {
      const saved = JSON.parse(storage.getItem(SETUP_KEY));
      if (saved && Array.isArray(saved.names) && Array.isArray(saved.types)) {
        for (let i = 0; i < 4; i++) {
          setup.names[i] = cleanName(saved.names[i]) || E.PLAYER_NAMES[i];
          if (SEAT_TYPES.includes(saved.types[i])) setup.types[i] = saved.types[i];
        }
      }
    } catch (e) { /* no saved setup */ }
    return setup;
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

  // Skip a message that's already on screen, so held buttons don't stack copies.
  App.prototype.toastOnce = function (text, color) {
    if (this.toasts.some((t) => t.text === text)) return;
    this.toast(text, color);
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

  App.prototype.isAITurn = function () {
    return this.screen === 'play' && !!this.game && !!this.player().ai;
  };

  App.prototype.handle = function (action, pad) {
    if (this.editor) return this.handleEditor(action);
    if (action === 'view') { this.help = !this.help; return; }
    if (this.help && (action === 'b' || action === 'a')) { this.help = false; return; }
    switch (this.screen) {
      case 'title': return this.handleTitle(action);
      case 'setup': return this.handleSetup(action);
      case 'join': return this.handleJoin(action, pad);
      case 'play':
        if (this.isAITurn()) {
          if (action === 'lt' || action === 'rt') return this.handlePlace(action);
          this.toastOnce(this.player().name + ' is a computer player: sit back for a moment');
          return;
        }
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
      else if (item === 'start' && action === 'a') this.openSetup();
      else if (item === 'continue' && action === 'a') this.loadSaved();
    }
  };

  // Player setup: one row per seat (name, human or AI level), then Start.
  App.prototype.openSetup = function () {
    this.screen = 'setup';
    this.setupFocus = this.menu.players; // the Start row, so A, A still starts quickly
    this.editor = null;
  };

  App.prototype.seatName = function (i) {
    return cleanName(this.setup.names[i]) || E.PLAYER_NAMES[i];
  };

  App.prototype.saveSetup = function () {
    if (!this.storage) return;
    try { this.storage.setItem(SETUP_KEY, JSON.stringify(this.setup)); } catch (e) { /* ignore */ }
  };

  App.prototype.handleSetup = function (action) {
    const rows = this.menu.players + 1;
    const seat = this.setupFocus < this.menu.players ? this.setupFocus : null;
    if (action === 'up') this.setupFocus = (this.setupFocus + rows - 1) % rows;
    else if (action === 'down') this.setupFocus = (this.setupFocus + 1) % rows;
    else if (action === 'b') { this.screen = 'title'; }
    else if ((action === 'left' || action === 'right') && seat != null) this.cycleSeat(seat, action === 'left' ? -1 : 1);
    else if (action === 'a' || action === 'y') {
      if (seat != null) this.openEditor(seat);
      else if (action === 'a') this.beginSetup();
    }
  };

  App.prototype.cycleSeat = function (seat, step) {
    const i = SEAT_TYPES.indexOf(this.setup.types[seat]);
    this.setup.types[seat] = SEAT_TYPES[(i + step + SEAT_TYPES.length) % SEAT_TYPES.length];
    this.saveSetup();
  };

  App.prototype.beginSetup = function () {
    this.saveSetup();
    this.bindings = new Array(this.menu.players).fill(null);
    this.joinSeats = [];
    for (let i = 0; i < this.menu.players; i++) if (this.setup.types[i] === 'human') this.joinSeats.push(i);
    if (this.menu.ownPads && this.joinSeats.length) {
      this.joinIndex = 0;
      this.screen = 'join';
    } else {
      this.startGame();
    }
  };

  // On-screen keyboard for a seat's name.
  App.prototype.openEditor = function (seat) {
    const name = this.seatName(seat);
    this.editor = {
      seat,
      text: name === E.PLAYER_NAMES[seat] ? '' : name, // a default name starts blank; Done keeps it
      row: 1,
      col: 0,
      shift: false,
    };
  };

  App.prototype.editorKey = function () {
    const ed = this.editor;
    const row = KEYBOARD[ed.row];
    return row.find((k) => ed.col >= k.col && ed.col < k.col + k.span) || row[0];
  };

  // Letters type in capitals at the start of each word, or when Shift is on.
  App.prototype.editorUpper = function () {
    const ed = this.editor;
    const wordStart = ed.text === '' || ed.text.endsWith(' ');
    return wordStart !== ed.shift;
  };

  App.prototype.editorType = function (ch) {
    const ed = this.editor;
    if (!ed || ed.text.length >= MAX_NAME || !NAME_CHAR.test(ch)) return;
    if (ch === ' ' && (ed.text === '' || ed.text.endsWith(' '))) return;
    ed.text += ch;
  };

  App.prototype.editorPress = function (value) {
    const ed = this.editor;
    if (!ed) return;
    if (value === 'del') ed.text = ed.text.slice(0, -1);
    else if (value === 'space') this.editorType(' ');
    else if (value === 'shift') ed.shift = !ed.shift;
    else if (value === 'done') this.closeEditor(true);
    else if (/^[a-z]$/.test(value)) {
      this.editorType(this.editorUpper() ? value.toUpperCase() : value);
      ed.shift = false;
    } else this.editorType(value);
  };

  App.prototype.closeEditor = function (keep) {
    const ed = this.editor;
    if (!ed) return;
    if (keep) {
      this.setup.names[ed.seat] = cleanName(ed.text) || E.PLAYER_NAMES[ed.seat];
      this.saveSetup();
    }
    this.editor = null;
  };

  App.prototype.handleEditor = function (action) {
    const ed = this.editor;
    const row = KEYBOARD[ed.row];
    const key = this.editorKey();
    const at = row.indexOf(key);
    if (action === 'left') ed.col = row[(at + row.length - 1) % row.length].col;
    else if (action === 'right') ed.col = row[(at + 1) % row.length].col;
    else if (action === 'up' || action === 'down') {
      ed.row = (ed.row + (action === 'up' ? KEYBOARD.length - 1 : 1)) % KEYBOARD.length;
      ed.col = this.editorKey().col;
    } else if (action === 'a') this.editorPress(key.value);
    else if (action === 'x') this.editorPress('del');
    else if (action === 'y') this.editorPress('space');
    else if (action === 'lb') this.editorPress('shift');
    else if (action === 'rt' || action === 'view') this.closeEditor(true);
    else if (action === 'b') this.closeEditor(false);
  };

  // Pointer or touch on a key: focus it and press it.
  App.prototype.editorPoint = function (row, col) {
    if (!this.editor || !KEYBOARD[row]) return;
    this.editor.row = row;
    this.editor.col = col;
    this.editorPress(this.editorKey().value);
  };

  App.prototype.handleJoin = function (action, pad) {
    if (action === 'b') { this.screen = 'setup'; return; }
    if (action !== 'a') return;
    const seat = this.joinSeats[this.joinIndex];
    this.bindings[seat] = pad == null ? null : pad;
    this.toast(this.seatName(seat) + (pad == null ? ' will use the keyboard or pointer' : ' has controller ' + (pad + 1)), E.PLAYER_COLORS[seat]);
    this.joinIndex++;
    if (this.joinIndex >= this.joinSeats.length) this.startGame();
  };

  App.prototype.startGame = function () {
    const playerInfo = [];
    for (let i = 0; i < this.menu.players; i++) {
      const type = this.setup.types[i];
      playerInfo.push({ name: this.seatName(i), ai: type === 'human' ? null : type });
    }
    this.game = E.newGame({
      players: this.menu.players,
      seed: this.seed,
      deckSize: this.menu.quick ? QUICK_DECK : undefined,
      playerInfo,
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
    this.scheduleAI();
    this.save();
  };

  // Computer turns run from tick() in three paced steps: pick a spot, place, stand a scout.
  App.prototype.scheduleAI = function () {
    this.aiPlan = null;
    if (this.isAITurn()) this.aiAt = this.now() + this.aiDelays.think;
  };

  App.prototype.stepAI = function () {
    const p = this.player();
    if (this.phase === 'place' && !this.aiPlan) {
      const rnd = E.mulberry32(((this.game.seed >>> 0) + this.game.turn * 7919) >>> 0);
      this.aiPlan = AI.chooseMove(this.game, this.tile, p.ai, rnd);
      if (!this.aiPlan) { this.finishTurn(); return; }
      this.cursor = { x: this.aiPlan.x, y: this.aiPlan.y };
      this.rot = this.aiPlan.rot;
      this.aiAt = this.now() + this.aiDelays.place;
      return;
    }
    if (this.phase === 'place') {
      const plan = this.aiPlan;
      this.cursor = { x: plan.x, y: plan.y };
      this.rot = plan.rot;
      if (!this.placeTile()) { this.aiPlan = null; return; }
      if (this.phase === 'scout') {
        const i = this.options.findIndex((o) => o.f === plan.f);
        this.optionIndex = i >= 0 ? i : this.options.length;
        this.aiAt = this.now() + this.aiDelays.scout;
      }
      return;
    }
    this.handleScout('a');
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
    this.scheduleAI();
    if (data.ownPads) this.toast('Resumed: any controller can play each turn');
    return true;
  };

  // Pointer support (Edge's own cursor on Xbox, or a mouse on a PC).
  App.prototype.pointCell = function (x, y) {
    if (this.screen !== 'play' || this.isAITurn()) return;
    if (this.phase === 'place') {
      if (this.cursor.x === x && this.cursor.y === y) this.handle('a', null);
      else { this.cursor = { x, y }; this.fitRotation(); }
    }
  };

  App.prototype.pointSpot = function (fx, fy) {
    // fx, fy: position inside the placed tile, 0..1. Picks the nearest scout spot.
    if (this.screen !== 'play' || this.phase !== 'scout' || this.isAITurn()) return;
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
    if (this.isAITurn() && !this.help && t >= this.aiAt) this.stepAI();
  };

  App.SAVE_KEY = SAVE_KEY;
  App.SETUP_KEY = SETUP_KEY;
  App.SEAT_TYPES = SEAT_TYPES;
  App.KEYBOARD = KEYBOARD;
  App.MAX_NAME = MAX_NAME;
  App.cleanName = cleanName;
  App.QUICK_DECK = QUICK_DECK;
  App.FEATURE_NAMES = FEATURE_NAMES;
  return App;
});
