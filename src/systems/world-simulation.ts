// world-simulation.ts — 턴 진행 + 오프라인 시뮬레이션
// 원본: WorldSimulation.cpp (AdvanceTurn, FastForwardWorld)

import { Actor } from '../models/actor';
import { World } from '../models/world';
import { EventSystem } from '../models/event';
import { SocialHub } from '../models/social';
import { Backlog } from '../models/backlog';
import { PlayerKnowledge } from '../models/knowledge';
import { GameTime } from '../types/game-time';
import { Element, ELEMENT_COUNT, seasonName } from '../types/enums';
import { Loc, type LocationID } from '../types/location';
import { npcOnTick } from './npc-ai';
import { checkNpcLifeEvents } from './npc-life';
import { tickFarm } from '../models/farming';
import { getCropDef } from '../data/crop-defs';
import { recalcVillageFinance } from '../models/village';
import { getFacilityDef } from '../data/village-defs';

const TICK_CHUNK = 5;
const FF_CHUNK_MINUTES = 5;
const FF_MAX_MINUTES = 10080; // 7 days max

// ============================================================
// helpers
// ============================================================

function applyEventInfluences(
  triggered: number[],
  events: EventSystem,
  actors: Actor[],
  gameTime: GameTime,
  log: Backlog,
  world: World,
): void {
  for (const idx of triggered) {
    const ev = events.getEvent(idx);
    log.add(gameTime, `[이벤트] ${ev.name} (${ev.location}): ${ev.description}`, '이벤트');
    ev.worldScript?.(world, gameTime);
    for (const actor of actors) {
      if (actor.currentLocation === ev.location) {
        actor.receiveEventInfluence(ev.colorInfluence, ev.name, gameTime);
      }
    }
  }
}

function buildLocInfluence(
  location: string,
  dangerLevel: number,
  factor: number,
  actors: Actor[],
  playerIdx: number,
): number[] {
  const inf = new Array<number>(ELEMENT_COUNT).fill(0);
  const scale = 0.003 * factor;

  // Location-type color pulls
  switch (location) {
    case Loc.Hanabridge:
      inf[Element.Light] += scale;
      break;
    case Loc.Cyan_Dunes:
    case Loc.Tiklit_Range:
      inf[Element.Wind] += scale;
      break;
    case Loc.Erumen_Seoncheon:
      inf[Element.Water] += scale;
      break;
    case Loc.Farm:
      inf[Element.Earth] += scale;
      break;
    case Loc.Moss_Forge:
      inf[Element.Iron] += scale;
      break;
    case Loc.Alimes:
      inf[Element.Fire] += 0.5 * scale;
      break;
    case Loc.Memory_Spring:
      inf[Element.Light] += scale;
      inf[Element.Water] += 0.5 * scale;
      break;
    case Loc.Phantom_Spire:
      inf[Element.Electric] += scale;
      break;
  }

  // Danger level: Fire + Dark
  if (dangerLevel > 0.3) {
    inf[Element.Fire] += scale;
    inf[Element.Dark] += 0.5 * scale;
  }

  // NPC proximity color pull
  const player = actors[playerIdx];
  const npcsHere = actors.filter((a, i) => i !== playerIdx && a.currentLocation === player.currentLocation);
  if (npcsHere.length > 0) {
    const avg = new Array<number>(ELEMENT_COUNT).fill(0);
    for (const npc of npcsHere) {
      for (let e = 0; e < ELEMENT_COUNT; e++) {
        avg[e] += npc.color.values[e];
      }
    }
    const pull = 0.002 * factor;
    for (let e = 0; e < ELEMENT_COUNT; e++) {
      avg[e] /= npcsHere.length;
      inf[e] += (avg[e] - player.color.values[e]) * pull;
    }
  }

  return inf;
}

export function canNotifyRandomEvent(
  world: World,
  playerLocation: LocationID,
  eventLocation: LocationID,
  currentDay: number,
): boolean {
  if (playerLocation === eventLocation) return true;
  return world.getNeighbors(eventLocation, currentDay).includes(playerLocation);
}

function simulateAdvanceStep(
  minutes: number,
  gameTime: GameTime,
  world: World,
  events: EventSystem,
  actors: Actor[],
  playerIdx: number,
  log: Backlog,
  social: SocialHub,
  knowledge: PlayerKnowledge,
): void {
  if (minutes <= 0) return;

  const player = actors[playerIdx];
  const prevTotalMinutes = (gameTime.day - 1) * 1440 + gameTime.hour * 60 + gameTime.minute;
  const factor = minutes / 5;

  gameTime.advance(minutes);
  for (const actor of actors) actor.lastTickHour = gameTime.hour;

  world.onTick(gameTime);
  social.updateQuests(gameTime);

  const locData = world.getLocation(player.currentLocation);
  const locInfluence = buildLocInfluence(
    player.currentLocation,
    locData.dangerLevel,
    factor,
    actors,
    playerIdx,
  );
  player.color.applyInfluence(locInfluence);

  const driftRate = minutes * 0.00005;
  for (let i = 0; i < player.color.values.length; i++) {
    const v = player.color.values[i];
    if (v > 0.5) player.color.values[i] = Math.max(0.5, v - driftRate);
    else if (v < 0.5) player.color.values[i] = Math.min(0.5, v + driftRate);
  }

  const triggered = events.checkAndTrigger(gameTime);
  applyEventInfluences(triggered, events, actors, gameTime, log, world);

  const randomEv = events.rollRandomEvent(gameTime);
  if (randomEv) {
    if (canNotifyRandomEvent(world, player.currentLocation, randomEv.location, gameTime.day)) {
      log.add(gameTime, `[이벤트] ${randomEv.name}: ${randomEv.description}`, '이벤트');
    }
    randomEv.worldScript?.(world, gameTime);
    for (const actor of actors) {
      if (actor.currentLocation === randomEv.location) {
        actor.receiveEventInfluence(randomEv.colorInfluence, randomEv.name, gameTime);
      }
    }
  }

  for (let i = 0; i < actors.length; i++) {
    if (i === playerIdx) continue;
    const actor = actors[i];
    if (knowledge.isCompanion(actor.name)) continue;
    npcOnTick(actor, gameTime, world, log, social, actors, minutes);
  }

  if (world.seasonSchedule.advanceIfNeeded(gameTime.day)) {
    log.add(gameTime, `계절이 ${seasonName(world.getCurrentSeason())}(으)로 바뀌었다.`, '시스템');
    world.updateWeatherAndTemp();
  }

  const curTotalMinutes = (gameTime.day - 1) * 1440 + gameTime.hour * 60 + gameTime.minute;
  const prevHour = Math.floor(prevTotalMinutes / 60);
  const curHour = Math.floor(curTotalMinutes / 60);
  if (curHour > prevHour) {
    checkNpcLifeEvents(actors, social, log, gameTime);
  }
  const prevDay = Math.floor(prevTotalMinutes / 1440);
  const curDay = Math.floor(curTotalMinutes / 1440);
  if (curDay > prevDay) {
    for (const [locId, farm] of knowledge.farmStates) {
      const baseLevel = knowledge.getBaseLevel(locId);
      const result = tickFarm(
        farm,
        gameTime.day,
        world.getCurrentSeason(),
        world.weather,
        baseLevel,
        null,
        Math.random,
        (cropId) => getCropDef(cropId)?.basePrice ?? 30,
        (cropId) => getCropDef(cropId)?.seasonBonus ?? {},
        (cropId) => getCropDef(cropId)?.weatherBonus ?? {},
        (cropId) => getCropDef(cropId)?.name ?? cropId,
        locId,
      );
      if (result.harvestedGold > 0 || result.harvestedCount > 0) {
        const playerActor = actors[playerIdx];
        if (playerActor) {
          if (result.harvestedGold > 0) playerActor.addGold(result.harvestedGold);
          if (result.harvestedCount > 0) {
            // 농장 수확: Earth+, Light+, Dark-
            const harvestInfluence = new Array(8).fill(0);
            harvestInfluence[4] = 0.012;
            harvestInfluence[6] = 0.008;
            harvestInfluence[7] = -0.005;
            playerActor.color.applyInfluence(harvestInfluence);
            for (let i = 0; i < result.harvestedCount; i++) {
              knowledge.trackFarmHarvest();
            }
          }
        }
        for (const msg of result.harvestLog) {
          log.add(gameTime, msg, '농장');
        }
      }
    }

    // 마을 일일 정산
    if (knowledge.villageState) {
      const village = knowledge.villageState;
      if (village.finance.lastSettledDay < curDay + 1) {
        recalcVillageFinance(village, getFacilityDef);
        const net = village.finance.totalIncomePerDay - village.finance.totalMaintenancePerDay;
        if (net !== 0) {
          village.finance.treasury += net;
          // 유지비 > 수입 → 시설 정지 처리는 Phase 2
        }
        village.finance.lastSettledDay = curDay + 1;
        if (net !== 0) {
          log.add(
            gameTime,
            `[개척 마을] ${village.name} 정산: ${net > 0 ? '+' : ''}${net}G (금고 ${village.finance.treasury}G)`,
            '마을',
          );
        }
      }
    }
  }
}

// ============================================================
// advanceTurn
// ============================================================

export function advanceTurn(
  minutes: number,
  gameTime: GameTime,
  world: World,
  events: EventSystem,
  actors: Actor[],
  playerIdx: number,
  log: Backlog,
  social: SocialHub,
  knowledge: PlayerKnowledge,
): void {
  simulateAdvanceStep(minutes, gameTime, world, events, actors, playerIdx, log, social, knowledge);
}

export function advanceTurnByChunks(
  minutes: number,
  gameTime: GameTime,
  world: World,
  events: EventSystem,
  actors: Actor[],
  playerIdx: number,
  log: Backlog,
  social: SocialHub,
  knowledge: PlayerKnowledge,
  chunkMinutes = TICK_CHUNK,
): void {
  const safeChunk = Math.max(1, chunkMinutes);
  let remaining = minutes;
  while (remaining > 0) {
    const step = Math.min(safeChunk, remaining);
    simulateAdvanceStep(step, gameTime, world, events, actors, playerIdx, log, social, knowledge);
    remaining -= step;
  }
}

// ============================================================
// fastForwardWorld
// ============================================================

export function fastForwardWorld(
  elapsedMinutes: number,
  gameTime: GameTime,
  world: World,
  events: EventSystem,
  actors: Actor[],
  social: SocialHub,
  backlog: Backlog,
  knowledge?: PlayerKnowledge,
): void {
  const clamped = Math.min(elapsedMinutes, FF_MAX_MINUTES);
  const playerIdx = actors.findIndex(actor => actor.playable);
  if (knowledge && playerIdx >= 0) {
    advanceTurnByChunks(
      clamped,
      gameTime,
      world,
      events,
      actors,
      playerIdx,
      backlog,
      social,
      knowledge,
      FF_CHUNK_MINUTES,
    );
    return;
  }
  const totalChunks = Math.floor(clamped / FF_CHUNK_MINUTES);

  for (let c = 0; c < totalChunks; c++) {
    gameTime.advance(FF_CHUNK_MINUTES);
    world.onTick(gameTime);
    social.updateQuests(gameTime);

    const triggered = events.checkAndTrigger(gameTime);
    applyEventInfluences(triggered, events, actors, gameTime, backlog, world);

    for (const actor of actors) {
      if (knowledge?.isCompanion(actor.name)) continue;
      npcOnTick(actor, gameTime, world, backlog, social, actors, FF_CHUNK_MINUTES);
    }
  }

  // Remainder
  const remainder = clamped % FF_CHUNK_MINUTES;
  if (remainder > 0) {
    gameTime.advance(remainder);
    world.onTick(gameTime);
    social.updateQuests(gameTime);

    const triggered = events.checkAndTrigger(gameTime);
    applyEventInfluences(triggered, events, actors, gameTime, backlog, world);

    for (const actor of actors) {
      if (knowledge?.isCompanion(actor.name)) continue;
      npcOnTick(actor, gameTime, world, backlog, social, actors, remainder);
    }
  }
}
