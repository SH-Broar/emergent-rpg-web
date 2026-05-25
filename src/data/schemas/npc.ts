/**
 * NPC 스키마 — 연표에 거주하며 플레이어와 상호작용하는 비-플레이어 인물.
 *
 * spec v2: NPC는 *세계의 거주민* — playable=Character로 분리된다.
 *   - 노드 맵의 마을/이벤트 노드에서 만남
 *   - 친밀도 (affinity) 누적 → 히페리온 ② 게이지 + 선물 보상
 *   - 8 컬러(원소) 값 + 영역(domain) 키워드로 *대화 색채* 결정
 *
 * legacy actors.txt 호환 — colorValues / domainHigh / domainLow / background.
 */

import type { CardEffect, EffectTarget } from './card';
import type { CardId, Element, NamedEntity, NodeId, NpcId, RaceId, RelicId } from './base';

/** 8 컬러 원소 값. legacy 순서: fire, water, electric, iron, earth, wind, light, dark. */
export interface ColorValues {
  fire: number;
  water: number;
  electric: number;
  iron: number;
  earth: number;
  wind: number;
  light: number;
  dark: number;
}

/** 친밀도 단계별 보상. */
export interface AffinityReward {
  /** 임계 친밀도 (1, 3, 5 권장). */
  threshold: number;
  /** 단계 보상 카드. */
  rewardCardId?: CardId;
  /** 단계 보상 유물. */
  rewardRelicId?: RelicId;
  /** 단계 도달 시 게이지에 더해지는 값 (hyperion2). */
  gaugeBoost?: number;
  /** 단계 안내 라인. */
  hint?: string;
  /** 단계 도달 시 *런 내 컬러*에 + (사용자 사양: 컬러 획득 경로 다양화). */
  colorBoost?: { color: string; value: number };
  /** 단계 도달 시 *권역 특산물 1개* 부여 (region id). */
  grantSpecialtyRegionId?: string;
  /** 단계 도달 시 *희소 재료 1개* 부여. */
  grantRareMaterial?: boolean;
}

/** 선물 카테고리별 선호도. */
export interface GiftPreference {
  /** 좋아하는 자원 키워드 (legacy의 카테고리 또는 element). */
  loved?: string[];
  /** 보통. */
  liked?: string[];
  /** 싫어함. */
  disliked?: string[];
}

/**
 * 동료 패시브 보너스 (Item 37-② Stage A — declutter 축소판).
 *
 * 인터뷰 확정(2026-05-25): 영입 1회 보너스(deckSizeBonus·grantedRelicIds·colorBoosts)는 제거되고,
 * *while-equipped* 지속 패시브 4종만 남는다. 패시브 타입 동료(companion.kind==='passive')는
 * activeSlots에 편성되어 있는 동안만 매 전투 이 보너스를 적용한다.
 *
 * @remarks
 *   deckSizeBonus / grantedCardIds / grantedRelicIds / colorBoosts 는 *제거됨*.
 *   (구세이브 호환은 RunState 마이그레이션이 처리 — companionAppliedBonuses는 더 이상 읽지 않는다.)
 */
export interface CompanionBonuses {
  /**
   * 상태이상 저항 — 적이 *플레이어에게* 디버프를 걸 때 부여량을 status별로 감소(최소 0).
   * key='all'이면 모든 감쇠 디버프에 적용. 예: { weakness: 1, all: 1 }.
   */
  statusResist?: Record<string, number>;
  /** 전투 시작 효과 — 매 전투 시작 시 자신에게 적용(방어/힘/추가 드로우). */
  combatStart?: { block?: number; strength?: number; draw?: number };
  /** 매 플레이어 턴 시작 효과(회복/방어). */
  perTurn?: { heal?: number; block?: number };
  /** 보상 증폭 — 1.0 기준 *추가 비율*(0.2 = +20%). 종류: gold/shards/gather. */
  rewardMul?: { gold?: number; shards?: number; gather?: number };
}

/**
 * 동료 액티브 스킬 (Item 37-② Stage A).
 *
 * 쿨다운 기반 — 전투 중 버튼으로 *아무때나* 발동(쿨다운 0일 때). 매 전투 시작 시 0(준비됨).
 * effects 는 카드 효과 시스템(CardEffect)을 *그대로 재사용* — combat.ts의 EFFECT_HANDLERS를 거친다.
 * 슬롯 1(activeSlots[0])에 편성된 동료의 스킬은 쿨다운이 -1 적용된다(편성 순서가 전략).
 */
export interface CompanionSkill {
  /** 스킬 이름 (버튼 라벨). */
  name: string;
  /** 쿨다운 — 사용 후 재사용까지 *플레이어 턴 수*. 매 플레이어 턴 -1, 0이면 사용 가능. */
  cooldown: number;
  /**
   * FD(Fast Draw) — 전투 시작 선충전 (Item 37-② Stage C).
   * 전투 시작 시 쿨다운이 `max(0, cooldown - fd)`로 시드된다(워밍업).
   *   - 미지정이면 fd = cooldown → 전투 시작부터 준비됨(종전 동작과 동일).
   *   - fd < cooldown → 첫 사용까지 (cooldown − fd)턴 워밍업.
   *   - fd ≥ cooldown → 시작부터 준비됨(0).
   * 슬롯1(activeSlots[0])의 쿨다운 -1과는 *별개*(전투 중 set 시점에만 적용).
   */
  fd?: number;
  /** 한 줄 설명(툴팁). */
  description?: string;
  /** 발동 효과 — 카드 효과 핸들러 재사용. */
  effects: CardEffect[];
  /** 효과 기본 대상(개별 effect.target이 우선). */
  target?: EffectTarget;
}

/**
 * 통합 동료 정의 (Item 37-② Stage A) — NPC(+추후 Monster)에 부착.
 *
 * 한 동료는 *제공 타입 하나*를 가진다(택1):
 *   - passive : 지속 패시브(while-equipped). passive 필드 사용.
 *   - skill   : 액티브 스킬(쿨다운). skill 필드 사용.
 *   - card    : 정령 한정 fallback — 합류 시 cardIds 부여(Stage A에선 부여 로직 미배선, 정의만).
 */
export interface Companion {
  kind: 'passive' | 'skill' | 'card';
  passive?: CompanionBonuses;
  skill?: CompanionSkill;
  /** card-type 전용 — 합류 시 부여될 카드 ID들(정령 fallback). */
  cardIds?: CardId[];
}

export interface Npc extends NamedEntity {
  id: NpcId;
  raceId: RaceId;

  /** legacy role: Villager / Adventurer / Priest / ... 단순 분류. */
  role: string;

  /** 거주 노드 (act-1-map의 node id) — 마을 노드에 나타날 때 매칭. */
  homeNodeId?: NodeId;

  /**
   * 동료 영입 가능 여부 + 보너스 (legacy 패시브 4종).
   * recruit가 정의된 NPC만 동료로 권유 가능. 이탈하면 *최초 만난 노드*에서 다시 권유해야 한다.
   *
   * @remarks Item 37-② Stage A: 영입 자체의 게이트로는 여전히 쓰이지만(영입 가능 판정),
   *   *효과*는 통합 `companion` 정의로 일원화된다. 로더가 recruit_* 필드로부터
   *   `companion`(kind='passive')을 자동 합성하므로 기존 데이터도 그대로 동작한다.
   */
  recruit?: CompanionBonuses;

  /**
   * 통합 동료 정의 (Item 37-② Stage A) — passive/skill/card 택1.
   * 로더가 `companion_*` 필드(신규) 우선, 없으면 `recruit_*`(legacy)에서 passive로 합성한다.
   * 이 정의가 있으면 동료로 영입 가능(recruit 게이트와 동치 취급).
   */
  companion?: Companion;

  /** 추가로 출현 가능한 노드. */
  presenceNodeIds?: NodeId[];

  age?: number;

  /** 8 원소 컬러 값 (0~1). */
  colorValues?: ColorValues;

  /** 강한 영역 키워드 (legacy domainHigh — 8축). */
  domainHigh?: string[];
  /** 약한 영역 키워드. */
  domainLow?: string[];

  /** 인물 배경 — `|` 로 단락 분리된 legacy 텍스트를 보존. (연표 무관 기본값/폴백) */
  background?: string;

  /**
   * 연표별 배경 변주 — 같은 NPC라도 *어느 연표(시대)*의 런이냐에 따라 내용이 조금 다름.
   * 데이터 키: `background.<timelineId> = ...` (`|` 단락 분리). 현재 연표 우선, 없으면 `background`.
   */
  backgroundByTimeline?: Record<string, string>;

  /** 친밀도 단계별 보상. */
  affinityRewards?: AffinityReward[];

  /** 선물 선호도. */
  giftPrefs?: GiftPreference;

  /** 이 NPC와 연결된 일루네온/전생자 입장에서의 *역할 태그*. UI/필터용. */
  tags?: string[];

  /** 종족 외에 *대표 원소* (UI 강조용 — colorValues 최대치를 캐시). */
  signatureElement?: Element;

  /** 짧은 한 줄 (NPC 카드/말풍선 하단용). */
  tagline?: string;

  portrait?: string;
}
