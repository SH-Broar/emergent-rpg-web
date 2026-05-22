<script setup lang="ts">
/**
 * 강 구속/삼킴 발버둥 미니게임.
 *
 * 사양(2026-05-23): 발버둥 시 8색 중 랜덤 4색이 *순서대로* 제시되고, 손패가 그 색 카드 4장으로 보인다.
 * 제시된 색 순서에 맞게 카드를 2초 안에 순서대로 누르면 성공(게이지 감소). 틀리거나 시간초과면
 * *이번 발버둥만 실패*(게이지 유지, 마나는 소모). 카드는 실제로 사용되지 않는다.
 *
 * 자기 완결: onMounted에서 beginHardStruggle()로 마나 차감/판정, 끝나면 completeHardStruggle()로 결과 반영.
 * 마나 부족 등으로 시작 불가면 즉시 close. CombatView/BossView 양쪽이 그대로 재사용(보스 패리티).
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { beginHardStruggle, completeHardStruggle } from '@/systems/combat';
import { colorLabel } from '@/systems/labels';
import type { Element } from '@/data/schemas';

const emit = defineEmits<{ (e: 'close'): void }>();

const TIME_MS = 2000;
const ALL_COLORS: Element[] = ['fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark'];
const COLOR_HEX: Record<Element, string> = {
  fire: '#ff8e8e', electric: '#f2e36a', earth: '#c2a36a', iron: '#a4a4b0',
  water: '#8eedff', wind: '#a8e8b8', light: '#f6e8b8', dark: '#c08eff',
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const target = ref<Element[]>([]);     // 눌러야 하는 색 순서.
const hand = ref<Element[]>([]);       // 손패 카드의 색(위치 섞임).
const used = ref<boolean[]>([]);       // 이미 맞게 누른 카드.
const progress = ref(0);               // 지금까지 맞은 개수.
const remaining = ref(TIME_MS);        // 남은 시간(ms).
let finished = false;
let timer: number | undefined;

function finish(success: boolean) {
  if (finished) return;
  finished = true;
  if (timer !== undefined) { clearInterval(timer); timer = undefined; }
  completeHardStruggle(success);
  emit('close');
}

function clickCard(i: number) {
  if (finished || used.value[i]) return;
  if (hand.value[i] === target.value[progress.value]) {
    used.value[i] = true;
    progress.value += 1;
    if (progress.value >= target.value.length) finish(true);
  } else {
    finish(false); // 순서 틀림 — 이번 발버둥 실패.
  }
}

onMounted(() => {
  if (!beginHardStruggle()) { emit('close'); return; }
  const chosen = shuffle(ALL_COLORS).slice(0, 4);
  target.value = shuffle(chosen);
  hand.value = shuffle(chosen);
  used.value = [false, false, false, false];
  progress.value = 0;
  const deadline = performance.now() + TIME_MS;
  timer = window.setInterval(() => {
    remaining.value = Math.max(0, deadline - performance.now());
    if (remaining.value <= 0) finish(false);
  }, 40);
});

onUnmounted(() => {
  if (timer !== undefined) clearInterval(timer);
});
</script>

<template>
  <div class="sm-overlay">
    <div class="sm-box">
      <div class="sm-title">발버둥! 색 순서대로 누르기</div>
      <!-- 목표 색 순서 -->
      <div class="sm-seq">
        <span
          v-for="(col, i) in target"
          :key="i"
          class="sm-chip"
          :class="{ 'sm-chip--done': i < progress, 'sm-chip--now': i === progress }"
          :style="{ background: COLOR_HEX[col] }"
        >{{ i + 1 }}</span>
      </div>
      <!-- 손패(색 카드) -->
      <div class="sm-hand">
        <button
          v-for="(col, i) in hand"
          :key="i"
          class="sm-card"
          :class="{ 'sm-card--used': used[i] }"
          :style="{ background: COLOR_HEX[col] }"
          :disabled="used[i]"
          @click="clickCard(i)"
        >{{ colorLabel(col) }}</button>
      </div>
      <!-- 시간 막대 -->
      <div class="sm-timebar"><div class="sm-timefill" :style="{ width: (remaining / TIME_MS * 100) + '%' }"></div></div>
    </div>
  </div>
</template>

<style scoped>
.sm-overlay {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}
.sm-box {
  background: #221c2e; border: 1px solid rgba(255, 170, 110, 0.55); border-radius: 14px;
  padding: 1.1rem 1.3rem; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; gap: 0.8rem; align-items: center; max-width: 92vw;
}
.sm-title { color: #ffd9a8; font-weight: 700; font-size: 1rem; }
.sm-seq { display: flex; gap: 0.5rem; }
.sm-chip {
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; color: #1a1622; font-size: 0.85rem;
  border: 2px solid transparent; opacity: 0.55; transition: opacity 0.1s, transform 0.1s;
}
.sm-chip--done { opacity: 0.2; }
.sm-chip--now { opacity: 1; border-color: #fff; transform: scale(1.12); }
.sm-hand { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
.sm-card {
  min-width: 64px; height: 84px; border-radius: 9px; border: 1px solid rgba(0, 0, 0, 0.25);
  font-weight: 700; color: #1a1622; cursor: pointer; font: inherit; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.sm-card:hover:not(:disabled) { filter: brightness(1.12); transform: translateY(-2px); }
.sm-card--used { opacity: 0.25; cursor: default; transform: none; }
.sm-timebar { width: 100%; height: 7px; background: rgba(255, 255, 255, 0.12); border-radius: 4px; overflow: hidden; }
.sm-timefill { height: 100%; background: linear-gradient(90deg, #ffb88e, #ff8e8e); transition: width 0.04s linear; }
</style>
