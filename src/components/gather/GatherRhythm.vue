<script setup lang="ts">
/**
 * 채집 미니게임 4 — 리듬(타이밍).
 *
 * 마커(화살표)가 트랙을 좌우로 왕복한다. *표시된 목표 구간*에 마커가 들어왔을 때 누르면 점수↑.
 *  - 중앙(perfect)에 가까울수록 정확도↑. 목표는 매 비트마다 위치가 바뀐다(예측 불가).
 *  - 점수 = clamp(평균 정확도 × 1.2, 0, 1.2). beats = tier 스케일(1~3). speedMs = 한 번 횡단 시간(작을수록 빠름).
 *  - 키보드: 스페이스/엔터. 터치/마우스: 트랙 전체가 큰 버튼.
 *  - reduced-motion: 마커 이동을 step 단위로 갱신(부드러운 애니 대신).
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{ beats: number; speedMs: number }>();
const emit = defineEmits<{ (e: 'done', score: number, record: string): void }>();

const reduceMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

type Phase = 'play' | 'over';
const phase = ref<Phase>('play');
const totalBeats = computed(() => Math.max(1, props.beats));

/** 마커 위치(0~100%). rAF로 갱신. */
const markerPct = ref(0);
/** 목표 구간 중심(0~100%)과 허용 반경(%). 비트마다 바뀐다. */
const targetCenter = ref(50);
const TARGET_HALF = 8;          // 목표 구간 반폭(%). 이 안이 "성공", 중앙일수록 만점.
const TOLERANCE = 22;           // 정확도 0이 되는 최대 거리(%).
const done = ref(0);            // 처리한 비트 수.
const accuracies: number[] = [];
const lastAccuracy = ref<number | null>(null);

let startAt = 0;
let raf = 0;

/** 다음 목표 위치를 무작위로(가장자리 회피, 18~82%). */
function reseedTarget() {
  targetCenter.value = 18 + Math.random() * 64;
}

/** 왕복(ping-pong) 마커 — 0..100..0 을 speedMs 주기로. */
function tick() {
  if (phase.value !== 'play') return;
  const t = (performance.now() - startAt) % (props.speedMs * 2);
  markerPct.value = t < props.speedMs
    ? (t / props.speedMs) * 100
    : 100 - ((t - props.speedMs) / props.speedMs) * 100;
  raf = window.requestAnimationFrame(tick);
}

function press() {
  if (phase.value !== 'play') return;
  const dist = Math.abs(markerPct.value - targetCenter.value);
  // 거리→정확도(0~1). 중앙이면 1, TOLERANCE 이상이면 0.
  const acc = Math.max(0, 1 - dist / TOLERANCE);
  accuracies.push(acc);
  lastAccuracy.value = acc;
  done.value += 1;
  if (done.value >= totalBeats.value) { finish(); return; }
  reseedTarget();
}

function finish() {
  phase.value = 'over';
  if (raf) window.cancelAnimationFrame(raf);
  const avg = accuracies.reduce((s, v) => s + v, 0) / Math.max(1, accuracies.length);
  const score = Math.max(0, Math.min(1.2, avg * 1.2));
  emit('done', score, `정확도 ${Math.round(avg * 100)}%`);
}

function onKey(e: KeyboardEvent) {
  if (e.repeat) return;
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') { e.preventDefault(); press(); }
}

onMounted(() => {
  reseedTarget();
  startAt = performance.now();
  window.addEventListener('keydown', onKey);
  if (reduceMotion) {
    // 부드러운 애니 대신 일정 간격 step 갱신.
    raf = window.setInterval(() => {
      const t = (performance.now() - startAt) % (props.speedMs * 2);
      markerPct.value = t < props.speedMs ? (t / props.speedMs) * 100 : 100 - ((t - props.speedMs) / props.speedMs) * 100;
    }, 60) as unknown as number;
  } else {
    raf = window.requestAnimationFrame(tick);
  }
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  if (reduceMotion) window.clearInterval(raf);
  else if (raf) window.cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="rh">
    <p class="rh__hint">화살표가 표시된 칸에 올 때 눌러라.</p>
    <p v-if="totalBeats > 1" class="rh__count">{{ Math.min(done + 1, totalBeats) }} / {{ totalBeats }}</p>
    <button class="rh__track" :disabled="phase === 'over'" @pointerdown.prevent="press">
      <!-- 목표 구간 -->
      <span
        class="rh__target"
        :style="{ left: (targetCenter - TARGET_HALF) + '%', width: (TARGET_HALF * 2) + '%' }"
      />
      <!-- 마커(화살표) -->
      <span class="rh__marker" :style="{ left: markerPct + '%' }">▾</span>
    </button>
    <p class="rh__fb" :class="{ 'rh__fb--good': (lastAccuracy ?? 0) >= 0.7 }">
      <template v-if="lastAccuracy === null">&nbsp;</template>
      <template v-else-if="lastAccuracy >= 0.95">완벽!</template>
      <template v-else-if="lastAccuracy >= 0.7">좋아!</template>
      <template v-else-if="lastAccuracy > 0">아쉽다</template>
      <template v-else>빗나감</template>
    </p>
  </div>
</template>

<style scoped>
.rh { display: flex; flex-direction: column; align-items: center; gap: 0.9rem; width: 100%; }
.rh__hint { color: #9a9aa8; font-size: 0.9rem; text-align: center; margin: 0; }
.rh__count { color: #d6d6e0; margin: 0; font-variant-numeric: tabular-nums; font-weight: 700; }
.rh__track {
  position: relative; width: 100%; height: 84px; border-radius: 14px; cursor: pointer;
  background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.18);
  overflow: hidden; touch-action: manipulation; user-select: none; padding: 0;
}
.rh__track:disabled { opacity: 0.5; cursor: default; }
.rh__target {
  position: absolute; top: 0; bottom: 0;
  background: rgba(168,232,142,0.28); border-left: 2px solid rgba(168,232,142,0.7); border-right: 2px solid rgba(168,232,142,0.7);
}
.rh__marker {
  position: absolute; top: 4px; transform: translateX(-50%);
  font-size: 1.6rem; line-height: 1; color: #f6e8b8; pointer-events: none;
}
.rh__fb { margin: 0; min-height: 1.2em; font-weight: 700; color: #9a9aa8; font-size: 0.95rem; }
.rh__fb--good { color: #a8e88e; }
</style>
