<script setup lang="ts">
/**
 * 인정 게이트 화면 (거래 시스템 v2) — 전투/엘리트 노드 진입 시 곧장 전투가 아니라
 * [싸운다] / [거래한다] / [그냥 지나친다] 선택을 띄운다.
 *
 *  - [싸운다]   : 기존 격자 전투. 방울 표식(엘리트 격상)을 먼저 적용한 뒤 enterGridCombat→/game/combat.
 *  - [거래한다] : 그 노드 권역 배정 활동의 산출물 N개를 요구하는 *거래 계약*을 수주(재료 없어도 항상 가능).
 *                 수주하면 노드는 *미해결*로 두고 맵으로 돌아간다 — 요구 품목을 모아 마을/현장에서 완료.
 *                 이미 요구 품목을 충분히 가졌으면 그 자리서 [지금 건넨다]로 즉시 완료(한 턴 절약).
 *                 이미 계약이 있는 노드 재방문이면 요구/보유를 보여주고 충분할 때 [거래 완료]만 띄운다.
 *  - [그냥 지나친다] : 보상 없이 통과. *어느 소비도 하지 않는다* → 재진입 자유.
 *
 * 종류별 독립 소비(노드 재활성 모델): [싸운다]=combatCleared, [거래]=tradeCleared가 *각각* 따로 소비된다.
 *  전투만 이긴 뒤 재진입하면 [거래/지나치기]만, 거래만 한 뒤 재진입하면 [싸운다/지나치기]만 보인다.
 *  (둘 다 소비면 MapView가 'pass'로 자동 통과시켜 이 화면에 오지 않는다.)
 *
 * MapView가 visitNode를 *먼저* 호출하고 /game/gate로 라우팅하므로, 진입 시점에
 * run.data.currentNodeId = 대상 노드다(FarmingView/ActivityView와 동일 패턴).
 *
 * 선택지 아래 flavor 설명문은 두지 않는다(건조). 거래의 요구 품목/개수/보유는 *기능 정보*라 표시 유지.
 */

import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { effectiveKind as systemEffectiveKind } from '@/systems/map';
import { rng } from '@/systems/rng';
import {
  acceptContract,
  canFulfill,
  fulfillContract,
  getContract,
  hasContract,
  heldTradeCount,
  tradeItemName,
  tradeRequirement,
  type TradeRequirement,
} from '@/systems/delivery';
import { colorLabel } from '@/systems/labels';
import { eulReul } from '@/systems/josa';
import { summarizeEnemies } from '@/systems/enemy-spec';
import EnemySpecPanel from '@/components/EnemySpecPanel.vue';
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

/**
 * 종류별 독립 소비(노드 재활성 모델) — 그 노드의 전투/거래가 *이미* 소비됐는가.
 *  - combatDone(combatCleared): [싸운다] 숨김(전투 이긴 뒤 재진입).
 *  - tradeDone(tradeCleared)  : [거래한다/거래완료] 숨김(납품만 한 뒤 재진입).
 * 둘 다 소비면 MapView가 애초에 게이트로 안 보낸다('pass'). [지나친다]는 항상 노출.
 */
const combatDone = computed(() => !!run.data.nodeStates[nodeId.value]?.combatCleared);
const tradeDone = computed(() => !!run.data.nodeStates[nodeId.value]?.tradeCleared);

/**
 * [싸운다] 시 만날 적의 스펙(읽기 전용 프리뷰). enterGridCombat과 *같은* buildCombatStage를 쓰는
 * run.previewStageEnemies로 초기 배치 적을 산출 → summarizeEnemies로 표기 항목 계산.
 * 결정론 시드(`${rngSeed}:${nodeId}`)라 프리뷰=실제 일치. run/세이브 상태는 바꾸지 않는다.
 *
 * 주의(방울 표식): bellMarked>0인 *일반* 노드는 [싸운다] 순간 엘리트로 격상되지만(maybeApplyBellMark),
 *   그 격상은 무작위 풀 추첨 + 상태 기록이라 읽기 전용 프리뷰로 재현할 수 없다(rng 동기화 깨짐).
 *   따라서 프리뷰는 *현재 유효 상태* 기준이다(방울이 없는 대다수 경우엔 정확, 방울은 의도된 기습).
 */
const enemySpec = computed(() => summarizeEnemies(run.previewStageEnemies(nodeId.value)));

/** 이 노드에 이미 활성 거래 계약이 있는가(재방문). */
const contracted = computed(() => hasContract(nodeId.value));

/**
 * 표시·완료에 쓸 요구 — 계약이 있으면 *계약에 박힌 요구*(수주 시점 확정), 없으면 노드 기준 신규 요구.
 * 계약 요구는 활동 매핑이 바뀌어도 그대로 이행한다.
 */
const requirement = computed<TradeRequirement>(() => {
  const c = getContract(nodeId.value);
  if (c) {
    return {
      itemId: c.itemId,
      upperItemId: c.upperItemId,
      count: c.count,
      element: c.element as TradeRequirement['element'],
      tier: c.tier,
    };
  }
  return tradeRequirement(nodeId.value);
});

const reqItemName = computed(() => tradeItemName(requirement.value.itemId));
const reqUpperName = computed(() =>
  requirement.value.upperItemId ? tradeItemName(requirement.value.upperItemId) : '',
);
const heldCount = computed(() => heldTradeCount(requirement.value));
const fulfillable = computed(() => canFulfill(requirement.value));

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
 * [싸운다] 선택 시 enterGridCombat 직전에 호출한다.
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

/** [싸운다] — 방울 표식 적용 후 격자 전투 진입. (기존 MapView 전투 경로 보존.) */
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

/** 거래 완료 공통 — 소비 + 노드 해결 + 보상 → 맵. */
function completeTrade() {
  const result = fulfillContract(nodeId.value);
  if (!result) {
    ui.toast('warning', '아직 건넬 만큼 모이지 않았다.');
    return;
  }
  const extra = result.elite
    ? ` 골드 +${result.gold}, 시간의 조각 +${result.shards}.`
    : '';
  ui.toast(
    'success',
    `거래를 마쳤다 — ${reqItemName.value} ${result.consumed.length}개. 생활 경험 +${result.lifeXp}, ${colorLabel(result.color)} +${result.colorGain}.${extra}`,
  );
  router.push('/game/map');
}

/**
 * [거래한다] — 계약 수주. 재료가 없어도 항상 가능.
 *  - 보유가 충분하면 곧장 완료(한 턴 절약): 계약 등록 후 즉시 fulfill.
 *  - 부족하면 계약만 등록하고 맵으로(요구를 모아 마을/현장에서 완료).
 */
function chooseTrade() {
  acceptContract(nodeId.value);
  if (canFulfill(requirement.value)) {
    completeTrade();
    return;
  }
  const name = reqItemName.value;
  ui.toast(
    'info',
    `거래 수주 — ${name} ${requirement.value.count}개${eulReul(name)} 모아 오면 된다 (마을이나 이 자리에서).`,
  );
  router.push('/game/map');
}

/** [그냥 지나친다] — 보상 없이 통과. 노드는 해결하지 않는다(재진입 자유). */
function choosePass() {
  ui.toast('info', '눈을 마주치지 않고 지나간다.');
  router.push('/game/map');
}
</script>

<template>
  <main v-if="node" class="gate-view">
    <header class="gate-hdr">
      <span class="gate-kind">[{{ isElite ? '엘리트' : '조우' }}]</span>
      <h1>{{ nodeLabel }}</h1>
    </header>

    <div class="gate-options">
      <!-- 세 선택지 모두 *info 박스 + 큰 액션 버튼*으로 통일(전투/거래/지나치기 시각 대칭). -->

      <!-- 전투 — 적 스펙을 보고 [싸운다]. 전투를 이미 이겼으면 숨김. -->
      <div v-if="!combatDone" class="gate-opt gate-opt--combat">
        <span class="gate-opt__title">전투</span>
        <EnemySpecPanel v-if="enemySpec" :spec="enemySpec" />
        <div class="gate-opt__actions">
          <button type="button" class="gate-opt__btn gate-opt__btn--combat" @click="chooseCombat">싸운다</button>
        </div>
      </div>

      <!-- 거래 (수주형) — 거래를 이미 완료했으면 숨김. -->
      <div v-if="!tradeDone" class="gate-opt gate-opt--trade">
        <span class="gate-opt__title">거래</span>
        <!-- 요구는 flavor가 아니라 *기능 정보* — 품목명·개수·보유를 표시. -->
        <span class="gate-opt__req">
          {{ reqItemName }} {{ requirement.count }}개
          <span v-if="reqUpperName" class="gate-opt__req-sub">({{ reqUpperName }}도 1개로 셈)</span>
        </span>
        <span class="gate-opt__meter" :class="{ 'gate-opt__meter--ok': fulfillable }">
          보유 {{ heldCount }} / {{ requirement.count }}
          <template v-if="contracted"> · 수주한 거래</template>
        </span>
        <div class="gate-opt__actions">
          <!-- 미수주: 보유 충분하면 즉시 완료, 아니면 맡아 둔다(수주 후 맵). -->
          <button
            v-if="!contracted"
            type="button"
            class="gate-opt__btn"
            @click="chooseTrade"
          >{{ fulfillable ? '거래한다 (지금 건넨다)' : '거래한다' }}</button>
          <!-- 수주됨: 보유 충분할 때만 완료. -->
          <button
            v-else
            type="button"
            class="gate-opt__btn"
            :class="{ 'gate-opt__btn--disabled': !fulfillable }"
            :disabled="!fulfillable"
            @click="completeTrade"
          >{{ fulfillable ? '거래 완료' : '아직 모자라다' }}</button>
        </div>
      </div>

      <!-- 지나치기 -->
      <div class="gate-opt gate-opt--pass">
        <span class="gate-opt__title">지나치기</span>
        <div class="gate-opt__actions">
          <button type="button" class="gate-opt__btn gate-opt__btn--pass" @click="choosePass">그냥 지나친다</button>
        </div>
      </div>
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
  font: inherit;
}
/* 선택지 박스는 이제 모두 div(정보 컨테이너) — 클릭은 안의 .gate-opt__btn이 받는다. */

.gate-opt__title {
  font-size: 1.15rem;
  font-weight: 700;
}
.gate-opt__req {
  font-size: 0.95rem;
  color: #d6d6e0;
}
.gate-opt__req-sub {
  font-size: 0.82rem;
  color: #9a9aa8;
}
.gate-opt__meter {
  font-size: 0.85rem;
  color: #d8b46a;
}
.gate-opt__meter--ok {
  color: #a8e88e;
}
.gate-opt__actions {
  margin-top: 0.5rem;
}
/* 큰 액션 버튼 — 세 선택지 공통(전폭·중앙). 색만 변형으로 구분(거래=초록 기본/전투=빨강/지나치기=회색). */
.gate-opt__btn {
  width: 100%;
  padding: 0.7rem 1rem;
  border-radius: 8px;
  border: 1px solid #a8e88e;
  background: rgba(142, 232, 142, 0.14);
  color: inherit;
  font: inherit;
  font-size: 1.02rem;
  font-weight: 700;
  text-align: center;
  cursor: pointer;
  transition: background 140ms ease;
}
.gate-opt__btn:hover:not(.gate-opt__btn--disabled) {
  background: rgba(142, 232, 142, 0.28);
}
.gate-opt__btn--combat {
  border-color: #ff8e8e;
  background: rgba(255, 142, 142, 0.14);
}
.gate-opt__btn--combat:hover:not(.gate-opt__btn--disabled) {
  background: rgba(255, 142, 142, 0.28);
}
.gate-opt__btn--pass {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.06);
}
.gate-opt__btn--pass:hover:not(.gate-opt__btn--disabled) {
  background: rgba(255, 255, 255, 0.14);
}
.gate-opt__btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: rgba(255, 255, 255, 0.25);
}
</style>
