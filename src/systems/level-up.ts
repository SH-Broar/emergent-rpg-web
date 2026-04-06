// level-up.ts — 레벨업 시스템
// 원본: LevelUpScreen.h/cpp, Actor.h (ExpForLevel)

import { Actor, expForLevel } from '../models/actor';
import { Backlog } from '../models/backlog';
import { GameTime } from '../types/game-time';
import { ELEMENT_COUNT, elementName, Element } from '../types/enums';

// ============================================================
// 상수
// 원본: LevelUpScreen.h
// ============================================================
export const STAT_TOTAL_POINTS = 10;
export const LEVELUP_STAT_POINTS = 3;
export const LEVELUP_COLOR_POINTS = 2;

// ============================================================
// 초기 포인트 투자 (캐릭터 생성 시)
// 원본: ShowPointInvestment
// ============================================================
export interface StatSlot {
  name: string;
  allocated: number;
  perPoint: number;
}

export function createInitialStatSlots(): StatSlot[] {
  return [
    { name: 'HP', allocated: 0, perPoint: 10 },
    { name: 'MP', allocated: 0, perPoint: 5 },
    { name: '공격', allocated: 0, perPoint: 2 },
    { name: '방어', allocated: 0, perPoint: 1 },
    { name: 'MP', allocated: 0, perPoint: 10 },
    { name: '골드', allocated: 0, perPoint: 30 },
  ];
}

export interface InitialInvestmentState {
  slots: StatSlot[];
  remaining: number;
  baseValues: number[];
}

export function createInitialInvestmentState(actor: Actor): InitialInvestmentState {
  const b = actor.base;
  return {
    slots: createInitialStatSlots(),
    remaining: STAT_TOTAL_POINTS,
    baseValues: [b.maxHp, b.maxMp, b.attack, b.defense, b.maxVigor, actor.spirit.gold],
  };
}

/**
 * 초기 투자에 포인트 1 배분
 * @returns 성공 여부
 */
export function allocateInitialPoint(state: InitialInvestmentState, slotIndex: number): boolean {
  if (slotIndex < 0 || slotIndex >= state.slots.length) return false;
  if (state.remaining <= 0) return false;
  state.slots[slotIndex].allocated++;
  state.remaining--;
  return true;
}

/**
 * 초기 투자 초기화
 */
export function resetInitialInvestment(state: InitialInvestmentState): void {
  for (const s of state.slots) s.allocated = 0;
  state.remaining = STAT_TOTAL_POINTS;
}

/**
 * 슬롯별 투자 후 예상값
 */
export function getSlotPreview(state: InitialInvestmentState, slotIndex: number): number {
  const s = state.slots[slotIndex];
  return state.baseValues[slotIndex] + s.allocated * s.perPoint;
}

/**
 * 초기 투자 확정 적용
 * 원본: ShowPointInvestment 확정 블록
 */
export function applyInitialInvestment(actor: Actor, state: InitialInvestmentState): void {
  const s = state.slots;
  const bv = state.baseValues;

  actor.base.maxHp = bv[0] + s[0].allocated * s[0].perPoint;
  actor.base.hp = actor.base.maxHp;
  actor.base.maxMp = bv[1] + s[1].allocated * s[1].perPoint;
  actor.base.mp = actor.base.maxMp;
  actor.base.attack = bv[2] + s[2].allocated * s[2].perPoint;
  actor.base.defense = bv[3] + s[3].allocated * s[3].perPoint;
  actor.base.maxVigor = bv[4] + s[4].allocated * s[4].perPoint;
  actor.base.vigor = actor.base.maxVigor;
  actor.spirit.gold = bv[5] + s[5].allocated * s[5].perPoint;
}

// ============================================================
// 레벨업 스탯 투자
// 원본: ShowLevelUpStatInvestment
// ============================================================
export function createLevelUpStatSlots(): StatSlot[] {
  return [
    { name: '최대HP', allocated: 0, perPoint: 8 },
    { name: '최대MP', allocated: 0, perPoint: 4 },
    { name: '공격', allocated: 0, perPoint: 1.5 },
    { name: '방어', allocated: 0, perPoint: 1 },
    { name: '최대MP', allocated: 0, perPoint: 8 },
  ];
}

export interface LevelUpStatState {
  slots: StatSlot[];
  remaining: number;
  baseValues: number[];
  level: number;
}

export function createLevelUpStatState(actor: Actor, totalPoints = 0): LevelUpStatState {
  const b = actor.base;
  return {
    slots: createLevelUpStatSlots(),
    remaining: totalPoints > 0 ? totalPoints : LEVELUP_STAT_POINTS,
    baseValues: [b.maxHp, b.maxMp, b.attack, b.defense, b.maxVigor],
    level: b.level,
  };
}

export function allocateLevelUpStatPoint(state: LevelUpStatState, slotIndex: number): boolean {
  if (slotIndex < 0 || slotIndex >= state.slots.length) return false;
  if (state.remaining <= 0) return false;
  state.slots[slotIndex].allocated++;
  state.remaining--;
  return true;
}

export function resetLevelUpStats(state: LevelUpStatState, totalPoints = 0): void {
  for (const s of state.slots) s.allocated = 0;
  state.remaining = totalPoints > 0 ? totalPoints : LEVELUP_STAT_POINTS;
}

export function getLevelUpStatPreview(state: LevelUpStatState, slotIndex: number): number {
  const s = state.slots[slotIndex];
  return state.baseValues[slotIndex] + s.allocated * s.perPoint;
}

/**
 * 레벨업 스탯 투자 확정 적용
 * 원본: ShowLevelUpStatInvestment 확정 블록 (HP/MP 현재값은 건드리지 않음)
 */
export function applyLevelUpStats(actor: Actor, state: LevelUpStatState): void {
  const s = state.slots;
  const bv = state.baseValues;

  actor.base.maxHp = bv[0] + s[0].allocated * s[0].perPoint;
  actor.base.maxMp = bv[1] + s[1].allocated * s[1].perPoint;
  actor.base.attack = bv[2] + s[2].allocated * s[2].perPoint;
  actor.base.defense = bv[3] + s[3].allocated * s[3].perPoint;
  actor.base.maxVigor = bv[4] + s[4].allocated * s[4].perPoint;
}

// ============================================================
// 레벨업 컬러 조정
// 원본: ShowLevelUpColorAdjust
// ============================================================
export interface LevelUpColorState {
  adjustments: number[];
  original: number[];
  remaining: number;
  level: number;
}

export function createLevelUpColorState(actor: Actor, totalPoints = 0): LevelUpColorState {
  return {
    adjustments: new Array(ELEMENT_COUNT).fill(0),
    original: [...actor.color.values],
    remaining: totalPoints > 0 ? totalPoints : LEVELUP_COLOR_POINTS,
    level: actor.base.level,
  };
}

/**
 * 컬러 +5% (특정 원소에 포인트 투자)
 * @returns 성공 여부
 */
export function increaseColor(state: LevelUpColorState, elementIndex: number): boolean {
  if (elementIndex < 0 || elementIndex >= ELEMENT_COUNT) return false;
  if (state.remaining <= 0) return false;
  const test = state.original[elementIndex] + (state.adjustments[elementIndex] + 1) * 0.05;
  if (test > 1.0) return false;
  state.adjustments[elementIndex]++;
  state.remaining--;
  return true;
}

/**
 * 컬러 -5% (특정 원소 감소)
 * @returns 성공 여부
 */
export function decreaseColor(state: LevelUpColorState, elementIndex: number): boolean {
  if (elementIndex < 0 || elementIndex >= ELEMENT_COUNT) return false;
  if (state.remaining <= 0) return false;
  const test = state.original[elementIndex] + (state.adjustments[elementIndex] - 1) * 0.05;
  if (test < 0.0) return false;
  state.adjustments[elementIndex]--;
  state.remaining--;
  return true;
}

export function resetLevelUpColor(state: LevelUpColorState, totalPoints = 0): void {
  state.adjustments = new Array(ELEMENT_COUNT).fill(0);
  state.remaining = totalPoints > 0 ? totalPoints : LEVELUP_COLOR_POINTS;
}

/**
 * 현재 조정 후 각 원소 값
 */
export function getColorPreview(state: LevelUpColorState): number[] {
  const result: number[] = [];
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    result.push(Math.max(0, Math.min(1, state.original[i] + state.adjustments[i] * 0.05)));
  }
  return result;
}

/**
 * 각 원소의 원본 대비 델타
 */
export function getColorDeltas(state: LevelUpColorState): number[] {
  const preview = getColorPreview(state);
  return preview.map((v, i) => v - state.original[i]);
}

/**
 * 레벨업 컬러 조정 확정 적용
 * 원본: ShowLevelUpColorAdjust 확정 블록
 */
export function applyLevelUpColor(actor: Actor, state: LevelUpColorState): void {
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    actor.color.values[i] = Math.max(0, Math.min(1, state.original[i] + state.adjustments[i] * 0.05));
  }
}

// ============================================================
// 레벨업 전체 처리
// 원본: HandleLevelUp
// ============================================================
export interface LevelUpInfo {
  level: number;
  statPoints: number;
  colorPoints: number;
  messages: string[];
}

/**
 * 레벨업 발생 시 정보 생성 + 백로그 기록
 * UI는 이 정보를 받아서 투자 화면을 표시
 */
export function handleLevelUp(
  player: Actor,
  backlog: Backlog,
  gameTime: GameTime,
): LevelUpInfo {
  const level = player.base.level;
  backlog.add(
    gameTime,
    `${player.name}의 레벨이 ${level}(으)로 올랐다!`,
    '시스템',
  );

  return {
    level,
    statPoints: LEVELUP_STAT_POINTS,
    colorPoints: LEVELUP_COLOR_POINTS,
    messages: [
      `레벨업! Lv.${level}`,
      `스탯 포인트 ${LEVELUP_STAT_POINTS}pt를 투자할 수 있습니다.`,
      `컬러 포인트 ${LEVELUP_COLOR_POINTS}pt로 속성을 조정할 수 있습니다.`,
      '※ HP/MP는 자동 회복되지 않습니다.',
    ],
  };
}

// ============================================================
// 경험치 획득 + 레벨업 판정 (processTurn에서 호출 가능)
// 원본: Actor::GainExp + HandleLevelUp
// ============================================================
export interface ExpGainResult {
  leveled: boolean;
  levelUpInfo: LevelUpInfo | null;
  messages: string[];
}

export function gainExpAndCheckLevelUp(
  player: Actor,
  amount: number,
  backlog: Backlog,
  gameTime: GameTime,
): ExpGainResult {
  const needed = expForLevel(player.base.level);
  player.base.exp += amount;

  const messages: string[] = [];
  messages.push(`경험치 +${amount} (${player.base.exp}/${needed})`);

  if (player.base.exp >= needed) {
    player.base.exp -= needed;
    player.base.level++;

    const info = handleLevelUp(player, backlog, gameTime);
    return {
      leveled: true,
      levelUpInfo: info,
      messages: [...messages, ...info.messages],
    };
  }

  return { leveled: false, levelUpInfo: null, messages };
}

// ============================================================
// 원소 이름 배열 (UI용)
// ============================================================
export function getElementNames(): string[] {
  const names: string[] = [];
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    names.push(elementName(i as Element));
  }
  return names;
}
