/** Compatibility adapter: regional benefits read actual resources and facilities. */
import type { RunState } from '@/data/schemas';
import { ensureInteractionWorld, tickInteractionWorld, syncPlayerFromWorld } from './world-interaction';
import { recordFact } from './world/engine';
import { REGION_ENTITIES } from './world/seed';
import { PLAYER_ACTOR_ID } from './world/types';

/** Kept for saved runs; these aggregates no longer drive NPC behavior. */
export interface RegionWorldState {
  version: 1;
  nextTurn: number;
  cycle: number;
  supplies: number;
  threat: number;
  irrigation: boolean;
  patrolUntilTurn: number;
  deliveries: number;
  recovered: number;
  victories: number;
  lastEncounter?: string;
  history: { turn: number; message: string }[];
}

export function inLivingRegion(nodeId: string): boolean {
  return nodeId.startsWith('n-iluneon-') || nodeId.startsWith('n-ilu-');
}

export function ensureRegionWorld(run: RunState): RegionWorldState {
  const world = ensureInteractionWorld(run);
  const state = run.regionWorld ??= {
    version: 1, nextTurn: world.turn + 1, cycle: 0, supplies: 0, threat: 4,
    irrigation: false, patrolUntilTurn: 0, deliveries: 0, recovered: 0, victories: 0, history: [],
  };
  const store = world.entities[REGION_ENTITIES.storage];
  const path = world.entities[REGION_ENTITIES.path];
  state.supplies = (store?.properties.integrity ?? 0) > 0 ? Math.max(0, store?.stock['i-crop-grain'] ?? 0) : 0;
  state.threat = Math.max(0, Math.min(6, 6 - (path?.properties.safety ?? 0)));
  state.irrigation = irrigationActive(run, 'n-ilu-larder');
  state.patrolUntilTurn = 0;
  state.nextTurn = Math.min(...Object.values(world.entities).filter(e => e.agent && e.id !== PLAYER_ACTOR_ID)
    .map(e => Math.max(world.turn + 1, e.agent!.nextActionTurn)), world.turn + 1);
  state.history = (world.knowledge[PLAYER_ACTOR_ID]?.facts ?? []).slice(-6).reverse().map(f => ({ turn: f.turn, message: f.message }));
  return state;
}

/** The saved clock drives material changes and actor choices through the shared router. */
export function tickRegionWorld(run: RunState): void {
  if (!run.interactionWorld && !run.regionWorld && !inLivingRegion(run.currentNodeId)) return;
  tickInteractionWorld(run);
  ensureRegionWorld(run);
}

export function irrigationActive(run: RunState, nodeId: string): boolean {
  if (!inLivingRegion(nodeId)) return false;
  const world = run.interactionWorld;
  if (!world) return run.regionWorld?.irrigation === true;
  const facility = world.entities[REGION_ENTITIES.irrigation];
  return !!facility && (facility.properties.integrity ?? 0) > 0 && (facility.properties.irrigation ?? 0) > 0;
}

export function regionCombatSupport(run: RunState, nodeId: string): { block: number } {
  if (!inLivingRegion(nodeId)) return { block: 0 };
  const path = run.interactionWorld?.entities[REGION_ENTITIES.path];
  return { block: path && (path.properties.integrity ?? 0) > 0 && (path.properties.safety ?? 0) >= 4 ? 4 : 0 };
}

export function reportRegionEncounter(run: RunState, nodeId: string, result: 'win' | 'lose' | 'recovered'): void {
  if (!inLivingRegion(nodeId)) return;
  const world = ensureInteractionWorld(run);
  const receipt = result === 'lose' ? 'region:retreat:' + nodeId + ':' + run.visitedNodes.length
    : 'region:resolved:' + nodeId + ':day:' + (run.currentDay ?? 1);
  if (world.receipts.includes(receipt) || (result !== 'lose' && run.nodeStates[nodeId]?.combatCleared)) return;
  world.receipts.push(receipt);
  const state = ensureRegionWorld(run);
  state.lastEncounter = receipt;
  if (result === 'recovered') {
    const actor = world.entities[PLAYER_ACTOR_ID]!;
    const before = actor.stock['i-crop-grain'] ?? 0;
    actor.stock['i-crop-grain'] = before + 3;
    recordFact(world, { turn: world.turn, nodeId, actorId: PLAYER_ACTOR_ID, targetId: actor.id,
      ownerId: actor.id, labor: 0, kind: 'production', resourceId: 'i-crop-grain', quantity: 3, before, after: before + 3,
      message: '보급함에서 들곡 3개를 회수했다. 소지품에 보관하며, 남은 마물은 그대로다.' });
    syncPlayerFromWorld(run, world);
    state.recovered++;
  } else {
    const path = world.entities[REGION_ENTITIES.path];
    if (path) {
      const before = path.properties.safety ?? 0;
      path.properties.safety = Math.max(0, Math.min(6, before + (result === 'win' ? 2 : -2)));
      if (path.properties.safety < 4) path.properties.work = 0;
      recordFact(world, { turn: world.turn, nodeId, actorId: PLAYER_ACTOR_ID, targetId: path.id,
        ownerId: path.ownerId, labor: 0, kind: 'property', property: 'safety', before, after: path.properties.safety,
        message: result === 'win' ? '마물을 소탕해 일루네온 길목이 안전해졌다.' : '원정에서 물러났다. 길목의 마물 위험이 커졌다.' });
      if (result === 'win') state.victories++;
    }
  }
  ensureRegionWorld(run);
}

/** The delivery caller supplies the actual removed goods; no resource or gold is invented. */
export function reportRegionDelivery(run: RunState, nodeId: string, count: number, resourceIds: string[] = []): void {
  if (!inLivingRegion(nodeId) || count <= 0) return;
  const world = ensureInteractionWorld(run);
  const receipt = 'region:delivery:' + nodeId + ':day:' + (run.currentDay ?? 1);
  if (world.receipts.includes(receipt)) return;
  world.receipts.push(receipt);
  const state = ensureRegionWorld(run);
  const storage = world.entities[REGION_ENTITIES.storage];
  if (storage && (storage.properties.integrity ?? 0) > 0) {
    const quantities: Record<string, number> = {};
    for (const id of resourceIds.slice(0, count)) quantities[id] = (quantities[id] ?? 0) + 1;
    for (const [id, amount] of Object.entries(quantities)) {
      const before = storage.stock[id] ?? 0;
      storage.stock[id] = before + amount;
      recordFact(world, { turn: world.turn, nodeId, actorId: PLAYER_ACTOR_ID, targetId: storage.id,
        ownerId: storage.ownerId, labor: 0, kind: 'transfer', resourceId: id, quantity: amount, before, after: before + amount,
        message: '길드에 납품한 물품이 공유 선반으로 전달되었다.' });
    }
  }
  state.deliveries++;
  ensureRegionWorld(run);
}
