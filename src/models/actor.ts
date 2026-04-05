// actor.ts — 액터 시스템
// 원본: Actor.h

import { ItemType, Race, SpiritRole } from '../types/enums';
import { LocationID, Loc } from '../types/location';
import { GameTime } from '../types/game-time';
import { ColorProfile } from './color';
import { Relationship, Memory, createRelationship } from './social';

export interface BaseProperty {
  race: Race;
  hp: number; maxHp: number;
  mp: number; maxMp: number;
  attack: number; defense: number;
  vigor: number; maxVigor: number;
  strength: number;
  age: number;
  level: number; exp: number;
  sleeping: boolean;
  mood: number;
}

export function createBaseProperty(race = Race.Human): BaseProperty {
  return {
    race, hp: 100, maxHp: 100, mp: 30, maxMp: 30,
    attack: 10, defense: 5, vigor: 100, maxVigor: 100,
    strength: 0.5, age: 25, level: 1, exp: 0, sleeping: false, mood: 0,
  };
}

export interface SpiritProperty {
  role: SpiritRole;
  gold: number;
  inventory: Map<ItemType, number>;
  questsPosted: number;
  dungeonsCleared: number;
  tradeCount: number;
  activeQuestId: number;
}

export function createSpiritProperty(role = SpiritRole.Villager): SpiritProperty {
  return {
    role, gold: 50, inventory: new Map(),
    questsPosted: 0, dungeonsCleared: 0, tradeCount: 0, activeQuestId: -1,
  };
}

export enum ActionType {
  Idle, Eat, Rest, Sleep, WakeUp, GoToLocation,
  Trade_Buy, Trade_Sell, Trade_WithActor, ExploreDungeon,
  PostQuest, CheckQuests, AcceptQuest, TurnInQuest,
  Socialize, ShareRumor, Hoard, PriceGouge, Complain, SeekAlternative,
  Produce, ShareMeal, TeachSkill, CulturalExchange, CooperateWork, Celebrate,
  Count,
}

export function expForLevel(level: number): number { return 80 + level * 20; }

export class Actor {
  name: string;
  base: BaseProperty;
  spirit: SpiritProperty;
  color: ColorProfile;
  currentLocation: LocationID = Loc.Town_Elimes;
  moveDestination = '';
  actionCooldown = 0;
  playable = true;
  isCustom = false;
  homeLocation: LocationID = Loc.Town_Elimes;
  relationships = new Map<string, Relationship>();
  memories: Memory[] = [];
  dungeonProgress = new Map<string, number>();
  background = '';
  hasLearnedMagic = false;
  stationary = false;
  hyperionLevel = 0;
  hyperionFlags: boolean[] = [false, false, false, false, false];
  lastTickHour = 6;

  static readonly MAX_MEMORIES = 100;

  constructor(name: string, race: Race, role: SpiritRole) {
    this.name = name;
    this.base = createBaseProperty(race);
    this.spirit = createSpiritProperty(role);
    this.color = new ColorProfile();
  }

  isAlive(): boolean { return this.base.hp > 0; }
  isLowVigor(): boolean { return this.base.vigor < 40; }
  isHungry(): boolean { return this.base.vigor < 40; }
  isTired(): boolean { return this.base.vigor < 40; }
  isExhausted(): boolean { return this.base.vigor < 15; }
  isStarving(): boolean { return this.base.vigor < 20; }
  isNight(): boolean { return this.lastTickHour >= 21 || this.lastTickHour < 5; }

  adjustRelationship(otherName: string, trustDelta: number, affinityDelta: number): void {
    let rel = this.relationships.get(otherName);
    if (!rel) { rel = createRelationship(); this.relationships.set(otherName, rel); }
    rel.trust = Math.max(-1, Math.min(1, rel.trust + trustDelta));
    rel.affinity = Math.max(-1, Math.min(1, rel.affinity + affinityDelta));
    rel.interactionCount++;
  }

  addMemory(mem: Memory): void {
    this.memories.push(mem);
    if (this.memories.length > Actor.MAX_MEMORIES) this.memories.shift();
  }

  consumeItem(type: ItemType, amount: number): boolean {
    const cur = this.spirit.inventory.get(type) ?? 0;
    if (cur < amount) return false;
    this.spirit.inventory.set(type, cur - amount);
    return true;
  }

  addItem(type: ItemType, amount: number): void {
    this.spirit.inventory.set(type, (this.spirit.inventory.get(type) ?? 0) + amount);
  }

  addGold(amount: number): void { this.spirit.gold += amount; }

  adjustVigor(delta: number): void {
    this.base.vigor = Math.max(0, Math.min(this.base.maxVigor, this.base.vigor + delta));
  }
  adjustHp(delta: number): void {
    this.base.hp = Math.max(0, Math.min(this.base.maxHp, this.base.hp + delta));
  }
  adjustMp(delta: number): void {
    this.base.mp = Math.max(0, Math.min(this.base.maxMp, this.base.mp + delta));
  }
  adjustMood(delta: number): void {
    this.base.mood = Math.max(-1, Math.min(1, this.base.mood + delta));
  }

  gainExp(amount: number): boolean {
    this.base.exp += amount;
    const needed = expForLevel(this.base.level);
    if (this.base.exp >= needed) {
      this.base.exp -= needed;
      this.base.level++;
      return true;
    }
    return false;
  }

  getDungeonProgress(dungeonId: string): number {
    return this.dungeonProgress.get(dungeonId) ?? 0;
  }
  addDungeonProgress(dungeonId: string, amount: number): void {
    this.dungeonProgress.set(dungeonId, (this.dungeonProgress.get(dungeonId) ?? 0) + amount);
  }

  getEffectiveMaxHp(): number { return this.base.maxHp + this.hyperionLevel * 10; }
  getEffectiveMaxMp(): number { return this.base.maxMp + this.hyperionLevel * 5; }
  getEffectiveAttack(): number { return this.base.attack + this.hyperionLevel * 2; }
  getEffectiveDefense(): number { return this.base.defense + this.hyperionLevel * 1; }
  getEffectiveMaxVigor(): number { return this.base.maxVigor + this.hyperionLevel * 5; }

  receiveEventInfluence(influence: number[], _eventName: string, _time: GameTime): void {
    this.color.applyInfluence(influence);
  }
}
