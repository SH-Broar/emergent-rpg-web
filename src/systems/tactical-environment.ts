import type { GridCombatState, GridPos, GridStage } from '@/data/schemas';
import { canStopAt, canAttackTile } from './tiles';
import { applyMaterialInfluence, conductivityMultiplier } from './world/engine';

export const environmentKey = (p: GridPos): string => `${p.x},${p.y}`;
export function environmentAt(state: GridCombatState, pos: GridPos) {
  return state.environment?.[environmentKey(pos)] ?? {};
}

/** Definitions are shared by maps/tests; all encounter mutations stay in the combat copy. */
export function prepareTacticalStage(source: GridStage, recoverable: boolean): GridStage {
  const stage: GridStage = JSON.parse(JSON.stringify(source));
  if (stage.objects !== undefined) return stage;
  stage.objects = [];
  const seen = new Set<string>([environmentKey(stage.playerStart)]);
  const cells: GridPos[] = [{ ...stage.playerStart }];
  for (let i = 0; i < cells.length; i++) {
    const p = cells[i];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const next = { x: p.x + dx, y: p.y + dy };
      const key = environmentKey(next);
      if (seen.has(key) || !canStopAt(stage, next)) continue;
      seen.add(key); cells.push(next);
    }
  }
  const free = cells.filter(p => !stage.enemyStarts.some(e => e.x === p.x && e.y === p.y)
    && !stage.itemDrops?.some(e => e.pos.x === p.x && e.pos.y === p.y)
    && environmentKey(p) !== environmentKey(stage.playerStart));
  const supply = recoverable && free.length >= 3 ? free.pop() : undefined;
  const water = free.shift();
  const fire = free[Math.floor(free.length / 2)];
  if (water) stage.objects.push({ id: 'field-water', kind: 'water-barrel', pos: water });
  if (fire) stage.objects.push({ id: 'field-fire', kind: 'brazier', pos: fire });
  if (supply) stage.objects.push({ id: 'field-supply', kind: 'supply', pos: supply });
  return stage;
}

export function paintEnvironment(state: GridCombatState, tiles: GridPos[], kind: 'wet' | 'fire' | 'smoke', rounds = 3): void {
  state.environment ??= {};
  for (const p of tiles) {
    if (!canAttackTile(state.stage, p)) continue;
    const cell = state.environment[environmentKey(p)] ??= {};
    const properties: Record<string, number> = { moisture: cell.wet ?? 0, heat: cell.fire ?? 0,
      burning: cell.fire ?? 0, smoke: cell.smoke ?? 0, flammability: 1 };
    const property = kind === 'wet' ? 'moisture' : kind === 'fire' ? 'heat' : 'smoke';
    applyMaterialInfluence(properties, {}, property, Math.max(0, rounds - (properties[property] ?? 0)));
    if (properties.moisture) cell.wet = properties.moisture; else delete cell.wet;
    if (properties.burning) cell.fire = properties.burning; else delete cell.fire;
    if (properties.smoke) cell.smoke = properties.smoke; else delete cell.smoke;
  }
}

/** Electrical cards read the same material conductivity as tools and world actions. */
export function wetConductionBonus(state: GridCombatState, pos: GridPos): number {
  const wet = environmentAt(state, pos).wet;
  return wet ? Math.round(4 * (conductivityMultiplier({ moisture: 3 }) - 1)) : 0;
}

export function nearbyTiles(center: GridPos): GridPos[] {
  return [{ ...center }, { x: center.x + 1, y: center.y }, { x: center.x - 1, y: center.y },
    { x: center.x, y: center.y + 1 }, { x: center.x, y: center.y - 1 }];
}

/** Smoke hides distant targets; adjacent attacks still work. Both plan and execution use this. */
export function smokeHides(state: GridCombatState, from: GridPos, to: GridPos): boolean {
  const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  if (distance <= 1) return false;
  const steps = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
  for (let i = 0; i <= steps; i++) {
    const p = { x: Math.round(from.x + (to.x - from.x) * i / steps), y: Math.round(from.y + (to.y - from.y) * i / steps) };
    if (environmentAt(state, p).smoke) return true;
  }
  return false;
}
