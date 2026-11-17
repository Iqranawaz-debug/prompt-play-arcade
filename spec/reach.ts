import { isWall, jumpHeight, type Grid } from './level';

/** How the player gets around, in pixels and seconds. */
export interface Mobility {
  platformer: boolean;
  speed: number;
  jump: number;
  gravity: number;
}

export interface Tile {
  col: number;
  row: number;
}

/** Tiles a platformer character can stand on: empty, with something solid directly below. */
export function standTiles(g: Grid): Tile[] {
  const out: Tile[] = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (!g.walls[r][c] && isWall(g, c, r + 1)) out.push({ col: c, row: r });
  return out;
}

/** The tile the player starts in (the "P", else the spec's fractional start), dropped onto the ground for platformers. */
export function startTile(g: Grid, frac: { x: number; y: number }, platformer: boolean): Tile {
  let col = Math.min(g.cols - 1, Math.max(0, g.start?.col ?? Math.floor(frac.x * g.cols)));
  let row = Math.min(g.rows - 1, Math.max(0, g.start?.row ?? Math.floor(frac.y * g.rows)));
  while (row > 0 && g.walls[row][col]) row--; // inside a wall: the engine lifts the player out
  if (platformer) while (!isWall(g, col, row + 1)) row++;
  return { col, row };
}

/** Jump reach in tiles: how many rows up, and how many columns across in one jump. */
export function jumpReach(g: Grid, m: Mobility): { up: number; across: number } {
  const up = Math.floor(jumpHeight(m.jump, m.gravity) / g.tile - 0.3);
  const airtime = m.gravity > 0 ? (2 * m.jump) / m.gravity : 0;
  const across = Math.max(1, Math.floor((m.speed * airtime * 0.8) / g.tile));
  return { up, across };
}

/**
 * Tiles the player cannot get to from the start. Platformers: standing spots that no chain of walks, jumps and drops
 * reaches. Top-down games: empty tiles walled off from the start.
 */
export function unreachable(g: Grid, start: Tile, m: Mobility): Tile[] {
  const key = (t: Tile) => t.row * g.cols + t.col;
  const seen = new Set<number>([key(start)]);
  const queue = [start];

  if (!m.platformer) {
    while (queue.length) {
      const t = queue.pop()!;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { col: t.col + dc, row: t.row + dr };
        if (n.col < 0 || n.row < 0 || n.col >= g.cols || n.row >= g.rows || g.walls[n.row][n.col] || seen.has(key(n))) continue;
        seen.add(key(n));
        queue.push(n);
      }
    }
    const out: Tile[] = [];
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (!g.walls[r][c] && !seen.has(r * g.cols + c)) out.push({ col: c, row: r });
    return out;
  }

  const stands = standTiles(g);
  const { up, across } = jumpReach(g, m);
  while (queue.length) {
    const t = queue.pop()!;
    for (const s of stands) {
      if (seen.has(key(s))) continue;
      const rise = t.row - s.row; // positive = higher up
      const reach = rise >= 0 ? across : across + Math.floor(-rise / 2); // falling carries you further
      if (rise <= up && Math.abs(s.col - t.col) <= reach) {
        seen.add(key(s));
        queue.push(s);
      }
    }
  }
  return stands.filter((s) => !seen.has(key(s)));
}
