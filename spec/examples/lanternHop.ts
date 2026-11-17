import type { GameSpecInput } from '../schema';

/** Third reference spec: a platformer with a tile map, gravity, patrolling hazards and rewards on ledges. */
export const lanternHop = {
  version: 1,
  title: 'Lantern Hop',
  description: 'A little lantern spirit hops across mossy ledges at dusk, gathering fireflies while dodging grumpy beetles.',
  theme: { background: '#141a2e', primary: '#7fd18b', accent: '#ffb347', text: '#eef3e8' },
  sprites: {
    lantern: {
      width: 34,
      height: 40,
      faces: 'right',
      anim: { idle: 'bob', move: 'tilt', speed: 1 },
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 40"><rect x="12" y="1" width="10" height="5" rx="2" fill="#5a4636"/><path d="M6 8h22l-2 24H8z" fill="#ffb347"/><path d="M10 11h14l-1.5 18h-11z" fill="#fff1b8"/><circle cx="14" cy="19" r="2.2" fill="#2b1d12"/><circle cx="21" cy="19" r="2.2" fill="#2b1d12"/><path d="M14.5 24q3 2.5 6 0" stroke="#2b1d12" stroke-width="1.6" fill="none"/><rect x="5" y="32" width="24" height="4" rx="2" fill="#5a4636"/><rect x="9" y="36" width="5" height="4" rx="1.5" fill="#5a4636"/><rect x="20" y="36" width="5" height="4" rx="1.5" fill="#5a4636"/></svg>',
    },
    firefly: {
      width: 26,
      height: 26,
      anim: { idle: 'pulse', move: 'none', speed: 1.4 },
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><circle cx="13" cy="15" r="10" fill="#f6ff8a" fill-opacity="0.35"/><ellipse cx="8" cy="9" rx="5" ry="3" fill="#cfe9ff" fill-opacity="0.8"/><ellipse cx="18" cy="9" rx="5" ry="3" fill="#cfe9ff" fill-opacity="0.8"/><circle cx="13" cy="15" r="5.5" fill="#f6ff8a"/><circle cx="13" cy="9" r="3" fill="#3b3a2a"/></svg>',
    },
    beetle: {
      width: 40,
      height: 28,
      faces: 'left',
      anim: { idle: 'none', move: 'squash', speed: 1.2 },
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 28"><path d="M4 20q2-14 18-14q14 0 15 14z" fill="#6b3fa0"/><path d="M21 6v14" stroke="#3d2160" stroke-width="2"/><circle cx="7" cy="15" r="5" fill="#3d2160"/><circle cx="5.5" cy="14" r="1.5" fill="#ffb347"/><path d="M3 11l-2-4M7 10l1-5" stroke="#3d2160" stroke-width="1.6"/><path d="M10 20l-2 6M20 20v6M30 20l2 6" stroke="#3d2160" stroke-width="2.4" stroke-linecap="round"/></svg>',
    },
  },
  player: { sprite: 'lantern', controls: 'platformer', speed: 260, start: { x: 0.08, y: 0.85 }, lives: 3 },
  physics: { gravity: 1400, jump: 680, friction: 0.35 },
  level: {
    tileSize: 40,
    map: [
      '',
      '',
      '..####............####..',
      '',
      '.........######.........',
      '',
      '...####..........####...',
      '',
      '.........######.........',
      '',
      '.P......................',
      '########################',
    ],
  },
  entities: [
    {
      id: 'firefly',
      name: 'Firefly',
      sprite: 'firefly',
      behavior: 'static',
      speed: 0,
      onCollide: { score: 1 },
    },
    {
      id: 'beetle',
      name: 'Grumpy Beetle',
      sprite: 'beetle',
      behavior: 'patrol',
      speed: 70,
      onCollide: { lives: -1, destroy: false },
      quotes: ['Off my ledge!', 'Hmph.', 'Mind the shell!'],
    },
  ],
  spawns: [
    { entity: 'firefly', edge: 'platforms', everyMs: 1400, maxAlive: 5 },
    { entity: 'beetle', edge: 'platforms', everyMs: 6000, maxAlive: 3, startDelayMs: 3000 },
  ],
  score: { label: 'Fireflies' },
  win: { type: 'score', target: 20 },
  lose: { timeLimitSeconds: 90 },
  audio: { music: 'dreamy', volume: 0.5 },
  messages: {
    intro: 'Run with ←/→ and jump with ↑ or Space. Gather 20 fireflies before the night ends!',
    win: 'The whole forest glows. Lovely hopping!',
    lose: 'The night grew dark. Try another hop?',
  },
} satisfies GameSpecInput;
