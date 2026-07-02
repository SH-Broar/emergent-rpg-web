/**
 * 노드 맵 이동 시스템.
 *
 * spec v2 Round 4/11:
 *  - 거미줄형 자유 이동 (인접 노드만)
 *  - 노드 방문 = 시간 1 카운트 진행
 *  - 시간 임계 도달 시 *덱 확장* 또는 *보스 게이트 활성*
 */

import type { ColorValues, NodeId, NodeKind, NodeMap, Node, NodeStateRecord, Region, RunState } from '@/data/schemas';

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
 * runState가 주어지면 *조건부 간선*(conditionalNeighbors)도 평가하여 충족분을 인접에 합류한다.
 * 조건부 간선은 로드 시 양끝 노드에 정규화돼 있어(loader.ts), 어느 쪽에 서 있든 대칭으로 열린다.
 * runState 미지정 시 조건부 간선은 평가하지 않는다(잠긴 것으로 취급).
 */
export function getNeighbors(
  map: NodeMap,
  currentNodeId: NodeId,
  runState?: RunState,
): Node[] {
  const current = map.nodes.find((n) => n.id === currentNodeId);
  if (!current) return [];

  const ids = new Set<NodeId>(current.neighbors);

  if (current.conditionalNeighbors && runState) {
    for (const cn of current.conditionalNeighbors) {
      if (isEdgeRequirementMet(cn.requires, runState)) {
        ids.add(cn.nodeId);
      }
    }
  }

  return [...ids]
    .map((id) => map.nodes.find((n) => n.id === id))
    .filter((n): n is Node => n !== undefined);
}

/** 이미 경고한 미지 requires 형식 — console 스팸 방지(형식당 1회). getNeighbors는 매 렌더 호출된다. */
const warnedRequires = new Set<string>();

/**
 * 간선 잠금(조건부 간선) requires DSL 평가 — 조건 충족 시 true(간선 개통), 미충족이면 false(잠김).
 * 파생 계산 — 저장 상태 없이 매번 runState로 평가한다.
 *
 * 형식:
 *   cleared:<nodeId>        — 그 노드의 전투 또는 거래 소비(OR — 둘 중 하나면 열림. isNodeSettled의 AND와 다름).
 *   event:<nodeId>:cleared  — 그 노드의 사건 발동(eventTriggered 존재).
 *   clue:<clueId>           — 단서 보유.
 *   item:<itemId>           — 아이템 보유(id 일치, instanceId 무관).
 *   level:<n>               — 플레이어 레벨 n 이상.
 *   day:<n>                 — n일차 이상.
 *   color:<key>:<n>         — 그 컬러(fire/water/…) 수치 n 이상.
 * 알 수 없거나 형식이 어긋난 requires는 false(잠금 유지) + 형식당 1회 console.warn.
 */
export function isEdgeRequirementMet(requires: string, runData: RunState): boolean {
  const parts = requires.split(':').map((s) => s.trim());
  switch (parts[0]) {
    case 'cleared': {
      if (!parts[1]) break;
      const ns = runData.nodeStates[parts[1]];
      return !!ns && (!!ns.combatCleared || !!ns.tradeCleared);
    }
    case 'event': {
      // event:<nodeId>:cleared
      if (!parts[1] || parts[2] !== 'cleared') break;
      return !!runData.nodeStates[parts[1]]?.eventTriggered;
    }
    case 'clue':
      if (!parts[1]) break;
      return (runData.clues ?? []).some((c) => c.id === parts[1]);
    case 'item':
      if (!parts[1]) break;
      return runData.items.some((it) => it.id === parts[1]);
    case 'level': {
      const n = Number(parts[1]);
      if (!Number.isFinite(n)) break;
      return (runData.level ?? 1) >= n;
    }
    case 'day': {
      const n = Number(parts[1]);
      if (!Number.isFinite(n)) break;
      return runData.currentDay >= n;
    }
    case 'color': {
      const key = parts[1];
      const n = Number(parts[2]);
      if (!key || !Number.isFinite(n) || !(key in runData.colors)) break;
      return (runData.colors[key as keyof ColorValues] ?? 0) >= n;
    }
  }
  // 미지/오형식 — 잠금 유지 + 형식당 1회 경고.
  if (!warnedRequires.has(requires)) {
    warnedRequires.add(requires);
    console.warn(`[edge-lock] 알 수 없는 간선 조건: "${requires}" — 간선을 잠근 채 유지합니다.`);
  }
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
