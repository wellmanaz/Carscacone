/* Mesa Trails: wires the game to the page (screens, HUD, input, drawing loop). */
(function () {
  'use strict';

  const E = window.MesaEngine;
  const AI = window.MesaAI;
  const App = window.MesaApp;
  const { Renderer } = window.MesaRender;
  const { Input } = window.MesaInput;

  function storage() {
    try {
      const s = window.localStorage;
      s.setItem('mesa-trails-probe', '1');
      s.removeItem('mesa-trails-probe');
      return s;
    } catch (e) {
      return null;
    }
  }

  const $ = (id) => document.getElementById(id);
  const el = {
    board: $('board'), title: $('title'), menu: $('menu'), padNote: $('pad-note'), fullscreen: $('fullscreen'),
    join: $('join'), joinPrompt: $('join-prompt'), joinList: $('join-list'),
    setup: $('setup'), seats: $('seats'), keyboard: $('keyboard'), kbTitle: $('kb-title'), kbField: $('kb-field'), kbKeys: $('kb-keys'),
    hud: $('hud'), turn: $('turn'), preview: $('preview'), deck: $('deck-count'), scores: $('scores'), hints: $('hints'), side: $('side'),
    over: $('over'), winner: $('winner'), ranking: $('ranking'), finalList: $('final-list'),
    help: $('help'), banner: $('banner'), toasts: $('toasts'),
  };

  const app = new App({ storage: storage() });
  const renderer = new Renderer(el.board);
  let lastPadA = 0;
  let lastPadB = 0;

  const input = new Input(window, (action, pad) => {
    if (pad != null && action === 'a') lastPadA = Date.now();
    if (pad != null && action === 'b') lastPadB = Date.now();
    app.handle(action, pad);
  });

  // A real keyboard types straight into the name box (arrows still move on the on-screen keys).
  window.addEventListener('keydown', (e) => {
    if (!app.editor || e.ctrlKey || e.metaKey || e.altKey) return;
    let used = true;
    if (e.key === 'Enter') app.closeEditor(true);
    else if (e.key === 'Escape') app.closeEditor(false);
    else if (e.key === 'Backspace') app.editorPress('del');
    else if (e.key && e.key.length === 1) app.editorType(e.key);
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Edge on Xbox treats B as the browser's Back button unless game controls are on.
  // Keep an extra history entry and turn Back into the game's B instead of leaving.
  function armBack() {
    try { history.pushState({ mesa: true }, ''); } catch (e) { /* ignore */ }
  }
  armBack();
  window.addEventListener('popstate', () => {
    armBack();
    if (Date.now() - lastPadB < 500) return;
    app.handle('b', null);
  });
  ['pointerdown', 'keydown'].forEach((type) => window.addEventListener(type, armBackOnce, { once: true }));
  function armBackOnce() { armBack(); }

  window.addEventListener('beforeunload', (e) => {
    if (app.screen === 'play') { e.preventDefault(); e.returnValue = ''; }
  });

  window.addEventListener('gamepadconnected', (e) => app.toast('Controller ' + (e.gamepad.index + 1) + ' connected'));
  window.addEventListener('gamepaddisconnected', (e) => app.toast('Controller ' + (e.gamepad.index + 1) + ' disconnected'));

  // Pointer: Edge's own cursor on Xbox, or a mouse on a PC.
  function fromPointer() { return Date.now() - lastPadA > 300; }
  el.board.addEventListener('click', (e) => {
    if (!fromPointer() || app.screen !== 'play') return;
    const cell = renderer.cellAt(e.clientX, e.clientY, app.zoom);
    if (app.phase === 'scout' && app.placed && cell.x === app.placed.x && cell.y === app.placed.y) app.pointSpot(cell.fx, cell.fy);
    else app.pointCell(cell.x, cell.y);
  });
  document.addEventListener('click', (e) => {
    if (!fromPointer()) return;
    const key = e.target.closest('[data-kb-row]');
    if (key) { app.editorPoint(Number(key.getAttribute('data-kb-row')), Number(key.getAttribute('data-kb-col'))); return; }
    const seatType = e.target.closest('[data-seat-type]');
    if (seatType) { const i = Number(seatType.getAttribute('data-seat-type')); app.setupFocus = i; app.cycleSeat(i, 1); return; }
    const seat = e.target.closest('[data-seat]');
    if (seat) { app.setupFocus = Number(seat.getAttribute('data-seat')); app.handle('a', null); return; }
    const btn = e.target.closest('[data-action]');
    if (btn) app.handle(btn.getAttribute('data-action'), null);
    const row = e.target.closest('[data-menu]');
    if (row) {
      app.menu.focus = Number(row.getAttribute('data-menu'));
      app.handle('a', null);
    }
  });
  el.fullscreen.addEventListener('click', () => {
    const root = document.documentElement;
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (req) Promise.resolve(req.call(root)).catch(() => app.toast("Full screen isn't available here"));
  });

  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const sideRect = el.side.getBoundingClientRect();
    const right = app.screen === 'play' && sideRect.width ? w - sideRect.left : 0;
    renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, 2), { x: 0, y: 0, w: w - right, h });
    el.board.style.width = w + 'px';
    el.board.style.height = h + 'px';
  }
  window.addEventListener('resize', layout);

  const glyph = (key) => {
    const cls = { a: 'a', b: 'b', x: 'x', y: 'y' }[key] || 'shoulder';
    const label = { lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', view: 'View' }[key] || key.toUpperCase();
    return '<span class="glyph ' + cls + '">' + label + '</span>';
  };
  const button = (action, text, keys) =>
    '<button type="button" class="hud-button" data-action="' + action + '">' + (keys || [action]).map(glyph).join(' ') + ' ' + text + '</button>';
  const dot = (color) => '<span class="dot" style="background:' + color + '"></span>';
  const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const SEAT_LABELS = { human: 'Human', easy: 'AI · Easy', medium: 'AI · Medium', hard: 'AI · Hard' };
  const aiTag = (p) => (p.ai ? ' <span class="ai-tag">AI ' + AI.LEVEL_NAMES[p.ai] + '</span>' : '');

  function menuHtml() {
    const items = app.menuItems();
    const values = {
      players: ['Players', app.menu.players],
      length: ['Game length', app.menu.quick ? 'Quick (' + App.QUICK_DECK + ' tiles)' : 'Full (71 tiles)'],
      pads: ['Controllers', app.menu.ownPads ? 'One each' : 'Pass one around'],
      start: ['New game', null],
      continue: ['Continue saved game', null],
    };
    return items.map((item, i) => {
      const [label, value] = values[item];
      const cls = (i === app.menu.focus ? 'focus ' : '') + (value == null ? 'action' : '');
      return '<li class="' + cls + '" data-menu="' + i + '">' + (value == null ? label : '<span>' + label + '</span><span class="value">' + value + '</span>') + '</li>';
    }).join('');
  }

  function seatsHtml() {
    const rows = [];
    for (let i = 0; i < app.menu.players; i++) {
      const focus = i === app.setupFocus ? 'focus' : '';
      rows.push('<li class="seat ' + focus + '" data-seat="' + i + '">' +
        '<span class="seat-name">' + dot(E.PLAYER_COLORS[i]) + '<span>' + esc(app.seatName(i)) + '</span></span>' +
        '<span class="value" data-seat-type="' + i + '">' + SEAT_LABELS[app.setup.types[i]] + '</span></li>');
    }
    rows.push('<li class="action ' + (app.setupFocus === app.menu.players ? 'focus' : '') + '" data-seat="' + app.menu.players + '">Start game</li>');
    return rows.join('');
  }

  function keyboardHtml() {
    const ed = app.editor;
    const upper = app.editorUpper();
    const current = app.editorKey();
    const labels = { del: '⌫ Delete', space: 'Space', shift: ed.shift ? '⇧ Shift on' : '⇧ Shift', done: 'Done' };
    return App.KEYBOARD.map((row, r) => row.map((k) => {
      const label = labels[k.value] || (/^[a-z]$/.test(k.value) && upper ? k.value.toUpperCase() : k.value);
      const cls = 'kb-key' + (k === current ? ' focus' : '') + (k.value.length > 1 ? ' wide' : '') + (k.value === 'done' ? ' done' : '');
      return '<button type="button" class="' + cls + '" style="grid-column: span ' + k.span + '" data-kb-row="' + r + '" data-kb-col="' + k.col + '">' + esc(label) + '</button>';
    }).join('')).join('');
  }

  function hintsHtml() {
    const p = app.player();
    if (app.isAITurn()) {
      return '<span class="hint-label" style="border-color:' + p.color + '">' + esc(p.name) + ' (AI ' + AI.LEVEL_NAMES[p.ai] + ') is playing…</span>' +
        button('rt', 'Zoom', ['lt', 'rt']) + button('view', 'Help');
    }
    if (app.phase === 'scout') {
      const opt = app.currentOption();
      const label = opt ? 'Scout on the ' + App.FEATURE_NAMES[opt.type] : 'No scout';
      return '<span class="hint-label" style="border-color:' + p.color + '">' + label + '</span>' +
        '<button type="button" class="hud-button" data-action="left">◀</button>' +
        '<button type="button" class="hud-button" data-action="right">▶ Choose</button>' +
        button('a', 'Confirm') + button('b', 'No scout') + button('x', 'Take tile back') + button('view', 'Help');
    }
    return button('a', 'Place') + button('x', 'Rotate') + button('y', 'Next fit') +
      button('rt', 'Zoom', ['lt', 'rt']) + button('view', 'Help');
  }

  let lastKey = '';
  function updateDom() {
    const scr = app.screen;
    const game = app.game;
    const sig = JSON.stringify([
      scr, app.menu, app.hasSave(), app.joinIndex, app.bindings, app.help, input.connected,
      app.setup, app.setupFocus, app.editor, app.isAITurn(), !!app.aiPlan,
      app.phase, app.tile, app.rot, app.optionIndex, app.options.length,
      game && game.players.map((p) => [p.score, p.scouts]), game && game.current, game && game.deck.length,
    ]);
    if (sig !== lastKey) {
      lastKey = sig;
      el.title.hidden = scr !== 'title';
      el.join.hidden = scr !== 'join';
      el.setup.hidden = scr !== 'setup';
      el.keyboard.hidden = !app.editor;
      el.hud.hidden = scr !== 'play';
      el.over.hidden = scr !== 'over';
      el.help.hidden = !app.help;
      if (scr === 'title') {
        el.menu.innerHTML = menuHtml();
        el.padNote.innerHTML = input.connected
          ? input.connected + (input.connected === 1 ? ' controller' : ' controllers') + ' ready. ' + glyph('a') + ' to choose, D-pad to move.'
          : 'Press ' + glyph('a') + ' on a controller to wake it up (or use the arrow keys and Enter).';
      }
      if (scr === 'setup') el.seats.innerHTML = seatsHtml();
      if (app.editor) {
        const ed = app.editor;
        const fallback = E.PLAYER_NAMES[ed.seat];
        el.kbTitle.innerHTML = dot(E.PLAYER_COLORS[ed.seat]) + ' Name for player ' + (ed.seat + 1);
        el.kbField.innerHTML = ed.text
          ? esc(ed.text) + '<span class="caret"></span>'
          : '<span class="caret"></span><span class="placeholder">' + esc(fallback) + '</span>';
        el.kbField.style.borderColor = E.PLAYER_COLORS[ed.seat];
        el.kbKeys.innerHTML = keyboardHtml();
      }
      if (scr === 'join') {
        const i = app.joinSeats[app.joinIndex];
        el.joinPrompt.innerHTML = dot(E.PLAYER_COLORS[i]) + ' ' + esc(app.seatName(i)) + ', press ' + glyph('a') + ' on your controller';
        el.joinPrompt.style.color = E.PLAYER_COLORS[i];
        el.joinList.innerHTML = app.joinSeats.map((k, n) => '<li>' + dot(E.PLAYER_COLORS[k]) + esc(app.seatName(k)) + ': ' +
          (n < app.joinIndex ? (app.bindings[k] == null ? 'keyboard / pointer' : 'controller ' + (app.bindings[k] + 1)) : '…') + '</li>').join('');
      }
      if (scr === 'play') {
        const p = app.player();
        el.turn.innerHTML = dot(p.color) + '<span>' + esc(p.name) + "'s turn</span>" + aiTag(p);
        el.turn.style.borderColor = p.color;
        el.deck.textContent = game.deck.length + ' tiles left after this one';
        el.scores.innerHTML = game.players.map((pl, k) => '<li class="' + (k === game.current ? 'current' : '') + '" style="color:' + pl.color + '">' +
          dot(pl.color) + '<span><span class="name">' + esc(pl.name) + '</span>' + aiTag(pl) + '<br><span class="scouts">' + pl.scouts + ' scouts left</span></span>' +
          '<span class="pts">' + pl.score + '</span></li>').join('');
        el.hints.innerHTML = hintsHtml();
        renderer.drawPreview(el.preview, app.tile, app.rot, 240);
      }
      if (scr === 'over') {
        const rank = E.ranking(game);
        const top = rank.filter((r) => r.score === rank[0].score);
        el.winner.textContent = top.length > 1 ? 'A tie at ' + rank[0].score + '!' : rank[0].name + ' wins!';
        el.winner.style.color = top.length > 1 ? '' : rank[0].color;
        el.ranking.innerHTML = rank.map((r) => '<li>' + dot(r.color) + esc(r.name) + aiTag(r) + '<span class="pts">' + r.score + '</span></li>').join('');
        el.finalList.innerHTML = app.finalEvents.filter((ev) => ev.points > 0)
          .map((ev) => '<div>' + esc(app.describe(ev)) + '</div>').join('') || '<div>No end-of-game points.</div>';
      }
      layout();
    }

    // Toasts and the turn banner change on their own clock.
    const toastKey = app.toasts.map((t) => t.text + t.until).join('|');
    if (el.toasts.dataset.key !== toastKey) {
      el.toasts.dataset.key = toastKey;
      el.toasts.innerHTML = app.toasts.map((t) => '<div class="toast" style="border-color:' + (t.color || 'rgba(255,230,200,0.16)') + '">' + esc(t.text) + '</div>').join('');
    }
    const bannerKey = app.banner ? app.banner.text + app.banner.until : '';
    if (el.banner.dataset.key !== bannerKey) {
      el.banner.dataset.key = bannerKey;
      el.banner.hidden = !app.banner;
      if (app.banner) {
        el.banner.textContent = app.banner.text;
        el.banner.style.color = app.banner.color;
        el.banner.style.animation = 'none';
        void el.banner.offsetWidth;
        el.banner.style.animation = '';
      }
    }
  }

  function frame(t) {
    input.poll(t);
    app.tick();
    updateDom();
    renderer.draw(app, t);
    requestAnimationFrame(frame);
  }

  layout();
  requestAnimationFrame(frame);
})();
