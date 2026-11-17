import Phaser from 'phaser';
import type { GameSpec } from '../spec/schema';
import { isWall, parseLevel, platformTops, wallRuns, type Grid } from '../spec/level';
import { mix } from './colors';
import type { Vec } from './motion';
import { FIELD } from './world';

export interface Level {
  grid: Grid;
  walls: Phaser.Physics.Arcade.StaticGroup;
  /** Standing spots (bottom-centre of each empty tile on top of a wall) for "platforms" spawns. */
  tops: Vec[];
  /** Centre of the "P" tile, if the map has one. */
  start?: Vec;
}

const tileX = (g: Grid, col: number) => FIELD.x + col * g.tile;
const tileY = (g: Grid, row: number) => FIELD.y + row * g.tile;

/** Draw the tile map and create one static physics body per horizontal run of walls. */
export function buildLevel(scene: Phaser.Scene, spec: GameSpec): Level | undefined {
  if (!spec.level) return undefined;
  const g = parseLevel(spec.level);
  const { theme } = spec;
  const art = scene.add.graphics().setDepth(2);
  const fill = Phaser.Display.Color.HexStringToColor(mix(theme.background, theme.primary, 0.35)).color;
  const edge = Phaser.Display.Color.HexStringToColor(theme.primary).color;
  const shade = Phaser.Display.Color.HexStringToColor(mix(theme.background, '#000000', 0.25)).color;
  const walls = scene.physics.add.staticGroup();

  for (const run of wallRuns(g)) {
    const x = tileX(g, run.col);
    const y = tileY(g, run.row);
    const w = run.len * g.tile;
    art.fillStyle(fill, 1).fillRoundedRect(x, y, w, g.tile, 6);
    // A bright lip on top of every walkable surface reads as "you can stand here".
    for (let c = run.col; c < run.col + run.len; c++) {
      if (!isWall(g, c, run.row - 1)) art.fillStyle(edge, 1).fillRect(tileX(g, c), y, g.tile, 4);
    }
    art.lineStyle(1, shade, 0.6);
    for (let c = run.col + 1; c < run.col + run.len; c++) art.lineBetween(tileX(g, c), y + 6, tileX(g, c), y + g.tile - 4);
    const zone = scene.add.zone(x + w / 2, y + g.tile / 2, w, g.tile);
    walls.add(zone);
  }

  const tops = platformTops(g).map(({ col, row }) => ({ x: tileX(g, col) + g.tile / 2, y: tileY(g, row) + g.tile }));
  const start = g.start && { x: tileX(g, g.start.col) + g.tile / 2, y: tileY(g, g.start.row) + g.tile / 2 };
  return { grid: g, walls, tops, start };
}

/** Is the field position inside a wall tile? */
export function inWall(level: Level, p: Vec): boolean {
  const { grid: g } = level;
  return isWall(g, Math.floor((p.x - FIELD.x) / g.tile), Math.floor((p.y - FIELD.y) / g.tile)) && p.y >= FIELD.y && p.y < FIELD.y + g.rows * g.tile && p.x >= FIELD.x && p.x < FIELD.x + g.cols * g.tile;
}

/** Move a point straight up until it is out of the walls (used for starts and spawns). */
export function liftOutOfWalls(level: Level, p: Vec, halfH: number): Vec {
  const out = { ...p };
  for (let i = 0; i < level.grid.rows && (inWall(level, out) || inWall(level, { x: out.x, y: out.y + halfH - 1 })); i++) {
    out.y = tileY(level.grid, Math.floor((out.y - FIELD.y) / level.grid.tile)) - halfH - 1;
  }
  return out;
}

/** Would a walker at (x, feetY) heading `dir` step off a ledge next frame? */
export function atLedge(level: Level | undefined, x: number, feetY: number, halfW: number, dir: number): boolean {
  if (!level) return false;
  const g = level.grid;
  const col = Math.floor((x + dir * (halfW + 2) - FIELD.x) / g.tile);
  const row = Math.floor((feetY + 2 - FIELD.y) / g.tile);
  return !isWall(g, col, row);
}
