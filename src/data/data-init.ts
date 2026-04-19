// data-init.ts — DataSection[] → 모델 인스턴스 변환
// 원본: GameData::InitAll

import { DataSection, parsePairList, parseFloatList, parseStringList, parseColorInfluence, parseLootList, parseTripleList } from './parser';
import { GameRegistry } from '../types/registry';
import { parseRace, parseSpiritRole, parseItemType, isItemTypeCategoryKey, parseTrait, ELEMENT_COUNT, parseElement, ItemType } from '../types/enums';
import { parseLocationID } from '../types/location';
import { Actor } from '../models/actor';
import { World, createLocationData } from '../models/world';
import { EventSystem, createGameEvent } from '../models/event';
import { DungeonSystem, DungeonEventType, MidBossDef, DungeonFloorDef, MonsterSkillDef } from '../models/dungeon';
import { clearDungeonSRankRegistry, registerDungeonSRankLimit, registerDungeonDisplayName } from '../models/dungeon-s-rank-registry';
import { ActivitySystem } from '../models/activity';
import { loadHyperion, setLoadedLocationIds } from '../systems/hyperion';
import { setDialogueLines, clearGiftPreferences, setGiftPreference, rebuildLocationNameMap, rebuildTitleNameMap, rebuildItemNameMap } from '../systems/npc-interaction';
import { loadItemDefs, loadWeaponDefs, loadArmorDefs, parseElementString } from '../types/item-defs';
import { loadSkillDefs, getBasicSkillsForRace } from '../models/skill';
import { assignNpcSkills } from '../systems/skill-learning';
import { raceToKey } from '../types/enums';
import type { TimeWindow } from '../types/game-time';
import type { GameDataFiles } from './loader';
import { initVillageFacilities, initVillageRoads } from './village-init';
import { initVillageEvents } from './village-event-init';
import { initBenzenLines } from './benzen-init';
import { initColorNarratives } from './color-narrative-init';
import { clearNpcQuestDefs } from './npc-quest-defs';
import { initNpcQuests } from './npc-quest-init';
import { initDialogueChoices } from './dialogue-choice-init';
import { loadEventBattles } from '../models/event-battle';

function parseTimeWindow(raw: string): TimeWindow | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (value.startsWith('hourly:')) {
    const parts = value.slice('hourly:'.length).split(':').map(v => parseInt(v.trim(), 10));
    if (parts.length !== 2 || parts.some(Number.isNaN)) return undefined;
    return {
      fromHour: 0,
      fromMinute: parts[0],
      toHour: 0,
      toMinute: parts[1],
      repeatHourly: true,
    };
  }
  if (value.includes('-')) {
    const [fromRaw, toRaw] = value.split('-').map(v => v.trim());
    const parsePoint = (part: string): [number, number] | null => {
      const pieces = part.split(':').map(v => parseInt(v.trim(), 10));
      if (pieces.length !== 2 || pieces.some(Number.isNaN)) return null;
      return [pieces[0], pieces[1]];
    };
    const from = parsePoint(fromRaw);
    const to = parsePoint(toRaw);
    if (!from || !to) return undefined;
    return { fromHour: from[0], fromMinute: from[1], toHour: to[0], toMinute: to[1] };
  }
  const parts = value.split(':').map(v => parseInt(v.trim(), 10));
  if (parts.length !== 2 || parts.some(Number.isNaN)) return undefined;
  return { fromHour: parts[0], fromMinute: 0, toHour: parts[1], toMinute: 0 };
}

// --- items.txt ---
export function initItems(sections: DataSection[]): void {
  const reg = GameRegistry.I;
  for (const s of sections) {
    const name = s.get('name', s.name);
    const price = s.getInt('price', 10);
    const itemType = parseItemType(s.name);
    reg.itemNames.set(itemType, name);
    reg.basePrices.set(itemType, price);
  }
}

// --- locations.txt ---
export function initLocations(sections: DataSection[], world: World): void {
  const reg = GameRegistry.I;
  for (const s of sections) {
    if (s.name === 'World') {
      world.setGridMinutesPerUnit(s.getFloat('gridMinutesPerUnit', 2.0));
      continue;
    }
    const id = s.name;
    const data = createLocationData(id);
    data.description = s.get('description', '');
    data.gridX = s.getFloat('x', 0);
    data.gridY = s.getFloat('y', 0);
    data.monsterLevel = s.getInt('monsterLevel', 0);
    data.dangerLevel = s.getFloat('dangerLevel', 0);
    const gatherEnvRaw = s.get('gather_env', '');
    if (gatherEnvRaw) {
      data.gatherEnv = gatherEnvRaw.split(',').map(e => e.trim()).filter(Boolean);
    }

    reg.locationNames.set(id, s.get('name', id));
    if (s.has('description')) reg.locationDescs.set(id, s.get('description'));

    // links — "Target" 또는 "Target:분" 두 형식
    const links = s.get('links', '');
    if (links) {
      for (const token of links.split(',')) {
        const t = token.trim();
        if (!t) continue;
        const colon = t.indexOf(':');
        if (colon === -1) {
          data.linksBidirectional.push({ target: t, minutesOverride: -1 });
        } else {
          data.linksBidirectional.push({
            target: t.slice(0, colon).trim(),
            minutesOverride: parseInt(t.slice(colon + 1), 10) || -1,
          });
        }
      }
    }
    const oneWay = s.get('links_one_way', '');
    if (oneWay) {
      for (const token of oneWay.split(',')) {
        const t = token.trim();
        if (!t) continue;
        const colon = t.indexOf(':');
        if (colon === -1) {
          data.linksOneWayOut.push({ target: t, minutesOverride: -1 });
        } else {
          data.linksOneWayOut.push({
            target: t.slice(0, colon).trim(),
            minutesOverride: parseInt(t.slice(colon + 1), 10) || -1,
          });
        }
      }
    }

    // Resources — "ItemType:amount"
    const res = s.get('resources', '');
    if (res) {
      for (const pair of parsePairList(res)) {
        data.resources.set(parseItemType(pair[0]), parseInt(pair[1], 10) || 0);
      }
    }

    // timeVisible = "18:6" 또는 "00:00-00:05"
    data.timeVisible = parseTimeWindow(s.get('timeVisible', ''));
    data.hidden = s.getInt('hidden', 0) === 1;

    world.setLocation(id, data);
  }
  world.rebuildTravelGraph();
  world.initMarketFromRegistry();
}

function hasLoadedLocation(world: World, locationId: string): boolean {
  return world.getAllLocations().has(locationId);
}

function filterActorsByLoadedLocations(actors: Actor[], world: World, warnings: string[]): Actor[] {
  const filtered = actors.filter(actor =>
    hasLoadedLocation(world, actor.currentLocation)
    && hasLoadedLocation(world, actor.homeLocation),
  );
  const removed = actors.length - filtered.length;
  if (removed > 0) {
    warnings.push(`Skipped ${removed} actor(s) outside loaded RDC locations`);
  }
  return filtered;
}

// --- actors.txt ---
export function initActors(sections: DataSection[]): Actor[] {
  const actors: Actor[] = [];
  for (const s of sections) {
    const race = parseRace(s.get('race', 'Human'));
    const role = parseSpiritRole(s.get('role', 'Villager'));
    const actor = new Actor(s.name, race, role);

    actor.playable = s.getInt('playable', 0) === 1;
    actor.currentLocation = parseLocationID(s.get('location', 'Alimes'));
    actor.homeLocation = parseLocationID(s.get('homeLocation', actor.currentLocation));
    actor.lifeData.livingPlace = actor.homeLocation;
    actor.stationary = s.getInt('stationary', 0) === 1;
    actor.isCustom = s.getInt('custom', 0) === 1;

    // Stats
    actor.base.hp = s.getFloat('hp', 100);
    actor.base.maxHp = s.getFloat('maxHp', actor.base.hp);
    actor.base.mp = s.getFloat('mp', 30);
    actor.base.maxMp = s.getFloat('maxMp', actor.base.mp);
    actor.base.attack = s.getFloat('attack', 10);
    actor.base.defense = s.getFloat('defense', 5);
    actor.base.strength = s.getFloat('strength', 0.5);
    actor.base.age = s.getInt('age', 25);
    actor.spirit.gold = s.getInt('gold', 50);

    // Color values
    const cv = s.get('colorValues', '');
    if (cv) {
      const vals = parseFloatList(cv);
      for (let i = 0; i < Math.min(vals.length, ELEMENT_COUNT); i++) {
        actor.color.values[i] = vals[i];
      }
    } else {
      actor.color.randomizeValues();
    }
    actor.coreMatrix.recalculate(actor.color.values);

    // Domain traits
    const domHigh = s.get('domainHigh', '');
    const domLow = s.get('domainLow', '');
    if (domHigh && domLow) {
      const highs = parseStringList(domHigh);
      const lows = parseStringList(domLow);
      for (let i = 0; i < Math.min(highs.length, ELEMENT_COUNT); i++) {
        actor.color.domains[i].highTrait = parseTrait(highs[i]);
      }
      for (let i = 0; i < Math.min(lows.length, ELEMENT_COUNT); i++) {
        actor.color.domains[i].lowTrait = parseTrait(lows[i]);
      }
    } else {
      actor.color.randomizeDomains();
    }

    // Inventory — "ItemType:amount" 또는 "itemId:amount"
    const inv = s.get('inventory', '');
    if (inv) {
      for (const pair of parsePairList(inv)) {
        const amount = parseInt(pair[1], 10) || 0;
        if (isItemTypeCategoryKey(pair[0])) {
          actor.addItem(parseItemType(pair[0]), amount);
        } else {
          // 알 수 없는 카테고리 키 → itemId로 처리
          actor.addItemById(pair[0], amount);
        }
      }
    }

    // Background (pipe = newline)
    actor.background = s.get('background', '');

    // 종족별 기본 스킬 초기화
    const raceKey = raceToKey(race);
    const basics = getBasicSkillsForRace(raceKey);
    if (basics.length > 0) {
      for (const skill of basics) {
        actor.learnedSkills.set(skill.id, 1);
        actor.skillOrder.push(skill.id);
      }
    } else {
      // 폴백: 공용 기본 스킬
      actor.learnedSkills.set('slash', 1);
      actor.learnedSkills.set('guard', 1);
      actor.learnedSkills.set('heal', 1);
      actor.skillOrder = ['slash', 'guard', 'heal'];
    }

    // 비플레이어블 NPC에게 역할 기반 추가 스킬 배정
    if (!actor.playable) {
      assignNpcSkills(actor);
    }

    actors.push(actor);
  }
  return actors;
}

// --- events.txt ---
export function initEvents(sections: DataSection[], events: EventSystem, world: World): void {
  for (const s of sections) {
    const rawLocation = s.get('location', '').trim();
    if (rawLocation && !hasLoadedLocation(world, rawLocation)) continue;
    const ev = createGameEvent(s.name, s.get('description', ''));
    ev.location = parseLocationID(s.get('location', 'Alimes'));

    // colorInfluence — "Element:float" 형식
    ev.colorInfluence = parseColorInfluence(s.get('colorInfluence', ''));

    // 가중치 — 데이터는 'weight' 키
    ev.poolWeight = s.getFloat('weight', s.getFloat('poolWeight', 1.0));

    // worldScript: addResource, adjustSupply, adjustDemand 파싱
    const addRes = parseTripleList(s.get('addResource', ''));     // Location:Item:amount
    const adjSupply = parsePairList(s.get('adjustSupply', ''));   // Item:delta
    const adjDemand = parsePairList(s.get('adjustDemand', ''));   // Item:delta
    const dangerDelta = s.getFloat('dangerDelta', 0);
    const blockFrom = s.get('blockRouteFrom', '');
    const blockTo = s.get('blockRouteTo', '');
    const blockDays = s.getInt('blockRouteDays', 0);

    if (addRes.length > 0 || adjSupply.length > 0 || adjDemand.length > 0 || dangerDelta !== 0 || blockFrom) {
      ev.worldScript = (w: unknown) => {
        const wd = w as World;
        for (const [loc, item, amt] of addRes) {
          wd.addResource(loc, parseItemType(item), parseInt(amt, 10) || 0);
        }
        for (const [item, delta] of adjSupply) {
          wd.adjustSupply(parseItemType(item), parseFloat(delta) || 0);
        }
        for (const [item, delta] of adjDemand) {
          wd.adjustDemand(parseItemType(item), parseFloat(delta) || 0);
        }
        if (dangerDelta !== 0 && ev.location) {
          const loc = wd.getLocation(ev.location);
          loc.dangerLevel = Math.max(0, Math.min(1, loc.dangerLevel + dangerDelta));
        }
        if (blockFrom && blockTo && blockDays > 0) {
          // blockRouteDays는 현재 일차 기준이지만, 여기선 간단히 day 더함
          wd.blockRoute(blockFrom, blockTo, blockDays);
        }
      };
    }

    // 이벤트 유형 결정: triggerDay > 0 = 스케줄, triggerDay = -1 = 랜덤, 그외 = 일반
    const day = s.getInt('triggerDay', 0);
    const hour = s.getInt('triggerHour', 0);
    if (day > 0) {
      events.addScheduledEvent(ev, day, hour);
    } else if (day === -1 || s.has('weight')) {
      events.addRandomPoolEvent(ev);
    } else {
      events.addEvent(ev);
    }
  }
}

// --- dungeons.txt, monsters.txt, dungeon_events.txt, combat_behavior.txt ---
export function initDungeonSystem(
  dungeonSections: DataSection[],
  monsterSections: DataSection[],
  dungeonEventSections: DataSection[],
  combatSections: DataSection[],
  dungeon: DungeonSystem,
  world: World,
): void {
  clearDungeonSRankRegistry();
  // monsters — loot는 "Item:amount:chance" 3항 형식, 스킬은 skill_N_* 키
  for (const s of monsterSections) {
    // 몬스터 기본 element (Element 문자열: Fire/Water/... 또는 None)
    const monsterElemRaw = s.get('element', '').trim();
    const monsterElement = monsterElemRaw ? parseElementString(monsterElemRaw) : -1;

    // 몬스터 스킬 파싱
    const skills: MonsterSkillDef[] = [];
    const skillNums = new Set<number>();
    for (const key of s.values.keys()) {
      const m = key.match(/^skill_(\d+)_/);
      if (m) skillNums.add(parseInt(m[1], 10));
    }
    for (const n of [...skillNums].sort((a, b) => a - b)) {
      const name = s.get(`skill_${n}_name`, '');
      if (!name) continue;
      const skillElemRaw = s.get(`skill_${n}_element`, '').trim();
      const skillElement = skillElemRaw ? parseElementString(skillElemRaw) : undefined;
      skills.push({
        name,
        type: s.get(`skill_${n}_type`, 'attack') as 'attack' | 'heal' | 'buff',
        value: s.getFloat(`skill_${n}_value`, 1.5),
        description: s.get(`skill_${n}_desc`, ''),
        element: skillElement,
      });
    }

    const openingMul = s.getFloat('openingAttackMultiplier', 0);
    const burstHits = s.getInt('burstHitCount', 0);
    const burstEach = s.getInt('burstHitDamage', 0);
    const burstOnceRaw = s.get('burstOnce', '').trim().toLowerCase();
    const burstExplicitOnce = burstOnceRaw === 'true' || burstOnceRaw === '1' || burstOnceRaw === 'yes';
    const tickPress = s.getInt('tickPressureDamage', 0);

    dungeon.addMonster({
      id: s.name,
      name: s.get('name', s.name),
      attack: s.getInt('attack', 10),
      defense: s.getInt('defense', 5),
      hp: s.getInt('hp', 30),
      lootTable: [
        ...parseLootList(s.get('loot', '')).map(l => ({
          item: parseItemType(l.item), amount: l.amount, chance: l.chance,
        })),
        ...parseLootList(s.get('lootItems', '')).map(l => ({
          item: 0 as ItemType, amount: l.amount, chance: l.chance, itemId: l.item,
        })),
      ],
      skills,
      skillChance: s.getFloat('skillChance', 0),
      element: monsterElement >= 0 ? monsterElement : undefined,
      openingAttackMultiplier: openingMul > 0 ? openingMul : undefined,
      burstHitCount: burstHits > 0 ? burstHits : undefined,
      burstHitDamage: burstEach > 0 ? burstEach : undefined,
      burstOnce: burstHits > 0 && burstEach > 0 && burstExplicitOnce ? true : undefined,
      tickPressureDamage: tickPress > 0 ? tickPress : undefined,
      evasionChance: (() => {
        const v = s.getFloat('evasionChance', 0);
        return v > 0 ? Math.min(0.95, v) : undefined;
      })(),
    });
  }

  // dungeons — colorInfluence는 "Element:float", lootPerAdvance는 3항
  for (const s of dungeonSections) {
    const rawAccessFrom = s.get('accessFrom', '').trim();
    if (rawAccessFrom && !hasLoadedLocation(world, rawAccessFrom)) continue;
    const sRankTurnLimitRaw = s.getInt('sRankTurnLimit', 0);
    const sRankTurnLimit = sRankTurnLimitRaw > 0 ? sRankTurnLimitRaw : undefined;
    dungeon.addDungeon({
      id: s.name,
      name: s.get('name', s.name),
      deepName: s.get('deepName', s.get('name', s.name) + ' 심부'),
      description: s.get('description', ''),
      deepDescription: s.get('deepDescription', ''),
      difficulty: s.getFloat('difficulty', 0.5),
      progressPerAdvance: s.getFloat('progressPerAdvance', 10),
      accessFrom: parseLocationID(s.get('accessFrom', '')),
      availableHours: parseTimeWindow(s.get('availableHours', '')),
      hiddenLocation: s.get('hiddenLocation', '').trim() ? parseLocationID(s.get('hiddenLocation', '')) : undefined,
      hiddenUnlockProgress: s.getFloat('hiddenUnlockProgress', 100),
      rule: (() => {
        const template = s.get('ruleTemplate', '').trim();
        if (!template) return undefined;
        return {
          template,
          rank: s.getInt('ruleRank', 1),
          valueA: s.getFloat('ruleValueA', 0),
          valueB: s.getFloat('ruleValueB', 0),
          valueC: s.getFloat('ruleValueC', 0),
          hint: s.get('ruleHint', '').trim(),
        };
      })(),
      enemyIds: parseStringList(s.get('enemies', '')),
      lootOnClear: [
        ...parseLootList(s.get('lootOnClear', '')).map(l => ({
          item: parseItemType(l.item), amount: l.amount, chance: l.chance,
        })),
        ...parseLootList(s.get('lootItemsOnClear', '')).map(l => ({
          item: 0 as ItemType, amount: l.amount, chance: l.chance, itemId: l.item,
        })),
      ],
      lootPerAdvance: [
        ...parseLootList(s.get('lootPerAdvance', '')).map(l => ({
          item: parseItemType(l.item), amount: l.amount, chance: l.chance,
        })),
        ...parseLootList(s.get('lootItemsPerAdvance', '')).map(l => ({
          item: 0 as ItemType, amount: l.amount, chance: l.chance, itemId: l.item,
        })),
      ],
      lootRareChance: s.getFloat('lootRareChance', 0.1),
      lootRare: [
        ...parseLootList(s.get('lootRare', '')).map(l => ({
          item: parseItemType(l.item), amount: l.amount, chance: l.chance,
        })),
        ...parseLootList(s.get('lootItemsRare', '')).map(l => ({
          item: 0 as ItemType, amount: l.amount, chance: l.chance, itemId: l.item,
        })),
      ],
      colorInfluence: parseColorInfluence(s.get('colorInfluence', '')),
      combatWeight: s.getFloat('combatWeight', 0.70),
      eventWeight: s.getFloat('eventWeight', 0.20),
      restWeight: s.getFloat('restWeight', 0.10),
      floors: s.getInt('floors', (() => {
        const diff = s.getFloat('difficulty', 0.5);
        if (diff <= 0.15) return 2;
        if (diff <= 0.25) return 3;
        if (diff <= 0.40) return 3;
        if (diff <= 0.60) return 4;
        if (diff <= 0.80) return 5;
        return 6;
      })()),
      progressSteps: s.getInt('progressSteps', (() => {
        const diff = s.getFloat('difficulty', 0.5);
        return diff <= 0.25 ? 2 : 3;
      })()),
      choicesPerStep: s.getInt('choicesPerStep', (() => {
        const diff = s.getFloat('difficulty', 0.5);
        return diff > 0.60 ? 6 : 5;
      })()),
      requiredClears: s.getInt('requiredClears', s.getInt('choicesPerStep', (() => {
        const diff = s.getFloat('difficulty', 0.5);
        return diff > 0.60 ? 6 : 5;
      })()) - 1),
      midBosses: (() => {
        const bosses: MidBossDef[] = [];
        const nums = new Set<number>();
        for (const key of s.values.keys()) {
          const m = key.match(/^midBoss_(\d+)_/);
          if (m) nums.add(parseInt(m[1], 10));
        }
        for (const n of [...nums].sort((a, b) => a - b)) {
          const enemyId = s.get(`midBoss_${n}_enemy`, '').trim();
          if (!enemyId) continue;
          bosses.push({
            afterFloor: s.getInt(`midBoss_${n}_afterFloor`, n),
            enemyId,
          });
        }
        return bosses;
      })(),
      floorDefs: (() => {
        const defs: DungeonFloorDef[] = [];
        const nums = new Set<number>();
        for (const key of s.values.keys()) {
          const m = key.match(/^floor_(\d+)_enemies$/);
          if (m) nums.add(parseInt(m[1], 10));
        }
        for (const n of [...nums].sort((a, b) => a - b)) {
          const enemies = parseStringList(s.get(`floor_${n}_enemies`, ''));
          if (enemies.length > 0) defs.push({ floor: n, enemyIds: enemies });
        }
        return defs;
      })(),
      sRankTurnLimit,
      itemBan: s.get('itemBan', '').trim().toLowerCase() === 'true',
      randomSkillCount: s.has('randomSkillCount') ? parseInt(s.get('randomSkillCount', '0'), 10) : 0,
    });
    if (sRankTurnLimit) registerDungeonSRankLimit(s.name, sRankTurnLimit);
    // 던전 display name → id 자동 등록 (입수 조건 파서에서 S랭크/클리어 조건 해석용)
    registerDungeonDisplayName(s.get('name', s.name), s.name);
  }

  // dungeon events
  for (const s of dungeonEventSections) {
    const typeStr = s.get('type', 'Discovery');
    let type = DungeonEventType.Discovery;
    if (typeStr === 'Treasure') type = DungeonEventType.Treasure;
    else if (typeStr === 'Hazard') type = DungeonEventType.Hazard;
    else if (typeStr === 'Heal') type = DungeonEventType.Heal;

    dungeon.addDungeonEvent({
      id: s.name, name: s.get('name', s.name),
      description: s.get('description', ''), chance: s.getFloat('chance', 0.05),
      type,
      gives: parseLootList(s.get('gives', '')).map(l => ({
        item: parseItemType(l.item), amount: l.amount, chance: l.chance,
      })),
      hpDamage: s.getInt('hpDamage', 0), vigorDamage: s.getInt('vigorDamage', 0),
      hpHeal: s.getInt('hpHeal', 0), vigorHeal: s.getInt('vigorHeal', 0),
      colorInfluence: parseColorInfluence(s.get('colorInfluence', '')),
      ruleTemplates: parseStringList(s.get('ruleTemplates', '')),
      dungeonIds: parseStringList(s.get('dungeonIds', '')),
      accessFrom: parseStringList(s.get('accessFrom', '')).map(v => parseLocationID(v)),
    });
  }

  // Combat behavior
  for (const s of combatSections) {
    const rule = {
      hpThresholdRetreat: s.getFloat('hpThresholdRetreat', 20),
      hpThresholdRest: s.getFloat('hpThresholdRest', 40),
      vigorMinimum: s.getFloat('vigorMinimum', 10),
      mpCostPerTurn: s.getFloat('mpCostPerTurn', 5),
    };
    if (s.name === 'Default') {
      dungeon.setDefaultRule(rule);
    } else {
      dungeon.setRoleRule(s.name, rule);
    }
  }
}

// --- activities.txt --- 각 섹션은 LocationID, 내부에 activity_N_* 키로 복수 활동
export function initActivities(sections: DataSection[], activity: ActivitySystem, world: World): void {
  for (const s of sections) {
    const locationId = s.name;
    if (!hasLoadedLocation(world, locationId)) continue;

    // activity_N 번호 수집
    const activityNums = new Set<number>();
    for (const key of s.values.keys()) {
      const m = key.match(/^activity_(\d+)_/);
      if (m) activityNums.add(parseInt(m[1], 10));
    }

    for (const n of [...activityNums].sort((a, b) => a - b)) {
      const prefix = `activity_${n}_`;
      const name = s.get(`${prefix}name`, '');
      if (!name) continue;

      activity.addActivity(locationId, {
        name,
        key: s.get(`${prefix}key`, `${locationId}_${n}`),
        timeCost: s.getInt(`${prefix}time`, 30),
        vigorCost: s.getInt(`${prefix}vigor`, 10),
        goldCost: s.getInt(`${prefix}gold`, 0),
        description: s.get(`${prefix}desc`, ''),
        condition: s.get(`${prefix}condition`, ''),
        effect: s.get(`${prefix}effect`, ''),
        itemReqs: parsePairList(s.get(`${prefix}requires`, '')).map(([item, amt]) => ({
          item: parseItemType(item), amount: parseInt(amt, 10) || 1,
        })),
        itemReqsById: parsePairList(s.get(`${prefix}requireItems`, '')).map(([itemId, amt]) => ({
          itemId, amount: parseInt(amt, 10) || 1,
        })),
        gives: parsePairList(s.get(`${prefix}gives`, '')).map(([item, amt]) => ({
          item: parseItemType(item), amount: parseInt(amt, 10) || 1,
        })),
        givesById: parsePairList(s.get(`${prefix}giveItems`, '')).map(([itemId, amt]) => ({
          itemId, amount: parseInt(amt, 10) || 1,
        })),
        lootTable: parseLootList(s.get(`${prefix}loot`, '')).map(l => ({
          item: parseItemType(l.item), amount: l.amount, chance: l.chance,
        })),
        lootTableById: parseLootList(s.get(`${prefix}lootItems`, '')).map(l => ({
          itemId: l.item, amount: l.amount, chance: l.chance,
        })),
        colorInfluence: parseColorInfluence(s.get(`${prefix}colorInfluence`, '')),
        unique: s.get(`${prefix}unique`, '') === 'true',
        stock: s.getInt(`${prefix}stock`, -1),
      });
    }
  }
}

// --- diagnostic.txt ---
export interface DiagnosticQuestion {
  id: string;
  text: string;
  optionA: string;
  optionB: string;
  influences: { row: number; col: number; weight: number }[];
  colorA: { element: number; value: number }[];
  colorB: { element: number; value: number }[];
}

export function parseDiagnosticQuestions(sections: DataSection[]): DiagnosticQuestion[] {
  const questions: DiagnosticQuestion[] = [];
  for (const s of sections) {
    const influences: { row: number; col: number; weight: number }[] = [];
    const infStr = s.get('influences', '');
    if (infStr) {
      for (const token of infStr.split(',')) {
        const parts = token.trim().split(':');
        if (parts.length === 3) {
          const row = parseInt(parts[0], 10);
          const col = parseInt(parts[1], 10);
          const weight = parseFloat(parts[2]);
          if (!isNaN(row) && !isNaN(col) && !isNaN(weight)) {
            influences.push({ row, col, weight });
          }
        }
      }
    }

    const parseColorPairs = (key: string): { element: number; value: number }[] => {
      const pairs: { element: number; value: number }[] = [];
      const str = s.get(key, '');
      if (!str) return pairs;
      for (const token of str.split(',')) {
        const t = token.trim();
        const colon = t.indexOf(':');
        if (colon === -1) continue;
        const element = parseElement(t.slice(0, colon).trim());
        const value = parseFloat(t.slice(colon + 1));
        if (!isNaN(value)) pairs.push({ element, value });
      }
      return pairs;
    };

    questions.push({
      id: s.name,
      text: s.get('text', ''),
      optionA: s.get('optionA', ''),
      optionB: s.get('optionB', ''),
      influences,
      colorA: parseColorPairs('colorA'),
      colorB: parseColorPairs('colorB'),
    });
  }
  return questions;
}

// --- 결과 ---
export interface InitResult {
  actors: Actor[];
  world: World;
  events: EventSystem;
  dungeonSystem: DungeonSystem;
  activitySystem: ActivitySystem;
  diagnosticQuestions: DiagnosticQuestion[];
  warnings: string[];
}

export function initAll(data: GameDataFiles): InitResult {
  const warnings: string[] = [];

  GameRegistry.I.initDefaults();
  initItems(data.items);

  // 개별 아이템 정의 로드
  try { loadItemDefs(data.items); } catch { /* items.txt가 새 포맷이 아니면 무시 */ }
  // npc-interaction acquisition 파서용: 아이템 display name → itemId 매핑 빌드
  rebuildItemNameMap();

  // 무기 / 방어구 정의 로드
  loadWeaponDefs(data.weapons);
  loadArmorDefs(data.armor);

  // 스킬 정의 로드 (initActors 전에 호출해야 종족별 기본 스킬 배정 가능)
  try { loadSkillDefs(data.skills); } catch { /* skills.txt 없으면 폴백 사용 */ }

  const world = new World();
  initLocations(data.locations, world);
  // 로딩된 모든 location ID를 hyperion all_locations_visited 판정용으로 등록
  setLoadedLocationIds(world.getAllLocations().keys());
  // npc-interaction acquisition 파서용: 지역 display name → locationId 매핑 빌드
  rebuildLocationNameMap();

  const actors = filterActorsByLoadedLocations(initActors(data.actors), world, warnings);
  if (actors.length === 0) warnings.push('No actors loaded');

  const events = new EventSystem();
  initEvents(data.events, events, world);

  const dungeonSystem = new DungeonSystem();
  initDungeonSystem(data.dungeons, data.monsters, data.dungeonEvents, data.combatBehavior, dungeonSystem, world);

  const activitySystem = new ActivitySystem();
  initActivities(data.activities, activitySystem, world);

  loadHyperion(data.hyperion);

  // 대사 DB 로드
  function remapStageKey(sectionName: string): string {
    if (sectionName.endsWith('.친구')) return sectionName.slice(0, -3) + '.known';
    if (sectionName.endsWith('.신뢰')) return sectionName.slice(0, -3) + '.close';
    if (sectionName.endsWith('.깊은유대')) return sectionName.slice(0, -5) + '.companion';
    return sectionName;
  }

  for (const s of data.dialogues) {
    const lines: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const line = s.get(String(i), '');
      if (line) lines.push(line);
    }
    if (lines.length > 0) setDialogueLines(remapStageKey(s.name), lines);
  }

  // NPC 특별 대사 로드
  for (const s of data.npcSpecialLines) {
    const npcId = s.get('npcId', '');
    const condition = s.get('condition', '');
    const line = s.get('line', '');
    if (npcId && condition && line) {
      setDialogueLines(npcId + '.special.' + condition, [line]);
    }
  }

  // 행동 묘사문 로드 (action_texts.txt)
  for (const s of data.actionTexts) {
    const lines: string[] = [];
    for (let i = 1; i <= 30; i++) {
      const line = s.get(String(i), '');
      if (line) lines.push(line);
    }
    if (lines.length > 0) setDialogueLines('action.' + s.name, lines);
  }

  // 전투 묘사문 로드 (combat_texts.txt)
  for (const s of data.combatTexts) {
    const lines: string[] = [];
    for (let i = 1; i <= 30; i++) {
      const line = s.get(String(i), '');
      if (line) lines.push(line);
    }
    if (lines.length > 0) setDialogueLines('combat.' + s.name, lines);
  }

  // 선물 선호도 DB 로드
  clearGiftPreferences();
  for (const s of data.giftPreferences) {
    const key = s.name;
    const loved = s.has('loved') ? parseItemType(s.get('loved', '')) : null;
    const liked = s.has('liked') ? parseItemType(s.get('liked', '')) : null;
    const disliked = s.has('disliked') ? parseItemType(s.get('disliked', '')) : null;
    setGiftPreference(key, { loved, liked, disliked });
  }

  // 히페리온 존재 여부 플래그 설정
  for (const s of data.hyperion) {
    if (s.name === '__default__') continue;
    const actor = actors.find(a => a.name === s.name);
    if (actor) actor.hasHyperion = true;
  }

  // 입수 조건 로드
  for (const s of data.acquisition) {
    const actor = actors.find(a => a.name === s.name);
    if (actor) {
      actor.acquisitionMethod = s.get('method', '');
      actor.acquisitionDifficulty = s.getInt('difficulty', 0);
    }
  }

  // npc-interaction acquisition 파서용: 칭호 display name → titleId 매핑 빌드
  // titles.txt의 [section] 이름을 titleId, name= 을 표시명으로 사용.
  // title-system.ts가 쓰는 한글 칭호ID(표시명=ID)와 titles.txt의 영문ID 둘 다 매핑.
  const titleMap = new Map<string, string>();
  for (const s of data.titles) {
    const displayName = s.get('name', s.name);
    titleMap.set(displayName, s.name);
    // title-system.ts의 TITLE_CONDITIONS는 한글 ID 사용 (예: '첫 수확')
    // 같은 이름이 ID로도 쓰이는 경우를 대비해 표시명→표시명도 등록
    titleMap.set(s.name, s.name);
  }
  rebuildTitleNameMap(titleMap);

  const diagnosticQuestions = parseDiagnosticQuestions(data.diagnostic);

  // 마을 시설/도로/이벤트 정의 로드
  initVillageFacilities(data.villageFacilities);
  initVillageRoads(data.villageRoads);
  initVillageEvents(data.villageEvents);
  initBenzenLines(data.benzenLines);

  // 컬러 서사 / NPC 퀘스트 / 대화 선택지 로드
  initColorNarratives(data.colorNarratives);
  clearNpcQuestDefs();
  initNpcQuests(data.npcQuests);
  initDialogueChoices(data.dialogueChoices);

  // 이벤트 전투 정의 로드 (acquisition용 단발 전투)
  loadEventBattles(data.eventBattles);

  return { actors, world, events, dungeonSystem, activitySystem, diagnosticQuestions, warnings };
}
