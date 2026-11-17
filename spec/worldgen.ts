import { DEFAULT_TILE, maxCols, maxRows, parseLevel, type Grid } from './level';
import { jumpReach, unreachable, type Mobility, type Tile } from './reach';

/** Procedural level generation. Pure and seeded: the same options always give the same map. */

export const WORLD_STYLES = [
  { id: 'ledges', name: 'Ledges', hint: 'Platforms to jump between', platformer: true },
  { id: 'arena', name: 'Arena', hint: 'Open ground with scattered blocks', platformer: false },
  { id: 'maze', name: 'Maze', hint: 'Winding corridors', platformer: false },
] as const;
export type WorldStyle = (typeof WORLD_STYLES)[number]['id'];
export type Density = 'sparse' | 'normal' | 'dense';

export interface WorldOptions {
  style: WorldStyle;
  density: Density;
  seed: number;
  mobility: Mobility;
}

export interface GeneratedLevel {
  name: string;
  tileSize: number;
  map: string[];
}

/** Small, fast seeded RNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADJ = ['Mossy', 'Windy', 'Quiet', 'Crystal', 'Sunken', 'Misty', 'Ember', 'Frozen', 'Hollow', 'Golden', 'Starlit', 'Tangled'];
const NOUN: Record<WorldStyle, string[]> = {
  ledges: ['Heights', 'Steps', 'Cliffs', 'Ledges', 'Towers', 'Ridge'],
  arena: ['Field', 'Plaza', 'Garden', 'Courtyard', 'Meadow', 'Ruins'],
  maze: ['Labyrinth', 'Tunnels', 'Hedges', 'Halls', 'Warrens', 'Passages'],
};

type Cells = boolean[][];
const blank = (cols: number, rows: number): Cells => Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
const toMap = (walls: Cells, start: Tile): string[] =>
  walls.map((row, r) => row.map((w, c) => (r === start.row && c === start.col ? 'P' : w ? '#' : '.')).join('').replace(/\.+$/, ''));
const gridOf = (walls: Cells, tile: number): Grid => ({ tile, cols: walls[0].length, rows: walls.length, walls });

function ledges(rand: () => number, cols: number, rows: number, density: Density, m: Mobility, tile: number): { walls: Cells; start: Tile } {
  const walls = blank(cols, rows);
  walls[rows - 1].fill(true); // floor
  const reach = jumpReach(gridOf(walls, tile), m);
  const rise = Math.max(2, Math.min(3, reach.up)); // rows between ledge layers
  const len = { sparse: [5, 7], normal: [3, 6], dense: [2, 4] }[density];
  const perRow = { sparse: 2, normal: 3, dense: 4 }[density];
  let below = [{ from: 0, to: cols - 1 }];
  for (let r = rows - 1 - rise; r >= 2; r -= rise) {
    const placed: { from: number; to: number }[] = [];
    for (let i = 0; i < perRow * 3 && placed.length < perRow; i++) {
      const w = len[0] + Math.floor(rand() * (len[1] - len[0] + 1));
      const from = Math.floor(rand() * (cols - w));
      const to = from + w - 1;
      // Reachable from a ledge below, and not touching another ledge on this row.
      const near = below.some((b) => from <= b.to + reach.across && to >= b.from - reach.across);
      const clear = placed.every((p) => to < p.from - 2 || from > p.to + 2);
      if (near && clear) placed.push({ from, to });
    }
    for (const p of placed) for (let c = p.from; c <= p.to; c++) walls[r][c] = true;
    if (placed.length) below = placed;
  }
  return { walls, start: { col: 1, row: rows - 2 } };
}

function arena(rand: () => number, cols: number, rows: number, density: Density): { walls: Cells; start: Tile } {
  const walls = blank(cols, rows);
  const start = { col: 2, row: Math.floor(rows / 2) };
  const blocks = { sparse: 5, normal: 9, dense: 14 }[density];
  for (let i = 0; i < blocks; i++) {
    const w = 1 + Math.floor(rand() * 4);
    const h = 1 + Math.floor(rand() * 3);
    const c0 = 1 + Math.floor(rand() * (cols - w - 2));
    const r0 = 1 + Math.floor(rand() * (rows - h - 2));
    if (Math.abs(c0 - start.col) < 4 && Math.abs(r0 - start.row) < 3) continue; // keep the start clear
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) walls[r][c] = true;
  }
  return { walls, start };
}

/** A maze of 2-tile corridors on a 3-tile cell grid; extra openings make loops so chases are fair. */
function maze(rand: () => number, cols: number, rows: number, density: Density): { walls: Cells; start: Tile } {
  const cw = Math.floor(cols / 3);
  const ch = Math.floor(rows / 3);
  const walls = blank(cols, rows);
  // Wall line at the right/bottom of each cell, except along the field edge.
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) walls[r][c] = ((c % 3 === 2 && c < cw * 3 - 1) || (r % 3 === 2 && r < ch * 3 - 1));
  const seen = blank(cw, ch);
  const stack: [number, number][] = [[0, 0]];
  seen[0][0] = true;
  const open = (cx: number, cy: number, nx: number, ny: number) => {
    if (nx !== cx) {
      const c = Math.max(cx, nx) * 3 - 1;
      for (let r = cy * 3; r < cy * 3 + 2; r++) walls[r][c] = false;
    } else {
      const r = Math.max(cy, ny) * 3 - 1;
      for (let c = cx * 3; c < cx * 3 + 2; c++) walls[r][c] = false;
    }
  };
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      .map(([dx, dy]) => [cx + dx, cy + dy] as [number, number])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < cw && y < ch && !seen[y][x]);
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = next[Math.floor(rand() * next.length)];
    open(cx, cy, nx, ny);
    seen[ny][nx] = true;
    stack.push([nx, ny]);
  }
  const loops = { sparse: 10, normal: 6, dense: 3 }[density];
  for (let i = 0; i < loops; i++) {
    const cx = Math.floor(rand() * (cw - 1));
    const cy = Math.floor(rand() * ch);
    if (rand() < 0.5) open(cx, cy, cx + 1, cy);
    else if (cy < ch - 1) open(cx, cy, cx, cy + 1);
  }
  // Wall-line crossings that no longer join any wall would float alone: clear them.
  for (let r = 2; r < rows; r += 3) for (let c = 2; c < cols; c += 3) {
    if (!walls[r][c]) continue;
    const n = (dr: number, dc: number) => walls[r + dr]?.[c + dc] === true;
    if (!n(-1, 0) && !n(1, 0) && !n(0, -1) && !n(0, 1)) walls[r][c] = false;
  }
  return { walls, start: { col: 0, row: 0 } };
}

/** Make every part of the level reachable: fill walled-off pockets, drop unreachable ledges. */
function repair(walls: Cells, start: Tile, m: Mobility, tile: number): void {
  for (let pass = 0; pass < 6; pass++) {
    const lost = unreachable(gridOf(walls, tile), start, m);
    if (!lost.length) return;
    for (const t of lost) {
      if (!m.platformer) walls[t.row][t.col] = true;
      else {
        // Remove the whole ledge this unreachable spot stands on.
        const row = walls[t.row + 1];
        if (!row || t.row + 1 === walls.length - 1) continue;
        let c = t.col;
        while (c > 0 && row[c - 1]) c--;
        while (c < row.length && row[c]) row[c++] = false;
      }
    }
  }
}

export function generateLevel(o: WorldOptions): GeneratedLevel {
  const rand = rng(o.seed);
  const tile = DEFAULT_TILE;
  const cols = maxCols(tile);
  const rows = maxRows(tile);
  const m = { ...o.mobility, platformer: o.style === 'ledges' ? o.mobility.platformer : false };
  const { walls, start } =
    o.style === 'ledges' ? ledges(rand, cols, rows, o.density, m, tile) : o.style === 'arena' ? arena(rand, cols, rows, o.density) : maze(rand, cols, rows, o.density);
  repair(walls, start, m, tile);
  const name = `${ADJ[Math.floor(rand() * ADJ.length)]} ${NOUN[o.style][Math.floor(rand() * NOUN[o.style].length)]}`;
  return { name, tileSize: tile, map: toMap(walls, start) };
}

/** Check a generated map round-trips through the parser (used by tests). */
export const mapGrid = (level: GeneratedLevel): Grid => parseLevel(level);
