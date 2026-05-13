/**
 * 노드 맵 이동 시스템.
 *
 * spec v2 Round 4/11:
 *  - 거미줄형 자유 이동 (인접 노드만)
 *  - 노드 방문 = 시간 1 카운트 진행
 *  - 시간 임계 도달 시 *덱 확장* 또는 *보스 게이트 활성*
 */

import type { NodeId, NodeMap, Node } from '@/data/schemas';

/** 현재 노드에서 이동 가능한 인접 노드 목록. */
export function getNeighbors(map: NodeMap, currentNodeId: NodeId): Node[] {
  const current = map.nodes.find((n) => n.id === currentNodeId);
  if (!current) return [];
  return current.neighbors
    .map((id) => map.nodes.find((n) => n.id === id))
    .filter((n): n is Node => n !== undefined);
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
