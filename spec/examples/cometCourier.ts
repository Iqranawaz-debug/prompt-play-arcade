import type { GameSpecInput } from '../schema';

/** Second reference spec: a survive-style game with horizontal controls and hazards from above. */
export const cometCourier = {
  version: 1,
  title: 'Comet Courier',
  description: 'Steer your delivery rocket along the bottom of space, catch falling parcels and dodge comets for 60 seconds.',
  theme: { background: '#0d1028', primary: '#ffc94d', accent: '#ff5d73', text: '#e8eef7' },
  sprites: {
    rocket: {
      width: 44,
      height: 44,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M24 4 34 30H14z" fill="#e8eef7"/><circle cx="24" cy="20" r="5" fill="#5ec8ff"/><path d="M14 30 6 40h12zM34 30l8 10H30z" fill="#ff5d73"/><path d="M19 40h10l-5 7z" fill="#ffc94d"/></svg>',
    },
    parcel: {
      width: 30,
      height: 30,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="4" y="8" width="24" height="20" rx="3" fill="#c98b4f"/><rect x="14" y="8" width="4" height="20" fill="#f3d9a4"/><path d="M10 8q6-8 6 0q0-8 6 0" stroke="#ff5d73" stroke-width="2.5" fill="none"/></svg>',
    },
    comet: {
      width: 34,
      height: 48,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 56"><path d="M12 0q8 24 8 30q0-6 8-30z" fill="#ffc94d" fill-opacity="0.6"/><circle cx="20" cy="40" r="13" fill="#9aa4b8"/><circle cx="15" cy="37" r="3" fill="#6b7489"/><circle cx="25" cy="45" r="2.5" fill="#6b7489"/></svg>',
    },
    satellite: {
      width: 50,
      height: 28,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 32"><rect x="0" y="10" width="18" height="12" fill="#3f6fd8"/><rect x="38" y="10" width="18" height="12" fill="#3f6fd8"/><rect x="18" y="15" width="20" height="2" fill="#c0c8d8"/><circle cx="28" cy="16" r="8" fill="#e8eef7"/><circle cx="28" cy="16" r="3" fill="#ff5d73"/></svg>',
    },
  },
  player: { sprite: 'rocket', controls: 'horizontal', speed: 320, start: { x: 0.5, y: 0.9 }, lives: 3 },
  entities: [
    {
      id: 'parcel',
      name: 'Parcel',
      sprite: 'parcel',
      behavior: 'straight',
      speed: 140,
      onCollide: { score: 5 },
      quotes: ['Delivered!', 'Signed for.', 'Fragile, nice catch!'],
    },
    { id: 'comet', name: 'Comet', sprite: 'comet', behavior: 'straight', speed: 230, onCollide: { lives: -1 } },
    { id: 'satellite', name: 'Rogue Satellite', sprite: 'satellite', behavior: 'bounce', speed: 150, onCollide: { lives: -1 } },
  ],
  spawns: [
    { entity: 'parcel', edge: 'top', everyMs: 1200, maxAlive: 4 },
    { entity: 'comet', edge: 'top', everyMs: 900, maxAlive: 6, startDelayMs: 2000 },
    { entity: 'satellite', edge: 'top', everyMs: 8000, maxAlive: 2, startDelayMs: 10000 },
  ],
  score: { label: 'Points', perSecond: 1 },
  win: { type: 'survive', seconds: 60 },
  lose: {},
  messages: {
    intro: 'Left/right or drag to steer. Catch parcels, dodge comets, survive 60 seconds.',
    win: 'Every parcel delivered on time. The galaxy thanks you!',
    lose: 'Your rocket needs repairs. The parcels will wait.',
  },
} satisfies GameSpecInput;
