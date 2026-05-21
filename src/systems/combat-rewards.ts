/**
 * 전투 클리어 보상 — *권역 깊이(티어) 비례*. 양 + 질.
 *
 * 사용자 사양 (Stage 4):
 *  - 양: 깊은 권역일수록 컬러 부스트·특산물/희소 드롭률이 커진다.
 *  - 질: 깊은 권역의 *엘리트*는 희귀 유물·전설 카드를 떨군다.
 *  - 골드·시간조각(양)은 몬스터 drop 자체가 티어 스케일(로스터 v2)이라 여기선 다루지 않음.
 *  - 보스: boss-rewards가 별도로 처리 (여기서 X).
 *  - *같은 노드 재클리어 시 재드롭 X*. nodeStates.combatCleared로 추적.
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { applyColorBoost } from '@/systems/colors';
import { acquireRelic } from '@/systems/relic';
import { availableRelics } from '@/systems/unlocks';
import { rng } from '@/systems/rng';
import { effectiveKind as systemEffectiveKind } from '@/systems/map';

const RARE_MATERIAL_ID_ACT1 = 'i-time-answer';

// 티어 1~4 인덱스(0번은 미사용). 권역 깊이 비례 보상 테이블.
const NORMAL_COLOR_BY_TIER = [0, 2, 3, 4, 5];
const ELITE_COLOR_BY_TIER = [0, 4, 6, 8, 10];
const NORMAL_SPECIALTY_BY_TIER = [0, 0.25, 0.32, 0.40, 0.48];
const ELITE_SPECIALTY_BY_TIER = [0, 0.50, 0.60, 0.70, 0.80];
// 희소 재료: 엘리트는 전 티어, 일반은 심화(T3)부터.
const ELITE_RARE_BY_TIER = [0, 0.25, 0.35, 0.45, 0.60];
const NORMAL_RARE_BY_TIER = [0, 0, 0, 0.10, 0.18];
// 질 — 엘리트 유물 드롭(심화 이상): T3 0.12 / T4 0.22.
const ELITE_RELIC_BY_TIER = [0, 0, 0, 0.12, 0.22];
// 질 — 엘리트 전설 카드 드롭(권역에 legendaryCardIds 있을 때): 0.06 + 0.03·tier.
function eliteLegendaryChance(tier: number): number {
  return 0.06 + 0.03 * tier;
}

function clampTier(t: number | undefined): number {
  if (!t || t < 1) return 1;
  return t > 4 ? 4 : t;
}

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
  const tier = clampTier(region.tier);

  const lines: string[] = [];

  // === 양 ===
  // 컬러 부스트 — 권역 primaryColor에 티어·일반/엘리트 차등.
  if (region.primaryColor) {
    const amount = isElite ? ELITE_COLOR_BY_TIER[tier] : NORMAL_COLOR_BY_TIER[tier];
    const delta = applyColorBoost(region.primaryColor, amount);
    if (delta > 0) lines.push(`${region.primaryColor} +${delta}`);
  }

  // 특산물 드롭 — 티어 비례 확률.
  if (region.specialtyItemId) {
    const chance = isElite ? ELITE_SPECIALTY_BY_TIER[tier] : NORMAL_SPECIALTY_BY_TIER[tier];
    if (rng() < chance) {
      const itm = data.items.get(region.specialtyItemId);
      if (itm) {
        run.addItem(itm);
        lines.push(`특산물 '${itm.name}'`);
      }
    }
  }

  // 희소 재료 — 엘리트 전 티어 / 일반은 T3부터. 티어 비례.
  const rareChance = isElite ? ELITE_RARE_BY_TIER[tier] : NORMAL_RARE_BY_TIER[tier];
  if (rareChance > 0 && rng() < rareChance) {
    const rare = data.items.get(RARE_MATERIAL_ID_ACT1);
    if (rare) {
      run.addItem(rare);
      lines.push(`*희소 재료* '${rare.name}'`);
    }
  }

  // === 질 (엘리트 한정) ===
  if (isElite) {
    // 희귀 유물 — 심화(T3) 이상. 미보유·시작덱 출처 제외 풀에서 추첨.
    const relicChance = ELITE_RELIC_BY_TIER[tier];
    if (relicChance > 0 && rng() < relicChance) {
      const owned = new Set(r.relics.map((x) => x.id));
      const pool = availableRelics().filter(
        (rl) => !owned.has(rl.id) && rl.source !== 'race' && rl.source !== 'character',
      );
      if (pool.length > 0) {
        const pick = pool[Math.floor(rng() * pool.length)];
        acquireRelic(pick);
        lines.push(`*유물* '${pick.name}'`);
      }
    }

    // 전설 카드 — 권역 legendaryCardIds가 있을 때. 미보유 우선.
    const legendaryIds = region.legendaryCardIds ?? [];
    if (legendaryIds.length > 0 && rng() < eliteLegendaryChance(tier)) {
      const ownedCardIds = new Set(r.collection.map((c) => c.id));
      const candidates = legendaryIds.filter((id) => !ownedCardIds.has(id));
      const pickId = (candidates.length > 0 ? candidates : legendaryIds)[
        Math.floor(rng() * (candidates.length > 0 ? candidates.length : legendaryIds.length))
      ];
      const card = data.cards.get(pickId);
      if (card) {
        run.addCardToCollection(card);
        lines.push(`*전설 카드* '${card.name}'`);
      }
    }
  }

  if (lines.length > 0) {
    ui.toast('success', `${isElite ? '엘리트' : '전투'} 보상 — ${lines.join(', ')}`);
  }
}
