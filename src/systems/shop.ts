/**
 * 상점 시스템 — 노드 진입 시 *재고 1회 생성*, 구매 처리, 카드 제거.
 *
 * 사양:
 *  - 재고는 시드 추첨으로 1회 생성 후 RunState에 스냅샷. 재방문해도 동일.
 *  - 카드 5장 + 유물 2개 + 카드 제거 1슬롯.
 *  - 가격: rank별 고정. discount 유물 효과 적용 (ceil).
 *  - 구매하면 슬롯 purchased=true. 카드는 collection에 인스턴스 추가, 유물은 relics에 push.
 */

import type { Card, Rank, Relic, ShopCardSlot, ShopInventory, ShopMaterialSlot, ShopRelicSlot } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { instantiateCard } from '@/systems/deck';
import { getCraftingDiscount, acquireRelic } from '@/systems/relic';
import { availableCards, availableRelics } from '@/systems/unlocks';
import { rng } from '@/systems/rng';

/** 카드 기본 가격 (골드). */
const CARD_BASE_PRICE: Record<Rank, number> = {
  basic: 20,
  common: 50,
  rare: 100,
  legendary: 180,
};

/** 유물 기본 가격 (골드). */
const RELIC_BASE_PRICE: Record<Rank, number> = {
  basic: 60,
  common: 100,
  rare: 160,
  legendary: 240,
};

/** 카드 제거 가격. */
const CARD_REMOVAL_PRICE = 50;

const NUM_CARDS = 5;
const NUM_RELICS = 2;

// 일반 재료 판매 (Item Economy) — 안정 공급. 1개당 골드, 재고 한도.
const MATERIAL_COMMON_ID = 'i-material-common';
const MATERIAL_COMMON_PRICE = 18;
const MATERIAL_COMMON_STOCK = 4;

/** discount 비율을 적용한 최종 가격. */
function applyDiscount(base: number): number {
  const d = getCraftingDiscount();
  return Math.max(1, Math.ceil(base * (1 - d)));
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

/**
 * 상점 카드 풀 — *시작 덱 출처는 제외*해 신선한 선택지 위주.
 * source가 'race'/'character'는 시작 덱 — 중복 회피.
 */
function getShopCardPool(): Card[] {
  const available = availableCards(); // 잠긴(미해금) 카드 제외
  const pool: Card[] = [];
  for (const c of available) {
    if (c.source === 'race' || c.source === 'character') continue;
    pool.push(c);
  }
  // 풀이 너무 작으면 (가용 카드 한정) 전체 폴백.
  if (pool.length < NUM_CARDS) {
    return available;
  }
  return pool;
}

/**
 * 상점 유물 풀 — *현재 보유한 유물 제외*, boss/meta 출처 제외 (별도 경로 자원).
 */
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
    pool.push(r);
  }
  // 풀이 너무 작으면 보유 제외만 적용한 (가용) 전체 폴백.
  if (pool.length < NUM_RELICS) {
    return available.filter((r) => !owned.has(r.id));
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
      price: applyDiscount(MATERIAL_COMMON_PRICE),
      stock: MATERIAL_COMMON_STOCK,
    });
  }
  return slots;
}

/** 노드 재고 생성 — 시드 추첨. 이미 있으면 기존 반환. */
export function getOrCreateShopInventory(nodeId: string): ShopInventory {
  const run = useRunStore();
  if (!run.data.shopInventories) run.data.shopInventories = {};
  const existing = run.data.shopInventories[nodeId];
  if (existing) {
    // 옛 세이브 호환 — materials 슬롯이 없으면 지금 채운다.
    if (!existing.materials) existing.materials = buildMaterialSlots();
    return existing;
  }

  const cardCandidates = pickRandom(getShopCardPool(), NUM_CARDS);
  const relicCandidates = pickRandom(getShopRelicPool(), NUM_RELICS);

  const cards: ShopCardSlot[] = cardCandidates.map((c) => {
    const instance = instantiateCard(c);
    return {
      cardId: c.id,
      cardInstanceId: instance.instanceId!,
      price: applyDiscount(CARD_BASE_PRICE[c.rank] ?? 50),
      purchased: false,
    };
  });

  const relics: ShopRelicSlot[] = relicCandidates.map((r) => ({
    relicId: r.id,
    price: applyDiscount(RELIC_BASE_PRICE[r.rank] ?? 100),
    purchased: false,
  }));

  const inventory: ShopInventory = {
    generatedAt: run.data.rngState,
    cards,
    relics,
    removalUsed: false,
    removalPrice: applyDiscount(CARD_REMOVAL_PRICE),
    materials: buildMaterialSlots(),
  };
  run.data.shopInventories[nodeId] = inventory;
  return inventory;
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
  ui.toast('success', `'${def.name}' 구매 — 골드 -${slot.price}`);
  return true;
}

/** 카드 슬롯 구매. */
export function purchaseShopCard(nodeId: string, slotIndex: number): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const inv = run.data.shopInventories?.[nodeId];
  if (!inv) return false;
  const slot = inv.cards[slotIndex];
  if (!slot || slot.purchased) return false;
  if (run.data.gold < slot.price) {
    ui.toast('warning', '골드가 부족합니다.');
    return false;
  }
  const def = data.cards.get(slot.cardId);
  if (!def) return false;

  run.data.gold -= slot.price;
  // 슬롯의 사전 인스턴스 ID를 그대로 collection으로 옮긴다.
  const inst: Card = { ...def, instanceId: slot.cardInstanceId };
  run.addCardToCollection(inst);
  slot.purchased = true;
  ui.toast('success', `'${def.name}' 구매 — 골드 -${slot.price}`);
  return true;
}

/** 유물 슬롯 구매. passive면 즉시 적용. */
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
  ui.toast('success', `유물 '${def.name}' 획득 — 골드 -${slot.price}`);
  return true;
}

/** 카드 제거 슬롯 사용 — 컬렉션 인스턴스 1장 제거. 1회 한정. */
export function purchaseShopCardRemoval(nodeId: string, cardInstanceId: string): boolean {
  const run = useRunStore();
  const ui = useUiStore();
  const inv = run.data.shopInventories?.[nodeId];
  if (!inv) return false;
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
  run.data.collection.splice(cIdx, 1);
  // 덱 슬롯에도 있다면 동시에 제거 (instanceId 일치).
  const dIdx = run.data.deck.findIndex((c) => c.instanceId === cardInstanceId);
  if (dIdx >= 0) run.data.deck.splice(dIdx, 1);

  run.data.gold -= inv.removalPrice;
  inv.removalUsed = true;
  ui.toast('success', `'${removed.name}' 제거 — 골드 -${inv.removalPrice}`);
  return true;
}
