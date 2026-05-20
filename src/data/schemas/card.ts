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

/**
 * 카드 *주 효과 수치*의 등급별 최소 한도 — 1.5배 등비.
 *
 * 적용 대상: source가 `race`/`character`인 *시작 덱 베이스*. 같은 등급이라면
 * 적어도 이 수치만큼은 보장돼야 의미가 있다는 기획 정책.
 *
 * 면제 대상: source가 `npc`/`event`/`relic`/`boss`/`hyperion` — 친밀도 보상,
 * 이벤트 grant, 유물 효과, 보스 보상으로 받는 *특수 카드*는 컨셉이 우선.
 *
 * 검사 수치: card.effects 중 `damage`/`heal`/`block` 효과 value의 *최댓값*.
 * cost는 고려하지 않음 — 가치 산정의 정밀함보다 *최소 한도*가 목적.
 */
export const CARD_MIN_PEAK_VALUE: Record<Rank, number> = {
  basic: 4,
  common: 6,
  rare: 9,
  legendary: 14,
};

/**
 * 카드가 등급별 최소 한도를 충족하는지 검사. ok=false면 데이터 작성 오류일 가능성.
 * 특수 출처는 자동 통과. 게임 로직에 영향 X — 데이터 로드 시 *경고*만 띄움.
 */
export function validateCardBaseline(card: Card): { ok: boolean; reason?: string } {
  if (card.source !== 'race' && card.source !== 'character') {
    return { ok: true };
  }
  const baseline = CARD_MIN_PEAK_VALUE[card.rank];
  if (baseline === undefined) return { ok: true };
  const peak = Math.max(
    0,
    ...card.effects
      .filter((e) => e.kind === 'damage' || e.kind === 'heal' || e.kind === 'block')
      .map((e) => e.value ?? 0),
  );
  if (peak < baseline) {
    return { ok: false, reason: `${card.rank} 최소 한도 ${baseline} 미달 (현재 peak ${peak})` };
  }
  return { ok: true };
}

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
  | 'damage'              // 적에게 데미지
  | 'damage-min-color'    // 8 컬러 중 *최솟값* × value 데미지, ATK 보너스 무시
  | 'heal'                // 자신 회복 (음수 = 자기 HP 페널티)
  | 'block'               // 방어막 (음수 = block 페널티)
  | 'draw'                // 카드 드로우
  | 'apply-status'        // 상태 부여
  | 'return-hand-to-deck' // 손에서 *가장 오른쪽* 1장을 drawPile 맨 위로 (칼리번)
  | 'next-turn-energy'    // 다음 턴 시작 에너지 +value (칼리번)
  | 'growing-block';      // block:value + *이 카드 인스턴스의 bonusBlock +1* (쿠르쿠마)

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

/** 카드 정의 + 런타임 인스턴스.
 *
 * - `id`: 카드 *정의* 식별자 (예: 'c-strike'). 데이터 파일 기준.
 * - `instanceId`: 같은 정의의 *각 사본*에 부여되는 유니크 키.
 *   - 데이터 로더가 만든 *원본 정의*에는 비어 있음.
 *   - 게임 런타임이 카드를 컬렉션/덱에 추가할 때 `instantiateCard()`로 부여.
 *   - 덱 편집 UI는 instanceId로 카드를 구분 (동명 카드 = 별개 인스턴스).
 */
export interface Card extends NamedEntity {
  id: CardId;
  /** 런타임 인스턴스 ID — 데이터 정의에서는 비어 있고, 게임 런타임에서 부여. */
  instanceId?: string;
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

  /**
   * 강화 후 카드 ID — 공방 강화에서 *이 카드를 강화하면 어떤 카드로 바뀌는지* 표시.
   * 없으면 강화 불가 (예: 이미 강화판인 카드).
   */
  upgradeToId?: CardId;

  /**
   * 카드 *인스턴스*에 누적되는 보너스 block — `growing-block` 효과 카드 전용.
   * 사용 시 +1씩 누적되어 다음번 사용 시 block 효과에 더해진다.
   * 런 종료로 리셋(런 휘발 컬렉션 인스턴스).
   */
  bonusBlock?: number;
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
