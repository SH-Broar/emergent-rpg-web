// npc-schedule-defs.ts — NPC 일일 스케줄 레지스트리
//
// public/data/npc_schedules.txt 를 파싱해 역할별/이름별 스케줄과 특수 오버라이드를 보관한다.
// 데이터가 로드되지 않은(구형) 환경에서는 npc-ai.ts 의 하드코딩 폴백이 동작하도록 null 을 반환한다.

import type { DataSection } from './parser';
import { ActionType } from '../models/actor';
import { SpiritRole, DayOfWeek, parseSpiritRole } from '../types/enums';

export interface ScheduleBonuses {
  [action: number]: number; // ActionType → multiplier
}

export interface ScheduleSlot {
  location: string;
  bonuses: ScheduleBonuses;
}

/** 한 스케줄 정의: morning/afternoon/evening/night 4슬롯 + 옵션 필드 */
export interface ScheduleDef {
  slots: [ScheduleSlot, ScheduleSlot, ScheduleSlot, ScheduleSlot];
  weekendExempt: boolean;
  marketDay: boolean;
  /** 요일_시간대 조합 오버라이드. 키: "Sat_afternoon" 등 */
  dayOverrides: Map<string, ScheduleSlot>;
}

export interface SpecialtyDef {
  itemId: string;
  maxStock: number;
  collectChance: number;
}

// ============================================================
// 파서 헬퍼
// ============================================================

/** SpiritRole 키 → enum 변환 (enums.ts 의 parseSpiritRole 활용) */
function roleFromName(name: string): SpiritRole | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const role = parseSpiritRole(trimmed);
  // parseSpiritRole 은 모르는 키에 대해 Villager 폴백을 반환하므로
  // 명시적으로 Villager 가 아닌 경우만 정상 매핑으로 간주.
  if (role === SpiritRole.Villager && trimmed !== 'Villager') return null;
  return role;
}

const ACTION_NAME_TO_ENUM: Record<string, ActionType> = {
  Idle: ActionType.Idle, Eat: ActionType.Eat, Rest: ActionType.Rest,
  Sleep: ActionType.Sleep, WakeUp: ActionType.WakeUp, GoToLocation: ActionType.GoToLocation,
  Trade_Buy: ActionType.Trade_Buy, Trade_Sell: ActionType.Trade_Sell,
  Trade_WithActor: ActionType.Trade_WithActor, ExploreDungeon: ActionType.ExploreDungeon,
  PostQuest: ActionType.PostQuest, CheckQuests: ActionType.CheckQuests,
  AcceptQuest: ActionType.AcceptQuest, TurnInQuest: ActionType.TurnInQuest,
  Socialize: ActionType.Socialize, ShareRumor: ActionType.ShareRumor,
  Hoard: ActionType.Hoard, PriceGouge: ActionType.PriceGouge,
  Complain: ActionType.Complain, SeekAlternative: ActionType.SeekAlternative,
  Produce: ActionType.Produce, ShareMeal: ActionType.ShareMeal,
  TeachSkill: ActionType.TeachSkill, CulturalExchange: ActionType.CulturalExchange,
  CooperateWork: ActionType.CooperateWork, Celebrate: ActionType.Celebrate,
};

/** "Location | ActType:1.5, ActType:1.2" → ScheduleSlot */
function parseSlot(raw: string, defaultLocation: string): ScheduleSlot {
  const slot: ScheduleSlot = { location: defaultLocation, bonuses: {} };
  if (!raw.trim()) return slot;
  const pipe = raw.indexOf('|');
  const locPart = (pipe === -1 ? raw : raw.slice(0, pipe)).trim();
  const bonPart = (pipe === -1 ? '' : raw.slice(pipe + 1)).trim();
  if (locPart) slot.location = locPart;
  if (bonPart) {
    for (const tok of bonPart.split(',')) {
      const [actRaw, mulRaw] = tok.split(':').map(s => s.trim());
      const act = ACTION_NAME_TO_ENUM[actRaw];
      const mul = parseFloat(mulRaw);
      if (act !== undefined && Number.isFinite(mul)) slot.bonuses[act] = mul;
    }
  }
  return slot;
}


const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PERIOD_KEYS = ['morning', 'afternoon', 'evening', 'night'];

function parseScheduleSection(s: DataSection): ScheduleDef {
  const defaultLoc = 'Alimes';
  const slots: [ScheduleSlot, ScheduleSlot, ScheduleSlot, ScheduleSlot] = [
    parseSlot(s.get('morning', ''), defaultLoc),
    parseSlot(s.get('afternoon', ''), defaultLoc),
    parseSlot(s.get('evening', ''), defaultLoc),
    parseSlot(s.get('night', ''), defaultLoc),
  ];
  const weekendExempt = s.get('weekend_exempt', '').trim().toLowerCase() === 'true';
  const marketDay = s.get('market_day', '').trim().toLowerCase() === 'true';
  const dayOverrides = new Map<string, ScheduleSlot>();
  for (const day of DAY_KEYS) {
    for (const per of PERIOD_KEYS) {
      const key = `${day}_${per}`;
      if (s.has(key)) {
        dayOverrides.set(key, parseSlot(s.get(key, ''), defaultLoc));
      }
    }
  }
  return { slots, weekendExempt, marketDay, dayOverrides };
}

// ============================================================
// 레지스트리
// ============================================================

const roleSchedules = new Map<SpiritRole, ScheduleDef>();
const actorSchedules = new Map<string, ScheduleDef>();
const specialtyMap = new Map<string, SpecialtyDef>();
let weekendOverride: ScheduleBonuses[] = [];
let marketDayOverride: ScheduleSlot[] = [];
let dataLoaded = false;

export function loadNpcScheduleDefs(sections: DataSection[]): void {
  roleSchedules.clear();
  actorSchedules.clear();
  specialtyMap.clear();
  weekendOverride = [];
  marketDayOverride = [];
  dataLoaded = false;

  for (const s of sections) {
    const name = s.name.trim();
    if (!name || name.startsWith('#')) continue;

    if (name === '__Weekend') {
      weekendOverride = [
        parseSlot(s.get('morning', ''), '').bonuses,
        parseSlot(s.get('afternoon', ''), '').bonuses,
        parseSlot(s.get('evening', ''), '').bonuses,
        parseSlot(s.get('night', ''), '').bonuses,
      ];
      continue;
    }

    if (name === '__MarketDay') {
      marketDayOverride = [
        parseSlot(s.get('morning', ''), 'Market_Square'),
        parseSlot(s.get('afternoon', ''), 'Market_Square'),
        parseSlot(s.get('evening', ''), 'Market_Square'),
        parseSlot(s.get('night', ''), 'Market_Square'),
      ];
      continue;
    }

    if (name.startsWith('specialty:')) {
      const locId = name.slice('specialty:'.length).trim();
      const itemId = s.get('itemId', '').trim();
      if (!locId || !itemId) continue;
      specialtyMap.set(locId, {
        itemId,
        maxStock: s.getInt('maxStock', 1),
        collectChance: s.getFloat('collectChance', 0.2),
      });
      continue;
    }

    if (name.startsWith('actor:')) {
      const actorName = name.slice('actor:'.length).trim();
      if (!actorName) continue;
      actorSchedules.set(actorName, parseScheduleSection(s));
      continue;
    }

    const role = roleFromName(name);
    if (role !== null) {
      roleSchedules.set(role, parseScheduleSection(s));
    }
  }

  dataLoaded = roleSchedules.size > 0 || actorSchedules.size > 0;
}

export function isScheduleDataLoaded(): boolean {
  return dataLoaded;
}

export function getActorSchedule(actorName: string): ScheduleDef | undefined {
  return actorSchedules.get(actorName);
}

export function getRoleSchedule(role: SpiritRole): ScheduleDef | undefined {
  return roleSchedules.get(role);
}

export function getWeekendBonuses(): readonly ScheduleBonuses[] {
  return weekendOverride;
}

export function getMarketDaySlots(): readonly ScheduleSlot[] {
  return marketDayOverride;
}

export function getLocationSpecialty(locationId: string): SpecialtyDef | undefined {
  return specialtyMap.get(locationId);
}

export function getAllSpecialtyLocationIds(): string[] {
  return [...specialtyMap.keys()];
}

// ============================================================
// DayOfWeek 매핑 (스케줄 요일 오버라이드 조회용)
// ============================================================

export function dayOfWeekToKey(dow: DayOfWeek): string {
  return DAY_KEYS[dow] ?? '';
}

export function periodIndexToKey(period: number): string {
  return PERIOD_KEYS[period] ?? '';
}
