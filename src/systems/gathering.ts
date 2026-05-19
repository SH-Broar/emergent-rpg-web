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
import { rng } from '@/systems/rng';
import type { Region } from '@/data/schemas';

const RARE_MATERIAL_ID_ACT1 = 'i-time-answer';
const RARE_MATERIAL_DROP_CHANCE = 0.15;
const SPECIALTY_DROP_EARLY_CHANCE = 0.30;
const DEFAULT_GATHER_THRESHOLD = 80;

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
  const primary = region?.primaryColor;
  const threshold = region?.gatherThreshold ?? DEFAULT_GATHER_THRESHOLD;
  const isLate =
    primary !== undefined && r.colors[primary] >= threshold;

  const lines: string[] = [];

  if (isLate) {
    // === 후반 풀 ===
    // 1) 특산물 확정 1개
    if (region?.specialtyItemId) {
      const itm = data.items.get(region.specialtyItemId);
      if (itm) {
        run.addItem(itm);
        lines.push(`특산물 — '${itm.name}'`);
      }
    }
    // 2) 컬러 부스트 — 그 권역의 대표 컬러 + 3
    if (primary) {
      const d = applyColorBoost(primary, 3);
      if (d > 0) lines.push(`${primary} 컬러 +${d}`);
    }
    // 3) 희소 재료 — 낮은 확률
    if (rng() < RARE_MATERIAL_DROP_CHANCE) {
      const rare = data.items.get(RARE_MATERIAL_ID_ACT1);
      if (rare) {
        run.addItem(rare);
        lines.push(`*희소 재료* — '${rare.name}'`);
      }
    }
    // 4) 약간의 시간조각 보너스 (후반의 *부수 보상*)
    r.timeShards += 2;
    lines.push('시간의 조각 +2');
    ui.toast('success', `채집(후반) — ${lines.join(', ')}`);
  } else {
    // === 전반 풀 ===
    const shards = 2 + Math.floor(rng() * 3);
    const gold = 3 + Math.floor(rng() * 5);
    r.timeShards += shards;
    r.gold += gold;
    lines.push(`시간의 조각 +${shards}`, `골드 +${gold}`);

    // 가끔 특산물 — *전반에서도 작은 확률로*.
    if (region?.specialtyItemId && rng() < SPECIALTY_DROP_EARLY_CHANCE) {
      const itm = data.items.get(region.specialtyItemId);
      if (itm) {
        run.addItem(itm);
        lines.push(`특산물 — '${itm.name}'`);
      }
    }
    // 권역의 대표 컬러가 *임계 미만이면* — 후반 가는 길이라는 *힌트* 토스트.
    const hint =
      primary !== undefined && r.colors[primary] < threshold
        ? ` (이 권역 후반: ${primary} ${threshold}+ 필요)`
        : '';
    ui.toast('success', `채집 — ${lines.join(', ')}${hint}`);
  }
}
