<script setup lang="ts">
/**
 * 앱 최상위 셸.
 *
 * - 마운트 시 게임 데이터 한 번 로드.
 * - 런 진행 중에는 *고정 HUD*를 상단에 표시 (HP/재화/시간/덱/유물 항상 확인).
 * - 덱 / 유물 모달.
 * - 라우터 뷰 + 전역 토스트.
 */

import { onMounted, ref } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import GameHUD from '@/components/GameHUD.vue';
import DeckPanel from '@/components/DeckPanel.vue';
import RelicPanel from '@/components/RelicPanel.vue';
import DayBanner from '@/components/DayBanner.vue';

const ui = useUiStore();
const data = useDataStore();
const run = useRunStore();

const deckOpen = ref(false);
const relicOpen = ref(false);

function toggleDeck() {
  deckOpen.value = !deckOpen.value;
  if (deckOpen.value) relicOpen.value = false;
}
function toggleRelic() {
  relicOpen.value = !relicOpen.value;
  if (relicOpen.value) deckOpen.value = false;
}

onMounted(async () => {
  await data.ensureLoaded();
  if (data.error) {
    ui.toast('error', `데이터 로드 실패: ${data.error}`, 6000);
  }
});
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--in-run': run.active }">
    <!-- 고정 HUD (런 중에만) -->
    <GameHUD
      v-if="run.active"
      :deck-open="deckOpen"
      :relic-open="relicOpen"
      @toggle-deck="toggleDeck"
      @toggle-relic="toggleRelic"
    />

    <router-view v-slot="{ Component, route }">
      <transition name="scene-fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>

    <!-- 덱 / 유물 모달 -->
    <DeckPanel :open="deckOpen" @close="deckOpen = false" />
    <RelicPanel :open="relicOpen" @close="relicOpen = false" />

    <!-- 하루 경과 배너 (런 중에만 의미) -->
    <DayBanner v-if="run.active" />

    <!-- 글로벌 로딩 -->
    <div v-if="data.loading" class="loading">데이터 로딩 중…</div>

    <!-- 전역 토스트 -->
    <div class="toast-stack" aria-live="polite">
      <transition-group name="toast">
        <div
          v-for="t in ui.toasts"
          :key="t.id"
          class="toast"
          :class="`toast--${t.kind}`"
        >
          {{ t.message }}
        </div>
      </transition-group>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  min-height: 100vh;
  width: 100%;
}
/* 런 중에는 상단에 HUD가 있으므로 컨텐츠를 아래로 밀어줌 */
.app-shell--in-run :deep(main) {
  padding-top: 3.5rem;
}

.loading {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.6rem 1.2rem;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(192, 142, 255, 0.4);
  border-radius: 6px;
  color: #c08eff;
  font-size: 0.9rem;
  z-index: 999;
}

.toast-stack {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 1000;
  pointer-events: none;
}

.toast { padding: 0.6rem 1rem; border-radius: 6px; font-size: 0.9rem; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); pointer-events: auto; }
.toast--info { background: #1f2937; color: #cbd5e1; }
.toast--success { background: #064e3b; color: #d1fae5; }
.toast--warning { background: #78350f; color: #fef3c7; }
.toast--error { background: #7f1d1d; color: #fecaca; }

.scene-fade-enter-active, .scene-fade-leave-active { transition: opacity 180ms ease; }
.scene-fade-enter-from, .scene-fade-leave-to { opacity: 0; }
.toast-enter-active, .toast-leave-active { transition: all 220ms ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
