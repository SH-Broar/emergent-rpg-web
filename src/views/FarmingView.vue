<script setup lang="ts">
/**
 * 농사 화면 — 텃밭에 작물을 심고, 물 주고, 수확한다.
 *
 * 흐름: 채집 노드(kind 'gather')가 농사 화면으로 repoint된다.
 *   - 텃밭이 없으면 씨앗 선택(작물 5종 카드 그리드) → 심기.
 *   - 자라는 중이면 성장 막대 + 물 상태. 물이 필요하면 물 주기 강조.
 *     막힌 동안 흐른 턴은 forfeit되므로(systems/farming.ts), 물을 주고 다른 곳을 다녀와야 자란다.
 *   - 다 자라고 물도 충족하면 수확.
 *
 * 시간 진행은 *전역 턴 경과*라 이 화면이 직접 자라게 하지 않는다 — onMounted/물 준 직후 refreshPlot으로
 *   조회 시점 정산만 한다. 상태는 run.data.plots(reactive)에 있어 computed가 자동 갱신된다.
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { colorLabel } from '@/systems/labels';
import { minutesLabel } from '@/systems/time';
import {
  CROPS,
  getCrop,
  getPlot,
  plant,
  refreshPlot,
  needsWater,
  water,
  isReady,
  harvest,
  harvestUpperChance,
  type CropDef,
  type HarvestResult,
} from '@/systems/farming';
import SceneCharacter from '@/components/SceneCharacter.vue';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

/** element → 표시 색(ActivityView 미러, 8색 전부). */
const ELEMENT_HEX: Record<string, string> = {
  fire: '#ff8e8e', water: '#8eedff', electric: '#f2e36a', iron: '#a4a4b0',
  earth: '#c2a36a', wind: '#a8e8b8', light: '#f6e8b8', dark: '#c08eff',
};
function elementHex(el: string): string { return ELEMENT_HEX[el] ?? '#b6b6c4'; }

const nodeId = computed(() => run.data.currentNodeId);

/** 화면 갱신 트리거 — plant/water/harvest 후 ++. (run.data.plots도 reactive지만 명시 트리거로 안전.) */
const tick = ref(0);

/** 현재 노드 라벨(GatherView/ActivityView 미러). 미상이면 '텃밭'. */
const map = computed(() => data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? ''));
const currentNode = computed(() => map.value?.nodes.find((n: { id: string }) => n.id === nodeId.value));
const nodeLabel = computed(() => currentNode.value?.label ?? '텃밭');

const lifeLevel = computed(() => run.data.lifeLevel ?? 1);

/** 현재 노드 텃밭(반응형). tick에 의존시켜 액션 후 재평가. */
const plot = computed(() => {
  void tick.value;
  return getPlot(nodeId.value);
});

/** 텃밭 작물 정의. */
const plotCrop = computed<CropDef | undefined>(() => {
  const p = plot.value;
  return p ? getCrop(p.cropId) : undefined;
});

/** 지금 물이 필요한가. */
const wantsWater = computed(() => {
  void tick.value;
  return plot.value ? needsWater(nodeId.value) : false;
});

/** 수확 가능한가. */
const ready = computed(() => {
  void tick.value;
  return plot.value ? isReady(nodeId.value) : false;
});

/** 성장 진행 퍼센트(막대용). */
const growPct = computed(() => {
  const p = plot.value;
  if (!p || p.growTurns <= 0) return 0;
  return Math.round(Math.min(1, p.growthProgress / p.growTurns) * 100);
});

/** 상위(상품) 산출 확률 미리보기. */
const upperChance = computed(() => {
  const c = plotCrop.value;
  return c ? harvestUpperChance(c) : 0;
});

/** 직전 수확 결과(결과 표시용). */
const lastHarvest = ref<HarvestResult | null>(null);

function doPlant(crop: CropDef) {
  if (plant(nodeId.value, crop.id)) {
    lastHarvest.value = null;
    tick.value++;
  }
}

function doWater() {
  if (water(nodeId.value)) {
    refreshPlot(nodeId.value); // 물 준 직후 정산 — 막혔던 성장 재개.
    tick.value++;
  }
}

function doHarvest() {
  const result = harvest(nodeId.value);
  if (result) {
    lastHarvest.value = result;
    tick.value++;
  }
}

/** 수확 결과 요약 문구. */
const harvestSummary = computed(() => {
  const r = lastHarvest.value;
  if (!r) return '';
  const crop = getCrop(r.cropId);
  const name = crop?.seedName.replace(' 씨앗', '') ?? '작물';
  const grade = r.upper ? '상품' : '평작';
  return `${name} ${grade} ${r.itemIds.length}개 · ${colorLabel(crop?.element)} +${r.colorGain} · 생활 경험치 +${r.lifeXp}`;
});

function leave() { router.push('/game/map'); }

onMounted(() => {
  if (!run.active) { router.push('/main'); return; }
  refreshPlot(nodeId.value); // 표시 직전 성장 정산.
  tick.value++;
});
</script>

<template>
  <SceneCharacter
    v-if="ui.debug.showPortraits"
    :mood="ready ? 'happy' : wantsWater ? 'curious' : 'idle'"
  />
  <main class="farm-view">
    <header class="hdr">
      <div class="hdr__top">
        <h1>{{ nodeLabel }} <span class="hdr__tag">텃밭</span></h1>
        <button class="back" @click="leave">← 맵으로</button>
      </div>
      <p class="life">생활 레벨 {{ lifeLevel }}</p>
    </header>

    <!-- 텃밭 없음 — 씨앗 선택 -->
    <section v-if="!plot" class="seeds">
      <p class="sub">빈 텃밭이다. 씨앗을 골라 심는다.</p>
      <p v-if="lastHarvest" class="harvest-note">방금 거둔 자리. {{ harvestSummary }}</p>
      <div class="seed-grid">
        <button
          v-for="crop in CROPS"
          :key="crop.id"
          class="seed"
          :style="{ '--hex': elementHex(crop.element) }"
          @click="doPlant(crop)"
        >
          <span class="seed__dot" :style="{ background: elementHex(crop.element) }" />
          <span class="seed__name">{{ crop.seedName }}</span>
          <span class="seed__meta">성장 {{ minutesLabel(crop.growTurns) }}</span>
          <span class="seed__meta">물 {{ crop.waterAt.length }}회</span>
        </button>
      </div>
    </section>

    <!-- 자라는 중 / 수확 가능 -->
    <section v-else class="plot">
      <div class="plot__head">
        <span class="plot__dot" :style="{ background: elementHex(plotCrop?.element ?? '') }" />
        <h2>{{ plotCrop?.seedName.replace(' 씨앗', '') ?? '작물' }}</h2>
      </div>

      <div class="bar">
        <div class="bar__fill" :style="{ width: growPct + '%', background: elementHex(plotCrop?.element ?? '') }" />
      </div>
      <p class="bar__label">성장 {{ plot.growthProgress }} / {{ plot.growTurns }} · 물 {{ plot.wateredCount }} / {{ plot.waterAt.length }}회</p>

      <!-- 수확 가능 -->
      <template v-if="ready">
        <p class="hint">다 자랐다. 거둘 수 있다.</p>
        <p class="preview">상품 확률 {{ upperChance }}%</p>
        <button class="action action--harvest" @click="doHarvest">수확</button>
      </template>

      <!-- 물이 필요 -->
      <template v-else-if="wantsWater">
        <p class="hint hint--water">물이 마른다. 물을 줘야 다시 자란다.</p>
        <button class="action action--water" @click="doWater">물 주기</button>
      </template>

      <!-- 자라는 중 (물 충분) -->
      <template v-else>
        <p class="hint">자라고 있다. 다른 곳을 다녀오면 그만큼 자란다.</p>
        <p class="preview">상품 확률 {{ upperChance }}%</p>
        <button class="action action--leave" @click="leave">다녀오기</button>
      </template>
    </section>
  </main>
</template>

<style scoped>
.farm-view { max-width: 680px; margin: 0 auto; padding: 3rem 2rem; min-height: 100vh; min-height: 100dvh; }
.hdr__top { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
.hdr h1 { color: #f0d68e; margin: 0 0 0.3rem; }
.hdr__tag { font-size: 0.78rem; font-weight: 600; color: #a8e88e; border: 1px solid rgba(168,232,142,0.4); border-radius: 5px; padding: 0.12rem 0.5rem; margin-left: 0.4rem; vertical-align: middle; }
.back {
  padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font: inherit; font-size: 0.88rem;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #d6d6e0; white-space: nowrap;
}
.back:hover { background: rgba(255,255,255,0.12); }
.life { color: #a8e88e; font-size: 0.9rem; margin: 0 0 1.6rem; }

.sub { color: #9a9aa8; font-size: 0.92rem; margin: 0 0 1.4rem; line-height: 1.5; }
.harvest-note { color: #c2a36a; font-size: 0.86rem; margin: -0.8rem 0 1.4rem; }

.seed-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.7rem; }
.seed {
  display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
  padding: 1rem 0.5rem; border-radius: 10px; cursor: pointer; font: inherit; color: inherit;
  background: rgba(255,255,255,0.04);
  border: 2px solid color-mix(in srgb, var(--hex) 35%, transparent);
}
.seed:hover { background: color-mix(in srgb, var(--hex) 14%, transparent); border-color: var(--hex); }
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

@media (max-width: 560px) {
  .farm-view { padding: 2rem 1.2rem; }
  .seed-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
