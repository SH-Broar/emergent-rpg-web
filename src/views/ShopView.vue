<script setup lang="ts">
/**
 * 상점 화면 — 카드 5장 + 유물 2개 + 카드 제거 1슬롯.
 *
 * 재고는 노드 진입 시 1회 시드 추첨 후 RunState에 스냅샷. 재방문 시 동일.
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import {
  getOrCreateShopInventory,
  purchaseShopCard,
  purchaseShopCardRemoval,
  purchaseShopMaterial,
  purchaseShopRelic,
} from '@/systems/shop';
import { getCraftingDiscount } from '@/systems/relic';
import { relicEffectText, relicTriggerLabel, cardDetailText, relicDetailText } from '@/systems/labels';
import type { Card } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();

const nodeId = computed(() => run.data.currentNodeId);

const currentNode = computed(() => {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n) => n.id === nodeId.value);
});

const inventory = computed(() => run.data.shopInventories?.[nodeId.value]);

const discountPercent = computed(() => Math.round(getCraftingDiscount() * 100));

// === 카드 제거 모드 ===
const removalMode = ref(false);

function cardDef(id: string): Card | undefined {
  return data.cards.get(id);
}
function relicDef(id: string) {
  return data.relics.get(id);
}
/** 유물 효과 한글 줄들 — raw kind 노출 방지. */
function relicLines(id: string): string[] {
  const r = data.relics.get(id);
  if (!r) return [];
  return r.effects.map(relicEffectText);
}
function relicTrigger(id: string): string {
  return relicTriggerLabel(data.relics.get(id)?.trigger);
}

function buyCard(slotIndex: number) {
  purchaseShopCard(nodeId.value, slotIndex);
}
function buyRelic(slotIndex: number) {
  purchaseShopRelic(nodeId.value, slotIndex);
}
function buyMaterial(slotIndex: number) {
  purchaseShopMaterial(nodeId.value, slotIndex);
}
function itemName(id: string): string {
  return data.items.get(id)?.name ?? id;
}
function itemDesc(id: string): string {
  return data.items.get(id)?.description ?? '';
}
function pickRemovalTarget(cardInstanceId: string) {
  const ok = purchaseShopCardRemoval(nodeId.value, cardInstanceId);
  if (ok) removalMode.value = false;
}

function rankLabel(rank: string): string {
  return ({ basic: '기본', common: '일반', rare: '희귀', legendary: '전설' } as Record<string, string>)[rank] ?? rank;
}

function leave() {
  router.push('/game/map');
}

onMounted(() => {
  if (!run.active) {
    router.push('/main');
    return;
  }
  // 진입 시 1회 재고 생성 (이미 있으면 그대로).
  getOrCreateShopInventory(nodeId.value);
});
</script>

<template>
  <main v-if="inventory" class="shop-view">
    <header class="hdr">
      <button class="back" @click="leave">← 맵으로</button>
      <h1>{{ currentNode?.label ?? '상점' }}</h1>
    </header>

    <p v-if="currentNode?.description" class="desc">{{ currentNode.description }}</p>

    <div class="resources">
      <span>HP {{ run.data.hp }}/{{ run.data.maxHp }}</span>
      <span class="gold">골드 {{ run.data.gold }}</span>
      <span v-if="discountPercent > 0" class="disc">할인 {{ discountPercent }}%</span>
    </div>

    <!-- 카드 진열 -->
    <section class="rack">
      <h2 class="rack__title">카드</h2>
      <ul class="rack__grid">
        <li
          v-for="(slot, i) in inventory.cards"
          :key="`c-${i}`"
          class="slot"
          :class="{ 'slot--sold': slot.purchased, [`slot--${cardDef(slot.cardId)?.rank ?? 'common'}`]: true }"
          v-tooltip="cardDetailText(cardDef(slot.cardId))"
        >
          <div class="slot__head">
            <span class="slot__name">{{ cardDef(slot.cardId)?.name ?? slot.cardId }}</span>
            <span class="slot__rank">{{ rankLabel(cardDef(slot.cardId)?.rank ?? '') }}</span>
          </div>
          <p class="slot__meta">
            cost {{ cardDef(slot.cardId)?.cost ?? 0 }}
            · {{ cardDef(slot.cardId)?.element ?? '—' }}
          </p>
          <p v-if="cardDef(slot.cardId)?.flavor" class="slot__flavor">
            {{ cardDef(slot.cardId)?.flavor }}
          </p>
          <button
            class="slot__buy"
            :disabled="slot.purchased || run.data.gold < slot.price"
            @click="buyCard(i)"
          >
            {{ slot.purchased ? '판매 완료' : `${slot.price} G` }}
          </button>
        </li>
      </ul>
    </section>

    <!-- 유물 진열 -->
    <section class="rack">
      <h2 class="rack__title">유물</h2>
      <ul class="rack__grid">
        <li
          v-for="(slot, i) in inventory.relics"
          :key="`r-${i}`"
          class="slot"
          :class="{ 'slot--sold': slot.purchased, [`slot--${relicDef(slot.relicId)?.rank ?? 'common'}`]: true }"
          v-tooltip="relicDetailText(relicDef(slot.relicId))"
        >
          <div class="slot__head">
            <span class="slot__name">{{ relicDef(slot.relicId)?.name ?? slot.relicId }}</span>
            <span class="slot__rank">{{ rankLabel(relicDef(slot.relicId)?.rank ?? '') }}</span>
          </div>
          <p class="slot__meta">{{ relicTrigger(slot.relicId) || '—' }}</p>
          <ul class="slot__effects">
            <li v-for="(t, ei) in relicLines(slot.relicId)" :key="ei">· {{ t }}</li>
          </ul>
          <p v-if="relicDef(slot.relicId)?.flavor" class="slot__flavor">
            {{ relicDef(slot.relicId)?.flavor }}
          </p>
          <button
            class="slot__buy"
            :disabled="slot.purchased || run.data.gold < slot.price"
            @click="buyRelic(i)"
          >
            {{ slot.purchased ? '판매 완료' : `${slot.price} G` }}
          </button>
        </li>
      </ul>
    </section>

    <!-- 재료 진열 -->
    <section v-if="inventory.materials && inventory.materials.length > 0" class="rack">
      <h2 class="rack__title">재료</h2>
      <ul class="rack__grid">
        <li
          v-for="(slot, i) in inventory.materials"
          :key="`m-${i}`"
          class="slot slot--common"
          :class="{ 'slot--sold': slot.stock <= 0 }"
        >
          <div class="slot__head">
            <span class="slot__name">{{ itemName(slot.itemId) }}</span>
            <span class="slot__rank">재고 {{ slot.stock }}</span>
          </div>
          <p v-if="itemDesc(slot.itemId)" class="slot__flavor">{{ itemDesc(slot.itemId) }}</p>
          <button
            class="slot__buy"
            :disabled="slot.stock <= 0 || run.data.gold < slot.price"
            @click="buyMaterial(i)"
          >
            {{ slot.stock <= 0 ? '매진' : `${slot.price} G` }}
          </button>
        </li>
      </ul>
    </section>

    <!-- 카드 제거 슬롯 -->
    <section class="removal">
      <h2 class="rack__title">카드 제거</h2>
      <p class="removal__desc">컬렉션의 카드 1장을 영구 제거합니다.</p>
      <div class="removal__row">
        <button
          v-if="!removalMode"
          class="slot__buy"
          :disabled="inventory.removalUsed || run.data.gold < inventory.removalPrice || run.data.collection.length === 0"
          @click="removalMode = true"
        >
          {{ inventory.removalUsed ? '사용 완료' : `${inventory.removalPrice} G — 제거할 카드 선택` }}
        </button>
        <button v-else class="cancel" @click="removalMode = false">취소</button>
      </div>
      <ul v-if="removalMode" class="removal__list">
        <li v-for="c in run.data.collection" :key="c.instanceId" class="removal__item">
          <span class="removal__name">{{ c.name }}</span>
          <span class="removal__meta">cost {{ c.cost }} · {{ rankLabel(c.rank) }}</span>
          <button class="removal__pick" @click="pickRemovalTarget(c.instanceId!)">이 카드 제거</button>
        </li>
      </ul>
    </section>

    <button class="leave" @click="leave">떠나기</button>
  </main>
</template>

<style scoped>
.shop-view { max-width: 880px; margin: 0 auto; padding: 2rem; min-height: 100vh; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; font: inherit; }
h1 { color: #c08eff; margin: 0; }
.desc { color: #b6b6c4; font-style: italic; margin: 0.6rem 0 1.5rem; }

.resources { display: flex; gap: 1rem; padding: 0.6rem 1rem; background: rgba(0,0,0,0.4); border-radius: 6px; color: #b6b6c4; font-size: 0.9rem; margin-bottom: 1.5rem; }
.resources .gold { color: #ffd870; font-weight: 600; }
.resources .disc { color: #8effb8; margin-left: auto; }

.rack { margin-top: 1.5rem; }
.rack__title { color: #f6e8b8; font-size: 1.05rem; margin: 0 0 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.3rem; }
.rack__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.6rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.slot {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  padding: 0.7rem 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.slot--basic { border-left: 3px solid #888; }
.slot--common { border-left: 3px solid #8eedff; }
.slot--rare { border-left: 3px solid #c08eff; }
.slot--legendary { border-left: 3px solid #ffd870; }
.slot--sold { opacity: 0.35; }

.slot__head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.4rem; }
.slot__name { color: #e9e9f4; font-weight: 600; font-size: 0.95rem; }
.slot__rank { color: #888; font-size: 0.75rem; }
.slot__meta { color: #b6b6c4; font-size: 0.8rem; margin: 0; }
.slot__effects { list-style: none; margin: 0.2rem 0 0; padding: 0; }
.slot__effects li { color: #c8e6d0; font-size: 0.78rem; line-height: 1.35; }
.slot__flavor { color: #888; font-size: 0.78rem; font-style: italic; margin: 0; }

.slot__buy {
  margin-top: auto;
  padding: 0.4rem 0.6rem;
  background: rgba(192, 142, 255, 0.18);
  border: 1px solid rgba(192, 142, 255, 0.45);
  color: #f6e8b8;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
}
.slot__buy:hover:not(:disabled) { background: rgba(192, 142, 255, 0.32); }
.slot__buy:disabled { opacity: 0.4; cursor: not-allowed; }

.removal { margin-top: 1.5rem; padding: 0.8rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; }
.removal__desc { color: #b6b6c4; font-size: 0.85rem; margin: 0 0 0.5rem; }
.removal__row { display: flex; gap: 0.5rem; }
.cancel { background: none; border: 1px solid rgba(255,255,255,0.2); color: #b6b6c4; padding: 0.4rem 0.8rem; border-radius: 5px; cursor: pointer; font: inherit; }
.removal__list { list-style: none; padding: 0; margin: 0.6rem 0 0; max-height: 280px; overflow-y: auto; }
.removal__item {
  display: grid;
  grid-template-columns: 1.4fr 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px dashed rgba(255,255,255,0.08);
}
.removal__name { color: #e9e9f4; font-size: 0.9rem; }
.removal__meta { color: #888; font-size: 0.8rem; }
.removal__pick {
  background: rgba(255, 142, 142, 0.18);
  border: 1px solid rgba(255, 142, 142, 0.45);
  color: #ffd0d0;
  padding: 0.3rem 0.7rem;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
}
.removal__pick:hover { background: rgba(255, 142, 142, 0.32); }

.leave { margin-top: 1.5rem; padding: 0.6rem 1.2rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: inherit; border-radius: 6px; cursor: pointer; font: inherit; }
</style>
