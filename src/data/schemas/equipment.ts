/**
 * 장비 스키마 (M9).
 *
 * 3 슬롯 — 무기 / 상의 / 악세서리. 각 장비는 ColorEffect 목록을 가지며 8 컬러 어디든 +/- 가능.
 * 장착 시 effective colors = base colors + 장착된 장비들의 ColorEffect 합산 (음수 가능).
 *
 * calculateStat이 Math.max(0,...) 처리하므로 음수가 와도 안전.
 */

import type { Element, NamedEntity, Rank } from './base';

export type EquipmentSlot = 'weapon' | 'chest' | 'accessory';
export type EquipmentId = string;

export interface ColorEffect {
  /** 8 컬러 어디든 허용. UI 표시 풀은 6 컬러(light/dark 제외). */
  color: Element;
  /** +/- 정수. */
  value: number;
}

/**
 * 정책 (Round3 W3/⚠1): 한 런 인벤토리에 같은 id 장비는 *최대 1개*.
 * 중복 드롭 시 호출자가 dedupe 보장 — 드롭 로직(미구현)에서 already-have 체크 후 인벤토리 push.
 * 본 콘텐츠 사이클에서 중복 보유가 필요해지면 `instanceId?: string` 추가 + addItem 패턴 도입 검토.
 * 현재 placeholder 콘텐츠는 중복 드롭 없음.
 */
export interface Equipment extends NamedEntity {
  id: EquipmentId;
  slot: EquipmentSlot;
  rank: Rank;
  colorEffects: ColorEffect[];
  flavor?: string;
}
