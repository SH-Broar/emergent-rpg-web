/**
 * 채집 노드 보상 처리 — 미니게임 점수로 보상에 배수를 곱하고, 점수가 tier 임계를 넘으면 후반 보너스.
 *
 * 사용자 사양(미니게임 개편):
 *  - 채집은 GatherView의 미니게임 결과(점수 0..1)를 받아 보상에 *배수*를 적용한다.
 *  - 배수 = lerp(MIN_MUL, MAX_MUL, score) (폭 크게). 모든 보상(전반/후반)에 곱.
 *  - 점수 >= tier 임계면 *후반 풀*(특산물 확정 경향 + 희귀재료 + 컬러 부스트 + T3+ 전설) 추가.
 *  - 기본 풀(전반: 시간조각 + gold + 가끔 일반재료/특산물)은 *항상*.
 *  - 기존 수화중(×1.5)·축복(×1.25)·동료 채집증폭 곱은 그대로 유지.
 *  - 노드당 1회(done 마킹, 하루 경과 시 노드 리프레시로 재개방). 반복 효율감쇠(gatherCount) 폐기.
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { applyColorBoost } from '@/systems/colors';
import { rewardItem, rewardColor, rewardShards, rewardGold, blessingMul } from '@/systems/reward-feed';
import { companionRewardMul } from '@/systems/companion';
import { rng } from '@/systems/rng';
import { gatherThresholdAdd } from '@/systems/chaos';
import type { Region } from '@/data/schemas';

// 희귀도 사다리 재료 id (Item Economy).
const MATERIAL_COMMON_ID = 'i-material-common';
const MATERIAL_RARE_ID = 'i-material-rare';
const MATERIAL_LEGENDARY_ID = 'i-time-answer';

// 채집 재료 드롭: 전반 → 일반재료, 후반 → 희귀재료, T3+ 권역 후반 → 전설재료(극희소).
const EARLY_COMMON_MAT_CHANCE = 0.35;
const LATE_RARE_MAT_CHANCE = 0.45;
const LATE_LEGENDARY_MAT_CHANCE = 0.12; // T3+ 권역 후반에서만.
const SPECIALTY_DROP_EARLY_CHANCE = 0.30;

// 미니게임 점수 → 보상 배수. 폭이 크게(부진하면 줄고, 잘하면 크게 늘어난다).
const MIN_GATHER_MUL = 0.5;
const MAX_GATHER_MUL = 2.5;

function clampTier(t: number | undefined): number {
  if (!t || t < 1) return 1;
  return t > 4 ? 4 : t;
}

/**
 * 권역 tier별 *후반 보너스 임계 점수*. 깊은 권역일수록 더 잘해야(높은 점수) 후반 풀이 열린다.
 * T1 0.50 → T2 0.60 → T3 0.70 → T4 0.80.
 */
export function gatherScoreThreshold(tier: number | undefined): number {
  const t = clampTier(tier);
  return 0.4 + t * 0.1;
}

/** 점수(0..1+) → 보상 배수. lerp(MIN, MAX, clamp(score,0,1)). 미니게임이 1.2까지 줄 수 있어 상한 살짝 여유. */
export function gatherRewardMul(score: number): number {
  const s = Math.max(0, Math.min(1.2, score));
  return MIN_GATHER_MUL + (MAX_GATHER_MUL - MIN_GATHER_MUL) * s;
}

/**
 * 노드 진입 + 미니게임 점수(0..1)로 채집 보상을 적용. GatherView가 미니게임 종료 시 호출.
 *  - score: 미니게임 정규화 점수(0..1, 일부 게임은 1.2까지). 보상 배수로 변환.
 *  - 점수 >= tier 임계면 후반 풀 보너스 추가.
 */
export function performGather(nodeId: string, score: number): void {
  const run = useRunStore();
  const data = useDataStore();
  const r = run.data;

  const map = data.nodeMaps.get(data.timelines.get(r.timelineId)?.nodeMapId ?? '');
  const node = map?.nodes.find((n) => n.id === nodeId);
  const region: Region | undefined = node?.region
    ? map?.regions.find((rg) => rg.id === node.region)
    : undefined;

  const tier = clampTier(region?.tier);
  const primary = region?.primaryColor;

  // 미니게임 점수가 tier 임계 이상이면 후반 풀(특산물/희귀재료/컬러/전설)이 열린다.
  // 카오스 ch-hard-gather(척박한 땅) — 후반 임계를 강도만큼 높여 좋은 채집을 어렵게. 비활성 시 +0.
  const lateThreshold = Math.min(0.95, gatherScoreThreshold(tier) + gatherThresholdAdd() / 100);
  const isLate = score >= lateThreshold;

  // 점수 배수(폭 큼) × 심수화(×1.5) × 축복(×1.25) × 동료 채집 증폭.
  const scoreMul = gatherRewardMul(score);
  const exploreMul =
    scoreMul * ((r.feralHeavy ?? 0) > 0 ? 1.5 : 1) * blessingMul() * companionRewardMul('gather');

  // done 마킹 — 노드당 1회. (visitNode가 먼저 실행되어 nodeState는 보통 존재하지만 방어적으로.)
  markGatherDone(nodeId);

  // 획득물마다 *짧은 토스트 하나*씩.
  if (isLate) {
    // === 후반 풀 ===
    // 1) 특산물 — 점수가 좋을수록 거의 확정(배수가 1.0을 넘으면 확정).
    if (region?.specialtyItemId && rng() < Math.min(1, scoreMul)) {
      const itm = data.items.get(region.specialtyItemId);
      if (itm) {
        run.addItem(itm);
        rewardItem(itm);
      }
    }
    // 2) 컬러 부스트 — 그 권역의 대표 컬러(배수 반영).
    if (primary) {
      const d = applyColorBoost(primary, Math.max(1, Math.round(3 * scoreMul)));
      rewardColor(primary, d);
    }
    // 3) 희귀 재료 — 후반 채집(배수 반영).
    if (rng() < Math.min(0.95, LATE_RARE_MAT_CHANCE * scoreMul)) {
      const rare = data.items.get(MATERIAL_RARE_ID);
      if (rare) {
        run.addItem(rare);
        rewardItem(rare);
      }
    }
    // 3b) 전설 재료 — *T3+ 권역 후반*에서만 극희소(배수 반영).
    if (tier >= 3 && rng() < Math.min(0.4, LATE_LEGENDARY_MAT_CHANCE * scoreMul)) {
      const leg = data.items.get(MATERIAL_LEGENDARY_ID);
      if (leg) {
        run.addItem(leg);
        rewardItem(leg);
      }
    }
    // 4) 약간의 시간조각 보너스(배수 + 수화/축복/동료 반영).
    const lateShards = Math.max(1, Math.round(2 * exploreMul));
    r.timeShards += lateShards;
    rewardShards(lateShards);
  } else {
    // === 전반 풀(항상) — 배수 반영 ===
    const shards = Math.max(1, Math.round((2 + Math.floor(rng() * 3)) * exploreMul));
    const gold = Math.max(1, Math.round((3 + Math.floor(rng() * 5)) * exploreMul));
    r.timeShards += shards;
    r.gold += gold;
    rewardShards(shards);
    rewardGold(gold);

    // 가끔 특산물 — *전반에서도 작은 확률로*(배수 반영).
    if (region?.specialtyItemId && rng() < Math.min(0.9, SPECIALTY_DROP_EARLY_CHANCE * scoreMul)) {
      const itm = data.items.get(region.specialtyItemId);
      if (itm) {
        run.addItem(itm);
        rewardItem(itm);
      }
    }
    // 일반 재료 — 전반 채집의 안정 공급(배수 반영).
    if (rng() < Math.min(0.95, EARLY_COMMON_MAT_CHANCE * scoreMul)) {
      const mat = data.items.get(MATERIAL_COMMON_ID);
      if (mat) {
        run.addItem(mat);
        rewardItem(mat);
      }
    }
  }
}

/** 채집 완료 표시 — *노드당 1회*. 하루 경과 시 노드 리프레시로 다시 열린다. */
export function markGatherDone(nodeId: string): void {
  const r = useRunStore().data;
  if (!r.nodeStates[nodeId]) r.nodeStates[nodeId] = { visited: true };
  r.nodeStates[nodeId].gatherDone = true;
}

/** 이미 다녀간 채집인가(그 노드). */
export function isGatherDone(nodeId: string): boolean {
  return !!useRunStore().data.nodeStates[nodeId]?.gatherDone;
}
