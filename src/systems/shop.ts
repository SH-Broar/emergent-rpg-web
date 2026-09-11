/** 상점의 재료·특산물·서비스 거래. 카드 판매는 폐지했으며 저장된 카드 슬롯도 비운다. */

import type { Rank, Relic, ShopCardSlot, ShopInventory, ShopMaterialSlot, ShopRelicSlot } from '@/data/schemas';
import { useRunStore, CARD_SALVAGE_SHARDS } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { isPossessionLocked } from '@/systems/possession';
import { getCraftingDiscount, acquireRelic } from '@/systems/relic';
import { availableRelics } from '@/systems/unlocks';
import { rng } from '@/systems/rng';
import { shopPriceMul, isNoRemoval, offersShopRest } from '@/systems/chaos';

// 가격·슬롯은 config/balance.txt 에서 로드 (useDataStore().balance). 누락 시 DEFAULT_BALANCE.
/** 유물 기본 가격 (골드) — 등급별. */
function relicBasePrice(rank: Rank): number {
  const b = useDataStore().balance;
  switch (rank) {
    case 'basic': return b.shopRelicPriceBasic;
    case 'common': return b.shopRelicPriceCommon;
    case 'rare': return b.shopRelicPriceRare;
    case 'legendary': return b.shopRelicPriceLegendary;
    default: return b.shopRelicPriceCommon;
  }
}

// 일반 재료 판매 (Item Economy) — id는 고정, 가격/재고는 balance.
const MATERIAL_COMMON_ID = 'i-material-common';

/** discount 비율 + 카오스 shop-price-mul을 적용한 최종 가격. */
function applyDiscount(base: number): number {
  const d = getCraftingDiscount();
  // 카오스 shop-tax(상점가 +param%) — 할인 적용 후 배수.
  const priced = base * (1 - d) * shopPriceMul();
  return Math.max(1, Math.ceil(priced));
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

function getShopRelicPool(): Relic[] {
  const run = useRunStore();
  const owned = new Set(run.data.relics.map((r) => r.id));
  const available = availableRelics(); // 잠긴(미해금) 유물 제외
  const pool: Relic[] = [];
  for (const r of available) {
    if (owned.has(r.id)) continue;
    // 시작 유물(race/character) + 별도 경로 자원(boss/meta)은 상점에서 제외.
    if (r.source === 'race' || r.source === 'character') continue;
    if (r.source === 'boss' || r.source === 'meta') continue;
    // 전설 유물은 아무 상점에서나 팔지 않는다(보스·이벤트 보상 경로). (화이트리스트, 2026-05)
    if (r.rank === 'legendary') continue;
    pool.push(r);
  }
  // 풀이 너무 작으면 보유 제외 + 전설 제외만 적용한 (가용) 폴백.
  if (pool.length < useDataStore().balance.shopNumRelics) {
    return available.filter((r) => !owned.has(r.id) && r.rank !== 'legendary');
  }
  return pool;
}

/** 일반 재료 판매 슬롯 — 데이터에 정의된 경우에만(없으면 빈 배열). */
function buildMaterialSlots(): ShopMaterialSlot[] {
  const data = useDataStore();
  const slots: ShopMaterialSlot[] = [];
  if (data.items.get(MATERIAL_COMMON_ID)) {
    slots.push({
      itemId: MATERIAL_COMMON_ID,
      price: applyDiscount(data.balance.shopMaterialCommonPrice),
      stock: data.balance.shopMaterialCommonStock,
    });
  }
  return slots;
}

/** 노드 재고 생성 — 시드 추첨. 이미 있으면 기존 반환. */
export function getOrCreateShopInventory(nodeId: string): ShopInventory {
  const run = useRunStore();
  const bal = useDataStore().balance;
  if (!run.data.shopInventories) run.data.shopInventories = {};
  const existing = run.data.shopInventories[nodeId];
  if (existing) {
    // 옛 세이브 호환 — materials 슬롯이 없으면 지금 채운다.
    if (!existing.materials) existing.materials = buildMaterialSlots();
    existing.cards = []; // Retire old unsold card offers without touching owned copies.
    // 카오스 no-respite(험한 세상) — 회복 구매 슬롯이 없으면 지금 채운다.
    // (post-apocalypse는 offersShopRest()가 false라 슬롯을 주지 않는다.)
    if (!existing.restPurchase && offersShopRest()) existing.restPurchase = buildRestPurchase();
    return existing;
  }


  // 유물 해체 — 상점 유물 진열 중단(0개 픽). 종족 시작 유물(seedRelics)만 잔존.
  const relicCandidates = pickRandom(getShopRelicPool(), 0);

  const cards: ShopCardSlot[] = [];

  const relics: ShopRelicSlot[] = relicCandidates.map((r) => ({
    relicId: r.id,
    price: applyDiscount(relicBasePrice(r.rank)),
    purchased: false,
  }));

  const inventory: ShopInventory = {
    generatedAt: run.data.rngState,
    cards,
    relics,
    removalUsed: false,
    removalPrice: applyDiscount(bal.shopCardRemovalPrice),
    materials: buildMaterialSlots(),
    // 카오스 no-respite(험한 세상) — 휴식 회복 대신 상점 회복 구매 슬롯 개방.
    // post-apocalypse는 offersShopRest()가 false → 회복 슬롯 없음(가혹).
    restPurchase: offersShopRest() ? buildRestPurchase() : undefined,
  };
  run.data.shopInventories[nodeId] = inventory;
  return inventory;
}

/** no-respite 회복 슬롯 — 100골드(고정, 할인 미적용)에 최대 HP 30% 회복. */
const REST_PURCHASE_PRICE = 100;
const REST_PURCHASE_PCT = 0.3;
function buildRestPurchase(): { price: number; healPct: number; used: boolean } {
  return { price: REST_PURCHASE_PRICE, healPct: REST_PURCHASE_PCT, used: false };
}

/** no-respite 회복 슬롯 구매 — 노드당 1회. 100골드 차감 + round(maxHp×30%) 회복. */
export function purchaseShopRest(nodeId: string): boolean {
  const run = useRunStore();
  const ui = useUiStore();
  const inv = run.data.shopInventories?.[nodeId];
  const slot = inv?.restPurchase;
  if (!slot) return false;
  if (slot.used) {
    ui.toast('warning', '이 상점의 회복은 이미 받았습니다.');
    return false;
  }
  if (run.data.gold < slot.price) {
    ui.toast('warning', '골드가 부족합니다.');
    return false;
  }
  const heal = Math.round(run.data.maxHp * slot.healPct);
  run.data.gold -= slot.price;
  run.data.hp = Math.min(run.data.maxHp, run.data.hp + heal);
  slot.used = true;
  ui.toast('success', `회복: HP +${heal} (-${slot.price} 골드)`);
  return true;
}

/** 일반 재료 슬롯 1개 구매 — 재고 -1, 인벤토리에 인스턴스 추가. */
export function purchaseShopMaterial(nodeId: string, slotIndex: number): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const inv = run.data.shopInventories?.[nodeId];
  if (!inv?.materials) return false;
  const slot = inv.materials[slotIndex];
  if (!slot || slot.stock <= 0) return false;
  if (run.data.gold < slot.price) {
    ui.toast('warning', '골드가 부족합니다.');
    return false;
  }
  const def = data.items.get(slot.itemId);
  if (!def) return false;

  run.data.gold -= slot.price;
  run.addItem(def);
  slot.stock -= 1;
  const prefix = def.category === 'specialty' ? '특산물' : '재료';
  ui.toast('success', `${prefix}: ${def.name} (-${slot.price} 골드)`);
  return true;
}

/** @deprecated 이전 구매 호출은 자원을 소모하지 않는다. */
export function purchaseShopCard(_nodeId: string, _slotIndex: number): boolean {
  return false;
}
export function purchaseShopRelic(nodeId: string, slotIndex: number): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const inv = run.data.shopInventories?.[nodeId];
  if (!inv) return false;
  const slot = inv.relics[slotIndex];
  if (!slot || slot.purchased) return false;
  if (run.data.gold < slot.price) {
    ui.toast('warning', '골드가 부족합니다.');
    return false;
  }
  const def = data.relics.get(slot.relicId);
  if (!def) return false;

  run.data.gold -= slot.price;
  // 중앙 진입점 — 보유 추가 + 미발견 기록 + on-acquire/passive 즉시 발동.
  acquireRelic(def);
  slot.purchased = true;
  ui.toast('success', `유물: ${def.name} (-${slot.price} 골드)`);
  return true;
}

/** 카드 제거 슬롯 사용 — 컬렉션 인스턴스 1장 제거. 1회 한정. */
export function purchaseShopCardRemoval(nodeId: string, cardInstanceId: string): boolean {
  const run = useRunStore();
  const ui = useUiStore();
  const inv = run.data.shopInventories?.[nodeId];
  if (!inv) return false;
  // 카오스 no-removal(지워지지 않는) — 카드 제거 비활성.
  if (isNoRemoval()) {
    ui.toast('warning', '지워지지 않는다 — 카드 제거가 봉인되었다.');
    return false;
  }
  if (inv.removalUsed) {
    ui.toast('warning', '이 상점의 제거 슬롯은 이미 사용되었습니다.');
    return false;
  }
  if (run.data.gold < inv.removalPrice) {
    ui.toast('warning', '골드가 부족합니다.');
    return false;
  }
  const cIdx = run.data.collection.findIndex((c) => c.instanceId === cardInstanceId);
  if (cIdx < 0) {
    ui.toast('warning', '제거할 카드를 찾을 수 없습니다.');
    return false;
  }
  const removed = run.data.collection[cIdx];
  // 빙의 카드(변신 전)는 *어디서도* 떼어낼 수 없다 — 각성을 끝까지 가야 풀린다.
  if (isPossessionLocked(removed)) {
    ui.toast('warning', '이 카드는 떼어낼 수 없다 — 끝까지 가야 풀린다.');
    return false;
  }
  run.data.collection.splice(cIdx, 1);
  // 덱 슬롯에도 있다면 동시에 제거 (instanceId 일치).
  const dIdx = run.data.deck.findIndex((c) => c.instanceId === cardInstanceId);
  if (dIdx >= 0) run.data.deck.splice(dIdx, 1);

  run.data.gold -= inv.removalPrice;
  inv.removalUsed = true;
  // 분해 보상 — 등급만큼 시간의 조각 환급.
  const shards = CARD_SALVAGE_SHARDS[removed.rank] ?? 0;
  run.data.timeShards += shards;
  ui.toast(
    'success',
    `'${removed.name}' 제거 — 골드 -${inv.removalPrice}, 시간의 조각 +${shards}`,
  );
  return true;
}
