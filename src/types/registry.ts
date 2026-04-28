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
    this.locationNames.set(Loc.Guild_Hall, '길드 홀 본부');
    this.locationNames.set(Loc.Guild_Branch, '길드 알리메스 지부');
    this.locationNames.set(Loc.Market_Square, '시장');
    this.locationNames.set(Loc.Cyan_Dunes, '시안 사구');
    this.locationNames.set(Loc.Memory_Spring, '기억의 샘');
    this.locationNames.set(Loc.Limun_Ruins, '리문 유적');

    // 일루네온 지역
    this.locationNames.set('Iluneon', '일루네온');
    this.locationNames.set('Iluneon_Square', '일루네온 광장');
    this.locationNames.set('Iluneon_Diner', '일루네온 식당가');
    // 타코미
    this.locationNames.set('Tacomi', '타코미');
    this.locationNames.set('Night_Tacomi', '나이트 타코미');
    this.locationNames.set('Tacomi_Cafe', '하이 빔 카페');
    // 기타 주요 지역
    // 푸치 탑
    this.locationNames.set('Puchi_Tower', '푸치 탑');
    this.locationNames.set('Puchi_Tower_Bar', '푸치 탑 칵테일 바');
    // 기타 주요 지역
    this.locationNames.set('Kanon', '카논');
    this.locationNames.set('Arukea_1', '아루케아 북부');
    this.locationNames.set('Arukea_2', '아루케아 중부');
    this.locationNames.set('Arukea_3', '아루케아 남부');
    this.locationNames.set('Hanabridge', '하나브릿지');
    this.locationNames.set('Riagralta', '리아그랄타');
    this.locationNames.set('Lar_Forest', '라르 숲');
    this.locationNames.set('World_Tree', '세계수');
    this.locationNames.set('Ekres', '에크레스');
    this.locationNames.set('Moss', '모스');
    this.locationNames.set('Moss_Forge', '모스 대장간');
    this.locationNames.set('Moss_Tavern', '모스 주막');
    this.locationNames.set('Enicham', '에니챰');
    this.locationNames.set('Farm', '농장');
    this.locationNames.set('Herb_Garden', '플루엔 약초원');

    this.itemNames.set(ItemType.Food, '음식');
    this.itemNames.set(ItemType.Herb, '약초');
    this.itemNames.set(ItemType.OreCommon, '일반 광석');
    this.itemNames.set(ItemType.OreRare, '희귀 광석');
    this.itemNames.set(ItemType.MonsterLoot, '몬스터 전리품');
    this.itemNames.set(ItemType.Potion, '물약');
    this.itemNames.set(ItemType.Equipment, '장비 소재');
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
  return GameRegistry.I.locationNames.get(id) ?? id;
}

export function itemName(type: ItemType): string {
  return GameRegistry.I.itemNames.get(type) ?? '???';
}

export function basePrice(type: ItemType): number {
  return GameRegistry.I.basePrices.get(type) ?? 10;
}
