<script setup lang="ts">
/**
 * 거미줄 노드 맵 — SVG 그래프 + 클릭 시 Drawer + 현재 위치 화살표.
 *
 * spec v2 + 사용자 피드백:
 *  - 노드 클릭 → 즉시 이동 X, Drawer로 설명 표시 → "입장" 버튼이 실제 이동
 *  - 현재 위치는 화살표 마커로 강조
 *  - 한 번 방문한 노드는 재이벤트/재전투 없음 (단 회피한 전투는 선택지 표시)
 *  - 조건부 인접 노드는 데이터 구조만 준비 (실제 표시는 자동 — systems/map.ts)
 *
 * M6 (2026-05-15):
 *  - 헤더(.hdr 런 포기·시대 이름·시간 만료 경고) 제거 — 설정 메뉴 / HUD slot--urgent로 이동
 *  - 노드/라벨 시각 크기↑ (radius 1.2→2.5, hitbox 2.4→4.0, label 0.85→1.7px)
 *  - 드래그 팬: pointer 이벤트 + 수동 panOffset
 *  - wheel 줌 (데스크톱): scale 0.5..2.5
 *  - 드래그 vs 클릭 4px threshold 구분
 *  - 노드 클릭 시 manualPan reset → focusNode 자동 카메라 복귀
 */

import { computed, onMounted, ref, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { getNeighbors, getNode, isTimeUp, effectiveKind as systemEffectiveKind } from '@/systems/map';
import { rng } from '@/systems/rng';
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

// timeUp 계산은 유지(시간 만료 즉시 종료 로직에서 사용)
const _timeUp = computed(() => {
  const tl = timeline.value;
  if (!tl) return false;
  return isTimeUp(run.data.visitedNodes.length, tl.timeLimit);
});
void _timeUp;

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
  gather: '#a8e88e',
  activity: '#f0d68e',
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
  gather: '채집',
  activity: '활동',
};

// === 노드 클릭: Drawer 열기 (인접·비인접 모두) ===
// 사용자 사양: 비-인접 노드도 클릭으로 *설명*은 볼 수 있어야 함.
// 입장은 인접·도달 가능 노드에서만 — getEnterAction 단계에서 'unreachable' 가드.
function clickNode(node: Node) {
  selectedNodeId.value = node.id;
  // 노드 클릭 시 수동 팬 해제 → 자동 카메라가 그 노드로 부드럽게 이동.
  manualPanActive.value = false;
  panOffset.value = { x: 0, y: 0 };
}

function closeDrawer() {
  selectedNodeId.value = null;
}

// === Drawer 액션: 입장 / 회피 ===
type EnterAction =
  | 'enter'
  | 'pass'
  | 'choose-combat'
  | 'pass-only'
  | 'boss'
  | 'rest-repeat'
  | 'shop-todo'
  | 'event-pass'
  | 'gather-enter'
  | 'activity-enter'
  | 'unreachable';

function getEnterAction(): EnterAction {
  const node = selectedNode.value;
  const st = selectedState.value;
  if (!node) return 'enter';
  if (node.id === run.data.currentNodeId) return 'pass-only';
  if (!reachable.value.has(node.id)) return 'unreachable';

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
    case 'gather':
      return 'gather-enter';
    case 'activity':
      return 'activity-enter';
    case 'village':
    case 'workshop':
    default:
      return 'enter';
  }
}

function enterSelected() {
  const node = selectedNode.value;
  if (!node || !timeline.value) return;
  const action = getEnterAction();

  if (action === 'unreachable') {
    ui.toast('warning', '인접한 노드가 아닙니다 — 한 칸씩만 이동할 수 있습니다.');
    return;
  }

  run.visitNode(node.id, timeline.value.deckExpansionThresholds);

  void import('@/systems/relic').then(({ onNodeEnter }) => onNodeEnter(node.id));
  void import('@/systems/hyperion').then(({ evaluateHyperion }) => evaluateHyperion());

  // 시간 만료 즉시 종료 (사용자 사양 — 반드시 유지)
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
    case 'gather': {
      const shards = 2 + Math.floor(rng() * 3);
      const gold = 3 + Math.floor(rng() * 5);
      run.data.timeShards += shards;
      run.data.gold += gold;
      ui.toast('success', `채집 — 시간의 조각 +${shards}, 골드 +${gold}`);
      break;
    }
    case 'activity': {
      const race = data.races.get(data.characters.get(run.data.characterId)?.raceId ?? '');
      const pool = race?.seedCardIds ?? [];
      if (pool.length > 0) {
        const cardId = pool[Math.floor(rng() * pool.length)];
        const card = data.cards.get(cardId);
        if (card) {
          run.addCardToCollection(card);
          ui.toast('success', `활동 — '${card.name}' 획득`);
          break;
        }
      }
      const gold = 5 + Math.floor(rng() * 5);
      run.data.gold += gold;
      ui.toast('success', `활동 — 골드 +${gold}`);
      break;
    }
  }

  closeDrawer();
}

function passSelected() {
  const node = selectedNode.value;
  if (!node || !timeline.value) return;
  run.visitNode(node.id, timeline.value.deckExpansionThresholds);
  ui.toast('info', '조용히 지나갑니다.');
  closeDrawer();
}

// 런 포기는 SettingsMenu(M5)로 이동됨. MapView에서 제거 (M6).

onMounted(() => {
  if (!run.active || !nodeMap.value) {
    router.push('/main');
  }
});

/**
 * 노드 간 *시각적 간격*을 늘리는 spread 계수.
 * 원본 position(0..1)에 ×SPREAD를 곱하면 SVG 좌표가 더 넓게 펼쳐진다.
 */
const SPREAD = 500;
/** 노드 점의 반지름 — M6에서 1.2 → 2.5로 확대 (시인성). */
const NODE_RADIUS = 2.5;
function svgX(node: Node): number { return node.position.x * SPREAD; }
function svgY(node: Node): number { return node.position.y * SPREAD; }

function edgePath(from: Node, to: Node): string {
  return `M ${svgX(from)} ${svgY(from)} L ${svgX(to)} ${svgY(to)}`;
}

/**
 * 카메라가 *추적*할 노드 — drawer가 열려 있으면 그 노드, 아니면 현재 위치.
 */
const focusNode = computed<Node | undefined>(() => selectedNode.value ?? currentNode.value);

// === 수동 팬 (드래그) + 줌 (wheel) ===
const panOffset = ref({ x: 0, y: 0 });
const manualPanActive = ref(false);
const scale = ref(1);
const SCALE_MIN = 0.5;
const SCALE_MAX = 2.5;

const svgEl = useTemplateRef<SVGSVGElement>('svgEl');

// pointer 추적
interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  pointerId: number;
  /** threshold 초과 시 setPointerCapture를 호출했는지. 노드 click 보존을 위해 lazy. */
  captured: boolean;
}
const dragState = ref<DragState | null>(null);
const DRAG_THRESHOLD = 4; // 픽셀 — 이 이상 움직이면 드래그로 인정

function svgRect(): DOMRect | null {
  return svgEl.value?.getBoundingClientRect() ?? null;
}
/** 픽셀 dx → SVG viewBox 좌표 dx (viewBox 100 wide). */
function pxToSvgX(px: number): number {
  const r = svgRect();
  if (!r || r.width === 0) return 0;
  return (px / r.width) * 100;
}
function pxToSvgY(px: number): number {
  const r = svgRect();
  if (!r || r.height === 0) return 0;
  return (px / r.height) * 100;
}

function onPointerDown(e: PointerEvent) {
  // **중요**: 여기서 setPointerCapture를 호출하면 그 pointer의 후속 click 이벤트가
  // SVG로만 라우팅되어 노드 <g>의 @click="clickNode"가 발화하지 않는다.
  // → 드래그가 *실제로 시작*되는 시점(threshold 초과)에 lazy capture.
  dragState.value = {
    startX: e.clientX,
    startY: e.clientY,
    originX: panOffset.value.x,
    originY: panOffset.value.y,
    pointerId: e.pointerId,
    captured: false,
  };
}

function onPointerMove(e: PointerEvent) {
  const ds = dragState.value;
  if (!ds) return;
  const dxPx = e.clientX - ds.startX;
  const dyPx = e.clientY - ds.startY;
  if (!ds.captured && Math.hypot(dxPx, dyPx) < DRAG_THRESHOLD) {
    return; // threshold 미만 — 아직 드래그 인정 X (노드 클릭 우선)
  }
  // 첫 threshold 초과 시점에 한 번만:
  //   (a) pointer capture
  //   (b) **auto camera offset을 panOffset 시작값에 흡수** — manualPanActive=true로 전환 시
  //       cameraTransform의 baseX/Y가 (autoX/autoY)→(0/0)으로 점프하는 것을 방지.
  //       즉 ds.origin에 현재 auto 보정을 더해 카메라 위치 연속성 유지.
  if (!ds.captured) {
    if (!manualPanActive.value) {
      const f = focusNode.value;
      if (f) {
        ds.originX += 50 - svgX(f);
        ds.originY += 50 - svgY(f);
      }
    }
    try { svgEl.value?.setPointerCapture(ds.pointerId); } catch { /* ignore */ }
    ds.captured = true;
  }
  manualPanActive.value = true;
  panOffset.value = {
    x: ds.originX + pxToSvgX(dxPx) / scale.value,
    y: ds.originY + pxToSvgY(dyPx) / scale.value,
  };
}

function onPointerUp(e: PointerEvent) {
  const ds = dragState.value;
  if (!ds) return;
  if (ds.captured) {
    try { svgEl.value?.releasePointerCapture(ds.pointerId); } catch { /* ignore */ }
  }
  dragState.value = null;
  // capture가 안 된(=threshold 미만) 경우 노드 click이 브라우저에 의해 정상 발화.
  void e;
}

/**
 * 우하단 "현재 위치로 이동" 버튼 — 수동 팬/줌 reset + drawer 닫기 + 카메라가 currentNode로 복귀.
 * focusNode computed가 자동으로 currentNode를 가리키게 된다.
 */
function recenterOnCurrent() {
  manualPanActive.value = false;
  panOffset.value = { x: 0, y: 0 };
  scale.value = 1;
  selectedNodeId.value = null;
}

function onWheel(e: WheelEvent) {
  // 데스크톱 wheel 줌 — 모바일 핀치는 추후.
  e.preventDefault();
  const factor = 1 + e.deltaY * -0.001;
  scale.value = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale.value * factor));
}

/**
 * 카메라 transform — focusNode를 viewBox 중앙(50,50)으로 가져오고,
 * 수동 panOffset과 scale을 합산. manualPanActive=true면 focusNode 추적 일시정지.
 */
const cameraTransform = computed<string>(() => {
  const f = focusNode.value;
  const autoX = f ? (50 - svgX(f)) : 0;
  const autoY = f ? (50 - svgY(f)) : 0;
  const baseX = manualPanActive.value ? 0 : autoX;
  const baseY = manualPanActive.value ? 0 : autoY;
  const tx = baseX + panOffset.value.x;
  const ty = baseY + panOffset.value.y;
  return `translate(${tx} ${ty}) scale(${scale.value})`;
});

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

function enterLabel(): string {
  const action = getEnterAction();
  switch (action) {
    case 'enter': return '입장';
    case 'pass': return '지나간다';
    case 'choose-combat': return '다시 싸운다';
    case 'event-pass': return '지나간다';
    case 'rest-repeat': return '잠시 쉰다';
    case 'shop-todo': return '미구현';
    case 'gather-enter': return '채집한다';
    case 'activity-enter': return '활동한다';
    case 'boss': return '도전한다';
    case 'pass-only': return '닫기';
    case 'unreachable': return '인접하지 않음';
  }
}
</script>

<template>
  <main v-if="nodeMap" class="map-view">
    <section class="graph">
      <svg
        ref="svgEl"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel="onWheel"
      >
        <!-- 카메라 — focus 노드가 항상 viewBox 중앙(50,50)에 오도록 패닝.
             CSS transition으로 부드럽게 이동. 드래그 중에는 transition 비활성. -->
        <g class="camera" :class="{ 'camera--dragging': dragState !== null }" :transform="cameraTransform">
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
              :transform="`translate(${svgX(node)} ${svgY(node)})`"
              @click="clickNode(node)"
            >
              <!-- 클릭 영역은 점보다 훨씬 큼 — 시각 노드 확대(2.5) + hitbox 4.0. -->
              <circle r="4.0" class="node-hitbox" />
              <circle :r="NODE_RADIUS" :fill="nodeKindColors[systemEffectiveKind(node, run.data)]" class="node-dot" />
              <text y="3.2" class="node-label">{{ node.label }}</text>
              <text y="5.0" class="node-kind">[{{ nodeKindLabels[systemEffectiveKind(node, run.data)] }}]</text>
            </g>
          </g>
          <!-- 현재 위치 화살표 마커 -->
          <g
            v-if="currentNode"
            class="current-arrow"
            :transform="`translate(${svgX(currentNode)} ${svgY(currentNode) - 3.0})`"
          >
            <path d="M 0 0 L -1.6 -2.8 L 0 -1.8 L 1.6 -2.8 Z" fill="#f6e8b8" />
          </g>
        </g>
      </svg>

      <!-- 우하단 "현재 위치로 이동" 버튼 — 드래그/줌으로 이탈 후 빠르게 복귀. -->
      <button
        type="button"
        class="recenter-btn"
        @click="recenterOnCurrent"
        title="현재 위치로 이동"
        aria-label="현재 위치로 이동"
      >
        <!-- 십자/타겟 SVG 아이콘 — 이모지보다 일관된 크기/색 -->
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/>
          <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
          <line x1="12" y1="1" x2="12" y2="5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="1" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="19" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
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
          :disabled="getEnterAction() === 'unreachable'"
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
  grid-template-rows: 1fr;
  gap: 1rem;
  height: 100vh;
  padding: 1rem 1.5rem;
}

.graph {
  grid-column: 1;
  grid-row: 1;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}
.graph svg {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none; /* 브라우저 기본 팬·줌 방지 — 우리가 처리 */
  cursor: grab;
}
.graph svg:active { cursor: grabbing; }

/* 우하단 "현재 위치로 이동" 버튼 — graph 내부 absolute로 drawer/모바일 영향 회피. */
.recenter-btn {
  position: absolute;
  right: 0.9rem;
  bottom: 0.9rem;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(20, 22, 32, 0.85);
  border: 1px solid rgba(246, 232, 184, 0.4);
  color: #f6e8b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  transition: background 140ms ease, transform 140ms ease, border-color 140ms ease;
}
.recenter-btn:hover {
  background: rgba(40, 42, 54, 0.95);
  border-color: rgba(246, 232, 184, 0.8);
  transform: scale(1.05);
}
.recenter-btn:active { transform: scale(0.94); }
.recenter-btn:focus-visible {
  outline: 2px solid #c08eff;
  outline-offset: 2px;
}

/* 카메라 — focus 노드 추적. transform 변경에 부드러운 transition.
   드래그 중에는 transition 끔(즉시 반영). */
.camera {
  transition: transform 480ms cubic-bezier(0.32, 0.72, 0, 1);
}
.camera--dragging {
  transition: none;
}

.edges .edge {
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 0.18;
  fill: none;
}
.node-group { cursor: pointer; }
.node-hitbox {
  fill: transparent;
  pointer-events: all;
}
.node-group--reachable .node-dot {
  filter: drop-shadow(0 0 1.2px currentColor);
  animation: pulse 1.4s ease-in-out infinite;
}
.node-group--current .node-dot {
  stroke: #f6e8b8;
  stroke-width: 0.3;
}
.node-group--visited .node-dot { opacity: 0.7; }
.node-group--cleared .node-dot { opacity: 0.35; }
.node-group--stealthed .node-dot {
  opacity: 0.55;
  stroke: #8eedff;
  stroke-dasharray: 0.4 0.25;
  stroke-width: 0.22;
}
.node-group--selected .node-dot {
  stroke: #c08eff;
  stroke-width: 0.4;
}

.node-label { fill: #e9e9f4; font-size: 1.7px; text-anchor: middle; font-weight: 600; }
.node-kind { fill: #888; font-size: 1.2px; text-anchor: middle; }

.current-arrow {
  pointer-events: none;
  animation: bob 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
@keyframes bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1.6px); }
}

.drawer {
  grid-column: 2;
  grid-row: 1;
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

.drawer__hdr { display: flex; align-items: center; gap: 0.4rem; }
.drawer__kind { font-size: 0.8rem; }
.drawer__hdr h2 { flex: 1; margin: 0; color: #f6e8b8; font-size: 1.2rem; }
.drawer__x { background: none; border: none; color: #888; cursor: pointer; font-size: 1.4rem; line-height: 1; }
.drawer__x:hover { color: #f6e8b8; }

.drawer__status { font-size: 0.85rem; color: #c08eff; }
.drawer__desc { color: #b6b6c4; line-height: 1.6; margin: 0; }

.drawer__actions { display: flex; flex-direction: column; gap: 0.5rem; margin-top: auto; }
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
.drawer__enter:hover:not(:disabled) { background: rgba(192, 142, 255, 0.3); }
.drawer__enter:disabled { opacity: 0.4; cursor: not-allowed; }
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
    grid-template-rows: 1fr;
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
