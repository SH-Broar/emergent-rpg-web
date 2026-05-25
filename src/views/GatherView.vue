<script setup lang="ts">
/**
 * 채집 화면 — 미니게임으로 보상의 *질*을 정한다.
 *
 * 흐름: 채집 노드 진입 → 3종 미니게임 중 랜덤 1종(run rng, 마운트 1회 고정) 플레이 →
 *   점수(0..1)로 보상 배수 + 점수 >= tier 임계면 후반 보너스. (performGather가 처리.)
 * 노드당 1회(gatherDone). 하루 경과 시 노드 리프레시로 재개방.
 *
 * 난이도 = 권역 tier: 깊을수록 연타 목표↑·매트릭스 칸수↑/시간↓·반응 창↓, 그리고 후반 임계↑.
 * 보상은 토스트로 표시(기존 채집과 동일한 결).
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { rng } from '@/systems/rng';
import { performGather, isGatherDone, gatherScoreThreshold } from '@/systems/gathering';
import GatherTap from '@/components/gather/GatherTap.vue';
import GatherMatrix from '@/components/gather/GatherMatrix.vue';
import GatherReact from '@/components/gather/GatherReact.vue';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();

type GameKind = 'tap' | 'matrix' | 'react';

const map = computed(() => data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? ''));
const currentNode = computed(() => map.value?.nodes.find((n: { id: string }) => n.id === run.data.currentNodeId));
const nodeName = computed(() => currentNode.value?.label ?? '채집');

/** 채집 노드 권역의 tier(1~4). 미상이면 1. */
const regionTier = computed<number>(() => {
  const node = currentNode.value;
  const region = node?.region ? map.value?.regions.find((r) => r.id === node.region) : undefined;
  const t = region?.tier ?? 1;
  return t < 1 ? 1 : t > 4 ? 4 : t;
});

const diffLabel = computed<string>(() => {
  const t = regionTier.value;
  return t >= 4 ? '상' : t === 3 ? '중' : '하';
});

/** 후반 보너스 임계(표시용 %). */
const thresholdPct = computed(() => Math.round(gatherScoreThreshold(regionTier.value) * 100));

const alreadyDone = ref(false);
const phase = ref<'play' | 'result'>('play');
const chosen = ref<GameKind>('tap');
const finalScore = ref(0);
const reachedLate = ref(false);

/** tier로 미니게임 파라미터를 스케일. 깊을수록 어렵다. */
const tapParams = computed(() => {
  const t = regionTier.value;
  // 목표 연타수: T1 18 → T4 30. 시간은 5초 고정.
  return { targetPresses: 14 + t * 4, timeMs: 5000 };
});
const matrixParams = computed(() => {
  const t = regionTier.value;
  // 칸수: T1 3 → T4 6(상한 9). 목표 시간: T1 4.5s → T4 3.0s.
  const count = Math.min(9, 2 + t);
  const targetTimeMs = Math.round(5000 - t * 500);
  return { count, targetTimeMs };
});
const reactParams = computed(() => {
  const t = regionTier.value;
  // 반응 창(maxRt): T1 700ms → T4 460ms. min은 120ms 고정.
  return { minRtMs: 120, maxRtMs: 780 - t * 80 };
});

function onGameDone(score: number) {
  if (phase.value !== 'play') return;
  finalScore.value = score;
  reachedLate.value = score >= gatherScoreThreshold(regionTier.value);
  // 점수로 보상 배수 + 후반 분기 적용. (done 마킹 포함.)
  performGather(run.data.currentNodeId, score);
  phase.value = 'result';
}

const scorePct = computed(() => Math.round(Math.min(1.2, Math.max(0, finalScore.value)) * 100));
const gradeLabel = computed(() => {
  const p = scorePct.value;
  if (p >= 100) return '훌륭해!';
  if (p >= gatherScoreThreshold(regionTier.value) * 100) return '제법인걸!';
  if (p >= 40) return '그럭저럭.';
  return '아쉬워…';
});

function leave() { router.push('/game/map'); }

onMounted(() => {
  if (!run.active) { router.push('/main'); return; }
  // 채집은 *노드당 1회*. 이미 다녀갔으면 안내만.
  if (isGatherDone(run.data.currentNodeId)) { alreadyDone.value = true; return; }
  // 미니게임 1종 무작위(run rng, 마운트 1회 고정).
  const kinds: GameKind[] = ['tap', 'matrix', 'react'];
  chosen.value = kinds[Math.floor(rng() * kinds.length)];
});
</script>

<template>
  <main class="gather-view">
    <section v-if="alreadyDone" class="done">
      <h1>{{ nodeName }}</h1>
      <p class="done__msg">이미 다녀간 채집이다. 하루가 지나면 다시 거둘 수 있다.</p>
      <button class="leave" @click="leave">계속 →</button>
    </section>

    <section v-else class="gather">
      <header class="hdr">
        <h1>{{ nodeName }} <span class="diff" :class="`diff--${diffLabel}`">난이도 {{ diffLabel }}</span></h1>
        <p class="sub">잘 해낼수록 더 좋은 것을 거둔다. 점수 {{ thresholdPct }}% 이상이면 귀한 것도 나온다!</p>
      </header>

      <!-- 미니게임 -->
      <div v-if="phase === 'play'" class="play">
        <GatherTap
          v-if="chosen === 'tap'"
          :target-presses="tapParams.targetPresses"
          :time-ms="tapParams.timeMs"
          @done="onGameDone"
        />
        <GatherMatrix
          v-else-if="chosen === 'matrix'"
          :count="matrixParams.count"
          :target-time-ms="matrixParams.targetTimeMs"
          @done="onGameDone"
        />
        <GatherReact
          v-else
          :min-rt-ms="reactParams.minRtMs"
          :max-rt-ms="reactParams.maxRtMs"
          @done="onGameDone"
        />
      </div>

      <!-- 결과 -->
      <div v-else class="result">
        <div class="result__score" :class="{ 'result__score--late': reachedLate }">{{ scorePct }}%</div>
        <p class="result__grade">{{ gradeLabel }}</p>
        <p class="result__reward">
          {{ reachedLate ? '귀한 것까지 거뒀다! 획득물은 알림을 참고.' : '거둘 만큼 거뒀다. 획득물은 알림을 참고.' }}
        </p>
        <button class="leave" @click="leave">계속 →</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.gather-view { max-width: 680px; margin: 0 auto; padding: 3rem 2rem; min-height: 100vh; min-height: 100dvh; }
.hdr h1, .done h1 { color: #f0d68e; margin: 0 0 0.4rem; }
.diff { font-size: 0.78rem; font-weight: 600; padding: 0.12rem 0.5rem; border-radius: 5px; margin-left: 0.5rem; white-space: nowrap; }
.diff--하 { color: #8effb8; border: 1px solid rgba(142,255,184,0.45); }
.diff--중 { color: #f2e36a; border: 1px solid rgba(242,227,106,0.45); }
.diff--상 { color: #ff8e8e; border: 1px solid rgba(255,142,142,0.45); }
.sub { color: #9a9aa8; font-size: 0.92rem; margin: 0 0 1.8rem; line-height: 1.5; }
.done__msg { color: #b6b6c4; margin: 1rem 0 2rem; line-height: 1.5; }

.play { padding: 1rem 0; }

.result { text-align: center; padding: 1.4rem 0; }
.result__score {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 160px; padding: 1.2rem 1.6rem; border-radius: 18px;
  font-size: 3.4rem; font-weight: 800; font-variant-numeric: tabular-nums;
  background: rgba(255,255,255,0.05); border: 2px solid rgba(168,232,142,0.4); color: #a8e88e;
}
.result__score--late { border-color: #f0d68e; color: #f6e8b8; }
.result__grade { font-size: 1.2rem; color: #d6d6e0; margin: 1rem 0 0.4rem; font-weight: 700; }
.result__reward { color: #9a9aa8; font-size: 0.9rem; margin: 0 0 1.6rem; }

.leave {
  padding: 0.8rem 1.8rem; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #d6d6e0;
}
.leave:hover { background: rgba(255,255,255,0.12); }

@media (max-width: 560px) {
  .gather-view { padding: 2rem 1.2rem; }
}
</style>
