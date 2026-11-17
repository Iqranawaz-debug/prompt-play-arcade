/** Tile maps: parsing and geometry shared by the schema checks, the engine and the editors. */

/** Size of the play field (the logical world below the 44px HUD bar). Kept in sync with engine/world.ts. */
export const FIELD_W = 960;
export const FIELD_H = 496;
export const DEFAULT_TILE = 40;

export interface LevelInput {
  tileSize?: number;
  map: string[];
}

export interface Grid {
  tile: number;
  cols: number;
  rows: number;
  /** walls[row][col] */
  walls: boolean[][];
  /** Player start tile from a "P" in the map, if any. */
  start?: { col: number; row: number };
}

export const maxCols = (tile: number) => Math.floor(FIELD_W / tile);
export const maxRows = (tile: number) => Math.floor(FIELD_H / tile);

/** Characters allowed in a map row: "#" wall, "P" player start, "." or space empty. */
export const MAP_CHARS = /^[#P. ]*$/;

/** Turn a level into a full-size wall grid. Missing rows/columns are empty; extra ones are ignored. */
export function parseLevel(level: LevelInput): Grid {
  const tile = level.tileSize ?? DEFAULT_TILE;
  const cols = maxCols(tile);
  const rows = maxRows(tile);
  const walls: boolean[][] = [];
  let start: Grid['start'];
  for (let r = 0; r < rows; r++) {
    const line = level.map[r] ?? '';
    walls.push(Array.from({ length: cols }, (_, c) => line[c] === '#'));
    const p = line.indexOf('P');
    if (p >= 0 && p < cols && !start) start = { col: p, row: r };
  }
  return { tile, cols, rows, walls, start };
}

/** Is this tile solid? The field's sides and bottom count as walls; above the top is open. */
export function isWall(g: Grid, col: number, row: number): boolean {
  if (row < 0) return false;
  if (col < 0 || col >= g.cols || row >= g.rows) return true;
  return g.walls[row][col];
}

/** Empty tiles that sit directly on top of a wall: where "platforms" spawns appear. */
export function platformTops(g: Grid): { col: number; row: number }[] {
  const tops: { col: number; row: number }[] = [];
  for (let r = 0; r < g.rows - 1; r++) {
    for (let c = 0; c < g.cols; c++) if (!g.walls[r][c] && g.walls[r + 1][c]) tops.push({ col: c, row: r });
  }
  return tops;
}

/** Horizontal runs of wall tiles, one rectangle per run (fewer physics bodies than one per tile). */
export function wallRuns(g: Grid): { col: number; row: number; len: number }[] {
  const runs: { col: number; row: number; len: number }[] = [];
  for (let r = 0; r < g.rows; r++) {
    let c = 0;
    while (c < g.cols) {
      if (!g.walls[r][c]) {
        c++;
        continue;
      }
      const from = c;
      while (c < g.cols && g.walls[r][c]) c++;
      runs.push({ col: from, row: r, len: c - from });
    }
  }
  return runs;
}

/** Peak height of a jump, in pixels, for a launch speed and gravity. */
export const jumpHeight = (jump: number, gravity: number): number => (gravity > 0 ? (jump * jump) / (2 * gravity) : Infinity);
