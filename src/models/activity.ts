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

  addActivity(location: LocationID, def: ActivityDef): void {
    const list = this.activities.get(location) ?? [];
    list.push(def);
    this.activities.set(location, list);
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
}
