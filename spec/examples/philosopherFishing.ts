import type { GameSpecInput } from '../schema';

/** Hand-written reference spec: a cozy fishing game where the fish are tiny philosophers. */
export const philosopherFishing = {
  version: 1,
  title: 'Deep Thoughts Fishing',
  description:
    'A cozy afternoon on the lake. Hook tiny philosopher fish and listen to their musings, but avoid the Puffer of Doubt.',
  theme: { background: '#1f4e6b', primary: '#ffd6a5', accent: '#ff7a6b', text: '#fff6e9' },
  sprites: {
    hook: {
      width: 32,
      height: 48,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 60"><path d="M11 18a9 9 0 0 1 18 0z" fill="#ff7a6b"/><path d="M11 18a9 9 0 0 0 18 0z" fill="#fff6e9"/><line x1="20" y1="27" x2="20" y2="44" stroke="#c9d6df" stroke-width="2"/><path d="M20 44v6a6 6 0 0 1-12 0" fill="none" stroke="#c9d6df" stroke-width="3" stroke-linecap="round"/></svg>',
    },
    socrates: {
      width: 56,
      height: 35,
      faces: 'left',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><path d="M50 20 64 8v24z" fill="#f29e4c"/><ellipse cx="30" cy="20" rx="22" ry="14" fill="#f6b26b"/><circle cx="18" cy="15" r="3.5" fill="#fff"/><circle cx="17" cy="15" r="1.8" fill="#2b2b2b"/><path d="M10 22q6 14 14 2z" fill="#fbf7f0"/><path d="M14 9q4-4 9-1" stroke="#7a4b2a" stroke-width="2" fill="none"/></svg>',
    },
    plato: {
      width: 56,
      height: 35,
      faces: 'left',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><path d="M50 20 64 6v28z" fill="#4f8fc0"/><ellipse cx="30" cy="20" rx="22" ry="13" fill="#6fb1e0"/><path d="M12 8q10-8 22 0" stroke="#7bbf6a" stroke-width="3" fill="none"/><circle cx="18" cy="17" r="3.5" fill="#fff"/><circle cx="17" cy="17" r="1.8" fill="#2b2b2b"/><path d="M14 26q4 3 8 0" stroke="#2b2b2b" stroke-width="1.5" fill="none"/></svg>',
    },
    puffer: {
      width: 44,
      height: 44,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g stroke="#6c4f8a" stroke-width="3" stroke-linecap="round"><path d="M24 2v6M24 40v6M2 24h6M40 24h6M8 8l5 5M35 35l5 5M40 8l-5 5M13 35l-5 5"/></g><circle cx="24" cy="24" r="16" fill="#a98bd1"/><circle cx="18" cy="21" r="3" fill="#fff"/><circle cx="30" cy="21" r="3" fill="#fff"/><circle cx="18" cy="22" r="1.5" fill="#222"/><circle cx="30" cy="22" r="1.5" fill="#222"/><path d="M17 32q7-5 14 0" stroke="#3d2b52" stroke-width="2" fill="none"/></svg>',
    },
    bubble: {
      width: 18,
      height: 18,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#bfe6ff" fill-opacity="0.35" stroke="#e6f6ff" stroke-width="1.5"/><circle cx="7" cy="7" r="2" fill="#ffffff"/></svg>',
    },
  },
  player: { sprite: 'hook', controls: 'free', speed: 220, start: { x: 0.5, y: 0.3 }, lives: 3 },
  entities: [
    {
      id: 'socrates_fish',
      name: 'Socratic Sunfish',
      sprite: 'socrates',
      behavior: 'straight',
      speed: 70,
      onCollide: { score: 1 },
      quotes: [
        'I only know that I am a fish.',
        'But what IS a worm, really?',
        'An unexamined swim is not worth swimming.',
      ],
    },
    {
      id: 'plato_fish',
      name: 'Platonic Perch',
      sprite: 'plato',
      behavior: 'zigzag',
      speed: 100,
      onCollide: { score: 3 },
      quotes: ['Is this hook merely a shadow?', 'Somewhere there is a perfect lake.', 'Ideal bait, at last!'],
    },
    {
      id: 'doubt_puffer',
      name: 'Puffer of Doubt',
      sprite: 'puffer',
      behavior: 'wander',
      speed: 60,
      onCollide: { lives: -1 },
      quotes: ['Does anything matter? Ouch.', 'You cannot be sure you caught me.'],
    },
    {
      id: 'bubble',
      name: 'Thought Bubble',
      sprite: 'bubble',
      behavior: 'straight',
      speed: 50,
      onCollide: { score: 0, destroy: true },
      quotes: ['hmm...', 'ponder ponder'],
    },
  ],
  spawns: [
    { entity: 'socrates_fish', edge: 'sides', everyMs: 1400, maxAlive: 6 },
    { entity: 'plato_fish', edge: 'sides', everyMs: 4000, maxAlive: 2, startDelayMs: 5000 },
    { entity: 'doubt_puffer', edge: 'sides', everyMs: 5000, maxAlive: 3, startDelayMs: 3000 },
    { entity: 'bubble', edge: 'bottom', everyMs: 900, maxAlive: 8 },
  ],
  score: { label: 'Thoughts', perSecond: 0 },
  win: { type: 'score', target: 25 },
  lose: { timeLimitSeconds: 120 },
  messages: {
    intro: 'Arrow keys or drag to move your hook. Catch philosopher fish, avoid the Puffer of Doubt.',
    win: 'Your bucket is full of profound fish. What a lovely afternoon.',
    lose: 'The fish have gone home to contemplate. Try again?',
  },
} satisfies GameSpecInput;
