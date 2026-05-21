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
import { restHealMul, lockedTownCount, isNoShop } from '@/systems/chaos';
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

/**
 * 카오스로 잠긴 노드 집합 — 진입 불가 + 회색.
 *   - locked-town(닫힌 성문): 마을 노드를 *결정적*으로 N개 잠금(노드 id 정렬 후 앞 N개).
 *     단, 시작 노드(현재 위치 시작점)는 잠그지 않는다.
 *   - no-shop(닫힌 시장): 모든 상점 노드 잠금.
 */
const chaosLockedNodes = computed<Set<NodeId>>(() => {
  const locked = new Set<NodeId>();
  const map = nodeMap.value;
  if (!map) return locked;

  // no-shop: 상점 노드 전부.
  if (isNoShop()) {
    for (const n of map.nodes) {
      if (systemEffectiveKind(n, run.data) === 'shop') locked.add(n.id);
    }
  }

  // locked-town: 마을 노드 id 정렬 후 앞 N개(시작 노드 제외).
  const townN = lockedTownCount();
  if (townN > 0) {
    const towns = map.nodes
      .filter((n) => systemEffectiveKind(n, run.data) === 'village' && n.id !== map.startNodeId)
      .map((n) => n.id)
      .sort();
    for (const id of towns.slice(0, townN)) locked.add(id);
  }
  return locked;
});

const reachable = computed<Set<NodeId>>(() => {
  if (!nodeMap.value) return new Set();
  // 사용자 사양: 시간 만료 = 즉시 종료. 보스 게이트로 갈 필요 없음.
  // 따라서 인접 노드는 항상 동일하게 반환. (카오스로 잠긴 노드는 제외.)
  const neighbors = getNeighbors(nodeMap.value, run.data.currentNodeId, run.data);
  return new Set(neighbors.map((n) => n.id).filter((id) => !chaosLockedNodes.value.has(id)));
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
function clickNode(node: Node, e?: MouseEvent) {
  // 편집 모드: Ctrl-클릭 → 위치 교체, Alt-클릭 → 간선 토글 (드로어 열지 않음).
  if (editMode.value && (e?.ctrlKey || e?.metaKey)) { e?.preventDefault(); handleSwapClick(node); return; }
  if (editMode.value && e?.altKey) { e?.preventDefault(); handleEdgeClick(node); return; }
  selectedNodeId.value = node.id;
  // 노드 클릭 시 수동 팬 리셋 → 카메라가 그 노드(focus)로 부드럽게 이동.
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
  | 'shop-enter'
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
      return 'shop-enter';
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
      // 카오스 light-rest(얕은 잠) — 휴식 회복 ×(1-합).
      const heal = Math.floor(run.data.maxHp * 0.3 * restHealMul());
      run.data.hp = Math.min(run.data.maxHp, run.data.hp + heal);
      ui.toast('success', heal > 0 ? `HP +${heal} 회복` : '잠이 얕아 회복하지 못했다.');
      void import('@/systems/relic').then(({ onRest }) => onRest());
      break;
    }
    case 'shop':
      router.push('/game/shop');
      break;
    case 'gather': {
      void import('@/systems/gathering').then(({ performGather }) => performGather(node.id));
      break;
    }
    case 'activity': {
      void import('@/systems/activity').then(({ performActivity }) => performActivity(node.id));
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
const SPREAD = 644; // 육각 1셀 폭 — 560 → 644 (+15%).
/** 노드 점의 반지름 — 시인성 위해 2.5 → 3.0 (+20%). */
const NODE_RADIUS = 3.0;
/**
 * 권역 explode — 데이터가 이미 육각 격자로 권역을 분리하므로 0(격자를 일그러뜨리지 않게).
 * (육각 재배치 이전에는 0.3으로 권역을 시각 분리했음.)
 */
const REGION_EXPLODE = 0;

/**
 * 권역 분리(explode) 오프셋 — 노드별 (권역중심 - 맵중심) × EXPLODE.
 * 같은 권역끼리는 그대로 모이고, 권역 덩어리끼리는 바깥으로 벌어진다.
 */
const explodeOffsets = computed<Map<NodeId, { x: number; y: number }>>(() => {
  const offsets = new Map<NodeId, { x: number; y: number }>();
  const map = nodeMap.value;
  if (!map || map.nodes.length === 0) return offsets;
  // 맵 전체 중심.
  let mx = 0, my = 0;
  for (const n of map.nodes) { mx += n.position.x; my += n.position.y; }
  mx /= map.nodes.length; my /= map.nodes.length;
  // 권역별 중심.
  const sums = new Map<string, { x: number; y: number; n: number }>();
  for (const n of map.nodes) {
    const r = n.region ?? '__none__';
    const s = sums.get(r) ?? { x: 0, y: 0, n: 0 };
    s.x += n.position.x; s.y += n.position.y; s.n += 1;
    sums.set(r, s);
  }
  for (const n of map.nodes) {
    const s = sums.get(n.region ?? '__none__');
    const cx = s ? s.x / s.n : mx;
    const cy = s ? s.y / s.n : my;
    offsets.set(n.id, { x: (cx - mx) * REGION_EXPLODE, y: (cy - my) * REGION_EXPLODE });
  }
  return offsets;
});

function svgX(node: Node): number {
  const off = explodeOffsets.value.get(node.id);
  return (node.position.x + (off?.x ?? 0)) * SPREAD;
}
function svgY(node: Node): number {
  const off = explodeOffsets.value.get(node.id);
  return (node.position.y + (off?.y ?? 0)) * SPREAD;
}

function edgePath(from: Node, to: Node): string {
  return `M ${svgX(from)} ${svgY(from)} L ${svgX(to)} ${svgY(to)}`;
}

/**
 * 카메라가 *추적*할 노드 — drawer가 열려 있으면 그 노드, 아니면 현재 위치.
 */
const focusNode = computed<Node | undefined>(() => selectedNode.value ?? currentNode.value);

/**
 * === 가시성 모델 (권역·거리 기반 fog) ===
 * 기준 = focusNode(클릭 선택 노드, 없으면 현재 위치). focusRegion = 그 권역.
 * 티어:
 *   a (full)   : 현재 위치 노드, focusNode, 또는 focusRegion 안에서 focusNode와 거리 1 이내 → 이름·특징 표시.
 *   b (faint)  : focusRegion 안의 그 외 노드 → 이름 가림 + 살짝만 투명.
 *   c (gateway): focusRegion이 *아닌* 권역이지만 focusRegion과 인접한 노드(=권역 출구) → 점만 표시.
 *   d (hidden) : 그 외(다른 권역 내부) → 숨김. (게이트웨이를 눌러 이동/선택하면 그 권역이 드러남.)
 */
const adjacency = computed<Map<NodeId, Set<NodeId>>>(() => {
  const m = new Map<NodeId, Set<NodeId>>();
  const map = nodeMap.value;
  if (!map) return m;
  const ensure = (id: NodeId) => { let s = m.get(id); if (!s) { s = new Set(); m.set(id, s); } return s; };
  for (const n of map.nodes) {
    const s = ensure(n.id);
    for (const nb of n.neighbors) { s.add(nb); ensure(nb).add(n.id); } // 대칭
  }
  return m;
});

const focusRegion = computed<string | undefined>(() => focusNode.value?.region);

/** 권역 id → 표시 이름 (노드 아래 작게 표기용). */
const regionName = computed<Map<string, string>>(() => {
  const m = new Map<string, string>();
  for (const r of nodeMap.value?.regions ?? []) m.set(r.id, r.name);
  return m;
});
function regionLabel(node: Node): string {
  return regionName.value.get(node.region ?? '') ?? node.region ?? '';
}

/** focusRegion이 아닌 권역이면서 focusRegion 노드와 인접한 노드들(권역 출구). */
const gateways = computed<Set<NodeId>>(() => {
  const set = new Set<NodeId>();
  const map = nodeMap.value;
  const fr = focusRegion.value;
  if (!map || !fr) return set;
  for (const n of map.nodes) {
    if (n.region === fr) continue;
    for (const nb of adjacency.value.get(n.id) ?? []) {
      if (getNode(map, nb)?.region === fr) { set.add(n.id); break; }
    }
  }
  return set;
});

type VisTier = 'a' | 'b' | 'c' | 'd';
const nodeTiers = computed<Map<NodeId, VisTier>>(() => {
  const m = new Map<NodeId, VisTier>();
  const map = nodeMap.value;
  const sel = focusNode.value;
  if (!map) return m;
  // 편집 모드: 안개 해제 — 전체 노드 표시(이름·간선 포함).
  if (editMode.value) { for (const n of map.nodes) m.set(n.id, 'a'); return m; }
  const fr = focusRegion.value;
  const selNbrs = sel ? (adjacency.value.get(sel.id) ?? new Set<NodeId>()) : new Set<NodeId>();
  for (const n of map.nodes) {
    let t: VisTier;
    if (!sel || n.id === run.data.currentNodeId || n.id === sel.id) {
      t = 'a'; // 현재 위치·선택 노드는 항상 풀
    } else if (n.region === fr) {
      t = selNbrs.has(n.id) ? 'a' : 'b';
    } else {
      t = gateways.value.has(n.id) ? 'c' : 'd';
    }
    m.set(n.id, t);
  }
  return m;
});
function tierOf(id: NodeId): VisTier { return nodeTiers.value.get(id) ?? 'a'; }
/** 간선: 한 끝이라도 hidden(d)이면 숨김. */
function edgeHidden(a: NodeId, b: NodeId): boolean { return tierOf(a) === 'd' || tierOf(b) === 'd'; }
/** 간선: focusNode에 닿으면 글로우. */
function isFocusEdge(a: NodeId, b: NodeId): boolean {
  const f = focusNode.value?.id;
  return a === f || b === f;
}

// === 수동 팬 (드래그) + 줌 (wheel/버튼/핀치) ===
const panOffset = ref({ x: 0, y: 0 }); // focusNode 기준 월드 단위 이동(0=focus 추적).
const scale = ref(1);
const SCALE_MIN = 0.3;
const SCALE_MAX = 3.0;

const svgEl = useTemplateRef<SVGSVGElement>('svgEl');

/** 줌 버튼/핀치 공용 — 현재 scale에 factor를 곱해 클램프. */
function zoomBy(factor: number) {
  scale.value = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale.value * factor));
}

// ============================================================
// === 맵 에디터 (dev 전용) ===
//   편집 모드 ON: 안개 해제(전체 표시).
//   Ctrl+클릭 두 노드 → 위치 교체 (격자 위 자리만 교환 — 스냅 계산 없이 항상 유효한 셀 유지).
//   Alt+클릭 두 노드 → 간선 추가/제거 (양방향).
//   '저장' → /__map-save 로 act-1-map.txt 갱신 + 수동 잠금 파일 생성.
// ============================================================
const EDIT_ENABLED = import.meta.env.DEV;
const editMode = ref(false);
const editStatus = ref('');
const swapStartId = ref<NodeId | null>(null); // Ctrl 위치 교체 시작 노드
const edgeStartId = ref<NodeId | null>(null); // Alt 간선 토글 시작 노드

/** Ctrl+클릭 두 노드 위치 교체 — 자리(=격자 셀)만 맞교환하므로 항상 격자 위에 유지. */
function handleSwapClick(node: Node) {
  const map = nodeMap.value;
  if (!map) return;
  edgeStartId.value = null;
  if (!swapStartId.value) { swapStartId.value = node.id; editStatus.value = `위치 교체 시작: ${node.id} (교체할 노드 Ctrl-클릭)`; return; }
  if (swapStartId.value === node.id) { swapStartId.value = null; editStatus.value = '위치 교체 취소'; return; }
  const a = getNode(map, swapStartId.value);
  const b = node;
  if (a && b) {
    const tx = a.position.x, ty = a.position.y;
    a.position.x = b.position.x; a.position.y = b.position.y;
    b.position.x = tx; b.position.y = ty;
    editStatus.value = `위치 교체: ${a.id} ↔ ${b.id}`;
  }
  swapStartId.value = null;
}

/** Alt+클릭 두 노드 간선 토글(양방향). */
function handleEdgeClick(node: Node) {
  const map = nodeMap.value;
  if (!map) return;
  swapStartId.value = null;
  if (!edgeStartId.value) { edgeStartId.value = node.id; editStatus.value = `간선 시작: ${node.id} (다른 노드 Alt-클릭)`; return; }
  if (edgeStartId.value === node.id) { edgeStartId.value = null; editStatus.value = '간선 선택 취소'; return; }
  const a = getNode(map, edgeStartId.value);
  const b = node;
  if (a && b) {
    if (a.neighbors.includes(b.id)) {
      a.neighbors = a.neighbors.filter((n) => n !== b.id);
      b.neighbors = b.neighbors.filter((n) => n !== a.id);
      editStatus.value = `간선 제거: ${a.id} ✕ ${b.id}`;
    } else {
      a.neighbors = [...a.neighbors, b.id];
      b.neighbors = [...b.neighbors, a.id];
      editStatus.value = `간선 추가: ${a.id} ↔ ${b.id}`;
    }
  }
  edgeStartId.value = null;
}

/**
 * 자동 간선 배치 — 현재 focus 노드의 *권역 내* 간선을 근접(육각 인접) 기준으로 재배치.
 * 권역 밖으로 나가는 간선(브리지)은 그대로 보존. 노드당 최대 6 유지, 고립 노드는 최근접 1개로 연결.
 */
function autoLayoutEdges() {
  const map = nodeMap.value;
  const fr = focusRegion.value;
  if (!map || !fr) { editStatus.value = '먼저 노드를 선택하세요'; return; }
  const region = map.nodes.filter((n) => n.region === fr);
  if (region.length < 2) { editStatus.value = '권역 노드가 부족합니다'; return; }
  const inRegion = new Set(region.map((n) => n.id));
  const dist = (a: Node, b: Node) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);

  // 셀 피치 추정 = 권역 내 최소 쌍거리. 임계 = 피치×1.4 (육각 인접만 포착, 다음 링 제외).
  let pitch = Infinity;
  for (let i = 0; i < region.length; i++)
    for (let j = i + 1; j < region.length; j++) {
      const d = dist(region[i], region[j]);
      if (d > 1e-6 && d < pitch) pitch = d;
    }
  const thresh = pitch * 1.4;

  // 1) 권역 내부 간선 전부 제거(브리지=한쪽이 권역 밖 인 간선은 보존).
  for (const n of region) n.neighbors = n.neighbors.filter((nb) => !inRegion.has(nb));

  // 2) 근접 쌍을 가까운 순으로 연결 (양방향, 노드당 ≤6).
  const pairs: Array<[number, Node, Node]> = [];
  for (let i = 0; i < region.length; i++)
    for (let j = i + 1; j < region.length; j++) {
      const d = dist(region[i], region[j]);
      if (d <= thresh) pairs.push([d, region[i], region[j]]);
    }
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [, a, b] of pairs) {
    if (a.neighbors.length >= 6 || b.neighbors.length >= 6) continue;
    if (!a.neighbors.includes(b.id)) { a.neighbors = [...a.neighbors, b.id]; b.neighbors = [...b.neighbors, a.id]; }
  }

  // 3) 고립(권역 내 간선 0) 노드는 권역 내 최근접 노드로 1개 연결(맵 단절 방지).
  for (const n of region) {
    if (n.neighbors.some((nb) => inRegion.has(nb))) continue;
    let best: Node | null = null, bd = Infinity;
    for (const m of region) {
      if (m.id === n.id) continue;
      const d = dist(n, m);
      if (d < bd) { bd = d; best = m; }
    }
    if (best && !n.neighbors.includes(best.id)) {
      n.neighbors = [...n.neighbors, best.id];
      best.neighbors = [...best.neighbors, n.id];
    }
  }
  editStatus.value = `${fr} 권역 간선 재배치 (${region.length}노드)`;
}

async function saveMap() {
  const map = nodeMap.value;
  if (!map) return;
  const nodes: Record<string, { x: number; y: number; neighbors: string[] }> = {};
  for (const n of map.nodes) nodes[n.id] = { x: n.position.x, y: n.position.y, neighbors: [...n.neighbors] };
  editStatus.value = '저장 중…';
  try {
    const res = await fetch('/__map-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes }),
    });
    if (res.ok) { const j = await res.json(); editStatus.value = `저장됨 (${j.count} 노드) — 자동 레이아웃 잠금`; }
    else editStatus.value = `저장 실패 (${res.status})`;
  } catch (err) {
    editStatus.value = '저장 실패: ' + String(err);
  }
}

function toggleEditMode() {
  editMode.value = !editMode.value;
  swapStartId.value = null;
  edgeStartId.value = null;
  editStatus.value = editMode.value ? '편집 모드 — Ctrl+클릭×2 위치교체 / Alt+클릭×2 간선' : '';
}

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

// === 핀치 줌 (모바일 두 손가락) ===
const activePointers = new Map<number, { x: number; y: number }>();
let pinchStartDist = 0;
let pinchStartScale = 1;
const pinching = ref(false);

function pointerDist(): number {
  const pts = Array.from(activePointers.values());
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

function onPointerDown(e: PointerEvent) {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // 두 번째 손가락 → 핀치 시작. 진행 중이던 드래그는 취소(핀치 우선).
  if (activePointers.size === 2) {
    pinching.value = true;
    pinchStartDist = pointerDist();
    pinchStartScale = scale.value;
    dragState.value = null;
    return;
  }
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
  // 핀치 진행 중이면 두 포인터 거리비로 줌.
  if (pinching.value && activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2 && pinchStartDist > 0) {
      const cur = pointerDist();
      scale.value = Math.max(SCALE_MIN, Math.min(SCALE_MAX, pinchStartScale * (cur / pinchStartDist)));
    }
    return;
  }
  const ds = dragState.value;
  if (!ds) return;
  const dxPx = e.clientX - ds.startX;
  const dyPx = e.clientY - ds.startY;
  if (!ds.captured && Math.hypot(dxPx, dyPx) < DRAG_THRESHOLD) {
    return; // threshold 미만 — 아직 드래그 인정 X (노드 클릭 우선)
  }
  // 첫 threshold 초과 시점에 한 번만 pointer capture(노드 click 보존을 위해 lazy).
  if (!ds.captured) {
    try { svgEl.value?.setPointerCapture(ds.pointerId); } catch { /* ignore */ }
    ds.captured = true;
  }
  // panOffset = focusNode 기준 월드 단위 이동량. /scale로 픽셀↔월드 1:1 추적.
  panOffset.value = {
    x: ds.originX + pxToSvgX(dxPx) / scale.value,
    y: ds.originY + pxToSvgY(dyPx) / scale.value,
  };
}

function onPointerUp(e: PointerEvent) {
  activePointers.delete(e.pointerId);
  // 손가락이 2개 미만이 되면 핀치 종료. 남은 한 손가락이 곧장 드래그로 이어지지 않게 dragState도 정리.
  if (pinching.value && activePointers.size < 2) {
    pinching.value = false;
    dragState.value = null;
    return;
  }
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
 * 카메라 transform — *scale에 무관하게* 카메라 타겟을 viewBox 중앙(50,50)에 둔다.
 *   transform = translate(50 50) scale(s) translate(-targetX -targetY)
 * 타겟 = focusNode 월드좌표 − panOffset(월드 단위 수동 이동). panOffset=0이면 focusNode 추적.
 * (이전 식 `translate(50-svgX) scale`은 s≠1에서 중심이 어긋나 줌아웃 시 화면을 벗어났음.)
 */
const cameraTransform = computed<string>(() => {
  const f = focusNode.value;
  const fx = f ? svgX(f) : SPREAD * 0.5;
  const fy = f ? svgY(f) : SPREAD * 0.5;
  const targetX = fx - panOffset.value.x;
  const targetY = fy - panOffset.value.y;
  return `translate(50 50) scale(${scale.value}) translate(${-targetX} ${-targetY})`;
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
    case 'shop-enter': return '상점에 들어간다';
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
        <g
          class="camera"
          :class="{ 'camera--dragging': dragState !== null }"
          :transform="cameraTransform"
        >
          <!-- 인접 선 — focusNode에 닿는 간선은 글로우, 숨김 노드에 닿는 간선은 숨김. -->
          <g class="edges">
            <template v-for="node in nodeMap.nodes" :key="`e-${node.id}`">
              <path
                v-for="nb in node.neighbors.filter((n: string) => n > node.id)"
                :key="`${node.id}-${nb}`"
                :d="edgePath(node, getNode(nodeMap, nb)!)"
                :class="['edge', { 'edge--active': isFocusEdge(node.id, nb), 'edge--hidden': edgeHidden(node.id, nb) }]"
              />
            </template>
          </g>
          <!-- 노드 -->
          <g class="nodes">
            <g
              v-for="node in nodeMap.nodes"
              :key="node.id"
              class="node-group"
              :class="[
                `node-group--vis-${tierOf(node.id)}`,
                {
                  'node-group--current': node.id === run.data.currentNodeId,
                  'node-group--reachable': reachable.has(node.id),
                  'node-group--visited': run.data.nodeStates[node.id]?.visited,
                  'node-group--cleared': run.data.nodeStates[node.id]?.combatCleared,
                  'node-group--stealthed': run.data.nodeStates[node.id]?.combatStealthed,
                  'node-group--selected': selectedNodeId === node.id,
                  'node-group--chaos-locked': chaosLockedNodes.has(node.id),
                  'node-group--edge-start': edgeStartId === node.id,
                  'node-group--swap-start': swapStartId === node.id,
                },
              ]"
              :transform="`translate(${svgX(node)} ${svgY(node)})`"
              @click="clickNode(node, $event)"
            >
              <!-- 클릭 영역은 점보다 훨씬 큼 — 시각 노드 확대(3.0) + hitbox 4.8. -->
              <circle r="4.8" class="node-hitbox" />
              <circle :r="NODE_RADIUS" :fill="nodeKindColors[systemEffectiveKind(node, run.data)]" class="node-dot" />
              <text y="5.5" class="node-label">{{ node.label }}</text>
              <text y="7.4" class="node-kind">[{{ nodeKindLabels[systemEffectiveKind(node, run.data)] }}]</text>
              <text y="9.1" class="node-region">{{ regionLabel(node) }}</text>
            </g>
          </g>
          <!-- 현재 위치 화살표 마커.
               **중요**: SVG element의 CSS `transform`은 attribute `transform`을 오버라이드한다.
               따라서 위치(translate) 그룹과 애니메이션(bob) 그룹을 분리해야 한다. -->
          <g
            v-if="currentNode"
            :transform="`translate(${svgX(currentNode)} ${svgY(currentNode) - 3.6})`"
          >
            <g class="current-arrow">
              <path d="M 0 0 L -1.6 -2.8 L 0 -1.8 L 1.6 -2.8 Z" fill="#f6e8b8" />
            </g>
          </g>
        </g>
      </svg>

      <!-- 맵 에디터 툴바 (dev 전용) — 편집 토글 / 저장 / 상태. -->
      <div v-if="EDIT_ENABLED" class="editor-bar">
        <button type="button" class="editor-btn" :class="{ 'editor-btn--on': editMode }" @click="toggleEditMode">
          {{ editMode ? '편집 종료' : '편집' }}
        </button>
        <button v-if="editMode" type="button" class="editor-btn" @click="autoLayoutEdges">자동 간선 배치</button>
        <button v-if="editMode" type="button" class="editor-btn editor-btn--save" @click="saveMap">저장</button>
        <span v-if="editStatus" class="editor-status">{{ editStatus }}</span>
      </div>

      <!-- 우하단 줌 버튼 (＋/－) — 모바일/터치에서도 확대·축소 가능. -->
      <div class="zoom-controls">
        <button type="button" class="zoom-btn" @click="zoomBy(1.25)" title="확대" aria-label="확대">+</button>
        <button type="button" class="zoom-btn" @click="zoomBy(0.8)" title="축소" aria-label="축소">−</button>
      </div>

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
      <p v-if="chaosLockedNodes.has(selectedNode.id)" class="drawer__locked">🔒 카오스로 닫혀 들어갈 수 없다.</p>
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
  /* 드래그 중 텍스트 선택이 활성화되어 드래그가 끊기는 문제 방지. */
  user-select: none;
  -webkit-user-select: none;
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

/* 줌 버튼 (＋/−) — recenter 버튼 위에 세로로. 터치/모바일 확대·축소. */
.zoom-controls {
  position: absolute;
  right: 0.9rem;
  bottom: 4.4rem; /* recenter(46px) 위 */
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  z-index: 5;
}
.zoom-btn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(20, 22, 32, 0.85);
  border: 1px solid rgba(246, 232, 184, 0.4);
  color: #f6e8b8;
  cursor: pointer;
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  transition: background 140ms ease, transform 140ms ease, border-color 140ms ease;
}
.zoom-btn:hover {
  background: rgba(40, 42, 54, 0.95);
  border-color: rgba(246, 232, 184, 0.8);
}
.zoom-btn:active { transform: scale(0.94); }
.zoom-btn:focus-visible { outline: 2px solid #c08eff; outline-offset: 2px; }

/* === 맵 에디터 툴바 (dev 전용) === */
.editor-bar {
  position: absolute;
  left: 0.9rem;
  top: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  z-index: 6;
}
.editor-btn {
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  background: rgba(20, 22, 32, 0.9);
  border: 1px solid rgba(246, 232, 184, 0.45);
  color: #f6e8b8;
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
}
.editor-btn:hover { background: rgba(40, 42, 54, 0.95); }
.editor-btn--on { background: rgba(192, 142, 255, 0.3); border-color: #c08eff; }
.editor-btn--save { background: rgba(142, 255, 184, 0.18); border-color: rgba(142, 255, 184, 0.5); color: #bfffd6; }
.editor-status {
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #d6d6e0;
  font-size: 0.78rem;
  max-width: 60vw;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 간선 시작(Alt) 선택 노드 — 청록 링. */
.node-group--edge-start .node-dot {
  stroke: #8eedff;
  stroke-width: 0.6;
}
/* 위치 교체(Ctrl) 시작 노드 — 보라 링. */
.node-group--swap-start .node-dot {
  stroke: #c08eff;
  stroke-width: 0.6;
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
  transition: opacity 200ms ease;
}
/* 현재 노드에 직접 닿는 간선 — 항상 밝게 빛나도록 강조(글로우 + 은은한 펄스). */
.edge--active {
  stroke: #ffe8a0;
  stroke-width: 0.42;
  filter: drop-shadow(0 0 1.4px #ffe88e) drop-shadow(0 0 0.6px #fff6d0);
  animation: edge-glow 1.6s ease-in-out infinite;
}
@keyframes edge-glow {
  0%, 100% { stroke: #ffe8a0; filter: drop-shadow(0 0 1.1px rgba(255,232,142,0.7)); }
  50%      { stroke: #fff6d0; filter: drop-shadow(0 0 2.2px rgba(255,240,180,0.95)) drop-shadow(0 0 1px #fff6d0); }
}
.node-group { cursor: pointer; opacity: 1; transition: opacity 200ms ease; }
.node-hitbox {
  fill: transparent;
  pointer-events: all;
}

/* === 가시성 티어 (권역·거리 fog) ===
   a: 현재 위치/선택 노드 + 같은 권역 거리1 → 이름·특징 표시(풀).
   b: 같은 권역 그 외 → 이름 가림 + 살짝만 투명.
   c: 다른 권역 출구(게이트웨이) → 점만 표시.
   d: 그 외 → 숨김(클릭 불가). */
.node-group--vis-a { opacity: 1; }
.node-group--vis-c { opacity: 1; }
.node-group--vis-b { opacity: 0.5; }
.node-group--vis-d { opacity: 0; pointer-events: none; }
/* b/c/d 는 이름·종류 라벨 숨김 (a 만 표시). */
.node-group--vis-b .node-label, .node-group--vis-b .node-kind, .node-group--vis-b .node-region,
.node-group--vis-c .node-label, .node-group--vis-c .node-kind, .node-group--vis-c .node-region,
.node-group--vis-d .node-label, .node-group--vis-d .node-kind, .node-group--vis-d .node-region { display: none; }
/* 숨김 간선. */
.edge--hidden { opacity: 0; }
/* 현재 노드의 점은 흐림(visited 등)과 무관하게 또렷하게. */
.node-group--current .node-dot { opacity: 1; }
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
/* 카오스로 잠긴 노드 — 회색 + 펄스 제거. */
.node-group--chaos-locked .node-dot {
  fill: #555 !important;
  opacity: 0.5;
  animation: none;
  filter: none;
}
.node-group--chaos-locked .node-label,
.node-group--chaos-locked .node-kind,
.node-group--chaos-locked .node-region { fill: #666; }

/* 라벨은 클릭 받지 않음 — 클릭은 hitbox circle이 처리. 드래그 시 text selection 차단. */
.node-label { fill: #e9e9f4; font-size: 2.05px; text-anchor: middle; font-weight: 600; pointer-events: none; }
.node-kind { fill: #888; font-size: 1.45px; text-anchor: middle; pointer-events: none; }
/* 권역명 — 노드 이름 아래 작게/흐리게(권역 색조). */
.node-region { fill: #9a8fb8; font-size: 1.25px; text-anchor: middle; pointer-events: none; }

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
.drawer__locked { font-size: 0.85rem; color: #9a8fb8; margin: 0; }
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

/* 모바일: 지도(위) + 드로어(아래) 2행 — 드로어가 오버레이가 아니라 한 행을 차지하므로
   지도가 드로어를 *제외한 나머지 영역*에 맞춰 줄어든다. 드로어는 완전 불투명. */
@media (max-width: 720px) {
  .map-view {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
  .graph {
    grid-column: 1;
    grid-row: 1;
  }
  .drawer {
    grid-column: 1;
    grid-row: 2;
    position: static;
    max-height: 46vh;
    border-radius: 12px 12px 0 0;
    /* 완전 불투명 — 지도 위로 비치지 않게 가시성 확보. */
    background: #14151d;
    border-color: rgba(246, 232, 184, 0.25);
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.55);
  }
}
</style>
