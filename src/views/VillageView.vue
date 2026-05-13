<script setup lang="ts">
/**
 * 마을 화면 — NPC 대화 (NPC harness 단계에서 본격) + 간이 제작.
 *
 * 사용자 정의 (Step C):
 *   마을 제작 = *랜덤*으로 등장하는 카드를 *저렴*하게 (시간의 조각 5).
 *   공방 = 별도 (더 비싸고 더 좋은 카드 + 강화).
 */

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import type { Card } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

const VILLAGE_CRAFT_COST = 5;       // 시간의 조각 비용
const VILLAGE_CRAFT_CHOICES = 3;    // 한 번에 제시되는 후보 수
const VILLAGE_CARD_RANKS = new Set(['common']);  // 마을은 *일반 등급* 풀에서만

const currentNode = computed(() => {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n: { id: string }) => n.id === run.data.currentNodeId);
});

const craftPool = computed<Card[]>(() => {
  // 일반 등급 카드들. 추후 출처·종족 등으로 필터링.
  return Array.from(data.cards.values()).filter((c: Card) => VILLAGE_CARD_RANKS.has(c.rank));
});

const rolledOptions = ref<Card[]>([]);
const phase = ref<'menu' | 'craft-roll' | 'craft-result'>('menu');
const craftedCard = ref<Card | null>(null);

function rollCraft() {
  if (run.data.timeShards < VILLAGE_CRAFT_COST) {
    ui.toast('warning', `시간의 조각이 부족합니다. (필요 ${VILLAGE_CRAFT_COST})`);
    return;
  }
  // 랜덤 N장 추첨 (중복 없이)
  const pool = [...craftPool.value];
  const picked: Card[] = [];
  while (picked.length < VILLAGE_CRAFT_CHOICES && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  rolledOptions.value = picked;
  phase.value = 'craft-roll';
}

function selectCrafted(card: Card) {
  run.data.timeShards -= VILLAGE_CRAFT_COST;
  // 카드 컬렉션에 추가 (덱 슬롯 등록은 사용자가 덱 편집에서)
  run.addCardToCollection(card);
  craftedCard.value = card;
  phase.value = 'craft-result';
}

function cancelRoll() {
  // 추첨만 한 상태 — 자원 차감 X, 그냥 메뉴로
  rolledOptions.value = [];
  phase.value = 'menu';
}

function leave() {
  router.push('/game/map');
}

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
</script>

<template>
  <main class="village-view">
    <header class="hdr">
      <button class="back" @click="leave">← 맵으로</button>
      <h1>{{ currentNode?.label ?? '마을' }}</h1>
    </header>

    <p v-if="currentNode?.description" class="desc">{{ currentNode.description }}</p>

    <!-- 메뉴 -->
    <section v-if="phase === 'menu'" class="menu">
      <div class="resources">
        <span>HP {{ run.data.hp }}/{{ run.data.maxHp }}</span>
        <span>골드 {{ run.data.gold }}</span>
        <span>시간의 조각 {{ run.data.timeShards }}</span>
      </div>

      <button class="opt" disabled>
        <span class="opt__title">대화</span>
        <span class="opt__hint">(NPC harness 작업 후)</span>
      </button>
      <button class="opt" @click="rollCraft">
        <span class="opt__title">간이 제작</span>
        <span class="opt__hint">시간의 조각 {{ VILLAGE_CRAFT_COST }} — 무작위 카드 {{ VILLAGE_CRAFT_CHOICES }}장 중 1장 선택</span>
      </button>
      <button class="opt opt--leave" @click="leave">떠나기</button>
    </section>

    <!-- 제작 추첨 -->
    <section v-else-if="phase === 'craft-roll'" class="craft-roll">
      <h2>제작 후보</h2>
      <p class="craft-roll__hint">1장 선택 시 시간의 조각 {{ VILLAGE_CRAFT_COST }} 소모</p>
      <div class="craft-grid">
        <button
          v-for="(c, i) in rolledOptions"
          :key="`${c.id}-${i}`"
          class="craft-card"
          :style="{ borderColor: rankColors[c.rank] }"
          @click="selectCrafted(c)"
        >
          <div class="craft-card__head">
            <span class="craft-card__cost">{{ c.cost }}</span>
            <span class="craft-card__name">{{ c.name }}</span>
          </div>
          <div class="craft-card__rank" :style="{ color: rankColors[c.rank] }">{{ c.rank }}</div>
          <div class="craft-card__effects">
            <span v-for="(e, ei) in c.effects" :key="ei" class="effect">
              {{ e.kind }} {{ e.value ?? '' }}
            </span>
          </div>
          <p v-if="c.flavor" class="craft-card__flavor">{{ c.flavor }}</p>
        </button>
      </div>
      <button class="cancel" @click="cancelRoll">물러난다</button>
    </section>

    <!-- 제작 결과 -->
    <section v-else-if="phase === 'craft-result' && craftedCard" class="result">
      <h2>제작 완료</h2>
      <div class="result-card" :style="{ borderColor: rankColors[craftedCard.rank] }">
        <div class="result-card__name">{{ craftedCard.name }}</div>
        <div class="result-card__rank" :style="{ color: rankColors[craftedCard.rank] }">{{ craftedCard.rank }}</div>
        <p v-if="craftedCard.flavor" class="result-card__flavor">{{ craftedCard.flavor }}</p>
      </div>
      <p class="result__line">{{ craftedCard.name }}을(를) 덱에 추가했습니다.</p>
      <p class="result__cost">- 시간의 조각 {{ VILLAGE_CRAFT_COST }}</p>
      <button class="continue" @click="leave">계속 →</button>
    </section>
  </main>
</template>

<style scoped>
.village-view { max-width: 720px; margin: 0 auto; padding: 2rem; min-height: 100vh; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
h1 { color: #8effb8; margin: 0; }
.desc { color: #b6b6c4; font-style: italic; margin: 0.6rem 0 1.5rem; }

.menu { display: flex; flex-direction: column; gap: 0.8rem; }
.resources { display: flex; gap: 1rem; padding: 0.6rem 1rem; background: rgba(0,0,0,0.4); border-radius: 6px; color: #b6b6c4; font-size: 0.9rem; }
.opt { padding: 1rem 1.2rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.15); color: inherit; border-radius: 8px; cursor: pointer; text-align: left; font: inherit; display: flex; flex-direction: column; gap: 0.2rem; }
.opt:hover:not(:disabled) { background: rgba(142, 255, 184, 0.1); border-color: rgba(142, 255, 184, 0.4); }
.opt:disabled { opacity: 0.4; cursor: not-allowed; }
.opt__title { font-weight: 600; color: #f6e8b8; }
.opt__hint { font-size: 0.85rem; color: #888; }
.opt--leave { background: rgba(255,255,255,0.02); }

.craft-roll h2 { color: #8effb8; }
.craft-roll__hint { color: #888; font-size: 0.9rem; margin-bottom: 1rem; }
.craft-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.craft-card { padding: 0.8rem; background: rgba(255,255,255,0.04); border: 2px solid; border-radius: 8px; cursor: pointer; color: inherit; text-align: left; font: inherit; display: flex; flex-direction: column; gap: 0.3rem; }
.craft-card:hover { transform: translateY(-4px); background: rgba(255,255,255,0.08); }
.craft-card__head { display: flex; align-items: center; gap: 0.4rem; }
.craft-card__cost { background: #c08eff; color: #0d0e14; padding: 0.2rem 0.5rem; border-radius: 50%; font-weight: 700; font-size: 0.85rem; }
.craft-card__name { flex: 1; color: #f6e8b8; font-weight: 600; }
.craft-card__rank { font-size: 0.75rem; text-transform: uppercase; }
.craft-card__effects { display: flex; flex-wrap: wrap; gap: 0.2rem; font-size: 0.8rem; }
.effect { background: rgba(0,0,0,0.4); padding: 0.15rem 0.4rem; border-radius: 4px; color: #b6b6c4; }
.craft-card__flavor { font-size: 0.75rem; color: #6c6c7c; font-style: italic; margin: 0; }
.cancel { padding: 0.6rem 1.2rem; background: none; border: 1px solid rgba(255,255,255,0.2); color: #888; border-radius: 6px; cursor: pointer; }

.result { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 2rem 0; }
.result h2 { color: #8effb8; }
.result-card { padding: 1.2rem 1.5rem; background: rgba(255,255,255,0.06); border: 2px solid; border-radius: 8px; min-width: 260px; }
.result-card__name { font-size: 1.2rem; font-weight: 600; color: #f6e8b8; }
.result-card__rank { font-size: 0.85rem; text-transform: uppercase; margin: 0.3rem 0; }
.result-card__flavor { font-size: 0.85rem; color: #888; font-style: italic; margin: 0.5rem 0 0; }
.result__line { color: #d6d6e0; margin: 0; }
.result__cost { color: #ffe88e; margin: 0; }
.continue { padding: 0.6rem 1.4rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: inherit; border-radius: 6px; cursor: pointer; font: inherit; font-weight: 600; }
</style>
