<script setup lang="ts">
/**
 * 보상 패널(2026-07-02) — 승리 전리품·수확·우편 등 보상을 모아 보여주는 중앙 오버레이.
 *
 * ui.rewardPanels 큐의 *맨 앞*을 표시하고, 확인/ESC/바깥 클릭으로 닫으면 다음 패널로 넘어간다
 * (연속 배치는 순차 표시). 토스트와 달리 사라지지 않아 화면 전환 중 보상이 증발하지 않는다(FunQA 대응).
 *
 * 스크롤 금지 설계: 폭 고정(~360px), max-height 70dvh, 라인은 compressRewardLines로 9줄 이하 유지
 * (초과 시 8줄 + "외 N건"). 모바일 safe-area 하단 여백 고려. App 레벨에 전역 마운트.
 */
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useUiStore } from '@/stores/ui';
import { compressRewardLines } from '@/systems/reward-feed';

const ui = useUiStore();

/** 큐 맨 앞 패널(없으면 null → 미표시). */
const current = computed(() => ui.rewardPanels[0] ?? null);
/** 스크롤 없이 담기 위해 9줄로 압축한 표시 라인. */
const lines = computed(() => (current.value ? compressRewardLines(current.value.lines) : []));

function confirm() {
  if (current.value) ui.dismissRewardPanel();
}

// ESC/Enter로도 닫힘(확인). 열려 있을 때만 반응.
function onKey(e: KeyboardEvent) {
  if (!current.value) return;
  if (e.key === 'Escape' || e.key === 'Enter') {
    e.preventDefault();
    confirm();
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <transition name="reward-fade">
    <div v-if="current" class="reward-backdrop" @click.self="confirm">
      <div class="reward-panel" role="dialog" aria-modal="true">
        <h2 class="reward-panel__title">{{ current.title }}</h2>
        <ul class="reward-panel__lines">
          <li v-for="(line, i) in lines" :key="i">{{ line }}</li>
          <li v-if="lines.length === 0" class="reward-panel__empty">얻은 것은 없었다.</li>
        </ul>
        <button class="reward-panel__confirm" @click="confirm">확인</button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.reward-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-reward, 995);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  background: rgba(0, 0, 0, 0.72);
}
.reward-panel {
  width: 360px;
  max-width: calc(100vw - 2rem);
  max-height: 70dvh;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.4rem 1.5rem;
  background: #16171f;
  border: 1px solid rgba(246, 232, 184, 0.45);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
}
.reward-panel__title {
  margin: 0;
  text-align: center;
  color: #f6e8b8;
  font-size: 1.2rem;
}
.reward-panel__lines {
  list-style: none;
  margin: 0;
  padding: 0.6rem 0.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.reward-panel__lines li {
  color: #8effb8;
  font-size: 0.95rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.reward-panel__empty {
  color: #6c6c7c;
  font-style: italic;
}
.reward-panel__confirm {
  align-self: center;
  min-width: 8rem;
  padding: 0.6rem 1.4rem;
  background: rgba(246, 232, 184, 0.16);
  border: 1px solid rgba(246, 232, 184, 0.5);
  color: #f6e8b8;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}
.reward-panel__confirm:hover {
  background: rgba(246, 232, 184, 0.28);
}
.reward-fade-enter-active,
.reward-fade-leave-active {
  transition: opacity 180ms ease;
}
.reward-fade-enter-from,
.reward-fade-leave-to {
  opacity: 0;
}
</style>
