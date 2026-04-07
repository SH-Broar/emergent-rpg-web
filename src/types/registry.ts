// ============================================================
// registry.ts — GameRegistry 싱글톤
// 원본: Types.h:173-259
// ============================================================

import { ItemType } from './enums';
import { LocationID, Loc } from './location';

export class GameRegistry {
  private static _instance: GameRegistry;

  locationNames = new Map<LocationID, string>();
  locationDescs = new Map<LocationID, string>();
  itemNames = new Map<ItemType, string>();
  basePrices = new Map<ItemType, number>();

  static get I(): GameRegistry {
    if (!GameRegistry._instance) {
      GameRegistry._instance = new GameRegistry();
    }
    return GameRegistry._instance;
  }

  initDefaults(): void {
    this.locationNames.set(Loc.Alimes, '알리메스');
    this.locationNames.set(Loc.Guild_Hall, '길드 홀');
    this.locationNames.set(Loc.Market_Square, '시장');
    this.locationNames.set(Loc.Cyan_Dunes, '시안 듄즈');
    this.locationNames.set(Loc.Memory_Spring, '기억의 샘');
    this.locationNames.set(Loc.Limun_Ruins, '리문 유적');

    this.itemNames.set(ItemType.Food, '음식');
    this.itemNames.set(ItemType.Herb, '약초');
    this.itemNames.set(ItemType.OreCommon, '일반 광석');
    this.itemNames.set(ItemType.OreRare, '희귀 광석');
    this.itemNames.set(ItemType.MonsterLoot, '몬스터 전리품');
    this.itemNames.set(ItemType.Potion, '물약');
    this.itemNames.set(ItemType.Equipment, '장비');
    this.itemNames.set(ItemType.GuildCard, '길드 멤버 확인증');

    this.basePrices.set(ItemType.Food, 5);
    this.basePrices.set(ItemType.Herb, 8);
    this.basePrices.set(ItemType.OreCommon, 15);
    this.basePrices.set(ItemType.OreRare, 80);
    this.basePrices.set(ItemType.MonsterLoot, 30);
    this.basePrices.set(ItemType.Potion, 20);
    this.basePrices.set(ItemType.Equipment, 100);
    this.basePrices.set(ItemType.GuildCard, 50);
  }
}

export function locationName(id: LocationID): string {
  return GameRegistry.I.locationNames.get(id) ?? '???';
}

export function itemName(type: ItemType): string {
  return GameRegistry.I.itemNames.get(type) ?? '???';
}

export function basePrice(type: ItemType): number {
  return GameRegistry.I.basePrices.get(type) ?? 10;
}
