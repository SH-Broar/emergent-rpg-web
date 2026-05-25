<script setup lang="ts">
/**
 * 채집 미니게임 3 — 반응 속도.
 *
 * 잠깐 기다린 뒤 신호(판이 초록으로 바뀜)가 뜨면 최대한 빨리 누른다. 반응이 빠를수록 점수↑.
 *  - 점수 = clamp((maxRT - rt) / (maxRT - minRT), 0, 1). 창(maxRT) = tier 스케일(깊을수록 좁다).
 *  - 신호 전에 누르면(조기 입력) 점수 0 + 한 번 더 기회(재시도). 너무 빠른 정직하지 않은 입력 방지.
 *  - 키보드: 스페이스/엔터로 입력. 터치/마우스: 큰 판을 탭.
 *  - reduced-motion 배려: 색 전환만, 깜빡임 애니메이션 없음(기본 구현이 단순 색 변경이라 무관).
 */
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{ minRtMs: number; maxRtMs: number }>();
const emit = defineEmits<{ (e: 'done', score: number): void }>();

type State = 'idle' | 'waiting' | 'signal' | 'early' | 'over';
const state = ref<State>('idle');
const resultRt = ref(0);

let signalAt = 0;
let waitTimer: number | undefined;

function clearWait() {
  if (waitTimer !== undefined) { window.clearTimeout(waitTimer); waitTimer = undefined; }
}

function arm() {
  // idle/early에서 누르면 대기 시작. 1.0~2.6초 랜덤 후 신호.
  if (state.value === 'waiting' || state.value === 'signal' || state.value === 'over') return;
  state.value = 'waiting';
  const delay = 1000 + Math.random() * 1600;
  waitTimer = window.setTimeout(() => {
    if (state.value !== 'waiting') return;
    state.value = 'signal';
    signalAt = performance.now();
  }, delay);
}

function hit() {
  if (state.value === 'idle' || state.value === 'early') { arm(); return; }
  if (state.value === 'waiting') {
    // 조기 입력 — 0점 처리 후 재시도.
    clearWait();
    state.value = 'early';
    return;
  }
  if (state.value === 'signal') {
    const rt = performance.now() - signalAt;
    resultRt.value = Math.round(rt);
    const span = Math.max(1, props.maxRtMs - props.minRtMs);
    const score = Math.max(0, Math.min(1, (props.maxRtMs - rt) / span));
    state.value = 'over';
    emit('done', score);
  }
}

function onKey(e: KeyboardEvent) {
  if (e.repeat) return;
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') { e.preventDefault(); hit(); }
}

onMounted(() => { window.addEventListener('keydown', onKey); });
onUnmounted(() => { window.removeEventListener('keydown', onKey); clearWait(); });
</script>

<template>
  <div class="gr">
    <p class="gr__hint">신호가 초록으로 바뀌면 바로 누르자! (키보드는 스페이스)</p>
    <button
      class="gr__pad"
      :class="{
        'gr__pad--idle': state === 'idle',
        'gr__pad--wait': state === 'waiting',
        'gr__pad--signal': state === 'signal',
        'gr__pad--early': state === 'early',
        'gr__pad--over': state === 'over',
      }"
      :disabled="state === 'over'"
      @pointerdown.prevent="hit"
    >
      <span v-if="state === 'idle'">눌러서 준비</span>
      <span v-else-if="state === 'waiting'">기다려…</span>
      <span v-else-if="state === 'signal'">지금!</span>
      <span v-else-if="state === 'early'">너무 일러! 다시 눌러서 준비</span>
      <span v-else>{{ resultRt }} ms</span>
    </button>
  </div>
</template>

<style scoped>
.gr { display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%; }
.gr__hint { color: #9a9aa8; font-size: 0.9rem; text-align: center; margin: 0; line-height: 1.5; }
.gr__pad {
  width: 100%; min-height: 180px; border-radius: 16px; cursor: pointer; font: inherit; font-weight: 700; font-size: 1.4rem;
  border: 2px solid transparent; touch-action: manipulation; user-select: none;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.gr__pad--idle { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.18); color: #d6d6e0; }
.gr__pad--wait { background: rgba(192,142,255,0.16); border-color: rgba(192,142,255,0.5); color: #d8b4ff; }
.gr__pad--signal { background: rgba(142,237,142,0.9); border-color: #8effb8; color: #16261a; }
.gr__pad--early { background: rgba(255,142,142,0.16); border-color: rgba(255,142,142,0.5); color: #ff8e8e; }
.gr__pad--over { background: rgba(168,232,142,0.16); border-color: rgba(168,232,142,0.5); color: #a8e88e; }
</style>
