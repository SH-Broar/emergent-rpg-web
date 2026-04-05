// trade.ts — 거래 시스템
// 원본: GameLoop.cpp case '5' (구매/판매)

import { Actor } from '../models/actor';
import { World } from '../models/world';
import { Backlog } from '../models/backlog';
import { PlayerKnowledge } from '../models/knowledge';
import { SocialHub } from '../models/social';
import { GameTime } from '../types/game-time';
import { ItemType, SpiritRole } from '../types/enums';
import { Loc } from '../types/location';
import { itemName } from '../types/registry';

// ============================================================
// 거래 가능 여부 확인
// 원본: GameLoop.cpp canTrade 판정 (시장 or 상인 근처)
// ============================================================
export function canTrade(
  actors: Actor[],
  playerIdx: number,
): boolean {
  const player = actors[playerIdx];
  if (player.currentLocation === Loc.Market_Square) return true;
  for (let i = 0; i < actors.length; i++) {
    if (i === playerIdx) continue;
    if (
      actors[i].currentLocation === player.currentLocation &&
      actors[i].spirit.role === SpiritRole.Merchant &&
      !actors[i].base.sleeping
    ) {
      return true;
    }
  }
  return false;
}

// ============================================================
// 평판 기반 가격 보정
// 원본: float locRep = knowledge.GetReputation(...)
//   buyMod  = 1.2 - 0.35 * locRep  (0→1.2, 0.5→1.025, 1.0→0.85)
//   sellMod = 0.7 + 0.3  * locRep  (0→0.7, 0.5→0.85,  1.0→1.0)
// ============================================================
export interface PriceModifiers {
  buyMod: number;
  sellMod: number;
  reputation: number;
}

export function getPriceModifiers(
  knowledge: PlayerKnowledge,
  locationId: string,
): PriceModifiers {
  const rep = knowledge.getReputation(locationId);
  return {
    buyMod: 1.2 - 0.35 * rep,
    sellMod: 0.7 + 0.3 * rep,
    reputation: rep,
  };
}

// ============================================================
// 구매 가능 품목 목록
// ============================================================
export interface BuyableItem {
  type: ItemType;
  name: string;
  price: number;
  stock: number;
}

export function getBuyableItems(
  world: World,
  mods: PriceModifiers,
): BuyableItem[] {
  const items: BuyableItem[] = [];
  for (let i = 0; i < ItemType.Count; i++) {
    const type = i as ItemType;
    const price = Math.max(1, Math.round(world.getPrice(type) * mods.buyMod));
    const stock = world.getResourceCount(Loc.Market_Square, type);
    items.push({ type, name: itemName(type), price, stock });
  }
  return items;
}

// ============================================================
// 판매 가능 품목 목록
// ============================================================
export interface SellableItem {
  type: ItemType;
  name: string;
  price: number;
  quantity: number;
}

export function getSellableItems(
  player: Actor,
  world: World,
  mods: PriceModifiers,
): SellableItem[] {
  const items: SellableItem[] = [];
  for (const [type, qty] of player.spirit.inventory) {
    if (qty > 0) {
      const price = Math.max(1, Math.round(world.getPrice(type) * mods.sellMod));
      items.push({ type, name: itemName(type), price, quantity: qty });
    }
  }
  return items;
}

// ============================================================
// 구매 실행
// 원본: GameLoop.cpp case '5' sub == "1"
// ============================================================
export interface TradeResult {
  success: boolean;
  messages: string[];
  goldChange: number;
}

export function buyItem(
  player: Actor,
  world: World,
  knowledge: PlayerKnowledge,
  social: SocialHub,
  backlog: Backlog,
  gameTime: GameTime,
  itemType: ItemType,
  buyMod: number,
): TradeResult {
  const price = Math.max(1, Math.round(world.getPrice(itemType) * buyMod));

  if (player.spirit.gold < price) {
    return { success: false, messages: ['골드가 부족하다.'], goldChange: 0 };
  }

  if (!world.removeResource(Loc.Market_Square, itemType, 1)) {
    return { success: false, messages: ['재고가 없다.'], goldChange: 0 };
  }

  player.addGold(-price);
  player.addItem(itemType, 1);

  // 퀘스트 아이템 추적
  trackPlayerQuestItem(player, social, itemType, 1);

  knowledge.trackGoldSpent(price);
  knowledge.adjustReputation(player.currentLocation, 0.02);

  const iName = itemName(itemType);
  backlog.add(
    gameTime,
    `${player.name}이(가) ${iName}을(를) ${price}골드에 구매했다.`,
    '행동',
  );

  return {
    success: true,
    messages: [`${iName}을(를) ${price}골드에 구매했다.`],
    goldChange: -price,
  };
}

// ============================================================
// 판매 실행
// 원본: GameLoop.cpp case '5' sub == "2"
// ============================================================
export function sellItem(
  player: Actor,
  world: World,
  knowledge: PlayerKnowledge,
  backlog: Backlog,
  gameTime: GameTime,
  itemType: ItemType,
  sellMod: number,
): TradeResult {
  if (!player.consumeItem(itemType, 1)) {
    return { success: false, messages: ['아이템이 없다.'], goldChange: 0 };
  }

  const price = Math.max(1, Math.round(world.getPrice(itemType) * sellMod));
  player.addGold(price);
  world.addResource(Loc.Market_Square, itemType, 1);
  world.adjustSupply(itemType, 0.05);

  knowledge.trackItemSold();
  knowledge.adjustReputation(player.currentLocation, 0.02);

  const iName = itemName(itemType);
  backlog.add(
    gameTime,
    `${player.name}이(가) ${iName}을(를) ${price}골드에 판매했다.`,
    '행동',
  );

  return {
    success: true,
    messages: [`${iName}을(를) ${price}골드에 판매했다.`],
    goldChange: price,
  };
}

// ============================================================
// 평판 상태 텍스트
// ============================================================
export function reputationStatusText(reputation: number): string {
  if (reputation >= 0.7) return '(평판 할인 적용중)';
  if (reputation < 0.3) return '(평판 부족 -- 가격 상승)';
  return '';
}

// ============================================================
// 퀘스트 아이템 추적 헬퍼
// 원본: TrackPlayerQuestItem()
// ============================================================
function trackPlayerQuestItem(
  player: Actor,
  social: SocialHub,
  itemType: ItemType,
  amount: number,
): void {
  const questId = player.spirit.activeQuestId;
  if (questId >= 0) {
    const quest = social.getQuest(questId);
    if (quest && quest.targetItem === itemType) {
      social.progressQuest(questId, amount);
    }
  }
}
