import { FIELD_H, FIELD_W, maxCols, maxRows } from '../../spec/level';
import type { Tile } from '../../spec/reach';
import type { GameSpec } from '../../spec/schema';

/** A level being edited: a full-size wall grid plus an optional start tile. */
export interface EditLevel {
  name: string;
  tileSize: number;
  walls: boolean[][];
  start?: Tile;
}

export function fromMap(level: { name?: string; tileSize: number; map: string[] }, fallbackName: string): EditLevel {
  const cols = maxCols(level.tileSize);
  const rows = maxRows(level.tileSize);
  let start: Tile | undefined;
  const walls = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const ch = level.map[r]?.[c];
      if (ch === 'P' && !start) start = { col: c, row: r };
      return ch === '#';
    }),
  );
  return { name: level.name ?? fallbackName, tileSize: level.tileSize, walls, start };
}

export function toMap(level: EditLevel): string[] {
  const rows = level.walls.map((row, r) =>
    row.map((w, c) => (level.start?.row === r && level.start.col === c ? 'P' : w ? '#' : '.')).join('').replace(/\.+$/, ''),
  );
  while (rows.length > 1 && rows[rows.length - 1] === '') rows.pop();
  return rows;
}

/** Draw a level at full field size (960x496): walls, start, unreachable spots and the keyboard cursor. */
export function drawLevel(canvas: HTMLCanvasElement, level: EditLevel, theme: GameSpec['theme'], lost: Tile[], cursor?: Tile): void {
  canvas.width = FIELD_W;
  canvas.height = FIELD_H;
  const ctx = canvas.getContext('2d')!;
  const s = level.tileSize;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= level.walls[0].length; c++) ctx.strokeRect(c * s + 0.5, -1, 0, FIELD_H + 2);
  for (let r = 0; r <= level.walls.length; r++) ctx.strokeRect(-1, r * s + 0.5, FIELD_W + 2, 0);

  level.walls.forEach((row, r) =>
    row.forEach((wall, c) => {
      if (!wall) return;
      ctx.fillStyle = theme.primary;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(c * s + 1, r * s + 1, s - 2, s - 2);
      ctx.globalAlpha = 1;
      if (r === 0 || !level.walls[r - 1][c]) ctx.fillRect(c * s + 1, r * s + 1, s - 2, 4);
    }),
  );
  ctx.fillStyle = 'rgba(248, 113, 113, 0.35)';
  ctx.strokeStyle = 'rgba(248, 113, 113, 0.9)';
  for (const t of lost) {
    ctx.fillRect(t.col * s + 3, t.row * s + 3, s - 6, s - 6);
    ctx.strokeRect(t.col * s + 3.5, t.row * s + 3.5, s - 7, s - 7);
  }
  if (level.start) {
    const { col, row } = level.start;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(col * s + s / 2, row * s + s / 2, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.background;
    ctx.font = `700 ${Math.round(s * 0.36)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', col * s + s / 2, row * s + s / 2 + 1);
  }
  if (cursor) {
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(cursor.col * s + 2, cursor.row * s + 2, s - 4, s - 4);
    ctx.setLineDash([]);
  }
}

/** Which tile a pointer event is over. */
export function tileAt(canvas: HTMLCanvasElement, level: EditLevel, e: PointerEvent): Tile | undefined {
  const rect = canvas.getBoundingClientRect();
  const col = Math.floor(((e.clientX - rect.left) / rect.width) * (FIELD_W / level.tileSize));
  const row = Math.floor(((e.clientY - rect.top) / rect.height) * (FIELD_H / level.tileSize));
  return col >= 0 && row >= 0 && row < level.walls.length && col < level.walls[0].length ? { col, row } : undefined;
}
