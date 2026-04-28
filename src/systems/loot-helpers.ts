// loot-helpers.ts — 카테고리/ID 통합 드랍 처리
//
// 던전·이벤트 보상이 ItemType 카테고리만 알 때, 해당 카테고리에서 실제 ItemDef
// 하나를 골라 가방에 넣는다. 카테고리 stub(`cat_food` 등)을 직접 가방에 넣으면
// 요리 매칭/탭 분류/거래 표시가 모두 깨지므로, 모든 신규 드랍은 이 헬퍼를 거친다.
//
// 가방 가드: items.size 기반 isBagFull 검사를 호출자에서 명시적으로 적용.
// 가득 차면 드랍을 거절하고 false 를 반환한다 — 호출자가 "획득 불가" 표시.
//
// 선택 정책:
//   1) 카테고리 + 가능하면 'common' 또는 'uncommon' rarity 우선
//   2) 같은 가중치 내 균등 랜덤
//   3) 후보가 비어 있으면 카테고리 stub(cat_*) 으로 fallback (안전망)
//
// 부수 효과: 가방 슬롯 사용량이 카테고리 stub 무한 누적이 아니라 실제 종류 수로
// 정직하게 카운트된다. 이를 통해 isBagFull 한도 가드가 정상 작동한다.
//
// 호환: 기존 세이브에 들어 있는 cat_* 아이템은 inventory 표시/소비 경로가 그대로
// 처리한다(별도 마이그레이션 없이 점진 소진).

import { Actor } from '../models/actor';
import { ItemType, itemTypeToId } from '../types/enums';
import { findItemsByCategoryForLoot, getItemDef } from '../types/item-defs';
import { randomInt } from '../types/rng';

/**
 * 카테고리 드랍 — 해당 카테고리에서 ItemDef ID 하나를 랜덤으로 골라 반환.
 * common/uncommon rarity 가 있으면 그 중에서, 없으면 전체에서.
 * 후보가 없으면 카테고리 stub ID 를 fallback 으로 반환한다.
 */
export function pickItemIdForCategory(type: ItemType): string {
  const candidates = findItemsByCategoryForLoot(type);
  if (candidates.length === 0) {
    return itemTypeToId(type);
  }
  const idx = randomInt(0, candidates.length - 1);
  return candidates[idx].id;
}

/**
 * 카테고리 또는 특정 ID 의 드랍을 가방 가드와 함께 적용.
 *
 * 반환:
 *   - granted: 실제로 부여된 amount (가방 가득이면 0)
 *   - displayName: 드랍된 아이템의 표시 이름(가방 가득이어도 어떤 아이템 시도였는지 표시)
 *   - itemId: 실제 부여된 ID (또는 시도된 ID)
 *   - bagFull: 가방 가득으로 인해 거절되었는지 여부
 */
export interface LootGrant {
  granted: number;
  displayName: string;
  itemId: string;
  bagFull: boolean;
}

export function grantLootByCategory(
  actor: Actor,
  type: ItemType,
  amount: number,
  bagCapacity: number,
): LootGrant {
  const id = pickItemIdForCategory(type);
  return grantLootById(actor, id, amount, bagCapacity);
}

export function grantLootById(
  actor: Actor,
  id: string,
  amount: number,
  bagCapacity: number,
): LootGrant {
  const def = getItemDef(id);
  const displayName = def?.name ?? id;
  if (actor.isBagFull(bagCapacity, id)) {
    return { granted: 0, displayName, itemId: id, bagFull: true };
  }
  actor.addItemById(id, amount);
  return { granted: amount, displayName, itemId: id, bagFull: false };
}
