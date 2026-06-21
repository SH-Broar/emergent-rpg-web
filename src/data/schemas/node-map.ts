/**
 * 노드 맵 스키마.
 *
 * spec v2: 거미줄형 자유 이동 맵. 연표마다 다른 맵 (또는 완전 랜덤 모드).
 * 노드 종류: 마을 / 전투 / 이벤트 / 엘리트 / 보스 / 휴식 / 상점.
 */

import type { BossId, EventId, NamedEntity, NodeId, NodeKind, NodeMapId } from './base';
import type { ColorValues } from './npc';

/** 한 권역 (region) — 지리·문화적으로 묶인 노드 집합의 *콘텐츠 풀* 정의.
 *
 * 30턴 하루 경과 시 비-마을 노드의 *kind와 content가 재추첨*되는데,
 * 이때 그 노드가 속한 권역의 풀에서만 가져온다 — 사막 노드에서 우거진 숲
 * 이벤트가 튀어나오는 어색함 방지.
 */
export interface Region {
  id: string;
  name: string;
  /** 권역 톤/플레이버 (UI 안내·작성 가이드용). */
  description?: string;
  /** 일반 전투 노드용 적 ID 풀. */
  enemyPool: string[];
  /** 엘리트 전투 노드용 적 ID 풀. */
  eliteEnemyPool: string[];
  /** 이벤트 노드용 이벤트 ID 풀. */
  eventPool: EventId[];

  /**
   * 지리 난이도 티어 (1=입문 ~ 6=보스 길목). 몬스터 로스터 강도 + *전투 보상 깊이*를 결정.
   * 깊은 권역일수록 컬러 부스트·드롭률·희소 보상이 커진다(combat-rewards). 미지정 시 1.
   */
  tier?: number;

  /**
   * 권역의 *대표 컬러* — 채집 노드 후반 단계의 임계 컬러.
   * 채집 진입 시 RunState.colors[primaryColor] >= gatherThreshold면 *후반 풀*로 분기.
   */
  primaryColor?: keyof ColorValues;

  /**
   * 권역 *특산물* 아이템 ID — 희귀 카드 제작 재료. 일반 몬스터/채집·이벤트에서 드롭.
   */
  specialtyItemId?: string;

  /**
   * 채집 후반 단계 임계 컬러값 — primaryColor가 이 값 이상이면 후반 풀.
   * 미지정 시 기본 80.
   */
  gatherThreshold?: number;

  /**
   * 상위 lore 지역명 — 권역이 *어떤 큰 영역에 속하는지*. UI 안내·도감용.
   * 예: 라르 숲 → "세계수", 풍혈지대 → "허공숲".
   */
  parentRegionName?: string;

  /**
   * *마을 권역의 고유 전설 카드 풀* — 공방에서 이 권역의 특산물 + 희소 재료로 제작 가능.
   * 마을이 아닌 권역은 비어 있거나 미지정.
   */
  legendaryCardIds?: string[];
}

/** 한 노드. */
export interface Node {
  id: NodeId;
  kind: NodeKind;

  /** 소속 권역 (id). 없으면 노드 맵 전역 풀로 폴백. */
  region?: string;

  /** UI 좌표 (거미줄 그래프 시각화용). 0~1 정규화 또는 픽셀. */
  position: { x: number; y: number };

  /** 노드 라벨 (마을 이름, 던전 이름 등). */
  label: string;
  description?: string;

  /** 인접 노드 (양방향 또는 단방향). 기본 양방향. */
  neighbors: NodeId[];

  /**
   * 조건부 인접 노드 — 특정 조건 만족 시 *추가로 보이는* 인접.
   * 예: 이벤트 완료 후 새 길이 열리는 경우.
   * 데이터 구조만 준비 (현재 사용 X).
   *
   * requires 예시: "event:n-grove:cleared", "boss:cleared", "affinity:npc-x:3+"
   */
  conditionalNeighbors?: Array<{
    nodeId: NodeId;
    requires: string;
  }>;

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

  /**
   * 저작 인카운터 id(선택) — 설정 시 이 노드의 격자 전투는 *절차 생성 대신* 해당 인카운터
   * (맵 타일 배치·몬스터·소환 스케줄)를 사용한다. 정의 없거나 빌드 실패 시 절차 생성 폴백.
   */
  encounter?: string;

  /** 시작 노드인가? (런 진입 시 위치) */
  isStart?: boolean;

  /** 보스 게이트로 가는 마지막 노드? */
  isBossGate?: boolean;
}

export interface NodeMap extends NamedEntity {
  id: NodeMapId;

  /** 모든 노드. */
  nodes: Node[];

  /** 권역 정의들 — id → Region. */
  regions: Region[];

  /** 시작 노드 ID. */
  startNodeId: NodeId;

  /** 보스 게이트 노드 ID. */
  bossGateNodeId: NodeId;
}
