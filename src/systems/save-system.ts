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

// ============================================================
// Constants
// ============================================================

export const SAVE_VERSION = 1;
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
  return {
    name: a.name,
    base: { ...a.base },
    spirit: {
      ...a.spirit,
      inventory: [...a.spirit.inventory.entries()],
    },
    color: serializeColorProfile(a.color),
    currentLocation: a.currentLocation,
    moveDestination: a.moveDestination,
    actionCooldown: a.actionCooldown,
    playable: a.playable,
    isCustom: a.isCustom,
    homeLocation: a.homeLocation,
    relationships: [...a.relationships.entries()].map(([k, v]) => [k, { ...v }]),
    memories: a.memories.map(m => ({ ...m, when: serializeGameTime(m.when) })),
    dungeonProgress: [...a.dungeonProgress.entries()],
    background: a.background,
    hasLearnedMagic: a.hasLearnedMagic,
    stationary: a.stationary,
    hyperionLevel: a.hyperionLevel,
    hyperionFlags: [...a.hyperionFlags],
    lastTickHour: a.lastTickHour,
    items: [...a.items.entries()],
    equippedWeapon: a.equippedWeapon,
    equippedArmor: a.equippedArmor,
    equippedAccessory: a.equippedAccessory,
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
  a.actionCooldown = d.actionCooldown ?? 0;
  a.playable = d.playable ?? true;
  a.isCustom = d.isCustom ?? false;
  a.homeLocation = d.homeLocation ?? '';
  a.relationships = new Map(
    (d.relationships ?? []).map(([k, v]: [string, any]) => [k, { ...v }])
  );
  a.memories = (d.memories ?? []).map((m: any) => ({ ...m, when: deserializeGameTime(m.when) }));
  a.dungeonProgress = new Map(d.dungeonProgress ?? []);
  a.background = d.background ?? '';
  a.hasLearnedMagic = d.hasLearnedMagic ?? false;
  a.stationary = d.stationary ?? false;
  a.hyperionLevel = d.hyperionLevel ?? 0;
  a.hyperionFlags = d.hyperionFlags ?? [false, false, false, false, false];
  a.lastTickHour = d.lastTickHour ?? 6;
  a.items = new Map(d.items ?? []);
  a.equippedWeapon = d.equippedWeapon ?? '';
  a.equippedArmor = d.equippedArmor ?? '';
  a.equippedAccessory = d.equippedAccessory ?? '';
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
    totalVigorSpent: k.totalVigorSpent,
    foodTypesEaten: [...k.foodTypesEaten],
    companionDaysMap: [...k.companionDaysMap.entries()],
    locationReputation: [...k.locationReputation.entries()],
    totalGiftsGiven: k.totalGiftsGiven,
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
    baseLevels: [...k.baseLevels.entries()],
    baseInvitedNpcs: [...k.baseInvitedNpcs.entries()],
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
  k.totalVigorSpent = d.totalVigorSpent ?? 0;
  k.foodTypesEaten = new Set(d.foodTypesEaten ?? []);
  k.companionDaysMap = new Map(d.companionDaysMap ?? []);
  k.locationReputation = new Map(d.locationReputation ?? []);
  k.totalGiftsGiven = d.totalGiftsGiven ?? 0;
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
  k.baseLevels = new Map(d.baseLevels ?? []);
  k.baseInvitedNpcs = new Map(d.baseInvitedNpcs ?? []);
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
    playerCrops: session.playerCrops.map(c => ({ ...c })),
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
  session.playerCrops = (data.playerCrops ?? []).map((c: any) => ({ ...c }));
  session.playerBuffs = (data.playerBuffs ?? []).map((b: any) => ({ ...b }));

  // EventSystem, DungeonSystem, ActivitySystem are runtime-only;
  // they are rebuilt from registry at game init, not persisted.
  session.events = new EventSystem();
  session.dungeonSystem = new DungeonSystem();
  session.activitySystem = new ActivitySystem();

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
    if (data.version !== SAVE_VERSION) {
      console.warn(`[save-system] loadFromSlot(${slot}): version mismatch (got ${data.version}, expected ${SAVE_VERSION})`);
      return null;
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
