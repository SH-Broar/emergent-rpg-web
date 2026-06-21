/**
 * 노드 맵 이동 시스템.
 *
 * spec v2 Round 4/11:
 *  - 거미줄형 자유 이동 (인접 노드만)
 *  - 노드 방문 = 시간 1 카운트 진행
 *  - 시간 임계 도달 시 *덱 확장* 또는 *보스 게이트 활성*
 */

import type { NodeId, NodeKind, NodeMap, Node, NodeStateRecord, Region, RunState } from '@/data/schemas';

/**
 * 노드의 *유효 kind* — RunState의 nodeKindOverrides 우선, 없으면 원본.
 * 하루 경과 시 일부 노드 kind가 권역 풀 내에서 재추첨됨.
 */
export function effectiveKind(node: Node, runState: RunState): NodeKind {
  return runState.nodeKindOverrides[node.id] ?? node.kind;
}

/**
 * 노드의 *유효 콘텐츠* — RunState의 nodeContentOverrides 우선, 없으면 원본 contentRef.
 * 권역 풀에서 재추첨된 enemy/event를 반영.
 */
export function effectiveContent(
  node: Node,
  runState: RunState,
): { enemyGroupId?: string; eventIdPool?: string[]; bossId?: string; npcIdPool?: string[] } {
  const override = runState.nodeContentOverrides[node.id];
  const base = node.contentRef ?? {};
  return {
    enemyGroupId: override?.enemyGroupId ?? base.enemyGroupId,
    eventIdPool: override?.eventIdPool ?? base.eventIdPool,
    bossId: base.bossId,
    npcIdPool: base.npcIdPool,
  };
}

/**
 * 노드가 *정리됨*(회색·자동통과)인가 — 종류별 소비 판정. (노드 재활성 모델, 2026-06-21)
 *
 * 이 헬퍼는 *게이트형*(전투/엘리트/보스) 노드 전용이다 — 그 노드를 자동 통과('pass')시켜도 되는지,
 * 맵에서 회색으로 칠해도 되는지를 결정한다. event/gather/rest/activity 등은 호출하지 않는다
 * (그쪽은 eventTriggered/gatherDone 등 자체 플래그로 기존대로 판정).
 *
 *  - boss/arc 보스 : combatCleared만으로 정리됨(보스 노드엔 거래가 없다).
 *  - 전투/엘리트   : combatCleared && tradeCleared *둘 다*라야 정리됨.
 *      한쪽만 소비(부분)면 정리 아님 → 게이트로 라우팅돼 남은 옵션만 보인다.
 *  - 그 외 종류    : 이 헬퍼 비대상 — false(호출부가 기존 경로를 쓰게 둔다).
 *
 * state는 그 노드의 NodeStateRecord(없을 수 있음). undefined면 미소비(false).
 */
export function isNodeSettled(node: Node, state: NodeStateRecord | undefined, runState: RunState): boolean {
  const kind = effectiveKind(node, runState);
  switch (kind) {
    case 'boss':
      return !!state?.combatCleared;
    case 'combat':
    case 'elite':
      return !!state?.combatCleared && !!state?.tradeCleared;
    default:
      return false;
  }
}

/** 노드 맵에서 해당 ID의 region 정의를 찾음. */
export function findRegion(map: NodeMap, regionId: string | undefined): Region | undefined {
  if (!regionId) return undefined;
  return map.regions.find((r) => r.id === regionId);
}

/**
 * 현재 노드에서 이동 가능한 인접 노드 목록.
 * runState가 주어지면 *조건부 인접*도 평가하여 추가.
 */
export function getNeighbors(
  map: NodeMap,
  currentNodeId: NodeId,
  runState?: RunState,
): Node[] {
  const current = map.nodes.find((n) => n.id === currentNodeId);
  if (!current) return [];

  const ids = new Set<NodeId>(current.neighbors);

  // 조건부 인접 평가 (현재 미사용 — 데이터 구조만 준비)
  if (current.conditionalNeighbors && runState) {
    for (const cn of current.conditionalNeighbors) {
      if (evaluateCondition(cn.requires, runState)) {
        ids.add(cn.nodeId);
      }
    }
  }

  return [...ids]
    .map((id) => map.nodes.find((n) => n.id === id))
    .filter((n): n is Node => n !== undefined);
}

/**
 * 조건 표현식 평가. 매우 단순 (확장 가능).
 * 형식 예시:
 *   "event:<nodeId>:triggered"  — 해당 노드 이벤트가 발생했는가
 *   "combat:<nodeId>:cleared"   — 해당 노드 전투가 클리어됐는가
 *   "node:<nodeId>:visited"     — 해당 노드를 방문했는가
 */
function evaluateCondition(condition: string, state: RunState): boolean {
  const [kind, nodeId, what] = condition.split(':');
  const ns = state.nodeStates[nodeId];
  if (!ns) return false;
  if (kind === 'node' && what === 'visited') return ns.visited;
  if (kind === 'event' && what === 'triggered') return !!ns.eventTriggered;
  if (kind === 'combat' && what === 'cleared') return !!ns.combatCleared;
  return false;
}

/** 노드 ID로 노드를 가져옴. 없으면 undefined. */
export function getNode(map: NodeMap, id: NodeId): Node | undefined {
  return map.nodes.find((n) => n.id === id);
}

/** 이 노드가 보스 게이트인가? (시간 만료 시 이동 강제) */
export function isBossGate(map: NodeMap, id: NodeId): boolean {
  return map.bossGateNodeId === id;
}

/**
 * 시간 만료 — visitedNodes.length 가 timeLimit 이상이면 *보스 게이트만 갈 수 있는 상태*.
 * 이 함수는 *현재 상태*에서 보스 게이트 강제 활성 여부를 알려준다.
 */
export function isTimeUp(visitedCount: number, timeLimit: number): boolean {
  return visitedCount >= timeLimit;
}

/**
 * 시간 만료 시: 현재 노드에서 보스 게이트까지의 *최단 경로* 길이 (BFS).
 * 인접성으로만 계산. 이미 보스 게이트면 0.
 */
export function distanceToBossGate(map: NodeMap, fromNodeId: NodeId): number {
  if (fromNodeId === map.bossGateNodeId) return 0;

  const visited = new Set<NodeId>([fromNodeId]);
  let frontier: { id: NodeId; dist: number }[] = [{ id: fromNodeId, dist: 0 }];

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const cur of frontier) {
      const node = getNode(map, cur.id);
      if (!node) continue;
      for (const nb of node.neighbors) {
        if (visited.has(nb)) continue;
        if (nb === map.bossGateNodeId) return cur.dist + 1;
        visited.add(nb);
        next.push({ id: nb, dist: cur.dist + 1 });
      }
    }
    frontier = next;
  }
  return -1; // 도달 불가
}
