/*
 * Mesa Trails rules engine. No DOM here, so the same file runs in the
 * browser and under `node --test`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tiles.js'));
  else root.MesaEngine = factory(root.MesaTiles);
})(this, function (Tiles) {
  'use strict';

  const { TYPES, START_TILE } = Tiles;

  // Directions: 0 north, 1 east, 2 south, 3 west.
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const SCOUTS_PER_PLAYER = 7;
  const POINTS = {
    trailPerTile: 1,
    mesaPerTile: 2,
    mesaPerSpring: 2,
    unfinishedMesaPerTile: 1,
    unfinishedMesaPerSpring: 1,
    oasisFull: 9,
    scrubPerMesa: 3,
  };
  const PLAYER_COLORS = ['#ffd23f', '#35b6ff', '#ff4fb3', '#f4f4f4'];
  const PLAYER_NAMES = ['Gold', 'Sky', 'Rose', 'Snow'];

  const key = (x, y) => x + ',' + y;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rnd) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function fullDeck() {
    const ids = [];
    Object.values(TYPES).forEach((t) => { for (let i = 0; i < t.count; i++) ids.push(t.id); });
    return ids;
  }

  // Rotation is in quarter turns clockwise; one quarter turn moves a slot by 3.
  const rotSlot = (s, rot) => (s + 3 * rot) % 12;
  const unrotSlot = (w, rot) => (((w - 3 * rot) % 12) + 12) % 12;

  // The slot on the neighbouring tile that touches slot w of this tile.
  function facingSlot(w) {
    const d = Math.floor(w / 3);
    const i = w % 3;
    return 3 * ((d + 2) % 4) + (2 - i);
  }

  function featureIndexAt(typeId, rot, w) {
    return TYPES[typeId].slotFeature[unrotSlot(w, rot)];
  }

  function edgeKind(typeId, rot, dir) {
    const def = TYPES[typeId];
    return def.features[featureIndexAt(typeId, rot, 3 * dir + 1)].type;
  }

  // Where a feature's scout stands, in tile units after rotation.
  function featureSpot(typeId, rot, f) {
    let [x, y] = TYPES[typeId].features[f].at;
    for (let i = 0; i < rot; i++) [x, y] = [1 - y, x];
    return [x, y];
  }

  function newGame(opts) {
    const o = opts || {};
    const count = Math.max(2, Math.min(4, o.players || 2));
    const seed = o.seed == null ? Math.floor(Math.random() * 2 ** 31) : o.seed;
    let deck = shuffle(fullDeck(), mulberry32(seed));
    if (o.deckSize && o.deckSize < deck.length) deck = deck.slice(0, o.deckSize);
    const state = {
      version: 1,
      seed,
      tiles: {},
      players: [],
      deck,
      discarded: [],
      current: 0,
      turn: 1,
      finished: false,
    };
    for (let i = 0; i < count; i++) {
      const p = (o.playerInfo && o.playerInfo[i]) || {};
      state.players.push({
        name: p.name || PLAYER_NAMES[i],
        color: p.color || PLAYER_COLORS[i],
        score: 0,
        scouts: SCOUTS_PER_PLAYER,
      });
    }
    putTile(state, START_TILE, 0, 0, 0);
    return state;
  }

  function putTile(state, typeId, rot, x, y) {
    const tile = { type: typeId, rot: ((rot % 4) + 4) % 4, x, y, scouts: [] };
    state.tiles[key(x, y)] = tile;
    return tile;
  }

  function tileAt(state, x, y) {
    return state.tiles[key(x, y)] || null;
  }

  function canPlace(state, typeId, rot, x, y) {
    if (tileAt(state, x, y)) return false;
    let touching = 0;
    for (let d = 0; d < 4; d++) {
      const n = tileAt(state, x + DIRS[d][0], y + DIRS[d][1]);
      if (!n) continue;
      touching++;
      if (edgeKind(typeId, rot, d) !== edgeKind(n.type, n.rot, (d + 2) % 4)) return false;
    }
    return touching > 0;
  }

  function openCells(state) {
    const seen = new Set();
    const cells = [];
    Object.values(state.tiles).forEach((t) => {
      DIRS.forEach(([dx, dy]) => {
        const x = t.x + dx;
        const y = t.y + dy;
        const k = key(x, y);
        if (seen.has(k) || state.tiles[k]) return;
        seen.add(k);
        cells.push({ x, y });
      });
    });
    return cells;
  }

  function legalPlacements(state, typeId) {
    const out = [];
    openCells(state).forEach(({ x, y }) => {
      for (let rot = 0; rot < 4; rot++) {
        if (canPlace(state, typeId, rot, x, y)) out.push({ x, y, rot });
      }
    });
    // Stable order: top to bottom, left to right.
    out.sort((a, b) => a.y - b.y || a.x - b.x || a.rot - b.rot);
    return out;
  }

  /*
   * Join every feature on the table into connected regions.
   * A region: { id, type, nodes, tiles, springs, open, complete, scouts, mesaNodes }
   */
  function analyze(state) {
    const regions = [];
    const nodeRegion = {};
    const nodeKey = (x, y, f) => x + ',' + y + '#' + f;

    Object.values(state.tiles).forEach((start) => {
      const def = TYPES[start.type];
      def.features.forEach((feat, f) => {
        const startKey = nodeKey(start.x, start.y, f);
        if (nodeRegion[startKey] != null) return;
        const region = {
          id: regions.length,
          type: feat.type,
          nodes: [],
          tiles: [],
          springs: 0,
          open: false,
          complete: false,
          scouts: [],
          mesaNodes: [],
        };
        regions.push(region);
        const tileSet = new Set();

        if (feat.type === 'oasis') {
          nodeRegion[startKey] = region.id;
          region.nodes.push({ x: start.x, y: start.y, f });
          let around = 0;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if ((dx || dy) && tileAt(state, start.x + dx, start.y + dy)) around++;
            }
          }
          region.tiles = [key(start.x, start.y)];
          region.around = around;
          region.complete = around === 8;
          region.open = !region.complete;
          start.scouts.forEach((s) => { if (s.f === f) region.scouts.push({ x: start.x, y: start.y, f, player: s.player }); });
          return;
        }

        const queue = [{ x: start.x, y: start.y, f }];
        nodeRegion[startKey] = region.id;
        while (queue.length) {
          const node = queue.shift();
          region.nodes.push(node);
          const tile = tileAt(state, node.x, node.y);
          const tdef = TYPES[tile.type];
          const tfeat = tdef.features[node.f];
          tileSet.add(key(node.x, node.y));
          if (tfeat.spring) region.springs++;
          tile.scouts.forEach((s) => {
            if (s.f === node.f) region.scouts.push({ x: node.x, y: node.y, f: node.f, player: s.player });
          });
          if (tfeat.adj) tfeat.adj.forEach((m) => region.mesaNodes.push(nodeKey(node.x, node.y, m)));
          tfeat.slots.forEach((s) => {
            const w = rotSlot(s, tile.rot);
            const d = Math.floor(w / 3);
            const nx = node.x + DIRS[d][0];
            const ny = node.y + DIRS[d][1];
            const n = tileAt(state, nx, ny);
            if (!n) {
              if (tfeat.type !== 'scrub') region.open = true;
              return;
            }
            const nf = featureIndexAt(n.type, n.rot, facingSlot(w));
            const nk = nodeKey(nx, ny, nf);
            if (nodeRegion[nk] == null) {
              nodeRegion[nk] = region.id;
              queue.push({ x: nx, y: ny, f: nf });
            }
          });
        }
        region.tiles = Array.from(tileSet);
        region.complete = region.type !== 'scrub' && !region.open;
      });
    });

    // Scrub regions score from the finished mesas they border.
    regions.forEach((r) => {
      if (r.type !== 'scrub') return;
      const ids = new Set(r.mesaNodes.map((nk) => nodeRegion[nk]));
      r.bordersMesas = Array.from(ids);
      r.finishedMesas = r.bordersMesas.filter((id) => regions[id].complete).length;
    });

    return { regions, nodeRegion, nodeKey };
  }

  function regionPoints(region, endOfGame) {
    switch (region.type) {
      case 'trail':
        return region.tiles.length * POINTS.trailPerTile;
      case 'mesa':
        if (region.complete) return region.tiles.length * POINTS.mesaPerTile + region.springs * POINTS.mesaPerSpring;
        return endOfGame
          ? region.tiles.length * POINTS.unfinishedMesaPerTile + region.springs * POINTS.unfinishedMesaPerSpring
          : 0;
      case 'oasis':
        if (region.complete) return POINTS.oasisFull;
        return endOfGame ? 1 + region.around : 0;
      case 'scrub':
        return endOfGame ? region.finishedMesas * POINTS.scrubPerMesa : 0;
      default:
        return 0;
    }
  }

  // Players with the most scouts on a region (ties all score).
  function leaders(region, playerCount) {
    const counts = new Array(playerCount).fill(0);
    region.scouts.forEach((s) => { counts[s.player]++; });
    const best = Math.max(...counts);
    if (best === 0) return [];
    return counts.map((c, i) => (c === best ? i : -1)).filter((i) => i >= 0);
  }

  function scoutOptions(state, x, y, player) {
    const tile = tileAt(state, x, y);
    const p = player == null ? state.current : player;
    if (!tile || state.players[p].scouts <= 0) return [];
    const { regions, nodeRegion, nodeKey } = analyze(state);
    const def = TYPES[tile.type];
    const out = [];
    def.features.forEach((feat, f) => {
      const region = regions[nodeRegion[nodeKey(x, y, f)]];
      if (region.scouts.length === 0) out.push({ f, type: feat.type, spot: featureSpot(tile.type, tile.rot, f) });
    });
    return out;
  }

  function placeScout(state, x, y, f, player) {
    const p = player == null ? state.current : player;
    const ok = scoutOptions(state, x, y, p).some((o) => o.f === f);
    if (!ok) return false;
    tileAt(state, x, y).scouts.push({ f, player: p });
    state.players[p].scouts--;
    return true;
  }

  function removeScouts(state, region) {
    region.scouts.forEach((s) => {
      const tile = tileAt(state, s.x, s.y);
      tile.scouts = tile.scouts.filter((t) => t.f !== s.f);
      state.players[s.player].scouts++;
    });
  }

  // Score every finished region that still has scouts on it, then send them home.
  function scoreFinished(state) {
    const { regions } = analyze(state);
    const events = [];
    regions.forEach((r) => {
      if (!r.complete || r.scouts.length === 0 || r.type === 'scrub') return;
      const points = regionPoints(r, false);
      const winners = leaders(r, state.players.length);
      winners.forEach((p) => { state.players[p].score += points; });
      events.push({ type: r.type, points, players: winners, tiles: r.tiles.slice(), final: false });
      removeScouts(state, r);
    });
    return events;
  }

  function scoreEndOfGame(state) {
    const { regions } = analyze(state);
    const events = [];
    regions.forEach((r) => {
      if (r.scouts.length === 0) return;
      const points = regionPoints(r, true);
      const winners = leaders(r, state.players.length);
      if (points > 0) winners.forEach((p) => { state.players[p].score += points; });
      events.push({ type: r.type, points, players: winners, tiles: r.tiles.slice(), final: true });
    });
    state.finished = true;
    return events;
  }

  // Take tiles off the deck until one fits somewhere. Returns null when the deck runs out.
  function drawPlayable(state) {
    while (state.deck.length) {
      const id = state.deck.pop();
      if (legalPlacements(state, id).length) return id;
      state.discarded.push(id);
    }
    return null;
  }

  function ranking(state) {
    return state.players
      .map((p, i) => ({ index: i, name: p.name, color: p.color, score: p.score }))
      .sort((a, b) => b.score - a.score);
  }

  return {
    TYPES,
    START_TILE,
    DIRS,
    POINTS,
    SCOUTS_PER_PLAYER,
    PLAYER_COLORS,
    PLAYER_NAMES,
    key,
    mulberry32,
    fullDeck,
    rotSlot,
    unrotSlot,
    facingSlot,
    featureIndexAt,
    edgeKind,
    featureSpot,
    newGame,
    putTile,
    tileAt,
    canPlace,
    openCells,
    legalPlacements,
    analyze,
    regionPoints,
    leaders,
    scoutOptions,
    placeScout,
    scoreFinished,
    scoreEndOfGame,
    drawPlayable,
    ranking,
  };
});
