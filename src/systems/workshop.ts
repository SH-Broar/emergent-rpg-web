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
import { useRunStore, CARD_SALVAGE_SHARDS } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { instantiateCard } from '@/systems/deck';
import { availableCards } from '@/systems/unlocks';
import { rng } from '@/systems/rng';
import { isNoRemoval } from '@/systems/chaos';
import { isPossessionLocked } from '@/systems/possession';
import { isFormPoolActive, activeFormCardPool, RELEASE_CARD_ID } from '@/systems/form-pool';
import { awakenCostFor, needsAwakening, matchingSpecialties } from '@/systems/enhance';
import { LIFE_ACTIVITIES, cropForActivity } from '@/systems/life-activity';

// 가격·제작비·슬롯 수는 config/balance.txt 에서 로드 (useDataStore().balance). 누락 시 DEFAULT_BALANCE.
// 희귀도 사다리 재료 id (Item Economy). 'i-time-answer'(전설)는 RARE_MATERIAL_ID_ACT1로 호환 유지.
export const MATERIAL_COMMON_ID = 'i-material-common';
export const MATERIAL_RARE_ID = 'i-material-rare';
export const MATERIAL_LEGENDARY_ID = 'i-time-answer';
export const RARE_MATERIAL_ID_ACT1 = MATERIAL_LEGENDARY_ID;
// 사용자 사양: legendary는 *추첨 폐지*, *마을 고유 풀 + 특산물 + 희소 재료*로만 제작.
const FORGE_RANKS: Rank[] = ['rare'];

/**
 * 각성(공방) — 5강 도달 카드를 plus 정의로 진화 + awakened (XP·각성 시스템, 2026-06-10).
 *
 * 종전의 "재료 강화(upgrade_to 교체)"를 대체한다. 강화 1~5강은 레벨업 픽이 담당하고,
 * 공방은 *5강 게이트를 뚫는 각성*만 한다. 비용 = 카드 속성 매칭 특산물 N개 + 등급별 사다리 재료.
 *   - common/basic: 특산물2 + 굳은 시간 덩이1
 *   - rare:         특산물3 + 굳은 시간 덩이2
 *   - legendary:    특산물4 + 시간의 답1
 * plus 정의(upgradeToId)가 있으면 그 정의로 교체(이름에 + 부착). 없으면 awakened만 부여(수치 점프 폴백).
 */
export function awakenSpecialtyId(card: Card): string | undefined {
  const run = useRunStore();
  const matched = matchingSpecialties(card, run.data.items);
  return matched[0]?.id;
}

/** 각성 비용 표시 라벨 — '소금 진주 x3 + 굳은 시간 덩이 x2' 형태. */
export function awakenCostLabel(card: Card): string {
  const data = useDataStore();
  const cost = awakenCostFor(card.rank);
  const specId = awakenSpecialtyId(card);
  const specName = specId ? (data.items.get(specId)?.name ?? '특산물') : '속성 특산물';
  const matName = data.items.get(cost.materialId)?.name ?? cost.materialId;
  return specName + ' x' + cost.specialtyCount + ' + ' + matName + ' x' + cost.materialCount;
}

/** 각성 가능한가 — 5강 도달 미각성 + 특산물 N개 + 사다리 재료 충분. */
export function canAwaken(card: Card): boolean {
  if (!needsAwakening(card)) return false;
  const run = useRunStore();
  const r = run.data;
  const cost = awakenCostFor(card.rank);
  const specId = awakenSpecialtyId(card);
  if (!specId) return false;
  const haveSpec = r.items.filter((i) => i.id === specId).length;
  if (haveSpec < cost.specialtyCount) return false;
  const haveMat = r.items.filter((i) => i.id === cost.materialId).length;
  if (haveMat < cost.materialCount) return false;
  return true;
}

/** 인벤토리에서 id 아이템 n개 제거(앞에서부터). */
function removeItems(id: string, n: number): void {
  const r = useRunStore().data;
  for (let k = 0; k < n; k++) {
    const idx = r.items.findIndex((i) => i.id === id);
    if (idx < 0) break;
    r.items.splice(idx, 1);
  }
}

/**
 * 각성 실행 — 자원(특산물 N + 사다리 재료) 소비 후 run.awakenCard로 상태 전이(plus 정의 교체).
 * 가드 실패 시 토스트 + false. 성공 시 true.
 */
export function awakenCard(instanceId: string): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const r = run.data;

  const card = r.collection.find((c) => c.instanceId === instanceId);
  if (!card) {
    ui.toast('warning', '각성할 카드를 찾을 수 없습니다.');
    return false;
  }
  if (!needsAwakening(card)) {
    ui.toast('warning', '아직 각성할 수 없는 카드입니다 (5강 도달 필요).');
    return false;
  }
  const cost = awakenCostFor(card.rank);
  const specId = awakenSpecialtyId(card);
  if (!specId) {
    ui.toast('warning', '속성에 맞는 특산물이 부족합니다.');
    return false;
  }
  const specName = data.items.get(specId)?.name ?? '특산물';
  const matName = data.items.get(cost.materialId)?.name ?? cost.materialId;
  if (r.items.filter((i) => i.id === specId).length < cost.specialtyCount) {
    ui.toast('warning', "'" + specName + "'이(가) " + cost.specialtyCount + '개 필요합니다.');
    return false;
  }
  if (r.items.filter((i) => i.id === cost.materialId).length < cost.materialCount) {
    ui.toast('warning', "'" + matName + "'이(가) " + cost.materialCount + '개 필요합니다.');
    return false;
  }

  // 자원 소비 — 특산물 N개, 사다리 재료 M개.
  removeItems(specId, cost.specialtyCount);
  removeItems(cost.materialId, cost.materialCount);

  // plus 정의로 진화(있으면). 없으면 awakened만(수치 점프 폴백).
  const plusDef = card.upgradeToId ? data.cards.get(card.upgradeToId) : undefined;
  const ok = run.awakenCard(instanceId, plusDef);
  if (!ok) {
    ui.toast('warning', '각성에 실패했습니다.');
    return false;
  }
  const nowName = r.collection.find((c) => c.instanceId === instanceId)?.name ?? card.name;
  ui.toast('success', '각성: ' + card.name + ' -> ' + nowName);
  return true;
}

/** 각성 가능한(5강 도달 미각성) 컬렉션 카드 목록 — UI 표시용. */
export function listAwakenableCards(): Card[] {
  const run = useRunStore();
  return run.data.collection.filter((c) => needsAwakening(c));
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
  // Item 37-③ 여우 폼 — 변신 중이면 공방 제작 풀을 폼 풀로 역전(해제 카드 제외, rare+ 제공).
  //   원복(미변신) 시 이 분기를 타지 않아 일반 풀(form 제외)로 복귀 → 누출 0.
  if (isFormPoolActive()) {
    const formPool = activeFormCardPool().filter(
      (c) => c.id !== RELEASE_CARD_ID && (c.rank === 'rare' || c.rank === 'legendary'),
    );
    if (formPool.length > 0) return formPool;
  }
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
  return matched.length >= data.balance.forgeNumOffers ? matched : all;
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
  const bal = useDataStore().balance;
  if (!run.data.forgeOffers) run.data.forgeOffers = {};
  const existing = run.data.forgeOffers[nodeId];
  if (existing) return existing;

  // 권역 화이트리스트 — 이 공방 노드의 권역에 맞는 희귀 카드만 추첨.
  const candidates = pickRandom(getRegionForgePool(regionIdOfNode(nodeId)), bal.forgeNumOffers);
  const cards: ForgeCardSlot[] = candidates.map((c) => {
    const instance = instantiateCard(c);
    return {
      cardId: c.id,
      cardInstanceId: instance.instanceId!,
      price: bal.forgePriceShards,
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

// ============================================================
// 카드 제거 — 덱이 꽉 찬 경우만 허용, 제거 시 deckSize -1.
// ============================================================

/**
 * 지금 카드를 제거할 수 있는지 — 덱(deck.length)이 덱 슬롯(deckSize)을 채웠을 때만 가능.
 * 조건이 충족되지 않으면 플레이어는 덱을 먼저 채워야 한다.
 */
export function canRemoveCard(): boolean {
  const run = useRunStore();
  return run.data.deck.length >= run.data.deckSize;
}

/** 공방에서 카드 1장 제거. 제거 성공 시 deckSize -1 + 시간의 조각 환급. */
export function removeCardAtWorkshop(cardInstanceId: string): boolean {
  const run = useRunStore();
  const ui = useUiStore();
  const r = run.data;

  if (isNoRemoval()) {
    ui.toast('warning', '지워지지 않는다 — 카드 제거가 봉인되었다.');
    return false;
  }
  if (r.deck.length < r.deckSize) {
    ui.toast('warning', `덱을 채워야 제거할 수 있다 (현재 ${r.deck.length}/${r.deckSize}).`);
    return false;
  }

  const cIdx = r.collection.findIndex((c) => c.instanceId === cardInstanceId);
  if (cIdx < 0) return false;
  const removed = r.collection[cIdx];

  if (isPossessionLocked(removed)) {
    ui.toast('warning', '이 카드는 떼어낼 수 없다 — 끝까지 가야 풀린다.');
    return false;
  }

  r.collection.splice(cIdx, 1);
  const dIdx = r.deck.findIndex((c) => c.instanceId === cardInstanceId);
  if (dIdx >= 0) r.deck.splice(dIdx, 1);

  r.deckSize = Math.max(1, r.deckSize - 1);
  const shards = CARD_SALVAGE_SHARDS[removed.rank] ?? 0;
  r.timeShards += shards;
  ui.toast('success', `'${removed.name}' 제거 — 시간의 조각 +${shards}`);
  return true;
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
  if (r.timeShards < useDataStore().balance.legendaryCostShards) return false;
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
  r.timeShards -= useDataStore().balance.legendaryCostShards;

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

/** 포션 1개 제작 비용 — rank → { 시간조각, 재료 id }. 비용은 balance에서. */
export function potionCostFor(rank: Rank): { timeShards: number; materialId: string } {
  const b = useDataStore().balance;
  if (rank === 'rare') return { timeShards: b.potionRareCostShards, materialId: MATERIAL_RARE_ID };
  // basic/common 포션은 일반재료.
  return { timeShards: b.potionCommonCostShards, materialId: MATERIAL_COMMON_ID };
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

// ============================================================
// 아이템 가공 — 생활 산출물(티어1) → 2차 가공품(티어2). (item 9)
//   레시피: 그 속성의 티어1 산출물 PROCESS_INPUT_COUNT개(하위/상위 혼용) → 가공품 1개.
//   가공품(i-craft-{element})은 엘리트 의뢰가 요구하는 품목이다(공방 거쳐야 모인다).
//   8색 1:1(LIFE_ACTIVITIES element). 원재료/조각은 안 쓰고 *모은 산출물*을 연료로 한다.
// ============================================================

/** 가공품 1개를 만드는 데 드는 티어1 산출물 수(하위/상위 합산). */
export const PROCESS_INPUT_COUNT = 3;

/** 속성 → 2차 가공품 아이템 id. */
export function craftItemIdForElement(element: string): string {
  return `i-craft-${element}`;
}

/** 한 가공 레시피 — 입력(티어1 하위/상위) → 출력(2차 가공품). */
export interface ProcessRecipe {
  element: string;
  /** 출력 가공품 id/이름. */
  outputId: string;
  outputName: string;
  /** 입력 티어1 하위 산출물 id/이름. */
  lowerId: string;
  lowerName: string;
  /** 입력 티어1 상위(-fine) 산출물 id(있으면 — 하위와 합산해 카운트). */
  upperId?: string;
  upperName?: string;
  /** 필요한 입력 총수. */
  inputCount: number;
}

/** 전체 가공 레시피(8색) — LIFE_ACTIVITIES element별 티어1 → i-craft-{element}. 출력 정의가 있는 것만. */
export function listProcessingRecipes(): ProcessRecipe[] {
  const data = useDataStore();
  const out: ProcessRecipe[] = [];
  for (const act of LIFE_ACTIVITIES) {
    const crop = cropForActivity(act);
    const lowerId = crop ? crop.lowerItemId : act.lowerItemId;
    const upperId = crop ? crop.upperItemId : act.upperItemId;
    if (!lowerId) continue;
    const outputId = craftItemIdForElement(act.element);
    const outDef = data.items.get(outputId);
    const lowerDef = data.items.get(lowerId);
    if (!outDef || !lowerDef) continue;
    out.push({
      element: act.element,
      outputId,
      outputName: outDef.name,
      lowerId,
      lowerName: lowerDef.name,
      upperId,
      upperName: upperId ? data.items.get(upperId)?.name : undefined,
      inputCount: PROCESS_INPUT_COUNT,
    });
  }
  return out;
}

/** 보유한 그 속성 티어1 산출물 수(하위+상위). */
export function processInputHeld(r: ProcessRecipe): number {
  const items = useRunStore().data.items;
  const lower = items.filter((i) => i.id === r.lowerId).length;
  const upper = r.upperId ? items.filter((i) => i.id === r.upperId).length : 0;
  return lower + upper;
}

/** 지금 가공할 수 있는가 — 입력 산출물 ≥ inputCount. */
export function canProcessItem(r: ProcessRecipe): boolean {
  return processInputHeld(r) >= r.inputCount;
}

/** 가공 실행 — 입력(하위 우선, 모자라면 상위) 소비 후 가공품 1개 지급. 성공 시 true. */
export function processItem(r: ProcessRecipe): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const rd = run.data;
  if (!canProcessItem(r)) {
    ui.toast('warning', '가공할 재료가 부족합니다.');
    return false;
  }
  // 입력 소비 — 하위부터, 모자라면 상위(-fine). 총 inputCount개.
  let remaining = r.inputCount;
  for (const id of [r.lowerId, ...(r.upperId ? [r.upperId] : [])]) {
    while (remaining > 0) {
      const idx = rd.items.findIndex((i) => i.id === id);
      if (idx < 0) break;
      rd.items.splice(idx, 1);
      remaining -= 1;
    }
    if (remaining <= 0) break;
  }
  const outDef = data.items.get(r.outputId);
  if (!outDef) return false;
  run.addItem(outDef);
  ui.toast('success', `가공: ${outDef.name}`);
  return true;
}
