/**
 * 채집 노드 보상 처리 — 권역 컬러 임계로 *전반/후반* 분기.
 *
 * 사용자 사양:
 *  - 전반(기본): 시간조각 + gold + 가끔 특산물.
 *  - 후반(권역 primaryColor >= gatherThreshold): 특산물 확정 + 가끔 희소 재료 + 컬러 부스트.
 *  - 컬러 임계 기본 80. 권역마다 다를 수 있음.
 *  - 희소 재료는 *런 전체 3~4개 한정* — 채집 후반의 드롭률은 낮게 (15%).
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { applyColorBoost } from '@/systems/colors';
import { rewardItem, rewardColor, rewardShards, rewardGold } from '@/systems/reward-feed';
import { rng } from '@/systems/rng';
import { gatherThresholdAdd } from '@/systems/chaos';
import type { Region } from '@/data/schemas';

// 희귀도 사다리 재료 id (Item Economy).
const MATERIAL_COMMON_ID = 'i-material-common';
const MATERIAL_RARE_ID = 'i-material-rare';
const MATERIAL_LEGENDARY_ID = 'i-time-answer';

// 채집 재료 드롭 (Q8): 전반 → 일반재료, 후반 → 희귀재료, T3+ 권역 후반 → 전설재료(극희소).
const EARLY_COMMON_MAT_CHANCE = 0.35;
const LATE_RARE_MAT_CHANCE = 0.45;
const LATE_LEGENDARY_MAT_CHANCE = 0.12; // T3+ 권역 후반에서만.
const SPECIALTY_DROP_EARLY_CHANCE = 0.30;
const DEFAULT_GATHER_THRESHOLD = 80;

function clampTier(t: number | undefined): number {
  if (!t || t < 1) return 1;
  return t > 4 ? 4 : t;
}

/**
 * 노드 진입 시 채집 보상을 적용. 권역 정보 + 플레이어 컬러로 분기.
 * MapView에서 `case 'gather'` 분기에 호출.
 */
export function performGather(nodeId: string): void {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const r = run.data;

  const map = data.nodeMaps.get(data.timelines.get(r.timelineId)?.nodeMapId ?? '');
  const node = map?.nodes.find((n) => n.id === nodeId);
  const region: Region | undefined = node?.region
    ? map?.regions.find((rg) => rg.id === node.region)
    : undefined;

  // 권역의 대표 컬러 + 임계 — 없으면 *기본 분기 X* (항상 전반 풀).
  // 카오스 hard-gather(척박한 땅) — 후반 임계 +N으로 후반 도달을 어렵게.
  const primary = region?.primaryColor;
  const threshold = (region?.gatherThreshold ?? DEFAULT_GATHER_THRESHOLD) + gatherThresholdAdd();
  const isLate =
    primary !== undefined && r.colors[primary] >= threshold;

  // 반복 채집 효율 체감 — 같은 곳을 갱신(하루 경과) 전에 여러 번 가면 효율이 계속 떨어진다.
  if (!r.nodeStates[nodeId]) r.nodeStates[nodeId] = { visited: true };
  const prevGather = r.nodeStates[nodeId].gatherCount ?? 0;
  const eff = Math.max(0.25, 1 - 0.3 * prevGather); // 1.0 → 0.7 → 0.4 → 0.25(바닥)
  r.nodeStates[nodeId].gatherCount = prevGather + 1;
  if (prevGather > 0) ui.toast('info', `채집 효율 ↓ ${Math.round(eff * 100)}%`);

  // 획득물마다 *짧은 토스트 하나*씩 — 한 줄 긴 알림 대신 여러 개로.
  if (isLate) {
    // === 후반 풀 (효율 eff 반영) ===
    // 1) 특산물 — 효율이 떨어지면 확정에서 확률로.
    if (region?.specialtyItemId && rng() < eff) {
      const itm = data.items.get(region.specialtyItemId);
      if (itm) {
        run.addItem(itm);
        rewardItem(itm);
      }
    }
    // 2) 컬러 부스트 — 그 권역의 대표 컬러 (효율 반영).
    if (primary) {
      const d = applyColorBoost(primary, Math.max(1, Math.round(3 * eff)));
      rewardColor(primary, d);
    }
    // 3) 희귀 재료 — 후반 채집(Q8). 효율 반영.
    if (rng() < LATE_RARE_MAT_CHANCE * eff) {
      const rare = data.items.get(MATERIAL_RARE_ID);
      if (rare) {
        run.addItem(rare);
        rewardItem(rare);
      }
    }
    // 3b) 전설 재료 — *T3+ 권역 후반*에서만 극희소(효율 반영).
    if (clampTier(region?.tier) >= 3 && rng() < LATE_LEGENDARY_MAT_CHANCE * eff) {
      const leg = data.items.get(MATERIAL_LEGENDARY_ID);
      if (leg) {
        run.addItem(leg);
        rewardItem(leg);
      }
    }
    // 4) 약간의 시간조각 보너스 (효율 반영).
    const lateShards = Math.max(1, Math.round(2 * eff));
    r.timeShards += lateShards;
    rewardShards(lateShards);
  } else {
    // === 전반 풀 (효율 eff 반영) ===
    const shards = Math.max(1, Math.round((2 + Math.floor(rng() * 3)) * eff));
    const gold = Math.max(1, Math.round((3 + Math.floor(rng() * 5)) * eff));
    r.timeShards += shards;
    r.gold += gold;
    rewardShards(shards);
    rewardGold(gold);

    // 가끔 특산물 — *전반에서도 작은 확률로* (효율 반영).
    if (region?.specialtyItemId && rng() < SPECIALTY_DROP_EARLY_CHANCE * eff) {
      const itm = data.items.get(region.specialtyItemId);
      if (itm) {
        run.addItem(itm);
        rewardItem(itm);
      }
    }
    // 일반 재료 — 전반 채집의 안정 공급(Q8, 효율 반영).
    if (rng() < EARLY_COMMON_MAT_CHANCE * eff) {
      const mat = data.items.get(MATERIAL_COMMON_ID);
      if (mat) {
        run.addItem(mat);
        rewardItem(mat);
      }
    }
  }
}
