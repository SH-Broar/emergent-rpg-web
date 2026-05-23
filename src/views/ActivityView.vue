<script setup lang="ts">
/**
 * 활동 화면 — *컬러 주사위 도전*.
 *
 * 흐름: 컬러 하나를 고른다 → 그 컬러값 + 기본 보정(20)이 *성공 확률 n* → d100 굴림.
 *   roll ≤ n 이면 성공. 실패해도 *기본 보상*(applyActivityBaseline)은 받고,
 *   성공하면 *특수 보상*(applyActivitySuccess: 건 컬러 대폭 + 보너스)을 추가로 받는다.
 * 보상은 토스트로 표시(기존 활동과 동일). 굴림은 run rng라 세이브 일관.
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { colorLabel } from '@/systems/labels';
import { rng } from '@/systems/rng';
import {
  activitySuccessChance,
  applyActivityBaseline,
  applyActivitySuccess,
  markActivityDone,
  isActivityDone,
} from '@/systems/activity';
import type { ColorKey } from '@/systems/colors';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();

const COLORS: { key: ColorKey; hex: string }[] = [
  { key: 'fire', hex: '#ff8e8e' }, { key: 'water', hex: '#8eedff' },
  { key: 'electric', hex: '#f2e36a' }, { key: 'iron', hex: '#a4a4b0' },
  { key: 'earth', hex: '#c2a36a' }, { key: 'wind', hex: '#a8e8b8' },
  { key: 'light', hex: '#f6e8b8' }, { key: 'dark', hex: '#c08eff' },
];

const map = computed(() => data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? ''));
const currentNode = computed(() => map.value?.nodes.find((n: { id: string }) => n.id === run.data.currentNodeId));
const nodeName = computed(() => currentNode.value?.label ?? '활동');

/** 활동 노드 권역의 tier(1~4). 미상이면 1. */
const regionTier = computed<number>(() => {
  const node = currentNode.value;
  const region = node?.region ? map.value?.regions.find((r) => r.id === node.region) : undefined;
  return region?.tier ?? 1;
});
/** 권역 깊이 → 난이도. 깊을수록 제시 컬러가 적어(어려움) 보상이 큼. */
const difficulty = computed<{ n: number; label: string; boost: number }>(() => {
  const t = regionTier.value;
  if (t >= 4) return { n: 2, label: '상', boost: 18 };
  if (t === 3) return { n: 3, label: '중', boost: 14 };
  return { n: 4, label: '하', boost: 10 };
});

const alreadyDone = ref(false);
const doneMsg = ref('');
const phase = ref<'pick' | 'rolling' | 'result'>('pick');
const selected = ref<ColorKey | null>(null);
/** 이번 활동에 제시되는 컬러 — 8색 중 난이도 수만큼 무작위(run rng, 마운트 시 1회 고정). */
const offered = ref<ColorKey[]>([]);
const displayRoll = ref(0);
const finalRoll = ref(0);
const success = ref(false);
const usedColor = ref<ColorKey | null>(null);
const usedChance = ref(0); // 굴림 당시 성공 확률 — 보상으로 컬러가 오른 뒤에도 결과 표시는 이 값으로 고정.

function colorValue(k: ColorKey): number { return run.data.colors[k] ?? 0; }
function chanceOf(k: ColorKey): number { return activitySuccessChance(colorValue(k)); }
const selectedChance = computed(() => (selected.value ? chanceOf(selected.value) : 0));
/** 제시 컬러 {key, hex} 목록 — 템플릿 렌더용. */
const offeredList = computed(() => offered.value.map((k) => COLORS.find((c) => c.key === k)!).filter(Boolean));

function pick(k: ColorKey) { if (phase.value === 'pick') selected.value = k; }

let rollTimer = 0;
function challenge() {
  if (!selected.value || phase.value !== 'pick') return;
  const color = selected.value;
  usedColor.value = color;
  const chance = chanceOf(color);
  usedChance.value = chance;
  phase.value = 'rolling';
  // 굴림 애니메이션 — 무작위 숫자 틱(cosmetic) 후 실제 roll(rng)로 확정.
  const start = Date.now();
  const DURATION = 950;
  rollTimer = window.setInterval(() => {
    const t = Date.now() - start;
    if (t >= DURATION) {
      window.clearInterval(rollTimer);
      rollTimer = 0;
      const roll = 1 + Math.floor(rng() * 100); // 1~100
      finalRoll.value = roll;
      displayRoll.value = roll;
      success.value = roll <= chance;
      resolve(color);
    } else {
      displayRoll.value = 1 + Math.floor(Math.random() * 100);
    }
  }, 55);
}

function resolve(color: ColorKey) {
  const nodeId = run.data.currentNodeId;
  applyActivityBaseline(nodeId);            // 성공/실패 무관 항상 기본 보상
  if (success.value) applyActivitySuccess(color, difficulty.value.boost); // 성공 시 특수 보상(난이도 비례)
  markActivityDone(nodeId);
  phase.value = 'result';
}

function leave() { router.push('/game/map'); }

onMounted(() => {
  if (!run.active) { router.push('/main'); return; }
  // 활동은 *노드당 1회*. 다른 노드에 가면 다시 할 수 있다. (하루 경과 시 노드 리프레시로 재개방.)
  if (isActivityDone(run.data.currentNodeId)) { alreadyDone.value = true; doneMsg.value = '이미 다녀간 활동이다.'; return; }
  // 제시 컬러 = 8색 중 난이도 수만큼 무작위(Fisher-Yates, run rng). 마운트 1회 고정.
  const all: ColorKey[] = COLORS.map((c) => c.key);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  offered.value = all.slice(0, difficulty.value.n);
});
</script>

<template>
  <main class="activity-view">
    <section v-if="alreadyDone" class="done">
      <h1>{{ nodeName }}</h1>
      <p class="done__msg">{{ doneMsg || '이미 다녀간 활동이다.' }}</p>
      <button class="leave" @click="leave">계속 →</button>
    </section>

    <section v-else class="activity">
      <header class="hdr">
        <h1>{{ nodeName }} <span class="diff" :class="`diff--${difficulty.label}`">난이도 {{ difficulty.label }} · {{ difficulty.n }}색</span></h1>
        <p class="sub">원하는 컬러를 선택해 주사위 눈을 시험한다.</p>
      </header>

      <!-- 컬러 선택 (난이도만큼 제시) -->
      <div v-if="phase === 'pick'" class="pick">
        <div class="colors">
          <button
            v-for="c in offeredList"
            :key="c.key"
            class="color"
            :class="{ 'color--sel': selected === c.key }"
            :style="{ '--hex': c.hex }"
            @click="pick(c.key)"
          >
            <span class="color__name">{{ colorLabel(c.key) }}</span>
            <span class="color__val">{{ colorValue(c.key) }}</span>
            <span class="color__chance">성공 {{ chanceOf(c.key) }}%</span>
          </button>
        </div>
        <footer class="foot">
          <button class="challenge" :disabled="!selected" @click="challenge">
            {{ selected ? `시작! (성공 ${selectedChance}%)` : '시작!' }}
          </button>
        </footer>
      </div>

      <!-- 굴림 애니메이션 -->
      <div v-else class="roll">
        <div class="dice" :class="{ 'dice--win': phase === 'result' && success, 'dice--lose': phase === 'result' && !success }">
          {{ displayRoll }}
        </div>
        <p v-if="phase === 'rolling'" class="roll__hint">굴리는 중…</p>
        <div v-else class="result">
          <p class="result__line">
            <strong>{{ finalRoll }}</strong> ≤ {{ usedChance }}
            <span :class="success ? 'result__ok' : 'result__no'">{{ success ? '성공!' : '실패' }}</span>
          </p>
          <p class="result__reward">{{ success ? '특수 보상 + 기본 보상을 받았다.' : '기본 보상을 받았다.' }} (획득물은 알림 참고)</p>
          <button class="leave" @click="leave">계속 →</button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.activity-view { max-width: 680px; margin: 0 auto; padding: 3rem 2rem; min-height: 100vh; min-height: 100dvh; }
.hdr h1, .done h1 { color: #f0d68e; margin: 0 0 0.4rem; }
.diff { font-size: 0.78rem; font-weight: 600; padding: 0.12rem 0.5rem; border-radius: 5px; margin-left: 0.5rem; white-space: nowrap; }
.diff--하 { color: #8effb8; border: 1px solid rgba(142,255,184,0.45); }
.diff--중 { color: #f2e36a; border: 1px solid rgba(242,227,106,0.45); }
.diff--상 { color: #ff8e8e; border: 1px solid rgba(255,142,142,0.45); }
.sub { color: #9a9aa8; font-size: 0.92rem; margin: 0 0 1.6rem; line-height: 1.5; }
.done__msg { color: #b6b6c4; margin: 1rem 0 2rem; }

.colors { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.7rem; }
.color {
  display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
  padding: 0.9rem 0.4rem; border-radius: 10px; cursor: pointer; font: inherit;
  background: rgba(255,255,255,0.04);
  border: 2px solid color-mix(in srgb, var(--hex) 35%, transparent);
  color: inherit;
}
.color:hover { background: color-mix(in srgb, var(--hex) 14%, transparent); }
.color--sel { border-color: var(--hex); background: color-mix(in srgb, var(--hex) 22%, transparent); }
.color__name { font-weight: 600; color: var(--hex); }
.color__val { font-size: 1.4rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.color__chance { font-size: 0.76rem; color: #9a9aa8; }

.foot { margin-top: 1.8rem; }
.challenge {
  width: 100%; padding: 0.95rem; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600;
  background: rgba(240,214,142,0.18); border: 1px solid rgba(240,214,142,0.5); color: #f0d68e;
}
.challenge:hover:not(:disabled) { background: rgba(240,214,142,0.3); }
.challenge:disabled { opacity: 0.4; cursor: not-allowed; }

.roll { text-align: center; padding: 2rem 0; }
.dice {
  display: inline-flex; align-items: center; justify-content: center;
  width: 160px; height: 160px; border-radius: 18px;
  font-size: 4.6rem; font-weight: 800; font-variant-numeric: tabular-nums;
  background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.18); color: #f6e8b8;
  transition: transform 140ms ease, border-color 200ms ease, color 200ms ease;
}
.dice--win { border-color: #8effb8; color: #8effb8; transform: scale(1.06); }
.dice--lose { border-color: #ff8e8e; color: #ff8e8e; }
.roll__hint { color: #9a9aa8; margin-top: 1.2rem; letter-spacing: 0.1em; }
.result { margin-top: 1.4rem; }
.result__line { font-size: 1.15rem; color: #d6d6e0; }
.result__line strong { font-size: 1.4rem; }
.result__ok { color: #8effb8; font-weight: 700; margin-left: 0.5rem; }
.result__no { color: #ff8e8e; font-weight: 700; margin-left: 0.5rem; }
.result__reward { color: #9a9aa8; font-size: 0.9rem; margin: 0.6rem 0 1.6rem; }

.leave {
  padding: 0.8rem 1.8rem; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #d6d6e0;
}
.leave:hover { background: rgba(255,255,255,0.12); }

@media (max-width: 560px) {
  .colors { grid-template-columns: repeat(2, 1fr); }
  .activity-view { padding: 2rem 1.2rem; }
}
</style>
