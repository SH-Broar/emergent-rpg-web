/**
 * 이벤트 스키마 — 단위 완결 원칙 (1 작성 = 1 사용).
 *
 * 평균 500~1000자, 최대 5천 자.
 * 선택지는 후반 선택지에 영향 가능 (slay-the-spire식 분기).
 */

import type {
  CardId,
  EventId,
  NamedEntity,
  RelicId,
  Season,
} from './base';

/** 이벤트가 발동할 조건. */
export interface EventTrigger {
  /** 어느 노드 타입에서 발동 가능? */
  nodeKinds?: ('village' | 'event' | 'rest')[];

  /** 어느 계절에 발동 가능? (생략 시 모든 계절) */
  seasons?: Season[];

  /** 이 이벤트를 잠금해제하는 메타 상태 키. */
  unlockKey?: string;

  /** 이 이벤트는 *런당 1회*만 발동? (기본 true) */
  oncePerRun?: boolean;

  /** 가중치 — 같은 노드에서 후보가 여럿일 때. */
  weight?: number;
}

/** 선택지 효과 — 이벤트 분기. */
export interface EventChoiceEffect {
  /** 자원/스탯 변화 */
  hpDelta?: number;
  goldDelta?: number;
  drawCards?: number;

  /** 카드/유물 획득 (id 직접 지정 또는 풀에서 추첨) */
  grantCardId?: CardId;
  grantCardFromPool?: { rank?: string; tag?: string };
  grantRelicId?: RelicId;

  /** 관계 변화. */
  affinityDelta?: { npcId: string; delta: number };

  /** 후속 이벤트 트리거 (분기). */
  followupEventId?: EventId;

  /** 사용자 정의 효과 핸들러. */
  customEffectId?: string;

  /** 효과 후 출력될 결과 텍스트. */
  resultText?: string;
}

/** 한 선택지. */
export interface EventChoice {
  /** UI에 표시할 라벨. */
  label: string;

  /** 선택 가능 조건 (예: "has-card:friendship" 또는 "stat-check:attack>=8"). */
  condition?: string;

  /** 선택 시 발생할 효과들. */
  effects: EventChoiceEffect[];
}

export interface Event extends NamedEntity {
  id: EventId;

  /** 본문 (단위 완결 원칙: 500~1000자). */
  body: string;

  /** 발동 조건. */
  trigger: EventTrigger;

  /** 선택지들. */
  choices: EventChoice[];

  /** 등장 NPC (도감 등록 트리거). */
  featuredNpcIds?: string[];
}
