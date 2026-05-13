<script setup lang="ts">
/**
 * 게임 중 고정 상단 HUD.
 *
 * 사용자 요구: 플레이 중 항상 확인 가능한 *고정 메뉴*.
 *  - HP / 최대 HP
 *  - 골드 / 시간의 조각
 *  - 남은 시간 (시간 만료 시 강조)
 *  - 덱 버튼 (현재 보유 카드 N장)
 *  - 유물 버튼 (현재 보유 유물 N개)
 *  - 메뉴 (런 포기 등은 추후)
 *
 * `run.active`일 때만 표시.
 */

import { computed } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';

defineProps<{ deckOpen: boolean; relicOpen: boolean }>();
const emit = defineEmits<{
  (e: 'toggle-deck'): void;
  (e: 'toggle-relic'): void;
}>();

const run = useRunStore();
const data = useDataStore();

const timeline = computed(() => data.timelines.get(run.data.timelineId));
const timeUrgent = computed(() => {
  const tl = timeline.value;
  if (!tl) return false;
  return run.data.visitedNodes.length >= tl.timeLimit;
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
</script>

<template>
  <header class="hud">
    <!-- HP -->
    <div class="slot slot--hp" :title="`HP ${run.data.hp} / ${run.data.maxHp}`">
      <span class="label">HP</span>
      <div class="bar">
        <div class="bar__fill" :style="{ width: hpRatio * 100 + '%', background: hpColor }" />
      </div>
      <span class="num">{{ run.data.hp }}/{{ run.data.maxHp }}</span>
    </div>

    <!-- 자원 -->
    <div class="slot" title="골드">
      <span class="icon">💰</span>
      <span class="num">{{ run.data.gold }}</span>
    </div>
    <div class="slot" title="시간의 조각">
      <span class="icon">⌛</span>
      <span class="num">{{ run.data.timeShards }}</span>
    </div>

    <!-- 시간 -->
    <div class="slot" :class="{ 'slot--urgent': timeUrgent }" title="남은 시간">
      <span class="icon">🕒</span>
      <span class="num">{{ run.data.remainingTime }}</span>
    </div>

    <!-- 덱 -->
    <button class="slot slot--btn" :class="{ 'slot--btn-on': deckOpen }" @click="emit('toggle-deck')">
      <span class="icon">🃏</span>
      <span class="num">{{ run.data.deck.length }} / {{ run.data.deckSize }}</span>
    </button>

    <!-- 유물 -->
    <button class="slot slot--btn" :class="{ 'slot--btn-on': relicOpen }" @click="emit('toggle-relic')">
      <span class="icon">📿</span>
      <span class="num">{{ run.data.relics.length }}</span>
    </button>
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
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.8rem;
  background: rgba(13, 14, 20, 0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.85rem;
  color: #d6d6e0;
}

.slot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.6rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  white-space: nowrap;
  font: inherit;
}

.slot--hp {
  flex: 1;
  min-width: 140px;
  max-width: 240px;
}
.slot--hp .label { color: #8effb8; font-weight: 600; font-size: 0.75rem; }
.slot--hp .bar {
  flex: 1;
  height: 8px;
  background: rgba(0,0,0,0.4);
  border-radius: 4px;
  overflow: hidden;
}
.slot--hp .bar__fill {
  height: 100%;
  transition: width 220ms ease, background 220ms ease;
}

.icon { font-size: 1rem; }
.num { font-variant-numeric: tabular-nums; font-weight: 600; color: #f6e8b8; }

.slot--urgent {
  background: rgba(255, 100, 100, 0.15);
  border-color: rgba(255, 100, 100, 0.5);
}
.slot--urgent .num { color: #ff8e8e; }

.slot--btn {
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.slot--btn:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); }
.slot--btn-on { background: rgba(192, 142, 255, 0.18); border-color: rgba(192, 142, 255, 0.5); }

/* 모바일 — 좁은 화면에서는 라벨/일부 요소 압축 */
@media (max-width: 640px) {
  .hud { gap: 0.3rem; padding: 0.4rem 0.5rem; font-size: 0.75rem; }
  .slot { padding: 0.25rem 0.45rem; gap: 0.25rem; }
  .slot--hp { min-width: 100px; }
  .slot--hp .label { display: none; }
  .icon { font-size: 0.9rem; }
}
</style>
