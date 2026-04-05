// npc-ai.ts — NPC AI 시스템
// 원본: Actor.cpp (OnTick, EvaluateActions, ExecuteAction)

import { Actor, ActionType } from '../models/actor';
import { World } from '../models/world';
import { SocialHub, MemoryType, Rumor, QuestStatus, QuestType } from '../models/social';
import { Backlog } from '../models/backlog';
import { GameTime } from '../types/game-time';
import { ItemType, Element, SpiritRole, Race, DayOfWeek } from '../types/enums';
import { LocationID, Loc } from '../types/location';
import { locationName } from '../types/registry';
import { randomInt, randomFloat } from '../types/rng';
import { iGa, eulReul, euroRo, gwaWa } from '../data/josa';
import { getWeatherEffect, isOutdoorLocation } from './weather';
import { ColorChangeContext } from '../models/color';

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

function getPreferredSleepHour(role: SpiritRole, actor?: Actor): number {
  let base: number;
  switch (role) {
    case SpiritRole.Fisher:     base = 19; break;
    case SpiritRole.Farmer:     base = 20; break;
    case SpiritRole.Priest:     base = 21; break;
    case SpiritRole.Merchant:   base = 22; break;
    case SpiritRole.Adventurer: base = 23; break;
    default:                    base = 22; break;
  }
  if (actor) {
    const c = actor.color.values;
    base += (c[Element.Fire]  ?? 0) * 0.02
          + (c[Element.Dark]  ?? 0) * 0.03
          - (c[Element.Light] ?? 0) * 0.02;
    base = Math.max(20, Math.min(24, base));
  }
  return Math.round(base);
}

function getPreferredWakeHour(role: SpiritRole, actor?: Actor): number {
  let base: number;
  switch (role) {
    case SpiritRole.Fisher: base = 4; break;
    case SpiritRole.Farmer: base = 5; break;
    case SpiritRole.Priest: base = 5; break;
    default:                base = 6; break;
  }
  if (actor) {
    const c = actor.color.values;
    base -= (c[Element.Fire]  ?? 0) * 0.01;
    base += (c[Element.Dark]  ?? 0) * 0.02;
    base -= (c[Element.Light] ?? 0) * 0.02;
    base = Math.max(5, Math.min(9, base));
  }
  return Math.round(base);
}

// ============================================================
// Daily Schedule system
// ============================================================

// 0=Morning(6-12), 1=Afternoon(12-18), 2=Evening(18-22), 3=Night
type TimePeriod = 0 | 1 | 2 | 3;

function getTimePeriod(hour: number): TimePeriod {
  if (hour >= 6 && hour < 12) return 0;   // Morning
  if (hour >= 12 && hour < 18) return 1;  // Afternoon
  if (hour >= 18 && hour < 22) return 2;  // Evening
  return 3;                                // Night
}

interface ScheduleEntry {
  location: LocationID;
  bonuses: Partial<Record<ActionType, number>>;
}

// Indexed by SpiritRole (numeric) → array of 4 entries [Morning, Afternoon, Evening, Night]
const DAILY_SCHEDULE: Record<number, ScheduleEntry[]> = {
  [SpiritRole.GuildClerk]: [
    { location: Loc.Guild_Hall,    bonuses: { [ActionType.PostQuest]: 1.5 } },
    { location: Loc.Guild_Hall,    bonuses: { [ActionType.Socialize]: 1.2 } },
    { location: Loc.Tavern,        bonuses: { [ActionType.Socialize]: 1.3 } },
    { location: Loc.Town_Elimes,   bonuses: {} },
  ],
  [SpiritRole.Adventurer]: [
    { location: Loc.Guild_Hall,    bonuses: { [ActionType.CheckQuests]: 1.5 } },
    { location: Loc.Dungeon_Entrance, bonuses: { [ActionType.ExploreDungeon]: 1.5 } },
    { location: Loc.Tavern,        bonuses: { [ActionType.Socialize]: 1.4, [ActionType.ShareRumor]: 1.3 } },
    { location: Loc.Tavern,        bonuses: {} },
  ],
  [SpiritRole.Merchant]: [
    { location: Loc.Market_Square, bonuses: { [ActionType.Trade_Buy]: 1.4 } },
    { location: Loc.Market_Square, bonuses: { [ActionType.Trade_Sell]: 1.5 } },
    { location: Loc.Tavern,        bonuses: { [ActionType.Socialize]: 1.2 } },
    { location: Loc.Town_Elimes,   bonuses: {} },
  ],
  [SpiritRole.Farmer]: [
    { location: Loc.Farm,          bonuses: { [ActionType.Produce]: 1.5 } },
    { location: Loc.Farm,          bonuses: { [ActionType.Produce]: 1.3 } },
    { location: Loc.Town_Elimes,   bonuses: { [ActionType.Socialize]: 1.3 } },
    { location: Loc.Farm,          bonuses: {} },
  ],
  [SpiritRole.Guard]: [
    { location: Loc.Town_Elimes,   bonuses: { [ActionType.CooperateWork]: 1.3 } },
    { location: Loc.Wilderness,    bonuses: { [ActionType.ExploreDungeon]: 1.3 } },
    { location: Loc.Town_Elimes,   bonuses: { [ActionType.Socialize]: 1.2 } },
    { location: Loc.Town_Elimes,   bonuses: {} },
  ],
  [SpiritRole.Villager]: [
    { location: Loc.Town_Elimes,   bonuses: {} },
    { location: Loc.Market_Square, bonuses: { [ActionType.Trade_Buy]: 1.2 } },
    { location: Loc.Town_Elimes,   bonuses: { [ActionType.Socialize]: 1.3 } },
    { location: Loc.Town_Elimes,   bonuses: {} },
  ],
  [SpiritRole.Meteorologist]: [
    { location: Loc.Wilderness,    bonuses: { [ActionType.Produce]: 1.3 } },
    { location: Loc.Guild_Hall,    bonuses: { [ActionType.Socialize]: 1.3 } },
    { location: Loc.Tavern,        bonuses: { [ActionType.Socialize]: 1.2 } },
    { location: Loc.Wizard_Tower,  bonuses: {} },
  ],
  [SpiritRole.Miner]: [
    { location: Loc.Mountain_Path, bonuses: { [ActionType.Produce]: 1.5 } },
    { location: Loc.Mountain_Path, bonuses: { [ActionType.Produce]: 1.3 } },
    { location: Loc.Blacksmith,    bonuses: { [ActionType.Trade_Sell]: 1.3 } },
    { location: Loc.Town_Elimes,   bonuses: {} },
  ],
  [SpiritRole.Fisher]: [
    { location: Loc.Lake,          bonuses: { [ActionType.Produce]: 1.5 } },
    { location: Loc.Lake,          bonuses: { [ActionType.Produce]: 1.2 } },
    { location: Loc.Lake,          bonuses: { [ActionType.Socialize]: 1.3 } },
    { location: Loc.Town_Elimes,   bonuses: {} },
  ],
  [SpiritRole.Priest]: [
    { location: Loc.Church,        bonuses: { [ActionType.Produce]: 1.4 } },
    { location: Loc.Church,        bonuses: { [ActionType.ShareMeal]: 1.3, [ActionType.TeachSkill]: 1.2 } },
    { location: Loc.Church,        bonuses: { [ActionType.Socialize]: 1.3 } },
    { location: Loc.Church,        bonuses: {} },
  ],
  [SpiritRole.Craftsman]: [
    { location: Loc.Blacksmith,    bonuses: { [ActionType.Produce]: 1.4 } },
    { location: Loc.Blacksmith,    bonuses: { [ActionType.Produce]: 1.3 } },
    { location: Loc.Market_Square, bonuses: { [ActionType.Trade_Sell]: 1.3 } },
    { location: Loc.Town_Elimes,   bonuses: {} },
  ],
};

// Roles exempt from weekend override
const WEEKEND_EXEMPT = new Set([SpiritRole.Guard, SpiritRole.Priest]);

// Weekend schedule overrides by TimePeriod
const WEEKEND_BONUSES: ScheduleEntry['bonuses'][] = [
  { [ActionType.Socialize]: 1.3 },
  { [ActionType.Trade_Buy]: 1.2, [ActionType.Socialize]: 1.3 },
  { [ActionType.Socialize]: 1.5, [ActionType.Celebrate]: 1.3 },
  {},
];

// Wednesday market day roles
const MARKET_DAY_ROLES = new Set([SpiritRole.Merchant, SpiritRole.Craftsman, SpiritRole.Farmer]);

function getScheduleEntry(actor: Actor, time: GameTime): ScheduleEntry {
  const role = actor.spirit.role;
  const period = getTimePeriod(time.hour);
  const dow = time.getDayOfWeek();
  const isWed = dow === DayOfWeek.Wed;
  const isWeekend = time.isWeekend();

  // Wednesday market day override for Merchant/Craftsman/Farmer (morning/afternoon only)
  if (isWed && MARKET_DAY_ROLES.has(role) && (period === 0 || period === 1)) {
    return {
      location: Loc.Market_Square,
      bonuses: { [ActionType.Trade_Sell]: 1.5, [ActionType.Trade_Buy]: 1.4 },
    };
  }

  // Weekend override (non-exempt roles)
  if (isWeekend && !WEEKEND_EXEMPT.has(role)) {
    const baseEntry = DAILY_SCHEDULE[role]?.[period] ?? { location: Loc.Town_Elimes, bonuses: {} };
    return {
      location: baseEntry.location,
      bonuses: WEEKEND_BONUSES[period] ?? {},
    };
  }

  return DAILY_SCHEDULE[role]?.[period] ?? { location: Loc.Town_Elimes, bonuses: {} };
}

export function getRoutineMultiplier(actor: Actor, action: ActionType, time: GameTime): number {
  const entry = getScheduleEntry(actor, time);
  const bonus = entry.bonuses[action];
  if (bonus === undefined) return 1.0;

  const c = actor.color.values;
  const iron  = c[Element.Iron]  ?? 0;
  const fire  = c[Element.Fire]  ?? 0;
  const wind  = c[Element.Wind]  ?? 0;

  // Iron increases adherence to routine; Fire and Wind reduce it
  const adherence = 1.0 + iron * 0.1 - fire * 0.05 - wind * 0.05;
  return bonus * Math.max(0.5, Math.min(1.5, adherence));
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
// Race synergy helper
// ============================================================

export function getRaceSynergy(race1: Race, race2: Race): number {
  if (race1 === race2) return 0.1;

  // Normalise pair order so a<b for lookup
  const a = Math.min(race1 as number, race2 as number) as Race;
  const b = Math.max(race1 as number, race2 as number) as Race;

  // HIGH SYNERGY (0.8)
  const high: [Race, Race][] = [
    [Race.Dwarf,   Race.Elf],
    [Race.Elf,     Race.Spirit],
    [Race.Foxkin,  Race.Nekomimi],
    [Race.Moth,    Race.Dryad],
    [Race.Angel,   Race.Spirit],
    [Race.Dryad,   Race.Elf],
    [Race.Dragon,  Race.Dwarf],
    [Race.Dryad,   Race.Fairy],
    [Race.Elf,     Race.Fairy],
    [Race.Dwarf,   Race.Goblin],
    [Race.Dryad,   Race.Lamia],
    [Race.Elf,     Race.Merfolk],
  ];
  for (const [r1, r2] of high) {
    const la = Math.min(r1 as number, r2 as number) as Race;
    const lb = Math.max(r1 as number, r2 as number) as Race;
    if (la === a && lb === b) return 0.8;
  }

  // MEDIUM SYNERGY (0.75)
  const medium: [Race, Race][] = [
    [Race.Harpy,    Race.Nekomimi],
    [Race.Elf,      Race.Foxkin],
    [Race.Dragon,   Race.Lamia],
    [Race.Merfolk,  Race.Spirit],
    [Race.Construct, Race.Goblin],
    [Race.Fairy,    Race.Moth],
    [Race.Demon,    Race.Dragon],
  ];
  for (const [r1, r2] of medium) {
    const la = Math.min(r1 as number, r2 as number) as Race;
    const lb = Math.max(r1 as number, r2 as number) as Race;
    if (la === a && lb === b) return 0.75;
  }

  // BALANCED (0.7)
  const balanced: [Race, Race][] = [
    [Race.Beastkin, Race.Human],
    [Race.Centaur,  Race.Human],
    [Race.Dragon,   Race.Harpy],
    [Race.Harpy,    Race.Merfolk],
  ];
  for (const [r1, r2] of balanced) {
    const la = Math.min(r1 as number, r2 as number) as Race;
    const lb = Math.max(r1 as number, r2 as number) as Race;
    if (la === a && lb === b) return 0.7;
  }

  return 0.5;
}

// ============================================================
// Matrix modifier helper (±10% max influence)
// ============================================================

function getMatrixModifier(actor: Actor, action: ActionType): number {
  const matrix = actor.coreMatrix;
  if (!matrix) return 1.0;

  let relevantElements: number[] = [];

  switch (action) {
    case ActionType.ExploreDungeon:                                  relevantElements = [0, 6]; break; // Fire, Light
    case ActionType.Trade_Buy: case ActionType.Trade_Sell:           relevantElements = [4]; break;    // Earth
    case ActionType.Socialize: case ActionType.ShareRumor:           relevantElements = [1, 5]; break; // Water, Wind
    case ActionType.Produce:                                         relevantElements = [4, 3]; break; // Earth, Iron
    case ActionType.ShareMeal:                                       relevantElements = [1, 6]; break; // Water, Light
    case ActionType.TeachSkill:                                      relevantElements = [6, 1]; break; // Light, Water
    case ActionType.CulturalExchange:                                relevantElements = [5, 1]; break; // Wind, Water
    case ActionType.CooperateWork:                                   relevantElements = [4, 3]; break; // Earth, Iron
    case ActionType.Celebrate:                                       relevantElements = [0, 5]; break; // Fire, Wind
    case ActionType.Rest: case ActionType.Sleep:                     relevantElements = [4, 7]; break; // Earth, Dark
    default: return 1.0;
  }

  let totalOnRatio = 0;
  for (const el of relevantElements) {
    let on = 0;
    for (let c = 0; c < 8; c++) {
      if (matrix.getCell(el, c)) on++;
    }
    totalOnRatio += on / 8;
  }
  totalOnRatio /= relevantElements.length; // average ON ratio 0-1

  // Map 0-1 to 0.9-1.1 (±10% max)
  return 0.9 + totalOnRatio * 0.2;
}

// ============================================================
// Color modifier helper
// ============================================================

function getColorModifier(actor: Actor, action: ActionType): number {
  const c = actor.color.values;
  let mod = 1.0;
  switch (action) {
    case ActionType.ShareMeal:
      mod += (c[Element.Water] ?? 0) * 0.5
           + (c[Element.Light] ?? 0) * 0.3
           + (c[Element.Fire]  ?? 0) * 0.2;
      break;
    case ActionType.TeachSkill:
      mod += (c[Element.Light] ?? 0) * 0.5
           + (c[Element.Water] ?? 0) * 0.3
           + (c[Element.Iron]  ?? 0) * 0.2;
      break;
    case ActionType.CulturalExchange:
      mod += (c[Element.Wind]     ?? 0) * 0.5
           + (c[Element.Water]    ?? 0) * 0.4
           + (c[Element.Electric] ?? 0) * 0.2;
      break;
    case ActionType.CooperateWork:
      mod += (c[Element.Earth] ?? 0) * 0.4
           + (c[Element.Iron]  ?? 0) * 0.3
           + (c[Element.Water] ?? 0) * 0.2;
      break;
    case ActionType.Celebrate:
      mod += (c[Element.Fire] ?? 0) * 0.5
           + (c[Element.Wind] ?? 0) * 0.4
           + (c[Element.Water] ?? 0) * 0.2;
      break;
    default:
      break;
  }
  return Math.max(0.1, mod);
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
  const sleepHour = getPreferredSleepHour(role, actor);
  const wakeHour = getPreferredWakeHour(role, actor);
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
    sleepScore *= getMatrixModifier(actor, ActionType.Sleep);
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
    restScore *= getMatrixModifier(actor, ActionType.Rest);
    candidates.push(make(ActionType.Rest, restScore, { reason: '휴식' }));
  }

  // 7. Idle
  candidates.push(make(ActionType.Idle, 5, { reason: '대기' }));

  // 8. Socialize
  {
    let socialScore = 15;
    if (isEvening) socialScore += 15;
    socialScore += (color[Element.Water] ?? 0) * 10;
    socialScore *= getMatrixModifier(actor, ActionType.Socialize);
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
    rumorScore *= getMatrixModifier(actor, ActionType.ShareRumor);
    candidates.push(make(ActionType.ShareRumor, rumorScore, { reason: '소문 공유' }));
  }

  // 10. Trade_Buy
  {
    const hungry = vigor < 40;
    const hasFood = (actor.spirit.inventory.get(ItemType.Food) ?? 0) > 0;
    let buyScore = 10;
    if (hungry && !hasFood) buyScore += 60;
    buyScore += getRoleBonus(role, ActionType.Trade_Buy);
    buyScore *= getMatrixModifier(actor, ActionType.Trade_Buy);
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
    sellScore *= getMatrixModifier(actor, ActionType.Trade_Sell);
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
    dungeonScore *= getMatrixModifier(actor, ActionType.ExploreDungeon);
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
      produceScore *= getMatrixModifier(actor, ActionType.Produce);
      candidates.push(make(ActionType.Produce, produceScore, { reason: '생산' }));
    }
  }

  // 16–20. Positive social actions — require a different-race NPC at same location
  const diffRaceNeighbors = allActors.filter(
    a => a.name !== actor.name
      && a.currentLocation === loc
      && !a.base.sleeping
      && a.base.race !== actor.base.race,
  );

  if (diffRaceNeighbors.length > 0) {
    const bestNeighbor = diffRaceNeighbors[0];
    const synergy = getRaceSynergy(actor.base.race, bestNeighbor.base.race);
    const rel = actor.relationships.get(bestNeighbor.name);
    const trust = rel?.trust ?? 0;
    const affinity = rel?.affinity ?? 0;

    // 16. ShareMeal
    {
      const hasFood = (actor.spirit.inventory.get(ItemType.Food) ?? 0) > 0;
      if (hasFood) {
        const isHungry = bestNeighbor.base.vigor < 40;
        let score = 10
          + 15 // different race bonus
          + (isHungry ? 20 : 0)
          + (color[Element.Water] ?? 0) * 12
          + (color[Element.Light] ?? 0) * 8
          + affinity * 10;
        score *= getColorModifier(actor, ActionType.ShareMeal);
        score *= getMatrixModifier(actor, ActionType.ShareMeal);
        candidates.push(make(ActionType.ShareMeal, score, {
          targetActor: bestNeighbor.name,
          reason: '식사 나누기',
        }));
      }
    }

    // 17. TeachSkill
    {
      let score = 15
        + (color[Element.Light] ?? 0) * 10
        + (color[Element.Water] ?? 0) * 8
        + trust * 15;
      score *= getColorModifier(actor, ActionType.TeachSkill);
      score *= getMatrixModifier(actor, ActionType.TeachSkill);
      candidates.push(make(ActionType.TeachSkill, score, {
        targetActor: bestNeighbor.name,
        reason: '스킬 전수',
      }));
    }

    // 18. CulturalExchange
    {
      let score = 3
        + (color[Element.Wind]  ?? 0) * 3
        + (color[Element.Water] ?? 0) * 2
        + (isEvening ? 3 : 0);
      score *= getColorModifier(actor, ActionType.CulturalExchange);
      score *= getMatrixModifier(actor, ActionType.CulturalExchange);
      candidates.push(make(ActionType.CulturalExchange, score, {
        targetActor: bestNeighbor.name,
        reason: '문화 교류',
      }));
    }

    // 19. CooperateWork
    {
      const recipes = world.getProductionRecipes(loc);
      if (recipes.length > 0) {
        let score = 18
          + synergy * 20
          + (color[Element.Earth] ?? 0) * 8
          + (color[Element.Iron]  ?? 0) * 6
          + trust * 12;
        score *= getColorModifier(actor, ActionType.CooperateWork);
        score *= getMatrixModifier(actor, ActionType.CooperateWork);
        candidates.push(make(ActionType.CooperateWork, score, {
          targetActor: bestNeighbor.name,
          reason: '협동 작업',
        }));
      }
    }
  }

  // 20. Celebrate — requires 5+ NPCs at location, evening
  if (isEvening) {
    const awakeAtLoc = allActors.filter(a => a.currentLocation === loc && !a.base.sleeping);
    if (awakeAtLoc.length >= 5) {
      const badMood = actor.base.mood < -0.2;
      let score = 8
        + (color[Element.Fire] ?? 0) * 5
        + (color[Element.Wind] ?? 0) * 4
        + (badMood ? 5 : 0);
      score *= getColorModifier(actor, ActionType.Celebrate);
      score *= getMatrixModifier(actor, ActionType.Celebrate);
      candidates.push(make(ActionType.Celebrate, score, { reason: '축제' }));
    }
  }

  // Apply routine multiplier to all candidates
  {
    const scheduledEntry = getScheduleEntry(actor, time);
    for (const c of candidates) {
      const multiplier = getRoutineMultiplier(actor, c.type, time);
      if (multiplier !== 1.0) c.score *= multiplier;
    }

    // If NPC is not at their scheduled location, add a GoToLocation nudge
    if (loc !== scheduledEntry.location) {
      const ironVal = color[Element.Iron] ?? 0;
      // Iron discipline increases the pull toward scheduled location
      const scheduledLocScore = 25 * (1.0 + ironVal * 0.2);
      candidates.push(make(ActionType.GoToLocation, scheduledLocScore, {
        targetLocation: scheduledEntry.location,
        reason: '일과 장소로 이동',
      }));
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

    case ActionType.ShareMeal: {
      const targetName = action.targetActor;
      const target = allActors.find(a => a.name === targetName);
      if (!target) break;
      const consumed = actor.consumeItem(ItemType.Food, 1);
      if (!consumed) break;
      actor.adjustRelationship(targetName, 0.05, 0.05);
      target.adjustRelationship(name, 0.05, 0.05);
      actor.adjustMood(0.04);
      target.adjustMood(0.04);
      actor.addMemory({
        type: MemoryType.SharedMeal,
        subject: targetName,
        detail: `${targetName}${gwaWa(targetName)} 식사를 나눴다.`,
        when: time.clone(),
        emotionalWeight: 0.4,
      });
      target.addMemory({
        type: MemoryType.SharedMeal,
        subject: name,
        detail: `${name}이${iGa(name)} 식사를 나눠 주었다.`,
        when: time.clone(),
        emotionalWeight: 0.4,
      });
      actor.actionCooldown = 2;
      log.add(time, `${name}이${iGa(name)} ${targetName}에게 식사를 나눠 주었다.`, '행동', name, loc);
      break;
    }

    case ActionType.TeachSkill: {
      const targetName = action.targetActor;
      const target = allActors.find(a => a.name === targetName);
      if (!target) break;
      actor.adjustRelationship(targetName, 0.08, 0.06);
      target.adjustRelationship(name, 0.08, 0.06);
      actor.adjustMood(0.04);
      target.adjustMood(0.04);
      actor.addMemory({
        type: MemoryType.TaughtSkill,
        subject: targetName,
        detail: `${targetName}에게 기술을 전수했다.`,
        when: time.clone(),
        emotionalWeight: 0.4,
      });
      target.addMemory({
        type: MemoryType.LearnedFromRace,
        subject: name,
        detail: `${name}에게 기술을 배웠다.`,
        when: time.clone(),
        emotionalWeight: 0.4,
      });
      actor.actionCooldown = 3;
      log.add(time, `${name}이${iGa(name)} ${targetName}에게 기술을 전수했다.`, '행동', name, loc);
      break;
    }

    case ActionType.CulturalExchange: {
      const targetName = action.targetActor;
      const target = allActors.find(a => a.name === targetName);
      if (!target) break;
      const synergy = getRaceSynergy(actor.base.race, target.base.race);
      actor.adjustRelationship(targetName, 0.06 + synergy * 0.06, 0.08 + synergy * 0.04);
      target.adjustRelationship(name, 0.06 + synergy * 0.06, 0.08 + synergy * 0.04);
      actor.addMemory({
        type: MemoryType.CulturalBond,
        subject: targetName,
        detail: `${targetName}${gwaWa(targetName)} 문화를 교류했다.`,
        when: time.clone(),
        emotionalWeight: 0.35,
      });
      target.addMemory({
        type: MemoryType.CulturalBond,
        subject: name,
        detail: `${name}${gwaWa(name)} 문화를 교류했다.`,
        when: time.clone(),
        emotionalWeight: 0.35,
      });
      actor.actionCooldown = 2;
      log.add(time, `${name}이${iGa(name)} ${targetName}${gwaWa(targetName)} 문화를 교류했다.`, '행동', name, loc);
      break;
    }

    case ActionType.CooperateWork: {
      const targetName = action.targetActor;
      const target = allActors.find(a => a.name === targetName);
      if (!target) break;
      actor.adjustRelationship(targetName, 0.08, 0.06);
      target.adjustRelationship(name, 0.08, 0.06);
      actor.addMemory({
        type: MemoryType.CooperatedWith,
        subject: targetName,
        detail: `${targetName}${gwaWa(targetName)} 함께 일했다.`,
        when: time.clone(),
        emotionalWeight: 0.3,
      });
      target.addMemory({
        type: MemoryType.CooperatedWith,
        subject: name,
        detail: `${name}${gwaWa(name)} 함께 일했다.`,
        when: time.clone(),
        emotionalWeight: 0.3,
      });
      actor.actionCooldown = 3;
      log.add(time, `${name}이${iGa(name)} ${targetName}${gwaWa(targetName)} 함께 일했다.`, '행동', name, loc);
      break;
    }

    case ActionType.Celebrate: {
      const participants = allActors.filter(a => a.currentLocation === loc && !a.base.sleeping);
      const count = participants.length;
      if (count < 2) break;
      const festivalPower = Math.min(1.0, count * 0.1);
      for (const p of participants) {
        p.adjustMood(0.1 * festivalPower);
        for (const other of participants) {
          if (other.name === p.name) continue;
          p.adjustRelationship(other.name, 0.03 * festivalPower, 0.04 * festivalPower);
        }
        p.addMemory({
          type: MemoryType.CelebratedTogether,
          subject: loc,
          detail: `${locationName(loc)}에서 축제를 즐겼다.`,
          when: time.clone(),
          emotionalWeight: 0.5,
        });
      }
      actor.actionCooldown = 4;
      log.add(time, `${locationName(loc)}에서 축제가 열렸다!`, '행동', name, loc);
      break;
    }

    default:
      break;
  }

  // Apply color change from action execution (matrix modulates rate)
  const ACTION_INFLUENCE: Partial<Record<ActionType, number[]>> = {
    [ActionType.Eat]:              [0, 0, 0, 0, 0.01, 0, 0, 0],
    [ActionType.Rest]:             [0, 0.005, 0, 0, 0.01, 0, 0, 0],
    [ActionType.Sleep]:            [0, 0, 0, 0, 0.005, 0, 0, 0.005],
    [ActionType.GoToLocation]:     [0, 0, 0, 0, 0, 0.005, 0, 0],
    [ActionType.Trade_Buy]:        [0, 0, 0, 0, 0.01, 0, 0, 0],
    [ActionType.Trade_Sell]:       [0, 0, 0, 0, 0.01, 0, 0, 0],
    [ActionType.Trade_WithActor]:  [0, 0.005, 0, 0, 0.01, 0, 0, 0],
    [ActionType.ExploreDungeon]:   [0.02, 0, 0, 0, 0, 0, 0.01, 0],
    [ActionType.PostQuest]:        [0, 0, 0, 0.01, 0, 0, 0.01, 0],
    [ActionType.CheckQuests]:      [0, 0, 0.005, 0, 0, 0.005, 0, 0],
    [ActionType.AcceptQuest]:      [0.01, 0, 0, 0.01, 0, 0, 0, 0],
    [ActionType.TurnInQuest]:      [0, 0, 0, 0, 0, 0, 0.01, 0],
    [ActionType.Socialize]:        [0, 0.01, 0, 0, 0, 0.005, 0, 0],
    [ActionType.ShareRumor]:       [0, 0, 0, 0, 0, 0.01, 0, 0],
    [ActionType.Produce]:          [0, 0, 0, 0.01, 0.01, 0, 0, 0],
    [ActionType.ShareMeal]:        [0, 0.01, 0, 0, 0, 0, 0.01, 0],
    [ActionType.TeachSkill]:       [0, 0.005, 0, 0.005, 0, 0, 0.01, 0],
    [ActionType.CulturalExchange]: [0, 0.005, 0, 0, 0, 0.01, 0, 0],
    [ActionType.CooperateWork]:    [0, 0.005, 0, 0.01, 0.01, 0, 0, 0],
    [ActionType.Celebrate]:        [0.01, 0.005, 0, 0, 0, 0.01, 0, 0],
  };
  const inf = ACTION_INFLUENCE[action.type as ActionType];
  if (inf) {
    actor.color.applyInfluenceWithMatrix(inf, actor.coreMatrix, ColorChangeContext.Routine);
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

  // Update vigor (with weather drain modifier)
  const weatherEffect = getWeatherEffect(world.weather);
  const isOutdoor = isOutdoorLocation(actor.currentLocation);
  const vigorDrainBase = 0.12 * factor;
  const vigorDrain = isOutdoor
    ? vigorDrainBase * weatherEffect.vigorDrainMod
    : vigorDrainBase;
  actor.adjustVigor(-vigorDrain);
  if (actor.base.vigor < 10) {
    actor.adjustHp(-0.3 * factor);
  }

  // Weather mood effect
  if (weatherEffect.moodEffect !== 0) {
    actor.adjustMood(weatherEffect.moodEffect * factor);
  }

  // Daily life simulation — triggers once per day at hour=6
  if (time.hour === 6 && time.day !== actor.lifeData.lastExpenseDay) {
    const ld = actor.lifeData;
    ld.lastExpenseDay = time.day;

    // 1. Deduct daily expense
    actor.spirit.gold -= ld.dailyExpense;

    // 2. React if broke
    if (actor.spirit.gold < 0) {
      const c = actor.color.values;
      // Find dominant element
      let domEl = 0;
      let domVal = c[0] ?? 0;
      for (let i = 1; i < 8; i++) {
        if ((c[i] ?? 0) > domVal) { domVal = c[i] ?? 0; domEl = i; }
      }
      const influence = new Array(8).fill(0) as number[];
      switch (domEl) {
        case Element.Fire:  influence[Element.Fire]  =  0.03; break; // angry
        case Element.Water: influence[Element.Water] =  0.02; actor.adjustMood(-0.05); break; // sad
        case Element.Iron:  influence[Element.Iron]  =  0.02; break; // doubles down
        case Element.Wind:  influence[Element.Wind]  =  0.03; break; // considers leaving
        case Element.Earth: influence[Element.Earth] =  0.02; break; // tightens belt
        case Element.Dark:  influence[Element.Dark]  =  0.03; break; // scheming
        default: break;
      }
      actor.color.applyInfluence(influence);
    }

    // 3. Update comfortLevel
    ld.comfortLevel = actor.spirit.gold > 0
      ? Math.max(0, Math.min(1, actor.spirit.gold / 100))
      : 0;

    // 4. Update daysSinceLastMeal
    ld.daysSinceLastMeal++;
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
