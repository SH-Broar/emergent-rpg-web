// knowledge.ts — PlayerKnowledge + CoreMatrix
// 원본: PlayerKnowledge.h, CoreMatrix.h

import { ELEMENT_COUNT } from '../types/enums';
import { generateDefaultCellConditions, generateDefaultRowConditions, generateDefaultColConditions } from './core-matrix-conditions';
import { FarmState, createFarmState, expandFarm } from './farming';

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

  // 거점 시스템
  ownedBases = new Set<string>(); // 소유한 거점 LocationID들

  // 인벤토리 제한
  bagCapacity = 10; // 기본 가방 크기 10칸, 가방 구매로 확장

  // 거점 창고 (locationId -> 온도구역 -> 아이템 맵)
  storage = new Map<string, {
    cold: Map<string, number>,   // 냉장
    room: Map<string, number>,   // 실온
    warm: Map<string, number>,   // 온장
  }>();

  // 거점 레벨 (locationId -> level 1~5)
  baseLevels = new Map<string, number>();

  ownsBase(locationId: string): boolean { return this.ownedBases.has(locationId); }

  purchaseBase(locationId: string): void {
    this.ownedBases.add(locationId);
    if (!this.storage.has(locationId)) {
      this.storage.set(locationId, { cold: new Map(), room: new Map(), warm: new Map() });
    }
    if (!this.baseLevels.has(locationId)) {
      this.baseLevels.set(locationId, 1);
    }
  }

  getBaseLevel(locationId: string): number {
    return this.baseLevels.get(locationId) ?? 0;
  }

  upgradeBase(locationId: string): void {
    const cur = this.baseLevels.get(locationId) ?? 1;
    const next = Math.min(5, cur + 1);
    this.baseLevels.set(locationId, next);

    // Lv.3 달성 시 농장 생성
    if (next === 3) {
      this.initFarm(locationId);
    }
    // Lv.4 달성 시 농장 확장 (+2칸)
    if (next === 4) {
      const farm = this.farmStates.get(locationId);
      if (farm) expandFarm(farm, 2);
    }
  }

  /** 농장 초기화 (Lv.3 달성 시 호출) */
  initFarm(locationId: string): void {
    if (this.farmStates.has(locationId)) return;
    // 비싼 집: Halpia, Alimes_High, Enicham → 3x3
    const expensiveIds = new Set(['Halpia', 'Alimes_High', 'Enicham']);
    const [w, h] = expensiveIds.has(locationId) ? [3, 3] : [2, 2];
    this.farmStates.set(locationId, createFarmState(locationId, w, h));
  }

  /** 농장 상태 조회 */
  getFarm(locationId: string): FarmState | undefined {
    return this.farmStates.get(locationId);
  }

  getStorage(locationId: string): { cold: Map<string, number>, room: Map<string, number>, warm: Map<string, number> } | undefined {
    return this.storage.get(locationId);
  }

  addToStorage(locationId: string, zone: 'cold' | 'room' | 'warm', itemId: string, amount: number): boolean {
    const s = this.storage.get(locationId);
    if (!s) return false;
    s[zone].set(itemId, (s[zone].get(itemId) ?? 0) + amount);
    return true;
  }

  removeFromStorage(locationId: string, zone: 'cold' | 'room' | 'warm', itemId: string, amount: number): boolean {
    const s = this.storage.get(locationId);
    if (!s) return false;
    const cur = s[zone].get(itemId) ?? 0;
    if (cur < amount) return false;
    const next = cur - amount;
    if (next <= 0) s[zone].delete(itemId);
    else s[zone].set(itemId, next);
    return true;
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
  trackFoodEaten(name: string): void { this.foodTypesEaten.add(name); }
  trackCompanionDay(name: string): void {
    this.companionDaysMap.set(name, (this.companionDaysMap.get(name) ?? 0) + 1);
  }
  trackGiftGiven(): void { this.totalGiftsGiven++; }
  trackQuestCompleted(questTitle: string): void {
    this.completedQuestCount++;
    this.completedQuestNames.add(questTitle);
  }

  /** 거점별 농장 상태 (Lv.3 활성화 시 생성) */
  farmStates = new Map<string, FarmState>();

  /** 비소유 homeLocation에서의 마지막 낮잠 일자 */
  lastNapDay = -1;

  // NPC 거점 초대 시스템
  baseInvitedNpcs = new Map<string, string[]>(); // locationId -> NPC 이름 배열

  inviteNpcToBase(locationId: string, npcName: string): void {
    const list = this.baseInvitedNpcs.get(locationId) ?? [];
    if (!list.includes(npcName)) list.push(npcName);
    this.baseInvitedNpcs.set(locationId, list);
  }
  getBaseNpcs(locationId: string): string[] {
    return this.baseInvitedNpcs.get(locationId) ?? [];
  }
  discoverItem(itemId: string): void { this.discoveredItems.add(itemId); }
  isItemDiscovered(itemId: string): boolean { return this.discoveredItems.has(itemId); }
}
