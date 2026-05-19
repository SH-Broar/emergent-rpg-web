/**
 * 아이템 — *즉시 사용*형 소비품.
 *
 * 사용자 사양 (2026-05-15):
 *   - 작게는 체력 회복부터, 크게는 텔레포트·컬러 수치 조절까지.
 *   - 카드와 달리 *덱 슬롯 X*. 별도 인벤토리. 클릭 시 즉시 효과.
 *
 * 카드처럼 인스턴스 ID 사용 — 동명 아이템 사본도 별개로 카운트.
 */

import type { NamedEntity, Rank } from './base';
import type { ColorValues } from './npc';

/** 효과 종류. param 의미는 kind 별로 다름. */
export type ItemEffectKind =
  | 'heal'            // HP +value
  | 'gold'            // 골드 +value
  | 'time-shards'     // 시간의 조각 +value
  | 'color-boost'     // colors[param: keyof ColorValues] += value
  | 'color-all'       // 8 컬러 모두 += value
  | 'grant-card'      // param = cardId
  | 'grant-relic'     // param = relicId
  | 'teleport-village'; // 임의의 village kind 노드로 즉시 이동

export interface ItemEffect {
  kind: ItemEffectKind;
  value?: number;
  /** kind에 따라 의미가 다른 파라미터 (color key / card id / relic id 등). */
  param?: keyof ColorValues | string;
}

/**
 * 아이템 카테고리 — 사용 패턴 구분.
 *
 *  - `consumable`: 클릭 시 즉시 효과 (HP·골드·컬러 부스트 등). 기본값.
 *  - `specialty`: *마을마다 다른 특산물* — 희귀 카드 제작 재료. 클릭 사용 X.
 *  - `rare-material`: *희소 재료* — 전설 카드 제작 재료. 1런 3~4개 한정.
 *
 * 재료 카테고리는 `effects` 비워두고 사용 시점에서 *제작 슬롯만 비교*에 사용.
 */
export type ItemCategory = 'consumable' | 'specialty' | 'rare-material';

/** 아이템 정의 + 런타임 인스턴스. */
export interface Item extends NamedEntity {
  id: string;
  /** 런타임 인스턴스 ID — 카드와 동일 패턴. */
  instanceId?: string;
  rank: Rank;
  /** 카테고리 — 미지정 시 'consumable'. */
  category?: ItemCategory;
  /** 즉시 사용 효과 — 클릭 시 순서대로 적용. 재료는 빈 배열. */
  effects: ItemEffect[];
  /** 사용 후 소모? (기본 true) */
  consumable: boolean;
  flavor?: string;
  /** 특산물의 *권역 id* — 그 권역의 채집·전투에서만 드롭 (specialty 전용). */
  regionId?: string;
}
