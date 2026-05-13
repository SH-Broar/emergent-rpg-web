/**
 * 카드 스키마.
 *
 * 분기 B (하이브리드):
 *  - 단순 효과: 데이터 드리븐 (effects: CardEffect[])
 *  - 특수 효과: 함수 슬롯 (customEffectId — 코드에 등록된 효과 핸들러 키)
 *
 * 분기 C (하이브리드):
 *  - 기본 카드는 *플레이* 시 즉시 효과 (턴제)
 *  - 지속/자동 카드는 trigger 필드로 *조건 발동* 표시
 */

import type {
  CardId,
  Element,
  NamedEntity,
  Rank,
} from './base';

/** 카드 획득 출처 (자동 매핑의 기반). */
export type CardSource =
  | 'race'        // 종족 시드
  | 'character'   // 캐릭터 정체성
  | 'npc'         // NPC 친밀도
  | 'hyperion'    // 히페리온 5단계
  | 'event'       // 이벤트 보상
  | 'relic'       // 유물 효과
  | 'boss';       // 보스 클리어

/** 카드 사용 모드 — 턴제 vs 자동/지속. */
export type CardTriggerKind =
  | 'manual'        // 플레이어가 핸드에서 사용 (기본 STS식)
  | 'on-draw'       // 드로우 시 즉시 발동
  | 'on-turn-end'   // 턴 종료 시 발동
  | 'on-take-damage' // 피해 받을 시 발동
  | 'persistent';   // 항상 활성 (유물처럼 작동하는 카드)

/** 효과 종류 — MVR 단계에서는 5종만. 확장 가능. */
export type CardEffectKind =
  | 'damage'        // 적에게 데미지
  | 'heal'          // 자신 회복
  | 'block'         // 방어막
  | 'draw'          // 카드 드로우
  | 'apply-status'; // 상태 부여

/** 효과 대상 — target. */
export type EffectTarget = 'self' | 'enemy' | 'all-enemies' | 'random-enemy';

/** 단위 효과. 데이터 드리븐의 기본 단위. */
export interface CardEffect {
  kind: CardEffectKind;
  value?: number;
  target?: EffectTarget;
  /** 상태 부여 등 추가 파라미터 */
  params?: Record<string, unknown>;
}

/** 카드 정의. */
export interface Card extends NamedEntity {
  id: CardId;
  rank: Rank;
  source: CardSource;

  /** 카드 색상 — 시각화 + 시너지 조건에 사용. */
  element?: Element;

  /** 마나 비용 (없으면 0). */
  cost: number;

  /** 발동 트리거. */
  trigger: CardTriggerKind;

  /** 데이터 드리븐 효과 목록. */
  effects: CardEffect[];

  /** 특수 카드는 코드에 등록된 함수 슬롯 키. */
  customEffectId?: string;

  /** 카드 획득 시 표시되는 출처 텍스트 (예: "이리엘과의 약속"). */
  flavor?: string;

  /** 이 카드가 어떤 NPC/이벤트로 잠금해제되는지 (UI 안내용). */
  unlockHint?: string;
}

/** 효과 핸들러 시그니처 — Phase 2d에서 systems/combat.ts가 사용. */
export type CardEffectHandler = (
  ctx: CardEffectContext,
) => CardEffectResult;

/** 효과 발동 컨텍스트 — 전투 시스템이 주입. */
export interface CardEffectContext {
  card: Card;
  effect: CardEffect;
  /** Forward declaration — 실제 타입은 systems/combat.ts에서. */
  combat: unknown;
}

/** 효과 발동 결과. */
export interface CardEffectResult {
  damageDealt?: number;
  healed?: number;
  blockGained?: number;
  cardsDrawn?: number;
  statusApplied?: string;
  /** 추가 액션 (예: 다른 카드 트리거) */
  followups?: unknown[];
}
