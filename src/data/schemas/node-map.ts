/**
 * 노드 맵 스키마.
 *
 * spec v2: 거미줄형 자유 이동 맵. 연표마다 다른 맵 (또는 완전 랜덤 모드).
 * 노드 종류: 마을 / 전투 / 이벤트 / 엘리트 / 보스 / 휴식 / 상점.
 */

import type { BossId, EventId, NamedEntity, NodeId, NodeKind, NodeMapId } from './base';

/** 한 노드. */
export interface Node {
  id: NodeId;
  kind: NodeKind;

  /** UI 좌표 (거미줄 그래프 시각화용). 0~1 정규화 또는 픽셀. */
  position: { x: number; y: number };

  /** 노드 라벨 (마을 이름, 던전 이름 등). */
  label: string;
  description?: string;

  /** 인접 노드 (양방향 또는 단방향). 기본 양방향. */
  neighbors: NodeId[];

  /** 노드 도착 시 트리거되는 콘텐츠 — kind에 따라 의미가 다름. */
  contentRef?: {
    /** 전투 노드: 적 그룹 ID 또는 boss ID */
    enemyGroupId?: string;
    bossId?: BossId;
    /** 이벤트 노드: 이벤트 ID 풀 — 트리거 조건에 따라 추첨 */
    eventIdPool?: EventId[];
    /** 마을 노드: 상호작용 가능한 NPC ID 풀 */
    npcIdPool?: string[];
  };

  /** 시작 노드인가? (런 진입 시 위치) */
  isStart?: boolean;

  /** 보스 게이트로 가는 마지막 노드? */
  isBossGate?: boolean;
}

export interface NodeMap extends NamedEntity {
  id: NodeMapId;

  /** 모든 노드. */
  nodes: Node[];

  /** 시작 노드 ID. */
  startNodeId: NodeId;

  /** 보스 게이트 노드 ID. */
  bossGateNodeId: NodeId;
}
