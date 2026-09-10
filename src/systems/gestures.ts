import type { Gesture } from './field-types';
export interface StrokePoint { x: number; y: number }
const length = (a: StrokePoint, b: StrokePoint) => Math.hypot(a.x - b.x, a.y - b.y);
const COUNT = 64;

function resample(points: StrokePoint[], count = COUNT): StrokePoint[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1]! + length(points[i - 1]!, points[i]!));
  const total = cumulative.at(-1) ?? 0;
  let segment = 1;
  return Array.from({ length: count }, (_, i) => {
    const at = total * i / (count - 1);
    while (segment < points.length - 1 && cumulative[segment]! < at) segment++;
    const a = points[segment - 1]!, b = points[segment] ?? a;
    const t = (at - cumulative[segment - 1]!) / Math.max(.0001, cumulative[segment]! - cumulative[segment - 1]!);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}
function normalized(points: StrokePoint[]): StrokePoint[] {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
  return resample(points).map(p => ({ x: (p.x - minX) / Math.max(w, .001), y: (p.y - minY) / Math.max(h, .001) }));
}
const templates = {
  triangle: normalized([{ x: .5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: .5, y: 0 }]),
  inverted: normalized([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 1 }, { x: 0, y: 0 }]),
  circle: normalized(Array.from({ length: 97 }, (_, i) => ({ x: Math.cos(i * Math.PI / 48), y: Math.sin(i * Math.PI / 48) }))),
};
function match(points: StrokePoint[], template: StrokePoint[]): number {
  let best = Infinity;
  for (const direction of [1, -1]) for (let shift = 0; shift < COUNT; shift++) {
    let score = 0;
    for (let i = 0; i < COUNT; i++) score += length(points[i]!, template[(shift + direction * i + COUNT * 2) % COUNT]!);
    best = Math.min(best, score / COUNT);
  }
  return best;
}
/** Scale and starting-point tolerant, orientation preserving; ambiguous strokes never execute. */
export function recognizeGesture(input: readonly StrokePoint[]): Gesture | undefined {
  const points = input.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    .filter((p, i, all) => i === 0 || length(p, all[i - 1]!) > .5);
  if (points.length < 2) return undefined;
  const first = points[0]!, last = points.at(-1)!;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  if (Math.max(w, h) < 26) return undefined;
  const path = points.slice(1).reduce((sum, p, i) => sum + length(points[i]!, p), 0);
  const dx = last.x - first.x, dy = last.y - first.y;
  if (length(first, last) / path > .8) {
    if (Math.abs(dx) > Math.abs(dy) * 1.8) return dx > 0 ? 'right' : 'left';
    if (Math.abs(dy) > Math.abs(dx) * 1.8) return dy > 0 ? 'down' : 'up';
    return undefined;
  }
  if (Math.min(w, h) < 25 || w / h > 2.1 || h / w > 2.1 || length(first, last) > Math.hypot(w, h) * .32) return undefined;
  if (path / Math.hypot(w, h) > 4.5) return undefined;
  const closed = normalized([...points, first]);
  const ranked = (Object.entries(templates) as [Gesture, StrokePoint[]][]).map(([gesture, template]) => ({ gesture, score: match(closed, template) })).sort((a, b) => a.score - b.score);
  const best = ranked[0]!, second = ranked[1]!;
  if (best.score > .105 || second.score - best.score < .018) return undefined;
  return best.gesture;
}
