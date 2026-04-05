// ============================================================
// season.ts — 계절 효과 + 스케줄
// 원본: Season.h:54-144
// ============================================================

import { Season, Element, ELEMENT_COUNT, SEASON_COUNT, SEASON_DURATION_DAYS } from '../types/enums';
import { randomInt } from '../types/rng';

export interface SeasonEffect {
  colorDrift: number[];
  resourceMultiplier: number;
  dangerDelta: number;
  priceMultiplier: number;
  travelCostMultiplier: number;
  healingMultiplier: number;
  lootMultiplier: number;
  rareEventMultiplier: number;
}

function defaultEffect(): SeasonEffect {
  return {
    colorDrift: new Array(ELEMENT_COUNT).fill(0),
    resourceMultiplier: 1,
    dangerDelta: 0,
    priceMultiplier: 1,
    travelCostMultiplier: 1,
    healingMultiplier: 1,
    lootMultiplier: 1,
    rareEventMultiplier: 1,
  };
}

export function getSeasonEffect(s: Season): SeasonEffect {
  const e = defaultEffect();
  switch (s) {
    case Season.Blaze:
      e.colorDrift[Element.Fire] = 0.002;
      e.colorDrift[Element.Light] = 0.001;
      e.resourceMultiplier = 0.7;
      e.dangerDelta = 0.1;
      e.priceMultiplier = 1.1;
      break;
    case Season.Frost:
      e.colorDrift[Element.Water] = 0.002;
      e.colorDrift[Element.Iron] = 0.001;
      e.resourceMultiplier = 0.8;
      e.travelCostMultiplier = 1.3;
      break;
    case Season.Thunder:
      e.colorDrift[Element.Electric] = 0.002;
      e.colorDrift[Element.Wind] = 0.001;
      e.dangerDelta = 0.15;
      e.rareEventMultiplier = 2.0;
      e.travelCostMultiplier = 1.2;
      break;
    case Season.Harvest:
      e.colorDrift[Element.Earth] = 0.002;
      e.colorDrift[Element.Water] = 0.001;
      e.resourceMultiplier = 1.5;
      e.priceMultiplier = 0.9;
      break;
    case Season.Radiance:
      e.colorDrift[Element.Light] = 0.002;
      e.colorDrift[Element.Wind] = 0.001;
      e.healingMultiplier = 1.3;
      e.lootMultiplier = 1.2;
      e.dangerDelta = -0.1;
      break;
    case Season.Silence:
      e.colorDrift[Element.Dark] = 0.002;
      e.colorDrift[Element.Iron] = 0.001;
      e.dangerDelta = 0.2;
      break;
  }
  return e;
}

function randomNextExcluding(exclude: Season): Season {
  let s: Season;
  do {
    s = randomInt(0, SEASON_COUNT - 1) as Season;
  } while (s === exclude);
  return s;
}

export class SeasonSchedule {
  current: Season = Season.Harvest;
  next: Season = Season.Blaze;
  afterNext: Season = Season.Frost;
  weekStartDay = 1;

  init(startDay: number): void {
    this.weekStartDay = startDay;
    this.current = randomInt(0, SEASON_COUNT - 1) as Season;
    this.next = randomNextExcluding(this.current);
    this.afterNext = randomNextExcluding(this.next);
  }

  advanceIfNeeded(currentDay: number): boolean {
    if (currentDay < this.weekStartDay + SEASON_DURATION_DAYS) return false;
    this.current = this.next;
    this.next = this.afterNext;
    this.afterNext = randomNextExcluding(this.next);
    this.weekStartDay += SEASON_DURATION_DAYS;
    return true;
  }

  daysLeft(currentDay: number): number {
    return Math.max(0, this.weekStartDay + SEASON_DURATION_DAYS - currentDay);
  }
}
