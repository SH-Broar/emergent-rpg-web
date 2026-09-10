import type { GridPos } from '@/data/schemas/base';
import type { InteractionWorld, WorldEntity } from './types';

export const positionKey = (p: GridPos) => `${p.x},${p.y}`;
export const distance = (a: GridPos, b: GridPos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const cardinal = (p: GridPos): GridPos[] => [{ x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y }];
export function entitiesAt(world: InteractionWorld, spaceId: string, pos: GridPos): WorldEntity[] {
  return Object.values(world.entities).filter(e => e.nodeId === spaceId && !e.carriedBy && e.pos && distance(e.pos, pos) === 0);
}
export function walkable(world: InteractionWorld, spaceId: string, pos: GridPos, ignoreId?: string): boolean {
  const space = world.spaces?.[spaceId];
  if (!space || !Number.isInteger(pos.x) || !Number.isInteger(pos.y)) return false;
  const tile = space.tiles[pos.y]?.[pos.x];
  if (!tile || tile === 'wall' || tile === 'water') return false;
  return !entitiesAt(world, spaceId, pos).some(e => e.id !== ignoreId && (e.properties.integrity ?? 100) > 0 && (e.kind === 'actor' || (e.properties.solid ?? 0) > 0));
}
/** Breadth-first shortest paths never contain diagonal steps or cross occupied cells. */
export function fieldPath(world: InteractionWorld, spaceId: string, from: GridPos, to: GridPos, actorId: string, adjacent = false): GridPos[] | undefined {
  const space = world.spaces?.[spaceId];
  if (!space) return undefined;
  const blocked = new Set(Object.values(world.entities).filter(e => e.nodeId === spaceId && e.id !== actorId && e.pos && !e.carriedBy && (e.properties.integrity ?? 100) > 0 && (e.kind === 'actor' || (e.properties.solid ?? 0) > 0)).map(e => positionKey(e.pos!)));
  const goal = (p: GridPos) => adjacent ? distance(p, to) <= 1 : distance(p, to) === 0;
  if (goal(from)) return [];
  const queue = [from];
  const parents = new Map<string, GridPos | null>([[positionKey(from), null]]);
  for (let i = 0; i < queue.length; i++) {
    for (const next of cardinal(queue[i]!)) {
      const key = positionKey(next);
      const tile = space.tiles[next.y]?.[next.x];
      if (parents.has(key) || blocked.has(key) || !tile || tile === 'wall' || tile === 'water') continue;
      parents.set(key, queue[i]!);
      if (goal(next)) {
        const path: GridPos[] = [next];
        let prior = parents.get(key);
        while (prior && distance(prior, from) > 0) { path.push(prior); prior = parents.get(positionKey(prior)); }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return undefined;
}
export function hasSight(world: InteractionWorld, observer: WorldEntity, target: WorldEntity | GridPos): boolean {
  const point = 'id' in target ? target.pos : target;
  if (!observer.pos || !point || !world.spaces?.[observer.nodeId]) return true;
  if (distance(observer.pos, point) > 7) return false;
  if (distance(observer.pos, point) > 1 && [observer.pos, point].some(pos => entitiesAt(world, observer.nodeId, pos).some(e => (e.properties.smoke ?? 0) > 0))) return false;
  let x = observer.pos.x, y = observer.pos.y;
  const dx = Math.abs(point.x - x), dy = Math.abs(point.y - y);
  const sx = Math.sign(point.x - x), sy = Math.sign(point.y - y);
  let err = dx - dy;
  while (x !== point.x || y !== point.y) {
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (x === point.x && y === point.y) return true;
    if (world.spaces[observer.nodeId]!.tiles[y]?.[x] === 'wall') return false;
    if (entitiesAt(world, observer.nodeId, { x, y }).some(e => (e.properties.smoke ?? 0) > 0 || ((e.properties.solid ?? 0) > 0 && !e.creature))) return false;
  }
  return true;
}
