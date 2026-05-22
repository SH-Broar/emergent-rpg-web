/**
 * 공방 시스템 — 카드 강화 + 희귀+ 카드 제작.
 *
 * 사양:
 *  - 강화: 컬렉션 카드 1장을 *upgrade_to* 카드로 교체. 비용 시간조각 8. 매번 사용 가능.
 *  - 제작: 노드 진입 시 희귀+ 카드 3장 시드 추첨. 시간조각 15로 1장 선택. 노드 1회 한정.
 *  - 강화 대상은 *upgrade_to가 있는 카드*만. 강화판은 재강화 불가.
 *  - 강화 시 덱 슬롯에 있던 인스턴스면 덱도 동기화 (instanceId 교체).
 */

import type { Card, ForgeCardSlot, ForgeOffer, Item, Rank } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { instantiateCard } from '@/systems/deck';
import { availableCards } from '@/systems/unlocks';
import { rng } from '@/systems/rng';
import { upgradeCostMul } from '@/systems/chaos';

export const UPGRADE_COST_TIME_SHARDS = 8;
export const FORGE_PRICE_TIME_SHARDS = 15;
export const LEGENDARY_COST_TIME_SHARDS = 25;
// 희귀도 사다리 재료 id (Item Economy). 'i-time-answer'(전설)는 RARE_MATERIAL_ID_ACT1로 호환 유지.
export const MATERIAL_COMMON_ID = 'i-material-common';
export const MATERIAL_RARE_ID = 'i-material-rare';
export const MATERIAL_LEGENDARY_ID = 'i-time-answer';
export const RARE_MATERIAL_ID_ACT1 = MATERIAL_LEGENDARY_ID;
const FORGE_NUM_OFFERS = 3;
// 사용자 사양: legendary는 *추첨 폐지*, *마을 고유 풀 + 특산물 + 희소 재료*로만 제작.
const FORGE_RANKS: Rank[] = ['rare'];

// 강화 재료 곡선 (Q9): 기본/일반 강화 = 시간조각만. 희귀 강화 +희귀재료, 전설 강화 +전설재료.
// *강화 대상 카드의 rank*로 판정 (희귀 카드를 강화 → 희귀재료 요구).
export const UPGRADE_RARE_COST_TIME_SHARDS = 12;
export const UPGRADE_LEGENDARY_COST_TIME_SHARDS = 18;

/**
 * 강화 비용 표 — 카드 rank → { 시간조각, 재료 id(있으면) }.
 * 카오스 upgrade-cost-mul(무딘 숫돌) — 시간조각 비용에 배수(1+param) 적용(올림).
 */
export function upgradeCostFor(rank: Rank): { timeShards: number; materialId?: string } {
  const mul = upgradeCostMul();
  const scale = (n: number) => Math.ceil(n * mul);
  if (rank === 'rare') return { timeShards: scale(UPGRADE_RARE_COST_TIME_SHARDS), materialId: MATERIAL_RARE_ID };
  if (rank === 'legendary') return { timeShards: scale(UPGRADE_LEGENDARY_COST_TIME_SHARDS), materialId: MATERIAL_LEGENDARY_ID };
  // basic / common — 시간조각만 (현행).
  return { timeShards: scale(UPGRADE_COST_TIME_SHARDS) };
}

/** 강화 가능한가 — upgrade_to 정의 + 대상 카드 존재 + 자원(시간조각·재료) 충분. */
export function canUpgrade(card: Card): boolean {
  const run = useRunStore();
  const data = useDataStore();
  if (!card.upgradeToId) return false;
  if (!data.cards.get(card.upgradeToId)) return false;
  const cost = upgradeCostFor(card.rank);
  if (run.data.timeShards < cost.timeShards) return false;
  if (cost.materialId && !run.data.items.some((i) => i.id === cost.materialId)) return false;
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
  // 강화 재료 곡선 — 대상 카드 rank로 시간조각·재료 요구 결정.
  const cost = upgradeCostFor(original.rank);
  if (r.timeShards < cost.timeShards) {
    ui.toast('warning', `시간의 조각이 부족합니다. (필요 ${cost.timeShards})`);
    return false;
  }
  let materialIdx = -1;
  if (cost.materialId) {
    materialIdx = r.items.findIndex((i) => i.id === cost.materialId);
    if (materialIdx < 0) {
      const mName = data.items.get(cost.materialId)?.name ?? cost.materialId;
      ui.toast('warning', `'${mName}'이(가) 필요합니다.`);
      return false;
    }
  }

  r.timeShards -= cost.timeShards;
  if (materialIdx >= 0) r.items.splice(materialIdx, 1); // 재료 1개 소모.
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

  ui.toast('success', `카드 강화: ${original.name} → ${upgradedDef.name}`);
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
  const pool: Card[] = [];
  for (const c of availableCards()) { // 잠긴(미해금) 카드 제외
    if (!FORGE_RANKS.includes(c.rank)) continue;
    // 시작 덱 시드는 제외 — 일반 카드와 동일 정책.
    if (c.source === 'race' || c.source === 'character') continue;
    pool.push(c);
  }
  return pool;
}

/**
 * 권역 화이트리스트 적용 희귀 제작 풀(2026-05).
 *
 * 그 권역의 *대표 컬러(primaryColor)와 element가 맞는* 희귀 카드를 우선 노출 —
 * 권역색에 맞는 제작만 가능하게(사막에서 물의 희귀 카드가 나오는 어색함 방지).
 * 매칭 카드가 너무 적으면(< FORGE_NUM_OFFERS) 전체 풀로 폴백해 공방이 비지 않게 한다.
 */
function getRegionForgePool(regionId: string | undefined): Card[] {
  const all = getForgePool();
  if (!regionId) return all;
  const data = useDataStore();
  let primary: string | undefined;
  for (const map of data.nodeMaps.values()) {
    const region = map.regions.find((r) => r.id === regionId);
    if (region) { primary = region.primaryColor; break; }
  }
  if (!primary) return all;
  const matched = all.filter((c) => c.element === primary);
  return matched.length >= FORGE_NUM_OFFERS ? matched : all;
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

  // 권역 화이트리스트 — 이 공방 노드의 권역에 맞는 희귀 카드만 추첨.
  const candidates = pickRandom(getRegionForgePool(regionIdOfNode(nodeId)), FORGE_NUM_OFFERS);
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

/**
 * 마을 권역의 legendaryCardIds 수집.
 *
 * 화이트리스트(2026-05): `onlyRegionId`가 주어지면 *그 권역의 전설*만 반환한다 —
 * 각 공방은 자기 권역의 전설 카드만 제작할 수 있다(타 권역 전설은 그 권역 공방에서만).
 * 미지정이면 전체(도감/디버그용 폴백).
 */
export function getLegendaryRecipes(onlyRegionId?: string): LegendaryRecipe[] {
  const data = useDataStore();
  const recipes: LegendaryRecipe[] = [];
  for (const map of data.nodeMaps.values()) {
    for (const region of map.regions) {
      if (onlyRegionId && region.id !== onlyRegionId) continue;
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

/** 노드 id → 그 노드가 속한 권역 id (없으면 undefined). 공방/상점 화이트리스트용. */
export function regionIdOfNode(nodeId: string): string | undefined {
  const data = useDataStore();
  for (const map of data.nodeMaps.values()) {
    const node = map.nodes.find((n) => n.id === nodeId);
    if (node) return node.region;
  }
  return undefined;
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
  ui.toast('success', `카드: ${def.name} (제작)`);
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

  ui.toast('success', `카드: ${def.name} (-${slot.price} 시간의 조각)`);
  return true;
}

// ============================================================
// 포션 제작 — 마을(일반 포션) / 공방(희귀+ 포션).
// 연료 = 시간조각 + 등급 재료(일반=일반재료 / 희귀=희귀재료). 매번 가능(자원 충분 시).
//   마을: 일반(common) 포션만. 공방: 희귀(rare)+ 포션.
// ============================================================

/** 포션 1개 제작 비용 — rank → { 시간조각, 재료 id }. */
export const POTION_COMMON_COST_TIME_SHARDS = 6;
export const POTION_RARE_COST_TIME_SHARDS = 12;

export function potionCostFor(rank: Rank): { timeShards: number; materialId: string } {
  if (rank === 'rare') return { timeShards: POTION_RARE_COST_TIME_SHARDS, materialId: MATERIAL_RARE_ID };
  // basic/common 포션은 일반재료.
  return { timeShards: POTION_COMMON_COST_TIME_SHARDS, materialId: MATERIAL_COMMON_ID };
}

/**
 * 제작 가능한 포션 목록 — *소비형 + 효과 있음 + 재료/특산물 아님*.
 * ranks로 등급 필터 (마을=common, 공방=rare).
 */
export function listCraftablePotions(ranks: Rank[]): Item[] {
  const data = useDataStore();
  const out: Item[] = [];
  for (const itm of data.items.values()) {
    // 재료·특산물 제외 — 즉시 사용 포션만.
    if (itm.category === 'material' || itm.category === 'specialty') continue;
    if (!itm.consumable) continue;
    if (itm.effects.length === 0) continue;
    if (!ranks.includes(itm.rank)) continue;
    out.push(itm);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** 그 포션을 *지금* 제작할 수 있는지 — 시간조각·재료 확인. */
export function canCraftPotion(itm: Item): boolean {
  const run = useRunStore();
  const cost = potionCostFor(itm.rank);
  if (run.data.timeShards < cost.timeShards) return false;
  if (!run.data.items.some((i) => i.id === cost.materialId)) return false;
  return true;
}

/** 포션 1개 제작 — 시간조각 + 등급 재료 소모, 인벤토리에 인스턴스 추가. */
export function craftPotion(itm: Item): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const r = run.data;
  const cost = potionCostFor(itm.rank);
  if (r.timeShards < cost.timeShards) {
    ui.toast('warning', `시간의 조각이 부족합니다. (필요 ${cost.timeShards})`);
    return false;
  }
  const matIdx = r.items.findIndex((i) => i.id === cost.materialId);
  if (matIdx < 0) {
    const mName = data.items.get(cost.materialId)?.name ?? cost.materialId;
    ui.toast('warning', `'${mName}'이(가) 필요합니다.`);
    return false;
  }
  r.timeShards -= cost.timeShards;
  r.items.splice(matIdx, 1); // 등급 재료 1개 소모.
  run.addItem(itm); // 인스턴스 ID 부여하며 추가.
  ui.toast('success', `아이템: ${itm.name} (제작)`);
  return true;
}
