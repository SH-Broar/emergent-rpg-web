// save-system.ts — localStorage 기반 세이브/로드 시스템

import { GameSession } from './game-session';
import { Actor } from '../models/actor';
import { World, createLocationData } from '../models/world';
import { SocialHub } from '../models/social';
import { PlayerKnowledge } from '../models/knowledge';
import { Backlog } from '../models/backlog';
import { ColorProfile, ColorGaugeState } from '../models/color';
import { GameTime } from '../types/game-time';
import { ActivitySystem } from '../models/activity';
import { EventSystem } from '../models/event';
import { DungeonSystem } from '../models/dungeon';
import { VillageState } from '../models/village';
import { getArmorDef } from '../types/item-defs';

// ============================================================
// Constants
// ============================================================

export const SAVE_VERSION = 6;
export const SLOT_COUNT = 4; // 0 = autosave, 1-3 = manual
export const STORAGE_KEY_PREFIX = 'rdc-save-';

// ============================================================
// SaveMeta
// ============================================================

export interface SaveMeta {
  slot: number;
  playerName: string;
  timestamp: number;
  playMinutes: number;
  version: number;
}

// ============================================================
// Serialization helpers
// ============================================================

function serializeGameTime(t: GameTime): object {
  return { day: t.day, hour: t.hour, minute: t.minute };
}

function deserializeGameTime(d: any): GameTime {
  const t = new GameTime();
  t.day = d.day ?? 1;
  t.hour = d.hour ?? 6;
  t.minute = d.minute ?? 0;
  return t;
}

function serializeColorProfile(c: ColorProfile): object {
  return { values: [...c.values], domains: c.domains.map(d => ({ ...d })) };
}

function deserializeColorProfile(d: any): ColorProfile {
  const c = new ColorProfile();
  if (Array.isArray(d.values)) c.values = [...d.values];
  if (Array.isArray(d.domains)) c.domains = d.domains.map((x: any) => ({ ...x }));
  return c;
}

function serializeActor(a: Actor): object {
  // grantedSkill로 부여된 스킬은 세이브에서 제외 (장비 재장착으로 자동 복원)
  const filteredVars: [string, number][] = [];
  for (const [k, v] of a.variables) {
    if (k.startsWith('granted_skill:')) continue;
    filteredVars.push([k, v]);
  }
  return {
    name: a.name,
    base: { ...a.base },
    spirit: { ...a.spirit },
    color: serializeColorProfile(a.color),
    currentLocation: a.currentLocation,
    moveDestination: a.moveDestination,
    travelNextStep: a.travelNextStep,
    travelRemainingMinutes: a.travelRemainingMinutes,
    actionCooldown: a.actionCooldown,
    playable: a.playable,
    isCustom: a.isCustom,
    homeLocation: a.homeLocation,
    relationships: [...a.relationships.entries()].map(([k, v]) => [k, { ...v }]),
    memories: a.memories.map(m => ({ ...m, when: serializeGameTime(m.when) })),
    dungeonProgress: [...a.dungeonProgress.entries()],
    dungeonBestTurns: [...a.dungeonBestTurns.entries()],
    background: a.background,
    hasLearnedMagic: a.hasLearnedMagic,
    stationary: a.stationary,
    hyperionLevel: a.hyperionLevel,
    hyperionFlags: [...a.hyperionFlags],
    lastTickHour: a.lastTickHour,
    lifeData: { ...a.lifeData },
    flags: [...a.flags.entries()],
    variables: filteredVars,
    items: [...a.items.entries()],
    equippedWeapon: a.equippedWeapon,
    equippedArmor: a.equippedArmor,
    equippedAccessory: a.equippedAccessory,
    equippedAccessory2: a.equippedAccessory2,
    puchiTowerHighestFloor: a.puchiTowerHighestFloor,
  };
}

function deserializeActor(d: any): Actor {
  const a = new Actor(d.name, d.base?.race ?? 0, d.spirit?.role ?? 0);
  a.base = { ...d.base };
  a.spirit = {
    ...d.spirit,
    inventory: new Map(d.spirit?.inventory ?? []),
  };
  a.color = deserializeColorProfile(d.color ?? {});
  a.currentLocation = d.currentLocation ?? '';
  a.moveDestination = d.moveDestination ?? '';
  a.travelNextStep = d.travelNextStep ?? '';
  a.travelRemainingMinutes = d.travelRemainingMinutes ?? 0;
  a.actionCooldown = d.actionCooldown ?? 0;
  a.playable = d.playable ?? true;
  a.isCustom = d.isCustom ?? false;
  a.homeLocation = d.homeLocation ?? '';
  a.relationships = new Map(
    (d.relationships ?? []).map(([k, v]: [string, any]) => [k, { ...v }])
  );
  a.memories = (d.memories ?? []).map((m: any) => ({ ...m, when: deserializeGameTime(m.when) }));
  a.dungeonProgress = new Map(d.dungeonProgress ?? []);
  a.dungeonBestTurns = new Map(d.dungeonBestTurns ?? []);
  a.background = d.background ?? '';
  a.hasLearnedMagic = d.hasLearnedMagic ?? false;
  a.stationary = d.stationary ?? false;
  a.hyperionLevel = d.hyperionLevel ?? 0;
  a.hyperionFlags = d.hyperionFlags ?? [false, false, false, false, false];
  a.lastTickHour = d.lastTickHour ?? 6;
  a.lifeData = { ...a.lifeData, ...(d.lifeData ?? {}) };
  a.flags = new Map(d.flags ?? []);
  a.variables = new Map(d.variables ?? []);
  a.items = new Map(d.items ?? []);
  a.equippedWeapon = d.equippedWeapon ?? '';
  a.equippedArmor = d.equippedArmor ?? '';
  a.equippedAccessory = d.equippedAccessory ?? '';
  a.equippedAccessory2 = d.equippedAccessory2 ?? '';
  a.puchiTowerHighestFloor = d.puchiTowerHighestFloor ?? 0;
  return a;
}

function serializeWorld(w: World): object {
  const locations: any[] = [];
  for (const [id, loc] of w.getAllLocations()) {
    locations.push({
      id,
      description: loc.description,
      resources: [...loc.resources.entries()],
      monsterLevel: loc.monsterLevel,
      dangerLevel: loc.dangerLevel,
      gridX: loc.gridX,
      gridY: loc.gridY,
      linksBidirectional: loc.linksBidirectional,
      linksOneWayOut: loc.linksOneWayOut,
      resourceCaps: [...loc.resourceCaps.entries()].map(([k, v]) => [k, { ...v }]),
      racialSynergy: loc.racialSynergy,
    });
  }

  return {
    locations,
    gridMinutesPerUnit: w.getGridMinutesPerUnit(),
    worldColor: [...w.worldColor],
    weather: w.weather,
    temperature: w.temperature,
    seasonSchedule: {
      current: w.seasonSchedule.current,
      dayInSeason: (w.seasonSchedule as any).dayInSeason,
      daysPerSeason: (w.seasonSchedule as any).daysPerSeason,
    },
  };
}

function deserializeWorld(d: any): World {
  const w = new World();
  if (typeof d.gridMinutesPerUnit === 'number') w.setGridMinutesPerUnit(d.gridMinutesPerUnit);
  if (Array.isArray(d.worldColor)) w.worldColor = [...d.worldColor];
  if (d.weather !== undefined) w.weather = d.weather;
  if (typeof d.temperature === 'number') w.temperature = d.temperature;

  if (d.seasonSchedule) {
    w.seasonSchedule.current = d.seasonSchedule.current;
    if (typeof d.seasonSchedule.dayInSeason === 'number')
      (w.seasonSchedule as any).dayInSeason = d.seasonSchedule.dayInSeason;
    if (typeof d.seasonSchedule.daysPerSeason === 'number')
      (w.seasonSchedule as any).daysPerSeason = d.seasonSchedule.daysPerSeason;
  }

  for (const loc of (d.locations ?? [])) {
    const locData = createLocationData(loc.id);
    locData.description = loc.description ?? '';
    locData.resources = new Map(loc.resources ?? []);
    locData.monsterLevel = loc.monsterLevel ?? 0;
    locData.dangerLevel = loc.dangerLevel ?? 0;
    locData.gridX = loc.gridX ?? 0;
    locData.gridY = loc.gridY ?? 0;
    locData.linksBidirectional = loc.linksBidirectional ?? [];
    locData.linksOneWayOut = loc.linksOneWayOut ?? [];
    locData.resourceCaps = new Map(
      (loc.resourceCaps ?? []).map(([k, v]: [any, any]) => [k, { ...v }])
    );
    locData.racialSynergy = loc.racialSynergy ?? 0;
    w.setLocation(loc.id, locData);
  }

  w.rebuildTravelGraph();
  return w;
}

function serializeSocialHub(s: SocialHub): object {
  const heardRumorsArr: [string, number[]][] = [];
  // Access private fields via cast for serialization
  const raw = s as any;
  if (raw.heardRumors instanceof Map) {
    for (const [k, v] of raw.heardRumors) {
      heardRumorsArr.push([k, [...(v as Set<number>)]]);
    }
  }

  return {
    rumors: [...s.getRumors()].map(r => ({
      ...r,
      createdAt: serializeGameTime(r.createdAt),
    })),
    heardRumors: heardRumorsArr,
    quests: [...s.getAllQuests()].map(q => ({
      ...q,
      postedAt: serializeGameTime(q.postedAt),
      deadline: serializeGameTime(q.deadline),
    })),
    nextQuestId: s.getNextQuestId(),
  };
}

function deserializeSocialHub(d: any): SocialHub {
  const s = new SocialHub();
  const raw = s as any;

  for (const r of (d.rumors ?? [])) {
    s.addRumor({ ...r, createdAt: deserializeGameTime(r.createdAt) });
  }

  raw.heardRumors = new Map(
    (d.heardRumors ?? []).map(([k, arr]: [string, number[]]) => [k, new Set(arr)])
  );

  raw.quests = (d.quests ?? []).map((q: any) => ({
    ...q,
    postedAt: deserializeGameTime(q.postedAt),
    deadline: deserializeGameTime(q.deadline),
  }));

  if (typeof d.nextQuestId === 'number') raw.nextQuestId = d.nextQuestId;

  return s;
}

function serializeKnowledge(k: PlayerKnowledge): object {
  return {
    knownActorNames: [...k.knownActorNames],
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
    discoveredItems: [...k.discoveredItems],
    totalGoldSpent: k.totalGoldSpent,
    totalItemsSold: k.totalItemsSold,
    totalItemsCrafted: k.totalItemsCrafted,
    totalActivitiesDone: k.totalActivitiesDone,
    foodTypesEaten: [...k.foodTypesEaten],
    companionDaysMap: [...k.companionDaysMap.entries()],
    locationReputation: [...k.locationReputation.entries()],
    totalGiftsGiven: k.totalGiftsGiven,
    totalGathersDone: k.totalGathersDone,
    totalCooksDone: k.totalCooksDone,
    totalFarmHarvests: k.totalFarmHarvests,
    completedQuestCount: k.completedQuestCount,
    completedQuestNames: [...k.completedQuestNames],
    earnedTitles: [...k.earnedTitles],
    activeTitle: k.activeTitle,
    ownedBases: [...k.ownedBases],
    bagCapacity: k.bagCapacity,
    storage: [...k.storage.entries()].map(([loc, zones]) => [loc, {
      cold: [...zones.cold.entries()],
      room: [...zones.room.entries()],
      warm: [...zones.warm.entries()],
    }]),
    storageDegradation: [...k.storageDegradation.entries()].map(([loc, zones]) => [loc, {
      cold: [...zones.cold.entries()],
      room: [...zones.room.entries()],
      warm: [...zones.warm.entries()],
    }]),
    withdrawnItemDegradation: [...k.withdrawnItemDegradation.entries()],
    baseLevels: [...k.baseLevels.entries()],
    baseInvitedNpcs: [...k.baseInvitedNpcs.entries()],
    farmStates: [...k.farmStates.entries()].map(([loc, farm]) => [loc, {
      ...farm,
      cells: farm.cells.map(c => ({ ...c })),
    }]),
    lastNapDay: k.lastNapDay,
    villageState: k.villageState ? serializeVillageState(k.villageState) : null,
    seenDialogueChoices: [...k.seenDialogueChoices],
    activeNpcQuests: [...k.activeNpcQuests.entries()].map(([id, s]) => [id, { ...s }]),
    completedNpcQuestIds: [...k.completedNpcQuestIds],
    totalVigorSpent: k.totalVigorSpent,
    completedEvents: [...k.completedEvents],
  };
}

function deserializeKnowledge(d: any): PlayerKnowledge {
  const k = new PlayerKnowledge();
  k.knownActorNames = new Set(d.knownActorNames ?? []);
  k.recruitedEver = new Set(d.recruitedEver ?? []);
  k.partyMembers = d.partyMembers ?? [];
  k.visitedLocations = new Set(d.visitedLocations ?? []);
  k.conversationPartners = new Set(d.conversationPartners ?? []);
  k.totalConversations = d.totalConversations ?? 0;
  k.totalDungeonsCleared = d.totalDungeonsCleared ?? 0;
  k.totalMonstersKilled = d.totalMonstersKilled ?? 0;
  k.totalDamageDealt = d.totalDamageDealt ?? 0;
  k.totalDamageTaken = d.totalDamageTaken ?? 0;
  k.maxSingleDamage = d.maxSingleDamage ?? 0;
  k.totalTreasureFound = d.totalTreasureFound ?? 0;
  k.monsterTypesKilled = new Set(d.monsterTypesKilled ?? []);
  k.discoveredItems = new Set(d.discoveredItems ?? []);
  k.totalGoldSpent = d.totalGoldSpent ?? 0;
  k.totalItemsSold = d.totalItemsSold ?? 0;
  k.totalItemsCrafted = d.totalItemsCrafted ?? 0;
  k.totalActivitiesDone = d.totalActivitiesDone ?? 0;
  k.foodTypesEaten = new Set(d.foodTypesEaten ?? []);
  k.companionDaysMap = new Map(d.companionDaysMap ?? []);
  k.locationReputation = new Map(d.locationReputation ?? []);
  k.totalGiftsGiven = d.totalGiftsGiven ?? 0;
  k.totalGathersDone = d.totalGathersDone ?? 0;
  k.totalCooksDone = d.totalCooksDone ?? 0;
  k.totalFarmHarvests = d.totalFarmHarvests ?? 0;
  k.completedQuestCount = d.completedQuestCount ?? 0;
  k.completedQuestNames = new Set(d.completedQuestNames ?? []);
  k.earnedTitles = d.earnedTitles ?? [];
  k.activeTitle = d.activeTitle ?? '';
  k.ownedBases = new Set(d.ownedBases ?? []);
  k.bagCapacity = d.bagCapacity ?? 10;
  k.storage = new Map(
    (d.storage ?? []).map(([loc, zones]: [string, any]) => [loc, {
      cold: new Map(zones?.cold ?? []),
      room: new Map(zones?.room ?? []),
      warm: new Map(zones?.warm ?? []),
    }])
  );
  k.storageDegradation = new Map(
    (d.storageDegradation ?? []).map(([loc, zones]: [string, any]) => [loc, {
      cold: new Map(zones?.cold ?? []),
      room: new Map(zones?.room ?? []),
      warm: new Map(zones?.warm ?? []),
    }])
  );
  k.withdrawnItemDegradation = new Map(d.withdrawnItemDegradation ?? []);
  k.baseLevels = new Map(d.baseLevels ?? []);
  k.baseInvitedNpcs = new Map(d.baseInvitedNpcs ?? []);
  if (d.farmStates) {
    k.farmStates = new Map(
      (d.farmStates as [string, any][]).map(([loc, farm]) => [loc, {
        ...farm,
        cells: (farm.cells ?? []).map((c: any) => ({ ...c })),
      }])
    );
  }
  if (d.lastNapDay !== undefined) k.lastNapDay = d.lastNapDay;
  if (d.villageState) {
    k.villageState = deserializeVillageState(d.villageState);
  }
  k.seenDialogueChoices = new Set(d.seenDialogueChoices ?? []);
  k.activeNpcQuests = new Map(
    (d.activeNpcQuests ?? []).map(([id, s]: any) => [id, { ...s }])
  );
  k.completedNpcQuestIds = new Set(d.completedNpcQuestIds ?? []);
  k.totalVigorSpent = d.totalVigorSpent ?? 0;
  k.completedEvents = new Set(d.completedEvents ?? []);
  return k;
}

function serializeBacklog(b: Backlog): object {
  return {
    entries: b.getAll().map(e => ({
      ...e,
      time: serializeGameTime(e.time),
    })),
  };
}

function deserializeBacklog(d: any): Backlog {
  const b = new Backlog();
  for (const e of (d.entries ?? [])) {
    b.add(
      deserializeGameTime(e.time),
      e.text ?? '',
      e.category ?? '시스템',
      e.sourceActorName ?? '',
      e.sourceLocation ?? '',
    );
  }
  return b;
}

function serializeVillageState(v: VillageState): object {
  return {
    locationId: v.locationId,
    name: v.name,
    foundedDay: v.foundedDay,
    stage: v.stage,
    population: v.population,
    happiness: v.happiness,
    defense: v.defense,
    facilities: v.facilities.map(f => ({ ...f })),
    roads: v.roads.map(r => ({ ...r })),
    finance: { ...v.finance },
    // Phase 2 필드
    reputation: v.reputation,
    specialization: v.specialization,
    activeEvent: v.activeEvent ? { ...v.activeEvent } : null,
    eventHistory: v.eventHistory.map(e => ({ ...e })),
    benzenAppeared: v.benzenAppeared,
    lastPopGrowthDay: v.lastPopGrowthDay,
    // Phase 3 필드
    visitingNpcCount: v.visitingNpcCount ?? 0,
    totalVisitorIncome: v.totalVisitorIncome ?? 0,
    totalVisitorDays: v.totalVisitorDays ?? 0,
    crisisEventSuccessCount: v.crisisEventSuccessCount ?? 0,
    springFestivalCount: v.springFestivalCount ?? 0,
    benzenAffinity: v.benzenAffinity ?? 0,
    lastBenzenVisitDay: v.lastBenzenVisitDay ?? 0,
  };
}

function deserializeVillageState(d: any): VillageState {
  return {
    locationId: d.locationId ?? '',
    name: d.name ?? '이름없는 마을',
    foundedDay: d.foundedDay ?? 1,
    stage: d.stage ?? 1,
    population: d.population ?? 1,
    happiness: d.happiness ?? 50,
    defense: d.defense ?? 0,
    facilities: (d.facilities ?? []).map((f: any) => ({
      facilityId: f.facilityId ?? '',
      builtDay: f.builtDay ?? 1,
      status: f.status ?? 'active',
      tier: f.tier ?? 1,          // Phase 1 세이브 마이그레이션
      upgradedDay: f.upgradedDay,
    })),
    roads: (d.roads ?? []).map((r: any) => ({ ...r })),
    finance: {
      totalIncomePerDay: d.finance?.totalIncomePerDay ?? 0,
      totalMaintenancePerDay: d.finance?.totalMaintenancePerDay ?? 0,
      treasury: d.finance?.treasury ?? 0,
      lastSettledDay: d.finance?.lastSettledDay ?? d.foundedDay ?? 1,
    },
    // Phase 2 필드 — 구버전 세이브는 기본값
    reputation: d.reputation ?? 0,
    specialization: d.specialization ?? 'none',
    activeEvent: d.activeEvent ?? null,
    eventHistory: d.eventHistory ?? [],
    benzenAppeared: d.benzenAppeared ?? false,
    lastPopGrowthDay: d.lastPopGrowthDay ?? d.foundedDay ?? 1,
    // Phase 3 필드 — 구버전 세이브는 기본값
    visitingNpcCount: d.visitingNpcCount ?? 0,
    totalVisitorIncome: d.totalVisitorIncome ?? 0,
    totalVisitorDays: d.totalVisitorDays ?? 0,
    crisisEventSuccessCount: d.crisisEventSuccessCount ?? 0,
    springFestivalCount: d.springFestivalCount ?? 0,
    benzenAffinity: d.benzenAffinity ?? 0,
    lastBenzenVisitDay: d.lastBenzenVisitDay ?? 0,
  };
}

function serializeGaugeState(g: ColorGaugeState): object {
  return { prev: [...g.prev], deltas: [...g.deltas] };
}

function deserializeGaugeState(d: any): ColorGaugeState {
  const g = new ColorGaugeState();
  if (Array.isArray(d.prev)) g.prev = [...d.prev];
  if (Array.isArray(d.deltas)) g.deltas = [...d.deltas];
  return g;
}

// ============================================================
// Top-level serialize / deserialize
// ============================================================

function serializeSession(session: GameSession): object {
  return {
    version: SAVE_VERSION,
    actors: session.actors.map(serializeActor),
    playerIdx: session.playerIdx,
    gameTime: serializeGameTime(session.gameTime),
    world: serializeWorld(session.world),
    social: serializeSocialHub(session.social),
    knowledge: serializeKnowledge(session.knowledge),
    backlog: serializeBacklog(session.backlog),
    gaugeState: serializeGaugeState(session.gaugeState),
    playerBuffs: session.playerBuffs.map(b => ({ ...b })),
  };
}

function deserializeSession(data: any): GameSession {
  const session = new GameSession();
  session.actors = (data.actors ?? []).map(deserializeActor);
  session.playerIdx = data.playerIdx ?? -1;
  session.gameTime = deserializeGameTime(data.gameTime ?? {});
  session.world = deserializeWorld(data.world ?? {});
  session.social = deserializeSocialHub(data.social ?? {});
  session.knowledge = deserializeKnowledge(data.knowledge ?? {});
  session.backlog = deserializeBacklog(data.backlog ?? {});
  session.gaugeState = deserializeGaugeState(data.gaugeState ?? {});
  session.playerBuffs = (data.playerBuffs ?? []).map((b: any) => ({ ...b }));

  // EventSystem, DungeonSystem, ActivitySystem are runtime-only;
  // they are rebuilt from registry at game init, not persisted.
  session.events = new EventSystem();
  session.dungeonSystem = new DungeonSystem();
  session.activitySystem = new ActivitySystem();

  // 장비 grantedSkill 재동기화 (로드 시 장착 악세서리의 임시 스킬을 다시 부여)
  for (const actor of session.actors) {
    for (const slotId of [actor.equippedAccessory, actor.equippedAccessory2, actor.equippedArmor]) {
      if (!slotId) continue;
      const armor = getArmorDef(slotId);
      if (armor && armor.grantedSkill) {
        actor.grantSkillFromEquip(armor.grantedSkill);
      }
    }
  }

  return session;
}

// ============================================================
// Storage key helpers
// ============================================================

function dataKey(slot: number): string {
  return `${STORAGE_KEY_PREFIX}${slot}-data`;
}

function metaKey(slot: number): string {
  return `${STORAGE_KEY_PREFIX}${slot}-meta`;
}

// ============================================================
// Public API
// ============================================================

/**
 * Save the current GameSession to the specified slot (0-3).
 * Returns true on success, false on failure (e.g. quota exceeded).
 */
export function saveToSlot(slot: number, session: GameSession): boolean {
  if (slot < 0 || slot >= SLOT_COUNT) return false;
  try {
    const data = serializeSession(session);
    const meta: SaveMeta = {
      slot,
      playerName: session.playerName,
      timestamp: Date.now(),
      playMinutes: session.gameTime.day * 24 * 60 + session.gameTime.hour * 60 + session.gameTime.minute,
      version: SAVE_VERSION,
    };
    localStorage.setItem(dataKey(slot), JSON.stringify(data));
    localStorage.setItem(metaKey(slot), JSON.stringify(meta));
    return true;
  } catch (err) {
    console.error(`[save-system] saveToSlot(${slot}) failed:`, err);
    return false;
  }
}

/**
 * Load a GameSession from the specified slot.
 * Returns null if the slot is empty, corrupted, or version-mismatched.
 */
export function loadFromSlot(slot: number): GameSession | null {
  if (slot < 0 || slot >= SLOT_COUNT) return null;
  try {
    const raw = localStorage.getItem(dataKey(slot));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version < SAVE_VERSION) {
      // v5 → v6은 구조 변경 없음 (아이템 탭/특수효과 확장만). 경고 없이 통과.
      if (data.version !== 5) {
        console.warn(`[save-system] loadFromSlot(${slot}): old save version ${data.version} (current ${SAVE_VERSION}), loading with defaults for new fields`);
      }
    }
    return deserializeSession(data);
  } catch (err) {
    console.error(`[save-system] loadFromSlot(${slot}) failed:`, err);
    return null;
  }
}

/**
 * Return the SaveMeta for a slot without loading the full game data.
 * Returns null if the slot is empty or unreadable.
 */
export function getSlotMeta(slot: number): SaveMeta | null {
  if (slot < 0 || slot >= SLOT_COUNT) return null;
  try {
    const raw = localStorage.getItem(metaKey(slot));
    if (!raw) return null;
    return JSON.parse(raw) as SaveMeta;
  } catch (err) {
    console.error(`[save-system] getSlotMeta(${slot}) failed:`, err);
    return null;
  }
}

/**
 * Return metadata for all slots (index = slot number).
 * Empty or unreadable slots appear as null.
 */
export function getAllSlotMetas(): (SaveMeta | null)[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => getSlotMeta(i));
}

/**
 * Delete save data and metadata for the specified slot.
 */
export function deleteSlot(slot: number): void {
  if (slot < 0 || slot >= SLOT_COUNT) return;
  try {
    localStorage.removeItem(dataKey(slot));
    localStorage.removeItem(metaKey(slot));
  } catch (err) {
    console.error(`[save-system] deleteSlot(${slot}) failed:`, err);
  }
}

/**
 * Save to slot 0 (autosave).
 */
export function autoSave(session: GameSession): void {
  saveToSlot(0, session);
}
