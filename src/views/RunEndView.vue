<script setup lang="ts">
/**
 * 런 종료 정리(요약) 화면 — *모든* 종료 경로의 합류점.
 *
 * 사망(hp-zero)·시간 만료(time-up)·자유 종료(free-end)·보스 승패(boss-cleared/defeated)
 * 어느 쪽이든 endRun() 후 여기로 push되어, 이 화면에서
 *   ① 어디서·왜 끝났는지
 *   ② 외부(메타)로 가져간 히페리온/연구/영혼
 *   ③ 행적(동료·도달·전투/보스·획득 카드/유물)
 * 을 한 번에 보여주고, 그때 *한 번만* 메타에 흡수한다.
 *
 * 흡수 중복 가드: absorbRunIntoMeta가 run.metaAbsorbed로 1회만 적용.
 *   화면이 새로고침/재마운트돼도 게이지가 부풀지 않음 (표시값만 재계산).
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useMetaStore } from '@/stores/meta';
import { unlockKeyLabel, endReasonText } from '@/systems/labels';
import { computeChaosScore } from '@/systems/chaos';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const meta = useMetaStore();

interface AbsorbResult {
  granted: { key: string }[];
  soulGain: number;
  hyperionGain: number;
  researchGain: number;
}

const result = ref<AbsorbResult | null>(null);
const timeline = computed(() => data.timelines.get(run.data.timelineId));
const race = computed(() => data.races.get(run.data.raceId));

// === 종료 위치 (노드 라벨 + 권역명) ===
const endNode = computed(() => {
  const map = data.nodeMaps.get(timeline.value?.nodeMapId ?? '');
  if (!map) return undefined;
  const node = map.nodes.find((n) => n.id === run.data.currentNodeId);
  if (!node) return undefined;
  const region = map.regions.find((rg) => rg.id === node.region);
  return { label: node.label, regionName: region?.name };
});

// === 행적: 동료 (Item 37-② — roster 기준, 그 런에 영입한 동료 전체) ===
const companionNames = computed(() =>
  (run.data.roster ?? [])
    .map((e) => (e.src === 'npc' ? data.npcs.get(e.id)?.name : undefined) ?? e.id)
    .filter((n): n is string => !!n),
);

// === 행적: 도달 권역 (방문 노드들이 속한 distinct 권역) ===
const reachedRegions = computed<string[]>(() => {
  const map = data.nodeMaps.get(timeline.value?.nodeMapId ?? '');
  if (!map) return [];
  const nodeById = new Map(map.nodes.map((n) => [n.id, n]));
  const regionNameById = new Map(map.regions.map((rg) => [rg.id, rg.name]));
  const seen = new Set<string>();
  const names: string[] = [];
  for (const nid of run.data.visitedNodes) {
    const regionId = nodeById.get(nid)?.region;
    if (!regionId || seen.has(regionId)) continue;
    seen.add(regionId);
    const name = regionNameById.get(regionId);
    if (name) names.push(name);
  }
  return names;
});

// === 행적: 전투 ===
const combatCleared = computed(
  () => Object.values(run.data.nodeStates).filter((s) => s.combatCleared).length,
);
const bossNames = computed(() =>
  run.data.bossesCleared
    .map((id) => data.bosses.get(id)?.name ?? id)
    .filter((n): n is string => !!n),
);

// === 행적: 획득 카드 (등급별 색 + 동명 카드 ×N 묶음) ===
const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
function rankColor(rank: string): string {
  return rankColors[rank] ?? '#a4a4b0';
}

const collectedCards = computed(() => {
  const groups = new Map<string, { name: string; rank: string; count: number }>();
  for (const c of run.data.collection) {
    const key = `${c.id}:${c.rank}`;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { name: c.name, rank: c.rank, count: 1 });
  }
  return Array.from(groups.values());
});

const collectedRelics = computed(() => run.data.relics.map((r) => r.name));

// === 카오스 도전 점수 ===
/** 이번 런의 카오스 점수 — 캐시 우선, 없으면 활성 카오스로 재계산. */
const chaosScore = computed(() =>
  run.data.chaosScore ?? computeChaosScore(run.data.activeChaos ?? []),
);
/** 클리어(보스 처치) 여부. */
const wasClear = computed(() => run.data.endReason === 'boss-cleared' || run.data.bossesCleared.length > 0);
/** 신기록 — 클리어 + 점수>0 + 연표 최고 기록과 일치(클리어 시 recordBestChaos가 이미 갱신). */
const isNewRecord = computed(() => {
  if (!wasClear.value || chaosScore.value <= 0) return false;
  const best = meta.bestChaosScore[run.data.timelineId] ?? 0;
  return chaosScore.value >= best;
});

function returnMain() {
  // 요약 표시가 끝난 *후에만* 런 전체 초기화.
  run.reset();
  router.push('/main');
}

onMounted(async () => {
  if (!run.data.ended) {
    router.push('/main');
    return;
  }
  // 메타 흡수 — metaAbsorbed 가드로 런당 1회만 게이지/영혼 적용.
  // 재마운트 시에도 호출되지만, 가드 덕에 표시값만 재계산되고 게이지는 건드리지 않음.
  // 방어: 흡수가 실패해도 종료 화면(요약/돌아가기)은 반드시 렌더되도록 try/catch.
  try {
    const { absorbRunIntoMeta } = await import('@/systems/progression');
    result.value = absorbRunIntoMeta(run.data);
  } catch (err) {
    console.error('[RunEndView] absorbRunIntoMeta 실패 — 화면은 계속 렌더:', err);
  }
});
</script>

<template>
  <main class="run-end-view">
    <h1>런 종료</h1>
    <p class="reason">{{ endReasonText(run.data.endReason) }}</p>
    <p v-if="timeline" class="tl">
      {{ timeline.name }}<span v-if="race" class="tl__race"> · {{ race.name }}</span>
    </p>
    <p class="progress">{{ run.data.currentDay }}일차 · 방문 {{ run.data.visitedNodes.length }}곳</p>

    <!-- 종료 위치 -->
    <p v-if="endNode" class="end-loc">
      여기서 끝났다. <strong>{{ endNode.label }}</strong>
      <span v-if="endNode.regionName" class="end-loc__region">({{ endNode.regionName }})</span>
    </p>

    <!-- 카오스 도전 점수 -->
    <section v-if="chaosScore > 0" class="chaos">
      <h3>카오스 도전 점수</h3>
      <div class="chaos-row">
        <span class="chaos-score">{{ chaosScore }}점</span>
        <span v-if="isNewRecord" class="chaos-badge">★ 최고 기록 갱신</span>
        <span v-else-if="!wasClear" class="chaos-note">클리어하지 못해 기록되지 않았다.</span>
      </div>
    </section>

    <!-- 획득 -->
    <section v-if="result" class="meta">
      <h3>획득</h3>
      <div class="gain-row">
        <span class="gain gain--hyperion">히페리온 +{{ result.hyperionGain }}</span>
        <span class="gain gain--research">해석 +{{ result.researchGain }}</span>
        <span class="gain gain--soul">영혼 +{{ result.soulGain }}</span>
      </div>
      <p class="meta__note">※ 해석은 추후 직접 투자 방식으로 바뀝니다.</p>
      <ul v-if="result.granted.length > 0" class="unlocks">
        <li v-for="(k, i) in result.granted" :key="i" class="unlock">해금: {{ unlockKeyLabel(k.key) }}</li>
      </ul>
    </section>

    <!-- 행적 -->
    <section class="journey">
      <h3>행적</h3>

      <!-- 동료 -->
      <div class="block">
        <span class="block__label">더불은 동료</span>
        <div v-if="companionNames.length > 0" class="chips">
          <span v-for="n in companionNames" :key="n" class="chip chip--npc">{{ n }}</span>
        </div>
        <span v-else class="block__empty">혼자였다.</span>
      </div>

      <!-- 도달 -->
      <div class="block">
        <span class="block__label">도달</span>
        <div class="block__body">
          방문 노드 {{ run.data.visitedNodes.length }}개 ·
          도달 권역 {{ reachedRegions.length }}곳
          <div v-if="reachedRegions.length > 0" class="chips">
            <span v-for="n in reachedRegions" :key="n" class="chip chip--region">{{ n }}</span>
          </div>
        </div>
      </div>

      <!-- 전투 / 보스 -->
      <div class="block">
        <span class="block__label">전투 · 보스</span>
        <div class="block__body">
          클리어 전투 {{ combatCleared }}회 ·
          처치 보스 {{ bossNames.length }}
          <div v-if="bossNames.length > 0" class="chips">
            <span v-for="n in bossNames" :key="n" class="chip chip--boss">{{ n }}</span>
          </div>
        </div>
      </div>

      <!-- 획득 카드 -->
      <div class="block">
        <span class="block__label">획득 카드 ({{ collectedCards.length }})</span>
        <div v-if="collectedCards.length > 0" class="loot">
          <div class="loot__group">
            <span
              v-for="(c, i) in collectedCards"
              :key="`${c.name}-${i}`"
              class="chip chip--card"
              :style="{ color: rankColor(c.rank), borderColor: rankColor(c.rank) }"
            >
              {{ c.name }}<span v-if="c.count > 1" class="chip__x">×{{ c.count }}</span>
            </span>
          </div>
        </div>
        <span v-else class="block__empty">가져온 카드는 없었다.</span>
      </div>

      <!-- 획득 유물 -->
      <div class="block">
        <span class="block__label">획득 유물 ({{ collectedRelics.length }})</span>
        <div v-if="collectedRelics.length > 0" class="chips">
          <span v-for="(r, i) in collectedRelics" :key="`relic-${i}`" class="chip chip--relic">
            {{ r }}
          </span>
        </div>
        <span v-else class="block__empty">가져온 유물은 없었다.</span>
      </div>
    </section>

    <p v-if="result" class="logged">이 여정은 기록에 담겼어. 메인에서 다시 들춰 볼 수 있어.</p>

    <button class="finish" @click="returnMain">메인 메뉴로 →</button>
  </main>
</template>

<style scoped>
.run-end-view {
  max-width: 600px;
  margin: 0 auto;
  padding: 3rem 2rem 4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  min-height: 100vh; min-height: 100dvh;
}
h1 { color: #c08eff; margin: 0; font-size: 2.4rem; }
.reason { color: #d6d6e0; font-style: italic; margin: 0; }
.tl { color: #888; margin: 0; }
.tl__race { color: #c08eff; }
.progress { color: #b6b6c4; margin: 0.1rem 0 0; font-size: 0.9rem; font-variant-numeric: tabular-nums; }
.logged { color: #8effb8; font-size: 0.9rem; margin: 1.2rem 0 0; text-align: center; }
.end-loc { color: #b6b6c4; margin: 0.2rem 0 0; text-align: center; }
.end-loc strong { color: #f6e8b8; }
.end-loc__region { color: #888; margin-left: 0.3rem; }

h3 { color: #c08eff; margin: 0 0 0.6rem; font-size: 1.05rem; }

/* === 카오스 점수 === */
.chaos {
  width: 100%;
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(192,142,255,0.08);
  border: 1px solid rgba(192,142,255,0.35);
  border-radius: 8px;
  text-align: center;
}
.chaos-row { display: flex; align-items: center; justify-content: center; gap: 0.8rem; flex-wrap: wrap; }
.chaos-score { font-size: 1.8rem; font-weight: 700; color: #f6e8b8; font-variant-numeric: tabular-nums; }
.chaos-badge { color: #ffe88e; font-weight: 700; font-size: 0.95rem; }
.chaos-note { color: #9a8fb8; font-size: 0.85rem; font-style: italic; }

/* === 외부 획득 === */
.meta {
  width: 100%;
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(192,142,255,0.08);
  border: 1px solid rgba(192,142,255,0.3);
  border-radius: 8px;
}
.gain-row { display: flex; flex-wrap: wrap; gap: 0.6rem; }
.gain {
  flex: 1;
  min-width: 120px;
  text-align: center;
  padding: 0.6rem 0.8rem;
  background: rgba(0,0,0,0.3);
  border-radius: 6px;
  font-weight: 700;
}
.gain--hyperion { color: #ffb86c; border: 1px solid rgba(255,184,108,0.4); }
.gain--research { color: #8eedff; border: 1px solid rgba(142,237,255,0.4); }
.gain--soul { color: #c08eff; border: 1px solid rgba(192,142,255,0.45); }
.meta__note { color: #6c6c7c; font-size: 0.78rem; font-style: italic; margin: 0.6rem 0 0; }
.unlocks { list-style: none; padding: 0; margin: 0.6rem 0 0; display: flex; flex-direction: column; gap: 0.2rem; }
.unlock { color: #ffe88e; font-size: 0.88rem; }

/* === 행적 === */
.journey {
  width: 100%;
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.block { display: flex; flex-direction: column; gap: 0.35rem; }
.block__label { color: #b6b6c4; font-size: 0.85rem; font-weight: 600; }
.block__body { color: #d6d6e0; font-size: 0.92rem; }
.block__empty { color: #6c6c7c; font-style: italic; font-size: 0.9rem; }

.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.3rem; }
.chip {
  font-size: 0.78rem;
  padding: 0.18rem 0.55rem;
  border-radius: 12px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.14);
  color: #d6d6e0;
  white-space: nowrap;
}
.chip__x { margin-left: 0.25rem; opacity: 0.75; font-weight: 700; }
.chip--npc { color: #8effb8; border-color: rgba(142,255,184,0.35); }
.chip--region { color: #bdf0ff; border-color: rgba(142,237,255,0.3); }
.chip--boss { color: #ff8e8e; border-color: rgba(255,142,142,0.4); }
.chip--relic { color: #ffe88e; border-color: rgba(255,232,142,0.4); }

/* 카드/유물 리스트 — 길면 스크롤 */
.loot {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 220px;
  overflow-y: auto;
}
.loot__group { display: flex; flex-wrap: wrap; gap: 0.4rem; }

.finish {
  margin-top: 1.5rem;
  padding: 0.8rem 1.6rem;
  background: rgba(192,142,255,0.2);
  border: 1px solid rgba(192,142,255,0.5);
  color: inherit;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}
.finish:hover { background: rgba(192,142,255,0.3); }
</style>
