<script setup lang="ts">
/**
 * 채집 미니게임 2 — 숫자 격자.
 *
 * gridN x gridN(3x3 ~ 5x5) 격자에 1..gridN^2 숫자가 섞여 깔린다. 1부터 순서대로 빠르게 누르면 점수.
 *  - 점수 = clamp(targetTime / actualTime, 0, 1.2). gridN, targetTime = tier 스케일.
 *  - 첫 입력 순간부터 시간 측정. 마지막 칸을 누르면 종료.
 *  - 틀린 순서를 눌러도 실패 처리는 안 한다(무시, 시간만 흐른다).
 *  - 키보드: 숫자 키로 그 숫자. 두 자리 숫자는 잠깐 모아 입력. 방향키로 커서 이동 + 스페이스/엔터로 누름.
 *  - reduced-motion: 정답 칸 사라짐 트랜지션을 끈다.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{ gridN: number; targetTimeMs: number }>();
const emit = defineEmits<{ (e: 'done', score: number, record: string): void }>();

const reduceMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Cell { n: number; cleared: boolean }

const total = computed(() => props.gridN * props.gridN);
const cells = ref<Cell[]>([]);
const next = ref(1);        // 다음에 눌러야 하는 숫자.
const cursor = ref(0);      // 키보드 방향 이동용 커서(격자 인덱스).
const phase = ref<'ready' | 'play' | 'over'>('ready');
let startAt = 0;

// 두 자리 숫자 입력용 버퍼(예: 1, 2 -> 12). 짧은 타임아웃 후 비움.
let typeBuf = '';
let typeTimer: number | undefined;

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
  if (next.value > total.value) finish();
}

function finish() {
  if (phase.value === 'over') return;
  phase.value = 'over';
  const actual = Math.max(1, performance.now() - startAt);
  const score = Math.max(0, Math.min(1.2, props.targetTimeMs / actual));
  emit('done', score, `${(actual / 1000).toFixed(1)}초`);
}

function clearBuf() {
  typeBuf = '';
  if (typeTimer !== undefined) { window.clearTimeout(typeTimer); typeTimer = undefined; }
}

function feedDigit(d: string) {
  // 한 자리/두 자리 숫자 모두 지원: 현재 버퍼 + 새 숫자가 유효 범위면 그걸로, 아니면 새 숫자 단독.
  const combined = Number(typeBuf + d);
  if (typeBuf && combined >= 1 && combined <= total.value) {
    press(combined);
    clearBuf();
    return;
  }
  const single = Number(d);
  if (single >= 1 && single <= total.value) press(single);
  // 다음 입력과 합쳐 두 자리가 될 수 있게 버퍼 유지(짧은 시간).
  if (total.value > 9) {
    typeBuf = d;
    if (typeTimer !== undefined) window.clearTimeout(typeTimer);
    typeTimer = window.setTimeout(clearBuf, 700);
  }
}

function moveCursor(dx: number, dy: number) {
  const n = props.gridN;
  let col = cursor.value % n;
  let row = Math.floor(cursor.value / n);
  col = Math.min(n - 1, Math.max(0, col + dx));
  row = Math.min(n - 1, Math.max(0, row + dy));
  cursor.value = row * n + col;
}

function onKey(e: KeyboardEvent) {
  if (e.repeat) return;
  const k = e.key;
  if (k >= '0' && k <= '9') { e.preventDefault(); feedDigit(k); return; }
  if (k === 'ArrowLeft') { e.preventDefault(); moveCursor(-1, 0); }
  else if (k === 'ArrowRight') { e.preventDefault(); moveCursor(1, 0); }
  else if (k === 'ArrowUp') { e.preventDefault(); moveCursor(0, -1); }
  else if (k === 'ArrowDown') { e.preventDefault(); moveCursor(0, 1); }
  else if (k === ' ' || k === 'Enter' || k === 'Spacebar') {
    e.preventDefault();
    const cell = cells.value[cursor.value];
    if (cell) press(cell.n);
  }
}

onMounted(() => {
  const order = shuffle(Array.from({ length: total.value }, (_, i) => i + 1));
  cells.value = order.map((n) => ({ n, cleared: false }));
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  if (typeTimer !== undefined) window.clearTimeout(typeTimer);
});
</script>

<template>
  <div class="gm" :class="{ 'gm--rm': reduceMotion }">
    <p class="gm__hint">1부터 순서대로 눌러라.</p>
    <p class="gm__next">다음 <strong>{{ Math.min(next, total) }}</strong></p>
    <div class="gm__grid" :style="{ '--cols': gridN }">
      <button
        v-for="(cell, i) in cells"
        :key="cell.n"
        class="gm__cell"
        :class="{
          'gm__cell--done': cell.cleared,
          'gm__cell--now': cell.n === next,
          'gm__cell--cursor': i === cursor,
        }"
        :disabled="cell.cleared || phase === 'over'"
        @pointerdown.prevent="press(cell.n)"
      >{{ cell.n }}</button>
    </div>
  </div>
</template>

<style scoped>
.gm { display: flex; flex-direction: column; align-items: center; gap: 0.9rem; }
.gm__hint { color: #9a9aa8; font-size: 0.9rem; text-align: center; margin: 0; }
.gm__next { color: #d6d6e0; margin: 0; }
.gm__next strong { color: #a8e88e; font-size: 1.3rem; }
.gm__grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 0.5rem; width: 100%; max-width: 360px; }
.gm__cell {
  aspect-ratio: 1; border-radius: 10px; cursor: pointer; font: inherit; font-weight: 800;
  font-size: clamp(1rem, 4vw, 1.6rem);
  background: rgba(168,232,142,0.1); border: 2px solid rgba(168,232,142,0.35); color: #cfeebb;
  font-variant-numeric: tabular-nums; touch-action: manipulation;
  display: flex; align-items: center; justify-content: center;
  transition: opacity 160ms ease, transform 120ms ease, border-color 120ms ease;
}
.gm__cell:hover:not(:disabled) { background: rgba(168,232,142,0.2); }
.gm__cell--now { border-color: #a8e88e; transform: scale(1.04); }
.gm__cell--cursor { box-shadow: 0 0 0 2px #8eedff inset; }
.gm__cell--done { opacity: 0.18; cursor: default; }
.gm--rm .gm__cell { transition: none; }
</style>
