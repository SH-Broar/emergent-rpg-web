<script setup lang="ts">
/**
 * 거미줄 노드 맵 — SVG 그래프 + 인접 노드 클릭.
 *
 * spec v2 Round 4: 거미줄형 자유 이동. 시간 만료 시 보스 게이트만 진입 가능.
 */

import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { getNeighbors, getNode, isTimeUp } from '@/systems/map';
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

const reachable = computed<Set<NodeId>>(() => {
  if (!nodeMap.value) return new Set();
  if (timeUp.value) {
    // 시간 만료: 보스 게이트만 갈 수 있음 (인접해 있으면)
    const neighbors = getNeighbors(nodeMap.value, run.data.currentNodeId);
    return new Set(
      neighbors
        .filter((n) => n.id === nodeMap.value!.bossGateNodeId || n.isBossGate)
        .map((n) => n.id),
    );
  }
  return new Set(getNeighbors(nodeMap.value, run.data.currentNodeId).map((n) => n.id));
});

const timeUp = computed(() => {
  const tl = timeline.value;
  if (!tl) return false;
  return isTimeUp(run.data.visitedNodes.length, tl.timeLimit);
});

const nodeKindColors: Record<NodeKind, string> = {
  village: '#8effb8',
  combat: '#ff8e8e',
  event: '#8eedff',
  elite: '#ffb88e',
  boss: '#ffe88e',
  rest: '#c0c0c0',
  shop: '#c08eff',
};

const nodeKindLabels: Record<NodeKind, string> = {
  village: '마을',
  combat: '전투',
  event: '사건',
  elite: '엘리트',
  boss: '보스',
  rest: '휴식',
  shop: '상점',
};

function visitNode(node: Node) {
  if (node.id === run.data.currentNodeId) return; // 현재 노드 무시
  if (!reachable.value.has(node.id)) {
    if (timeUp.value) {
      ui.toast('warning', '시간이 다 되어 보스 게이트로만 갈 수 있습니다.');
    } else {
      ui.toast('warning', '인접한 노드만 갈 수 있습니다.');
    }
    return;
  }

  if (!timeline.value) return;
  run.visitNode(node.id, timeline.value.deckExpansionThresholds);

  // 노드 타입별 처리
  switch (node.kind) {
    case 'village':
      ui.toast('info', `${node.label}에 도착했습니다.`);
      // MVR: 마을은 별도 화면 없이 NPC 확인만. 그대로 맵 유지.
      break;
    case 'combat':
    case 'elite':
      router.push('/game/combat');
      break;
    case 'event':
      router.push('/game/event');
      break;
    case 'boss':
      router.push('/game/boss');
      break;
    case 'rest': {
      const heal = Math.floor(run.data.maxHp * 0.3);
      run.data.hp = Math.min(run.data.maxHp, run.data.hp + heal);
      ui.toast('success', `잠시 쉬고 HP ${heal} 회복했습니다.`);
      break;
    }
    case 'shop':
      ui.toast('info', '상점은 아직 구현 전입니다.');
      break;
  }
}

function abandonRun() {
  if (!confirm('정말 이 런을 포기하시겠습니까? 진행도는 메타에 반영됩니다.')) return;
  run.endRun('free-end');
  // 메타 변환
  import('@/systems/progression').then(({ absorbRunIntoMeta }) => {
    absorbRunIntoMeta(run.data);
    run.reset();
    router.push('/main');
  });
}

onMounted(() => {
  if (!run.active || !nodeMap.value) {
    ui.toast('warning', '진행 중인 런이 없습니다.');
    router.push('/main');
  }
});

function edgePath(from: Node, to: Node): string {
  return `M ${from.position.x * 100} ${from.position.y * 100} L ${to.position.x * 100} ${to.position.y * 100}`;
}
</script>

<template>
  <main v-if="nodeMap" class="map-view">
    <header class="hdr">
      <button class="abandon" @click="abandonRun">← 런 포기</button>
      <h1>{{ timeline?.name ?? '여정' }}</h1>
      <div class="stats">
        <span :class="{ urgent: timeUp }">
          남은 시간: <strong>{{ run.data.remainingTime }}</strong>
        </span>
        <span>HP <strong>{{ run.data.hp }} / {{ run.data.maxHp }}</strong></span>
        <span>덱 <strong>{{ run.data.deck.length }} / {{ run.data.deckSize }}</strong></span>
        <span>골드 <strong>{{ run.data.gold }}</strong></span>
      </div>
      <p v-if="timeUp" class="warn">⚠ 시간이 다 됐습니다. 보스 게이트로 가서 종말을 마주하세요.</p>
    </header>

    <section class="graph">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <!-- 인접 선 (양방향 중복 그리지 않게 정렬된 쌍만) -->
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
              'node-group--visited': run.data.visitedNodes.includes(node.id),
            }"
            :transform="`translate(${node.position.x * 100} ${node.position.y * 100})`"
            @click="visitNode(node)"
          >
            <circle r="3.5" :fill="nodeKindColors[node.kind]" class="node-dot" />
            <text y="6" class="node-label">{{ node.label }}</text>
            <text y="8.5" class="node-kind">[{{ nodeKindLabels[node.kind] }}]</text>
          </g>
        </g>
      </svg>
    </section>

    <aside v-if="currentNode" class="current-info">
      <h3>현재 위치: {{ currentNode.label }}</h3>
      <p>{{ currentNode.description }}</p>
    </aside>
  </main>
</template>

<style scoped>
.map-view {
  display: grid;
  grid-template-columns: 1fr 280px;
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
.hdr h1 { flex: 1; }
.stats { display: flex; gap: 1rem; color: #b6b6c4; font-size: 0.9rem; }
.stats strong { color: #f6e8b8; }
.urgent strong { color: #ff8e8e; }
.warn { width: 100%; color: #ff8e8e; font-weight: 600; margin: 0.4rem 0 0; }

.graph {
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
  stroke-width: 1;
}
.node-group--visited .node-dot {
  opacity: 0.5;
}
.node-label { fill: #e9e9f4; font-size: 2.2px; text-anchor: middle; font-weight: 600; }
.node-kind { fill: #888; font-size: 1.6px; text-anchor: middle; }

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}

.current-info {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
}
.current-info h3 { color: #f6e8b8; margin: 0 0 0.4rem; }
.current-info p { color: #b6b6c4; }
</style>
