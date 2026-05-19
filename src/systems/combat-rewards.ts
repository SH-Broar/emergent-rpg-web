/**
 * 전투 클리어 보상 — 권역 특산물 + 컬러 부스트 + 엘리트의 희소 재료.
 *
 * 사용자 사양:
 *  - 일반 몬스터: 특산물 드롭, 컬러 부스트.
 *  - 엘리트: 희소 재료 드롭, 더 큰 컬러 부스트.
 *  - 보스: boss-rewards가 별도로 처리 (여기서 X).
 *  - *같은 노드 재클리어 시 재드롭 X*. nodeStates.combatCleared로 추적.
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { applyColorBoost } from '@/systems/colors';
import { rng } from '@/systems/rng';
import { effectiveKind as systemEffectiveKind } from '@/systems/map';

const RARE_MATERIAL_ID_ACT1 = 'i-time-answer';

const NORMAL_SPECIALTY_CHANCE = 0.25;
const ELITE_SPECIALTY_CHANCE = 0.50;
const ELITE_RARE_MATERIAL_CHANCE = 0.25;
const NORMAL_COLOR_BOOST = 2;
const ELITE_COLOR_BOOST = 4;

/**
 * 전투 승리 시 호출 — markCombatCleared *전*에 호출해야 *이번 클리어가 첫 클리어*인지 안다.
 * (이미 cleared면 보상 없이 반환.)
 */
export function applyCombatVictoryReward(nodeId: string): void {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const r = run.data;

  // 이미 클리어된 노드는 재드롭 X.
  const state = r.nodeStates[nodeId];
  if (state?.combatCleared) return;

  const map = data.nodeMaps.get(data.timelines.get(r.timelineId)?.nodeMapId ?? '');
  const node = map?.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const region = node.region
    ? map?.regions.find((rg) => rg.id === node.region)
    : undefined;
  if (!region) return;

  const kind = systemEffectiveKind(node, r);
  const isElite = kind === 'elite';

  const lines: string[] = [];

  // 컬러 부스트 — 권역 primaryColor에 일반/엘리트 차등.
  if (region.primaryColor) {
    const amount = isElite ? ELITE_COLOR_BOOST : NORMAL_COLOR_BOOST;
    const delta = applyColorBoost(region.primaryColor, amount);
    if (delta > 0) lines.push(`${region.primaryColor} +${delta}`);
  }

  // 특산물 드롭.
  if (region.specialtyItemId) {
    const chance = isElite ? ELITE_SPECIALTY_CHANCE : NORMAL_SPECIALTY_CHANCE;
    if (rng() < chance) {
      const itm = data.items.get(region.specialtyItemId);
      if (itm) {
        run.addItem(itm);
        lines.push(`특산물 '${itm.name}'`);
      }
    }
  }

  // 엘리트만 — 희소 재료 드롭.
  if (isElite && rng() < ELITE_RARE_MATERIAL_CHANCE) {
    const rare = data.items.get(RARE_MATERIAL_ID_ACT1);
    if (rare) {
      run.addItem(rare);
      lines.push(`*희소 재료* '${rare.name}'`);
    }
  }

  if (lines.length > 0) {
    ui.toast('success', `${isElite ? '엘리트' : '전투'} 보상 — ${lines.join(', ')}`);
  }
}
