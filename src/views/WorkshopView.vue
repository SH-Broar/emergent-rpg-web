<script setup lang="ts">
/**
 * 공방 화면 — 카드 강화 (매번 가능) + 희귀+ 카드 제작 (노드 1회).
 *
 * 강화: 컬렉션의 upgrade_to 있는 카드를 시간조각 8로 + 카드 교체.
 * 제작: 진입 시 희귀+ 3장 추첨, 시간조각 15로 1장 선택 (1회).
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import {
  FORGE_PRICE_TIME_SHARDS,
  LEGENDARY_COST_TIME_SHARDS,
  RARE_MATERIAL_ID_ACT1,
  UPGRADE_COST_TIME_SHARDS,
  canCraftLegendary,
  canPurchaseForgeCard,
  craftLegendary,
  getLegendaryRecipes,
  getOrCreateForgeOffer,
  listUpgradableCards,
  purchaseForgeCard,
  upgradeCard,
  type LegendaryRecipe,
} from '@/systems/workshop';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();

const nodeId = computed(() => run.data.currentNodeId);

const currentNode = computed(() => {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n) => n.id === nodeId.value);
});

const offer = computed(() => run.data.forgeOffers?.[nodeId.value]);

// 강화 모드 토글
const upgradeMode = ref(false);

// listUpgradableCards는 reactive하지 않을 수 있어 computed로 감쌈
const upgradables = computed(() => listUpgradableCards());

function cardDef(id: string) {
  return data.cards.get(id);
}

function rankLabel(rank: string): string {
  return ({ basic: '기본', common: '일반', rare: '희귀', legendary: '전설' } as Record<string, string>)[rank] ?? rank;
}

function itemName(id?: string): string {
  if (!id) return '';
  return data.items.get(id)?.name ?? id;
}

function hasItem(id?: string): boolean {
  if (!id) return true;
  return run.data.items.some((i) => i.id === id);
}

function effectSummary(card: ReturnType<typeof cardDef>): string {
  if (!card) return '';
  const parts: string[] = [];
  for (const eff of card.effects) {
    if (eff.kind === 'damage') parts.push(`피해 ${eff.value}`);
    else if (eff.kind === 'block') parts.push(`방어 ${eff.value}`);
    else if (eff.kind === 'heal') parts.push(`회복 ${eff.value}`);
    else if (eff.kind === 'draw') parts.push(`드로우 ${eff.value}`);
    else if (eff.kind === 'apply-status') parts.push(`상태 ${eff.value}`);
  }
  return parts.join(' · ');
}

function doUpgrade(instanceId: string) {
  upgradeCard(instanceId);
}

function doForgePurchase(slotIndex: number) {
  purchaseForgeCard(nodeId.value, slotIndex);
}

// === 전설 제작 ===
const legendaryRecipes = computed<LegendaryRecipe[]>(() => getLegendaryRecipes());

function specialtyCount(itemId: string): number {
  return run.data.items.filter((i) => i.id === itemId).length;
}
function rareMaterialCount(): number {
  return run.data.items.filter((i) => i.id === RARE_MATERIAL_ID_ACT1).length;
}

function craftLegendaryCard(recipe: LegendaryRecipe) {
  craftLegendary(recipe);
}

function leave() {
  router.push('/game/map');
}

onMounted(() => {
  if (!run.active) {
    router.push('/main');
    return;
  }
  getOrCreateForgeOffer(nodeId.value);
});
</script>

<template>
  <main v-if="offer" class="workshop-view">
    <header class="hdr">
      <button class="back" @click="leave">← 맵으로</button>
      <h1>{{ currentNode?.label ?? '공방' }}</h1>
    </header>

    <p v-if="currentNode?.description" class="desc">{{ currentNode.description }}</p>

    <div class="resources">
      <span>HP {{ run.data.hp }}/{{ run.data.maxHp }}</span>
      <span>골드 {{ run.data.gold }}</span>
      <span class="shards">시간의 조각 {{ run.data.timeShards }}</span>
    </div>

    <!-- 카드 강화 섹션 -->
    <section class="section">
      <header class="section__hdr">
        <h2>카드 강화 <span class="cost">— 시간조각 {{ UPGRADE_COST_TIME_SHARDS }}</span></h2>
        <button v-if="!upgradeMode" class="toggle" @click="upgradeMode = true" :disabled="upgradables.length === 0">
          강화할 카드 고르기 ({{ upgradables.length }}장 가능)
        </button>
        <button v-else class="cancel" @click="upgradeMode = false">접기</button>
      </header>
      <ul v-if="upgradeMode" class="upgrade__list">
        <li v-for="c in upgradables" :key="c.instanceId" class="upgrade__item">
          <div class="upgrade__main">
            <div class="upgrade__name">{{ c.name }} <span class="rank">{{ rankLabel(c.rank) }}</span></div>
            <div class="upgrade__meta">cost {{ c.cost }} · {{ effectSummary(c) }}</div>
          </div>
          <div class="upgrade__arrow">→</div>
          <div class="upgrade__main upgrade__target">
            <div class="upgrade__name">{{ cardDef(c.upgradeToId!)?.name ?? c.upgradeToId }}</div>
            <div class="upgrade__meta">cost {{ cardDef(c.upgradeToId!)?.cost ?? '?' }} · {{ effectSummary(cardDef(c.upgradeToId!)) }}</div>
          </div>
          <button
            class="upgrade__btn"
            :disabled="run.data.timeShards < UPGRADE_COST_TIME_SHARDS"
            @click="doUpgrade(c.instanceId!)"
          >
            강화
          </button>
        </li>
        <li v-if="upgradables.length === 0" class="empty">강화 가능한 카드가 없습니다.</li>
      </ul>
    </section>

    <!-- 희귀+ 제작 섹션 -->
    <section class="section">
      <header class="section__hdr">
        <h2>희귀+ 카드 제작 <span class="cost">— 시간조각 {{ FORGE_PRICE_TIME_SHARDS }} / 1장 한정</span></h2>
      </header>
      <ul class="forge__grid">
        <li
          v-for="(slot, i) in offer.cards"
          :key="`f-${i}`"
          class="slot"
          :class="{ 'slot--sold': slot.purchased, [`slot--${cardDef(slot.cardId)?.rank ?? 'rare'}`]: true }"
        >
          <div class="slot__head">
            <span class="slot__name">{{ cardDef(slot.cardId)?.name ?? slot.cardId }}</span>
            <span class="slot__rank">{{ rankLabel(cardDef(slot.cardId)?.rank ?? '') }}</span>
          </div>
          <p class="slot__meta">
            cost {{ cardDef(slot.cardId)?.cost ?? 0 }}
            · {{ cardDef(slot.cardId)?.element ?? '—' }}
          </p>
          <p class="slot__effects">{{ effectSummary(cardDef(slot.cardId)) }}</p>
          <p v-if="cardDef(slot.cardId)?.flavor" class="slot__flavor">
            {{ cardDef(slot.cardId)?.flavor }}
          </p>
          <p v-if="slot.requiredSpecialtyId" class="slot__req">
            요구 특산물:
            <span :class="{ ok: hasItem(slot.requiredSpecialtyId), miss: !hasItem(slot.requiredSpecialtyId) }">
              {{ itemName(slot.requiredSpecialtyId) }}
            </span>
          </p>
          <button
            class="slot__buy"
            :disabled="!canPurchaseForgeCard(slot)"
            @click="doForgePurchase(i)"
          >
            {{ slot.purchased ? '제작 완료' : `시간조각 ${slot.price}` }}
          </button>
        </li>
      </ul>
    </section>

    <!-- 전설 제작 — 마을 고유 풀 -->
    <section class="section">
      <header class="section__hdr">
        <h2>전설 제작 <span class="cost">— 시간조각 {{ LEGENDARY_COST_TIME_SHARDS }} + 특산물 + 희소 재료 / 매번 가능</span></h2>
      </header>
      <p class="rare-status">
        희소 재료 보유: <strong>{{ rareMaterialCount() }}</strong>
        <span v-if="rareMaterialCount() === 0" class="hint"> (엘리트·보스·이벤트·후반 채집에서 획득)</span>
      </p>
      <ul class="legendary__grid">
        <li v-for="r in legendaryRecipes" :key="r.cardId" class="legendary slot slot--legendary" :class="{ 'legendary--ready': canCraftLegendary(r) }">
          <div class="slot__head">
            <span class="slot__name">{{ r.cardName }}</span>
            <span class="legendary__region">{{ r.regionName }}</span>
          </div>
          <p class="slot__effects">{{ effectSummary(cardDef(r.cardId)) }}</p>
          <p v-if="cardDef(r.cardId)?.flavor" class="slot__flavor">
            {{ cardDef(r.cardId)?.flavor }}
          </p>
          <div class="legendary__req">
            <span :class="{ ok: run.data.timeShards >= LEGENDARY_COST_TIME_SHARDS, miss: run.data.timeShards < LEGENDARY_COST_TIME_SHARDS }">
              시간조각 {{ LEGENDARY_COST_TIME_SHARDS }}
            </span>
            <span :class="{ ok: specialtyCount(r.specialtyItemId) > 0, miss: specialtyCount(r.specialtyItemId) === 0 }">
              {{ r.specialtyName }} ({{ specialtyCount(r.specialtyItemId) }})
            </span>
            <span :class="{ ok: rareMaterialCount() > 0, miss: rareMaterialCount() === 0 }">
              희소 재료 ({{ rareMaterialCount() }})
            </span>
          </div>
          <button
            class="slot__buy"
            :disabled="!canCraftLegendary(r)"
            @click="craftLegendaryCard(r)"
          >
            제작
          </button>
        </li>
      </ul>
    </section>

    <button class="leave" @click="leave">떠나기</button>
  </main>
</template>

<style scoped>
.workshop-view { max-width: 880px; margin: 0 auto; padding: 2rem; min-height: 100vh; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; font: inherit; }
h1 { color: #c08eff; margin: 0; }
.desc { color: #b6b6c4; font-style: italic; margin: 0.6rem 0 1.5rem; }

.resources { display: flex; gap: 1rem; padding: 0.6rem 1rem; background: rgba(0,0,0,0.4); border-radius: 6px; color: #b6b6c4; font-size: 0.9rem; margin-bottom: 1.5rem; }
.resources .shards { color: #8eedff; font-weight: 600; margin-left: auto; }

.section { margin-top: 1.5rem; padding: 0.8rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; }
.section__hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; gap: 0.5rem; }
.section__hdr h2 { color: #f6e8b8; font-size: 1.05rem; margin: 0; }
.section__hdr .cost { color: #888; font-size: 0.85rem; font-weight: normal; }

.toggle { background: rgba(192, 142, 255, 0.18); border: 1px solid rgba(192, 142, 255, 0.45); color: #f6e8b8; padding: 0.4rem 0.8rem; border-radius: 5px; cursor: pointer; font: inherit; font-size: 0.85rem; }
.toggle:hover:not(:disabled) { background: rgba(192, 142, 255, 0.32); }
.toggle:disabled { opacity: 0.4; cursor: not-allowed; }
.cancel { background: none; border: 1px solid rgba(255,255,255,0.2); color: #b6b6c4; padding: 0.4rem 0.8rem; border-radius: 5px; cursor: pointer; font: inherit; }

.upgrade__list { list-style: none; padding: 0; margin: 0; max-height: 360px; overflow-y: auto; }
.upgrade__item {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.45rem 0.6rem;
  border-bottom: 1px dashed rgba(255,255,255,0.08);
}
.upgrade__main { min-width: 0; }
.upgrade__name { color: #e9e9f4; font-size: 0.9rem; font-weight: 600; }
.upgrade__name .rank { color: #888; font-weight: normal; font-size: 0.75rem; margin-left: 0.4rem; }
.upgrade__meta { color: #b6b6c4; font-size: 0.78rem; }
.upgrade__arrow { color: #c08eff; font-size: 1.1rem; }
.upgrade__target .upgrade__name { color: #c08eff; }
.upgrade__btn {
  background: rgba(142, 237, 255, 0.18);
  border: 1px solid rgba(142, 237, 255, 0.45);
  color: #d0f0ff;
  padding: 0.4rem 0.8rem;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
}
.upgrade__btn:hover:not(:disabled) { background: rgba(142, 237, 255, 0.32); }
.upgrade__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.empty { color: #888; font-style: italic; padding: 0.4rem; list-style: none; }

.forge__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
.slot--rare { border-left: 3px solid #c08eff; }
.slot--legendary { border-left: 3px solid #ffd870; }
.slot--sold { opacity: 0.35; }

.slot__head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.4rem; }
.slot__name { color: #e9e9f4; font-weight: 600; font-size: 0.95rem; }
.slot__rank { color: #888; font-size: 0.75rem; }
.slot__meta { color: #b6b6c4; font-size: 0.8rem; margin: 0; }
.slot__effects { color: #d0f0ff; font-size: 0.82rem; margin: 0; }
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

.rare-status { color: #b6b6c4; font-size: 0.85rem; margin: 0 0 0.6rem; }
.rare-status strong { color: #ffd870; }
.rare-status .hint { color: #888; font-size: 0.78rem; font-style: italic; }

.legendary__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.6rem; padding: 0; margin: 0; list-style: none; }
.legendary { gap: 0.4rem; }
.legendary--ready { box-shadow: 0 0 0 1px rgba(255, 216, 112, 0.45); }
.legendary__region { color: #ffd870; font-size: 0.78rem; }
.legendary__req { display: flex; flex-wrap: wrap; gap: 0.4rem; font-size: 0.78rem; margin: 0.2rem 0; }
.legendary__req .ok { color: #8effb8; }
.legendary__req .miss { color: #ff8e8e; }

.slot__req { font-size: 0.78rem; color: #b6b6c4; margin: 0; }
.slot__req .ok { color: #8effb8; }
.slot__req .miss { color: #ff8e8e; }

.leave { margin-top: 1.5rem; padding: 0.6rem 1.2rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: inherit; border-radius: 6px; cursor: pointer; font: inherit; }
</style>
