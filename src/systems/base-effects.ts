// base-effects.ts — 거점 레벨별 패시브 효과 적용

import type { GameSession } from './game-session';
import { getBaseDef } from '../data/base-defs';
import { randomInt, randomFloat } from '../types/rng';
import { getStorageProfileForItem, getItemDef, categoryName, type StorageZone, getEquippedAccessoryEffects } from '../types/item-defs';
import { ItemType } from '../types/enums';

/**
 * 매일 6시 호출: 모든 소유 거점의 Lv.5 패시브 효과 적용.
 * @returns 효과 설명 메시지 배열 (backlog용)
 */
export function applyDailyBaseEffects(session: GameSession): string[] {
  const messages: string[] = [];
  const p = session.player;
  const k = session.knowledge;

  for (const locId of k.ownedBases) {
    const level = k.getBaseLevel(locId);
    if (level < 5) continue;

    const def = getBaseDef(locId);
    if (!def) continue;

    switch (def.lv5Ability.type) {
      case 'daily_mp_regen':
        p.adjustMp(20);
        messages.push(`✨ ${locId} 거점 효과: MP +20`);
        break;

      case 'daily_gold_income': {
        const gold = randomInt(5, 20);
        p.addGold(gold);
        messages.push(`✨ ${locId} 거점 효과: +${gold}G 수입`);
        break;
      }

      case 'herb_bonus':
        p.adjustHp(5);
        messages.push(`✨ ${locId} 거점 효과: HP +5 자연 회복`);
        break;

      case 'event_alert': {
        // getActiveEvent 미구현 — 추후 EventSystem 연동
        // const ev = session.events.getActiveEvent(session.gameTime);
        break;
      }

      default:
        // market_discount, fish_bonus, rare_gather, cooking_bonus: 적용 시점에 읽힘
        break;
    }
  }

  return messages;
}

/** 시장 할인율 (모든 소유 거점의 Lv.5 market_discount 합산) */
export function getMarketDiscount(session: GameSession): number {
  for (const locId of session.knowledge.ownedBases) {
    if (session.knowledge.getBaseLevel(locId) >= 5) {
      const def = getBaseDef(locId);
      if (def?.lv5Ability.type === 'market_discount') return 0.05;
    }
  }
  return 0;
}

/** 채집 보너스 배율 (현재 위치 기준) */
export function getGatherBonus(session: GameSession, locationId: string): number {
  let bonus = 0;
  const k = session.knowledge;

  // Lv.3 이상 해당 위치 거점: +10%
  if (k.ownedBases.has(locationId) && k.getBaseLevel(locationId) >= 3) {
    bonus += 0.1;
  }

  // Lv.5 rare_gather: +15%
  if (k.getBaseLevel(locationId) >= 5) {
    const def = getBaseDef(locationId);
    if (def?.lv5Ability.type === 'rare_gather') bonus += 0.15;
  }

  // Lv.5 herb_bonus: 약초 수익 +30% (caller가 적용)
  return bonus;
}

/** 요리 효과 배율 (현재 위치 거점 레벨 기반) */
export function getCookingMultiplier(session: GameSession): number {
  const locId = session.player.currentLocation;
  const k = session.knowledge;
  if (!k.ownedBases.has(locId)) return 1.0;

  const level = k.getBaseLevel(locId);
  let mul = 1.0;
  if (level >= 3) mul += 0.2; // Lv.3 요리 강화
  if (level >= 5) {
    const def = getBaseDef(locId);
    if (def?.lv5Ability.type === 'cooking_bonus') mul += 0.2; // Lv.5 추가
  }
  return mul;
}

/** 특정 거점의 창고 용량 배율 */
export function getStorageCapacityMultiplier(session: GameSession, locationId: string): number {
  const k = session.knowledge;
  let multiplier = 1.0;
  if (k.ownedBases.has(locationId)) {
    if (k.getBaseLevel(locationId) >= 5) {
      const def = getBaseDef(locationId);
      if (def?.lv5Ability.type === 'fish_bonus') multiplier = 1.5;
    }
  }
  const accFx = getEquippedAccessoryEffects(session.player);
  multiplier += accFx.storageBonus ?? 0;
  return multiplier;
}

/**
 * 매일 호출: 기피 구역 보관 아이템에 패널티 적용.
 * - spoil: 15% 확률로 1개 소실
 * - disable: 열화도 +5% 누적 (최대 50%)
 */
function resolveItemName(id: string): string {
  const def = getItemDef(id);
  if (def) return def.name;
  const numId = parseInt(id, 10);
  if (!isNaN(numId)) return categoryName(numId as ItemType);
  return id;
}

const ZONE_NAME: Record<StorageZone, string> = { cold: '냉장', room: '실온', warm: '온장' };

export function tickStoragePenalties(session: GameSession): string[] {
  const messages: string[] = [];
  const k = session.knowledge;
  const zones: StorageZone[] = ['cold', 'room', 'warm'];

  for (const locId of k.ownedBases) {
    const storage = k.getStorage(locId);
    if (!storage) continue;

    for (const zone of zones) {
      const zoneMap = storage[zone];
      const toRemove: string[] = [];

      for (const [itemId, count] of zoneMap) {
        const profile = getStorageProfileForItem(itemId);
        if (!profile.avoidedStorage.includes(zone)) continue;

        if (profile.badStorageEffect === 'spoil') {
          // 15% 확률로 1개 상함
          if (randomFloat(0, 1) < 0.15) {
            if (count <= 1) {
              toRemove.push(itemId);
            } else {
              zoneMap.set(itemId, count - 1);
            }
            // 열화 기록도 정리
            k.setStorageDegradation(locId, zone, itemId, 0);
            const name = resolveItemName(itemId);
            messages.push(`📦 ${name} 1개가 상했다... (${ZONE_NAME[zone]})`);
          }
        } else if (profile.badStorageEffect === 'disable') {
          // 열화도 +5% 누적
          const cur = k.getStorageDegradation(locId, zone, itemId);
          const next = Math.min(50, cur + 5);
          k.setStorageDegradation(locId, zone, itemId, next);
          if (next >= 50 && cur < 50) {
            const name = resolveItemName(itemId);
            messages.push(`📦 ${name} 효과가 심하게 저하되었다! (열화 ${next}%, ${ZONE_NAME[zone]})`);
          }
        }
      }

      for (const id of toRemove) {
        zoneMap.delete(id);
      }
    }
  }

  return messages;
}
