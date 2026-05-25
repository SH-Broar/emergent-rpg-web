<script setup lang="ts">
/**
 * 채집 미니게임 1 — 좌우 연타.
 *
 * 제한 시간 안에 좌/우를 *번갈아* 누른 횟수가 많을수록 점수↑.
 *  - 같은 쪽을 연속으로 눌러도 받아주되, 교대했을 때만 카운트 +1(번갈아 누르도록 유도).
 *  - 점수 = clamp(presses / targetPresses, 0, 1.2). targetPresses = tier 스케일.
 *  - 키보드: 왼쪽 화살표/A = 좌, 오른쪽 화살표/D = 우. 터치/마우스: 양쪽 큰 버튼.
 *  - reduced-motion: 펄스 애니메이션을 끈다.
 */
import { ref, onMounted, onUnmounted, computed } from 'vue';

const props = defineProps<{ targetPresses: number; timeMs: number }>();
const emit = defineEmits<{ (e: 'done', score: number, record: string): void }>();

const reduceMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const phase = ref<'ready' | 'play' | 'over'>('ready');
const presses = ref(0);
const remaining = ref(props.timeMs);
const lastSide = ref<'L' | 'R' | null>(null);
const pulse = ref<'L' | 'R' | null>(null);

let deadline = 0;
let timer: number | undefined;
let pulseTimer: number | undefined;

const pct = computed(() => Math.max(0, Math.min(100, (remaining.value / props.timeMs) * 100)));

function start() {
  if (phase.value !== 'ready') return;
  phase.value = 'play';
  deadline = performance.now() + props.timeMs;
  timer = window.setInterval(() => {
    remaining.value = Math.max(0, deadline - performance.now());
    if (remaining.value <= 0) finish();
  }, 40);
}

function tap(side: 'L' | 'R') {
  if (phase.value === 'ready') { start(); }
  if (phase.value !== 'play') return;
  // 번갈아 눌렀을 때만 카운트(연타를 좌우로 유도). 첫 입력은 항상 카운트.
  if (lastSide.value === null || lastSide.value !== side) {
    presses.value += 1;
  }
  lastSide.value = side;
  if (!reduceMotion) {
    pulse.value = side;
    if (pulseTimer) window.clearTimeout(pulseTimer);
    pulseTimer = window.setTimeout(() => { pulse.value = null; }, 90);
  }
}

function finish() {
  if (phase.value === 'over') return;
  phase.value = 'over';
  if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
  const score = Math.max(0, Math.min(1.2, presses.value / Math.max(1, props.targetPresses)));
  emit('done', score, `${presses.value}타`);
}

function onKey(e: KeyboardEvent) {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') { e.preventDefault(); tap('L'); }
  else if (k === 'arrowright' || k === 'd') { e.preventDefault(); tap('R'); }
}

onMounted(() => { window.addEventListener('keydown', onKey); });
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  if (timer !== undefined) window.clearInterval(timer);
  if (pulseTimer !== undefined) window.clearTimeout(pulseTimer);
});
</script>

<template>
  <div class="gt">
    <p class="gt__hint">양쪽을 번갈아 눌러라.</p>
    <div class="gt__stat">
      <span class="gt__count">{{ presses }}</span>
      <span class="gt__goal">/ {{ targetPresses }}</span>
    </div>
    <div class="gt__bar"><div class="gt__fill" :style="{ width: pct + '%' }"></div></div>
    <div class="gt__pads">
      <button
        class="gt__pad"
        :class="{ 'gt__pad--pulse': pulse === 'L' }"
        :disabled="phase === 'over'"
        @pointerdown.prevent="tap('L')"
      >왼쪽</button>
      <button
        class="gt__pad"
        :class="{ 'gt__pad--pulse': pulse === 'R' }"
        :disabled="phase === 'over'"
        @pointerdown.prevent="tap('R')"
      >오른쪽</button>
    </div>
  </div>
</template>

<style scoped>
.gt { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
.gt__hint { color: #9a9aa8; font-size: 0.9rem; text-align: center; margin: 0; line-height: 1.5; }
.gt__stat { display: flex; align-items: baseline; gap: 0.5rem; }
.gt__count { font-size: 2.6rem; font-weight: 800; color: #a8e88e; font-variant-numeric: tabular-nums; }
.gt__goal { color: #9a9aa8; font-size: 0.95rem; }
.gt__bar { width: 100%; height: 8px; background: rgba(255,255,255,0.12); border-radius: 4px; overflow: hidden; }
.gt__fill { height: 100%; background: linear-gradient(90deg, #a8e88e, #8eedff); transition: width 0.04s linear; }
.gt__pads { display: flex; gap: 0.9rem; width: 100%; }
.gt__pad {
  flex: 1; padding: 2.4rem 0.5rem; border-radius: 14px; cursor: pointer; font: inherit; font-weight: 700; font-size: 1.3rem;
  background: rgba(168,232,142,0.12); border: 2px solid rgba(168,232,142,0.4); color: #cfeebb;
  user-select: none; touch-action: manipulation;
  transition: transform 90ms ease, background 90ms ease;
}
.gt__pad:hover:not(:disabled) { background: rgba(168,232,142,0.2); }
.gt__pad:disabled { opacity: 0.4; cursor: default; }
.gt__pad--pulse { transform: scale(0.95); background: rgba(168,232,142,0.32); }
</style>
