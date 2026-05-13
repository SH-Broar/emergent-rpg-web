<script setup lang="ts">
/**
 * 거미줄 노드 맵 — SVG 그래프 + 클릭 시 Drawer + 현재 위치 화살표.
 *
 * spec v2 + 사용자 피드백:
 *  - 노드 클릭 → 즉시 이동 X, Drawer로 설명 표시 → "입장" 버튼이 실제 이동
 *  - 현재 위치는 화살표 마커로 강조
 *  - 한 번 방문한 노드는 재이벤트/재전투 없음 (단 회피한 전투는 선택지 표시)
 *  - 조건부 인접 노드는 데이터 구조만 준비 (실제 표시는 자동 — systems/map.ts)
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { getNeighbors, getNode, isTimeUp, effectiveKind as systemEffectiveKind } from '@/systems/map';
import type { Node, NodeId, NodeKind, NodeMap } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

const timeline = computed(() => data.timelines.get(run.data.timelineId));
const nodeMap = computed<NodeMap | undefined>(() =>
  timeline.value ? data.nodeMaps.get(timeline.value.nodeMapId) : undefined,
);

const currentNode = computed<Node | undefined>(() => {
  if (!nodeMap.value) return undefined;
  return getNode(nodeMap.value, run.data.currentNodeId);
});

const timeUp = computed(() => {
  const tl = timeline.value;
  if (!tl) return false;
  return isTimeUp(run.data.visitedNodes.length, tl.timeLimit);
});

const reachable = computed<Set<NodeId>>(() => {
  if (!nodeMap.value) return new Set();
  // 사용자 사양: 시간 만료 = 즉시 종료. 보스 게이트로 갈 필요 없음.
  // 따라서 인접 노드는 항상 동일하게 반환.
  const neighbors = getNeighbors(nodeMap.value, run.data.currentNodeId, run.data);
  return new Set(neighbors.map((n) => n.id));
});

// === Drawer 상태 ===
const selectedNodeId = ref<NodeId | null>(null);
const selectedNode = computed<Node | undefined>(() => {
  if (!nodeMap.value || !selectedNodeId.value) return undefined;
  return getNode(nodeMap.value, selectedNodeId.value);
});
const selectedState = computed(() => {
  return selectedNodeId.value ? run.data.nodeStates[selectedNodeId.value] : undefined;
});

// === 노드 시각 색상 ===
const nodeKindColors: Record<NodeKind, string> = {
  village: '#8effb8',
  combat: '#ff8e8e',
  event: '#8eedff',
  elite: '#ffb88e',
  boss: '#ffe88e',
  rest: '#c0c0c0',
  shop: '#c08eff',
  workshop: '#d8b4ff',
};
const nodeKindLabels: Record<NodeKind, string> = {
  village: '마을',
  combat: '전투',
  event: '사건',
  elite: '엘리트',
  boss: '보스',
  rest: '휴식',
  shop: '상점',
  workshop: '공방',
};

// === 노드 클릭: Drawer 열기 ===
function clickNode(node: Node) {
  if (node.id === run.data.currentNodeId) {
    // 현재 노드 — drawer 표시 (정보 확인)
    selectedNodeId.value = node.id;
    return;
  }
  if (!reachable.value.has(node.id)) {
    if (timeUp.value) {
      ui.toast('warning', '시간이 다 되어 보스 게이트로만 갈 수 있습니다.');
    } else {
      ui.toast('warning', '인접한 노드만 갈 수 있습니다.');
    }
    return;
  }
  selectedNodeId.value = node.id;
}

function closeDrawer() {
  selectedNodeId.value = null;
}

// === Drawer 액션: 입장 / 회피 ===
function getEnterAction(): 'enter' | 'pass' | 'choose-combat' | 'pass-only' | 'boss' | 'rest-repeat' | 'shop-todo' | 'event-pass' {
  const node = selectedNode.value;
  const st = selectedState.value;
  if (!node) return 'enter';
  // 현재 노드면 그냥 정보 확인용
  if (node.id === run.data.currentNodeId) return 'pass-only';

  switch (systemEffectiveKind(node, run.data)) {
    case 'combat':
    case 'elite':
      if (st?.combatCleared) return 'pass';
      if (st?.combatStealthed) return 'choose-combat';
      return 'enter';
    case 'event':
      if (st?.eventTriggered) return 'event-pass';
      return 'enter';
    case 'boss':
      return 'boss';
    case 'rest':
      return 'rest-repeat';
    case 'shop':
      return 'shop-todo';
    case 'village':
    default:
      return 'enter';
  }
}

function enterSelected() {
  const node = selectedNode.value;
  if (!node || !timeline.value) return;
  const action = getEnterAction();

  // 노드 방문 처리
  run.visitNode(node.id, timeline.value.deckExpansionThresholds);

  // 유물 trigger 발동
  void import('@/systems/relic').then(({ onNodeEnter }) => onNodeEnter(node.id));

  // 히페리온 자동 평가
  void import('@/systems/hyperion').then(({ evaluateHyperion }) => evaluateHyperion());

  // 시간 만료 즉시 종료 (사용자 사양)
  if (run.data.remainingTime <= 0) {
    run.endRun('time-up');
    closeDrawer();
    router.push('/game/end');
    return;
  }

  switch (systemEffectiveKind(node, run.data)) {
    case 'village':
      router.push('/game/village');
      break;
    case 'workshop':
      router.push('/game/workshop');
      break;
    case 'combat':
    case 'elite':
      if (action === 'pass') {
        ui.toast('info', '이미 정리된 곳입니다.');
      } else {
        router.push('/game/combat');
      }
      break;
    case 'event':
      if (action === 'event-pass') {
        ui.toast('info', '이미 지나간 사건입니다.');
      } else {
        router.push('/game/event');
      }
      break;
    case 'boss':
      router.push('/game/boss');
      break;
    case 'rest': {
      const heal = Math.floor(run.data.maxHp * 0.3);
      run.data.hp = Math.min(run.data.maxHp, run.data.hp + heal);
      ui.toast('success', `HP +${heal} 회복`);
      void import('@/systems/relic').then(({ onRest }) => onRest());
      break;
    }
    case 'shop':
      ui.toast('info', '상점은 아직 구현 전입니다.');
      break;
  }

  closeDrawer();
}

function passSelected() {
  // 회피된 전투 노드에서 "지나친다"
  const node = selectedNode.value;
  if (!node || !timeline.value) return;
  run.visitNode(node.id, timeline.value.deckExpansionThresholds);
  ui.toast('info', '조용히 지나갑니다.');
  closeDrawer();
}

// === 런 포기 ===
function abandonRun() {
  if (!confirm('이 런을 포기하시겠습니까? 진행도는 메타에 반영됩니다.')) return;
  run.endRun('free-end');
  import('@/systems/progression').then(({ absorbRunIntoMeta }) => {
    absorbRunIntoMeta(run.data);
    run.reset();
    router.push('/main');
  });
}

onMounted(() => {
  if (!run.active || !nodeMap.value) {
    router.push('/main');
  }
});

function edgePath(from: Node, to: Node): string {
  return `M ${from.position.x * 100} ${from.position.y * 100} L ${to.position.x * 100} ${to.position.y * 100}`;
}

// === 노드 상태 뱃지 ===
function nodeStatusLabel(node: Node): string {
  const st = run.data.nodeStates[node.id];
  if (!st || !st.visited) return '미방문';
  const k = systemEffectiveKind(node, run.data);
  if (k === 'combat' || k === 'elite') {
    if (st.combatCleared) return '정리됨';
    if (st.combatStealthed) return '회피됨';
    return '방문';
  }
  if (k === 'event' && st.eventTriggered) return '지나감';
  return '방문';
}

// 입장 버튼 라벨
function enterLabel(): string {
  const action = getEnterAction();
  switch (action) {
    case 'enter': return '입장';
    case 'pass': return '지나간다';
    case 'choose-combat': return '다시 싸운다';
    case 'event-pass': return '지나간다';
    case 'rest-repeat': return '잠시 쉰다';
    case 'shop-todo': return '미구현';
    case 'boss': return '도전한다';
    case 'pass-only': return '닫기';
  }
}
</script>

<template>
  <main v-if="nodeMap" class="map-view">
    <header class="hdr">
      <button class="abandon" @click="abandonRun">← 런 포기</button>
      <h1>{{ timeline?.name ?? '여정' }}</h1>
      <p v-if="timeUp" class="warn">⚠ 시간이 다 됐습니다. 보스 게이트로 가세요.</p>
    </header>

    <section class="graph">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <!-- 인접 선 -->
        <g class="edges">
          <template v-for="node in nodeMap.nodes" :key="`e-${node.id}`">
            <path
              v-for="nb in node.neighbors.filter((n: string) => n > node.id)"
              :key="`${node.id}-${nb}`"
              :d="edgePath(node, getNode(nodeMap, nb)!)"
              class="edge"
            />
          </template>
        </g>
        <!-- 노드 -->
        <g class="nodes">
          <g
            v-for="node in nodeMap.nodes"
            :key="node.id"
            class="node-group"
            :class="{
              'node-group--current': node.id === run.data.currentNodeId,
              'node-group--reachable': reachable.has(node.id),
              'node-group--visited': run.data.nodeStates[node.id]?.visited,
              'node-group--cleared': run.data.nodeStates[node.id]?.combatCleared,
              'node-group--stealthed': run.data.nodeStates[node.id]?.combatStealthed,
              'node-group--selected': selectedNodeId === node.id,
            }"
            :transform="`translate(${node.position.x * 100} ${node.position.y * 100})`"
            @click="clickNode(node)"
          >
            <circle r="3.5" :fill="nodeKindColors[systemEffectiveKind(node, run.data)]" class="node-dot" />
            <text y="6" class="node-label">{{ node.label }}</text>
            <text y="8.5" class="node-kind">[{{ nodeKindLabels[systemEffectiveKind(node, run.data)] }}]</text>
          </g>
        </g>
        <!-- 현재 위치 화살표 마커 -->
        <g
          v-if="currentNode"
          class="current-arrow"
          :transform="`translate(${currentNode.position.x * 100} ${currentNode.position.y * 100 - 6})`"
        >
          <path d="M 0 0 L -2.2 -3.6 L 0 -2.4 L 2.2 -3.6 Z" fill="#f6e8b8" />
        </g>
      </svg>
    </section>

    <!-- Drawer -->
    <aside v-if="selectedNode" class="drawer" :class="{ 'drawer--current': selectedNode.id === run.data.currentNodeId }">
      <header class="drawer__hdr">
        <span class="drawer__kind" :style="{ color: nodeKindColors[systemEffectiveKind(selectedNode, run.data)] }">
          [{{ nodeKindLabels[systemEffectiveKind(selectedNode, run.data)] }}]
        </span>
        <h2>{{ selectedNode.label }}</h2>
        <button class="drawer__x" @click="closeDrawer" aria-label="닫기">×</button>
      </header>
      <div class="drawer__status">상태: {{ nodeStatusLabel(selectedNode) }}</div>
      <p class="drawer__desc">{{ selectedNode.description }}</p>

      <div class="drawer__actions">
        <button
          v-if="selectedNode.id !== run.data.currentNodeId"
          class="drawer__enter"
          @click="enterSelected"
        >
          {{ enterLabel() }}
        </button>
        <button
          v-if="getEnterAction() === 'choose-combat'"
          class="drawer__pass"
          @click="passSelected"
        >
          지나간다
        </button>
        <button class="drawer__close" @click="closeDrawer">닫기</button>
      </div>
    </aside>
  </main>
</template>

<style scoped>
.map-view {
  display: grid;
  grid-template-columns: 1fr 320px;
  grid-template-rows: auto 1fr;
  gap: 1rem;
  height: 100vh;
  padding: 1rem 1.5rem;
}
.hdr {
  grid-column: 1 / 3;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.abandon { background: none; border: 1px solid rgba(255,100,100,0.4); color: #ff8e8e; padding: 0.3rem 0.7rem; border-radius: 6px; cursor: pointer; }
.hdr h1 { flex: 1; margin: 0; color: #f6e8b8; }
.stats { display: flex; gap: 1rem; color: #b6b6c4; font-size: 0.9rem; }
.stats strong { color: #f6e8b8; }
.urgent strong { color: #ff8e8e; }
.warn { width: 100%; color: #ff8e8e; font-weight: 600; margin: 0.4rem 0 0; }

.graph {
  grid-column: 1;
  grid-row: 2;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}
.graph svg { width: 100%; height: 100%; display: block; }

.edges .edge {
  stroke: rgba(255, 255, 255, 0.15);
  stroke-width: 0.3;
  fill: none;
}
.node-group { cursor: pointer; }
.node-group--reachable .node-dot {
  filter: drop-shadow(0 0 4px currentColor);
  animation: pulse 1.4s ease-in-out infinite;
}
.node-group--current .node-dot {
  stroke: #f6e8b8;
  stroke-width: 0.6;
}
.node-group--visited .node-dot {
  opacity: 0.7;
}
.node-group--cleared .node-dot {
  opacity: 0.35;
}
.node-group--stealthed .node-dot {
  opacity: 0.55;
  stroke: #8eedff;
  stroke-dasharray: 0.8 0.6;
  stroke-width: 0.5;
}
.node-group--selected .node-dot {
  stroke: #c08eff;
  stroke-width: 0.8;
}

.node-label { fill: #e9e9f4; font-size: 2.2px; text-anchor: middle; font-weight: 600; }
.node-kind { fill: #888; font-size: 1.6px; text-anchor: middle; }

.current-arrow {
  pointer-events: none;
  animation: bob 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
@keyframes bob {
  0%, 100% { transform: translate(var(--cx, 0), var(--cy, 0)) translateY(0); }
  50% { transform: translateY(-0.8px); }
}

.drawer {
  grid-column: 2;
  grid-row: 2;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  overflow-y: auto;
}
.drawer--current { border-color: rgba(246, 232, 184, 0.4); }

.drawer__hdr {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.drawer__kind { font-size: 0.8rem; }
.drawer__hdr h2 {
  flex: 1;
  margin: 0;
  color: #f6e8b8;
  font-size: 1.2rem;
}
.drawer__x {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 1.4rem;
  line-height: 1;
}
.drawer__x:hover { color: #f6e8b8; }

.drawer__status {
  font-size: 0.85rem;
  color: #c08eff;
}
.drawer__desc {
  color: #b6b6c4;
  line-height: 1.6;
  margin: 0;
}

.drawer__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: auto;
}
.drawer__enter {
  padding: 0.7rem 1rem;
  background: rgba(192, 142, 255, 0.2);
  border: 1px solid rgba(192, 142, 255, 0.5);
  color: #f6e8b8;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font: inherit;
}
.drawer__enter:hover { background: rgba(192, 142, 255, 0.3); }
.drawer__pass {
  padding: 0.6rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: inherit;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}
.drawer__pass:hover { background: rgba(255, 255, 255, 0.1); }
.drawer__close {
  padding: 0.5rem 1rem;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #888;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}

/* 모바일: drawer를 하단 시트로 */
@media (max-width: 720px) {
  .map-view {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .drawer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 60vh;
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  }
}
</style>
