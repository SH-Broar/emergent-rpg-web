<script setup lang="ts">
/**
 * 시간대 선택 — 실제 데이터 연동.
 */

import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { canEnterTimeline } from '@/frame/Mono';
import { randomLine } from '@/frame/Imperisia';

const router = useRouter();
const ui = useUiStore();
const data = useDataStore();

const timelines = computed(() => Array.from(data.timelines.values()));

const greeting = randomLine('mainGreet');

function selectTimeline(id: string) {
  if (!canEnterTimeline(id)) {
    ui.toast('warning', '아직 모노의 간섭이 닿지 않는 시대입니다.');
    return;
  }
  ui.pendingRunSetup.timelineId = id;
  router.push('/game/character-select');
}

function back() {
  router.push('/main');
}
</script>

<template>
  <main class="tl-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>시간대 선택</h1>
      <p>임페리시아: {{ greeting }}</p>
    </header>

    <section v-if="timelines.length > 0" class="grid">
      <button
        v-for="t in timelines"
        :key="t.id"
        class="card"
        @click="selectTimeline(t.id)"
      >
        <div class="card__year">{{ t.year }}년 · {{ t.era ?? '시대' }}</div>
        <div class="card__name">{{ t.name }}</div>
        <p class="card__tagline">{{ t.tagline ?? t.description }}</p>
        <div class="card__meta">
          <span>제한 시간 {{ t.timeLimit }}회</span>
          <span>덱 확장 {{ t.deckExpansionThresholds[0] }}/{{ t.deckExpansionThresholds[1] }}</span>
        </div>
      </button>
    </section>
    <section v-else class="empty">
      <p>아직 모노가 어떤 시대도 부르지 않았습니다.</p>
    </section>
  </main>
</template>

<style scoped>
.tl-view { max-width: 1000px; margin: 0 auto; padding: 2rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
.hdr p { color: #a4a4b0; font-style: italic; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.2rem; margin-top: 1.5rem; }
.card { display: flex; flex-direction: column; gap: 0.3rem; padding: 1.4rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: inherit; cursor: pointer; text-align: left; transition: transform 120ms ease, background 120ms ease; }
.card:hover { transform: translateY(-2px); background: rgba(255,255,255,0.08); }
.card__year { font-size: 0.85rem; color: #c08eff; }
.card__name { font-size: 1.4rem; font-weight: 600; color: #f6e8b8; }
.card__tagline { font-size: 0.9rem; color: #b6b6c4; margin: 0.5rem 0 0; }
.card__meta { display: flex; gap: 1rem; margin-top: 0.6rem; font-size: 0.8rem; color: #6c6c7c; }
.empty { text-align: center; padding: 4rem 2rem; color: #6c6c7c; }
</style>
