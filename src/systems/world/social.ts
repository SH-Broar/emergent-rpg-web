import type { InteractionAction, InteractionWorld, SocialProfile, WorldEntity, WorldFact } from './types';
import { PLAYER_ACTOR_ID } from './types';
import { isFoodResource } from './resources';
import { interactionDisabled, observeWorld, resolveInteraction } from './engine';

type Norms = SocialProfile['norms'];
export interface SocialProfileOptions {
  homeNodeId: string;
  turn?: number;
  values?: Partial<SocialProfile['values']>;
  needs?: Partial<SocialProfile['needs']>;
  norms?: Partial<Norms>;
  skills?: Record<string, number>;
  normScopes?: SocialProfile['normScopes'];
}
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));

/** Species describes a body. A profession supplies learned skills, never moral alignment. */
export function createSocialProfile(species: string, profession: string, options: SocialProfileOptions): SocialProfile {
  const skills: Record<string, Record<string, number>> = {
    grower: { work: .55, cultivation: .9, renewable: .8, irrigation: .7, food: .8 },
    artisan: { work: .9, workshop: 1, irrigation: .8, crafting: 1 },
    researcher: { work: .4, observation: 1, cultivation: .5 },
    traveler: { work: .35, path: .7, travel: .9 },
  };
  // Replaceable starting outlooks describe this practice, not immutable profession or species ethics.
  const outlook: Record<string, { values: Partial<SocialProfile['values']>; norms: Partial<Norms> }> = {
    grower: { values: { sharing: .85, labor: .7 }, norms: { foodSharing: .95, laborRespect: .75 } },
    artisan: { values: { labor: .9, curiosity: .6 }, norms: { foodSharing: .85, laborRespect: .95 } },
    researcher: { values: { curiosity: .9 }, norms: { harmAversion: .85 } },
    traveler: { values: { sharing: .65, curiosity: .8 }, norms: { foodSharing: .95 } },
  };
  return {
    species, profession,
    values: { sharing: .7, labor: .75, safety: .7, curiosity: .55, ...outlook[profession]?.values, ...options.values },
    needs: { food: .25, work: .55, rest: .1, curiosity: .4, ...options.needs },
    skills: { ...(skills[profession] ?? skills.traveler), ...options.skills },
    norms: { foodSharing: .9, laborRespect: .8, harmAversion: .8, ...outlook[profession]?.norms, ...options.norms },
    normScopes: { region: { foodSharing: .95, laborRespect: .7, harmAversion: .8 }, ...options.normScopes },
    relations: {}, beliefs: [], homeNodeId: options.homeNodeId,
    nextActionTurn: (options.turn ?? 0) + 1,
  };
}

function marker(world: InteractionWorld, prefix: string): number {
  const value = world.receipts.find(r => r.startsWith(prefix));
  return value ? Number(value.slice(prefix.length)) || 0 : 0;
}
function mark(world: InteractionWorld, prefix: string, value: number): void {
  world.receipts = world.receipts.filter(r => !r.startsWith(prefix));
  world.receipts.push(prefix + value);
}

/** Local convention, association practice and individual judgment can disagree. */
export function effectiveNorms(profile: SocialProfile): Norms {
  const result = { ...profile.norms };
  for (const key of Object.keys(result) as (keyof Norms)[]) {
    let total = (profile.normScopes?.individual?.[key] ?? profile.norms[key]) * .5;
    let weight = .5;
    for (const [scope, importance] of [['region', .2], ['guild', .3], ['culture', .3]] as const) {
      const value = profile.normScopes?.[scope]?.[key];
      if (value !== undefined) { total += value * importance; weight += importance; }
    }
    result[key] = clamp(total / weight);
  }
  return result;
}

function interpretation(profile: SocialProfile, fact: WorldFact, target: WorldEntity | undefined): { delta: number; text: string } {
  const norms = effectiveNorms(profile);
  const tags = fact.targetTags ?? target?.tags ?? [];
  const ownedByOther = !!fact.ownerId && fact.ownerId !== fact.actorId;
  if (fact.kind === 'transfer' && (fact.after ?? 0) < (fact.before ?? 0)) {
    if (!ownedByOther || tags.includes('shared')) return { delta: 0, text: '공유 자원을 가져감: 제재할 사유로 보지 않는다.' };
    const food = fact.resourceTags ? fact.resourceTags.includes('food') : tags.includes('food');
    const labor = clamp(fact.labor / 100);
    const cost = food ? (1 - norms.foodSharing) * .06 : norms.laborRespect * (.04 + labor * .2);
    return { delta: -cost, text: food ? '식량을 나누는 관행을 고려해 가볍게 받아들인다.' : '다른 이가 들인 가공 노동과 소유를 무시했다고 여긴다.' };
  }
  if (fact.kind === 'transfer' && (fact.after ?? 0) > (fact.before ?? 0) && fact.ownerId !== fact.actorId) {
    return (fact.before ?? 0) >= 2
      ? { delta: 0, text: '이미 충분한 재고에 보탰다. 추가적인 호의로 과장하지 않는다.' }
      : { delta: .04 * profile.values.sharing, text: '부족한 자원을 보탠 행동을 호의로 기억한다.' };
  }
  if (fact.kind === 'property' && fact.property === 'integrity' && (fact.after ?? 0) < (fact.before ?? 0) && ownedByOther) {
    return { delta: -.18 * norms.harmAversion, text: '시설이나 남의 물건을 훼손한 장면을 우려한다.' };
  }
  if (fact.kind === 'property' && fact.property === 'burning' && (fact.after ?? 0) > (fact.before ?? 0) && ownedByOther) {
    return { delta: -.08 * norms.harmAversion, text: '남의 시설에 불을 붙여 위험을 만들었다고 본다.' };
  }
  if (fact.kind === 'work' && fact.ownerId !== fact.actorId) {
    return { delta: .025 * norms.laborRespect, text: '공용 작업에 들인 노동을 인정한다.' };
  }
  return { delta: 0, text: '행동을 관찰했다. 가치 판단을 단정하지 않는다.' };
}

/** Each witness interprets once. Relayed reports retain the original fact and lower confidence. */
export function processSocialFacts(world: InteractionWorld): void {
  const facts = [...world.events].sort((a, b) => a.id - b.id);
  for (const observer of Object.values(world.entities).filter(e => e.agent).sort((a, b) => a.id.localeCompare(b.id))) {
    const profile = observer.agent!;
    const prefix = 'social-observed:' + observer.id + ':';
    const cursor = marker(world, prefix);
    for (const fact of facts) {
      if (fact.id <= cursor || !fact.witnesses.includes(observer.id) || fact.actorId === observer.id) continue;
      let evidence = fact;
      let confidence = 1;
      if (fact.sourceFactId !== undefined) {
        // Read only the sender's recorded knowledge, never hidden ground truth.
        const reported = world.knowledge[fact.actorId ?? '']?.facts.find(f => f.id === fact.sourceFactId || f.sourceFactId === fact.sourceFactId);
        if (!reported) continue;
        evidence = reported;
        confidence = reported.witnesses.includes(fact.actorId ?? '') ? .55 : .3;
      }
      const originId = evidence.sourceFactId ?? evidence.id;
      const prior = profile.beliefs.find(b => b.factId === originId);
      if (prior && prior.confidence >= confidence) continue;
      // Use an observed target snapshot: later travel must not reveal ownership retroactively.
      const known = world.knowledge[observer.id]?.targets[evidence.targetId];
      const target = known ? { ...known, stock: known.stock } as WorldEntity : undefined;
      const reading = interpretation(profile, evidence, target);
      let delta = reading.delta;
      if (prior) {
        // Better evidence strengthens the same judgment; it never books another gift.
        delta = prior.confidence > 0 ? prior.trustDelta / prior.confidence : 0;
      } else if (evidence.kind === 'transfer' && evidence.resourceId && evidence.actorId) {
        const key = observer.id + ':' + evidence.actorId + ':' + evidence.targetId + ':' + evidence.resourceId + ':';
        const balanceKey = 'social-gift-balance:' + key;
        const highKey = 'social-gift-high:' + key;
        const change = (evidence.after ?? 0) - (evidence.before ?? 0);
        const beforeBalance = marker(world, balanceKey);
        const high = marker(world, highKey);
        const balance = beforeBalance + change;
        mark(world, balanceKey, balance);
        mark(world, highKey, Math.max(high, balance));
        if (delta > 0 && change > 0) delta *= clamp((balance - high) / change);
      }
      const totalDelta = delta * confidence;
      const incrementalDelta = totalDelta - (prior?.trustDelta ?? 0);
      if (evidence.actorId && evidence.actorId !== observer.id) {
        const relation = profile.relations[evidence.actorId] ??= { trust: 0, regard: 0 };
        relation.trust = clamp(relation.trust + incrementalDelta, -1, 1);
        relation.regard = clamp(relation.regard + incrementalDelta * .5, -1, 1);
      }
      const belief = { factId: originId, subjectId: evidence.actorId, confidence, interpretation: (confidence < 1 ? '전해 들음 · ' : '직접 목격 · ') + reading.text, trustDelta: totalDelta };
      if (prior) Object.assign(prior, belief);
      else profile.beliefs.push(belief);
    }
    // Keep evidence with its once-applied delta for save-safe rumor deduplication.
    if (facts.length) mark(world, prefix, facts[facts.length - 1]!.id);
  }
}

export interface ScoredSocialAction { targetId: string; action: InteractionAction; score: number }

function scoreAction(actor: WorldEntity, target: WorldEntity, action: InteractionAction): number {
  const p = actor.agent!;
  const norms = effectiveNorms(p);
  const u = action.utility;
  if (!u) return 0;
  const skill = Math.max(p.skills.work ?? .25, ...target.tags.map(tag => p.skills[tag] ?? 0));
  let score = (u.food ?? 0) * p.needs.food
    + (u.work ?? 0) * p.needs.work * p.values.labor * (.5 + skill)
    + (u.rest ?? 0) * p.needs.rest
    + (u.curiosity ?? 0) * p.needs.curiosity * p.values.curiosity
    + (u.safety ?? 0) * p.values.safety * clamp((6 - (target.properties.safety ?? 2)) / 6)
    + (u.sharing ?? 0) * p.values.sharing;
  const heldFood = Object.entries(actor.stock).reduce((total, [id, quantity]) => total + (isFoodResource(id) ? Math.max(0, quantity) : 0), 0);
  // Provisioning has value only while supplies are needed. Gifts cost the giver real reserves.
  for (const effect of action.effects) {
    if (effect.kind !== 'transfer') continue;
    if (effect.from === 'target' && isFoodResource(effect.resourceId) && heldFood + effect.quantity > 2) {
      const excess = heldFood + effect.quantity - 2;
      score -= (u.food ?? 0) * Math.min(1, excess / 2);
    }
    if (effect.from === 'actor') {
      if (isFoodResource(effect.resourceId) && heldFood <= 1) score -= p.needs.food + .25;
      if ((target.stock[effect.resourceId] ?? 0) >= 3) score -= (u.sharing ?? 0) * .9;
    }
  }
  const owner = target.ownerId;
  const relation = owner ? p.relations[owner]?.trust ?? 0 : 0;
  if (owner && owner !== actor.id) {
    for (const effect of action.effects) {
      if (effect.kind === 'transfer' && effect.from === 'target' && !target.tags.includes('shared')) {
        score -= isFoodResource(effect.resourceId) ? (1 - norms.foodSharing) * .1 : norms.laborRespect * (.2 + clamp((target.labor ?? 0) / 100));
      }
      if (effect.kind === 'influence' && effect.property === 'integrity' && effect.amount < 0) score -= norms.harmAversion;
    }
    score += (u.sharing ?? 0) * relation * .2;
  }
  // Longer labor remains feasible but carries the same time cost as a player action.
  return score / Math.sqrt(Math.max(1, action.duration));
}

/** Candidate targets come only from this actor's remembered observations. */
export function rankSocialActions(world: InteractionWorld, actorId: string, actionsFor: (actorId: string, targetId: string) => InteractionAction[]): ScoredSocialAction[] {
  const actor = world.entities[actorId];
  if (!actor?.agent) return [];
  const known = world.knowledge[actorId]?.targets ?? {};
  const candidates: ScoredSocialAction[] = [];
  for (const observed of Object.values(known).sort((a, b) => a.id.localeCompare(b.id))) {
    const target = { ...observed, stock: observed.stock } as WorldEntity;
    for (const action of actionsFor(actorId, target.id)) {
      if (interactionDisabled(world, actorId, target.id, action)) continue;
      const score = scoreAction(actor, target, action);
      if (score > .015) candidates.push({ targetId: target.id, action, score });
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.targetId.localeCompare(b.targetId) || a.action.id.localeCompare(b.action.id));
}

/** One utility choice when free; no profession order, named action, or production cycle. */
export function tickSocialAgents(world: InteractionWorld, turn: number, actionsFor: (actorId: string, targetId: string) => InteractionAction[]): void {
  for (const actor of Object.values(world.entities).filter(e => e.agent).sort((a, b) => a.id.localeCompare(b.id))) {
    const p = actor.agent!;
    const prefix = 'social-clock:' + actor.id + ':';
    const previous = marker(world, prefix);
    if (previous >= turn) continue;
    const elapsed = Math.max(1, turn - Math.max(previous, p.nextActionTurn - 1));
    mark(world, prefix, turn);
    p.needs.food = clamp(p.needs.food + .012 * elapsed);
    p.needs.work = clamp(p.needs.work + .035 * elapsed);
    p.needs.rest = clamp(p.needs.rest + .008 * elapsed);
    p.needs.curiosity = clamp(p.needs.curiosity + .018 * elapsed);
    if (actor.id === PLAYER_ACTOR_ID || p.nextActionTurn > turn) continue;
    observeWorld(world, actor.id);
    const choice = rankSocialActions(world, actor.id, actionsFor)[0];
    if (!choice) { p.nextActionTurn = turn + 1; continue; }
    const result = resolveInteraction(world, actor.id, choice.targetId, choice.action);
    p.nextActionTurn = turn + Math.max(1, result.duration);
    if (!result.ok) continue;
    processSocialFacts(world);
  }
}
