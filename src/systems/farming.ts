/**
 * 농사 시스템 (생활 코어) — 텃밭에 작물을 심고, 돌보고, 수확한다.
 *
 * 설계(레이어1a 코어 — UI 제외):
 *  - 작물 정의는 v1에서 TS 상수(CROPS). 데이터화(.txt)는 후속.
 *  - 시간 진행 = *전역 턴 경과*(visitedNodes.length). refreshPlot이 조회 시점에 lazy 정산하므로
 *    visitNode/advanceDay를 직접 건드리지 않는다 → 전투·게이트·맵 구조·일일 리롤과 분리(추가형).
 *    여러 텃밭을 심고 돌아다니면 모두 함께 자란다.
 *  - 물 게이트: growthProgress가 waterAt의 다음 임계에 닿으면 물을 줄 때까지 정지하고,
 *    *막힌 동안 흐른 턴은 성장에 쳐지지 않는다*("물을 줘야 나머지 턴이 지나감") → 물 주러
 *    그 텃밭으로 돌아오는 동선이 생긴다.
 *  - 수확: 상위확률 = clamp(BASE + lifeLevel*K + 해당 element 컬러 스케일, 0, 100).
 *    후반(고 생활레벨/고 컬러)일수록 상위 산출. 수확 시 작물 element 컬러 부여 + 생활 XP 적립.
 *
 * 상태는 RunState.plots[nodeId]: PlotState. 수확하면 키 삭제(재심기 가능).
 * UI는 이 모듈의 함수를 호출한다(전부 export). 상태 변경은 run 스토어를 통해서만.
 */

import type { Element, PlotState } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { applyColorBoost, type ColorKey } from '@/systems/colors';
import { rng } from '@/systems/rng';
import { eulReul } from '@/systems/josa';

/**
 * 작물 정의 (v1 상수). element는 작물 속성 = 수확 시 부여 컬러 + 상위확률 판정 컬러.
 * lowerItemId/upperItemId = 결과물 아이템 id (public/data/items/act-1-items.txt에 정의).
 *  - lower = 평작(common), upper = 상품(rare).
 * growTurns = 완성에 필요한 돌보기 횟수. waterAt = 진행 중 물 요구 임계(결정적).
 */
export interface CropDef {
  id: string;
  /** 씨앗 표시 이름 (UI·로그용). */
  seedName: string;
  /** 완성까지 필요한 돌보기 횟수. */
  growTurns: number;
  /** 물 요구 임계 시점 — growthProgress가 이 값에 닿으면 돌봄 게이트가 열릴 때까지 정지. */
  waterAt: number[];
  /** 작물 속성 — 수확 시 부여 컬러 + 상위확률 판정 컬러. 8색 분산. */
  element: Element;
  /** 평작 결과물 아이템 id. */
  lowerItemId: string;
  /** 상품 결과물 아이템 id. */
  upperItemId: string;
  /**
   * 돌봄 게이트 행동 라벨 — 지연형 생활 활동의 element별 표현(농사=물주기, 숯굽기=불 지피기 등).
   * water()/needsWater()의 수학은 그대로지만 UI/토스트 문구는 이 라벨을 쓴다(생활 활동 일반화).
   * 미설정이면 '물주기'(농사 기본).
   */
  careLabel?: string;
  /**
   * 빈 텃밭(미경작) 상태에서의 행동 명사 — UI 빈자리 안내용(예: '텃밭', '가마', '덫', '건조대', '버섯밭').
   * 미설정이면 '텃밭'(농사 기본).
   */
  plotLabel?: string;
}

/**
 * 작물 카탈로그 — 지연형 생활 활동 5종. element별 1종(earth·fire·wind·light·dark).
 * earth=농사, fire=숯굽기, wind=사냥(덫), light=별빛 건조, dark=버섯재배.
 *  - 성장/물게이트/수확 수학(growTurns·waterAt 정산)은 농사 시절과 동일. element·라벨만 분화.
 *  - 반복형(water 낚시·iron 채광·electric 집전)은 farming 엔진을 쓰지 않는다 → life-activity.ts.
 */
export const CROPS: CropDef[] = [
  {
    id: 'crop-grain',
    seedName: '들곡 씨앗',
    growTurns: 3,
    waterAt: [1],
    element: 'earth',
    lowerItemId: 'i-crop-grain',
    upperItemId: 'i-crop-grain-fine',
    careLabel: '물주기',
    plotLabel: '텃밭',
  },
  {
    id: 'crop-char',
    seedName: '숯가마 장작',
    growTurns: 3,
    waterAt: [1, 2],
    element: 'fire',
    lowerItemId: 'i-life-char',
    upperItemId: 'i-life-char-fine',
    careLabel: '불 지피기',
    plotLabel: '가마',
  },
  {
    id: 'crop-snare',
    seedName: '사냥 덫',
    growTurns: 4,
    waterAt: [2],
    element: 'wind',
    lowerItemId: 'i-life-game',
    upperItemId: 'i-life-game-fine',
    careLabel: '덫 살피기',
    plotLabel: '덫자리',
  },
  {
    id: 'crop-dry',
    seedName: '별빛 채반',
    growTurns: 5,
    waterAt: [2, 4],
    element: 'light',
    lowerItemId: 'i-life-dried',
    upperItemId: 'i-life-dried-fine',
    careLabel: '별빛 쬐기',
    plotLabel: '건조대',
  },
  {
    id: 'crop-mush',
    seedName: '버섯 종균',
    growTurns: 4,
    waterAt: [1, 3],
    element: 'dark',
    lowerItemId: 'i-life-mush',
    upperItemId: 'i-life-mush-fine',
    careLabel: '이슬 주기',
    plotLabel: '버섯밭',
  },
];

/** 작물의 돌봄 게이트 행동 라벨(미설정이면 '물주기'). */
export function careLabelFor(crop: CropDef | undefined): string {
  return crop?.careLabel ?? '물주기';
}

/** 작물의 빈자리 명사(미설정이면 '텃밭'). */
export function plotLabelFor(crop: CropDef | undefined): string {
  return crop?.plotLabel ?? '텃밭';
}

/**
 * 작물 산출물의 짧은 표시 이름 — seedName에서 행동 접미사를 떼어 결과물 명칭으로.
 * (들곡 씨앗→들곡 / 숯가마 장작→숯 / 사냥 덫→사냥감 / 별빛 건조 채반→말린 것 / 버섯 종균→버섯)
 * 단순 치환이라 신규 작물 추가 시 맞춰 준다. 미정의면 seedName 그대로.
 */
export function cropDisplayName(crop: CropDef | undefined): string {
  if (!crop) return '작물';
  const map: Record<string, string> = {
    'crop-grain': '들곡',
    'crop-char': '숯',
    'crop-snare': '사냥감',
    'crop-dry': '말린 것',
    'crop-mush': '버섯',
  };
  return map[crop.id] ?? crop.seedName.replace(/\s*(씨앗|장작|덫|채반|종균)$/, '');
}

// === 상위확률 튜닝 (activity.ts 모델 미러) ===
/** 컬러·레벨과 무관한 기본 상위확률 보정. */
export const HARVEST_BASE_BONUS = 10;
/** 생활 레벨 1당 상위확률 가산(%). lifeLevel 5면 +20%. */
export const HARVEST_LEVEL_K = 5;
/** 작물 element 컬러값(0~100)당 상위확률 가산 계수 — colorValue * 이 값(%). */
export const HARVEST_COLOR_SCALE = 0.4;

/** 작물 정의 조회. 미정의 id면 undefined. */
export function getCrop(cropId: string): CropDef | undefined {
  return CROPS.find((c) => c.id === cropId);
}

/** element → ColorKey (동일 문자열, 타입 좁히기용). */
function elementColorKey(element: Element): ColorKey {
  return element as ColorKey;
}

// ============================================================================
// 텃밭 행동
// ----------------------------------------------------------------------------

/**
 * 작물 심기 — 노드에 텃밭 생성. 이미 텃밭이 있으면 무효(false).
 * plantedTurn = visitedNodes.length 스냅샷. growthProgress=0, wateredCount=0.
 */
export function plant(nodeId: string, cropId: string): boolean {
  const run = useRunStore();
  const r = run.data;
  if (!r.plots) r.plots = {};
  if (r.plots[nodeId]) {
    useUiStore().toast('info', '이미 자리가 잡혀 있다.');
    return false;
  }
  const crop = getCrop(cropId);
  if (!crop) return false;
  r.plots[nodeId] = {
    cropId: crop.id,
    plantedTurn: r.visitedNodes.length,
    lastTickTurn: r.visitedNodes.length,
    growTurns: crop.growTurns,
    waterAt: [...crop.waterAt],
    wateredCount: 0,
    growthProgress: 0,
  };
  useUiStore().toast('success', `${crop.seedName}${eulReul(crop.seedName)} 심었다.`);
  return true;
}

/** 노드의 텃밭 상태 조회 (없으면 undefined). */
export function getPlot(nodeId: string): PlotState | undefined {
  return useRunStore().data.plots?.[nodeId];
}

/**
 * 지금 물이 필요한가 — growthProgress가 아직 충족하지 않은 다음 물 임계에 도달했는가.
 * 충족한 물 임계 수(wateredCount)보다 더 많은 임계를 growthProgress가 지났으면 true.
 */
export function needsWater(nodeId: string): boolean {
  const plot = getPlot(nodeId);
  if (!plot) return false;
  // 진행도가 지나온 물 임계 개수.
  const reached = plot.waterAt.filter((t) => plot.growthProgress >= t).length;
  return reached > plot.wateredCount;
}

/**
 * 돌봄 게이트 행동(농사=물 주기) — 게이트가 열린 상태면 wateredCount+1 하고 진행 재개. 성공 시 true.
 * 수학(needsWater/wateredCount)은 농사와 동일. 토스트 문구만 작물 careLabel을 따른다.
 */
export function water(nodeId: string): boolean {
  const run = useRunStore();
  const plot = run.data.plots?.[nodeId];
  if (!plot) return false;
  const label = careLabelFor(getCrop(plot.cropId));
  if (!needsWater(nodeId)) {
    useUiStore().toast('info', `지금은 ${label}${eulReul(label)} 할 때가 아니다.`);
    return false;
  }
  plot.wateredCount += 1;
  useUiStore().toast('success', `${label}${eulReul(label)} 마쳤다.`);
  return true;
}

/**
 * 텃밭 성장 lazy 정산 — 마지막 정산 이후 흐른 전역 턴만큼 growthProgress를 진행한다.
 * UI는 텃밭을 표시하기 직전·물 준 직후에 이걸 호출한다(조회 시점 정산). harvest도 내부 호출.
 *  - now = visitedNodes.length(전역 턴). available = now - lastTickTurn.
 *  - 물 게이트(needsWater)에 막히면 break → 막힌 시점 이후의 available 턴은 forfeit(성장 미반영).
 *  - 어느 경우든 lastTickTurn을 now로 끌어올려, 막힌 동안 흐른 턴이 나중에 소급되지 않게 한다.
 * 부작용은 growthProgress/lastTickTurn 갱신뿐(아이템·컬러·XP는 harvest에서만).
 */
export function refreshPlot(nodeId: string): void {
  const r = useRunStore().data;
  const plot = r.plots?.[nodeId];
  if (!plot) return;
  const now = r.visitedNodes.length;
  if (plot.growthProgress >= plot.growTurns) {
    plot.lastTickTurn = now;
    return;
  }
  let available = now - plot.lastTickTurn;
  if (available <= 0) return;
  while (available > 0 && plot.growthProgress < plot.growTurns) {
    if (needsWater(nodeId)) break; // 물 게이트 — 남은 available 턴 forfeit.
    plot.growthProgress += 1;
    available -= 1;
  }
  plot.lastTickTurn = now;
}

/** 수확 가능한가 — 완성 도달 + 모든 물 임계 충족. */
export function isReady(nodeId: string): boolean {
  const plot = getPlot(nodeId);
  if (!plot) return false;
  if (plot.growthProgress < plot.growTurns) return false;
  // 완성 시점까지의 모든 물 임계가 충족되어야 함.
  const requiredWaters = plot.waterAt.filter((t) => t <= plot.growTurns).length;
  return plot.wateredCount >= requiredWaters;
}

/**
 * 수확 상위확률(0~100) — clamp(BASE + lifeLevel*K + 작물 element 컬러 스케일).
 * activity.ts의 성공확률 모델 미러. 후반(고레벨/고컬러)일수록 상위 산출이 잦다.
 */
export function harvestUpperChance(crop: CropDef): number {
  const r = useRunStore().data;
  const lifeLevel = r.lifeLevel ?? 1;
  const colorValue = r.colors[elementColorKey(crop.element)] ?? 0;
  const chance =
    HARVEST_BASE_BONUS +
    lifeLevel * HARVEST_LEVEL_K +
    Math.round(colorValue) * HARVEST_COLOR_SCALE;
  return Math.max(0, Math.min(100, Math.round(chance)));
}

/** 수확 결과 — 산출 아이템 목록 + 부여 컬러량 + 적립 생활 XP. (UI 표시·테스트용 반환.) */
export interface HarvestResult {
  cropId: string;
  /** 상위 산출 여부(상위확률 판정 결과). */
  upper: boolean;
  /** 산출한 아이템 id 목록(개수만큼 중복). */
  itemIds: string[];
  /** 부여한 작물 컬러량. */
  colorGain: number;
  /** 적립한 생활 XP. */
  lifeXp: number;
}

/**
 * 수확 — 텃밭을 거두고 산출을 run에 반영, plots에서 제거.
 *  - 상위확률 판정(harvestUpperChance) → 상위/하위 결과물.
 *  - 개수는 생활레벨·컬러로 약간 스케일(1 + floor(lifeLevel/3) + (상위면 +1)).
 *  - 작물 element 컬러 부여(+colorGain) + 생활 XP 적립(addLifeXp).
 * 수확 불가(텃밭 없음/미완성)면 null.
 *
 * upperBonus(선택, %p) — 이 *한 회차*에만 상위확률에 더하는 보너스(미니게임 결과 등).
 *   판정 chance에만 가산하고 산출 개수·컬러·XP 공식은 그대로(상위확률 기본 모델 불변).
 *   인자 없이 호출하면 기존 동작과 동일(0%p) → 미니게임 미연동 화면 회귀 0.
 */
export function harvest(nodeId: string, upperBonus = 0): HarvestResult | null {
  const run = useRunStore();
  const r = run.data;
  const plot = r.plots?.[nodeId];
  if (!plot) return null;
  refreshPlot(nodeId); // 판정 전 성장 정산.
  if (!isReady(nodeId)) {
    useUiStore().toast('info', '아직 거둘 때가 아니다.');
    return null;
  }
  const crop = getCrop(plot.cropId);
  if (!crop) {
    // 정의가 사라진 작물 — 안전하게 텃밭만 제거.
    delete r.plots![nodeId];
    return null;
  }

  const data = useDataStore();
  const lifeLevel = r.lifeLevel ?? 1;

  // 상위/하위 판정 (결정적 rng). upperBonus는 이 회차 한정 가산(미니게임 등), 기본 모델은 불변.
  const roll = Math.round(rng() * 100);
  const chance = Math.max(0, Math.min(100, harvestUpperChance(crop) + upperBonus));
  const upper = roll <= chance;

  // 산출 개수 — 기본 1 + 생활레벨/3 + 상위 보너스. (후반일수록 더 많이.)
  const count = 1 + Math.floor(lifeLevel / 3) + (upper ? 1 : 0);
  const itemId = upper ? crop.upperItemId : crop.lowerItemId;
  const itemDef = data.items.get(itemId);
  const itemIds: string[] = [];
  if (itemDef) {
    for (let i = 0; i < count; i++) {
      run.addItem(itemDef);
      itemIds.push(itemId);
    }
  }

  // 작물 element 컬러 부여 — 후반(고레벨)일수록 약간 큼. 상위 산출이면 +1.
  const colorGain = 2 + Math.floor(lifeLevel / 2) + (upper ? 1 : 0);
  applyColorBoost(elementColorKey(crop.element), colorGain);

  // 생활 XP 적립 — 상위면 +1.
  const xpGain = 1 + (upper ? 1 : 0);
  run.addLifeXp(xpGain);

  // 텃밭 제거 (재심기 가능).
  delete r.plots![nodeId];

  useUiStore().toast(
    'success',
    `${cropDisplayName(crop)} 수확 — ${upper ? '상품' : '평작'} ${count}개.`,
  );

  return { cropId: crop.id, upper, itemIds, colorGain, lifeXp: xpGain };
}
