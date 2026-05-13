/**
 * 연표 스키마 — 게임의 *최상위 단위*.
 *
 * spec v2: 연표는 *그 시대의 단면 전체*를 정의한다.
 *   - 맵 (어떤 노드 맵 사용)
 *   - 등장 가능한 캐릭터/NPC/이벤트
 *   - 제한 시간 (보스 게이트까지 노드 방문 수)
 *   - 종말 위협 보스
 *   - 미션 목표 (플레이어 안내)
 *
 * 세계 티켓: 직렬화 가능 — 다른 플레이어와 공유.
 */

import type {
  BossId,
  CharacterId,
  EventId,
  NamedEntity,
  NodeMapId,
  NpcId,
  TimelineId,
} from './base';

export interface Timeline extends NamedEntity {
  id: TimelineId;

  /** 게임 내 연도 (예: 310, 320, 415). */
  year: number;

  /** 시대 톤/계절 분위기 ("평화" | "위기" | "기근" | "기근 직후" 등). */
  era?: string;

  /** 사용할 노드 맵. */
  nodeMapId: NodeMapId;

  /** 출현 가능 컨텐츠 풀. */
  availableEventIds: EventId[];
  availableCharacterIds: CharacterId[];
  availableNpcIds: NpcId[];

  /** 보스 게이트 까지의 시간 한계 (= 노드 방문 카운트 임계). */
  timeLimit: number;

  /** 덱 크기 확장 임계값 (시간 단위). [10→20 시점, 20→30 시점] */
  deckExpansionThresholds: [number, number];

  /** 종말 위협 보스. */
  bossId: BossId;

  /** 플레이어에게 보일 미션 안내. */
  missionGoal: string;

  /** 연표 해금 조건 (메타 게이지 키). 기본 연표는 비어 있음. */
  unlockRequirement?: string;

  /** 세계 티켓으로 공유 가능? */
  isShareable: boolean;

  /** 절차적 변형 메타데이터 — 이전 런 결과로 *생성된* 연표인 경우. */
  procContext?: Record<string, unknown>;

  /** UI 카드 그리드용 이미지 + 짧은 설명. */
  thumbnail?: string;
  tagline?: string;
}
