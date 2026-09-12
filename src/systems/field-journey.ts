import type { RunState } from '@/data/schemas';
import type { FieldSpeech } from './field-types';
import type { InteractionWorld, WorldEntity, PrimitiveEffect } from './world/types';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import { instantiateCard } from './deck';
import { resolveInteraction } from './world/engine';
import { actionRestriction } from './world/status';
import { distance, hasSight } from './world/spatial';
import { chaosStoryAvailable, livingTimeAlly } from './time-story';
import { JOURNEY_QUESTS, type JourneyQuest, type JourneyGoal } from '@/data/journey-quests';

export interface JourneyState {
  accepted: Record<string, number>;
  completed: Record<string, number>;
  counts: Record<string, number>;
  visited: Record<string, boolean>;
  decisions?: Record<string, string>;
  readings?: Record<string, { at: number; lines: string[] }>;
}
export function ensureJourney(run: RunState): JourneyState {
  const state = run.field!.journey ??= { accepted: {}, completed: {}, counts: {}, visited: {} };
  state.decisions ??= {};
  state.readings ??= {};
  return state;
}
export function noteJourney(run: RunState, key: string, amount = 1) {
  if (!run.field) return;
  const state = ensureJourney(run);
  state.counts[key] = (state.counts[key] ?? 0) + amount;
}
export function questAvailable(run: RunState, q: JourneyQuest) {
  const state = run.field?.journey;
  return !state?.completed[q.id] && (!q.after || q.after.every(id => !!state?.completed[id]));
}
export function goalApplies(run: RunState, g: JourneyGoal): boolean {
  return !g.whenChoice || run.field?.journey?.decisions?.[g.whenChoice.questId] === g.whenChoice.choiceId;
}
export function goalProgress(run: RunState, g: JourneyGoal): number {
  if (!goalApplies(run, g)) return g.amount ?? 1;
  if (g.kind === 'ally') return livingTimeAlly(run, g.key) ? 1 : 0;
  const state = run.field?.journey;
  if (g.kind === 'visit') return state?.visited[g.key] || run.nodeStates[g.key]?.visited ? 1 : 0;
  if (g.kind === 'talk') return (run.field?.spoken['npc:' + g.key] ?? 0) > 0 ? 1 : 0;
  if (g.kind === 'deliver') return run.interactionWorld?.entities.player?.stock[g.key] ?? 0;
  if (g.kind === 'dungeon') return run.field?.completedDungeons.length ?? 0;
  if (g.kind === 'boss') return run.bossesCleared.includes(g.key) || run.arcsCleared?.includes(g.key) ? 1 : 0;
  if (g.kind === 'read') return state?.readings?.[g.key] ? 1 : 0;
  return state?.counts[g.key] ?? 0;
}
export const questGoalsReady = (run: RunState, q: JourneyQuest) => q.goals.every(g => goalProgress(run, g) >= (g.amount ?? 1));
export const questReady = (run: RunState, q: JourneyQuest) => questGoalsReady(run, q) &&
  (!q.choices?.length || q.choices.some(c => c.id === run.field?.journey?.decisions?.[q.id]));
export function currentJourney(run: RunState) {
  return JOURNEY_QUESTS.find(q => q.main && questAvailable(run, q)) ??
    JOURNEY_QUESTS.find(q => ['home', 'first-shape', 'fibers', 'provisions'].includes(q.id) && questAvailable(run, q));
}
function questsForNpc(run: RunState, npcId: string) {
  return JOURNEY_QUESTS.filter(q => (run.field?.journey?.accepted[q.id] ? (q.turnInNpcId ?? q.npcId) : q.npcId) === npcId && questAvailable(run, q));
}
export function questMarker(run: RunState, npcId?: string) {
  if (!npcId) return '';
  const available = questsForNpc(run, npcId), state = run.field?.journey;
  return available.some(q => state?.accepted[q.id] && questGoalsReady(run, q)) ? '✓' :
    available.some(q => !state?.accepted[q.id]) ? '!' : '';
}
export function questTopics(run: RunState, actor: WorldEntity): NonNullable<FieldSpeech['topics']> {
  if (!actor.npcId) return [];
  return questsForNpc(run, actor.npcId).flatMap(q => {
    const accepted = !!run.field?.journey?.accepted[q.id];
    if (!accepted) return [{ label: q.title, lines: q.offer, action: 'quest:accept:' + q.id, confirmLabel: '부탁을 받는다' }];
    if (questGoalsReady(run, q)) {
      if (q.choices?.length && !questReady(run, q)) return q.choices.filter(c => !c.requiresChaos || chaosStoryAvailable(run)).map(c => ({
        label: c.label, lines: [], action: 'quest:choose:' + q.id + ':' + c.id, confirmLabel: '이렇게 말한다',
      }));
      return [{ label: q.title + ' ✓', lines: [], action: 'quest:finish:' + q.id, confirmLabel: '이야기한다' }];
    }
    return [{ label: q.title, lines: [q.reminder] }];
  });
}
function grantCard(run: RunState, id: string, first = false) {
  const definition = useDataStore().cards.get(id);
  if (!definition) return;
  const card = instantiateCard(definition);
  const collection = run.transform?.field ? run.transform.stashCollection : run.collection;
  collection.push(card);
  if (first && !run.transform?.field && run.field?.skills && !run.field.skills.slots.corner) run.field.skills.slots.corner = card.instanceId;
}
function awardQuest(run: RunState, world: InteractionWorld, recipient: WorldEntity, q: JourneyQuest) {
  const effects: PrimitiveEffect[] = q.goals.filter(g => goalApplies(run, g) && g.kind === 'deliver').map(g => ({
    kind: 'transfer', resourceId: g.key, quantity: g.amount ?? 1, from: 'actor', to: 'target',
  }));
  for (const [resourceId, amount] of Object.entries(q.reward.stock ?? {})) effects.push({ kind: 'stock', resourceId, amount, side: 'actor' });
  effects.push({ kind: 'signal', message: q.finish });
  const result = resolveInteraction(world, 'player', recipient.id, { id: q.id, label: q.title, description: '', duration: 0, effects });
  if (!result.ok) return result;
  ensureJourney(run).completed[q.id] = run.field!.elapsedSeconds + 1;
  useRunStore().gainXp(q.reward.xp ?? 0);
  if (q.reward.life) useRunStore().addLifeXp(q.reward.life);
  if (q.reward.card) grantCard(run, q.reward.card);
  const relation = recipient.agent?.relations.player;
  if (relation) {
    relation.trust = Math.min(1, relation.trust + .04);
    relation.regard = Math.min(1, relation.regard + .06);
  }
  return {
    ok: true,
    message: q.reward.card ? (useDataStore().cards.get(q.reward.card)?.name ?? '새 기술') + ' 획득' : '부탁 완료 · 경험 +' + (q.reward.xp ?? 0),
    speech: { actorId: recipient.id, name: recipient.name, lines: [q.finish] },
  };
}
export function performQuest(run: RunState, world: InteractionWorld, actorId: string, action: string) {
  const [, verb, id, choiceId] = action.split(':'), q = JOURNEY_QUESTS.find(q => q.id === id);
  const actor = world.entities[actorId], player = world.entities.player;
  if (!q || !actor || !player || run.ended || run.field?.encounter ||
    actor.npcId !== (verb === 'accept' ? q.npcId : (q.turnInNpcId ?? q.npcId)) ||
    !actor.pos || !player.pos || actor.nodeId !== player.nodeId || actor.routine?.travel ||
    distance(actor.pos, player.pos) > 1 || !hasSight(world, player, actor) ||
    (actor.properties.integrity ?? 0) <= 0 || actionRestriction(actor) || actionRestriction(player) ||
    (actor.agent?.relations.player?.trust ?? 0) < -.25 || !questAvailable(run, q)) {
    return { ok: false, message: '지금은 이야기를 나눌 수 없다.' };
  }
  const state = ensureJourney(run);
  if (verb === 'accept') {
    if (state.accepted[q.id]) return { ok: false, message: '이미 받은 부탁이다.' };
    state.accepted[q.id] = run.field!.elapsedSeconds + 1;
    if (q.lessonCard) grantCard(run, q.lessonCard, true);
    return { ok: true, message: q.lessonCard ? (useDataStore().cards.get(q.lessonCard)?.name ?? '새 기술') + ' 획득' : '부탁을 수첩에 적었다.',
      speech: { actorId, name: actor.name, lines: [q.reminder] } };
  }
  if (verb === 'choose') {
    const choice = q.choices?.find(c => c.id === choiceId);
    if (!choice || choice.requiresChaos && !chaosStoryAvailable(run) || !state.accepted[q.id] || !questGoalsReady(run, q) || state.decisions![q.id]) return { ok: false, message: '먼저 확인할 일이 남아 있다.' };
    state.decisions![q.id] = choice.id;
    const result = awardQuest(run, world, actor, q);
    if (!result.ok) delete state.decisions![q.id];
    return result.ok ? { ...result, speech: { actorId, name: actor.name, lines: [choice.reply, q.finish] } } : result;
  }
  if (verb !== 'finish' || !state.accepted[q.id] || !questReady(run, q)) return { ok: false, message: '아직 마치지 못한 일이 있다.' };
  return awardQuest(run, world, actor, q);
}
/** Called only after the actual victory record is written; never on encounter or entry. */
export function completeBossQuests(run: RunState, world: InteractionWorld, bossId: string) {
  if (!run.field || run.ended || !world.entities.player || !run.bossesCleared.includes(bossId)) return;
  for (const q of JOURNEY_QUESTS) {
    if (q.completeOnBoss === bossId && run.field.journey?.accepted[q.id] &&
      questAvailable(run, q) && questReady(run, q)) awardQuest(run, world, world.entities.player, q);
  }
}
