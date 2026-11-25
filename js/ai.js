/*
 * Mesa Trails computer players. No DOM here.
 *
 * Each turn the AI tries every legal spot and rotation for its tile, and for
 * each one every scout it could stand (or none). It scores the board that
 * would result with a rough estimate of what each player's features will be
 * worth by the end, and picks the best.
 *
 *   easy:   often plays a random spot, ignores rivals, makes noisy choices.
 *   medium: plays for itself, keeps half an eye on the other players.
 *   hard:   maximises its lead over the strongest rival, no noise.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MesaAI = factory(root.MesaEngine);
})(this, function (E) {
  'use strict';

  const { TYPES } = E;
  const LEVELS = ['easy', 'medium', 'hard'];
  const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const SETTINGS = {
    easy: { randomMove: 0.45, randomScout: 0.4, noise: 3, rivals: 0 },
    medium: { randomMove: 0, randomScout: 0, noise: 1.2, rivals: 0.5 },
    hard: { randomMove: 0, randomScout: 0, noise: 0.02, rivals: 1 },
  };

  // Cells next to a region where a tile is still missing.
  function openings(state, region) {
    if (region.type === 'oasis') return 8 - region.around;
    const cells = new Set();
    region.nodes.forEach((node) => {
      const tile = E.tileAt(state, node.x, node.y);
      TYPES[tile.type].features[node.f].slots.forEach((s) => {
        const d = Math.floor(E.rotSlot(s, tile.rot) / 3);
        const nx = node.x + E.DIRS[d][0];
        const ny = node.y + E.DIRS[d][1];
        if (!E.tileAt(state, nx, ny)) cells.add(E.key(nx, ny));
      });
    });
    return cells.size;
  }

  // A rough chance that a feature gets finished before the tiles run out.
  function finishChance(region, open, deckLeft) {
    if (region.complete) return 1;
    if (deckLeft <= 0 || open <= 0) return 0;
    if (region.type === 'oasis') return Math.min(0.95, deckLeft / (deckLeft + 3 * open)) * Math.pow(0.85, open - 1);
    return Math.min(0.8, deckLeft / (deckLeft + 10 * open)) * Math.pow(0.6, open - 1);
  }

  // Points not yet banked are worth less: tiles may not come, rivals may move in.
  const UNSURE = 0.85;

  // What a scout still in hand is worth: a lot early on, nothing once the tiles are gone.
  function scoutWorth(deckLeft) {
    return deckLeft <= 0 ? 0 : Math.min(1.6, 0.3 + deckLeft * 0.03);
  }

  function reserve(count, deckLeft) {
    const each = scoutWorth(deckLeft);
    return each * Math.min(count, 3) + each * 0.5 * Math.max(0, count - 3);
  }

  // Expected points for whoever holds a region, plus the chance its scouts come home.
  function regionOutlook(state, analysis, deckLeft) {
    const { regions } = analysis;
    const info = regions.map((r) => {
      const open = r.type === 'scrub' ? 0 : openings(state, r);
      return { open, chance: r.type === 'scrub' ? 0 : finishChance(r, open, deckLeft) };
    });
    regions.forEach((r, i) => {
      const c = info[i].chance;
      let value;
      switch (r.type) {
        case 'trail':
          value = r.tiles.length + (r.complete ? 0 : c * 0.5);
          break;
        case 'mesa': {
          const full = r.tiles.length * E.POINTS.mesaPerTile + r.springs * E.POINTS.mesaPerSpring;
          const part = r.tiles.length * E.POINTS.unfinishedMesaPerTile + r.springs * E.POINTS.unfinishedMesaPerSpring;
          value = r.complete ? full : part + c * (full - part) * 0.75;
          break;
        }
        case 'oasis':
          value = r.complete ? E.POINTS.oasisFull : c * E.POINTS.oasisFull + (1 - c) * (1 + r.around);
          break;
        case 'scrub':
          value = (r.bordersMesas || []).reduce((sum, id) => {
            const m = regions[id];
            return sum + (m.complete ? E.POINTS.scrubPerMesa : info[id].chance * E.POINTS.scrubPerMesa * 0.8);
          }, 0);
          break;
        default:
          value = 0;
      }
      info[i].value = r.complete ? value : value * UNSURE;
    });
    return info;
  }

  // Each player's expected final score if the game went on from this board.
  // extra: { region, player } adds one hypothetical scout.
  function playerValues(state, analysis, outlook, extra, deckLeft) {
    const n = state.players.length;
    const values = state.players.map((p) => p.score);
    const hand = state.players.map((p) => p.scouts);
    const back = new Array(n).fill(0);
    const each = scoutWorth(deckLeft);
    analysis.regions.forEach((r, i) => {
      const counts = new Array(n).fill(0);
      r.scouts.forEach((s) => { counts[s.player]++; });
      if (extra && extra.region === i) { counts[extra.player]++; hand[extra.player]--; }
      const best = Math.max(...counts);
      if (best === 0) return;
      const o = outlook[i];
      counts.forEach((c, p) => {
        if (c === best) values[p] += o.value;
        if (!c) return;
        if (r.complete && r.type !== 'scrub') hand[p] += c; // scored now, scouts come straight home
        else if (r.type !== 'scrub') back[p] += c * o.chance * each * 0.5;
      });
    });
    for (let p = 0; p < n; p++) values[p] += reserve(hand[p], deckLeft) + back[p];
    return values;
  }

  function judge(values, me, rivals) {
    const others = values.filter((_, i) => i !== me);
    if (!others.length || !rivals) return values[me];
    const rival = rivals >= 1 ? Math.max(...others) : others.reduce((a, b) => a + b, 0) / others.length;
    return values[me] - rivals * rival;
  }

  /*
   * Pick a move for the current player.
   * Returns { x, y, rot, f } where f is the feature to stand a scout on, or null.
   */
  function chooseMove(state, typeId, level, rnd) {
    const s = SETTINGS[level] || SETTINGS.medium;
    const random = rnd || Math.random;
    const me = state.current;
    const placements = E.legalPlacements(state, typeId);
    if (!placements.length) return null;
    const deckLeft = state.deck.length;
    const scoutsLeft = state.players[me].scouts;
    const def = TYPES[typeId];

    const forced = random() < s.randomMove ? placements[Math.floor(random() * placements.length)] : null;
    let best = null;
    (forced ? [forced] : placements).forEach((pl) => {
      const k = E.key(pl.x, pl.y);
      E.putTile(state, typeId, pl.rot, pl.x, pl.y);
      try {
        const analysis = E.analyze(state);
        const outlook = regionOutlook(state, analysis, deckLeft);
        const choices = [{ f: null, region: null }];
        if (scoutsLeft > 0) {
          def.features.forEach((feat, f) => {
            const id = analysis.nodeRegion[analysis.nodeKey(pl.x, pl.y, f)];
            if (analysis.regions[id].scouts.length === 0) choices.push({ f, region: id });
          });
        }
        const scored = choices.map((c) => {
          const extra = c.region == null ? null : { region: c.region, player: me };
          const v = judge(playerValues(state, analysis, outlook, extra, deckLeft), me, s.rivals);
          return { f: c.f, score: v + (random() * 2 - 1) * s.noise };
        });
        let pick = scored.reduce((a, b) => (b.score > a.score ? b : a));
        if (s.randomScout && random() < s.randomScout) pick = scored[Math.floor(random() * scored.length)];
        if (!best || pick.score > best.score) best = { x: pl.x, y: pl.y, rot: pl.rot, f: pick.f, score: pick.score };
      } finally {
        delete state.tiles[k];
      }
    });
    return { x: best.x, y: best.y, rot: best.rot, f: best.f };
  }

  return { LEVELS, LEVEL_NAMES, SETTINGS, chooseMove, openings, finishChance };
});
