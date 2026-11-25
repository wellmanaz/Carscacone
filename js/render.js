/*
 * Mesa Trails board drawing (Canvas 2D). Tile art is drawn from the tile
 * definitions, cached per tile type, rotation and size.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MesaRender = factory(root.MesaEngine);
})(this, function (E) {
  'use strict';

  const C = {
    table: '#17141d',
    scrub: '#a3b066',
    scrubDark: '#8a9a52',
    scrubLight: '#bfca84',
    trailEdge: '#5e4128',
    trail: '#ead6a6',
    trailRut: '#c7ab76',
    mesaLight: '#dc7d4e',
    mesaDark: '#b4502b',
    mesaStrata: 'rgba(250, 190, 150, 0.45)',
    cliff: '#5f2412',
    water: '#3fa9d4',
    waterLight: '#a6e4f6',
    grass: '#5b9b4f',
    palm: '#2e6b35',
    sand: '#e5d29c',
    stone: '#8c7b69',
    stoneEdge: '#43362a',
    outline: '#1a1620',
    good: '#59f28d',
    bad: '#ff5a5a',
  };
  const MID = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
  const CORNER_BETWEEN = { '0,1': [1, 0], '1,2': [1, 1], '2,3': [0, 1], '0,3': [0, 0] };

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function edgesOf(feat) {
    const set = new Set(feat.slots.map((s) => Math.floor(s / 3)));
    return Array.from(set).sort((a, b) => a - b);
  }

  function turn(ctx, q) {
    ctx.translate(0.5, 0.5);
    ctx.rotate((q * Math.PI) / 2);
    ctx.translate(-0.5, -0.5);
  }

  // Builds the mesa outline (fill) and its cliff line (the inner edge) for a set of edges.
  function mesaShape(ctx, edges, part) {
    const n = edges.length;
    ctx.save();
    ctx.beginPath();
    if (n === 4) {
      if (part === 'fill') ctx.rect(0, 0, 1, 1);
    } else if (n === 1) {
      turn(ctx, edges[0]);
      if (part === 'fill') { ctx.moveTo(0, 0); ctx.lineTo(1, 0); ctx.quadraticCurveTo(0.5, 0.6, 0, 0); ctx.closePath(); }
      else { ctx.moveTo(1, 0); ctx.quadraticCurveTo(0.5, 0.6, 0, 0); }
    } else if (n === 2 && edges[1] - edges[0] === 2) {
      turn(ctx, edges[0]);
      if (part === 'fill') {
        ctx.moveTo(0, 0); ctx.lineTo(1, 0); ctx.quadraticCurveTo(0.62, 0.5, 1, 1);
        ctx.lineTo(0, 1); ctx.quadraticCurveTo(0.38, 0.5, 0, 0); ctx.closePath();
      } else {
        ctx.moveTo(1, 0); ctx.quadraticCurveTo(0.62, 0.5, 1, 1);
        ctx.moveTo(0, 1); ctx.quadraticCurveTo(0.38, 0.5, 0, 0);
      }
    } else if (n === 2) {
      const first = edges[0] === 0 && edges[1] === 3 ? 3 : edges[0];
      turn(ctx, first);
      if (part === 'fill') { ctx.moveTo(0, 0); ctx.lineTo(1, 0); ctx.lineTo(1, 1); ctx.quadraticCurveTo(0.72, 0.28, 0, 0); ctx.closePath(); }
      else { ctx.moveTo(1, 1); ctx.quadraticCurveTo(0.72, 0.28, 0, 0); }
    } else if (n === 3) {
      const missing = [0, 1, 2, 3].find((d) => !edges.includes(d));
      turn(ctx, (missing + 2) % 4);
      if (part === 'fill') { ctx.moveTo(0, 0); ctx.lineTo(1, 0); ctx.lineTo(1, 1); ctx.quadraticCurveTo(0.5, 0.4, 0, 1); ctx.closePath(); }
      else { ctx.moveTo(1, 1); ctx.quadraticCurveTo(0.5, 0.4, 0, 1); }
    }
    ctx.restore();
  }

  function trailShape(ctx, edges) {
    ctx.beginPath();
    if (edges.length === 2) {
      const [a, b] = edges;
      if (b - a === 2) {
        ctx.moveTo(MID[a][0], MID[a][1]);
        ctx.lineTo(MID[b][0], MID[b][1]);
      } else {
        const [cx, cy] = CORNER_BETWEEN[a + ',' + b];
        const angA = Math.atan2(MID[a][1] - cy, MID[a][0] - cx);
        let angB = Math.atan2(MID[b][1] - cy, MID[b][0] - cx);
        let diff = angB - angA;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        angB = angA + diff;
        ctx.arc(cx, cy, 0.5, angA, angB, diff < 0);
      }
    } else {
      const a = edges[0];
      ctx.moveTo(MID[a][0], MID[a][1]);
      ctx.lineTo(0.5, 0.5);
    }
  }

  // Draws one tile, unrotated, into the unit square. rot (quarter turns the caller has
  // already applied) only keeps the rock layers level.
  function drawTileArt(ctx, typeId, rot) {
    const def = E.TYPES[typeId];
    const rnd = E.mulberry32(hashString(typeId));

    ctx.fillStyle = C.scrub;
    ctx.fillRect(0, 0, 1, 1);
    for (let i = 0; i < 26; i++) {
      const x = 0.04 + rnd() * 0.92;
      const y = 0.04 + rnd() * 0.92;
      ctx.fillStyle = i % 3 === 0 ? C.scrubLight : C.scrubDark;
      ctx.beginPath();
      ctx.arc(x, y, i % 3 === 0 ? 0.012 : 0.018, 0, Math.PI * 2);
      ctx.fill();
    }

    const trails = def.features.filter((f) => f.type === 'trail');
    const mesas = def.features.filter((f) => f.type === 'mesa');
    const oasis = def.features.find((f) => f.type === 'oasis');

    ctx.lineCap = 'butt';
    [[C.trailEdge, 0.17], [C.trail, 0.11]].forEach(([color, width]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      trails.forEach((t) => { trailShape(ctx, edgesOf(t)); ctx.stroke(); });
    });
    ctx.save();
    ctx.setLineDash([0.035, 0.05]);
    ctx.strokeStyle = C.trailRut;
    ctx.lineWidth = 0.014;
    trails.forEach((t) => { trailShape(ctx, edgesOf(t)); ctx.stroke(); });
    ctx.restore();

    const deadEnds = trails.some((t) => edgesOf(t).length === 1);
    const centreCovered = !!oasis || mesas.some((m) => edgesOf(m).length >= 3);
    if (deadEnds && !centreCovered) {
      ctx.fillStyle = C.stone;
      ctx.strokeStyle = C.stoneEdge;
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      ctx.arc(0.5, 0.5, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(0.47, 0.47, 0.04, 0, Math.PI * 2);
      ctx.fill();
    }

    mesas.forEach((m) => {
      const edges = edgesOf(m);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 0.1;
      mesaShape(ctx, edges, 'cliff');
      ctx.stroke();
    });
    mesas.forEach((m) => {
      const edges = edgesOf(m);
      const grad = ctx.createLinearGradient(0, 0, 1, 1);
      grad.addColorStop(0, C.mesaLight);
      grad.addColorStop(1, C.mesaDark);
      ctx.fillStyle = grad;
      mesaShape(ctx, edges, 'fill');
      ctx.fill();
      ctx.save();
      mesaShape(ctx, edges, 'fill');
      ctx.clip();
      turn(ctx, -(rot || 0));
      ctx.strokeStyle = C.mesaStrata;
      ctx.lineWidth = 0.014;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 0.2 - 0.05);
        ctx.bezierCurveTo(0.3, i * 0.2 + 0.03, 0.6, i * 0.2 - 0.09, 1, i * 0.2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = C.cliff;
      ctx.lineWidth = 0.035;
      mesaShape(ctx, edges, 'cliff');
      ctx.stroke();
      if (m.spring) {
        const [sx, sy] = [m.at[0] - 0.15, m.at[1] + 0.02];
        ctx.fillStyle = C.water;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.075, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = C.waterLight;
        ctx.beginPath();
        ctx.arc(sx - 0.02, sy - 0.02, 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    if (oasis) {
      const [ox, oy] = oasis.at;
      [[C.sand, 0.25], [C.grass, 0.21], [C.water, 0.145]].forEach(([color, r]) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = C.waterLight;
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      ctx.arc(ox, oy, 0.1, Math.PI * 1.1, Math.PI * 1.5);
      ctx.stroke();
      [0.3, 2.4, 4.3].forEach((a) => {
        const px = ox + Math.cos(a) * 0.2;
        const py = oy + Math.sin(a) * 0.2;
        ctx.fillStyle = C.palm;
        for (let k = 0; k < 5; k++) {
          const la = (k / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(px + Math.cos(la) * 0.035, py + Math.sin(la) * 0.035, 0.04, 0.016, la, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#6b4a2b';
        ctx.beginPath();
        ctx.arc(px, py, 0.014, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.012;
    ctx.strokeRect(0.006, 0.006, 0.988, 0.988);
  }

  // A scout: a small standing figure; scouts in scrubland lie down.
  function drawScout(ctx, x, y, size, color, lying, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(x, y);
    ctx.scale(size, size);
    if (lying) ctx.rotate(-Math.PI / 2);
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0.012, 0.115, 0.11, 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.028;
    ctx.beginPath();
    ctx.moveTo(-0.1, 0.11);
    ctx.quadraticCurveTo(-0.1, -0.03, 0, -0.04);
    ctx.quadraticCurveTo(0.1, -0.03, 0.1, 0.11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -0.085, 0.058, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(-0.02, -0.1, 0.018, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function Renderer(canvas, opts) {
    const o = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.makeCanvas = o.makeCanvas || (() => document.createElement('canvas'));
    this.cache = {};
    this.cacheSize = 0;
    this.cam = { x: 0, y: 0.5, ready: false };
    this.w = canvas.width;
    this.h = canvas.height;
    this.dpr = 1;
    this.view = { x: 0, y: 0, w: this.w, h: this.h };
    this.demo = null;
  }

  Renderer.prototype.resize = function (w, h, dpr, view) {
    this.w = w;
    this.h = h;
    this.dpr = dpr || 1;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.view = view || { x: 0, y: 0, w, h };
  };

  Renderer.prototype.tileSize = function (zoom) {
    return Math.max(48, Math.round((Math.min(this.view.w, this.view.h) / 5.2) * (zoom || 1)));
  };

  Renderer.prototype.art = function (typeId, rot, size) {
    const px = Math.round(size * this.dpr);
    if (px !== this.cacheSize) { this.cache = {}; this.cacheSize = px; }
    const k = typeId + '|' + rot;
    if (!this.cache[k]) {
      const c = this.makeCanvas();
      c.width = px;
      c.height = px;
      const g = c.getContext('2d');
      g.scale(px, px);
      turn(g, rot);
      drawTileArt(g, typeId, rot);
      this.cache[k] = c;
    }
    return this.cache[k];
  };

  // Draws a single tile into its own canvas (the "next tile" preview).
  Renderer.prototype.drawPreview = function (canvas, typeId, rot, pixels) {
    const g = canvas.getContext('2d');
    canvas.width = pixels;
    canvas.height = pixels;
    g.clearRect(0, 0, pixels, pixels);
    if (!typeId) return;
    g.save();
    g.scale(pixels, pixels);
    turn(g, rot);
    drawTileArt(g, typeId, rot);
    g.restore();
  };

  Renderer.prototype.cellRect = function (cx, cy, size) {
    const ox = this.view.x + this.view.w / 2;
    const oy = this.view.y + this.view.h / 2;
    return { x: ox + (cx - this.cam.x - 0.5) * size, y: oy + (cy - this.cam.y - 0.5) * size, s: size };
  };

  // Which cell (and where inside it) a screen point falls on.
  Renderer.prototype.cellAt = function (px, py, zoom) {
    const size = this.tileSize(zoom);
    const ox = this.view.x + this.view.w / 2;
    const oy = this.view.y + this.view.h / 2;
    const gx = (px - ox) / size + this.cam.x + 0.5;
    const gy = (py - oy) / size + this.cam.y + 0.5;
    const x = Math.floor(gx);
    const y = Math.floor(gy);
    return { x, y, fx: gx - x, fy: gy - y };
  };

  Renderer.prototype.demoBoard = function () {
    if (this.demo) return this.demo;
    const s = E.newGame({ seed: 20261125, players: 2 });
    const rnd = E.mulberry32(99);
    for (let i = 0; i < 40; i++) {
      const id = E.drawPlayable(s);
      if (!id) break;
      const spots = E.legalPlacements(s, id);
      const p = spots[Math.floor(rnd() * spots.length)];
      E.putTile(s, id, p.rot, p.x, p.y);
    }
    this.demo = s;
    return s;
  };

  Renderer.prototype.drawTiles = function (game, size, t) {
    const ctx = this.ctx;
    Object.values(game.tiles).forEach((tile) => {
      const r = this.cellRect(tile.x, tile.y, size);
      if (r.x > this.w || r.y > this.h || r.x + size < 0 || r.y + size < 0) return;
      ctx.drawImage(this.art(tile.type, tile.rot, size), r.x, r.y, size, size);
    });
  };

  Renderer.prototype.drawScouts = function (game, size) {
    Object.values(game.tiles).forEach((tile) => {
      const r = this.cellRect(tile.x, tile.y, size);
      tile.scouts.forEach((s) => {
        const [fx, fy] = E.featureSpot(tile.type, tile.rot, s.f);
        const lying = E.TYPES[tile.type].features[s.f].type === 'scrub';
        drawScout(this.ctx, r.x + fx * size, r.y + fy * size, size * 1.25, game.players[s.player].color, lying);
      });
    });
  };

  Renderer.prototype.draw = function (app, t) {
    const ctx = this.ctx;
    const time = t || 0;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = C.table;
    ctx.fillRect(0, 0, this.w, this.h);
    const glow = ctx.createRadialGradient(this.w * 0.4, this.h * 0.45, 0, this.w * 0.4, this.h * 0.45, Math.max(this.w, this.h) * 0.7);
    glow.addColorStop(0, 'rgba(120, 70, 50, 0.35)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.w, this.h);

    if (!app.game || app.screen === 'title' || app.screen === 'setup' || app.screen === 'join') {
      const demo = this.demoBoard();
      const size = this.tileSize(0.8);
      this.cam.x = Math.sin(time / 9000) * 2;
      this.cam.y = Math.cos(time / 11000) * 1.5;
      ctx.globalAlpha = 0.32;
      this.drawTiles(demo, size, time);
      ctx.globalAlpha = 1;
      this.cam.ready = false;
      return;
    }

    const game = app.game;
    let size = this.tileSize(app.zoom);
    if (app.screen === 'over') {
      const b = app.bounds();
      const fit = Math.min(this.view.w / (b.maxX - b.minX + 2), this.view.h / (b.maxY - b.minY + 2));
      size = Math.max(24, Math.min(size, Math.floor(fit)));
    }
    const focus = app.phase === 'scout' && app.placed ? app.placed : app.cursor;
    if (!this.cam.ready || app.screen === 'over') {
      if (app.screen === 'over') {
        const b = app.bounds();
        this.cam.x = (b.minX + b.maxX) / 2;
        this.cam.y = (b.minY + b.maxY) / 2;
      } else {
        this.cam.x = focus.x;
        this.cam.y = focus.y;
      }
      this.cam.ready = true;
    } else {
      this.cam.x += (focus.x - this.cam.x) * 0.18;
      this.cam.y += (focus.y - this.cam.y) * 0.18;
    }

    const pulse = 0.5 + 0.5 * Math.sin(time / 260);

    if (app.screen === 'play' && app.phase === 'place') {
      const cells = new Map();
      app.legal.forEach((p) => {
        const k = p.x + ',' + p.y;
        if (!cells.has(k)) cells.set(k, { x: p.x, y: p.y, now: false });
        if (p.rot === app.rot) cells.get(k).now = true;
      });
      cells.forEach((c) => {
        const r = this.cellRect(c.x, c.y, size);
        ctx.fillStyle = c.now ? 'rgba(89, 242, 141, 0.2)' : 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(r.x + 4, r.y + 4, size - 8, size - 8);
        ctx.save();
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = c.now ? 'rgba(89, 242, 141, 0.7)' : 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 5, r.y + 5, size - 10, size - 10);
        ctx.restore();
      });
    }

    this.drawTiles(game, size, time);

    app.flashes.forEach((f) => {
      ctx.fillStyle = f.color;
      ctx.globalAlpha = app.screen === 'over' ? 0.18 : 0.2 + 0.25 * pulse;
      f.tiles.forEach((k) => {
        const [x, y] = k.split(',').map(Number);
        const r = this.cellRect(x, y, size);
        ctx.fillRect(r.x, r.y, size, size);
      });
      ctx.globalAlpha = 1;
    });

    this.drawScouts(game, size);

    if (app.screen !== 'play') return;
    const player = game.players[game.current];

    if (app.phase === 'place' && app.tile) {
      const r = this.cellRect(app.cursor.x, app.cursor.y, size);
      const ok = app.canPlaceHere();
      const taken = !!E.tileAt(game, app.cursor.x, app.cursor.y);
      if (!taken) {
        ctx.globalAlpha = 0.92;
        ctx.drawImage(this.art(app.tile, app.rot, size), r.x, r.y, size, size);
        ctx.globalAlpha = 1;
        if (!ok) {
          ctx.fillStyle = 'rgba(255, 60, 60, 0.28)';
          ctx.fillRect(r.x, r.y, size, size);
        }
      }
      ctx.save();
      ctx.shadowColor = ok ? C.good : C.bad;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = ok ? C.good : C.bad;
      ctx.lineWidth = 5 + 2 * pulse;
      ctx.strokeRect(r.x - 3, r.y - 3, size + 6, size + 6);
      ctx.restore();
    }

    if (app.phase === 'scout' && app.placed) {
      const r = this.cellRect(app.placed.x, app.placed.y, size);
      ctx.save();
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 5;
      ctx.strokeRect(r.x - 3, r.y - 3, size + 6, size + 6);
      ctx.restore();
      app.options.forEach((o, i) => {
        const px = r.x + o.spot[0] * size;
        const py = r.y + o.spot[1] * size;
        const selected = i === app.optionIndex;
        if (selected) {
          drawScout(ctx, px, py, size * 1.25, player.color, o.type === 'scrub', 0.95);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(px, py, size * (0.16 + 0.02 * pulse), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(px, py, size * 0.08, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(20, 16, 26, 0.55)';
          ctx.fill();
          ctx.lineWidth = 6;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          ctx.lineWidth = 3;
          ctx.strokeStyle = player.color;
          ctx.stroke();
        }
      });
    }
  };

  return { Renderer, drawTileArt, drawScout, COLORS: C };
});
