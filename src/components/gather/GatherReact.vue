<script setup lang="ts">
/**
 * 채집 미니게임 3 — 반응 속도.
 *
 * 신호(판이 초록)가 뜨면 빨리 누른다. 타깃 N개를 순차로(N = tier 스케일, 1~3) 처리한다.
 *  - 점수 = clamp((maxRT - avgRT) / (maxRT - minRT), 0, 1). avgRT = 타깃 평균 반응시간.
 *  - 신호 전에 누르면(조기 입력) 그 타깃은 무효 + 같은 타깃 재시도.
 *  - 키보드: 스페이스/엔터. 터치/마우스: 큰 판을 탭.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{ minRtMs: number; maxRtMs: number; targets: number }>();
const emit = defineEmits<{ (e: 'done', score: number, record: string): void }>();

type State = 'idle' | 'waiting' | 'signal' | 'early' | 'over';
const state = ref<State>('idle');
const resultRt = ref(0);
const done = ref(0);        // 처리한 타깃 수.
const rts: number[] = [];   // 타깃별 반응시간(ms).

let signalAt = 0;
let waitTimer: number | undefined;

const totalTargets = computed(() => Math.max(1, props.targets));

function clearWait() {
  if (waitTimer !== undefined) { window.clearTimeout(waitTimer); waitTimer = undefined; }
}

function arm() {
  // idle/early에서 누르면 대기 시작. 0.9~2.4초 랜덤 후 신호.
  if (state.value === 'waiting' || state.value === 'signal' || state.value === 'over') return;
  state.value = 'waiting';
  const delay = 900 + Math.random() * 1500;
  waitTimer = window.setTimeout(() => {
    if (state.value !== 'waiting') return;
    state.value = 'signal';
    signalAt = performance.now();
  }, delay);
}

function finish() {
  state.value = 'over';
  const avg = rts.reduce((s, v) => s + v, 0) / Math.max(1, rts.length);
  const span = Math.max(1, props.maxRtMs - props.minRtMs);
  const score = Math.max(0, Math.min(1, (props.maxRtMs - avg) / span));
  emit('done', score, `${(avg / 1000).toFixed(2)}초`);
}

function hit() {
  if (state.value === 'idle' || state.value === 'early') { arm(); return; }
  if (state.value === 'waiting') {
    // 조기 입력 — 같은 타깃 재시도.
    clearWait();
    state.value = 'early';
    return;
  }
  if (state.value === 'signal') {
    const rt = performance.now() - signalAt;
    resultRt.value = Math.round(rt);
    rts.push(rt);
    done.value += 1;
    if (done.value >= totalTargets.value) { finish(); return; }
    // 다음 타깃으로 자동 진행(잠깐 idle 표시 후 다시 대기).
    state.value = 'idle';
    arm();
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
    <p class="gr__hint">초록이 뜨면 눌러라.</p>
    <p v-if="totalTargets > 1" class="gr__count">{{ Math.min(done + 1, totalTargets) }} / {{ totalTargets }}</p>
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
      <span v-if="state === 'idle'">준비</span>
      <span v-else-if="state === 'waiting'">대기</span>
      <span v-else-if="state === 'signal'">지금</span>
      <span v-else-if="state === 'early'">다시</span>
      <span v-else>{{ resultRt }} ms</span>
    </button>
  </div>
</template>

<style scoped>
.gr { display: flex; flex-direction: column; align-items: center; gap: 0.9rem; width: 100%; }
.gr__hint { color: #9a9aa8; font-size: 0.9rem; text-align: center; margin: 0; }
.gr__count { color: #d6d6e0; margin: 0; font-variant-numeric: tabular-nums; font-weight: 700; }
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
