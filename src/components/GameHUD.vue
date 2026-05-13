<script setup lang="ts">
/**
 * 게임 중 고정 상단 HUD.
 *
 * 사용자 요구:
 *  - 항상 확인 가능한 고정 메뉴
 *  - 아이콘 + 라벨 병기 (헷갈리지 않게)
 *  - 히페리온/해석 게이지도 상단에
 *  - HP / 골드 / 시간의 조각 / 시간 / 덱 / 유물
 */

import { computed } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useMetaStore } from '@/stores/meta';

defineProps<{ deckOpen: boolean; relicOpen: boolean }>();
const emit = defineEmits<{
  (e: 'toggle-deck'): void;
  (e: 'toggle-relic'): void;
}>();

const run = useRunStore();
const data = useDataStore();
const meta = useMetaStore();

const timeline = computed(() => data.timelines.get(run.data.timelineId));
const timeUrgent = computed(() => {
  const tl = timeline.value;
  if (!tl) return false;
  return run.data.remainingTime <= Math.max(3, Math.floor(tl.timeLimit * 0.1));
});

const hpRatio = computed(() => {
  if (run.data.maxHp === 0) return 0;
  return run.data.hp / run.data.maxHp;
});
const hpColor = computed(() => {
  const r = hpRatio.value;
  if (r > 0.6) return '#8effb8';
  if (r > 0.3) return '#ffe88e';
  return '#ff8e8e';
});

// 히페리온 / 해석 게이지 미니 표시
interface GaugeMini {
  key: 'hyperion1' | 'hyperion2' | 'insight1' | 'insight2';
  label: string;
  color: string;
}
const gauges: GaugeMini[] = [
  { key: 'hyperion1', label: '히①', color: '#c08eff' },
  { key: 'hyperion2', label: '히②', color: '#ffb88e' },
  { key: 'insight1', label: '해①', color: '#8eedff' },
  { key: 'insight2', label: '해②', color: '#ff8e8e' },
];

function pct(key: GaugeMini['key']) {
  const g = meta.gauges[key];
  return Math.min(100, Math.round((g.current / Math.max(1, g.max)) * 100));
}
</script>

<template>
  <header class="hud">
    <div class="row row--main">
      <!-- HP -->
      <div class="slot slot--hp" :title="`HP ${run.data.hp} / ${run.data.maxHp}`">
        <span class="emoji">❤</span>
        <span class="lbl">HP</span>
        <div class="bar"><div class="bar__fill" :style="{ width: hpRatio * 100 + '%', background: hpColor }" /></div>
        <span class="num">{{ run.data.hp }}/{{ run.data.maxHp }}</span>
      </div>

      <!-- 자원 -->
      <div class="slot" title="골드">
        <span class="emoji">💰</span>
        <span class="lbl">골드</span>
        <span class="num">{{ run.data.gold }}</span>
      </div>
      <div class="slot" title="시간의 조각 (카드/유물 제작용)">
        <span class="emoji">⌛</span>
        <span class="lbl">조각</span>
        <span class="num">{{ run.data.timeShards }}</span>
      </div>

      <!-- 일차 (30턴마다 +1) -->
      <div class="slot" title="현재 일차 (30턴마다 하루 경과)">
        <span class="emoji">☀</span>
        <span class="lbl">일</span>
        <span class="num">{{ run.data.currentDay }}</span>
      </div>

      <!-- 시간 -->
      <div class="slot" :class="{ 'slot--urgent': timeUrgent }" title="남은 시간 (0 도달 시 즉시 런 종료)">
        <span class="emoji">🕒</span>
        <span class="lbl">시간</span>
        <span class="num">{{ run.data.remainingTime }}</span>
      </div>

      <!-- 덱 -->
      <button class="slot slot--btn" :class="{ 'slot--btn-on': deckOpen }" @click="emit('toggle-deck')">
        <span class="emoji">🃏</span>
        <span class="lbl">덱</span>
        <span class="num">{{ run.data.deck.length }}/{{ run.data.deckSize }}</span>
      </button>

      <!-- 유물 -->
      <button class="slot slot--btn" :class="{ 'slot--btn-on': relicOpen }" @click="emit('toggle-relic')">
        <span class="emoji">📿</span>
        <span class="lbl">유물</span>
        <span class="num">{{ run.data.relics.length }}</span>
      </button>
    </div>

    <!-- 히페리온 / 해석 게이지 -->
    <div class="row row--gauges">
      <div v-for="g in gauges" :key="g.key" class="gauge" :title="`${g.label} ${meta.gauges[g.key].current}/${meta.gauges[g.key].max}`">
        <span class="gauge__label" :style="{ color: g.color }">{{ g.label }}</span>
        <div class="gauge__bar">
          <div class="gauge__fill" :style="{ width: pct(g.key) + '%', background: g.color }" />
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hud {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 800;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.4rem 0.7rem 0.45rem;
  background: rgba(13, 14, 20, 0.94);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #d6d6e0;
  font-size: 0.85rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.row--gauges {
  gap: 0.4rem;
  padding: 0 0.1rem;
}

.slot {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.55rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  white-space: nowrap;
  font: inherit;
}
.slot--hp { flex: 1; min-width: 160px; max-width: 280px; }
.slot--hp .bar { flex: 1; height: 8px; background: rgba(0,0,0,0.4); border-radius: 4px; overflow: hidden; }
.slot--hp .bar__fill { height: 100%; transition: width 220ms ease, background 220ms ease; }

.emoji { font-size: 0.95rem; }
.lbl { color: #c0b693; font-size: 0.78rem; }
.num { font-variant-numeric: tabular-nums; font-weight: 600; color: #f6e8b8; }

.slot--urgent { background: rgba(255, 100, 100, 0.15); border-color: rgba(255, 100, 100, 0.5); }
.slot--urgent .num { color: #ff8e8e; }

.slot--btn { cursor: pointer; transition: background 120ms ease, border-color 120ms ease; }
.slot--btn:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); }
.slot--btn-on { background: rgba(192, 142, 255, 0.18); border-color: rgba(192, 142, 255, 0.5); }

/* 게이지 미니 막대 */
.gauge {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
}
.gauge__label {
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
}
.gauge__bar {
  flex: 1;
  height: 4px;
  background: rgba(0,0,0,0.4);
  border-radius: 2px;
  overflow: hidden;
}
.gauge__fill {
  height: 100%;
  transition: width 280ms ease;
}

/* 모바일 압축 */
@media (max-width: 640px) {
  .hud { padding: 0.3rem 0.4rem 0.4rem; font-size: 0.72rem; gap: 0.2rem; }
  .row { gap: 0.3rem; }
  .slot { padding: 0.22rem 0.4rem; gap: 0.22rem; }
  .lbl { display: none; }
  .slot--hp { min-width: 100px; }
  .emoji { font-size: 0.85rem; }
  .gauge__label { font-size: 0.6rem; }
}
</style>
