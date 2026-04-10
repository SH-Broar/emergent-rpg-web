// world.ts — 월드 시스템
// 원본: World.h

import { ItemType, Element, ELEMENT_COUNT, Weather, Season } from '../types/enums';
import { LocationID } from '../types/location';
import { GameTime, TimeWindow } from '../types/game-time';
import { GameRegistry } from '../types/registry';
import { randomInt, randomFloat } from '../types/rng';
import { SeasonSchedule, getSeasonEffect } from './season';
import { rollDailyWeather } from '../systems/weather';

export interface TravelLinkSpec {
  target: LocationID;
  minutesOverride: number; // <0 = use grid distance
}

export interface ProductionRecipe {
  name: string;
  location: LocationID;
  vigorCost: number;
  timeCost: number;
  inputs: [ItemType, number][];
  outputs: [ItemType, number][];
  bonusOutputs: [ItemType, number][];
  roleEfficiency: Map<number, number>;
  defaultEfficiency: number;
  colorInfluence: number[];
}

export interface ResourceCapacity {
  capacity: number;
  fertility: number;
  naturalRegenRate: number;
  depletionPerUse: number;
  fertilityRegen: number;
}

export interface LocationData {
  id: LocationID;
  description: string;
  resources: Map<ItemType, number>;
  monsterLevel: number;
  dangerLevel: number;
  gridX: number;
  gridY: number;
  linksBidirectional: TravelLinkSpec[];
  linksOneWayOut: TravelLinkSpec[];
  resourceCaps: Map<ItemType, ResourceCapacity>;
  racialSynergy: number;
  gatherEnv: string[];
  /** 이 지역이 보이는 시간대. null = 항상 표시. */
  timeVisible?: TimeWindow;
  hidden?: boolean;
}

export function createLocationData(id: LocationID): LocationData {
  return {
    id, description: '', resources: new Map(), monsterLevel: 0, dangerLevel: 0,
    gridX: 0, gridY: 0, linksBidirectional: [], linksOneWayOut: [],
    resourceCaps: new Map(), racialSynergy: 0, gatherEnv: [], timeVisible: undefined, hidden: false,
  };
}

export interface MarketPrice {
  item: ItemType;
  basePrice: number;
  supplyFactor: number;
  demandFactor: number;
}

export function currentPrice(mp: MarketPrice): number {
  return Math.max(1, Math.round(mp.basePrice * mp.demandFactor / mp.supplyFactor));
}

interface RouteBlock { from: LocationID; to: LocationID; untilDay: number; }

export class World {
  private locations = new Map<LocationID, LocationData>();
  private market = new Map<ItemType, MarketPrice>();
  private gridMinutesPerUnit = 2.0;
  private travelRoutes = new Map<LocationID, [LocationID, number][]>();
  private oneWayEdges = new Set<string>();
  private routeBlocks: RouteBlock[] = [];
  private productionRecipes = new Map<LocationID, ProductionRecipe[]>();

  seasonSchedule = new SeasonSchedule();
  worldColor: number[] = new Array(ELEMENT_COUNT).fill(0.5);
  weather: Weather = Weather.Clear;
  temperature = 15.0;

  setLocation(id: LocationID, data: LocationData): void {
    this.locations.set(id, data);
  }

  getLocation(id: LocationID): LocationData {
    let loc = this.locations.get(id);
    if (!loc) { loc = createLocationData(id); this.locations.set(id, loc); }
    return loc;
  }

  getAllLocations(): Map<LocationID, LocationData> { return this.locations; }

  addResource(loc: LocationID, item: ItemType, amount: number): void {
    const l = this.getLocation(loc);
    l.resources.set(item, (l.resources.get(item) ?? 0) + amount);
  }

  removeResource(loc: LocationID, item: ItemType, amount: number): boolean {
    const l = this.getLocation(loc);
    const cur = l.resources.get(item) ?? 0;
    if (cur < amount) return false;
    l.resources.set(item, cur - amount);
    return true;
  }

  getResourceCount(loc: LocationID, item: ItemType): number {
    return this.locations.get(loc)?.resources.get(item) ?? 0;
  }

  initMarketFromRegistry(): void {
    const reg = GameRegistry.I;
    for (const [item, price] of reg.basePrices) {
      this.market.set(item, { item, basePrice: price, supplyFactor: 1, demandFactor: 1 });
    }
  }

  getPrice(item: ItemType): number {
    const mp = this.market.get(item);
    return mp ? currentPrice(mp) : GameRegistry.I.basePrices.get(item) ?? 10;
  }

  adjustSupply(item: ItemType, delta: number): void {
    const mp = this.market.get(item);
    if (mp) mp.supplyFactor = Math.max(0.1, mp.supplyFactor + delta);
  }

  adjustDemand(item: ItemType, delta: number): void {
    const mp = this.market.get(item);
    if (mp) mp.demandFactor = Math.max(0.1, mp.demandFactor + delta);
  }

  setGridMinutesPerUnit(m: number): void { this.gridMinutesPerUnit = m; }
  getGridMinutesPerUnit(): number { return this.gridMinutesPerUnit; }

  private minutesFromGrid(a: LocationID, b: LocationID): number {
    const la = this.locations.get(a);
    const lb = this.locations.get(b);
    if (!la || !lb) return 30;
    const dx = la.gridX - lb.gridX;
    const dy = la.gridY - lb.gridY;
    return Math.max(1, Math.round(Math.sqrt(dx * dx + dy * dy) * this.gridMinutesPerUnit));
  }

  rebuildTravelGraph(): void {
    this.travelRoutes.clear();
    this.oneWayEdges.clear();
    for (const [id, loc] of this.locations) {
      for (const link of loc.linksBidirectional) {
        const mins = link.minutesOverride >= 0 ? link.minutesOverride : this.minutesFromGrid(id, link.target);
        this.mergeEdge(id, link.target, mins, false);
        this.mergeEdge(link.target, id, mins, false);
      }
      for (const link of loc.linksOneWayOut) {
        const mins = link.minutesOverride >= 0 ? link.minutesOverride : this.minutesFromGrid(id, link.target);
        this.mergeEdge(id, link.target, mins, true);
      }
    }
  }

  private mergeEdge(from: LocationID, to: LocationID, minutes: number, oneWay: boolean): void {
    let routes = this.travelRoutes.get(from);
    if (!routes) { routes = []; this.travelRoutes.set(from, routes); }
    const existing = routes.find(r => r[0] === to);
    if (existing) { existing[1] = minutes; }
    else { routes.push([to, minutes]); }
    if (oneWay) this.oneWayEdges.add(`${from}→${to}`);
  }

  blockRoute(from: LocationID, to: LocationID, untilDay: number): void {
    this.routeBlocks.push({ from, to, untilDay });
  }

  isRouteBlocked(from: LocationID, to: LocationID, currentDay: number): boolean {
    return this.routeBlocks.some(b =>
      b.from === from && b.to === to && currentDay <= b.untilDay);
  }

  clearExpiredRouteBlocks(currentDay: number): void {
    this.routeBlocks = this.routeBlocks.filter(b => currentDay <= b.untilDay);
  }

  getNeighbors(from: LocationID, currentDay = 0): LocationID[] {
    const routes = this.travelRoutes.get(from) ?? [];
    return routes
      .filter(([to]) => !this.isRouteBlocked(from, to, currentDay))
      .map(([to]) => to);
  }

  getOutgoingRoutes(from: LocationID, currentDay: number): [LocationID, number][] {
    const routes = this.travelRoutes.get(from) ?? [];
    return routes.filter(([to]) => !this.isRouteBlocked(from, to, currentDay));
  }

  getTravelMinutes(from: LocationID, to: LocationID, _currentDay = 0): number {
    const routes = this.travelRoutes.get(from) ?? [];
    const r = routes.find(([t]) => t === to);
    return r ? r[1] : 30;
  }

  /** BFS로 from→to 최단 이동 시간(분)을 계산한다. 경로 없으면 120을 반환. */
  getShortestMinutes(from: LocationID, to: LocationID, currentDay = 0): number {
    if (from === to) return 0;
    const dist = new Map<string, number>();
    const queue: [LocationID, number][] = [[from, 0]];
    dist.set(from, 0);
    while (queue.length > 0) {
      const [cur, d] = queue.shift()!;
      for (const [next, mins] of this.getOutgoingRoutes(cur, currentDay)) {
        if (!dist.has(next)) {
          dist.set(next, d + mins);
          queue.push([next, d + mins]);
        }
      }
    }
    return dist.get(to) ?? 120;
  }

  getNextStep(from: LocationID, to: LocationID, currentDay = 0): LocationID {
    if (from === to) return from;
    const visited = new Set<LocationID>([from]);
    const queue: [LocationID, LocationID][] = [];
    for (const n of this.getNeighbors(from, currentDay)) {
      visited.add(n);
      queue.push([n, n]);
    }
    while (queue.length > 0) {
      const [current, firstStep] = queue.shift()!;
      if (current === to) return firstStep;
      for (const n of this.getNeighbors(current, currentDay)) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push([n, firstStep]);
        }
      }
    }
    return '';
  }

  getCurrentSeason(): Season { return this.seasonSchedule.current; }
  getCurrentSeasonEffect() { return getSeasonEffect(this.seasonSchedule.current); }

  addProductionRecipe(recipe: ProductionRecipe): void {
    const list = this.productionRecipes.get(recipe.location) ?? [];
    list.push(recipe);
    this.productionRecipes.set(recipe.location, list);
  }

  getProductionRecipes(loc: LocationID): readonly ProductionRecipe[] {
    return this.productionRecipes.get(loc) ?? [];
  }

  updateWeatherAndTemp(): void {
    this.weather = rollDailyWeather(this.getCurrentSeason(), this.weather);
    this.temperature = randomFloat(5, 30);
  }

  onTick(time: GameTime): void {
    this.clearExpiredRouteBlocks(time.day);
    this.driftWorldColorDaily();

    // Season advance check
    const seasonChanged = this.seasonSchedule.advanceIfNeeded(time.day);
    if (seasonChanged) {
      this.driftWorldColorSeasonal();
      this.updateWeatherAndTemp();
    }

    // Daily weather roll + resource regeneration at 6:00 AM
    if (time.hour === 6 && time.minute === 0) {
      this.updateWeatherAndTemp();
      const effect = this.getCurrentSeasonEffect();
      const wcEarth = this.worldColor[Element.Earth as number];
      const wcWater = this.worldColor[Element.Water as number];
      const colorBonus = 1 + (wcEarth + wcWater - 1) * 0.3;
      const resMul = effect.resourceMultiplier * Math.max(0.5, colorBonus);

      // Natural resource regen
      const herbBase = Math.floor(randomInt(0, 2) * resMul);
      const foodBase = Math.floor(randomInt(0, 3) * resMul);
      this.addResource('Cyan_Dunes', ItemType.Herb, Math.max(0, herbBase));
      this.addResource('Cyan_Dunes', ItemType.Food, Math.max(0, foodBase));
      this.addResource('Cyan_Dunes', ItemType.MonsterLoot, randomInt(0, 1));
      this.addResource('Tiklit_Range', ItemType.OreCommon, randomInt(0, 2));

      // Fertility regen
      this.dailyResourceRegen();

      // Market price normalization
      for (const [, mp] of this.market) {
        mp.supplyFactor += (1 - mp.supplyFactor) * 0.1;
        mp.demandFactor += (1 - mp.demandFactor) * 0.1;
        mp.demandFactor += (effect.priceMultiplier - 1) * 0.05;
      }
    }
  }

  private dailyResourceRegen(): void {
    for (const [, loc] of this.locations) {
      for (const [item, cap] of loc.resourceCaps) {
        // Fertility slowly recovers
        cap.fertility = Math.min(1, cap.fertility + cap.fertilityRegen);
        // Resources regenerate based on fertility
        const regen = Math.floor(cap.naturalRegenRate * cap.fertility);
        if (regen > 0) {
          const current = loc.resources.get(item) ?? 0;
          loc.resources.set(item, Math.min(cap.capacity, current + regen));
        }
      }
    }
  }

  private driftWorldColorSeasonal(): void {
    const effect = this.getCurrentSeasonEffect();
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      const target = effect.colorDrift?.[i] ?? 0.5;
      this.worldColor[i] += (target - this.worldColor[i]) * 0.1;
    }
  }

  private driftWorldColorDaily(): void {
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      this.worldColor[i] += (0.5 - this.worldColor[i]) * 0.02;
    }
  }
}
