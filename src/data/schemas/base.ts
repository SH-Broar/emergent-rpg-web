/**
 * 모든 스키마가 공유하는 기본 타입.
 *
 * TS 6 + erasableSyntaxOnly: true 환경이므로 enum 대신 union type 사용.
 */

/** 4등급 카드/유물 공통 등급. */
export type Rank = 'basic' | 'common' | 'rare' | 'legendary';

/** 한 노드의 종류. */
export type NodeKind =
  | 'village'     // NPC 대화 + 간이 제작 (랜덤 카드)
  | 'combat'      // 일반 전투
  | 'event'       // 사건/선택지
  | 'elite'       // 엘리트 전투
  | 'boss'        // 연표 종말 위협
  | 'rest'        // 휴식 (HP 회복)
  | 'shop'        // 상점 (구매)
  | 'workshop'    // 공방 (더 좋은 카드 제작 + 강화)
  | 'gather'      // 채집 (자원 수집 — 시간의 조각·골드)
  | 'activity';   // 활동 (소소한 보상 — 카드 한 장 또는 친밀도)

/** 컬러 8원소. RDC 세계관의 기본 속성. */
export type Element =
  | 'fire'
  | 'water'
  | 'electric'
  | 'iron'
  | 'earth'
  | 'wind'
  | 'light'
  | 'dark';

/** 계절. */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'monsoon' | 'twilight';

/** 식별자 타입 별칭 — 의도를 명확히. */
export type TimelineId = string;
export type CharacterId = string;
export type RaceId = string;
export type CardId = string;
export type RelicId = string;
export type EventId = string;
export type BossId = string;
export type NodeId = string;
export type NpcId = string;
export type NodeMapId = string;

/** 모든 데이터 정의가 공유하는 최소 필드. */
export interface NamedEntity {
  id: string;
  name: string;
  description?: string;
}
