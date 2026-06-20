<script setup lang="ts">
/**
 * 인정 게이트 화면 (납품 시스템 v1) — 전투/엘리트 노드 진입 시 곧장 전투가 아니라
 * [전투] / [납품] / [그냥 지나치기] 3선택을 띄운다.
 *
 *  - [전투]   : 기존 격자 전투. 방울 표식(엘리트 격상)을 먼저 적용한 뒤 enterGridCombat→/game/combat.
 *               (전투 경로·bell mark는 MapView에서 옮겨 와 여기서 동등 처리한다.)
 *  - [납품]   : 보유 생활 재료 난이도 합 ≥ 요구치면 활성. deliver()로 재료 소비 → 생활 XP+컬러 → /game/map.
 *               부족하면 비활성 + "필요 난이도 N / 보유 M" 안내.
 *  - [지나치기]: 보상 없이 통과(combatCleared 마킹) → /game/map. 어떤 빌드도 막히지 않게.
 *
 * MapView가 visitNode를 *먼저* 호출하고 /game/gate로 라우팅하므로, 진입 시점에
 * run.data.currentNodeId = 대상 노드다(FarmingView/ActivityView와 동일 패턴).
 *
 * 범위 밖(후속): 보스 게이트(boss-intro 불변), 납품 약속/마감/실패 패널티, 공방 2차 가공, 미니게임.
 */

import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { effectiveKind as systemEffectiveKind } from '@/systems/map';
import { rng } from '@/systems/rng';
import {
  canDeliver,
  deliver,
  heldDeliveryValue,
  nodeDeliveryThreshold,
} from '@/systems/delivery';
import { colorLabel } from '@/systems/labels';
import type { Node } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

const nodeId = computed(() => run.data.currentNodeId);

const map = computed(() =>
  data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? ''),
);
const node = computed<Node | undefined>(() =>
  map.value?.nodes.find((n) => n.id === nodeId.value),
);
const nodeLabel = computed(() => node.value?.label ?? '갈림길');
const isElite = computed(() =>
  node.value ? systemEffectiveKind(node.value, run.data) === 'elite' : false,
);

const threshold = computed(() => nodeDeliveryThreshold(nodeId.value));
const held = computed(() => heldDeliveryValue());
const deliverable = computed(() => canDeliver(nodeId.value));

onMounted(() => {
  // 잘못 들어온 경우(런 없음·노드 없음·전투 노드 아님)는 지도로 돌려보낸다.
  if (!run.active || !node.value) {
    router.push('/main');
    return;
  }
  const k = systemEffectiveKind(node.value, run.data);
  if (k !== 'combat' && k !== 'elite') {
    router.push('/game/map');
  }
});

/**
 * 방울 표식 — 다음 *일반 전투*를 엘리트로 격상(1회). MapView.maybeApplyBellMark와 동등.
 * [전투] 선택 시 enterGridCombat 직전에 호출한다.
 */
function maybeApplyBellMark(n: Node) {
  if ((run.data.bellMarked ?? 0) <= 0) return;
  if (systemEffectiveKind(n, run.data) !== 'combat') return; // 이미 엘리트/보스면 다음 일반 전투까지 유지
  const region = n.region ? map.value?.regions.find((rg) => rg.id === n.region) : undefined;
  const pool = region?.eliteEnemyPool ?? [];
  if (pool.length === 0) return;
  const elite = pool[Math.floor(rng() * pool.length)];
  run.data.nodeKindOverrides[n.id] = 'elite';
  run.data.nodeContentOverrides[n.id] = { enemyGroupId: elite };
  run.data.bellMarked = 0;
  ui.toast('warning', '방울이 울린다 — 강한 것이 다가온다 (엘리트 전투).');
}

/** [전투] — 방울 표식 적용 후 격자 전투 진입. (기존 MapView 전투 경로 보존.) */
function chooseCombat() {
  const n = node.value;
  if (!n) return;
  maybeApplyBellMark(n);
  if (run.enterGridCombat(n.id)) {
    router.push('/game/combat');
  } else {
    ui.toast('error', '전투를 시작할 수 없습니다.');
  }
}

/** [납품] — 재료 소비 → 생활 XP+컬러 부여 → 노드 통과. */
function chooseDeliver() {
  if (!deliverable.value) {
    ui.toast('warning', `아직 납품할 재료가 부족하다 (필요 ${threshold.value} / 보유 ${held.value}).`);
    return;
  }
  const result = deliver(nodeId.value);
  if (!result) {
    ui.toast('warning', '납품할 수 없다.');
    return;
  }
  ui.toast(
    'success',
    `재료 ${result.consumed.length}점을 내어주었다 — 생활 경험 +${result.lifeXp}, ${colorLabel(result.color)} +${result.colorGain}.`,
  );
  router.push('/game/map');
}

/** [그냥 지나치기] — 보상 없이 통과(combatCleared 마킹). */
function choosePass() {
  const r = run.data;
  const id = nodeId.value;
  if (!r.nodeStates[id]) r.nodeStates[id] = { visited: true };
  r.nodeStates[id].visited = true;
  r.nodeStates[id].combatCleared = true;
  ui.toast('info', '눈을 마주치지 않고 지나간다.');
  router.push('/game/map');
}
</script>

<template>
  <main v-if="node" class="gate-view">
    <header class="gate-hdr">
      <span class="gate-kind">[{{ isElite ? '엘리트' : '전투' }}]</span>
      <h1>{{ nodeLabel }}</h1>
      <p class="gate-sub">길목을 지키는 것이 있다. 어떻게 지날까.</p>
    </header>

    <div class="gate-options">
      <!-- 전투 -->
      <button type="button" class="gate-opt gate-opt--combat" @click="chooseCombat">
        <span class="gate-opt__title">싸운다</span>
        <span class="gate-opt__desc">격자 전투. 이기면 카드 경험과 전리품을 얻는다.</span>
      </button>

      <!-- 납품 -->
      <button
        type="button"
        class="gate-opt gate-opt--deliver"
        :class="{ 'gate-opt--disabled': !deliverable }"
        :disabled="!deliverable"
        @click="chooseDeliver"
      >
        <span class="gate-opt__title">바친다</span>
        <span class="gate-opt__desc">
          생활 재료를 내어주고 조용히 지난다. 생활 경험과 컬러를 얻는다.
        </span>
        <span class="gate-opt__meter" :class="{ 'gate-opt__meter--ok': deliverable }">
          난이도 {{ held }} / {{ threshold }}
          <template v-if="!deliverable"> — 재료가 더 필요하다</template>
        </span>
      </button>

      <!-- 지나치기 -->
      <button type="button" class="gate-opt gate-opt--pass" @click="choosePass">
        <span class="gate-opt__title">그냥 지나친다</span>
        <span class="gate-opt__desc">아무것도 얻지 못한 채 통과한다.</span>
      </button>
    </div>
  </main>
</template>

<style scoped>
.gate-view {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: 2rem 1.5rem;
}

.gate-hdr {
  text-align: center;
}
.gate-kind {
  color: #ff8e8e;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
}
.gate-hdr h1 {
  margin: 0.3rem 0;
  font-size: 1.8rem;
}
.gate-sub {
  color: var(--text-dim, #b6b6c4);
  margin: 0;
}

.gate-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 480px;
}

.gate-opt {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  text-align: left;
  padding: 1rem 1.2rem;
  border-radius: 12px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.18));
  background: rgba(20, 22, 32, 0.7);
  color: inherit;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, transform 120ms ease;
}
.gate-opt:hover:not(.gate-opt--disabled) {
  background: rgba(40, 42, 54, 0.9);
  transform: translateY(-1px);
}
.gate-opt:active:not(.gate-opt--disabled) {
  transform: translateY(0);
}
.gate-opt--combat:hover:not(.gate-opt--disabled) { border-color: #ff8e8e; }
.gate-opt--deliver:hover:not(.gate-opt--disabled) { border-color: #a8e88e; }

.gate-opt--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.gate-opt__title {
  font-size: 1.15rem;
  font-weight: 700;
}
.gate-opt__desc {
  color: var(--text-dim, #b6b6c4);
  font-size: 0.9rem;
}
.gate-opt__meter {
  font-size: 0.85rem;
  color: #d8b46a;
}
.gate-opt__meter--ok {
  color: #a8e88e;
}
</style>
