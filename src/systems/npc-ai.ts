// npc-ai.ts — NPC AI 시스템
// 원본: Actor.cpp (OnTick, EvaluateActions, ExecuteAction)

import { Actor, ActionType } from '../models/actor';
import { World } from '../models/world';
import { SocialHub, MemoryType, Rumor, QuestStatus, QuestType } from '../models/social';
import { Backlog } from '../models/backlog';
import { GameTime } from '../types/game-time';
import { ItemType, Element, Weather, SpiritRole } from '../types/enums';
import { LocationID, Loc } from '../types/location';
import { locationName } from '../types/registry';
import { randomInt, randomFloat } from '../types/rng';
import { iGa, eulReul, euroRo, gwaWa } from '../data/josa';

export interface ActionCandidate {
  type: ActionType;
  score: number;
  targetLocation: LocationID;
  targetItem: ItemType;
  targetActor: string;
  targetQuestId: number;
  reason: string;
}

// ============================================================
// Helper functions
// ============================================================

function weightedRandomChoice(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = randomFloat(0, 1) * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function pickSocialLocation(role: SpiritRole): LocationID {
  switch (role) {
    case SpiritRole.GuildClerk:  return Loc.Guild_Hall;
    case SpiritRole.Merchant:    return Loc.Market_Square;
    case SpiritRole.Farmer:      return Loc.Farm;
    case SpiritRole.Miner:       return Loc.Mountain_Path;
    case SpiritRole.Fisher:      return Loc.Lake;
    case SpiritRole.Priest:      return Loc.Church;
    case SpiritRole.Adventurer:  return Loc.Tavern;
    default:                     return Loc.Tavern;
  }
}

function getRoleBonus(role: SpiritRole, action: ActionType): number {
  switch (role) {
    case SpiritRole.GuildClerk:
      if (action === ActionType.PostQuest || action === ActionType.CheckQuests) return 30;
      break;
    case SpiritRole.Merchant:
      if (action === ActionType.Trade_Buy || action === ActionType.Trade_Sell) return 25;
      break;
    case SpiritRole.Adventurer:
      if (action === ActionType.ExploreDungeon) return 30;
      break;
    case SpiritRole.Farmer:
      if (action === ActionType.Produce) return 30;
      break;
    case SpiritRole.Miner:
      if (action === ActionType.Produce) return 25;
      break;
    case SpiritRole.Fisher:
      if (action === ActionType.Produce) return 25;
      break;
    case SpiritRole.Priest:
      if (action === ActionType.Socialize) return 15;
      break;
  }
  return 0;
}

function getPreferredSleepHour(role: SpiritRole): number {
  switch (role) {
    case SpiritRole.Fisher:   return 19;
    case SpiritRole.Farmer:   return 20;
    case SpiritRole.Priest:   return 21;
    case SpiritRole.Merchant: return 22;
    case SpiritRole.Adventurer: return 23;
    default: return 22;
  }
}

function getPreferredWakeHour(role: SpiritRole): number {
  switch (role) {
    case SpiritRole.Fisher: return 4;
    case SpiritRole.Farmer: return 5;
    case SpiritRole.Priest: return 5;
    default: return 6;
  }
}

export function createRumor(
  content: string,
  importance: number,
  relatedElement: number,
  elementDelta: number,
): Rumor {
  return {
    content,
    originActor: '',
    createdAt: new GameTime(),
    spreadCount: 0,
    importance,
    relatedElement,
    elementDelta,
  };
}

// ============================================================
// evaluateActions
// ============================================================

export function evaluateActions(
  actor: Actor,
  world: World,
  time: GameTime,
  social: SocialHub,
  allActors: Actor[],
): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];
  const role = actor.spirit.role;
  const vigor = actor.base.vigor;
  const maxVigor = actor.base.maxVigor;
  const loc = actor.currentLocation;
  const color = actor.color.values;

  const isEvening = time.isEvening();
  const isNight = time.isNight();
  const isMorning = time.isMorning();
  const hour = time.hour;
  const sleepHour = getPreferredSleepHour(role);
  const wakeHour = getPreferredWakeHour(role);
  const nearBedtime = hour >= sleepHour - 1;
  const pastBedtime = hour >= sleepHour || (hour < wakeHour);
  const isTired = vigor < 40;
  const isExhausted = vigor < 20;

  function make(
    type: ActionType,
    score: number,
    opts: Partial<Omit<ActionCandidate, 'type' | 'score'>> = {},
  ): ActionCandidate {
    return {
      type,
      score,
      targetLocation: opts.targetLocation ?? '',
      targetItem: opts.targetItem ?? ItemType.Food,
      targetActor: opts.targetActor ?? '',
      targetQuestId: opts.targetQuestId ?? -1,
      reason: opts.reason ?? '',
    };
  }

  // 1. Moving to destination
  if (actor.moveDestination) {
    candidates.push(make(ActionType.GoToLocation, 80, {
      targetLocation: actor.moveDestination,
      reason: '이동 중',
    }));
  }

  // 2. Sleeping — evaluate WakeUp and return early
  if (actor.base.sleeping) {
    let wakeScore = 5;
    if (hour >= wakeHour) wakeScore += 50;
    if (hour >= wakeHour + 2) wakeScore += 30; // past wake hour by 2h → +80 total
    if (vigor > 50) wakeScore += 30;
    candidates.push(make(ActionType.WakeUp, wakeScore, { reason: '기상 시간' }));
    return candidates;
  }

  // 3. Sleep
  {
    let sleepScore = 5;
    if (nearBedtime) sleepScore += 30;
    if (pastBedtime) sleepScore += 80;
    if (hour === 0) sleepScore += 60; // midnight
    if (isTired) sleepScore += 30;
    if (isExhausted) sleepScore += 30; // exhausted gives extra 60 total
    candidates.push(make(ActionType.Sleep, sleepScore, { reason: '취침' }));
  }

  // 4. GoHome (near bedtime, not at home)
  if (nearBedtime && loc !== actor.homeLocation) {
    let goHomeScore = 60;
    if (isTired) goHomeScore += 20;
    candidates.push(make(ActionType.GoToLocation, goHomeScore, {
      targetLocation: actor.homeLocation,
      reason: '귀가',
    }));
  }

  // 5. Eat
  {
    const vigorRatio = vigor / maxVigor;
    let eatScore = (1 - vigorRatio) * 80;
    if (vigor < 15) eatScore += 50; // starving
    const hasFood = (actor.spirit.inventory.get(ItemType.Food) ?? 0) > 0;
    if (!hasFood) eatScore *= 0.3;
    candidates.push(make(ActionType.Eat, eatScore, { targetItem: ItemType.Food, reason: '식사' }));
  }

  // 6. Rest
  {
    const vigorRatio = vigor / maxVigor;
    let restScore = (1 - vigorRatio) * 60;
    if (isTired) restScore += 40;
    if (isNight) restScore += 20;
    candidates.push(make(ActionType.Rest, restScore, { reason: '휴식' }));
  }

  // 7. Idle
  candidates.push(make(ActionType.Idle, 5, { reason: '대기' }));

  // 8. Socialize
  {
    let socialScore = 15;
    if (isEvening) socialScore += 15;
    socialScore += (color[Element.Water] ?? 0) * 10;
    candidates.push(make(ActionType.Socialize, socialScore, {
      targetLocation: pickSocialLocation(role),
      reason: '교류',
    }));
  }

  // 9. ShareRumor
  if (actor.memories.length > 0) {
    let rumorScore = 10;
    if (isEvening) rumorScore += 10;
    rumorScore += (color[Element.Wind] ?? 0) * 8;
    const sawHoarding = actor.memories.some(
      m => m.type === MemoryType.SawHoarding || m.type === MemoryType.SawPriceGouging,
    );
    if (sawHoarding) rumorScore += 25;
    candidates.push(make(ActionType.ShareRumor, rumorScore, { reason: '소문 공유' }));
  }

  // 10. Trade_Buy
  {
    const hungry = vigor < 40;
    const hasFood = (actor.spirit.inventory.get(ItemType.Food) ?? 0) > 0;
    let buyScore = 10;
    if (hungry && !hasFood) buyScore += 60;
    buyScore += getRoleBonus(role, ActionType.Trade_Buy);
    candidates.push(make(ActionType.Trade_Buy, buyScore, {
      targetLocation: Loc.Market_Square,
      reason: '구매',
    }));
  }

  // 11. Trade_Sell
  {
    let totalItems = 0;
    for (const [, count] of actor.spirit.inventory) totalItems += count;
    let sellScore = 5;
    if (totalItems > 5) sellScore += 20;
    sellScore += getRoleBonus(role, ActionType.Trade_Sell);
    candidates.push(make(ActionType.Trade_Sell, sellScore, {
      targetLocation: Loc.Market_Square,
      reason: '판매',
    }));
  }

  // 12. ExploreDungeon
  {
    let dungeonScore = 10;
    dungeonScore += getRoleBonus(role, ActionType.ExploreDungeon);
    if (isTired) dungeonScore *= 0.2;
    else if (isNight) dungeonScore *= 0.5;
    const hasActiveQuest = actor.spirit.activeQuestId >= 0;
    if (hasActiveQuest) dungeonScore += 35;
    candidates.push(make(ActionType.ExploreDungeon, dungeonScore, {
      targetLocation: Loc.Dungeon_Entrance,
      reason: '던전 탐험',
    }));
  }

  // 13. PostQuest (at Guild_Hall)
  if (loc === Loc.Guild_Hall) {
    let postScore = 5;
    postScore += getRoleBonus(role, ActionType.PostQuest);
    if (isMorning) postScore += 15;
    if (actor.spirit.questsPosted < 3) postScore += 20;
    candidates.push(make(ActionType.PostQuest, postScore, { reason: '퀘스트 게시' }));
  }

  // 14. CheckQuests / AcceptQuest (at Guild_Hall)
  if (loc === Loc.Guild_Hall) {
    let checkScore = 10;
    if (actor.spirit.activeQuestId < 0) checkScore += 20;
    candidates.push(make(ActionType.CheckQuests, checkScore, { reason: '퀘스트 확인' }));

    const available = social.getAvailableQuests();
    for (const q of available) {
      const acceptScore = 15 + q.rewardGold * 0.3;
      candidates.push(make(ActionType.AcceptQuest, acceptScore, {
        targetQuestId: q.id,
        reason: `퀘스트 수락: ${q.title}`,
      }));
    }
  }

  // 15. Produce
  {
    const recipes = world.getProductionRecipes(loc);
    if (recipes.length > 0) {
      let produceScore = 10;
      produceScore += getRoleBonus(role, ActionType.Produce);
      produceScore += 20; // has recipes at location
      candidates.push(make(ActionType.Produce, produceScore, { reason: '생산' }));
    }
  }

  // Apply crowd penalty
  for (const c of candidates) {
    if (!c.targetLocation || c.targetLocation === loc) continue;
    const count = allActors.filter(a => a.currentLocation === c.targetLocation).length;
    if (count >= 14) c.score *= 0.05;
    else if (count >= 10) c.score *= 0.4;
    else if (count >= 7) c.score *= 0.7;
  }

  return candidates;
}

// ============================================================
// executeAction
// ============================================================

export function executeAction(
  actor: Actor,
  action: ActionCandidate,
  world: World,
  log: Backlog,
  time: GameTime,
  social: SocialHub,
  allActors: Actor[],
): void {
  const name = actor.name;
  const loc = actor.currentLocation;

  switch (action.type) {
    case ActionType.Sleep: {
      if (loc === actor.homeLocation || loc === Loc.Tavern) {
        actor.base.sleeping = true;
        actor.actionCooldown = 10;
        log.add(time, `${name}이${iGa(name)} 잠자리에 들었다.`, '행동', name, loc);
      } else {
        const next = world.getNextStep(loc, actor.homeLocation, time.day);
        if (next) actor.currentLocation = next;
      }
      break;
    }

    case ActionType.WakeUp: {
      actor.base.sleeping = false;
      log.add(time, `${name}이${iGa(name)} 일어났다.`, '행동', name, loc);
      break;
    }

    case ActionType.Eat: {
      const hasFood = actor.consumeItem(ItemType.Food, 1);
      if (hasFood) {
        actor.adjustVigor(40);
        actor.adjustMood(0.05);
        log.add(time, `${name}이${iGa(name)} 식사했다.`, '행동', name, loc);
      } else {
        actor.addMemory({
          type: MemoryType.WentHungry,
          subject: name,
          detail: '먹을 것이 없어 굶었다.',
          when: time.clone(),
          emotionalWeight: -0.5,
        });
      }
      break;
    }

    case ActionType.Rest: {
      actor.adjustVigor(30);
      actor.adjustMood(0.03);
      actor.actionCooldown = 3;
      log.add(time, `${name}이${iGa(name)} 휴식을 취했다.`, '행동', name, loc);
      break;
    }

    case ActionType.GoToLocation: {
      const dest = action.targetLocation;
      if (!dest) break;
      if (loc === dest) {
        actor.moveDestination = '';
        break;
      }
      const next = world.getNextStep(loc, dest, time.day);
      if (next && next !== loc) {
        actor.currentLocation = next;
        if (next === dest) {
          actor.moveDestination = '';
          log.add(time, `${name}이${iGa(name)} ${locationName(dest)}에 도착했다.`, '행동', name, next);
        } else {
          log.add(time, `${name}이${iGa(name)} ${locationName(dest)}${euroRo(locationName(dest))} 이동 중이다.`, '행동', name, next);
        }
      }
      break;
    }

    case ActionType.Idle:
      break;

    case ActionType.Socialize: {
      const others = allActors.filter(a => a.name !== name && a.currentLocation === loc && !a.base.sleeping);
      if (others.length === 0) break;
      const target = others[randomInt(0, others.length - 1)];
      actor.adjustRelationship(target.name, 0.03, 0.05);
      target.adjustRelationship(name, 0.03, 0.05);
      actor.addMemory({
        type: MemoryType.TalkedWith,
        subject: target.name,
        detail: `${target.name}${gwaWa(target.name)} 대화했다.`,
        when: time.clone(),
        emotionalWeight: 0.2,
      });
      log.add(time, `${name}이${iGa(name)} ${target.name}${gwaWa(target.name)} 교류했다.`, '행동', name, loc);
      break;
    }

    case ActionType.ShareRumor: {
      if (actor.memories.length === 0) break;
      const interesting = actor.memories.filter(m => Math.abs(m.emotionalWeight) >= 0.3);
      const mem = interesting.length > 0
        ? interesting[interesting.length - 1]
        : actor.memories[actor.memories.length - 1];
      const rumor = createRumor(mem.detail, Math.abs(mem.emotionalWeight), -1, 0);
      rumor.originActor = name;
      rumor.createdAt = time.clone();
      social.addRumor(rumor);
      log.add(time, `${name}이${iGa(name)} 소문을 퍼뜨렸다: ${mem.detail}`, '행동', name, loc);
      break;
    }

    case ActionType.Trade_Buy: {
      if (loc !== Loc.Market_Square) {
        const next = world.getNextStep(loc, Loc.Market_Square, time.day);
        if (next) actor.currentLocation = next;
        break;
      }
      // Buy cheapest available item
      let cheapestItem: ItemType = ItemType.Food;
      let cheapestPrice = Infinity;
      for (let i = 0; i < ItemType.Count; i++) {
        const price = world.getPrice(i as ItemType);
        if (price < cheapestPrice && actor.spirit.gold >= price) {
          cheapestPrice = price;
          cheapestItem = i as ItemType;
        }
      }
      if (actor.spirit.gold >= cheapestPrice && cheapestPrice < Infinity) {
        actor.addGold(-cheapestPrice);
        actor.addItem(cheapestItem, 1);
        world.adjustSupply(cheapestItem, -0.05);
        log.add(time, `${name}이${iGa(name)} 시장에서 아이템을 구매했다.`, '거래', name, loc);
      }
      break;
    }

    case ActionType.Trade_Sell: {
      if (loc !== Loc.Market_Square) {
        const next = world.getNextStep(loc, Loc.Market_Square, time.day);
        if (next) actor.currentLocation = next;
        break;
      }
      // Sell most valuable item
      let bestItem: ItemType | null = null;
      let bestPrice = 0;
      for (const [item, count] of actor.spirit.inventory) {
        if (count <= 0) continue;
        const price = world.getPrice(item);
        if (price > bestPrice) {
          bestPrice = price;
          bestItem = item;
        }
      }
      if (bestItem !== null && bestPrice > 0) {
        actor.consumeItem(bestItem, 1);
        actor.addGold(bestPrice);
        world.adjustSupply(bestItem, 0.05);
        log.add(time, `${name}이${iGa(name)} 시장에서 아이템을 판매했다.`, '거래', name, loc);
      }
      break;
    }

    case ActionType.ExploreDungeon: {
      const nearDungeon = loc === Loc.Dungeon_Entrance || loc === Loc.Dungeon_Interior || loc === Loc.Wilderness;
      if (!nearDungeon) {
        const next = world.getNextStep(loc, Loc.Wilderness, time.day);
        if (next) actor.currentLocation = next;
        break;
      }
      actor.adjustVigor(-25);
      const attackRoll = randomFloat(0, 1);
      const successThreshold = 0.4 + (actor.base.attack / 100) * 0.2;
      if (attackRoll >= successThreshold) {
        // Fail
        actor.adjustHp(-15);
        actor.addMemory({
          type: MemoryType.DungeonFail,
          subject: '던전',
          detail: '던전 탐험에서 부상을 입었다.',
          when: time.clone(),
          emotionalWeight: -0.4,
        });
        log.add(time, `${name}이${iGa(name)} 던전 탐험에서 부상을 입었다.`, '행동', name, loc);
      } else {
        // Success
        const lootCount = randomInt(1, 3);
        actor.addItem(ItemType.MonsterLoot, lootCount);
        const oreCount = randomInt(0, 2);
        if (oreCount > 0) actor.addItem(ItemType.OreCommon, oreCount);
        if (randomFloat(0, 1) < 0.1) actor.addItem(ItemType.OreRare, 1);
        actor.spirit.dungeonsCleared++;
        actor.addMemory({
          type: MemoryType.DungeonSuccess,
          subject: '던전',
          detail: `던전 탐험에 성공해 전리품을 얻었다.`,
          when: time.clone(),
          emotionalWeight: 0.5,
        });
        log.add(time, `${name}이${iGa(name)} 던전 탐험에 성공했다.`, '행동', name, loc);
      }
      actor.actionCooldown = 5;
      break;
    }

    case ActionType.PostQuest: {
      const questType = randomFloat(0, 1) < 0.5 ? QuestType.MonsterHunt : QuestType.GatherHerb;
      const reward = randomInt(20, 80);
      const deadline = time.clone();
      deadline.advance(60 * 24 * 3); // 3 days
      const newQuest = {
        id: 0,
        type: questType,
        title: questType === QuestType.MonsterHunt ? '몬스터 토벌' : '약초 수집',
        description: questType === QuestType.MonsterHunt ? '몬스터를 처치해 달라.' : '약초를 수집해 달라.',
        postedBy: name,
        acceptedBy: '',
        status: QuestStatus.Posted,
        postedAt: time.clone(),
        deadline,
        targetItem: questType === QuestType.MonsterHunt ? ItemType.MonsterLoot : ItemType.Herb,
        targetAmount: randomInt(1, 5),
        currentAmount: 0,
        rewardGold: reward,
        rewardReputation: 1,
      };
      social.postQuest(newQuest);
      actor.spirit.questsPosted++;
      log.add(time, `${name}이${iGa(name)} 퀘스트를 게시했다.`, '행동', name, loc);
      break;
    }

    case ActionType.CheckQuests: {
      log.add(time, `${name}이${iGa(name)} 퀘스트 게시판을 확인했다.`, '행동', name, loc);
      break;
    }

    case ActionType.AcceptQuest: {
      const qid = action.targetQuestId;
      if (qid >= 0 && social.acceptQuest(qid, name)) {
        actor.spirit.activeQuestId = qid;
        log.add(time, `${name}이${iGa(name)} 퀘스트를 수락했다.`, '행동', name, loc);
      }
      break;
    }

    case ActionType.Produce: {
      const recipes = world.getProductionRecipes(loc);
      if (recipes.length === 0) break;
      const recipe = recipes[0];
      // Check inputs
      for (const [item, amount] of recipe.inputs) {
        if ((actor.spirit.inventory.get(item) ?? 0) < amount) return;
      }
      // Consume inputs
      for (const [item, amount] of recipe.inputs) {
        actor.consumeItem(item, amount);
      }
      // Produce outputs
      for (const [item, amount] of recipe.outputs) {
        actor.addItem(item, amount);
      }
      actor.adjustVigor(-recipe.vigorCost);
      actor.addMemory({
        type: MemoryType.Produced,
        subject: recipe.name,
        detail: `${recipe.name}${eulReul(recipe.name)} 생산했다.`,
        when: time.clone(),
        emotionalWeight: 0.2,
      });
      log.add(time, `${name}이${iGa(name)} ${recipe.name}${eulReul(recipe.name)} 생산했다.`, '행동', name, loc);
      break;
    }

    default:
      break;
  }
}

// ============================================================
// npcOnTick
// ============================================================

export function npcOnTick(
  actor: Actor,
  time: GameTime,
  world: World,
  log: Backlog,
  social: SocialHub,
  allActors: Actor[],
  minutesElapsed: number,
): void {
  if (!actor.isAlive()) return;

  const factor = minutesElapsed / 5;

  // Update vigor
  actor.adjustVigor(-0.12 * factor);
  if (actor.base.vigor < 10) {
    actor.adjustHp(-0.3 * factor);
  }

  // Weather/mood effects
  const weather = world.weather;
  if (weather === Weather.Storm) {
    actor.adjustMood(-0.01 * factor);
  } else if (weather === Weather.Rain || weather === Weather.Snow) {
    actor.adjustMood(-0.003 * factor);
  } else if (weather === Weather.Clear) {
    actor.adjustMood(0.003 * factor);
  }

  // If sleeping: check wake condition
  if (actor.base.sleeping) {
    const wakeHour = getPreferredWakeHour(actor.spirit.role);
    if (time.hour >= wakeHour && actor.base.vigor > 50) {
      actor.base.sleeping = false;
    }
    return;
  }

  // Cooldown
  if (actor.actionCooldown > 0) {
    actor.actionCooldown--;
    return;
  }

  // Evaluate and execute
  const candidates = evaluateActions(actor, world, time, social, allActors);
  if (candidates.length === 0) return;

  const weights = candidates.map(c => c.score * c.score);
  const chosen = weightedRandomChoice(weights);
  executeAction(actor, candidates[chosen], world, log, time, social, allActors);
}
