// knowledge.ts — PlayerKnowledge + CoreMatrix
// 원본: PlayerKnowledge.h, CoreMatrix.h

import { ELEMENT_COUNT } from '../types/enums';
import { generateDefaultCellConditions, generateDefaultRowConditions, generateDefaultColConditions } from './core-matrix-conditions';

// ============================================================
// CoreMatrix
// ============================================================
const MATRIX_SIZE = 8;
// const MATRIX_CELLS = MATRIX_SIZE * MATRIX_SIZE; // 64

export interface CellCondition {
  weights: number[];
  threshold: number;
  invert: boolean;
}

export interface LineCondition {
  weights: number[];
  threshold: number;
  flipIfTrue: boolean;
}

export class CoreMatrix {
  bits = 0n; // BigInt for 64-bit
  diagScores: number[][] = Array.from({ length: MATRIX_SIZE }, () => new Array(MATRIX_SIZE).fill(0));
  private cellConditions: CellCondition[] = [];
  private rowConditions: LineCondition[] = [];
  private colConditions: LineCondition[] = [];

  constructor() {
    this.setCellConditions(generateDefaultCellConditions());
    this.setRowConditions(generateDefaultRowConditions());
    this.setColConditions(generateDefaultColConditions());
  }

  recalculate(colorValues: number[]): void {
    let bits = 0n;
    for (let r = 0; r < MATRIX_SIZE; r++) {
      for (let c = 0; c < MATRIX_SIZE; c++) {
        const idx = r * MATRIX_SIZE + c;
        const cond = this.cellConditions[idx];
        if (!cond) continue;
        let sum = this.diagScores[r][c];
        for (let e = 0; e < ELEMENT_COUNT; e++) sum += (cond.weights[e] ?? 0) * (colorValues[e] ?? 0.5);
        let on = sum >= cond.threshold;
        if (cond.invert) on = !on;
        if (on) bits |= 1n << BigInt(idx);
      }
    }
    // Row/col corrections
    for (let r = 0; r < MATRIX_SIZE; r++) {
      const rc = this.rowConditions[r];
      if (!rc) continue;
      let sum = 0;
      for (let e = 0; e < ELEMENT_COUNT; e++) sum += (rc.weights[e] ?? 0) * (colorValues[e] ?? 0.5);
      if (rc.flipIfTrue && sum >= rc.threshold) {
        for (let c = 0; c < MATRIX_SIZE; c++) bits ^= 1n << BigInt(r * MATRIX_SIZE + c);
      }
    }
    for (let c = 0; c < MATRIX_SIZE; c++) {
      const cc = this.colConditions[c];
      if (!cc) continue;
      let sum = 0;
      for (let e = 0; e < ELEMENT_COUNT; e++) sum += (cc.weights[e] ?? 0) * (colorValues[e] ?? 0.5);
      if (cc.flipIfTrue && sum >= cc.threshold) {
        for (let r = 0; r < MATRIX_SIZE; r++) bits ^= 1n << BigInt(r * MATRIX_SIZE + c);
      }
    }
    this.bits = bits;
  }

  getCell(row: number, col: number): boolean {
    return (this.bits & (1n << BigInt(row * MATRIX_SIZE + col))) !== 0n;
  }

  countOn(): number {
    let count = 0;
    let b = this.bits;
    while (b > 0n) { count += Number(b & 1n); b >>= 1n; }
    return count;
  }

  toDisplayLines(): string[] {
    const lines: string[] = [];
    for (let r = 0; r < MATRIX_SIZE; r++) {
      let line = '';
      for (let c = 0; c < MATRIX_SIZE; c++) line += this.getCell(r, c) ? '■' : '□';
      lines.push(line);
    }
    return lines;
  }

  setCellConditions(conds: CellCondition[]): void { this.cellConditions = conds; }
  setRowConditions(conds: LineCondition[]): void { this.rowConditions = conds; }
  setColConditions(conds: LineCondition[]): void { this.colConditions = conds; }
}

// ============================================================
// PlayerKnowledge
// ============================================================
export class PlayerKnowledge {
  knownActorNames = new Set<string>();
  recruitedEver = new Set<string>();
  partyMembers: string[] = [];
  static readonly MAX_PARTY_SIZE = 3;

  visitedLocations = new Set<string>();
  conversationPartners = new Set<string>();
  totalConversations = 0;
  totalDungeonsCleared = 0;
  totalMonstersKilled = 0;
  totalDamageDealt = 0;
  totalDamageTaken = 0;
  maxSingleDamage = 0;
  totalTreasureFound = 0;
  monsterTypesKilled = new Set<string>();
  discoveredItems = new Set<string>();
  totalGoldSpent = 0;
  totalItemsSold = 0;
  totalItemsCrafted = 0;
  totalActivitiesDone = 0;
  totalVigorSpent = 0;
  foodTypesEaten = new Set<string>();
  companionDaysMap = new Map<string, number>();
  locationReputation = new Map<string, number>();
  totalGiftsGiven = 0;
  completedQuestCount = 0;
  completedQuestNames = new Set<string>();
  earnedTitles: string[] = [];
  activeTitle = '';

  addKnownName(name: string): void { this.knownActorNames.add(name.trim()); }
  isKnown(name: string): boolean { return this.knownActorNames.has(name.trim()); }

  recruitCompanion(name: string): boolean {
    if (this.partyMembers.length >= PlayerKnowledge.MAX_PARTY_SIZE) return false;
    if (this.partyMembers.includes(name)) return false;
    this.partyMembers.push(name);
    this.recruitedEver.add(name);
    return true;
  }

  dismissCompanion(name: string): boolean {
    const idx = this.partyMembers.indexOf(name);
    if (idx === -1) return false;
    this.partyMembers.splice(idx, 1);
    return true;
  }

  isCompanion(name: string): boolean { return this.partyMembers.includes(name); }

  getReputation(locationId: string): number {
    return this.locationReputation.get(locationId) ?? 0.5;
  }
  adjustReputation(locationId: string, delta: number): void {
    const cur = this.getReputation(locationId);
    this.locationReputation.set(locationId, Math.max(0, Math.min(1, cur + delta)));
  }

  hasTitle(titleId: string): boolean { return this.earnedTitles.includes(titleId); }
  addTitle(titleId: string): void {
    if (!this.hasTitle(titleId)) this.earnedTitles.push(titleId);
  }

  trackVisit(locationId: string): void { this.visitedLocations.add(locationId); }
  trackConversation(actorName: string): void {
    this.conversationPartners.add(actorName); this.totalConversations++;
  }
  trackDungeonClear(): void { this.totalDungeonsCleared++; }
  trackMonsterKill(count = 1): void { this.totalMonstersKilled += count; }
  trackMonsterType(name: string): void { this.monsterTypesKilled.add(name); }
  trackDamageDealt(amount: number): void {
    this.totalDamageDealt += amount;
    if (amount > this.maxSingleDamage) this.maxSingleDamage = amount;
  }
  trackDamageTaken(amount: number): void { this.totalDamageTaken += amount; }
  trackTreasureFound(): void { this.totalTreasureFound++; }
  trackGoldSpent(amount: number): void { this.totalGoldSpent += amount; }
  trackItemSold(count = 1): void { this.totalItemsSold += count; }
  trackItemCrafted(count = 1): void { this.totalItemsCrafted += count; }
  trackActivityDone(): void { this.totalActivitiesDone++; }
  trackVigorSpent(amount: number): void { this.totalVigorSpent += Math.round(amount); }
  trackFoodEaten(name: string): void { this.foodTypesEaten.add(name); }
  trackCompanionDay(name: string): void {
    this.companionDaysMap.set(name, (this.companionDaysMap.get(name) ?? 0) + 1);
  }
  trackGiftGiven(): void { this.totalGiftsGiven++; }
  trackQuestCompleted(questTitle: string): void {
    this.completedQuestCount++;
    this.completedQuestNames.add(questTitle);
  }
  discoverItem(itemId: string): void { this.discoveredItems.add(itemId); }
  isItemDiscovered(itemId: string): boolean { return this.discoveredItems.has(itemId); }
}
