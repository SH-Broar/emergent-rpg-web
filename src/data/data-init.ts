// data-init.ts — DataSection[] → 모델 인스턴스 변환
// 원본: GameData::InitAll

import { DataSection, parsePairList, parseFloatList, parseStringList, parseColorInfluence, parseLootList, parseTripleList } from './parser';
import { GameRegistry } from '../types/registry';
import { parseRace, parseSpiritRole, parseItemType, parseTrait, ELEMENT_COUNT } from '../types/enums';
import { parseLocationID } from '../types/location';
import { Actor } from '../models/actor';
import { World, createLocationData } from '../models/world';
import { EventSystem, createGameEvent } from '../models/event';
import { DungeonSystem, DungeonEventType } from '../models/dungeon';
import { ActivitySystem } from '../models/activity';
import { loadHyperion } from '../systems/hyperion';
import type { GameDataFiles } from './loader';

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

    world.setLocation(id, data);
  }
  world.rebuildTravelGraph();
  world.initMarketFromRegistry();
}

// --- actors.txt ---
export function initActors(sections: DataSection[]): Actor[] {
  const actors: Actor[] = [];
  for (const s of sections) {
    const race = parseRace(s.get('race', 'Human'));
    const role = parseSpiritRole(s.get('role', 'Villager'));
    const actor = new Actor(s.name, race, role);

    actor.playable = s.getInt('playable', 0) === 1;
    actor.currentLocation = parseLocationID(s.get('location', 'Town_Elimes'));
    actor.homeLocation = parseLocationID(s.get('homeLocation', actor.currentLocation));
    actor.stationary = s.getInt('stationary', 0) === 1;
    actor.isCustom = s.getInt('custom', 0) === 1;

    // Stats
    actor.base.hp = s.getFloat('hp', 100);
    actor.base.maxHp = s.getFloat('maxHp', actor.base.hp);
    actor.base.mp = s.getFloat('mp', 30);
    actor.base.maxMp = s.getFloat('maxMp', actor.base.mp);
    actor.base.attack = s.getFloat('attack', 10);
    actor.base.defense = s.getFloat('defense', 5);
    actor.base.vigor = s.getFloat('vigor', 100);
    actor.base.maxVigor = s.getFloat('maxVigor', 100);
    actor.base.strength = s.getFloat('strength', 0.5);
    actor.base.age = s.getInt('age', 25);
    actor.base.level = s.getInt('level', 1);
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

    // Inventory — "ItemType:amount"
    const inv = s.get('inventory', '');
    if (inv) {
      for (const pair of parsePairList(inv)) {
        actor.spirit.inventory.set(parseItemType(pair[0]), parseInt(pair[1], 10) || 0);
      }
    }

    // Background (pipe = newline)
    actor.background = s.get('background', '');

    actors.push(actor);
  }
  return actors;
}

// --- events.txt ---
export function initEvents(sections: DataSection[], events: EventSystem, _world: World): void {
  for (const s of sections) {
    const ev = createGameEvent(s.name, s.get('description', ''));
    ev.location = parseLocationID(s.get('location', 'Town_Elimes'));

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
): void {
  // monsters — loot는 "Item:amount:chance" 3항 형식
  for (const s of monsterSections) {
    dungeon.addMonster({
      id: s.name,
      name: s.get('name', s.name),
      attack: s.getInt('attack', 10),
      defense: s.getInt('defense', 5),
      hp: s.getInt('hp', 30),
      lootTable: parseLootList(s.get('loot', '')).map(l => ({
        item: parseItemType(l.item), amount: l.amount, chance: l.chance,
      })),
    });
  }

  // dungeons — colorInfluence는 "Element:float", lootPerAdvance는 3항
  for (const s of dungeonSections) {
    dungeon.addDungeon({
      id: s.name,
      name: s.get('name', s.name),
      deepName: s.get('deepName', s.get('name', s.name) + ' 심부'),
      description: s.get('description', ''),
      deepDescription: s.get('deepDescription', ''),
      difficulty: s.getFloat('difficulty', 0.5),
      progressPerAdvance: s.getFloat('progressPerAdvance', 10),
      accessFrom: parseLocationID(s.get('accessFrom', '')),
      enemyIds: parseStringList(s.get('enemies', '')),
      lootOnClear: parseLootList(s.get('lootOnClear', '')).map(l => ({
        item: parseItemType(l.item), amount: l.amount, chance: l.chance,
      })),
      lootPerAdvance: parseLootList(s.get('lootPerAdvance', '')).map(l => ({
        item: parseItemType(l.item), amount: l.amount, chance: l.chance,
      })),
      lootRareChance: s.getFloat('lootRareChance', 0.1),
      lootRare: parseLootList(s.get('lootRare', '')).map(l => ({
        item: parseItemType(l.item), amount: l.amount, chance: l.chance,
      })),
      colorInfluence: parseColorInfluence(s.get('colorInfluence', '')),
    });
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
export function initActivities(sections: DataSection[], activity: ActivitySystem): void {
  for (const s of sections) {
    const locationId = s.name;

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
        gives: parsePairList(s.get(`${prefix}gives`, '')).map(([item, amt]) => ({
          item: parseItemType(item), amount: parseInt(amt, 10) || 1,
        })),
        lootTable: parseLootList(s.get(`${prefix}loot`, '')).map(l => ({
          item: parseItemType(l.item), amount: l.amount, chance: l.chance,
        })),
        colorInfluence: parseColorInfluence(s.get(`${prefix}colorInfluence`, '')),
      });
    }
  }
}

// --- 결과 ---
export interface InitResult {
  actors: Actor[];
  world: World;
  events: EventSystem;
  dungeonSystem: DungeonSystem;
  activitySystem: ActivitySystem;
  warnings: string[];
}

export function initAll(data: GameDataFiles): InitResult {
  const warnings: string[] = [];

  GameRegistry.I.initDefaults();
  initItems(data.items);

  const world = new World();
  initLocations(data.locations, world);

  const actors = initActors(data.actors);
  if (actors.length === 0) warnings.push('No actors loaded');

  const events = new EventSystem();
  initEvents(data.events, events, world);

  const dungeonSystem = new DungeonSystem();
  initDungeonSystem(data.dungeons, data.monsters, data.dungeonEvents, data.combatBehavior, dungeonSystem);

  const activitySystem = new ActivitySystem();
  initActivities(data.activities, activitySystem);

  loadHyperion(data.hyperion);

  return { actors, world, events, dungeonSystem, activitySystem, warnings };
}
