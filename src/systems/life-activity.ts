/**
 * 생활 활동 레지스트리 (8색 = 8활동) — 채집 노드를 권역별로 한 활동에 배정한다.
 *
 * 두 유형:
 *  - delayed(지연형): 농사 grow 엔진(systems/farming.ts CROPS)을 재사용한다. 심기→전역 턴 경과로
 *    성장→돌봄 게이트(careLabel)→수확. element earth/fire/wind/light/dark 5종이 CROPS에 1:1 대응.
 *    여기서는 element→cropId 매핑만 들고, 실제 로직은 farming.ts가 담당(성장 수학 불변).
 *  - repeat(반복형): 즉시 수행→산출(material + element 컬러 + 생활 XP). 수행하면 그 노드가
 *    COOLDOWN 전역 턴 동안 잠겨 재수행 불가(run.lifeCooldowns). water=낚시/iron=채광/electric=집전.
 *
 * 노드→활동 배정(activityForNode)은 *권역 문자열의 안정적 해시*로 활동 1개를 결정한다(결정적, Math.random 금지).
 * 같은 권역의 채집 노드는 모두 같은 활동. region이 없으면 nodeId 해시 폴백.
 * (손튜닝 권역→활동 매핑은 후속 content 패스 — 지금은 균등 해시.)
 */

import type { Element } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { applyColorBoost, type ColorKey } from '@/systems/colors';
import { rng } from '@/systems/rng';
import { getCrop, type CropDef } from '@/systems/farming';

/** 반복형 산출 상위확률 튜닝 — 농사 harvestUpperChance 모델 미러. */
const REPEAT_BASE_BONUS = 10;
const REPEAT_LEVEL_K = 5;
const REPEAT_COLOR_SCALE = 0.4;

/** 반복형 활동 쿨다운(전역 턴) — 수행 후 이 턴 수만큼 그 노드 재수행 불가. */
export const REPEAT_COOLDOWN = 3;

export type LifeActivityType = 'delayed' | 'repeat';

/** 활동 산출 순간에 띄우는 채집 미니게임 종류(GatherView와 동일 3종 재사용). */
export type LifeMinigame = 'tap' | 'react' | 'matrix';

/** 한 생활 활동의 정의(레지스트리 원소). */
export interface LifeActivityDef {
  id: string;
  /** 활동 표시 이름 (UI). */
  name: string;
  /** 활동 속성 — 산출 컬러 + 상위확률 판정 컬러. 8색 1:1. */
  element: Element;
  type: LifeActivityType;
  /**
   * 산출 순간에 띄우는 채집 미니게임(스킬 표현). 결과 점수가 그 회차 상위확률에 보너스로 더해진다.
   * 못 띄우거나 닫으면 즉시 산출(폴백) — 핵심 산출 수학은 불변.
   */
  minigame: LifeMinigame;
  // --- delayed 전용 ---
  /** 지연형이 재사용하는 farming.ts CROPS의 cropId. delayed면 필수. */
  cropId?: string;
  // --- repeat 전용 ---
  /** 반복형 동사 라벨(UI 버튼 — '낚시한다' 등). */
  verb?: string;
  /** 반복형 평작 산출 아이템 id. */
  lowerItemId?: string;
  /** 반복형 상품 산출 아이템 id. */
  upperItemId?: string;
}

/**
 * 8활동 레지스트리 — element별 1개. 5 delayed(농사 grow 엔진 재사용) + 3 repeat(즉시 산출).
 *   delayed: earth=농사 / fire=숯굽기 / wind=사냥 / light=볕말림 / dark=버섯재배
 *   repeat : water=낚시 / iron=채광 / electric=집전
 *
 * minigame 배정(스킬 표현, 8→3종) — 행동의 결에 맞춰:
 *   tap(좌우 연타, 힘쓰는 노동)  = 농사·숯굽기·사냥
 *   react(반응 속도, 순간 포착)  = 낚시·집전
 *   matrix(숫자 격자, 더듬어 찾기) = 채광·볕말림·버섯재배
 */
export const LIFE_ACTIVITIES: LifeActivityDef[] = [
  // === 지연형 (farming.ts CROPS 재사용) ===
  { id: 'act-farm', name: '농사', element: 'earth', type: 'delayed', cropId: 'crop-grain', minigame: 'tap' },
  { id: 'act-char', name: '숯굽기', element: 'fire', type: 'delayed', cropId: 'crop-char', minigame: 'tap' },
  { id: 'act-hunt', name: '사냥', element: 'wind', type: 'delayed', cropId: 'crop-snare', minigame: 'tap' },
  { id: 'act-dry', name: '볕말림', element: 'light', type: 'delayed', cropId: 'crop-dry', minigame: 'matrix' },
  { id: 'act-mush', name: '버섯재배', element: 'dark', type: 'delayed', cropId: 'crop-mush', minigame: 'matrix' },
  // === 반복형 (즉시 산출 + 쿨다운) ===
  {
    id: 'act-fish', name: '낚시', element: 'water', type: 'repeat', verb: '낚시한다',
    lowerItemId: 'i-life-fish', upperItemId: 'i-life-fish-fine', minigame: 'react',
  },
  {
    id: 'act-mine', name: '채광', element: 'iron', type: 'repeat', verb: '채광한다',
    lowerItemId: 'i-life-ore', upperItemId: 'i-life-ore-fine', minigame: 'matrix',
  },
  {
    id: 'act-charge', name: '집전', element: 'electric', type: 'repeat', verb: '모은다',
    lowerItemId: 'i-life-charge', upperItemId: 'i-life-charge-fine', minigame: 'react',
  },
];

/** id로 활동 정의 조회. */
export function getActivity(id: string): LifeActivityDef | undefined {
  return LIFE_ACTIVITIES.find((a) => a.id === id);
}

/** 지연형 활동의 작물 정의(farming.ts CROPS) 조회. repeat이거나 미정의면 undefined. */
export function cropForActivity(act: LifeActivityDef | undefined): CropDef | undefined {
  return act?.cropId ? getCrop(act.cropId) : undefined;
}

/** element → ColorKey (동일 문자열, 타입 좁히기). */
function elementColorKey(element: Element): ColorKey {
  return element as ColorKey;
}

/**
 * 안정적 문자열 해시(FNV-1a 32bit) — 같은 입력=같은 출력. 권역→활동 결정적 배정용.
 * Math.random/rng를 쓰지 않는다(저장·세션 무관하게 항상 동일).
 */
function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 노드에 배정된 생활 활동을 결정 — *권역 문자열의 안정적 해시*로 8활동 중 1개.
 * 같은 권역의 채집 노드는 모두 같은 활동(권역 단위 일관). region 없으면 nodeId 해시 폴백.
 * (손튜닝 권역→활동 매핑은 후속 — 지금은 균등 해시. 항상 정의 1개를 반환.)
 */
export function activityForNode(nodeId: string, region?: string): LifeActivityDef {
  const key = region && region.length > 0 ? `region:${region}` : `node:${nodeId}`;
  const idx = stableHash(key) % LIFE_ACTIVITIES.length;
  return LIFE_ACTIVITIES[idx];
}

// ============================================================================
// 반복형 경로 (delayed는 farming.ts가 담당)
// ----------------------------------------------------------------------------

// === 미니게임 점수 → 상위확률 보너스 ===
/** 미니게임 성공 판정 임계(GatherView gatherScoreThreshold와 동일 균일 상수). */
export const LIFE_MINIGAME_THRESHOLD = 0.55;
/** 임계 도달 시 상위확률 가산(%p). */
export const LIFE_MINIGAME_BONUS = 25;
/** 대성공(점수 ≥ 1.0) 시 상위확률 가산(%p). */
export const LIFE_MINIGAME_GREAT_BONUS = 40;
/** 실패(임계 미만) 시 상위확률 감산(%p, 음수). */
export const LIFE_MINIGAME_FAIL_PENALTY = -10;

/**
 * 미니게임 점수(0..1.2) → 이 회차 상위확률 보너스(%p).
 *   점수 ≥ 1.0  대성공 → +LIFE_MINIGAME_GREAT_BONUS
 *   점수 ≥ 0.55 성공   → +LIFE_MINIGAME_BONUS
 *   그 미만     실패   → LIFE_MINIGAME_FAIL_PENALTY(음수)
 * 핵심 산출 수학은 안 바꾸고, harvest/performRepeat의 판정 chance에만 가산하는 데 쓴다.
 */
export function minigameUpperBonus(score: number): number {
  if (score >= 1.0) return LIFE_MINIGAME_GREAT_BONUS;
  if (score >= LIFE_MINIGAME_THRESHOLD) return LIFE_MINIGAME_BONUS;
  return LIFE_MINIGAME_FAIL_PENALTY;
}

/** 반복형 쿨다운 만료까지 남은 전역 턴(0이면 즉시 수행 가능). */
export function getCooldownRemaining(nodeId: string): number {
  const r = useRunStore().data;
  const now = r.visitedNodes.length;
  const until = r.lifeCooldowns?.[nodeId] ?? 0;
  return Math.max(0, until - now);
}

/** 반복형 활동을 지금 수행할 수 있는가(쿨다운 만료). */
export function canDoRepeat(nodeId: string): boolean {
  return getCooldownRemaining(nodeId) <= 0;
}

/**
 * 반복형 산출 상위확률(0~100) — 농사 harvestUpperChance 미러.
 * clamp(BASE + lifeLevel*K + element 컬러 스케일). 후반(고레벨/고컬러)일수록 상위 산출.
 */
export function repeatUpperChance(act: LifeActivityDef): number {
  const r = useRunStore().data;
  const lifeLevel = r.lifeLevel ?? 1;
  const colorValue = r.colors[elementColorKey(act.element)] ?? 0;
  const chance =
    REPEAT_BASE_BONUS + lifeLevel * REPEAT_LEVEL_K + Math.round(colorValue) * REPEAT_COLOR_SCALE;
  return Math.max(0, Math.min(100, Math.round(chance)));
}

/** 반복형 수행 결과 — 산출 아이템 + 부여 컬러 + 생활 XP. (UI·테스트용 반환.) */
export interface RepeatResult {
  activityId: string;
  upper: boolean;
  itemIds: string[];
  colorGain: number;
  lifeXp: number;
}

/**
 * 반복형 활동 1회 수행 — 즉시 산출 + element 컬러 + 생활 XP, 그 노드에 쿨다운 부과.
 *  - 상위확률 판정(repeatUpperChance) → 상위/하위 결과물(농사 harvest 미러).
 *  - 산출 개수 = 1 + floor(lifeLevel/3) + (상위면 +1). 컬러 = 2 + floor(lifeLevel/2) + (상위면 +1).
 *  - 생활 XP = 1 + (상위면 +1).
 *  - lifeCooldowns[nodeId] = now + REPEAT_COOLDOWN.
 * 쿨다운 중이면 null(수행 거부). delayed 활동을 잘못 넘기면 null(가드).
 *
 * upperBonus(선택, %p) — 이 회차에만 상위확률에 더하는 보너스(미니게임 결과 등).
 *   판정 chance에만 가산하고 산출 개수·컬러·XP 공식은 불변. 인자 없이 호출하면 기존 동작과 동일.
 */
export function performRepeat(nodeId: string, act: LifeActivityDef, upperBonus = 0): RepeatResult | null {
  if (act.type !== 'repeat') return null;
  const run = useRunStore();
  const r = run.data;
  if (!canDoRepeat(nodeId)) {
    useUiStore().toast('info', '여기는 잠시 쉬어야 한다.');
    return null;
  }

  const data = useDataStore();
  const lifeLevel = r.lifeLevel ?? 1;

  // 상위/하위 판정(결정적 rng) — 농사 harvest와 동일 모델. upperBonus는 이 회차 한정 가산.
  const roll = Math.round(rng() * 100);
  const chance = Math.max(0, Math.min(100, repeatUpperChance(act) + upperBonus));
  const upper = roll <= chance;

  // 산출 개수.
  const count = 1 + Math.floor(lifeLevel / 3) + (upper ? 1 : 0);
  const itemId = (upper ? act.upperItemId : act.lowerItemId) ?? act.lowerItemId;
  const itemDef = itemId ? data.items.get(itemId) : undefined;
  const itemIds: string[] = [];
  if (itemDef && itemId) {
    for (let i = 0; i < count; i++) {
      run.addItem(itemDef);
      itemIds.push(itemId);
    }
  }

  // element 컬러 부여 + 생활 XP.
  const colorGain = 2 + Math.floor(lifeLevel / 2) + (upper ? 1 : 0);
  applyColorBoost(elementColorKey(act.element), colorGain);
  const xpGain = 1 + (upper ? 1 : 0);
  run.addLifeXp(xpGain);

  // 쿨다운 부과.
  if (!r.lifeCooldowns) r.lifeCooldowns = {};
  r.lifeCooldowns[nodeId] = r.visitedNodes.length + REPEAT_COOLDOWN;

  useUiStore().toast(
    'success',
    `${act.name} — ${upper ? '상품' : '평작'} ${count}개.`,
  );

  return { activityId: act.id, upper, itemIds, colorGain, lifeXp: xpGain };
}
