/** Living resource sites; extraction uses the shared player/NPC interaction engine. */
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { prepareLifeSite } from '@/systems/farming';
import { gatherLifeAction, lifeEntityId } from '@/systems/world/life-world';
import type { LifeActivityDef } from '@/systems/life-catalog';
export {
  LIFE_ACTIVITIES, activityForNode, cropForActivity, getActivity,
  type LifeActivityDef, type LifeActivityType, type LifeMinigame,
} from '@/systems/life-catalog';

export const REPEAT_COOLDOWN = 8;
export const LIFE_MINIGAME_THRESHOLD = 0.55;
export const LIFE_MINIGAME_BONUS = 25;
export const LIFE_MINIGAME_GREAT_BONUS = 40;
export const LIFE_MINIGAME_FAIL_PENALTY = -10;
export function minigameUpperBonus(score: number): number {
  return score >= 1 ? LIFE_MINIGAME_GREAT_BONUS : score >= LIFE_MINIGAME_THRESHOLD ? LIFE_MINIGAME_BONUS : LIFE_MINIGAME_FAIL_PENALTY;
}

export function getCooldownRemaining(nodeId: string): number {
  const r = useRunStore().data;
  const entity = r.interactionWorld?.entities[lifeEntityId(nodeId)];
  if (entity?.renewable) return (entity.stock[entity.renewable.resourceId] ?? 0) > 0
    ? 0 : Math.max(0, entity.renewable.nextTurn - r.visitedNodes.length);
  return Math.max(0, (r.lifeCooldowns?.[nodeId] ?? 0) - r.visitedNodes.length);
}
export function canDoRepeat(nodeId: string): boolean {
  const entity = useRunStore().data.interactionWorld?.entities[lifeEntityId(nodeId)];
  if (entity && (entity.properties.integrity ?? 0) <= 0) return false;
  return getCooldownRemaining(nodeId) <= 0;
}
export function repeatUpperChance(act: LifeActivityDef): number {
  const r = useRunStore().data;
  return Math.max(0, Math.min(100, Math.round(10 + (r.lifeLevel ?? 1) * 5 + (r.colors[act.element] ?? 0) * 0.4)));
}
export interface RepeatResult { activityId: string; upper: boolean; itemIds: string[]; colorGain: number; lifeXp: number }

export function performRepeat(nodeId: string, act: LifeActivityDef, upperBonus = 0, enhanceMaterialId?: string): RepeatResult | null {
  if (act.type !== 'repeat') return null;
  const { run, world, target } = prepareLifeSite(nodeId);
  const action = gatherLifeAction(world, 'player', target.id, upperBonus, enhanceMaterialId);
  if (!action) return null;
  const outputs = action.effects.filter(effect => effect.kind === 'stock' && effect.side === 'actor' && effect.amount > 0);
  const itemIds = outputs.flatMap(effect => effect.kind === 'stock' ? Array(effect.amount).fill(effect.resourceId) as string[] : []);
  if (itemIds.some(id => !useDataStore().items.has(id))) return null;
  const upper = itemIds[0] === act.upperItemId;
  const result = run.executeWorldAction(target.id, action);
  if (!result.ok) { useUiStore().toast('info', result.message); return null; }
  return { activityId: act.id, upper, itemIds, colorGain: 2 + Number(upper), lifeXp: 1 + Number(upper) };
}
