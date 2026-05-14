<script setup lang="ts">
/**
 * 게임 중 고정 상단 HUD.
 *
 * 사용자 요구 (2026-05-15):
 *  - 연구 게이지 *제거* — 게임 중에는 의미 없음
 *  - 대신 6 컬러 (불·전기·흙·철·물·바람) 표시 + 도출된 ATK/DEF/MAG
 *  - HP / 골드 / 시간의 조각 / 시간 / 일 / 덱 / 유물
 */

import { computed } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { deriveStats, deriveBonuses } from '@/systems/stats';

defineProps<{ deckOpen: boolean; relicOpen: boolean; itemOpen: boolean }>();
const emit = defineEmits<{
  (e: 'toggle-deck'): void;
  (e: 'toggle-relic'): void;
  (e: 'toggle-item'): void;
}>();

const run = useRunStore();
const data = useDataStore();

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

// 6 컬러 막대 (사용자 지정 순서: 불 / 전기 / 흙 / 철 / 물 / 바람).
interface ColorBar {
  key: 'fire' | 'electric' | 'earth' | 'iron' | 'water' | 'wind';
  label: string;
  color: string;
}
const colorBars: ColorBar[] = [
  { key: 'fire',     label: '불',   color: '#ff8e8e' },
  { key: 'electric', label: '전기', color: '#f2e36a' },
  { key: 'earth',    label: '흙',   color: '#c2a36a' },
  { key: 'iron',     label: '철',   color: '#a4a4b0' },
  { key: 'water',    label: '물',   color: '#8eedff' },
  { key: 'wind',     label: '바람', color: '#a8e8b8' },
];

const COLOR_CAP = 100;
function colorPct(key: ColorBar['key']) {
  return Math.min(100, Math.round((run.data.colors[key] / COLOR_CAP) * 100));
}

// 3 도출 스탯 + 보너스 (HUD 우측 컴팩트 표시).
const stats = computed(() => deriveStats(run.data.colors));
const bonus = computed(() => deriveBonuses(stats.value));
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

      <!-- 아이템 -->
      <button class="slot slot--btn" :class="{ 'slot--btn-on': itemOpen }" @click="emit('toggle-item')">
        <span class="emoji">🧪</span>
        <span class="lbl">아이템</span>
        <span class="num">{{ run.data.items.length }}</span>
      </button>

      <!-- 동료 -->
      <div class="slot" :title="`동료 ${run.data.companions.length}/3`">
        <span class="emoji">👥</span>
        <span class="lbl">동료</span>
        <span class="num">{{ run.data.companions.length }}/3</span>
      </div>
    </div>

    <!-- 6 컬러 + 3 도출 스탯 -->
    <div class="row row--colors">
      <div
        v-for="c in colorBars"
        :key="c.key"
        class="color"
        :title="`${c.label} ${run.data.colors[c.key]} / ${COLOR_CAP}`"
      >
        <span class="color__label" :style="{ color: c.color }">{{ c.label }}</span>
        <div class="color__bar">
          <div class="color__fill" :style="{ width: colorPct(c.key) + '%', background: c.color }" />
        </div>
        <span class="color__num">{{ run.data.colors[c.key] }}</span>
      </div>

      <!-- ATK/DEF/MAG 도출치 + 보너스 -->
      <div class="stats" :title="`ATK=${Math.round(stats.atk)} DEF=${Math.round(stats.def)} MAG=${Math.round(stats.mag)} → 공격 +${bonus.damage}, 방어 +${bonus.block}, 드로우 +${bonus.drawExtra}, 마나 +${bonus.manaExtra}`">
        <span class="stat stat--atk">ATK {{ Math.round(stats.atk) }}<sup>+{{ bonus.damage }}</sup></span>
        <span class="stat stat--def">DEF {{ Math.round(stats.def) }}<sup>+{{ bonus.block }}</sup></span>
        <span class="stat stat--mag">MAG {{ Math.round(stats.mag) }}<sup>+{{ bonus.drawExtra }}/+{{ bonus.manaExtra }}</sup></span>
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
.row--colors {
  gap: 0.35rem;
  padding: 0 0.1rem;
  flex-wrap: wrap;
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

/* 6 컬러 막대 */
.color {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.28rem;
  min-width: 0;
  background: rgba(255, 255, 255, 0.03);
  padding: 0.16rem 0.4rem;
  border-radius: 4px;
}
.color__label {
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
  min-width: 1.5em;
}
.color__bar {
  flex: 1;
  height: 4px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 2px;
  overflow: hidden;
}
.color__fill {
  height: 100%;
  transition: width 280ms ease;
}
.color__num {
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  color: #d6d6e0;
  min-width: 1.6em;
  text-align: right;
}

/* 3 도출 스탯 */
.stats {
  display: flex;
  gap: 0.45rem;
  margin-left: auto;
  flex-shrink: 0;
}
.stat {
  background: rgba(255, 255, 255, 0.05);
  padding: 0.18rem 0.5rem;
  border-radius: 4px;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.stat sup {
  font-size: 0.6em;
  color: #c08eff;
  margin-left: 0.18rem;
}
.stat--atk { color: #ff8e8e; }
.stat--def { color: #a4a4b0; }
.stat--mag { color: #8eedff; }

/* 모바일 압축 */
@media (max-width: 640px) {
  .hud { padding: 0.3rem 0.4rem 0.4rem; font-size: 0.72rem; gap: 0.2rem; }
  .row { gap: 0.3rem; }
  .slot { padding: 0.22rem 0.4rem; gap: 0.22rem; }
  .lbl { display: none; }
  .slot--hp { min-width: 100px; }
  .emoji { font-size: 0.85rem; }
  .color__label { font-size: 0.62rem; min-width: 1.2em; }
  .color__num { font-size: 0.62rem; min-width: 1.4em; }
  .color { padding: 0.12rem 0.3rem; gap: 0.2rem; }
  .stat { font-size: 0.68rem; padding: 0.14rem 0.36rem; }
}
</style>
