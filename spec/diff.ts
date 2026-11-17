/** Human-readable list of what changed between two JSON values, e.g. "player.controls: horizontal -> free". */
export function diffValues(a: unknown, b: unknown, path = '', out: string[] = [], limit = 14): string[] {
  if (out.length >= limit) return out;
  const show = (v: unknown) => {
    if (typeof v === 'string') return v.startsWith('<svg') ? '(drawing)' : v.length > 40 ? `"${v.slice(0, 37)}..."` : `"${v}"`;
    if (v === undefined) return '(none)';
    if (typeof v === 'object' && v !== null) return Array.isArray(v) ? `[${v.length} items]` : '{...}';
    return String(v);
  };
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path || '(root)'}: ${show(a)} -> ${show(b)}`);
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n && out.length < limit; i++) diffValues(a[i], b[i], `${path}[${i}]`, out, limit);
    return out;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) {
    if (out.length >= limit) break;
    diffValues((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out, limit);
  }
  return out;
}
