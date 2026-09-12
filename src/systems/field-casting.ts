import type { Card, CardEffect, CardEffectKind, GridPos, RunState } from '@/data/schemas';
import type { InteractionWorld, WorldEntity } from './world/types';
import { influenceEntity, recordFact } from './world/engine';
import { actionRestriction, outgoingDamage, status } from './world/status';
import { distance, entitiesAt, hasSight } from './world/spatial';
import { combatDefinition } from './field-combat';

export const CASTING_EFFECTS: ReadonlySet<CardEffectKind> = new Set([
  'place-installation', 'delayed-damage', 'amplify-debuff', 'status-spread', 'chain-explosion',
]);
export const SPREADABLE_STATUSES = ['vulnerable', 'weakness', 'poison', 'burn', 'regress'] as const;
const INSTALLATIONS = ['burn', 'poison', 'vulnerable', 'atk-up', 'def-up', 'mana-up', 'explosion'];
export interface CastingCell { pos: GridPos; multiplier: number }
export interface CastingResolution {
  run: RunState;
  world: InteractionWorld;
  card: Card;
  effect: CardEffect;
  cells: CastingCell[];
  targets: { target: WorldEntity; multiplier: number }[];
  /** Already enhanced and multiplied by the paid preparation effect; not a free bonus. */
  value: number;
  bonusDamage?: number;
}
export interface CastCommitment { nodeId: string; origin: GridPos; integrity: number }

export function castCommitment(card: Card, player: WorldEntity): CastCommitment | undefined {
  return card.castSpeed === 'slow' && player.pos ? {
    nodeId: player.nodeId, origin: { ...player.pos }, integrity: player.properties.integrity ?? 100,
  } : undefined;
}
export function brokenCastCommitment(commitment: CastCommitment | undefined, player: WorldEntity): string | undefined {
  if (!commitment) return;
  if (player.nodeId !== commitment.nodeId || !player.pos || distance(commitment.origin, player.pos)) return '움직여서 집중이 풀렸다.';
  if ((player.properties.integrity ?? 100) < commitment.integrity) return '피격으로 집중이 풀렸다.';
  if (actionRestriction(player)) return '집중을 이어갈 수 없다.';
}
export function castingEffectFailure(effect: CardEffect): string | undefined {
  if (!CASTING_EFFECTS.has(effect.kind)) return;
  if (!Number.isFinite(effect.value ?? 0) || (effect.value ?? 0) < 0) return '술식의 위력 확인 필요';
  if (effect.kind === 'place-installation' && (!INSTALLATIONS.includes(String(effect.params?.kind ?? 'burn')) ||
    !Number.isInteger(Number(effect.params?.duration ?? 3)) || Number(effect.params?.duration ?? 3) < 1)) return '설치 규칙 확인 필요';
  if (effect.kind === 'delayed-damage' && (!Number.isInteger(Number(effect.params?.delay ?? 2)) ||
    Number(effect.params?.delay ?? 2) < 1)) return '잔상 시각 확인 필요';
}
const alive = (e: WorldEntity) => (e.properties.integrity ?? 100) > 0;
const traceKind = (e: WorldEntity) => e.tags.find(t => t.startsWith('casting:'))?.slice(8);
export function castingPlacementCells(world: InteractionWorld, player: WorldEntity, cells: CastingCell[]): CastingCell[] {
  return cells.filter(({ pos }) => {
    const tile = world.spaces?.[player.nodeId]?.tiles[pos.y]?.[pos.x];
    return !!tile && tile !== 'wall' && tile !== 'water' && hasSight(world, player, pos) &&
      !entitiesAt(world, player.nodeId, pos).some(e => alive(e) && (e.kind === 'actor' || e.properties.solid || e.tags.includes('installation')));
  });
}
/** Direct spell damage keeps a named caster and uses the same resistance, guard and status router. */
function magicImpact(world: InteractionWorld, source: WorldEntity, target: WorldEntity, rawDamage: number, ranged: boolean) {
  if (!alive(target) || target.creature?.rank === 'boss' && !target.creature.engaged ||
    status(target, 'ghost') && (ranged || status(source, 'ghost'))) return;
  const defense = target.creature ? combatDefinition(target)?.defense ?? 0 : 0;
  const damage = Math.max(0, rawDamage - defense);
  if (!damage) return;
  const resistance = (target.properties.hardness ?? 0) + (target.colors.iron ?? 0) / 20;
  const before = target.properties.integrity ?? 100;
  influenceEntity(world, target, 'force', damage / (target.properties.maxHp ?? 100) * 100 + resistance, source.id);
  if (target.creature && (target.properties.integrity ?? 100) < before) target.creature.angry = true;
}
function trace(ctx: CastingResolution, cell: CastingCell, kind: string, name: string, duration: number, damage: number) {
  const { run, world } = ctx, source = world.entities.player!, now = run.field!.elapsedSeconds;
  const id = source.nodeId + ':casting:' + (++run.field!.sequence);
  const entity: WorldEntity = {
    id, name, kind: 'resource', nodeId: source.nodeId, pos: { ...cell.pos }, ownerId: source.id,
    tags: ['casting-trace', 'casting:' + kind, ...(kind === 'echo' ? ['spell-echo'] : ['installation'])],
    colors: {}, stock: {}, properties: {
      integrity: 100, maxHp: 10, portable: kind === 'echo' ? 0 : 1, mass: 1, hardness: 0,
      castingValue: ctx.value, castingDamage: damage, castingRanged: ctx.card.targetMode === 'aimed' ? 1 : 0,
      castingCreatedAt: now, castingReadyAt: now + 30, castingExpiresAt: now + duration * 30,
    },
  };
  world.entities[id] = entity;
  return entity;
}
export function fieldCastingLabel(e: WorldEntity, seconds: number): string | undefined {
  if (!e.tags.includes('casting-trace') || !alive(e)) return;
  return e.name + ' · ' + Math.max(0, Math.ceil(((e.properties.castingExpiresAt ?? seconds) - seconds) / 30)) + '턴';
}
function spreadable(e: WorldEntity) { return SPREADABLE_STATUSES.map(key => [key, status(e, key)] as const).filter(([, n]) => n > 0); }
export function castingMarkedTargets(world:InteractionWorld,source:WorldEntity):WorldEntity[] {
  return Object.values(world.entities).filter(e=>e.id!==source.id && e.nodeId===source.nodeId && e.kind==='actor' && alive(e) && e.pos && hasSight(world,source,e) && spreadable(e).length);
}

export function resolveCastingEffect(ctx: CastingResolution): boolean {
  const { world, effect, cells, targets, value } = ctx, source = world.entities.player!;
  if (!CASTING_EFFECTS.has(effect.kind)) return false;
  if (castingEffectFailure(effect)) return true;
  const ranged = ctx.card.targetMode === 'aimed';
  const damage = (target: WorldEntity, base: number, multiplier = 1) =>
    magicImpact(world, source, target, outgoingDamage(source, Math.floor(base + (ctx.bonusDamage ?? 0)), ranged) * multiplier, ranged);
  if (effect.kind === 'place-installation') {
    const kind = String(effect.params?.kind ?? 'burn'), duration = Number(effect.params?.duration ?? 3);
    const labels: Record<string, string> = { burn: '화염 깔개', poison: '독 살포기', vulnerable: '가시 깔개', 'atk-up': '힘의 발판', 'def-up': '방어 발판', 'mana-up': '마나 발판', explosion: '폭약' };
    for (const cell of castingPlacementCells(world, source, cells)) trace(ctx, cell, kind, labels[kind]!, duration + 1,
      outgoingDamage(source, value + (ctx.bonusDamage ?? 0), true) * cell.multiplier);
    return true;
  }
  if (effect.kind === 'delayed-damage') {
    const delay = Number(effect.params?.delay ?? 2);
    for (const cell of cells) trace(ctx, cell, 'echo', '잔상', delay,
      outgoingDamage(source, value + (ctx.bonusDamage ?? 0), ranged) * cell.multiplier);
    return true;
  }
  if (effect.kind === 'amplify-debuff') {
    for (const { target, multiplier } of targets) {
      const strongest = spreadable(target).sort((a, b) => b[1] - a[1])[0];
      if (strongest) {
        influenceEntity(world, target, 'status:' + strongest[0], strongest[1], source.id);
        damage(target, strongest[1] * value, multiplier);
      } else damage(target, value, multiplier);
    }
    return true;
  }
  const nearby = Object.values(world.entities).filter(e => e.id !== source.id && e.nodeId === source.nodeId && e.kind === 'actor' && alive(e) && e.pos && hasSight(world, source, e));
  if (effect.kind === 'status-spread') {
    // Freeze every source before writing: adjacent marked targets cannot recursively multiply one another.
    const snapshots = targets.filter(t => t.target.pos).map(({ target }) => ({ id: target.id, pos: { ...target.pos! }, statuses: spreadable(target) }));
    const additions = new Map<WorldEntity, Map<string, number>>();
    for (const snapshot of snapshots) for (const other of nearby) {
      if (other.id === snapshot.id || distance(snapshot.pos, other.pos!) > 1) continue;
      const values = additions.get(other) ?? new Map<string, number>();
      for (const [key, amount] of snapshot.statuses) values.set(key, Math.max(values.get(key) ?? 0, amount));
      additions.set(other, values);
    }
    for (const [target, values] of additions) for (const [key, amount] of values) influenceEntity(world, target, 'status:' + key, amount, source.id);
    return true;
  }
  const centers = castingMarkedTargets(world,source), hit = new Set<WorldEntity>();
  for (const center of centers) for (const target of nearby) if (distance(center.pos!, target.pos!) <= 1) hit.add(target);
  for (const target of hit) damage(target, value);
  return true;
}
/** Contact is geometric and faction-independent: a moved heavy prop can trip a physical trap. */
export function triggerFieldInstallations(run: RunState, world: InteractionWorld, actorId: string) {
  const actor = world.entities[actorId], now = run.field?.elapsedSeconds ?? 0;
  if (!actor?.pos || actor.carriedBy || !alive(actor) || actor.tags.includes('casting-trace') ||
    actor.kind !== 'actor' && (actor.properties.mass ?? 0) <= 0) return;
  for (const trap of entitiesAt(world, actor.nodeId, actor.pos)) {
    if (!trap.tags.includes('installation') || !alive(trap) || trap.carriedBy ||
      (trap.properties.castingReadyAt ?? 0) > now || (trap.properties.castingExpiresAt ?? 0) <= now) continue;
    const source = trap.ownerId ? world.entities[trap.ownerId] : undefined, kind = traceKind(trap);
    if (!source || !kind) continue;
    influenceEntity(world, trap, 'integrity', -100, source.id);
    const value = trap.properties.castingValue ?? 0;
    if (kind === 'explosion') {
      for (const target of Object.values(world.entities)) if (target.id !== trap.id && target.nodeId === trap.nodeId &&
        target.pos && alive(target) && distance(target.pos, trap.pos!) <= 1 && !target.carriedBy)
        magicImpact(world, source, target, trap.properties.castingDamage ?? 0, true);
    } else if (actor.kind === 'actor') {
      const property = kind === 'atk-up' ? 'status:strength' : kind === 'def-up' ? 'guard' : kind === 'mana-up' ? 'mana' : 'status:' + kind;
      if (kind === 'atk-up') {
        // Field life has no battle boundary to clear strength: this is a short, non-stacking preparation.
        const previous = Math.min(actor.properties.castingStrength ?? 0, status(actor,'strength'));
        influenceEntity(world, actor, 'status:strength', Math.max(previous,value) - previous, source.id);
        actor.properties.castingStrength = Math.max(previous,value);
        actor.properties.castingStrengthExpiresAt = now + 90;
      } else influenceEntity(world, actor, property, kind === 'mana-up' ? Math.min(value, Math.max(0, 3 - (actor.properties.mana ?? 0))) : value, source.id);
    }
    recordFact(world, { turn: world.turn, nodeId: actor.nodeId, actorId: source.id, targetId: actor.id, kind: 'signal', labor: 0, message: trap.name + ' 발동' });
  }
}
/** Expiration is absolute; unloaded locations expire cheaply without replaying their combat. */
export function tickFieldCasting(run: RunState, world: InteractionWorld) {
  const now = run.field?.elapsedSeconds ?? 0, player = world.entities.player;
  if (!player) return;
  for (const entity of Object.values(world.entities)) {
    if ((entity.properties.castingStrength ?? 0) > 0 && now >= (entity.properties.castingStrengthExpiresAt ?? 0)) {
      influenceEntity(world, entity, 'status:strength', -entity.properties.castingStrength!, entity.id);
      entity.properties.castingStrength = 0;
    }
    if (!entity.tags.includes('casting-trace')) continue;
    const expires = entity.properties.castingExpiresAt ?? 0;
    if (!alive(entity)) {
      if (now >= expires) { entity.carriedBy=undefined; delete world.entities[entity.id]; }
      continue;
    }
    if (traceKind(entity) === 'echo' && now >= expires) {
      const source = entity.ownerId ? world.entities[entity.ownerId] : undefined;
      if (source && entity.nodeId === player.nodeId && entity.pos) {
        for (const target of entitiesAt(world, entity.nodeId, entity.pos)) if (target.id !== source.id && !target.tags.includes('casting-trace'))
          magicImpact(world, source, target, entity.properties.castingDamage ?? 0, !!entity.properties.castingRanged);
        recordFact(world, { turn: world.turn, nodeId: entity.nodeId, actorId: source.id, targetId: entity.id, kind: 'signal', labor: 0, message: '잔상 타격' });
      }
      influenceEntity(world, entity, 'integrity', -100, entity.ownerId);
    } else if (now >= expires) influenceEntity(world, entity, 'integrity', -100, entity.ownerId);
    if (!alive(entity) && now >= expires) { entity.carriedBy=undefined; delete world.entities[entity.id]; }
  }
  for (const entity of Object.values(world.entities)) if (entity.nodeId === player.nodeId) triggerFieldInstallations(run, world, entity.id);
}
