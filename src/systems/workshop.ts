/**
 * 공방 시스템 — 카드 강화 + 희귀+ 카드 제작.
 *
 * 사양:
 *  - 강화: 컬렉션 카드 1장을 *upgrade_to* 카드로 교체. 비용 시간조각 8. 매번 사용 가능.
 *  - 제작: 노드 진입 시 희귀+ 카드 3장 시드 추첨. 시간조각 15로 1장 선택. 노드 1회 한정.
 *  - 강화 대상은 *upgrade_to가 있는 카드*만. 강화판은 재강화 불가.
 *  - 강화 시 덱 슬롯에 있던 인스턴스면 덱도 동기화 (instanceId 교체).
 */

import type { Card, ForgeCardSlot, ForgeOffer, Rank } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { instantiateCard } from '@/systems/deck';
import { rng } from '@/systems/rng';

export const UPGRADE_COST_TIME_SHARDS = 8;
export const FORGE_PRICE_TIME_SHARDS = 15;
export const LEGENDARY_COST_TIME_SHARDS = 25;
export const RARE_MATERIAL_ID_ACT1 = 'i-time-answer';
const FORGE_NUM_OFFERS = 3;
// 사용자 사양: legendary는 *추첨 폐지*, *마을 고유 풀 + 특산물 + 희소 재료*로만 제작.
const FORGE_RANKS: Rank[] = ['rare'];

/** 강화 가능한가 — upgrade_to 정의 + 대상 카드 존재 + 자원 충분. */
export function canUpgrade(card: Card): boolean {
  const run = useRunStore();
  const data = useDataStore();
  if (!card.upgradeToId) return false;
  if (!data.cards.get(card.upgradeToId)) return false;
  if (run.data.timeShards < UPGRADE_COST_TIME_SHARDS) return false;
  return true;
}

/** 컬렉션의 instanceId 카드를 upgrade_to 카드로 교체. 덱 슬롯에도 있으면 동기화. */
export function upgradeCard(instanceId: string): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const r = run.data;

  const cIdx = r.collection.findIndex((c) => c.instanceId === instanceId);
  if (cIdx < 0) {
    ui.toast('warning', '강화할 카드를 찾을 수 없습니다.');
    return false;
  }
  const original = r.collection[cIdx];
  if (!original.upgradeToId) {
    ui.toast('warning', '이미 강화된 카드입니다.');
    return false;
  }
  const upgradedDef = data.cards.get(original.upgradeToId);
  if (!upgradedDef) {
    ui.toast('warning', `강화판 데이터 없음 (${original.upgradeToId})`);
    return false;
  }
  if (r.timeShards < UPGRADE_COST_TIME_SHARDS) {
    ui.toast('warning', `시간의 조각이 부족합니다. (필요 ${UPGRADE_COST_TIME_SHARDS})`);
    return false;
  }

  r.timeShards -= UPGRADE_COST_TIME_SHARDS;
  // 새 인스턴스 생성 — 원본 instanceId는 버린다 (덱 동기화도 동일 패턴).
  const newInstance = instantiateCard(upgradedDef);
  r.collection.splice(cIdx, 1, newInstance);

  const dIdx = r.deck.findIndex((c) => c.instanceId === instanceId);
  if (dIdx >= 0) {
    r.deck.splice(dIdx, 1, newInstance);
  }

  if (!r.newCardEncounters.includes(upgradedDef.id)) {
    r.newCardEncounters.push(upgradedDef.id);
  }

  ui.toast('success', `'${original.name}' → '${upgradedDef.name}' 강화`);
  return true;
}

/** 강화 가능한 컬렉션 카드 목록 — UI 표시용. */
export function listUpgradableCards(): Card[] {
  const run = useRunStore();
  const data = useDataStore();
  return run.data.collection.filter(
    (c) => !!c.upgradeToId && !!data.cards.get(c.upgradeToId),
  );
}

// === 희귀+ 제작 ===

function getForgePool(): Card[] {
  const data = useDataStore();
  const pool: Card[] = [];
  for (const c of data.cards.values()) {
    if (!FORGE_RANKS.includes(c.rank)) continue;
    // 시작 덱 시드는 제외 — 일반 카드와 동일 정책.
    if (c.source === 'race' || c.source === 'character') continue;
    pool.push(c);
  }
  return pool;
}

/**
 * 카드 element와 매칭되는 권역 특산물 ID — 마을 권역 우선, 없으면 임의 매칭.
 * 사용자 사양: "희귀 카드는 마을마다 다른 특산물을 요구함".
 */
function specialtyForCardElement(element: string | undefined): string | undefined {
  if (!element) return undefined;
  const data = useDataStore();
  let villageMatch: string | undefined;
  let anyMatch: string | undefined;
  for (const map of data.nodeMaps.values()) {
    for (const region of map.regions) {
      if (region.primaryColor !== element) continue;
      if (!region.specialtyItemId) continue;
      // 마을 권역(legendaryCardIds 정의된 곳) 우선 매칭.
      if (region.legendaryCardIds?.length && !villageMatch) {
        villageMatch = region.specialtyItemId;
      }
      if (!anyMatch) anyMatch = region.specialtyItemId;
    }
  }
  return villageMatch ?? anyMatch;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** 노드 진입 시 1회만 호출 — 이미 있으면 그대로 반환. */
export function getOrCreateForgeOffer(nodeId: string): ForgeOffer {
  const run = useRunStore();
  if (!run.data.forgeOffers) run.data.forgeOffers = {};
  const existing = run.data.forgeOffers[nodeId];
  if (existing) return existing;

  const candidates = pickRandom(getForgePool(), FORGE_NUM_OFFERS);
  const cards: ForgeCardSlot[] = candidates.map((c) => {
    const instance = instantiateCard(c);
    return {
      cardId: c.id,
      cardInstanceId: instance.instanceId!,
      price: FORGE_PRICE_TIME_SHARDS,
      purchased: false,
      // 카드 element → 마을 권역 특산물 매핑. 미매칭이면 시간조각만 요구.
      requiredSpecialtyId: specialtyForCardElement(c.element),
    };
  });
  const offer: ForgeOffer = {
    generatedAt: run.data.rngState,
    cards,
  };
  run.data.forgeOffers[nodeId] = offer;
  return offer;
}

// ============================================================
// 전설 제작 — 마을 고유 카드 풀.
// 자원: 시간조각 25 + 권역 특산물 1 + 희소 재료 1.
// 노드 *재방문 시* 또 만들 수 있음 (자원이 충분하면). 추첨 X.
// ============================================================

export interface LegendaryRecipe {
  cardId: string;
  cardName: string;
  regionId: string;
  regionName: string;
  specialtyItemId: string;
  specialtyName: string;
}

/** 데이터 전체에서 *마을 권역의 legendaryCardIds* 모두 수집. */
export function getLegendaryRecipes(): LegendaryRecipe[] {
  const data = useDataStore();
  const recipes: LegendaryRecipe[] = [];
  for (const map of data.nodeMaps.values()) {
    for (const region of map.regions) {
      if (!region.legendaryCardIds?.length) continue;
      if (!region.specialtyItemId) continue;
      for (const cardId of region.legendaryCardIds) {
        const card = data.cards.get(cardId);
        const itm = data.items.get(region.specialtyItemId);
        if (!card || !itm) continue;
        recipes.push({
          cardId,
          cardName: card.name,
          regionId: region.id,
          regionName: region.name,
          specialtyItemId: region.specialtyItemId,
          specialtyName: itm.name,
        });
      }
    }
  }
  return recipes;
}

export function canCraftLegendary(recipe: LegendaryRecipe): boolean {
  const run = useRunStore();
  const r = run.data;
  if (r.timeShards < LEGENDARY_COST_TIME_SHARDS) return false;
  const hasSpecialty = r.items.some((i) => i.id === recipe.specialtyItemId);
  if (!hasSpecialty) return false;
  const hasRare = r.items.some((i) => i.id === RARE_MATERIAL_ID_ACT1);
  if (!hasRare) return false;
  return true;
}

export function craftLegendary(recipe: LegendaryRecipe): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const r = run.data;
  if (!canCraftLegendary(recipe)) {
    ui.toast('warning', '자원 부족 (시간조각 25 + 특산물 + 희소 재료 필요).');
    return false;
  }
  // 특산물 1개 소모 — 첫 매칭 인덱스.
  const specIdx = r.items.findIndex((i) => i.id === recipe.specialtyItemId);
  if (specIdx < 0) return false;
  r.items.splice(specIdx, 1);
  // 희소 재료 1개 소모 — splice로 인덱스가 시프트됐을 수 있어 다시 검색.
  const rareIdx = r.items.findIndex((i) => i.id === RARE_MATERIAL_ID_ACT1);
  if (rareIdx < 0) return false;
  r.items.splice(rareIdx, 1);
  r.timeShards -= LEGENDARY_COST_TIME_SHARDS;

  const def = data.cards.get(recipe.cardId);
  if (!def) return false;
  run.addCardToCollection(def);
  ui.toast('success', `전설 카드 '${def.name}' 제작 완료`);
  return true;
}

/** 제작 슬롯이 *지금 구매 가능한지* — 자원 모두 확인. */
export function canPurchaseForgeCard(slot: ForgeCardSlot): boolean {
  const run = useRunStore();
  if (slot.purchased) return false;
  if (run.data.timeShards < slot.price) return false;
  if (slot.requiredSpecialtyId) {
    const has = run.data.items.some((i) => i.id === slot.requiredSpecialtyId);
    if (!has) return false;
  }
  return true;
}

/** 제작 슬롯 1장 구매. 1장 사면 나머지도 purchased 처리(1회 한정). */
export function purchaseForgeCard(nodeId: string, slotIndex: number): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const offer = run.data.forgeOffers?.[nodeId];
  if (!offer) return false;
  const slot = offer.cards[slotIndex];
  if (!slot || slot.purchased) return false;
  if (run.data.timeShards < slot.price) {
    ui.toast('warning', `시간의 조각이 부족합니다. (필요 ${slot.price})`);
    return false;
  }
  // 특산물 요구 — 보유 확인 + 소모.
  if (slot.requiredSpecialtyId) {
    const specIdx = run.data.items.findIndex((i) => i.id === slot.requiredSpecialtyId);
    if (specIdx < 0) {
      const specName = data.items.get(slot.requiredSpecialtyId)?.name ?? slot.requiredSpecialtyId;
      ui.toast('warning', `특산물 '${specName}'이 필요합니다.`);
      return false;
    }
    run.data.items.splice(specIdx, 1);
  }
  const def = data.cards.get(slot.cardId);
  if (!def) return false;

  run.data.timeShards -= slot.price;
  const inst: Card = { ...def, instanceId: slot.cardInstanceId };
  run.addCardToCollection(inst);

  // 1장 구매 = 나머지 자동 마감.
  for (const s of offer.cards) s.purchased = true;

  ui.toast('success', `'${def.name}' 제작 — 시간의 조각 -${slot.price}`);
  return true;
}
