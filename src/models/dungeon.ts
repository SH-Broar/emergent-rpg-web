// dungeon.ts — 던전 시스템
// 원본: DungeonSystem.h

import { ItemType, Element } from '../types/enums';
import { LocationID } from '../types/location';
import { randomInt, randomFloat } from '../types/rng';

export interface LootEntry {
  item: ItemType;
  amount: number;
  chance: number; // 0~1
}

export interface MonsterDef {
  id: string;
  name: string;
  attack: number;
  defense: number;
  hp: number;
  lootTable: LootEntry[];
}

export enum DungeonEventType { Treasure, Hazard, Heal, Discovery }

export interface DungeonEventDef {
  id: string;
  name: string;
  description: string;
  chance: number;
  type: DungeonEventType;
  gives: LootEntry[];
  hpDamage: number;
  vigorDamage: number;
  hpHeal: number;
  vigorHeal: number;
  colorInfluence: number[];
}

export interface DungeonDef {
  id: string;
  name: string;
  deepName: string;
  description: string;
  deepDescription: string;
  difficulty: number;
  progressPerAdvance: number;
  accessFrom: LocationID;
  enemyIds: string[];
  lootOnClear: LootEntry[];
  lootPerAdvance: LootEntry[];
  lootRareChance: number;
  lootRare: LootEntry[];
  colorInfluence: number[];
}

export interface CombatBehaviorRule {
  hpThresholdRetreat: number;
  hpThresholdRest: number;
  vigorMinimum: number;
  mpCostPerTurn: number;
}

export interface ColorCombatRule {
  element: Element;
  isHigh: boolean;
  threshold: number;
  effect: string;
  value: number;
}

export interface CombatState {
  dungeonId: string;
  combatTurn: number;
  currentEnemy: MonsterDef;
  enemyHp: number;
  combatLog: string[];
}

export interface CombatTurnResult {
  damageDealt: number;
  damageTaken: number;
  vigorCost: number;
  mpCost: number;
  enemyDead: boolean;
  playerDead: boolean;
  attackMod: number;
  defenseMod: number;
}

export enum DungeonAction { Advance, Rest, Retreat }

export class DungeonSystem {
  private dungeons: DungeonDef[] = [];
  private monsters = new Map<string, MonsterDef>();
  private dungeonEvents: DungeonEventDef[] = [];
  private defaultRule: CombatBehaviorRule = {
    hpThresholdRetreat: 20, hpThresholdRest: 40, vigorMinimum: 10, mpCostPerTurn: 5,
  };
  private roleRules = new Map<string, CombatBehaviorRule>();
  private colorRules: ColorCombatRule[] = [];

  addDungeon(d: DungeonDef): void { this.dungeons.push(d); }
  addMonster(m: MonsterDef): void { this.monsters.set(m.id, m); }
  addDungeonEvent(e: DungeonEventDef): void { this.dungeonEvents.push(e); }
  setDefaultRule(r: CombatBehaviorRule): void { this.defaultRule = r; }
  setRoleRule(role: string, r: CombatBehaviorRule): void { this.roleRules.set(role, r); }
  addColorRule(r: ColorCombatRule): void { this.colorRules.push(r); }

  getDungeon(id: string): DungeonDef | undefined {
    return this.dungeons.find(d => d.id === id);
  }

  getAllDungeons(): readonly DungeonDef[] { return this.dungeons; }

  isDungeonEntrance(loc: LocationID): boolean {
    return this.dungeons.some(d => d.accessFrom === loc);
  }

  getDungeonByLocation(loc: LocationID): DungeonDef | undefined {
    return this.dungeons.find(d => d.accessFrom === loc || d.accessFrom + '_Deep' === loc);
  }

  isDeepLocation(loc: LocationID): boolean {
    return loc.endsWith('_Deep');
  }

  selectEnemy(dungeon: DungeonDef, progress: number): MonsterDef {
    if (dungeon.enemyIds.length === 0) {
      return { id: 'unknown', name: '???', attack: 5, defense: 3, hp: 20, lootTable: [] };
    }
    const maxIdx = Math.min(
      dungeon.enemyIds.length - 1,
      Math.floor((progress / 100) * dungeon.enemyIds.length)
    );
    const idx = randomInt(0, maxIdx);
    const id = dungeon.enemyIds[idx];
    return this.monsters.get(id) ?? { id, name: id, attack: 10, defense: 5, hp: 30, lootTable: [] };
  }

  calcDifficultyStars(dungeon: DungeonDef): number {
    return Math.max(1, Math.min(10, Math.round(dungeon.difficulty * 10)));
  }

  rollDungeonEvent(): DungeonEventDef | null {
    for (const e of this.dungeonEvents) {
      if (randomFloat(0, 1) < e.chance) return e;
    }
    return null;
  }

  simulateCombatTurn(
    playerAttack: number, playerDefense: number, playerHp: number,
    colorValues: number[], state: CombatState,
  ): CombatTurnResult {
    let attackMod = 1.0;
    let defenseMod = 1.0;
    for (const rule of this.colorRules) {
      const val = colorValues[rule.element] ?? 0.5;
      const meets = rule.isHigh ? val >= rule.threshold : val <= rule.threshold;
      if (meets) {
        if (rule.effect === 'bonus_attack') attackMod += rule.value;
        if (rule.effect === 'bonus_defense') defenseMod += rule.value;
      }
    }

    const dmg = Math.max(1, Math.round(playerAttack * attackMod - state.currentEnemy.defense * 0.5));
    const taken = Math.max(0, Math.round(state.currentEnemy.attack - playerDefense * defenseMod * 0.5));
    state.enemyHp -= dmg;
    state.combatTurn++;

    return {
      damageDealt: dmg,
      damageTaken: taken,
      vigorCost: 5,
      mpCost: this.defaultRule.mpCostPerTurn,
      enemyDead: state.enemyHp <= 0,
      playerDead: playerHp - taken <= 0,
      attackMod,
      defenseMod,
    };
  }

  getBehaviorRule(role: string): CombatBehaviorRule {
    return this.roleRules.get(role) ?? this.defaultRule;
  }

  getNpcDungeonChoice(hpRatio: number, vigorRatio: number, role: string): DungeonAction {
    const rule = this.getBehaviorRule(role);
    if (hpRatio * 100 < rule.hpThresholdRetreat) return DungeonAction.Retreat;
    if (hpRatio * 100 < rule.hpThresholdRest || vigorRatio * 100 < rule.vigorMinimum) return DungeonAction.Rest;
    return DungeonAction.Advance;
  }
}
