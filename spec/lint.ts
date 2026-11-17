import type { GameSpec } from './schema';

export interface LintFinding {
  /** Short, human-readable statement of a likely problem. */
  issue: string;
  /** What to change. */
  fix: string;
}

/**
 * Deterministic checks for common "my game feels broken" causes. They run instantly in the debugger
 * and are also given to the model as facts, so its diagnosis starts from what is really in the spec.
 */
export function lintSpec(spec: GameSpec): LintFinding[] {
  const out: LintFinding[] = [];
  const { player } = spec;
  if (player.controls === 'horizontal') {
    out.push({ issue: 'The player can only move left and right (controls: "horizontal"); up/down keys do nothing.', fix: 'Set player.controls to "free" to allow all directions.' });
  } else if (player.controls === 'vertical') {
    out.push({ issue: 'The player can only move up and down (controls: "vertical"); left/right keys do nothing.', fix: 'Set player.controls to "free" to allow all directions.' });
  }
  if (player.speed < 120) out.push({ issue: `The player is slow (speed ${player.speed}), so movement can feel unresponsive.`, fix: 'Raise player.speed to 200-280.' });
  if (spec.lose.timeLimitSeconds !== undefined && spec.lose.timeLimitSeconds < 30) {
    out.push({ issue: `The time limit is only ${spec.lose.timeLimitSeconds}s.`, fix: 'Raise lose.timeLimitSeconds to 60-120.' });
  }
  const hazards = spec.entities.filter((e) => e.onCollide.lives < 0);
  const hazardSpawns = spec.spawns.filter((s) => hazards.some((h) => h.id === s.entity));
  const hazardsPerSecond = hazardSpawns.reduce((n, s) => n + 1000 / s.everyMs, 0);
  if (hazardsPerSecond > 1.5 && player.lives <= 3) {
    out.push({ issue: `Hazards appear about ${hazardsPerSecond.toFixed(1)} times per second with only ${player.lives} lives, so rounds end very fast.`, fix: 'Slow hazard spawns (larger everyMs), lower maxAlive, or give more lives.' });
  }
  if (hazardSpawns.some((s) => s.startDelayMs === 0) && hazardsPerSecond > 0.6) {
    out.push({ issue: 'Hazards start immediately, so the player gets hit before settling in.', fix: 'Give hazard spawns a startDelayMs of 2000-4000.' });
  }
  const rewards = spec.entities.filter((e) => e.onCollide.score > 0);
  const offAxis = rewards.filter((e) => e.behavior === 'static' || e.behavior === 'wander');
  if (player.controls !== 'free' && offAxis.length === rewards.length && rewards.length > 0) {
    out.push({ issue: 'Rewards wander or stay still, but the player is locked to one axis and may never reach them.', fix: 'Use "free" controls or make rewards cross the player\'s line ("straight").' });
  }
  if (spec.entities.every((e) => e.onCollide.sfx === 'none')) {
    out.push({ issue: 'Every collision sound is set to "none", so the game is silent.', fix: 'Use "auto" sfx, or pick sounds in the Sound Designer.' });
  }
  return out;
}

/** Problems that live outside the spec (focus, sound settings), matched from the user's words. */
export function environmentHints(problem: string): LintFinding[] {
  const p = problem.toLowerCase();
  const hints: LintFinding[] = [];
  if (/(key|arrow|wasd|move|moving|control|press)/.test(p)) {
    hints.push({ issue: 'Keyboard input only reaches the game while it has focus.', fix: 'Click inside the game (or press Space on the start card) before using the keys.' });
  }
  if (/(sound|audio|music|silent|hear)/.test(p)) {
    hints.push({ issue: 'Sound can be muted in game (M) or by the "Game sound effects" setting.', fix: 'Press M in the game, and check Customize -> Sound.' });
  }
  return hints;
}
