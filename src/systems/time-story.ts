import type { MetaProgress, RunState } from '@/data/schemas';
import type { FieldResult, FieldSpeech, FieldSpace } from './field-types';
import type { InteractionWorld, WorldEntity } from './world/types';
import type { TimeEndingId, TimeEndingWitness, TimeEndingWitnesses } from '@/data/time-endings';
import { FRACTURED_TIME_CHAOS_ID, hasFracturedTime } from './field-chaos';
import { actionRestriction, status, outgoingDamage } from './world/status';
import { distance, fieldPath, hasSight, walkable } from './world/spatial';
import { influenceEntity, recordFact } from './world/engine';

export interface TimeStoryState {
  version: 1;
  /** A new challenge must begin after a recorded imperfect ending. Old saves default to false. */
  chaosEligible: boolean;
  allies: Record<string, { joinedAt: number; supportAt?: number }>;
  ending?: { id: TimeEndingId; at: number; reason?: string; witnesses?: TimeEndingWitnesses };
}
export const TIME_ALLIES = ['npc-kumamimi', 'npc-toramimi'] as const;
const ARC_BY_ALLY: Record<string, string> = { 'npc-kumamimi': 'bs-arc-dun', 'npc-toramimi': 'bs-arc-tifre' };
export function initializeTimeStory(run: RunState, meta: MetaProgress) {
  const unlocked = !!meta.storyEndings?.chaosUnlocked;
  if (!unlocked) run.activeChaos = run.activeChaos?.filter(c => c.id !== FRACTURED_TIME_CHAOS_ID);
  run.timeStory = { version: 1, chaosEligible: unlocked && hasFracturedTime(run), allies: {} };
}
export function chaosStoryAvailable(run: RunState): boolean {
  return !!run.timeStory?.chaosEligible && hasFracturedTime(run);
}
export function isTimeAlly(run: RunState, actor: WorldEntity): boolean {
  return !!actor.npcId && !!run.timeStory?.allies[actor.npcId];
}
export function livingTimeAlly(run: RunState, npcId: string): WorldEntity | undefined {
  const e = run.interactionWorld?.entities['npc:' + npcId];
  return run.timeStory?.allies[npcId] && e && (e.properties.integrity ?? 100) > 0 ? e : undefined;
}
function wantsAlliance(run: RunState) {
  return chaosStoryAvailable(run) && run.field?.journey?.decisions?.['time-17'] === 'both';
}
export function timeAllyTopics(run: RunState, actor: WorldEntity): NonNullable<FieldSpeech['topics']> {
  if (!actor.npcId || !TIME_ALLIES.includes(actor.npcId as typeof TIME_ALLIES[number])) return [];
  if (isTimeAlly(run, actor)) return [{
    label: '함께 갈 길', lines: [actor.npcId === 'npc-kumamimi' ?
      '내가 받칠게. 무리해서 앞서가지는 마.' : '앞만 보다가 놓친 게 있었지. 이번엔 같이 확인하자.'],
  }];
  if (!wantsAlliance(run)) return [];
  return [{ label: '함께 닻으로 가자', lines: [], action: 'story:recruit', confirmLabel: '동행을 부탁한다' }];
}
export function recruitTimeAlly(run: RunState, world: InteractionWorld, actorId: string): FieldResult {
  const actor = world.entities[actorId], player = world.entities.player, npcId = actor?.npcId;
  if (!actor || !player || !npcId || !TIME_ALLIES.includes(npcId as typeof TIME_ALLIES[number]) ||
    run.ended || run.field?.encounter || !wantsAlliance(run) || !run.arcsCleared?.includes(ARC_BY_ALLY[npcId]!) ||
    !actor.pos || !player.pos || actor.nodeId !== player.nodeId || actor.routine?.travel ||
    distance(actor.pos, player.pos) > 1 || !hasSight(world, player, actor) ||
    (actor.properties.integrity ?? 0) <= 0 || actionRestriction(actor) || actionRestriction(player) ||
    (actor.agent?.relations.player?.trust ?? 0) < -.25) return { ok: false, message: '지금은 동행을 부탁할 수 없다.' };
  if (isTimeAlly(run, actor)) return { ok: false, message: '이미 함께 가기로 했다.' };
  run.timeStory!.allies[npcId] = { joinedAt: run.field!.elapsedSeconds + 1 };
  if (actor.routine) { actor.routine.travel = undefined; actor.routine.route = []; actor.routine.goal = actor.nodeId; }
  return { ok: true, message: actor.name + ' 동행', speech: { actorId, name: actor.name,
    lines: [npcId === 'npc-kumamimi' ? '내가 받칠게. 풀어야 할 매듭은 네가 봐 줘.' : '한꺼번에 끊지 말라는 거지? 네 신호에 맞춰 볼게.'] } };
}
/** Move the existing NPC through an exit with the player; never duplicate or resurrect them. */
export function arriveTimeAllies(run: RunState, world: InteractionWorld, space: FieldSpace, from: string, exit: { x: number; y: number }) {
  const player = world.entities.player;
  if (!player?.pos) return;
  for (const npcId of TIME_ALLIES) {
    const ally = livingTimeAlly(run, npcId);
    if (!ally?.pos || ally.nodeId !== from || actionRestriction(ally) || actionRestriction(ally, true)) continue;
    const route = fieldPath(world, from, ally.pos, exit, ally.id);
    if (!route || route.length > 3) continue;
    const cells = space.tiles.flatMap((row, y) => row.map((_, x) => ({ x, y })))
      .filter(p => distance(p, player.pos!) <= 3 && walkable(world, space.id, p, ally.id) && !space.exits.some(e => distance(e.pos, p) === 0))
      .sort((a, b) => distance(a, player.pos!) - distance(b, player.pos!));
    if (!cells[0]) continue;
    ally.nodeId = player.nodeId; ally.pos = cells[0]; ally.fieldUpdatedAt = run.field!.elapsedSeconds;
    if (ally.routine) { ally.routine.travel = undefined; ally.routine.goal = ally.nodeId; }
  }
}
/** Allies share the same bodies, status restrictions and material damage as other residents. */
export function tickTimeAllies(run: RunState, world: InteractionWorld, blocked: ReadonlySet<string> = new Set()) {
  const player = world.entities.player, now = run.field?.elapsedSeconds ?? 0;
  if (!player?.pos || (player.properties.integrity ?? 0) <= 0 || run.ended) return;
  const threats = Object.values(world.entities).filter(e => e.nodeId === player.nodeId && e.creature &&
    (e.properties.integrity ?? 0) > 0 && (e.creature.rank !== 'boss' || e.creature.engaged));
  for (const npcId of TIME_ALLIES) {
    const ally = livingTimeAlly(run, npcId);
    if (!ally?.pos || ally.nodeId !== player.nodeId || blocked.has(ally.id) || actionRestriction(ally)) continue;
    if (distance(ally.pos, player.pos) > 2 && !actionRestriction(ally, true)) {
      const step = fieldPath(world, ally.nodeId, ally.pos, player.pos, ally.id, true)?.[0];
      if (step) ally.pos = step;
    }
    const state = run.timeStory!.allies[npcId]!;
    if (!threats.length || now - (state.supportAt ?? -120) < 120 || !hasSight(world, ally, player)) continue;
    if (npcId === 'npc-kumamimi') {
      for (const target of [player, ...TIME_ALLIES.map(id => livingTimeAlly(run, id)).filter((e): e is WorldEntity => !!e)])
        if (target.nodeId === ally.nodeId && target.pos && distance(target.pos, ally.pos) <= 3)
          influenceEntity(world, target, 'guard', Math.max(0, 20 - (target.properties.guard ?? 0)), ally.id);
      recordFact(world, { turn: world.turn, nodeId: ally.nodeId, actorId: ally.id, targetId: player.id, kind: 'signal', labor: 0, message: '던 · 버팀' });
    } else {
      const target = threats.find(e => e.pos && !status(e, 'ghost') && distance(e.pos, ally.pos!) <= 5 && hasSight(world, ally, e));
      if (!target) continue;
      const hp = target.properties.maxHp ?? target.creature!.maxHp;
      const resistance = (target.properties.hardness ?? 0) + (target.colors.iron ?? 0) / 20;
      influenceEntity(world, target, 'force', outgoingDamage(ally, 18, true) / hp * 100 + resistance, ally.id);
      if (status(player, 'anchored')) influenceEntity(world, player, 'status:anchored', -1, ally.id);
      recordFact(world, { turn: world.turn, nodeId: ally.nodeId, actorId: ally.id, targetId: target.id, kind: 'signal', labor: 0, message: '티프레 · 틈새의 번개' });
    }
    state.supportAt = now;
  }
}
/** Keep absence, death and physical presence separate from the chosen solution. */
export function snapshotTimeWitnesses(run: RunState, world: InteractionWorld): TimeEndingWitnesses {
  const anchor = Object.values(world.entities).find(e => e.creature?.definitionId === 'bs-act-1-anchor');
  const victoryNode = anchor?.nodeId ?? 'n-anchor-point';
  const snapshot = (npcId: string): TimeEndingWitness => {
    const actor = world.entities['npc:' + npcId];
    const joined = !!run.timeStory?.allies[npcId];
    if (!actor) return { state: 'unknown', joined };
    if ((actor.properties.integrity ?? 100) <= 0) return { state: 'dead', joined };
    return { state: actor.pos && !actor.carriedBy && !actor.routine?.travel && actor.nodeId === victoryNode ? 'present' : 'absent', joined };
  };
  return { dun: snapshot('npc-kumamimi'), tifre: snapshot('npc-toramimi') };
}
export function resolveTimeEnding(run: RunState, world: InteractionWorld) {
  if (run.timeStory?.ending || !run.bossesCleared.includes('bs-act-1-anchor')) return;
  const journey = run.field?.journey;
  if (!journey || !Array.from({ length: 20 }, (_, i) => 'time-' + String(i + 1).padStart(2, '0')).every(id => !!journey.completed[id])) return;
  const first = journey.decisions?.['time-13'], choice = journey.decisions?.['time-17'];
  if (!['dun', 'tifre'].includes(first ?? '')) return;
  run.timeStory ??= { version: 1, chaosEligible: false, allies: {} };
  const witnesses = snapshotTimeWitnesses(run, world);
  const lost = [witnesses.dun.state === 'dead' ? '던' : '', witnesses.tifre.state === 'dead' ? '티프레' : ''].filter(Boolean);
  const together = choice === 'both' && chaosStoryAvailable(run) && lost.length === 0;
  const side = choice === 'dun' || choice === 'tifre' ? choice : first;
  run.timeStory.ending = { id: together ? 'together' : side === 'dun' ? 'stillness' : 'severance', at: run.field!.elapsedSeconds,
    reason: choice === 'both' && !together ? (lost.length ? lost.join('과 ') + '의 빈자리가 남았다.' : '갈라진 시간에서 확인하지 못한 해법이었다.') : undefined,
    witnesses };
}
export function recordTimeEnding(run: RunState, meta: MetaProgress) {
  const ending = run.timeStory?.ending;
  if (!ending || !run.ended || run.endReason !== 'boss-cleared') return;
  const progress = meta.storyEndings ??= { seen: [], chaosUnlocked: false };
  if (!progress.seen.includes(ending.id)) progress.seen.push(ending.id);
  if (ending.id !== 'together') {
    progress.chaosUnlocked = true;
    if (!meta.unlockedChaosIds.includes(FRACTURED_TIME_CHAOS_ID)) meta.unlockedChaosIds.push(FRACTURED_TIME_CHAOS_ID);
  }
}
