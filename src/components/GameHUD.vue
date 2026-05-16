<script setup lang="ts">
/**
 * 게임 중 고정 상단 HUD — 슬림 버전 (M2).
 *
 * 사용자 요구 (2026-05-15):
 *  - 4 슬롯만 노출: HP / 골드 / 시간의 조각 / 시간
 *  - 3 메뉴 버튼: 캐릭터 / 소지품 / 설정 (햄버거 패턴)
 *  - 일차/덱/유물/아이템/동료/6컬러/스탯은 메뉴로 이동
 *  - 모바일 375px 한 줄 (4슬롯 + 3버튼)
 *  - 각 슬롯/버튼에 Tooltip 부착
 */

import { computed } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import Tooltip from '@/components/Tooltip.vue';

defineProps<{
  characterOpen: boolean;
  inventoryOpen: boolean;
  settingsOpen: boolean;
}>();
const emit = defineEmits<{
  (e: 'toggle-character'): void;
  (e: 'toggle-inventory'): void;
  (e: 'toggle-settings'): void;
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
</script>

<template>
  <header class="hud">
    <div class="row row--main">
      <!-- HP -->
      <Tooltip text="HP — 체력. 0이 되면 런 종료. 회복약/유물로 보충.">
        <div class="slot slot--hp">
          <span class="emoji">❤</span>
          <span class="lbl">HP</span>
          <div class="bar"><div class="bar__fill" :style="{ width: hpRatio * 100 + '%', background: hpColor }" /></div>
          <span class="num">{{ run.data.hp }}/{{ run.data.maxHp }}</span>
        </div>
      </Tooltip>

      <!-- 골드 -->
      <Tooltip text="골드 — 마을·작업장에서 카드/유물/아이템 구매에 사용.">
        <div class="slot">
          <span class="emoji">💰</span>
          <span class="lbl">골드</span>
          <span class="num">{{ run.data.gold }}</span>
        </div>
      </Tooltip>

      <!-- 시간의 조각 -->
      <Tooltip text="시간의 조각 — 카드/유물 강화·재료. 던전 깊은 곳일수록 더 모인다.">
        <div class="slot">
          <span class="emoji">⏳</span>
          <span class="lbl">조각</span>
          <span class="num">{{ run.data.timeShards }}</span>
        </div>
      </Tooltip>

      <!-- 시간 -->
      <Tooltip text="남은 시간 — 0이 되면 즉시 런 종료. 시간 소모는 행동·이동에서 발생.">
        <div class="slot" :class="{ 'slot--urgent': timeUrgent }">
          <span class="emoji">⌛</span>
          <span class="lbl">시간</span>
          <span class="num">{{ run.data.remainingTime }}</span>
        </div>
      </Tooltip>

      <!-- 메뉴 버튼 3개 -->
      <Tooltip text="캐릭터 — 6 컬러, 스탯, 덱, 동료를 본다.">
        <button
          class="slot slot--btn slot--menu"
          :class="{ 'slot--btn-on': characterOpen }"
          aria-label="캐릭터 메뉴"
          @click="emit('toggle-character')"
        >
          <span class="emoji">👤</span>
          <span class="lbl">캐릭터</span>
        </button>
      </Tooltip>

      <Tooltip text="소지품 — 현재 일차, 유물, 아이템을 본다.">
        <button
          class="slot slot--btn slot--menu"
          :class="{ 'slot--btn-on': inventoryOpen }"
          aria-label="소지품 메뉴"
          @click="emit('toggle-inventory')"
        >
          <span class="emoji">🎒</span>
          <span class="lbl">소지품</span>
        </button>
      </Tooltip>

      <Tooltip text="설정 — 현재 시대 확인, 런 포기.">
        <button
          class="slot slot--btn slot--menu"
          :class="{ 'slot--btn-on': settingsOpen }"
          aria-label="설정 메뉴"
          @click="emit('toggle-settings')"
        >
          <span class="emoji">⚙</span>
          <span class="lbl">설정</span>
        </button>
      </Tooltip>
    </div>
  </header>
</template>

<style scoped>
.hud {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-hud);
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
  gap: 0.4rem;
}

.slot {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.28rem 0.5rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  white-space: nowrap;
  font: inherit;
}
.slot--hp { flex: 1; min-width: 140px; max-width: 260px; }
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

.slot--menu { margin-left: 0.15rem; }

/* 모바일 압축 — 375px에서 4슬롯 + 3버튼 한 줄 */
@media (max-width: 640px) {
  .hud { padding: 0.28rem 0.35rem 0.36rem; font-size: 0.72rem; gap: 0.2rem; }
  .row { gap: 0.2rem; }
  .slot { padding: 0.2rem 0.32rem; gap: 0.18rem; }
  .lbl { display: none; }
  .slot--hp { min-width: 90px; }
  .slot--hp .bar { height: 6px; }
  .emoji { font-size: 0.85rem; }
  .slot--menu { margin-left: 0.08rem; }
}
</style>
