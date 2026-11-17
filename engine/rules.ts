import { conditionsHold, type Action, type Rule, type Stats } from '../spec/rules';

/** What rules can do to the game. The scene implements this; tests use a fake. */
export interface RuleHost {
  stats(): Stats;
  spawn(entity: string, count: number): void;
  addScore(amount: number): void;
  addLives(amount: number): void;
  clear(entity?: string): void;
  message(text: string): void;
  sound(name: Extract<Action, { do: 'sound' }>['name']): void;
  win(): void;
  lose(): void;
}

/** Rule progress that a save state keeps, so one-off rules don't fire twice after loading. */
export interface RuleMemory {
  fired: number[];
  nextEvery: Record<string, number>;
  touches: Record<string, number>;
  speed: Record<string, number>;
  rate: Record<string, number>;
}

const MIN_FACTOR = 0.25;
const MAX_FACTOR = 4;
const clampFactor = (n: number) => Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, n));
/** Actions per tick are capped so a badly written rule set can't freeze the game. */
const MAX_ACTIONS_PER_TICK = 40;

/** Runs a game's rules: checks triggers each tick and on touches, then applies actions through the host. */
export class RuleRunner {
  private fired = new Set<number>();
  private nextEvery = new Map<number, number>();
  private touches = new Map<string, number>();
  private speed = new Map<string, number>();
  private rate = new Map<string, number>();
  private budget = MAX_ACTIONS_PER_TICK;

  constructor(
    private readonly rules: Rule[],
    private readonly host: RuleHost,
  ) {
    rules.forEach((r, i) => r.when.on === 'every' && this.nextEvery.set(i, r.when.seconds * 1000));
  }

  /** Speed multiplier for the player ("player") or an entity id. */
  speedOf(target: string): number {
    return this.speed.get(target) ?? 1;
  }

  /** Spawn-rate multiplier for an entity id. */
  rateOf(entity: string): number {
    return this.rate.get(entity) ?? 1;
  }

  /** The level just started. */
  start(): void {
    this.rules.forEach((r, i) => r.when.on === 'start' && this.fire(i));
  }

  /** Check time, score and lives triggers. Call once per frame with the level's elapsed time. */
  tick(elapsedMs: number): void {
    this.budget = MAX_ACTIONS_PER_TICK;
    const s = this.host.stats();
    this.rules.forEach((r, i) => {
      const w = r.when;
      if (w.on === 'every') {
        const next = this.nextEvery.get(i)!;
        if (elapsedMs >= next) {
          this.nextEvery.set(i, next + w.seconds * 1000);
          this.fire(i, true);
        }
      } else if (this.fired.has(i)) return;
      else if ((w.on === 'time' && elapsedMs >= w.seconds * 1000) || (w.on === 'score' && s.score >= w.atLeast) || (w.on === 'lives' && s.lives <= w.atMost)) {
        this.fire(i);
      }
    });
  }

  /** The player touched an entity (after its normal collision effect). */
  touched(entity: string): void {
    const n = (this.touches.get(entity) ?? 0) + 1;
    this.touches.set(entity, n);
    this.rules.forEach((r, i) => {
      const w = r.when;
      if (w.on === 'touch' && w.entity === entity) this.fire(i, true);
      if (w.on === 'collect' && w.entity === entity && n >= w.count && !this.fired.has(i)) this.fire(i);
    });
  }

  /** Fire rule `i` if it is enabled and its conditions hold. Repeating triggers don't mark it as fired. */
  private fire(i: number, repeating = false): void {
    const rule = this.rules[i];
    if (!rule.enabled || !conditionsHold(rule.if, this.host.stats())) return;
    if (!repeating) this.fired.add(i);
    for (const a of rule.then) {
      if (this.budget-- <= 0) return;
      this.apply(a);
    }
  }

  private apply(a: Action): void {
    const h = this.host;
    switch (a.do) {
      case 'spawn':
        return h.spawn(a.entity, a.count);
      case 'score':
        return h.addScore(a.amount);
      case 'lives':
        return h.addLives(a.amount);
      case 'speed':
        this.speed.set(a.target, clampFactor(this.speedOf(a.target) * a.factor));
        return;
      case 'spawnRate':
        this.rate.set(a.entity, clampFactor(this.rateOf(a.entity) * a.factor));
        return;
      case 'clear':
        return h.clear(a.entity);
      case 'message':
        return h.message(a.text);
      case 'sound':
        return h.sound(a.name);
      case 'win':
        return h.win();
      case 'lose':
        return h.lose();
    }
  }

  save(): RuleMemory {
    const obj = <V>(m: Map<string | number, V>) => Object.fromEntries([...m].map(([k, v]) => [String(k), v]));
    return { fired: [...this.fired], nextEvery: obj(this.nextEvery), touches: obj(this.touches), speed: obj(this.speed), rate: obj(this.rate) };
  }

  load(m: RuleMemory): void {
    const finite = (v: number) => Number.isFinite(v);
    this.fired = new Set(m.fired.filter((i) => i >= 0 && i < this.rules.length));
    for (const [k, v] of Object.entries(m.nextEvery)) if (this.nextEvery.has(Number(k)) && finite(v)) this.nextEvery.set(Number(k), v);
    this.touches = new Map(Object.entries(m.touches).filter(([, v]) => finite(v)));
    this.speed = new Map(Object.entries(m.speed).filter(([, v]) => finite(v)).map(([k, v]) => [k, clampFactor(v)]));
    this.rate = new Map(Object.entries(m.rate).filter(([, v]) => finite(v)).map(([k, v]) => [k, clampFactor(v)]));
  }
}
