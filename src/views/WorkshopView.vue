<script setup lang="ts">
/**
 * 공방 화면 — 카드 각성 (5강 게이트 돌파) + 희귀+ 카드 제작 (노드 1회).
 *
 * 각성: 5강에 닿은 카드를 속성 특산물 + 사다리 재료로 plus 정의로 진화(6~10강 해금).
 * 제작: 진입 시 희귀+ 3장 추첨, 시간조각으로 1장 선택 (1회).
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { cardEffectKindLabel, cardDetailText } from '@/systems/labels';
import {
  RARE_MATERIAL_ID_ACT1,
  awakenCard,
  awakenCostLabel,
  canAwaken,
  canCraftLegendary,
  canCraftPotion,
  canPurchaseForgeCard,
  canRemoveCard,
  craftLegendary,
  craftPotion,
  getLegendaryRecipes,
  getOrCreateForgeOffer,
  listAwakenableCards,
  listCraftablePotions,
  potionCostFor,
  purchaseForgeCard,
  removeCardAtWorkshop,
  listProcessingRecipes,
  canProcessItem,
  processItem,
  processInputHeld,
  PROCESS_INPUT_COUNT,
  type LegendaryRecipe,
  type ProcessRecipe,
} from '@/systems/workshop';
import type { Item, Rank } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();

const nodeId = computed(() => run.data.currentNodeId);

const currentNode = computed(() => {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n) => n.id === nodeId.value);
});

const offer = computed(() => run.data.forgeOffers?.[nodeId.value]);

// 제작 비용 (config/balance.txt 에서 — 표시용).
const forgePrice = computed(() => data.balance.forgePriceShards);
const legendaryCost = computed(() => data.balance.legendaryCostShards);

// 각성 모드 토글
const awakenMode = ref(false);

// listAwakenableCards는 reactive하지 않을 수 있어 computed로 감쌈 (5강 도달 미각성 카드).
const awakenables = computed(() => listAwakenableCards());

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
  return card.effects
    .map((eff) => `${cardEffectKindLabel(eff)}${eff.value !== undefined ? ' ' + eff.value : ''}`)
    .join(' · ');
}

function doAwaken(instanceId: string) {
  awakenCard(instanceId);
}

function doForgePurchase(slotIndex: number) {
  purchaseForgeCard(nodeId.value, slotIndex);
}

// === 희귀+ 포션 제작 ===
const craftablePotions = computed<Item[]>(() => listCraftablePotions(['rare']));
function potionCostLabel(rank: Rank): string {
  const cost = potionCostFor(rank);
  return `시간조각 ${cost.timeShards} + ${itemName(cost.materialId)}`;
}
function potionEffectSummary(itm: Item): string {
  return itm.effects.map((e) => itemEffectShort(e)).join(' · ');
}
function itemEffectShort(e: Item['effects'][number]): string {
  switch (e.kind) {
    case 'heal': return `HP +${e.value ?? 0}`;
    case 'combat-mana': return `마나 +${e.value ?? 0}`;
    case 'combat-draw': return `드로우 ${e.value ?? 0}`;
    case 'combat-block': return `방어 +${e.value ?? 0}`;
    case 'combat-enemy-status': return `적 ${e.param} +${e.value ?? 0}`;
    case 'combat-self-status': return `${e.param} +${e.value ?? 0}`;
    case 'combat-free-grapple': return '구속 해제';
    case 'color-all': return `8컬러 +${e.value ?? 0}`;
    case 'color-boost': return `${e.param} +${e.value ?? 0}`;
    case 'gold': return `골드 +${e.value ?? 0}`;
    case 'time-shards': return `시간조각 +${e.value ?? 0}`;
    default: return e.kind;
  }
}
function doCraftPotion(itm: Item) {
  craftPotion(itm);
}

// === 아이템 가공 (티어1 → 2차 가공품, item 9) ===
const processRecipes = computed<ProcessRecipe[]>(() => listProcessingRecipes());
function doProcess(r: ProcessRecipe) {
  processItem(r);
}

// === 전설 제작 — 이 공방 *권역*의 전설만 (화이트리스트). ===
const legendaryRecipes = computed<LegendaryRecipe[]>(() =>
  getLegendaryRecipes(currentNode.value?.region),
);

function specialtyCount(itemId: string): number {
  return run.data.items.filter((i) => i.id === itemId).length;
}
function rareMaterialCount(): number {
  return run.data.items.filter((i) => i.id === RARE_MATERIAL_ID_ACT1).length;
}

function craftLegendaryCard(recipe: LegendaryRecipe) {
  craftLegendary(recipe);
}

// === 카드 제거 ===
const removalMode = ref(false);
function pickRemovalTarget(cardInstanceId: string) {
  const ok = removeCardAtWorkshop(cardInstanceId);
  if (ok) removalMode.value = false;
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

    <!-- 카드 각성 섹션 — 5강에 닿은 카드를 속성 특산물 + 사다리 재료로 진화. -->
    <section class="section">
      <header class="section__hdr">
        <h2>카드 각성 <span class="cost">— 5강 카드를 속성 특산물 + 사다리 재료로 진화</span></h2>
        <button v-if="!awakenMode" class="toggle" @click="awakenMode = true" :disabled="awakenables.length === 0">
          각성할 카드 고르기 ({{ awakenables.length }}장 가능)
        </button>
        <button v-else class="cancel" @click="awakenMode = false">접기</button>
      </header>
      <p class="awaken__desc">레벨업으로 5강에 닿은 카드를 각성하면 더 강한 모습으로 바뀌고 6~10강이 열린다.</p>
      <ul v-if="awakenMode" class="upgrade__list">
        <li v-for="c in awakenables" :key="c.instanceId" class="upgrade__item upgrade__item--awaken">
          <div class="upgrade__main">
            <div class="upgrade__name">{{ c.name }} <span class="rank">{{ rankLabel(c.rank) }} · 5강</span></div>
            <div class="upgrade__meta">cost {{ c.cost }} · {{ effectSummary(c) }}</div>
            <div class="upgrade__reqline">각성 비용: {{ awakenCostLabel(c) }}</div>
          </div>
          <div class="upgrade__arrow">+</div>
          <div class="upgrade__main upgrade__target">
            <div class="upgrade__name">{{ c.upgradeToId ? (cardDef(c.upgradeToId)?.name ?? c.upgradeToId) : (c.name + ' (강화)') }}</div>
            <div class="upgrade__meta" v-if="c.upgradeToId">cost {{ cardDef(c.upgradeToId)?.cost ?? '?' }} · {{ effectSummary(cardDef(c.upgradeToId)) }}</div>
            <div class="upgrade__meta" v-else>수치 도약 (전용 진화형 없음)</div>
          </div>
          <button
            class="upgrade__btn"
            :disabled="!canAwaken(c)"
            @click="doAwaken(c.instanceId!)"
          >
            각성
          </button>
        </li>
        <li v-if="awakenables.length === 0" class="empty">각성할 수 있는 5강 카드가 없습니다.</li>
      </ul>
    </section>

    <!-- 희귀+ 제작 섹션 -->
    <section class="section">
      <header class="section__hdr">
        <h2>희귀+ 카드 제작 <span class="cost">— 시간조각 {{ forgePrice }} / 1장 한정</span></h2>
      </header>
      <ul class="forge__grid">
        <li
          v-for="(slot, i) in offer.cards"
          :key="`f-${i}`"
          class="slot"
          :class="{ 'slot--sold': slot.purchased, [`slot--${cardDef(slot.cardId)?.rank ?? 'rare'}`]: true }"
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

    <!-- 희귀 포션 제작 섹션 -->
    <section class="section">
      <header class="section__hdr">
        <h2>희귀 포션 제작 <span class="cost">— 시간조각 + 희귀 재료 / 매번 가능</span></h2>
      </header>
      <ul class="forge__grid">
        <li
          v-for="itm in craftablePotions"
          :key="itm.id"
          class="slot slot--rare"
        >
          <div class="slot__head">
            <span class="slot__name">{{ itm.name }}</span>
            <span class="slot__rank">{{ itm.combat ? '전투' : '맵' }}</span>
          </div>
          <p class="slot__effects">{{ potionEffectSummary(itm) }}</p>
          <p v-if="itm.description" class="slot__flavor">{{ itm.description }}</p>
          <p class="slot__req">필요: {{ potionCostLabel(itm.rank) }}</p>
          <button
            class="slot__buy"
            :disabled="!canCraftPotion(itm)"
            @click="doCraftPotion(itm)"
          >
            제작
          </button>
        </li>
        <li v-if="craftablePotions.length === 0" class="empty">제작 가능한 희귀 포션이 없습니다.</li>
      </ul>
    </section>

    <!-- 아이템 가공 섹션 (item 9) — 생활 산출물(티어1) → 2차 가공품(엘리트 의뢰가 요구하는 품목). -->
    <section class="section">
      <header class="section__hdr">
        <h2>아이템 가공 <span class="cost">— 생활 산출물 {{ PROCESS_INPUT_COUNT }}개 → 2차 가공품 1개 (엘리트 의뢰용)</span></h2>
      </header>
      <p class="awaken__desc">채집·농사로 모은 산출물을 가공하면 엘리트가 요구하는 2차 가공품이 된다. 하위·상위 산출물 모두 재료로 쓴다.</p>
      <ul class="forge__grid">
        <li
          v-for="r in processRecipes"
          :key="r.outputId"
          class="slot slot--rare"
          :class="{ 'legendary--ready': canProcessItem(r) }"
        >
          <div class="slot__head">
            <span class="slot__name">{{ r.outputName }}</span>
            <span class="slot__rank">가공품</span>
          </div>
          <p class="slot__req">
            재료:
            <span :class="{ ok: canProcessItem(r), miss: !canProcessItem(r) }">
              {{ r.lowerName }}<template v-if="r.upperName"> / {{ r.upperName }}</template>
              {{ processInputHeld(r) }} / {{ r.inputCount }}
            </span>
          </p>
          <button
            class="slot__buy"
            :disabled="!canProcessItem(r)"
            @click="doProcess(r)"
          >
            가공
          </button>
        </li>
      </ul>
    </section>

    <!-- 전설 제작 — 마을 고유 풀 -->
    <section class="section">
      <header class="section__hdr">
        <h2>전설 제작 <span class="cost">— 시간조각 {{ legendaryCost }} + 특산물 + 희소 재료 / 매번 가능</span></h2>
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
            <span :class="{ ok: run.data.timeShards >= legendaryCost, miss: run.data.timeShards < legendaryCost }">
              시간조각 {{ legendaryCost }}
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
        <li v-if="legendaryRecipes.length === 0" class="empty">이 권역에서 만들 수 있는 전설 카드가 없습니다.</li>
      </ul>
    </section>

    <!-- 카드 제거 섹션 -->
    <section class="section">
      <header class="section__hdr">
        <h2>카드 제거 <span class="cost">— 덱이 꽉 찰 때만 가능 / 제거 시 슬롯 -1</span></h2>
        <button
          v-if="!removalMode"
          class="toggle"
          :disabled="!canRemoveCard() || run.data.collection.length === 0"
          @click="removalMode = true"
        >
          {{ canRemoveCard() ? '제거할 카드 고르기' : `덱 채워야 가능 (${run.data.deck.length}/${run.data.deckSize})` }}
        </button>
        <button v-else class="cancel" @click="removalMode = false">취소</button>
      </header>
      <p class="removal__desc">컬렉션의 카드 1장을 영구 제거합니다. 제거 시 덱 슬롯도 1 감소합니다.</p>
      <ul v-if="removalMode" class="removal__list">
        <li v-for="c in run.data.collection" :key="c.instanceId" class="removal__item">
          <span class="removal__name">{{ c.name }}</span>
          <span class="removal__meta">cost {{ c.cost }} · {{ rankLabel(c.rank) }}</span>
          <button class="removal__pick" @click="pickRemovalTarget(c.instanceId!)">제거</button>
        </li>
      </ul>
    </section>

    <button class="leave" @click="leave">떠나기</button>
  </main>
</template>

<style scoped>
.workshop-view { max-width: 880px; margin: 0 auto; padding: 2rem; min-height: 100vh; min-height: 100dvh; }
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
.upgrade__item--awaken .upgrade__arrow { color: #ffe88e; }
.awaken__desc { color: #b6b6c4; font-size: 0.85rem; margin: 0 0 0.6rem; }
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

.removal__desc { color: #b6b6c4; font-size: 0.85rem; margin: 0 0 0.5rem; }
.removal__list { list-style: none; padding: 0; margin: 0.6rem 0 0; max-height: 280px; overflow-y: auto; }
.removal__item {
  display: grid;
  grid-template-columns: 1.4fr 1fr auto;
  gap: 0.4rem;
  align-items: center;
  padding: 0.35rem 0.4rem;
  border-bottom: 1px dashed rgba(255,255,255,0.08);
}
.removal__name { color: #e9e9f4; font-size: 0.88rem; }
.removal__meta { color: #888; font-size: 0.78rem; }
.removal__pick { background: rgba(255,142,142,0.15); border: 1px solid rgba(255,142,142,0.4); color: #ff8e8e; padding: 0.25rem 0.6rem; border-radius: 4px; cursor: pointer; font: inherit; font-size: 0.8rem; }
.removal__pick:hover { background: rgba(255,142,142,0.28); }
</style>
