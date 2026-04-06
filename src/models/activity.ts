// activity.ts — 활동 시스템
// 원본: ActivitySystem.h

import { ItemType } from '../types/enums';
import { LocationID } from '../types/location';

export interface ItemRequirement {
  item: ItemType;
  amount: number;
}

export interface LootTableEntry {
  item: ItemType;
  amount: number;
  chance: number;
}

export interface ActivityDef {
  name: string;
  key: string;
  timeCost: number;
  vigorCost: number;
  goldCost: number;
  description: string;
  condition: string;
  effect: string;
  itemReqs: ItemRequirement[];
  gives: ItemRequirement[];
  lootTable: LootTableEntry[];
  colorInfluence: number[];
  /** true이면 gives 아이템을 이미 소지 중일 때 활동 목록에서 숨김 */
  unique: boolean;
  /** 초기 재고 수량 (-1 = 무제한, 기본값) */
  stock: number;
}

export interface CropState {
  locationId: string;
  activityKey: string;
  plantedGameMinute: number;
  growthMinutes: number;
  ready: boolean;
}

export function updateCropReady(crop: CropState, currentGameMinute: number): void {
  if (!crop.ready && currentGameMinute >= crop.plantedGameMinute + crop.growthMinutes) {
    crop.ready = true;
  }
}

export function gameTimeToMinute(day: number, hour: number, minute: number): number {
  return day * 1440 + hour * 60 + minute;
}

export interface BuffState {
  type: string; // "attack", "defense"
  amount: number;
  remainingTurns: number; // -1 = permanent
}

export class ActivitySystem {
  private activities = new Map<LocationID, ActivityDef[]>();
  /** 재고 추적: "locationId:activityKey" → 남은 수량 */
  private stockMap = new Map<string, number>();
  /** 마지막 재고 보충 게임일 */
  private lastRestockDay = -1;

  addActivity(location: LocationID, def: ActivityDef): void {
    const list = this.activities.get(location) ?? [];
    list.push(def);
    this.activities.set(location, list);
    // 초기 재고 설정
    if (def.stock > 0) {
      this.stockMap.set(`${location}:${def.key}`, def.stock);
    }
  }

  getActivitiesForLocation(location: LocationID): readonly ActivityDef[] {
    return this.activities.get(location) ?? [];
  }

  hasActivities(location: LocationID): boolean {
    const list = this.activities.get(location);
    return list !== undefined && list.length > 0;
  }

  getAllActivities(): Map<LocationID, ActivityDef[]> {
    return this.activities;
  }

  /** 재고 확인. stock === -1이면 무제한(항상 true). 0이면 품절. */
  hasStock(location: LocationID, activityKey: string): boolean {
    const key = `${location}:${activityKey}`;
    const remaining = this.stockMap.get(key);
    if (remaining === undefined) return true; // 재고 관리 안 하는 활동
    return remaining > 0;
  }

  getStock(location: LocationID, activityKey: string): number {
    const key = `${location}:${activityKey}`;
    return this.stockMap.get(key) ?? -1;
  }

  consumeStock(location: LocationID, activityKey: string): void {
    const key = `${location}:${activityKey}`;
    const remaining = this.stockMap.get(key);
    if (remaining !== undefined && remaining > 0) {
      this.stockMap.set(key, remaining - 1);
    }
  }

  /** 매일 재고 보충 (게임 일자 기준) */
  restockIfNewDay(gameDay: number): void {
    if (gameDay <= this.lastRestockDay) return;
    this.lastRestockDay = gameDay;
    for (const [location, defs] of this.activities) {
      for (const def of defs) {
        if (def.stock > 0) {
          this.stockMap.set(`${location}:${def.key}`, def.stock);
        }
      }
    }
  }
}
