<script setup lang="ts">
/**
 * 채집 미니게임 2 — 숫자 매트릭스.
 *
 * 3~5칸의 숫자가 섞여 깔린다. 1부터 순서대로 빠르게 누르면 점수↑.
 *  - 점수 = clamp(targetTime / actualTime, 0, 1.2). 칸수·targetTime = tier 스케일.
 *  - 첫 입력 순간부터 시간 측정. 마지막 칸을 누르면 종료.
 *  - 틀린 순서를 눌러도 *실패 처리는 안 한다* — 무시(시간만 흐른다)해서 짜증을 줄인다.
 *  - 키보드: 숫자 키 1~9로 그 숫자를 누른다. 터치/마우스: 칸을 직접 탭.
 *  - reduced-motion: 정답 칸 사라짐 트랜지션을 끈다.
 */
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{ count: number; targetTimeMs: number }>();
const emit = defineEmits<{ (e: 'done', score: number): void }>();

const reduceMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Cell { n: number; cleared: boolean }

const cells = ref<Cell[]>([]);
const next = ref(1);       // 다음에 눌러야 하는 숫자.
const phase = ref<'ready' | 'play' | 'over'>('ready');
let startAt = 0;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function press(n: number) {
  if (phase.value === 'over') return;
  if (n !== next.value) return; // 순서 틀림 — 무시(시간만 흐른다).
  if (phase.value === 'ready') { phase.value = 'play'; startAt = performance.now(); }
  const cell = cells.value.find((c) => c.n === n);
  if (cell) cell.cleared = true;
  next.value += 1;
  if (next.value > props.count) finish();
}

function finish() {
  if (phase.value === 'over') return;
  phase.value = 'over';
  const actual = Math.max(1, performance.now() - startAt);
  const score = Math.max(0, Math.min(1.2, props.targetTimeMs / actual));
  emit('done', score);
}

function onKey(e: KeyboardEvent) {
  if (e.repeat) return;
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= props.count) { e.preventDefault(); press(n); }
}

onMounted(() => {
  const order = shuffle(Array.from({ length: props.count }, (_, i) => i + 1));
  cells.value = order.map((n) => ({ n, cleared: false }));
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => { window.removeEventListener('keydown', onKey); });
</script>

<template>
  <div class="gm" :class="{ 'gm--rm': reduceMotion }">
    <p class="gm__hint">1부터 순서대로 빠르게 눌러 보자! (키보드는 숫자 키)</p>
    <p class="gm__next">다음: <strong>{{ Math.min(next, count) }}</strong></p>
    <div class="gm__grid" :style="{ '--cols': Math.min(count, 3) }">
      <button
        v-for="cell in cells"
        :key="cell.n"
        class="gm__cell"
        :class="{ 'gm__cell--done': cell.cleared, 'gm__cell--now': cell.n === next }"
        :disabled="cell.cleared || phase === 'over'"
        @pointerdown.prevent="press(cell.n)"
      >{{ cell.n }}</button>
    </div>
  </div>
</template>

<style scoped>
.gm { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
.gm__hint { color: #9a9aa8; font-size: 0.9rem; text-align: center; margin: 0; line-height: 1.5; }
.gm__next { color: #d6d6e0; margin: 0; }
.gm__next strong { color: #a8e88e; font-size: 1.3rem; }
.gm__grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 0.8rem; }
.gm__cell {
  width: 78px; height: 78px; border-radius: 12px; cursor: pointer; font: inherit; font-weight: 800; font-size: 1.8rem;
  background: rgba(168,232,142,0.1); border: 2px solid rgba(168,232,142,0.35); color: #cfeebb;
  font-variant-numeric: tabular-nums; touch-action: manipulation;
  transition: opacity 160ms ease, transform 120ms ease, border-color 120ms ease;
}
.gm__cell:hover:not(:disabled) { background: rgba(168,232,142,0.2); }
.gm__cell--now { border-color: #a8e88e; transform: scale(1.04); }
.gm__cell--done { opacity: 0.18; cursor: default; }
.gm--rm .gm__cell { transition: none; }
</style>
