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

  /**
   * 런 내 조건 (DSL) — 충족 안 되면 *풀에서 제외*.
   * EventChoice.condition과 같은 6토큰 DSL ([[event-runner.ts]] 평가기 사용).
   * chain 이벤트(만남 2/3 등)는 `affinity:npc-X>=N` 같은 조건으로 점층.
   */
  condition?: string;
}

/** 선택지 효과 — 이벤트 분기. */
export interface EventChoiceEffect {
  /** 자원/스탯 변화 */
  hpDelta?: number;
  goldDelta?: number;
  drawCards?: number;
  /** 시간의 조각 변화. */
  timeShardsDelta?: number;

  /**
   * %기반 회복 — 최대 HP의 N% 회복(round(maxHp×N/100)). hpDelta(정액)와 별개.
   * 휴식 노드가 소액 회복을 담당하므로 이벤트 회복은 "큰 회복"(35/50/100)만.
   */
  healPct?: number;

  /**
   * 컬러 댓가 — 지정 색을 amount 만큼 *차감*(applyColorBoost 음수).
   * canAfford가 보유량을 검사해 부족하면 선택지 비활성. (음수 delta는 on-color-gain 미발동 — 안전.)
   */
  colorCost?: { color: string; amount: number };

  /**
   * 카드 댓가 — 지정 카드(정의 id) 1장 소비. has-card 조건으로 게이트.
   * collection에서 정의 id 일치 첫 인스턴스를 removeCardFromCollection으로 제거.
   */
  loseCardId?: string;

  /** 컬러 보상 — 사건 보상의 주력. color = 8색명 | 'all' | 'random', amount 만큼. */
  colorDelta?: { color: string; amount: number };

  /** 카드/유물 획득 (id 직접 지정 또는 풀에서 추첨) */
  grantCardId?: CardId;
  grantCardFromPool?: { rank?: string; tag?: string };
  grantRelicId?: RelicId;

  /** 관계 변화. */
  affinityDelta?: { npcId: string; delta: number };

  /**
   * 동료 사건 영입 (Item 37-② Stage C, 1A) — 이 선택지를 고르면 지정 NPC를 동료로 영입.
   * EventView가 `run.recruitCompanion(npcId)` 호출(중복이면 스킵). 비용 아님(canAfford 무관).
   * 데이터 키: `recruit = npc-X`. companion 정의가 있는 NPC만 실제 영입(없으면 recruitCompanion이 false).
   */
  recruitNpcId?: string;

  /** 후속 이벤트 트리거 (분기). */
  followupEventId?: EventId;

  /**
   * NPC 스파링(안전 대련) 진입 — 이 선택지를 고르면 지정 몬스터(npc-spar-X)와 전투에 들어간다.
   * 데이터 키: `spar = npc-spar-X`. 일반 전투와 다르게 *비영속 sparring 컨텍스트*로 진입해
   *   승/패 무관 HP 원복, 패배 시 목숨 미소모, 노드 상태 무변경, XP 미지급(파밍 방지), 승리 시 친밀도 +1.
   * 파일럿 몬스터는 권역 풀에 넣지 않고 *이 토큰 참조로만* 등장한다(자연 격리).
   */
  sparMonsterId?: string;

  /** 사용자 정의 효과 핸들러. */
  customEffectId?: string;

  /** 단서 부여 — id가 이미 인벤토리에 있으면 중복 X. */
  grantClueId?: string;

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

  /** true면 선택 전 효과 미리보기를 숨김(???). *의도적 미스터리* 선택지에만. (기본 false = 투명) */
  hidden?: boolean;
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
