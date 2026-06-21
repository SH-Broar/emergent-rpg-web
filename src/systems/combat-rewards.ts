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
import { useMetaStore } from '@/stores/meta';
import { applyColorBoost } from '@/systems/colors';
import { acquireRelic } from '@/systems/relic';
import { rewardItem, rewardColor, rewardRelic, rewardCard, rewardSoul, rewardXp, rewardLevelUp, blessingMul } from '@/systems/reward-feed';
import { XP_NORMAL, XP_ELITE } from '@/systems/enhance';
import { availableRelics } from '@/systems/unlocks';
import { rng } from '@/systems/rng';
import { effectiveKind as systemEffectiveKind } from '@/systems/map';

// 희귀도 사다리 재료 id (Item Economy).
const MATERIAL_COMMON_ID = 'i-material-common';
const MATERIAL_RARE_ID = 'i-material-rare';
const MATERIAL_LEGENDARY_ID = 'i-time-answer';

// 티어 1~6 인덱스(0번은 미사용). 권역 깊이 비례 보상 테이블.
const NORMAL_COLOR_BY_TIER = [0, 2, 3, 4, 5, 6, 7];
const ELITE_COLOR_BY_TIER = [0, 4, 6, 8, 10, 12, 14];
const NORMAL_SPECIALTY_BY_TIER = [0, 0.25, 0.32, 0.40, 0.48, 0.56, 0.64];
const ELITE_SPECIALTY_BY_TIER = [0, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00];
// === 재료 드롭 매트릭스 (Q8) ===
// 일반 몹 → *일반 재료* (저확률, 흔하므로 양은 적게).
const NORMAL_COMMON_MAT_BY_TIER = [0, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55];
// 엘리트 → *희귀 재료* (권역 tier 비례).
const ELITE_RARE_MAT_BY_TIER = [0, 0.30, 0.40, 0.50, 0.62, 0.74, 0.85];
// 엘리트 + 일반몹 → *전설 재료* (극희소): 엘리트는 T3부터 의미 있는 확률으로 깊어질수록 증가. 일반몹엔 없음.
const ELITE_LEGENDARY_MAT_BY_TIER = [0, 0, 0, 0.06, 0.14, 0.22, 0.30];
// 질 — 엘리트 유물 드롭(심화 이상): T3 0.12 ~ T6 0.42.
const ELITE_RELIC_BY_TIER = [0, 0, 0, 0.12, 0.22, 0.32, 0.42];
// 질 — 엘리트 전설 카드 드롭(권역에 legendaryCardIds 있을 때): 0.06 + 0.03·tier.
function eliteLegendaryChance(tier: number): number {
  return 0.06 + 0.03 * tier;
}
// 영혼 — 엘리트 1마리 처치당 영구 메타 영혼 지급량(런 중 누적). 카오스 구매 통화.
const ELITE_SOUL_REWARD = 1;

function clampTier(t: number | undefined): number {
  if (!t || t < 1) return 1;
  return t > 6 ? 6 : t;
}

/**
 * 전투 승리 시 호출 — markCombatCleared *전*에 호출해야 *이번 클리어가 첫 클리어*인지 안다.
 * (이미 cleared면 보상 없이 반환.)
 */
export function applyCombatVictoryReward(nodeId: string): void {
  const run = useRunStore();
  const data = useDataStore();
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

  // === 경험치 (XP·레벨업) — 첫 클리어 가드 안(위에서 return됨)이라 재클리어 무적립. ===
  // 일반 1 / 엘리트 3. 레벨업 시 강화권 발급(run.gainXp가 처리).
  const xpGain = isElite ? XP_ELITE : XP_NORMAL;
  const levels = run.gainXp(xpGain);
  rewardXp(xpGain);
  rewardLevelUp(levels);

  // === 양 ===
  // 컬러 부스트 — 권역 primaryColor에 티어·일반/엘리트 차등.
  if (region.primaryColor) {
    const base = isElite ? ELITE_COLOR_BY_TIER[tier] : NORMAL_COLOR_BY_TIER[tier];
    const amount = Math.round(base * blessingMul()); // 축복 시 +25%
    const delta = applyColorBoost(region.primaryColor, amount);
    rewardColor(region.primaryColor, delta);
  }

  // 특산물 드롭 — 티어 비례 확률.
  if (region.specialtyItemId) {
    const chance = isElite ? ELITE_SPECIALTY_BY_TIER[tier] : NORMAL_SPECIALTY_BY_TIER[tier];
    if (rng() < chance) {
      const itm = data.items.get(region.specialtyItemId);
      if (itm) {
        run.addItem(itm);
        rewardItem(itm);
      }
    }
  }

  // === 희귀도 사다리 재료 (Q8 매트릭스) ===
  // 일반 몹 → 일반 재료(저확률). 엘리트 → 희귀 재료(tier 비례). T3+ 엘리트 → 전설 재료 소량.
  if (isElite) {
    if (rng() < ELITE_RARE_MAT_BY_TIER[tier]) {
      const mat = data.items.get(MATERIAL_RARE_ID);
      if (mat) {
        run.addItem(mat);
        rewardItem(mat);
      }
    }
    const legChance = ELITE_LEGENDARY_MAT_BY_TIER[tier];
    if (legChance > 0 && rng() < legChance) {
      const leg = data.items.get(MATERIAL_LEGENDARY_ID);
      if (leg) {
        run.addItem(leg);
        rewardItem(leg);
      }
    }
  } else {
    if (rng() < NORMAL_COMMON_MAT_BY_TIER[tier]) {
      const mat = data.items.get(MATERIAL_COMMON_ID);
      if (mat) {
        run.addItem(mat);
        rewardItem(mat);
      }
    }
  }

  // === 질 (엘리트 한정) ===
  if (isElite) {
    // 영혼 — 엘리트 처치마다 영구 메타 영혼 지급(카오스 구매 통화).
    useMetaStore().addSoul(ELITE_SOUL_REWARD);
    rewardSoul(ELITE_SOUL_REWARD);

    // 희귀 유물 — 심화(T3) 이상. 미보유·시작덱 출처 제외 풀에서 추첨.
    const relicChance = ELITE_RELIC_BY_TIER[tier];
    if (relicChance > 0 && rng() < relicChance) {
      const owned = new Set(r.relics.map((x) => x.id));
      const pool = availableRelics().filter(
        // race/character = 시작 전용, boss = 별도 경로(arc 특전·보스 보상) → 엘리트 드롭 풀에서 제외.
        (rl) => !owned.has(rl.id) && rl.source !== 'race' && rl.source !== 'character' && rl.source !== 'boss',
      );
      if (pool.length > 0) {
        const pick = pool[Math.floor(rng() * pool.length)];
        acquireRelic(pick);
        rewardRelic(pick.name);
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
        rewardCard(card.name);
      }
    }
  }
}
