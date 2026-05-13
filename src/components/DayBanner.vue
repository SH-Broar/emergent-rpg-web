<script setup lang="ts">
/**
 * 하루 경과 배너 — 화면 위쪽 큰 띠 + 어둡기 + 일차 텍스트.
 *
 * RunStore.data.dayPassedSeq를 watch — 시퀀스가 +1 될 때마다 한 번 표시.
 * 약 0.6~1.0초 후 자동 해제.
 *
 * 사용자 요구: "반드시 눈에 띄게 하루가 지났다는 걸 알려줘야 합니다."
 */

import { ref, watch } from 'vue';
import { useRunStore } from '@/stores/run';

const run = useRunStore();

const visible = ref(false);
const day = ref(1);

let timer: number | undefined;

watch(
  () => run.data.dayPassedSeq,
  (seq, prev) => {
    if (!seq || seq === prev) return;
    // 새 하루가 시작되었다는 신호.
    day.value = run.data.currentDay;
    visible.value = true;
    if (timer) window.clearTimeout(timer);
    // 슬라이드 인 + hold + 슬라이드 아웃 — 총 약 1.3초.
    timer = window.setTimeout(() => {
      visible.value = false;
      timer = undefined;
    }, 1300);
  },
);
</script>

<template>
  <transition name="day">
    <aside v-if="visible" class="day-banner" role="status" aria-live="polite">
      <div class="day-banner__inner">
        <div class="day-banner__label">제 {{ day }} 일</div>
        <div class="day-banner__sub">동이 튼다 — 길 위의 자취가 다시 바람에 쓸려 간다</div>
      </div>
    </aside>
  </transition>
</template>

<style scoped>
.day-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 970;
  /* HUD(800)보다 위, 모달(950)보다 위 — 한순간 화면을 *덮는* 느낌. */
  pointer-events: none;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.55) 80%, rgba(0, 0, 0, 0) 100%);
  padding: 2rem 1rem 3rem;
  display: flex;
  justify-content: center;
}
.day-banner__inner {
  text-align: center;
  display: grid;
  gap: 0.4rem;
}
.day-banner__label {
  font-size: 2.6rem;
  font-weight: 700;
  letter-spacing: 0.3em;
  color: #f6e8b8;
  text-shadow: 0 2px 16px rgba(246, 232, 184, 0.4), 0 0 32px rgba(192, 142, 255, 0.25);
}
.day-banner__sub {
  font-size: 0.95rem;
  color: #c0b693;
  letter-spacing: 0.08em;
}

/* 슬라이드 다운 + 페이드 — 1.3초 안에 들어왔다 빠짐. */
.day-enter-active {
  transition: transform 320ms cubic-bezier(0.2, 0.8, 0.25, 1), opacity 240ms ease;
}
.day-leave-active {
  transition: transform 360ms cubic-bezier(0.4, 0, 0.6, 1), opacity 300ms ease;
}
.day-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}
.day-leave-to {
  transform: translateY(-30%);
  opacity: 0;
}

@media (max-width: 640px) {
  .day-banner { padding: 1.4rem 0.6rem 2rem; }
  .day-banner__label { font-size: 1.9rem; letter-spacing: 0.2em; }
  .day-banner__sub { font-size: 0.82rem; }
}
</style>
