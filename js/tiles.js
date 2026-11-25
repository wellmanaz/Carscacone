/*
 * Mesa Trails tile set.
 *
 * Every tile edge is split into three slots, numbered clockwise:
 *   north 0,1,2 (west to east)   east 3,4,5 (north to south)
 *   south 6,7,8 (east to west)   west 9,10,11 (south to north)
 * The middle slot of an edge carries a trail; the outer two are the land on
 * either side of it. A mesa edge uses all three slots.
 *
 * Each feature lists the slots it touches in the tile's base orientation.
 *   type: 'trail' | 'mesa' | 'scrub' | 'oasis'
 *   at:   [x, y] spot (0..1) where a scout stands on this feature
 *   adj:  for scrub, the indexes of mesas on this tile that border it
 *   spring: a mesa with a spring scores extra
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MesaTiles = factory();
})(this, function () {
  'use strict';

  const CAP_N = [0, 1, 2];
  const CORNER_NW = [9, 10, 11, 0, 1, 2];
  const THREE_NEW = [9, 10, 11, 0, 1, 2, 3, 4, 5];
  const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  function withSpring(def, id, name) {
    const copy = JSON.parse(JSON.stringify(def));
    copy.id = id;
    copy.name = name;
    copy.features.forEach((f) => { if (f.type === 'mesa') f.spring = true; });
    return copy;
  }

  const base = [
    {
      id: 'oasis', name: 'Oasis', count: 4,
      features: [
        { type: 'oasis', slots: [], at: [0.5, 0.5] },
        { type: 'scrub', slots: ALL, adj: [], at: [0.18, 0.18] },
      ],
    },
    {
      id: 'oasis-trail', name: 'Oasis with trail', count: 2,
      features: [
        { type: 'oasis', slots: [], at: [0.5, 0.45] },
        { type: 'trail', slots: [7], at: [0.5, 0.84] },
        { type: 'scrub', slots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11], adj: [], at: [0.18, 0.18] },
      ],
    },
    {
      id: 'straight', name: 'Straight trail', count: 8,
      features: [
        { type: 'trail', slots: [1, 7], at: [0.5, 0.5] },
        { type: 'scrub', slots: [2, 3, 4, 5, 6], adj: [], at: [0.8, 0.5] },
        { type: 'scrub', slots: [8, 9, 10, 11, 0], adj: [], at: [0.2, 0.5] },
      ],
    },
    {
      id: 'curve', name: 'Bending trail', count: 9,
      features: [
        { type: 'trail', slots: [7, 10], at: [0.35, 0.65] },
        { type: 'scrub', slots: [8, 9], adj: [], at: [0.14, 0.86] },
        { type: 'scrub', slots: [0, 1, 2, 3, 4, 5, 6, 11], adj: [], at: [0.65, 0.35] },
      ],
    },
    {
      id: 'tee', name: 'Trail fork', count: 4,
      features: [
        { type: 'trail', slots: [4], at: [0.82, 0.5] },
        { type: 'trail', slots: [7], at: [0.5, 0.82] },
        { type: 'trail', slots: [10], at: [0.18, 0.5] },
        { type: 'scrub', slots: [11, 0, 1, 2, 3], adj: [], at: [0.5, 0.22] },
        { type: 'scrub', slots: [5, 6], adj: [], at: [0.83, 0.83] },
        { type: 'scrub', slots: [8, 9], adj: [], at: [0.17, 0.83] },
      ],
    },
    {
      id: 'cross', name: 'Crossroads', count: 1,
      features: [
        { type: 'trail', slots: [1], at: [0.5, 0.18] },
        { type: 'trail', slots: [4], at: [0.82, 0.5] },
        { type: 'trail', slots: [7], at: [0.5, 0.82] },
        { type: 'trail', slots: [10], at: [0.18, 0.5] },
        { type: 'scrub', slots: [2, 3], adj: [], at: [0.83, 0.17] },
        { type: 'scrub', slots: [5, 6], adj: [], at: [0.83, 0.83] },
        { type: 'scrub', slots: [8, 9], adj: [], at: [0.17, 0.83] },
        { type: 'scrub', slots: [11, 0], adj: [], at: [0.17, 0.17] },
      ],
    },
    {
      id: 'mesa-cap', name: 'Mesa edge', count: 5,
      features: [
        { type: 'mesa', slots: CAP_N, at: [0.5, 0.12] },
        { type: 'scrub', slots: [3, 4, 5, 6, 7, 8, 9, 10, 11], adj: [0], at: [0.5, 0.65] },
      ],
    },
    {
      id: 'cap-straight', name: 'Mesa edge with trail', count: 3,
      features: [
        { type: 'mesa', slots: CAP_N, at: [0.5, 0.12] },
        { type: 'trail', slots: [4, 10], at: [0.5, 0.5] },
        { type: 'scrub', slots: [3, 11], adj: [0], at: [0.14, 0.37] },
        { type: 'scrub', slots: [5, 6, 7, 8, 9], adj: [], at: [0.5, 0.8] },
      ],
    },
    {
      id: 'cap-curve-r', name: 'Mesa edge, trail bends right', count: 3,
      features: [
        { type: 'mesa', slots: CAP_N, at: [0.5, 0.12] },
        { type: 'trail', slots: [4, 7], at: [0.65, 0.65] },
        { type: 'scrub', slots: [5, 6], adj: [], at: [0.86, 0.86] },
        { type: 'scrub', slots: [3, 8, 9, 10, 11], adj: [0], at: [0.3, 0.55] },
      ],
    },
    {
      id: 'cap-curve-l', name: 'Mesa edge, trail bends left', count: 3,
      features: [
        { type: 'mesa', slots: CAP_N, at: [0.5, 0.12] },
        { type: 'trail', slots: [7, 10], at: [0.35, 0.65] },
        { type: 'scrub', slots: [8, 9], adj: [], at: [0.14, 0.86] },
        { type: 'scrub', slots: [3, 4, 5, 6, 11], adj: [0], at: [0.7, 0.55] },
      ],
    },
    {
      id: 'cap-tee', name: 'Mesa edge with trail fork', count: 3,
      features: [
        { type: 'mesa', slots: CAP_N, at: [0.5, 0.12] },
        { type: 'trail', slots: [4], at: [0.82, 0.5] },
        { type: 'trail', slots: [7], at: [0.5, 0.82] },
        { type: 'trail', slots: [10], at: [0.18, 0.5] },
        { type: 'scrub', slots: [3, 11], adj: [0], at: [0.25, 0.37] },
        { type: 'scrub', slots: [5, 6], adj: [], at: [0.83, 0.83] },
        { type: 'scrub', slots: [8, 9], adj: [], at: [0.17, 0.83] },
      ],
    },
    {
      id: 'mesa-corner', name: 'Mesa corner', count: 3,
      features: [
        { type: 'mesa', slots: CORNER_NW, at: [0.27, 0.27] },
        { type: 'scrub', slots: [3, 4, 5, 6, 7, 8], adj: [0], at: [0.73, 0.73] },
      ],
    },
    {
      id: 'corner-curve', name: 'Mesa corner with trail', count: 3,
      features: [
        { type: 'mesa', slots: CORNER_NW, at: [0.25, 0.25] },
        { type: 'trail', slots: [4, 7], at: [0.65, 0.65] },
        { type: 'scrub', slots: [5, 6], adj: [], at: [0.88, 0.88] },
        { type: 'scrub', slots: [3, 8], adj: [0], at: [0.52, 0.52] },
      ],
    },
    {
      id: 'mesa-band', name: 'Mesa ridge', count: 1,
      features: [
        { type: 'mesa', slots: [0, 1, 2, 6, 7, 8], at: [0.5, 0.5] },
        { type: 'scrub', slots: [3, 4, 5], adj: [0], at: [0.9, 0.5] },
        { type: 'scrub', slots: [9, 10, 11], adj: [0], at: [0.1, 0.5] },
      ],
    },
    {
      id: 'caps-opposite', name: 'Two mesa edges, facing', count: 3,
      features: [
        { type: 'mesa', slots: CAP_N, at: [0.5, 0.12] },
        { type: 'mesa', slots: [6, 7, 8], at: [0.5, 0.88] },
        { type: 'scrub', slots: [3, 4, 5, 9, 10, 11], adj: [0, 1], at: [0.5, 0.5] },
      ],
    },
    {
      id: 'caps-adjacent', name: 'Two mesa edges, side by side', count: 2,
      features: [
        { type: 'mesa', slots: CAP_N, at: [0.45, 0.12] },
        { type: 'mesa', slots: [3, 4, 5], at: [0.88, 0.55] },
        { type: 'scrub', slots: [6, 7, 8, 9, 10, 11], adj: [0, 1], at: [0.35, 0.65] },
      ],
    },
    {
      id: 'mesa-three', name: 'Mesa plateau', count: 3,
      features: [
        { type: 'mesa', slots: THREE_NEW, at: [0.5, 0.35] },
        { type: 'scrub', slots: [6, 7, 8], adj: [0], at: [0.5, 0.88] },
      ],
    },
    {
      id: 'three-trail', name: 'Mesa plateau with trail', count: 1,
      features: [
        { type: 'mesa', slots: THREE_NEW, at: [0.5, 0.35] },
        { type: 'trail', slots: [7], at: [0.5, 0.87] },
        { type: 'scrub', slots: [6], adj: [0], at: [0.82, 0.9] },
        { type: 'scrub', slots: [8], adj: [0], at: [0.18, 0.9] },
      ],
    },
  ];

  const byId = {};
  base.forEach((d) => { byId[d.id] = d; });

  const springs = [
    Object.assign(withSpring(byId['mesa-corner'], 'mesa-corner-s', 'Mesa corner with spring'), { count: 2 }),
    Object.assign(withSpring(byId['corner-curve'], 'corner-curve-s', 'Mesa corner with spring and trail'), { count: 2 }),
    Object.assign(withSpring(byId['mesa-band'], 'mesa-band-s', 'Mesa ridge with spring'), { count: 2 }),
    Object.assign(withSpring(byId['mesa-three'], 'mesa-three-s', 'Mesa plateau with spring'), { count: 1 }),
    Object.assign(withSpring(byId['three-trail'], 'three-trail-s', 'Mesa plateau with spring and trail'), { count: 2 }),
    {
      id: 'mesa-full-s', name: 'High mesa with spring', count: 1,
      features: [{ type: 'mesa', slots: ALL, spring: true, at: [0.5, 0.5] }],
    },
  ];

  const TYPES = {};
  base.concat(springs).forEach((d) => {
    // Precompute which feature owns each slot.
    d.slotFeature = new Array(12).fill(-1);
    d.features.forEach((f, i) => f.slots.forEach((s) => { d.slotFeature[s] = i; }));
    TYPES[d.id] = d;
  });

  // The opening tile sits in the middle of the table and is not in the deck.
  const START_TILE = 'cap-straight';

  return { TYPES, START_TILE };
});
