// save-load.ts — 세이브/로드 화면 (localStorage 기반)
// 원본: SaveLoadScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { Actor } from '../../models/actor';
import { PlayerKnowledge } from '../../models/knowledge';
import { getArmorDef } from '../../types/item-defs';

const SAVE_PREFIX = 'emergent_save_';
const SAVE_VERSION = 8;

interface SaveMeta {
  playerName: string;
  day: number;
  hour: number;
  minute: number;
  savedAt: string;
}

interface ActorSaveData {
  name: string;
  race: number;
  role: number;
  playable: boolean;
  hp: number; maxHp: number;
  mp: number; maxMp: number;
  attack: number; defense: number;
  strength: number;
  age: number;
  sleeping: boolean;
  mood: number;
  gold: number;
  location: string;
  homeLocation: string;
  moveDestination: string;
  stationary: boolean;
  hasLearnedMagic: boolean;
  hyperionLevel: number;
  hyperionFlags: boolean[];
  colorValues: number[];
  colorDomainsHigh: number[];
  colorDomainsLow: number[];
  relationships: [string, number, number, number][];
  dungeonProgress: [string, number][];
  dungeonBestTurns?: [string, number][];
  actionCooldown: number;
  learnedSkills?: [string, number][];
  skillOrder?: string[];
  combatJob?: string;
  lifeJob?: string;
  skillUsage?: [string, number][];
  flags?: [string, boolean][];
  variables?: [string, number][];
  lifeJobLevels?: [string, number][];
  lifeJobMissionProgress?: [string, number][];
  // v8: 장비 + 개별 아이템 인벤토리
  equippedWeapon?: string;
  equippedArmor?: string;
  equippedAccessory?: string;
  equippedAccessory2?: string;
  items?: [string, number][];
}

interface KnowledgeSaveData {
  knownNames: string[];
  recruitedEver: string[];
  partyMembers: string[];
  visitedLocations: string[];
  conversationPartners: string[];
  totalConversations: number;
  totalDungeonsCleared: number;
  totalMonstersKilled: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  maxSingleDamage: number;
  totalTreasureFound: number;
  monsterTypesKilled: string[];
  totalGoldSpent: number;
  totalItemsSold: number;
  totalItemsCrafted: number;
  totalActivitiesDone: number;
  foodTypesEaten: string[];
  companionDays: [string, number][];
  locationReputation: [string, number][];
  totalGiftsGiven: number;
  discoveredItems: string[];
  earnedTitles: string[];
  activeTitle: string;
  ownedBases: string[];
  bagCapacity: number;
  storage: [string, { cold: [string, number][], room: [string, number][], warm: [string, number][] }][];
  baseLevels: [string, number][];
  baseInvitedNpcs: [string, string[]][];
  farmStates: [string, any][];
  lastNapDay: number;
  totalFishCaught?: number;
  totalWeatherChecked?: number;
  totalPotionsMade?: number;
  totalSongsPlayed?: number;
  totalMapsDrawn?: number;
  totalBlessingsGiven?: number;
  totalEquipRepaired?: number;
  totalMovesDone?: number;
  totalDungeonBattlesWithCompanion?: number;
}

interface SaveData {
  version: number;
  meta: SaveMeta;
  playerIdx: number;
  gameTimeDay: number;
  gameTimeHour: number;
  gameTimeMinute: number;
  actors: ActorSaveData[];
  knowledge: KnowledgeSaveData;
  seasonCurrent: number;
  seasonWeekStartDay: number;
  worldColor: number[];
  weather: number;
}

function syncLoadedPlayerHyperion(session: GameSession): void {
  if (!session.isValid) return;
  const player = session.player;
  const oldMaxHp = Math.max(1, player.getEffectiveMaxHp());
  const oldMaxMp = Math.max(1, player.getEffectiveMaxMp());
  const hpRatio = Math.max(0, Math.min(1, player.base.hp / oldMaxHp));
  const mpRatio = Math.max(0, Math.min(1, player.base.mp / oldMaxMp));
  const totalHyperion = session.actors.reduce((sum, actor) => sum + actor.hyperionLevel, 0);

  player.hyperionBonus = totalHyperion - player.hyperionLevel;

  const newMaxHp = player.getEffectiveMaxHp();
  const newMaxMp = player.getEffectiveMaxMp();
  player.base.hp = Math.round(newMaxHp * hpRatio);
  player.base.mp = Math.round(newMaxMp * mpRatio);
}

function serializeActor(actor: Actor): ActorSaveData {
  const colorDomainsHigh: number[] = actor.color.domains.map(d => d.highTrait as number);
  const colorDomainsLow: number[] = actor.color.domains.map(d => d.lowTrait as number);

  const relationships: [string, number, number, number][] = [];
  for (const [name, rel] of actor.relationships) {
    relationships.push([name, rel.trust, rel.affinity, rel.interactionCount]);
  }

  const dungeonProgress: [string, number][] = [];
  for (const [id, progress] of actor.dungeonProgress) {
    dungeonProgress.push([id, progress]);
  }

  const dungeonBestTurns: [string, number][] = [];
  for (const [id, turns] of actor.dungeonBestTurns) {
    dungeonBestTurns.push([id, turns]);
  }

  // variables에서 granted_skill:* 키는 제외 — 로드 시 장비 재장착으로 자동 복원
  const filteredVariables: [string, number][] = [];
  for (const [key, val] of actor.variables) {
    if (key.startsWith('granted_skill:')) continue;
    filteredVariables.push([key, val]);
  }

  return {
    name: actor.name,
    race: actor.base.race as number,
    role: actor.spirit.role as number,
    playable: actor.playable,
    hp: actor.base.hp,
    maxHp: actor.base.maxHp,
    mp: actor.base.mp,
    maxMp: actor.base.maxMp,
    attack: actor.base.attack,
    defense: actor.base.defense,
    strength: actor.base.strength,
    age: actor.base.age,
    sleeping: actor.base.sleeping,
    mood: actor.base.mood,
    gold: actor.spirit.gold,
    location: actor.currentLocation,
    homeLocation: actor.homeLocation,
    moveDestination: actor.moveDestination,
    stationary: actor.stationary,
    hasLearnedMagic: actor.hasLearnedMagic,
    hyperionLevel: actor.hyperionLevel,
    hyperionFlags: [...actor.hyperionFlags],
    colorValues: [...actor.color.values],
    colorDomainsHigh,
    colorDomainsLow,
    relationships,
    dungeonProgress,
    dungeonBestTurns,
    actionCooldown: actor.actionCooldown,
    learnedSkills: [...actor.learnedSkills.entries()],
    skillOrder: [...actor.skillOrder],
    combatJob: actor.combatJob || undefined,
    lifeJob: actor.lifeJob || undefined,
    skillUsage: [...actor.skillUsage.entries()],
    flags: [...actor.flags.entries()],
    variables: filteredVariables,
    lifeJobLevels: [...actor.lifeJobLevels.entries()],
    lifeJobMissionProgress: [...actor.lifeJobMissionProgress.entries()],
    // v8: 장비 + 개별 아이템 인벤토리
    equippedWeapon: actor.equippedWeapon,
    equippedArmor: actor.equippedArmor,
    equippedAccessory: actor.equippedAccessory,
    equippedAccessory2: actor.equippedAccessory2,
    items: [...actor.items.entries()],
  };
}

function deserializeActor(data: ActorSaveData, target: Actor): void {
  target.name = data.name;
  target.base.race = data.race;
  target.spirit.role = data.role;
  target.playable = data.playable;
  target.base.hp = data.hp;
  target.base.maxHp = data.maxHp;
  target.base.mp = data.mp;
  target.base.maxMp = data.maxMp;
  target.base.attack = data.attack;
  target.base.defense = data.defense;
  target.base.strength = data.strength;
  target.base.age = data.age;
  target.base.sleeping = data.sleeping;
  target.base.mood = data.mood;
  target.spirit.gold = data.gold;
  target.currentLocation = data.location;
  target.homeLocation = data.homeLocation;
  target.moveDestination = data.moveDestination;
  target.stationary = data.stationary;
  target.hasLearnedMagic = data.hasLearnedMagic;
  target.hyperionLevel = data.hyperionLevel;
  target.hyperionFlags = [...data.hyperionFlags];
  target.actionCooldown = data.actionCooldown;
  target.combatJob = data.combatJob ?? '';
  target.lifeJob = data.lifeJob ?? '';

  // v8: 개별 아이템 인벤토리 복원 (장비류 + 개별 ID 아이템)
  target.items.clear();
  for (const [id, qty] of (data.items ?? [])) {
    if (qty > 0) target.items.set(id, qty);
  }

  // 장비 슬롯 복원
  target.equippedWeapon = data.equippedWeapon ?? '';
  target.equippedArmor = data.equippedArmor ?? '';
  target.equippedAccessory = data.equippedAccessory ?? '';
  target.equippedAccessory2 = data.equippedAccessory2 ?? '';

  // Restore color profile
  target.color.values = [...data.colorValues];
  for (let i = 0; i < data.colorDomainsHigh.length; i++) {
    if (target.color.domains[i]) {
      target.color.domains[i].highTrait = data.colorDomainsHigh[i];
      target.color.domains[i].lowTrait = data.colorDomainsLow[i];
    }
  }

  // Restore relationships
  target.relationships.clear();
  for (const [name, trust, affinity, count] of data.relationships) {
    target.relationships.set(name, { trust, affinity, interactionCount: count });
  }

  // Restore dungeon progress
  target.dungeonProgress.clear();
  for (const [id, progress] of data.dungeonProgress) {
    target.dungeonProgress.set(id, progress);
  }

  target.dungeonBestTurns.clear();
  if (data.dungeonBestTurns) {
    for (const [id, turns] of data.dungeonBestTurns) {
      target.dungeonBestTurns.set(id, turns);
    }
  }

  // Restore skill data (v6+)
  if (data.learnedSkills) {
    target.learnedSkills.clear();
    for (const [id, level] of data.learnedSkills) {
      target.learnedSkills.set(id, level);
    }
  }
  if (data.skillOrder) {
    target.skillOrder = [...data.skillOrder];
  }
  if (data.skillUsage) {
    target.skillUsage.clear();
    for (const [id, uses] of data.skillUsage) {
      target.skillUsage.set(id, uses);
    }
  }
  if (data.flags) {
    target.flags.clear();
    for (const [key, val] of data.flags) target.flags.set(key, val);
  }
  if (data.variables) {
    target.variables.clear();
    for (const [key, val] of data.variables) target.variables.set(key, val);
  }
  if (data.lifeJobLevels) {
    target.lifeJobLevels.clear();
    for (const [key, val] of data.lifeJobLevels) target.lifeJobLevels.set(key, val);
  }
  if (data.lifeJobMissionProgress) {
    target.lifeJobMissionProgress.clear();
    for (const [key, val] of data.lifeJobMissionProgress) target.lifeJobMissionProgress.set(key, val);
  }
}

function serializeKnowledge(k: PlayerKnowledge): KnowledgeSaveData {
  return {
    knownNames: [...k.knownActorNames],
    recruitedEver: [...k.recruitedEver],
    partyMembers: [...k.partyMembers],
    visitedLocations: [...k.visitedLocations],
    conversationPartners: [...k.conversationPartners],
    totalConversations: k.totalConversations,
    totalDungeonsCleared: k.totalDungeonsCleared,
    totalMonstersKilled: k.totalMonstersKilled,
    totalDamageDealt: k.totalDamageDealt,
    totalDamageTaken: k.totalDamageTaken,
    maxSingleDamage: k.maxSingleDamage,
    totalTreasureFound: k.totalTreasureFound,
    monsterTypesKilled: [...k.monsterTypesKilled],
    totalGoldSpent: k.totalGoldSpent,
    totalItemsSold: k.totalItemsSold,
    totalItemsCrafted: k.totalItemsCrafted,
    totalActivitiesDone: k.totalActivitiesDone,
    foodTypesEaten: [...k.foodTypesEaten],
    companionDays: [...k.companionDaysMap.entries()],
    locationReputation: [...k.locationReputation.entries()],
    totalGiftsGiven: k.totalGiftsGiven,
    discoveredItems: [...k.discoveredItems],
    earnedTitles: [...k.earnedTitles],
    activeTitle: k.activeTitle,
    ownedBases: [...k.ownedBases],
    bagCapacity: k.bagCapacity,
    storage: [...k.storage.entries()].map(([loc, zones]) => [loc, {
      cold: [...zones.cold.entries()],
      room: [...zones.room.entries()],
      warm: [...zones.warm.entries()],
    }]),
    baseLevels: [...k.baseLevels.entries()],
    baseInvitedNpcs: [...k.baseInvitedNpcs.entries()],
    farmStates: [...k.farmStates.entries()].map(([loc, farm]) => [loc, {
      ...farm,
      cells: farm.cells.map(c => ({ ...c })),
    }]),
    lastNapDay: k.lastNapDay,
    totalFishCaught: k.totalFishCaught,
    totalWeatherChecked: k.totalWeatherChecked,
    totalPotionsMade: k.totalPotionsMade,
    totalSongsPlayed: k.totalSongsPlayed,
    totalMapsDrawn: k.totalMapsDrawn,
    totalBlessingsGiven: k.totalBlessingsGiven,
    totalEquipRepaired: k.totalEquipRepaired,
    totalMovesDone: k.totalMovesDone,
    totalDungeonBattlesWithCompanion: k.totalDungeonBattlesWithCompanion,
  };
}

function deserializeKnowledge(data: KnowledgeSaveData, target: PlayerKnowledge): void {
  target.knownActorNames = new Set(data.knownNames);
  target.recruitedEver = new Set(data.recruitedEver);
  target.partyMembers = [...data.partyMembers];
  target.visitedLocations = new Set(data.visitedLocations);
  target.conversationPartners = new Set(data.conversationPartners);
  target.totalConversations = data.totalConversations;
  target.totalDungeonsCleared = data.totalDungeonsCleared;
  target.totalMonstersKilled = data.totalMonstersKilled;
  target.totalDamageDealt = data.totalDamageDealt;
  target.totalDamageTaken = data.totalDamageTaken;
  target.maxSingleDamage = data.maxSingleDamage;
  target.totalTreasureFound = data.totalTreasureFound;
  target.monsterTypesKilled = new Set(data.monsterTypesKilled);
  target.totalGoldSpent = data.totalGoldSpent;
  target.totalItemsSold = data.totalItemsSold;
  target.totalItemsCrafted = data.totalItemsCrafted;
  target.totalActivitiesDone = data.totalActivitiesDone;
  target.foodTypesEaten = new Set(data.foodTypesEaten);
  target.companionDaysMap = new Map(data.companionDays);
  target.locationReputation = new Map(data.locationReputation);
  target.totalGiftsGiven = data.totalGiftsGiven;
  target.discoveredItems = new Set(data.discoveredItems ?? []);
  target.earnedTitles = [...data.earnedTitles];
  target.activeTitle = data.activeTitle;
  target.ownedBases = new Set(data.ownedBases ?? []);
  target.bagCapacity = data.bagCapacity ?? 10;
  target.storage = new Map(
    (data.storage ?? []).map(([loc, zones]) => [loc, {
      cold: new Map(zones?.cold ?? []),
      room: new Map(zones?.room ?? []),
      warm: new Map(zones?.warm ?? []),
    }])
  );
  target.baseLevels = new Map(data.baseLevels ?? []);
  target.baseInvitedNpcs = new Map(data.baseInvitedNpcs ?? []);
  target.farmStates = new Map(
    (data.farmStates ?? []).map(([loc, farm]) => [loc, {
      ...farm,
      cells: (farm?.cells ?? []).map((c: any) => ({ ...c })),
    }])
  );
  target.lastNapDay = data.lastNapDay ?? -1;
  target.totalFishCaught = data.totalFishCaught ?? 0;
  target.totalWeatherChecked = data.totalWeatherChecked ?? 0;
  target.totalPotionsMade = data.totalPotionsMade ?? 0;
  target.totalSongsPlayed = data.totalSongsPlayed ?? 0;
  target.totalMapsDrawn = data.totalMapsDrawn ?? 0;
  target.totalBlessingsGiven = data.totalBlessingsGiven ?? 0;
  target.totalEquipRepaired = data.totalEquipRepaired ?? 0;
  target.totalMovesDone = data.totalMovesDone ?? 0;
  target.totalDungeonBattlesWithCompanion = data.totalDungeonBattlesWithCompanion ?? 0;
}

function getSaveMeta(slot: number): SaveMeta | null {
  const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { meta?: SaveMeta };
    return data.meta ?? null;
  } catch {
    return null;
  }
}

export function saveToSlot(slot: number, session: GameSession): void {
  const p = session.player;
  const actors = session.actors.map(serializeActor);
  const data: SaveData = {
    version: SAVE_VERSION,
    meta: {
      playerName: p?.name ?? '???',
      day: session.gameTime.day,
      hour: session.gameTime.hour,
      minute: session.gameTime.minute,
      savedAt: new Date().toISOString(),
    },
    playerIdx: session.playerIdx,
    gameTimeDay: session.gameTime.day,
    gameTimeHour: session.gameTime.hour,
    gameTimeMinute: session.gameTime.minute,
    actors,
    knowledge: serializeKnowledge(session.knowledge),
    seasonCurrent: session.world.seasonSchedule.current as number,
    seasonWeekStartDay: session.world.seasonSchedule.weekStartDay,
    worldColor: [...session.world.worldColor],
    weather: session.world.weather as number,
  };
  localStorage.setItem(`${SAVE_PREFIX}${slot}`, JSON.stringify(data));
}

export function loadFromSlot(slot: number, session: GameSession): boolean {
  const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (!parsed.version || !parsed.actors) return false;

    const data = parsed as SaveData;
    session.playerIdx = data.playerIdx;
    session.gameTime.day = data.gameTimeDay;
    session.gameTime.hour = data.gameTimeHour;
    session.gameTime.minute = data.gameTimeMinute;

    // Restore actors: match by index, create new actors if needed
    for (let i = 0; i < data.actors.length; i++) {
      const actorData = data.actors[i];
      if (i < session.actors.length) {
        deserializeActor(actorData, session.actors[i]);
      } else {
        const newActor = new Actor(actorData.name, actorData.race, actorData.role);
        deserializeActor(actorData, newActor);
        session.actors.push(newActor);
      }
    }
    // Trim extra actors if saved state had fewer
    if (data.actors.length < session.actors.length) {
      session.actors.length = data.actors.length;
    }

    // Restore knowledge
    deserializeKnowledge(data.knowledge, session.knowledge);

    // Restore world season/weather/color
    session.world.seasonSchedule.current = data.seasonCurrent;
    session.world.seasonSchedule.weekStartDay = data.seasonWeekStartDay;
    session.world.worldColor = [...data.worldColor];
    session.world.weather = data.weather;

    // 장비 grantedSkill 재동기화 (장착된 방어구/악세서리의 임시 스킬 재적용)
    for (const actor of session.actors) {
      for (const slotId of [actor.equippedAccessory, actor.equippedAccessory2, actor.equippedArmor]) {
        if (!slotId) continue;
        const armor = getArmorDef(slotId);
        if (armor?.grantedSkill) actor.grantSkillFromEquip(armor.grantedSkill);
      }
    }

    syncLoadedPlayerHyperion(session);

    return true;
  } catch {
    return false;
  }
}

export function createSaveLoadScreen(
  session: GameSession,
  isSave: boolean,
  onDone: () => void,
): Screen {
  let message = '';

  function renderSaveLoad(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen save-load-screen';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.dataset.back = '';
    backBtn.textContent = '\u2190 \ub4a4\ub85c [Esc]';
    backBtn.style.minHeight = '44px';
    backBtn.addEventListener('click', onDone);
    wrap.appendChild(backBtn);

    const title = document.createElement('h2');
    title.textContent = '\uc624\ud1a0\uc138\uc774\ube0c';
    wrap.appendChild(title);

    if (message) {
      const msg = document.createElement('div');
      msg.className = 'trade-message';
      msg.style.color = 'var(--success)';
      msg.textContent = message;
      wrap.appendChild(msg);
    }

    // Autosave-only: show slot 0 only
    const meta = getSaveMeta(0);
    const list = document.createElement('div');
    list.className = 'npc-list';

    const btn = document.createElement('button');
    btn.className = 'btn npc-item';
    btn.style.minHeight = '44px';
    btn.dataset.slot = '0';

    if (meta) {
      const timeStr = `${String(meta.hour).padStart(2, '0')}:${String(meta.minute).padStart(2, '0')}`;
      btn.innerHTML = `
        <span class="npc-num">A</span>
        <span class="npc-name">${meta.playerName} \u2014 ${meta.day}\uc77c\ucc28 ${timeStr}</span>
        <span class="npc-detail">${meta.savedAt}</span>
      `;
    } else {
      btn.innerHTML = `
        <span class="npc-num">A</span>
        <span class="npc-name">\uc800\uc7a5 \ub370\uc774\ud130 \uc5c6\uc74c</span>
        <span class="npc-detail"></span>
      `;
    }

    btn.addEventListener('click', () => executeAutosave(el));
    list.appendChild(btn);
    wrap.appendChild(list);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Enter \ub610\ub294 \ubc84\ud2bc\uc73c\ub85c \uc624\ud1a0\uc138\uc774\ube0c \ubd88\ub7ec\uc624\uae30, Esc \ub4a4\ub85c';
    wrap.appendChild(hint);

    el.appendChild(wrap);
  }

  function executeAutosave(el: HTMLElement): void {
    if (isSave) {
      saveToSlot(0, session);
      message = '\uc624\ud1a0\uc138\uc774\ube0c \uc644\ub8cc!';
      session.backlog.add(session.gameTime, message, '\uc2dc\uc2a4\ud15c');
      renderSaveLoad(el);
    } else {
      const meta = getSaveMeta(0);
      if (!meta) {
        message = '\uc800\uc7a5 \ub370\uc774\ud130\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.';
        renderSaveLoad(el);
        return;
      }
      if (loadFromSlot(0, session)) {
        message = '\ub85c\ub4dc \uc644\ub8cc!';
        session.backlog.add(session.gameTime, '\uac8c\uc784\uc744 \ub85c\ub4dc\ud588\ub2e4.', '\uc2dc\uc2a4\ud15c');
        onDone();
      } else {
        message = '\ub85c\ub4dc \uc2e4\ud328!';
        renderSaveLoad(el);
      }
    }
  }

  return {
    id: 'save-load',
    render: renderSaveLoad,
    onKey(key) {
      const container = document.querySelector('.save-load-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') { onDone(); return; }
      if (key === 'Enter' || key === '1') {
        executeAutosave(container);
      }
    },
  };
}
