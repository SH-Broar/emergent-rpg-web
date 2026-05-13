<script setup lang="ts">
/**
 * 앱 최상위 셸.
 *
 * spec v2 Round 12: 메인 씬 ↔ 게임 씬을 라우터로 분리.
 * 이 컴포넌트는 *씬에 무관한 글로벌 레이어*만 담당:
 *   - 라우터 뷰
 *   - 전역 토스트
 *   - 전역 모달 (선택)
 *
 * 외부 프레임(Mono/Imperisia/Transcendent)의 구체적 표현은
 * MainView·ResearchView 등 *씬 단위 컴포넌트*에서.
 */

import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
</script>

<template>
  <div class="app-shell">
    <router-view v-slot="{ Component, route }">
      <transition name="scene-fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>

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
  background: var(--bg-deep, #0d0e14);
  color: var(--fg-base, #e9e9f4);
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

.toast {
  padding: 0.6rem 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  pointer-events: auto;
}

.toast--info {
  background: #1f2937;
  color: #cbd5e1;
}
.toast--success {
  background: #064e3b;
  color: #d1fae5;
}
.toast--warning {
  background: #78350f;
  color: #fef3c7;
}
.toast--error {
  background: #7f1d1d;
  color: #fecaca;
}

.scene-fade-enter-active,
.scene-fade-leave-active {
  transition: opacity 180ms ease;
}
.scene-fade-enter-from,
.scene-fade-leave-to {
  opacity: 0;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 220ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
