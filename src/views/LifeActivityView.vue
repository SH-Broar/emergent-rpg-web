<script setup lang="ts">
/** Production continues during world travel; care improves quality and quantity. */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { colorLabel } from '@/systems/labels';
import { eulReul, iGa } from '@/systems/josa';
import { remainingTimeLabel } from '@/systems/time';
import { lifeCapabilities, productionDuration, productionYield, PRODUCTION_MODES, type ProductionMode } from '@/systems/life-production';
import LifeMasteryPanel from '@/components/LifeMasteryPanel.vue';
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
  plotStatus,
  plotUpperChance,
  plotMinimumYield,
  hasAutomaticCare,
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
  REPEAT_COOLDOWN,
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
import GatherRhythm from '@/components/gather/GatherRhythm.vue';

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
const siteDestroyed = computed(() => {
  const site = run.data.interactionWorld?.entities['life:' + nodeId.value];
  return !!site && (site.properties.integrity ?? 0) <= 0;
});
const productionMode = ref<ProductionMode>('standard');
const automaticCare = computed(() => hasAutomaticCare(nodeId.value));
const currentStatus = computed(() => plotStatus(nodeId.value));
const minimumYield = computed(() => plotMinimumYield(nodeId.value));
const productionLabel = computed(() => PRODUCTION_MODES.find(mode => mode.id === plot.value?.productionMode)?.name ?? '기본 생산');
function durationFor(turns: number): string {
  const mode = lifeCapabilities(lifeLevel.value).specialization ? productionMode.value : 'standard';
  return remainingTimeLabel(productionDuration(turns, mode));
}

/** 이 노드에 배정된 생활 활동(권역 결정적). */
const activity = computed(() => activityForNode(nodeId.value, currentNode.value?.region));
const isDelayed = computed(() => activity.value.type === 'delayed');

// === 정성껏(재료 사용) — 상점에서 산 재료를 들이면 상품 확률을 높인다(item 8, 골드 sink). ===
/** 생활 활동 강화 재료 id(상점 구매). */
const ENHANCE_MATERIAL_ID = 'i-material-common';
/** 정성껏 시 상위확률 추가 보너스(%p) — 상품 확률 +50%p. */
const materialName = computed(() => data.items.get(ENHANCE_MATERIAL_ID)?.name ?? '재료');
const materialCount = computed(() => { void tick.value; return run.data.items.filter((i) => i.id === ENHANCE_MATERIAL_ID).length; });
const hasMaterial = computed(() => materialCount.value > 0);
/** 이번 행동이 정성껏(재료 소비)인가 — 미니게임 done/skip 시 finishAction이 읽는다. */
const pendingEnhanced = ref(false);
// ============================================================================
// 미니게임 (스킬 표현) — 산출 순간에 띄워 점수→상위확률 보너스. 닫으면 즉시 산출 폴백.
// ----------------------------------------------------------------------------

/** 활동 노드 권역의 tier(1~6). 미니게임 난이도 스케일 — GatherView와 동일 모델. */
const regionTier = computed<number>(() => {
  const node = currentNode.value;
  const region = node?.region ? map.value?.regions.find((r) => r.id === node.region) : undefined;
  const t = region?.tier ?? 1;
  return t < 1 ? 1 : t > 6 ? 6 : t;
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
const rhythmParams = computed(() => {
  const t = regionTier.value;
  // 비트 수 T1 1 → T6 3, 속도(횡단 ms) T1 1100 → 깊을수록 빨라짐(어려움).
  return { beats: Math.min(3, Math.max(1, Math.ceil(t / 2))), speedMs: Math.max(520, 1200 - t * 110) };
});

/** 미니게임 모달이 열려 있는가 + 어떤 종류 + 어떤 산출(수확/반복)에 연결되는가. */
const minigameOpen = ref(false);
const minigameKind = ref<LifeMinigame>('tap');
const pendingAction = ref<'plant' | 'harvest' | 'repeat' | null>(null);

/**
 * 미니게임을 띄운다. 지연형은 *심을 때*('plant') 미니게임을 해 보너스를 텃밭에 적립하고(item 3),
 * 반복형은 수행 직전('repeat'), (구) 수확 경로('harvest')는 보존.
 */
function openMinigame(action: 'plant' | 'harvest' | 'repeat') {
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

/** 보너스를 실어 실제 행동(심기/수확/반복)을 수행하고 모달을 닫는다. 정성껏이면 재료 소비 + 보너스 가산. */
function finishAction(upperBonus: number) {
  const action = pendingAction.value;
  const enhanceMaterialId = pendingEnhanced.value ? ENHANCE_MATERIAL_ID : undefined;
  pendingEnhanced.value = false;
  minigameOpen.value = false;
  pendingAction.value = null;
  if (action === 'plant') runPlant(upperBonus, enhanceMaterialId);
  else if (action === 'harvest') runHarvest(upperBonus);
  else if (action === 'repeat') runRepeat(upperBonus, enhanceMaterialId);
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

/** 선택 돌봄 기회가 있는가. */
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
  return Math.round(Math.min(1, (p.growTurns - currentStatus.value.remaining) / p.growTurns) * 100);
});

/** 상위(상품) 산출 확률 미리보기 — delayed. */
const delayedUpperChance = computed(() => {
  const c = plotCrop.value ?? activityCrop.value;
  return plot.value ? plotUpperChance(nodeId.value) : c ? harvestUpperChance(c) : 0;
});

/** 빈자리에 심을 작물의 돌봄 라벨/명사. */
const careLabel = computed(() => careLabelFor(plotCrop.value ?? activityCrop.value));
const careCost = computed(() => {
  const cropId = plotCrop.value?.id;
  if (cropId === 'crop-grain' || cropId === 'crop-mush') return '물 1개 사용';
  if (cropId === 'crop-char') return '숯 1개 사용';
  return '배치와 상태 조정';
});
const plotLabel = computed(() => plotLabelFor(plotCrop.value ?? activityCrop.value));

/** 직전 수확 결과. */
const lastHarvest = ref<HarvestResult | null>(null);

/** 심기 클릭 → 미니게임을 *먼저* 띄운다(item 3: 지연형은 시작할 때 솜씨를 발휘, 결과는 수확 때 반영). */
function doPlant() {
  if (!activityCrop.value) return;
  pendingEnhanced.value = false;
  openMinigame('plant');
}

/** 정성껏 심기(item 8) — 재료 1개를 들여 상품을 거의 보장. 재료 없으면 무효(버튼 비활성). */
function doPlantFine() {
  if (!activityCrop.value || !hasMaterial.value) return;
  pendingEnhanced.value = true;
  openMinigame('plant');
}

/** 실제 심기(미니게임 보너스를 텃밭에 적립). 미니게임 done/skip에서만 호출. */
function runPlant(bonus: number, enhanceMaterialId?: string) {
  const crop = activityCrop.value;
  if (crop && plant(nodeId.value, crop.id, bonus, productionMode.value, enhanceMaterialId)) {
    lastHarvest.value = null;
    tick.value++;
  }
}

function doCare() {
  if (water(nodeId.value)) {
    refreshPlot(nodeId.value); // 선택 돌봄 이후 표시 갱신.
    tick.value++;
  }
}

/** 수확 — 미니게임은 *심을 때* 이미 했으므로(item 3) 여기서는 바로 거둔다(텃밭에 적립된 보너스 반영). */
function doHarvest() {
  runHarvest(0);
}

/** 실제 수확(인자 보너스 + 텃밭 적립 보너스는 harvest 내부에서 가산). */
function runHarvest(upperBonus: number) {
  const result = harvest(nodeId.value, upperBonus);
  if (result) {
    lastHarvest.value = result;
    tick.value++;
    // 수확 전리품을 보상 패널로 — 요약을 라인으로 분해(컬러 팝은 별개로 유지). (2026-07-02)
    ui.pushRewardPanel({ title: '수확', lines: harvestSummary.value.split(' · ') });
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
  pendingEnhanced.value = false;
  openMinigame('repeat');
}

/** 정성껏 수행(item 8) — 재료 1개를 들여 상품을 거의 보장. 재료 없으면 무효(버튼 비활성). */
function doRepeatFine() {
  if (!hasMaterial.value) return;
  pendingEnhanced.value = true;
  openMinigame('repeat');
}

/** 실제 반복 수행(보너스 반영). 미니게임 done/skip에서만 호출. */
function runRepeat(upperBonus: number, enhanceMaterialId?: string) {
  const result = performRepeat(nodeId.value, activity.value, upperBonus, enhanceMaterialId);
  if (result) {
    lastRepeat.value = result;
    tick.value++;
    // 반복 산출을 보상 패널로 — 요약을 라인으로 분해(컬러 팝은 별개로 유지). (2026-07-02)
    ui.pushRewardPanel({ title: '수확', lines: repeatSummary.value.split(' · ') });
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
      <p class="life">생활 레벨 {{ lifeLevel }} · 생산·돌봄·수확은 각각 {{ remainingTimeLabel(1) }}</p>
    </header>

    <LifeMasteryPanel v-model="productionMode" :show-modes="isDelayed && !plot" />

    <!-- ===== 지연형 (농사 엔진) ===== -->
    <section v-if="siteDestroyed" class="plot"><p class="hint">생산지가 파괴되어 사용할 수 없습니다. 남아 있던 생산도 멈췄습니다.</p><button class="action" @click="leave">지도로 돌아가기</button></section>
    <template v-else-if="isDelayed">
      <!-- 빈자리 — 시작 -->
      <section v-if="!plot" class="start">
        <p class="sub">{{ plotLabel }}{{ iGa(plotLabel) }} 비어 있다. {{ activity.name }}{{ eulReul(activity.name) }} 시작한다.</p>
        <p v-if="lastHarvest" class="harvest-note">방금 거둔 자리. {{ harvestSummary }}</p>
        <div class="seed-row">
          <button
            class="seed seed--single"
            :style="{ '--hex': elementHex(activity.element) }"
            @click="doPlant"
          >
            <span class="seed__dot" :style="{ background: elementHex(activity.element) }" />
            <span class="seed__name">{{ activityCrop?.seedName ?? activity.name }}</span>
            <span class="seed__meta">완성 {{ durationFor(activityCrop?.growTurns ?? 0) }}</span>
            <span class="seed__meta">돌봄 없이도 완성</span>
          </button>
          <button
            class="seed seed--single seed--fine"
            :disabled="!hasMaterial"
            @click="doPlantFine"
          >
            <span class="seed__dot seed__dot--fine" />
            <span class="seed__name">정성껏 심기</span>
            <span class="seed__meta">{{ materialName }} 1 소모</span>
            <span class="seed__meta">상품 확률 +50%p</span>
          </button>
        </div>
        <p class="preview">기본 산출 2개 · 수확 시 생활 경험치 +1~2. 원정 중에도 자라고, 완성 후 자연히 시들지는 않지만, 다른 이도 이곳을 이용할 수 있습니다.</p>
        <p class="mat-line">보유 재료: {{ materialName }} {{ materialCount }} <span class="mat-line__hint">(상점에서 구매)</span></p>
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
        <p class="bar__label">{{ productionLabel }} · {{ ready ? '완성 · 현장 보관 중' : '완성까지 ' + remainingTimeLabel(currentStatus.remaining) }} · 선택 돌봄 {{ plot.wateredCount }} / {{ plot.waterAt.length }}회</p>
        <p v-if="automaticCare" class="preview">보존 관리가 적용됩니다. 떠나 있는 동안 선택 돌봄도 자동으로 이루어집니다.</p>
        <p class="preview">상품 확률 {{ delayedUpperChance }}% · {{ ready ? '보관 중인 산출' : '현재 보장 산출' }} {{ minimumYield }}개 <span v-if="!ready">(상품이면 +1개)</span></p>

        <p v-if="ready" class="hint">생산이 끝나 이곳에 보관 중입니다. 다른 이가 가져가면 남은 양만 수확합니다.</p>
        <p v-else class="hint">세계 시간이 흐르는 동안 계속 생산됩니다. 다른 이도 이곳의 생산을 돌보거나 수확할 수 있습니다.</p>
        <button v-if="wantsCare" class="action action--water" @click="doCare">{{ careLabel }} (선택: {{ careCost }} · 품질과 산출 증가)</button>
        <button v-if="ready" class="action action--harvest" @click="doHarvest">수확</button>
        <button class="action action--leave" @click="leave">원정 다녀오기</button>
      </section>
    </template>

    <!-- ===== 반복형 (즉시 산출 + 쿨다운) ===== -->
    <template v-else>
      <section class="repeat">
        <p class="sub">{{ activity.name }}{{ eulReul(activity.name) }} 할 수 있는 자리다.</p>
        <p v-if="lastRepeat" class="harvest-note">방금 거둔 것. {{ repeatSummary }}</p>

        <template v-if="repeatReady">
          <p class="hint">{{ activity.verb }}.</p>
          <p class="preview">상품 확률 {{ repeatChance }}% · 보장 산출 {{ productionYield(lifeLevel, false) }}개 (상품이면 +1개)</p>
          <p class="preview">수확 후 재생까지 {{ remainingTimeLabel(REPEAT_COOLDOWN) }}. 다른 곳을 다녀오면 다시 채집할 수 있습니다.</p>
          <button
            class="action action--harvest"
            :style="{ '--hex': elementHex(activity.element) }"
            @click="doRepeat"
          >{{ activity.verb }}</button>
          <button
            class="action action--fine"
            :disabled="!hasMaterial"
            @click="doRepeatFine"
          >정성껏 {{ activity.verb }} ({{ materialName }} 1 소모, 상품 ↑)</button>
          <p class="mat-line">보유 재료: {{ materialName }} {{ materialCount }} <span class="mat-line__hint">(상점에서 구매)</span></p>
        </template>

        <template v-else>
          <p class="hint hint--water">방금 다녀갔다. {{ remainingTimeLabel(cooldownLeft) }}쯤 지나야 다시 할 수 있다.</p>
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
            v-else-if="minigameKind === 'react'"
            :min-rt-ms="reactParams.minRtMs"
            :max-rt-ms="reactParams.maxRtMs"
            :targets="reactParams.targets"
            @done="onMinigameDone"
          />
          <GatherRhythm
            v-else
            :beats="rhythmParams.beats"
            :speed-ms="rhythmParams.speedMs"
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
.seed-row { display: flex; gap: 0.7rem; flex-wrap: wrap; }
.seed--fine { border-style: dashed; border-color: rgba(240,214,142,0.45); }
.seed--fine:hover:not(:disabled) { background: rgba(240,214,142,0.12); border-color: #f0d68e; }
.seed--fine .seed__name { color: #f0d68e; }
.seed--fine:disabled { opacity: 0.4; cursor: not-allowed; }
.seed__dot--fine { background: #f0d68e; }
.mat-line { color: #9a9aa8; font-size: 0.82rem; margin: 0.7rem 0 0; }
.mat-line__hint { color: #777; }

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
.action + .action { margin-top: .65rem; }
.action:hover { background: rgba(255,255,255,0.12); }
.action--harvest { background: rgba(168,232,142,0.18); border-color: rgba(168,232,142,0.5); color: #a8e88e; }
.action--harvest:hover { background: rgba(168,232,142,0.3); }
.action--water { background: rgba(142,237,255,0.16); border-color: rgba(142,237,255,0.5); color: #8eedff; }
.action--water:hover { background: rgba(142,237,255,0.28); }
.action--fine { background: rgba(240,214,142,0.16); border-color: rgba(240,214,142,0.5); color: #f0d68e; margin-top: 0.5rem; }
.action--fine:hover:not(:disabled) { background: rgba(240,214,142,0.28); }
.action--fine:disabled { opacity: 0.4; cursor: not-allowed; }

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
