<script setup lang="ts">
/**
 * 생활 활동 화면 (8색 = 8활동) — 채집 노드(kind 'gather')가 이 화면으로 repoint된다.
 *
 * 노드의 배정 활동을 activityForNode(권역 결정적 해시)로 얻어 type에 따라 분기한다:
 *  - delayed(농사·숯굽기·사냥·별빛 건조·버섯재배): farming.ts 엔진 재사용. 빈자리면 심기→성장→
 *    돌봄 게이트(careLabel)→수확. 시간 진행은 전역 턴 경과(refreshPlot이 조회 시점 정산).
 *  - repeat(낚시·채광·집전): 즉시 수행→산출. 수행하면 그 노드가 쿨다운(전역 턴) 동안 잠긴다.
 *
 * delayed의 성장/물게이트/수확 로직은 farming.ts가 그대로 담당한다(이 화면은 표시·dispatch만).
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { colorLabel } from '@/systems/labels';
import { eulReul, iGa } from '@/systems/josa';
import {
  getCrop,
  getPlot,
  plant,
  refreshPlot,
  needsWater,
  water,
  isReady,
  harvest,
  harvestUpperChance,
  careLabelFor,
  plotLabelFor,
  cropDisplayName,
  type CropDef,
  type HarvestResult,
} from '@/systems/farming';
import {
  activityForNode,
  cropForActivity,
  canDoRepeat,
  getCooldownRemaining,
  performRepeat,
  repeatUpperChance,
  minigameUpperBonus,
  type RepeatResult,
  type LifeMinigame,
} from '@/systems/life-activity';
import SceneCharacter from '@/components/SceneCharacter.vue';
import GatherTap from '@/components/gather/GatherTap.vue';
import GatherMatrix from '@/components/gather/GatherMatrix.vue';
import GatherReact from '@/components/gather/GatherReact.vue';

const router = useRouter();
const run = useRunStore();
const ui = useUiStore();
const data = useDataStore();

/** element → 표시 색(8색 전부). */
const ELEMENT_HEX: Record<string, string> = {
  fire: '#ff8e8e', water: '#8eedff', electric: '#f2e36a', iron: '#a4a4b0',
  earth: '#c2a36a', wind: '#a8e8b8', light: '#f6e8b8', dark: '#c08eff',
};
function elementHex(el: string): string { return ELEMENT_HEX[el] ?? '#b6b6c4'; }

const nodeId = computed(() => run.data.currentNodeId);

/** 화면 갱신 트리거 — 액션 후 ++. (run.data도 reactive지만 명시 트리거로 안전.) */
const tick = ref(0);

/** 현재 노드(권역 조회용). */
const map = computed(() => data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? ''));
const currentNode = computed(() => map.value?.nodes.find((n: { id: string }) => n.id === nodeId.value));
const nodeLabel = computed(() => currentNode.value?.label ?? '채집지');

const lifeLevel = computed(() => run.data.lifeLevel ?? 1);

/** 이 노드에 배정된 생활 활동(권역 결정적). */
const activity = computed(() => activityForNode(nodeId.value, currentNode.value?.region));
const isDelayed = computed(() => activity.value.type === 'delayed');

// ============================================================================
// 미니게임 (스킬 표현) — 산출 순간에 띄워 점수→상위확률 보너스. 닫으면 즉시 산출 폴백.
// ----------------------------------------------------------------------------

/** 활동 노드 권역의 tier(1~4). 미니게임 난이도 스케일 — GatherView와 동일 모델. */
const regionTier = computed<number>(() => {
  const node = currentNode.value;
  const region = node?.region ? map.value?.regions.find((r) => r.id === node.region) : undefined;
  const t = region?.tier ?? 1;
  return t < 1 ? 1 : t > 4 ? 4 : t;
});

/** tier로 미니게임 파라미터 스케일(GatherView 값 미러). */
const tapParams = computed(() => ({ targetPresses: 14 + regionTier.value * 4, timeMs: 5000 }));
const matrixParams = computed(() => {
  const gridN = Math.min(5, Math.max(3, 2 + regionTier.value));
  return { gridN, targetTimeMs: gridN * gridN * 700 };
});
const reactParams = computed(() => {
  const t = regionTier.value;
  return { minRtMs: 120, maxRtMs: 780 - t * 80, targets: Math.min(3, Math.max(1, t - 1)) };
});

/** 미니게임 모달이 열려 있는가 + 어떤 종류 + 어떤 산출(수확/반복)에 연결되는가. */
const minigameOpen = ref(false);
const minigameKind = ref<LifeMinigame>('tap');
const pendingAction = ref<'harvest' | 'repeat' | null>(null);

/** 산출 클릭 → 그 활동 미니게임을 띄운다(현 phase가 산출 가능할 때만 호출됨). */
function openMinigame(action: 'harvest' | 'repeat') {
  minigameKind.value = activity.value.minigame;
  pendingAction.value = action;
  minigameOpen.value = true;
}

/** 미니게임 종료 — 점수→보너스 적용해 실제 산출. */
function onMinigameDone(score: number, _record: string) {
  if (!minigameOpen.value) return;
  finishAction(minigameUpperBonus(score));
}

/** 미니게임 건너뛰기/닫기 — 보너스 0(기존 즉시 산출과 동일, 회귀 0). */
function skipMinigame() {
  if (!minigameOpen.value) return;
  finishAction(0);
}

/** 보너스를 실어 실제 산출을 수행하고 모달을 닫는다. */
function finishAction(upperBonus: number) {
  const action = pendingAction.value;
  minigameOpen.value = false;
  pendingAction.value = null;
  if (action === 'harvest') runHarvest(upperBonus);
  else if (action === 'repeat') runRepeat(upperBonus);
}

// ============================================================================
// 지연형 (delayed) — farming.ts 재사용
// ----------------------------------------------------------------------------

/** 이 활동의 작물 정의(delayed). */
const activityCrop = computed<CropDef | undefined>(() => cropForActivity(activity.value));

/** 현재 노드 텃밭(반응형). */
const plot = computed(() => {
  void tick.value;
  return isDelayed.value ? getPlot(nodeId.value) : undefined;
});

/** 텃밭 작물 정의(심긴 작물 기준). */
const plotCrop = computed<CropDef | undefined>(() => {
  const p = plot.value;
  return p ? getCrop(p.cropId) : undefined;
});

/** 돌봄 게이트가 지금 열려 있는가(농사=물 필요). */
const wantsCare = computed(() => {
  void tick.value;
  return plot.value ? needsWater(nodeId.value) : false;
});

/** 수확 가능한가. */
const ready = computed(() => {
  void tick.value;
  return plot.value ? isReady(nodeId.value) : false;
});

/** 성장 진행 퍼센트. */
const growPct = computed(() => {
  const p = plot.value;
  if (!p || p.growTurns <= 0) return 0;
  return Math.round(Math.min(1, p.growthProgress / p.growTurns) * 100);
});

/** 상위(상품) 산출 확률 미리보기 — delayed. */
const delayedUpperChance = computed(() => {
  const c = plotCrop.value ?? activityCrop.value;
  return c ? harvestUpperChance(c) : 0;
});

/** 빈자리에 심을 작물의 돌봄 라벨/명사. */
const careLabel = computed(() => careLabelFor(activityCrop.value));
const plotLabel = computed(() => plotLabelFor(plotCrop.value ?? activityCrop.value));

/** 직전 수확 결과. */
const lastHarvest = ref<HarvestResult | null>(null);

function doPlant() {
  const crop = activityCrop.value;
  if (crop && plant(nodeId.value, crop.id)) {
    lastHarvest.value = null;
    tick.value++;
  }
}

function doCare() {
  if (water(nodeId.value)) {
    refreshPlot(nodeId.value); // 게이트 직후 정산 — 막혔던 성장 재개.
    tick.value++;
  }
}

/** 수확 클릭 → 미니게임을 띄운다(결과로 상위확률 보너스). */
function doHarvest() {
  openMinigame('harvest');
}

/** 실제 수확(보너스 반영). 미니게임 done/skip에서만 호출. */
function runHarvest(upperBonus: number) {
  const result = harvest(nodeId.value, upperBonus);
  if (result) {
    lastHarvest.value = result;
    tick.value++;
  }
}

/** 수확 결과 요약. */
const harvestSummary = computed(() => {
  const r = lastHarvest.value;
  if (!r) return '';
  const crop = getCrop(r.cropId);
  const name = cropDisplayName(crop);
  const grade = r.upper ? '상품' : '평작';
  return `${name} ${grade} ${r.itemIds.length}개 · ${colorLabel(crop?.element)} +${r.colorGain} · 생활 경험치 +${r.lifeXp}`;
});

// ============================================================================
// 반복형 (repeat) — 즉시 산출 + 쿨다운
// ----------------------------------------------------------------------------

/** 지금 수행 가능한가(쿨다운 만료). */
const repeatReady = computed(() => {
  void tick.value;
  return !isDelayed.value ? canDoRepeat(nodeId.value) : false;
});

/** 쿨다운 남은 전역 턴. */
const cooldownLeft = computed(() => {
  void tick.value;
  return !isDelayed.value ? getCooldownRemaining(nodeId.value) : 0;
});

/** 상위 산출 확률 — repeat. */
const repeatChance = computed(() => repeatUpperChance(activity.value));

/** 직전 반복 수행 결과. */
const lastRepeat = ref<RepeatResult | null>(null);

/** 수행 클릭 → 미니게임을 띄운다(결과로 상위확률 보너스). */
function doRepeat() {
  openMinigame('repeat');
}

/** 실제 반복 수행(보너스 반영). 미니게임 done/skip에서만 호출. */
function runRepeat(upperBonus: number) {
  const result = performRepeat(nodeId.value, activity.value, upperBonus);
  if (result) {
    lastRepeat.value = result;
    tick.value++;
  }
}

/** 반복 수행 결과 요약. */
const repeatSummary = computed(() => {
  const r = lastRepeat.value;
  if (!r) return '';
  const grade = r.upper ? '상품' : '평작';
  return `${activity.value.name} ${grade} ${r.itemIds.length}개 · ${colorLabel(activity.value.element)} +${r.colorGain} · 생활 경험치 +${r.lifeXp}`;
});

function leave() { router.push('/game/map'); }

onMounted(() => {
  if (!run.active) { router.push('/main'); return; }
  if (isDelayed.value) refreshPlot(nodeId.value); // 표시 직전 성장 정산.
  tick.value++;
});
</script>

<template>
  <SceneCharacter
    v-if="ui.debug.showPortraits"
    :mood="(isDelayed ? ready : repeatReady) ? 'happy' : (isDelayed && wantsCare) ? 'curious' : 'idle'"
  />
  <main class="life-view">
    <header class="hdr">
      <div class="hdr__top">
        <h1>{{ nodeLabel }} <span class="hdr__tag" :style="{ '--hex': elementHex(activity.element) }">{{ activity.name }}</span></h1>
        <button class="back" @click="leave">← 맵으로</button>
      </div>
      <p class="life">생활 레벨 {{ lifeLevel }}</p>
    </header>

    <!-- ===== 지연형 (농사 엔진) ===== -->
    <template v-if="isDelayed">
      <!-- 빈자리 — 시작 -->
      <section v-if="!plot" class="start">
        <p class="sub">{{ plotLabel }}{{ iGa(plotLabel) }} 비어 있다. {{ activity.name }}{{ eulReul(activity.name) }} 시작한다.</p>
        <p v-if="lastHarvest" class="harvest-note">방금 거둔 자리. {{ harvestSummary }}</p>
        <button
          class="seed seed--single"
          :style="{ '--hex': elementHex(activity.element) }"
          @click="doPlant"
        >
          <span class="seed__dot" :style="{ background: elementHex(activity.element) }" />
          <span class="seed__name">{{ activityCrop?.seedName ?? activity.name }}</span>
          <span class="seed__meta">완성 {{ activityCrop?.growTurns ?? 0 }}턴</span>
          <span class="seed__meta">{{ careLabel }} {{ activityCrop?.waterAt.length ?? 0 }}회</span>
        </button>
      </section>

      <!-- 자라는 중 / 수확 가능 -->
      <section v-else class="plot">
        <div class="plot__head">
          <span class="plot__dot" :style="{ background: elementHex(plotCrop?.element ?? '') }" />
          <h2>{{ cropDisplayName(plotCrop) }}</h2>
        </div>

        <div class="bar">
          <div class="bar__fill" :style="{ width: growPct + '%', background: elementHex(plotCrop?.element ?? '') }" />
        </div>
        <p class="bar__label">진행 {{ plot.growthProgress }} / {{ plot.growTurns }} · {{ careLabel }} {{ plot.wateredCount }} / {{ plot.waterAt.length }}회</p>

        <!-- 수확 가능 -->
        <template v-if="ready">
          <p class="hint">다 되었다. 거둘 수 있다.</p>
          <p class="preview">상품 확률 {{ delayedUpperChance }}%</p>
          <button class="action action--harvest" @click="doHarvest">수확</button>
        </template>

        <!-- 돌봄 게이트 열림 -->
        <template v-else-if="wantsCare">
          <p class="hint hint--water">손이 필요하다. {{ careLabel }}{{ eulReul(careLabel) }} 해야 다시 자란다.</p>
          <button class="action action--water" @click="doCare">{{ careLabel }}</button>
        </template>

        <!-- 자라는 중 -->
        <template v-else>
          <p class="hint">자라고 있다. 다른 곳을 다녀오면 그만큼 자란다.</p>
          <p class="preview">상품 확률 {{ delayedUpperChance }}%</p>
          <button class="action action--leave" @click="leave">다녀오기</button>
        </template>
      </section>
    </template>

    <!-- ===== 반복형 (즉시 산출 + 쿨다운) ===== -->
    <template v-else>
      <section class="repeat">
        <p class="sub">{{ activity.name }}{{ eulReul(activity.name) }} 할 수 있는 자리다.</p>
        <p v-if="lastRepeat" class="harvest-note">방금 거둔 것. {{ repeatSummary }}</p>

        <template v-if="repeatReady">
          <p class="hint">{{ activity.verb }}.</p>
          <p class="preview">상품 확률 {{ repeatChance }}%</p>
          <button
            class="action action--harvest"
            :style="{ '--hex': elementHex(activity.element) }"
            @click="doRepeat"
          >{{ activity.verb }}</button>
        </template>

        <template v-else>
          <p class="hint hint--water">방금 다녀갔다. {{ cooldownLeft }}턴쯤 지나야 다시 할 수 있다.</p>
          <button class="action action--leave" @click="leave">다녀오기</button>
        </template>
      </section>
    </template>

    <!-- ===== 미니게임 모달 (스킬 표현) ===== -->
    <div v-if="minigameOpen" class="mg-overlay" @click.self="skipMinigame">
      <div class="mg-modal">
        <header class="mg-modal__hdr">
          <h2>{{ activity.name }}</h2>
          <button class="mg-modal__skip" @click="skipMinigame">건너뛰기</button>
        </header>
        <p class="mg-modal__hint">잘할수록 상품이 나올 확률이 오른다.</p>
        <div class="mg-modal__body">
          <GatherTap
            v-if="minigameKind === 'tap'"
            :target-presses="tapParams.targetPresses"
            :time-ms="tapParams.timeMs"
            @done="onMinigameDone"
          />
          <GatherMatrix
            v-else-if="minigameKind === 'matrix'"
            :grid-n="matrixParams.gridN"
            :target-time-ms="matrixParams.targetTimeMs"
            @done="onMinigameDone"
          />
          <GatherReact
            v-else
            :min-rt-ms="reactParams.minRtMs"
            :max-rt-ms="reactParams.maxRtMs"
            :targets="reactParams.targets"
            @done="onMinigameDone"
          />
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.life-view { max-width: 680px; margin: 0 auto; padding: 3rem 2rem; min-height: 100vh; min-height: 100dvh; }
.hdr__top { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
.hdr h1 { color: #f0d68e; margin: 0 0 0.3rem; }
.hdr__tag { font-size: 0.78rem; font-weight: 600; color: var(--hex, #a8e88e); border: 1px solid color-mix(in srgb, var(--hex, #a8e88e) 40%, transparent); border-radius: 5px; padding: 0.12rem 0.5rem; margin-left: 0.4rem; vertical-align: middle; }
.back {
  padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font: inherit; font-size: 0.88rem;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #d6d6e0; white-space: nowrap;
}
.back:hover { background: rgba(255,255,255,0.12); }
.life { color: #a8e88e; font-size: 0.9rem; margin: 0 0 1.6rem; }

.sub { color: #9a9aa8; font-size: 0.92rem; margin: 0 0 1.4rem; line-height: 1.5; }
.harvest-note { color: #c2a36a; font-size: 0.86rem; margin: -0.8rem 0 1.4rem; }

.seed--single {
  display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
  width: 100%; max-width: 220px; padding: 1.4rem 0.5rem; border-radius: 10px; cursor: pointer; font: inherit; color: inherit;
  background: rgba(255,255,255,0.04);
  border: 2px solid color-mix(in srgb, var(--hex) 35%, transparent);
}
.seed--single:hover { background: color-mix(in srgb, var(--hex) 14%, transparent); border-color: var(--hex); }
.seed__dot { width: 12px; height: 12px; border-radius: 50%; margin-bottom: 0.15rem; }
.seed__name { font-weight: 600; color: var(--hex); font-size: 0.95rem; }
.seed__meta { font-size: 0.76rem; color: #9a9aa8; }

.plot__head { display: flex; align-items: center; gap: 0.5rem; margin: 0.6rem 0 1.2rem; }
.plot__dot { width: 14px; height: 14px; border-radius: 50%; }
.plot__head h2 { margin: 0; color: #d6d6e0; font-size: 1.3rem; }

.bar { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.07); overflow: hidden; }
.bar__fill { height: 100%; border-radius: 8px; transition: width 240ms ease; }
.bar__label { color: #b6b6c4; font-size: 0.86rem; font-variant-numeric: tabular-nums; margin: 0.6rem 0 1.4rem; }

.hint { color: #d6d6e0; font-size: 1rem; margin: 0 0 0.6rem; line-height: 1.5; }
.hint--water { color: #8eedff; }
.preview { color: #9a9aa8; font-size: 0.88rem; margin: 0 0 1.4rem; }

.action {
  width: 100%; padding: 0.95rem; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #d6d6e0;
}
.action:hover { background: rgba(255,255,255,0.12); }
.action--harvest { background: rgba(168,232,142,0.18); border-color: rgba(168,232,142,0.5); color: #a8e88e; }
.action--harvest:hover { background: rgba(168,232,142,0.3); }
.action--water { background: rgba(142,237,255,0.16); border-color: rgba(142,237,255,0.5); color: #8eedff; }
.action--water:hover { background: rgba(142,237,255,0.28); }

/* ===== 미니게임 모달 ===== */
.mg-overlay {
  position: fixed; inset: 0; z-index: var(--z-overlay, 990);
  background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}
.mg-modal {
  width: 100%; max-width: 460px; border-radius: 16px; padding: 1.4rem 1.6rem 1.8rem;
  background: #1b1b24; border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 18px 48px rgba(0,0,0,0.5);
}
.mg-modal__hdr { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
.mg-modal__hdr h2 { margin: 0; color: #f0d68e; font-size: 1.2rem; }
.mg-modal__skip {
  padding: 0.4rem 0.9rem; border-radius: 8px; cursor: pointer; font: inherit; font-size: 0.84rem;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #b6b6c4; white-space: nowrap;
}
.mg-modal__skip:hover { background: rgba(255,255,255,0.12); }
.mg-modal__hint { color: #9a9aa8; font-size: 0.88rem; margin: 0.4rem 0 1.2rem; }
.mg-modal__body { padding-top: 0.4rem; }

@media (max-width: 560px) {
  .life-view { padding: 2rem 1.2rem; }
}
</style>
