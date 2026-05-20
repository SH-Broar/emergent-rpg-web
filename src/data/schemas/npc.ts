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
 * 동료 영입 정의 — NPC가 *동료로* 합류하면 적용되는 4종 보너스.
 * 사용자 사양: 최대 4종을 *한 NPC가 여러 개 동시*에 가질 수 있음.
 */
export interface CompanionBonuses {
  /** 덱 슬롯 +N. */
  deckSizeBonus?: number;
  /** 합류 시 컬렉션·덱에 추가되는 전용 카드 ID들. */
  grantedCardIds?: CardId[];
  /** 합류 시 보유 유물에 추가되는 전용 유물 ID들. */
  grantedRelicIds?: RelicId[];
  /** 합류 시 colors에 더해질 부분 컬러 보정. */
  colorBoosts?: Partial<{
    fire: number; water: number; electric: number; iron: number;
    earth: number; wind: number; light: number; dark: number;
  }>;
}

export interface Npc extends NamedEntity {
  id: NpcId;
  raceId: RaceId;

  /** legacy role: Villager / Adventurer / Priest / ... 단순 분류. */
  role: string;

  /** 거주 노드 (act-1-map의 node id) — 마을 노드에 나타날 때 매칭. */
  homeNodeId?: NodeId;

  /**
   * 동료 영입 가능 여부 + 보너스.
   * recruit가 정의된 NPC만 동료로 권유 가능. 이탈하면 *최초 만난 노드*에서 다시 권유해야 한다.
   */
  recruit?: CompanionBonuses;

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
