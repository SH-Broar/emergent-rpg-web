// actor.ts — 액터 시스템
// 원본: Actor.h

import { ItemType, Race, SpiritRole, itemTypeToId, itemIdToType } from '../types/enums';
import { LocationID, Loc } from '../types/location';
import { GameTime } from '../types/game-time';
import { ColorProfile } from './color';
import { Relationship, Memory, createRelationship } from './social';
import { CoreMatrix } from './knowledge';
import { getWeaponDef, getArmorDef } from '../types/item-defs';

export enum IncomeSource {
  Trade, Craft, Quest, Dungeon, Farming, Fishing, Service, None,
}

export interface NpcLifeData {
  livingPlace: LocationID;
  dailyExpense: number;
  incomeSource: IncomeSource;
  dietPreference: number[];  // ItemType values (up to 3)
  comfortLevel: number;      // 0-1
  daysSinceLastMeal: number;
  lastExpenseDay: number;    // game day on which daily expense was last deducted
}

function defaultLifeData(role: SpiritRole, home: LocationID): NpcLifeData {
  let dailyExpense: number;
  let incomeSource: IncomeSource;
  switch (role) {
    case SpiritRole.Merchant:      dailyExpense = 5; incomeSource = IncomeSource.Trade;   break;
    case SpiritRole.Farmer:        dailyExpense = 2; incomeSource = IncomeSource.Farming; break;
    case SpiritRole.Adventurer:    dailyExpense = 3; incomeSource = IncomeSource.Dungeon; break;
    case SpiritRole.Guard:         dailyExpense = 3; incomeSource = IncomeSource.Service; break;
    case SpiritRole.Priest:        dailyExpense = 2; incomeSource = IncomeSource.Service; break;
    case SpiritRole.Craftsman:     dailyExpense = 4; incomeSource = IncomeSource.Craft;   break;
    case SpiritRole.Miner:         dailyExpense = 3; incomeSource = IncomeSource.Craft;   break;
    case SpiritRole.Fisher:        dailyExpense = 2; incomeSource = IncomeSource.Fishing; break;
    case SpiritRole.GuildClerk:    dailyExpense = 3; incomeSource = IncomeSource.Service; break;
    case SpiritRole.Meteorologist: dailyExpense = 3; incomeSource = IncomeSource.Service; break;
    default:                       dailyExpense = 2; incomeSource = IncomeSource.None;    break;
  }
  return {
    livingPlace: home,
    dailyExpense,
    incomeSource,
    dietPreference: [ItemType.Food],
    comfortLevel: 0.5,
    daysSinceLastMeal: 0,
    lastExpenseDay: -1,
  };
}

export interface BaseProperty {
  race: Race;
  hp: number; maxHp: number;
  mp: number; maxMp: number;
  attack: number; defense: number;
  ap: number; maxAp: number;
  strength: number;
  age: number;
  level: number; exp: number;
  sleeping: boolean;
  mood: number;
}

export function createBaseProperty(race = Race.Human): BaseProperty {
  return {
    race, hp: 100, maxHp: 100, mp: 30, maxMp: 30,
    attack: 10, defense: 5,
    ap: 5, maxAp: 5,
    strength: 0.5, age: 25, level: 1, exp: 0, sleeping: false, mood: 0,
  };
}

export interface SpiritProperty {
  role: SpiritRole;
  gold: number;
  questsPosted: number;
  dungeonsCleared: number;
  tradeCount: number;
  activeQuestId: number;
}

export function createSpiritProperty(role = SpiritRole.Villager): SpiritProperty {
  return {
    role, gold: 50,
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
  currentLocation: LocationID = Loc.Alimes;
  moveDestination = '';
  /** NPC 이동 중: 다음 경유지 위치 ID (비어있으면 이동 중 아님) */
  travelNextStep: LocationID = '';
  /** NPC 이동 중: 다음 경유지까지 남은 게임 분 */
  travelRemainingMinutes = 0;
  actionCooldown = 0;
  playable = true;
  isCustom = false;
  homeLocation: LocationID = Loc.Alimes;
  relationships = new Map<string, Relationship>();
  memories: Memory[] = [];
  dungeonProgress = new Map<string, number>();
  /** 던전별 최단 클리어 턴 수 */
  dungeonBestTurns = new Map<string, number>();
  background = '';
  acquisitionMethod = '';
  acquisitionDifficulty = 0;
  hasHyperion = false;
  hasLearnedMagic = false;
  stationary = false;
  hyperionLevel = 0;
  hyperionFlags: boolean[] = [false, false, false, false, false];
  /** 플레이어 전용: 다른 액터들의 히페리온 레벨 합산 보너스 */
  hyperionBonus = 0;
  /** 푸치 탑: 이번 실행에서 도달한 최고 층 */
  puchiTowerHighestFloor = 0;
  /** 전투 직업 */
  combatJob = '';
  /** 생활 직업 */
  lifeJob = '';
  /** 생활 직업 레벨 (직업ID → 1~3) */
  lifeJobLevels = new Map<string, number>();
  /** 생활 직업 승단 미션 진행도 (직업ID → 누적 진행값) */
  lifeJobMissionProgress = new Map<string, number>();
  lastTickHour = 6;

  coreMatrix = new CoreMatrix();

  lifeData: NpcLifeData = defaultLifeData(SpiritRole.Villager, Loc.Alimes);

  /** 스킬 시스템 */
  learnedSkills = new Map<string, number>();  // skillId → 레벨 (1-5)
  skillOrder: string[] = [];                   // 선택 우선순위 정렬된 스킬 ID
  skillUsage = new Map<string, number>();       // skillId → 총 사용 횟수 (레벨업용)

  /** 내러티브 상태 저장 — 키워드/스위치 (boolean) & 변수 (number) */
  flags = new Map<string, boolean>();      // 스토리 플래그, 이벤트 발생 여부 등
  variables = new Map<string, number>(); // 수치 추적 변수 (카운터, 점수 등)

  /** 개별 아이템 인벤토리 (ItemID → 수량) */
  items = new Map<string, number>();

  /** 장착 무기 ID (없으면 빈 문자열) */
  equippedWeapon = '';
  /** 장착 방어구 ID */
  equippedArmor = '';
  /** 장착 악세서리 ID */
  equippedAccessory = '';
  /** 장착 악세서리2 ID */
  equippedAccessory2 = '';

  static readonly MAX_MEMORIES = 100;

  constructor(name: string, race: Race, role: SpiritRole) {
    this.name = name;
    this.base = createBaseProperty(race);
    this.spirit = createSpiritProperty(role);
    this.color = new ColorProfile();
    this.lifeData = defaultLifeData(role, this.homeLocation);
  }

  isAlive(): boolean { return this.base.hp > 0; }
  isHungry(): boolean { return this.lifeData.daysSinceLastMeal > 0; }
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

  /** 카테고리형 아이템 소비 (통합: items 맵 경유) */
  consumeItem(type: ItemType, amount: number): boolean {
    return this.removeItemById(itemTypeToId(type), amount);
  }

  /** 카테고리형 아이템 추가 (통합: items 맵 경유) */
  addItem(type: ItemType, amount: number): void {
    this.addItemById(itemTypeToId(type), amount);
  }

  /** 카테고리형 아이템 수량 조회 (통합: items 맵 경유) */
  getItemCountByType(type: ItemType): number {
    return this.getItemCount(itemTypeToId(type));
  }

  /** 카테고리형 인벤토리를 [ItemType, number][] 로 반환 (기존 spirit.inventory 순회 대체) */
  getInventoryByType(): [ItemType, number][] {
    const result: [ItemType, number][] = [];
    for (const [id, qty] of this.items) {
      if (qty <= 0) continue;
      const type = itemIdToType(id);
      if (type !== undefined) result.push([type, qty]);
    }
    return result;
  }

  addGold(amount: number): void { this.spirit.gold = Math.max(0, this.spirit.gold + amount); }

  /** 개별 아이템 가방이 꽉 찼는지 확인. newId를 지정하면 해당 ID가 이미 있을 경우 false(여유) 반환 */
  isBagFull(bagCapacity: number, newId?: string): boolean {
    if (newId !== undefined && this.items.has(newId)) return false;
    return this.items.size >= bagCapacity;
  }

  adjustHp(delta: number): void {
    this.base.hp = Math.max(0, Math.min(this.getEffectiveMaxHp(), this.base.hp + delta));
  }
  adjustMp(delta: number): void {
    this.base.mp = Math.max(0, Math.min(this.getEffectiveMaxMp(), this.base.mp + delta));
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

  /** 스킬 교체 (상점 강화): 이전 스킬을 제거하고 새 스킬로 교체 */
  replaceSkill(oldId: string, newId: string): void {
    if (oldId && this.learnedSkills.has(oldId)) {
      this.learnedSkills.delete(oldId);
      const idx = this.skillOrder.indexOf(oldId);
      if (idx >= 0) {
        this.skillOrder[idx] = newId;
      } else {
        this.skillOrder.push(newId);
      }
    } else {
      this.skillOrder.push(newId);
    }
    this.learnedSkills.set(newId, 1);
  }

  // --- 개별 아이템 인벤토리 메서드 ---
  addItemById(id: string, amount = 1): void {
    this.items.set(id, (this.items.get(id) ?? 0) + amount);
  }
  removeItemById(id: string, amount = 1): boolean {
    const cur = this.items.get(id) ?? 0;
    if (cur < amount) return false;
    const next = cur - amount;
    if (next <= 0) this.items.delete(id);
    else this.items.set(id, next);
    return true;
  }
  getItemCount(id: string): number {
    return this.items.get(id) ?? 0;
  }
  hasItem(id: string): boolean {
    return (this.items.get(id) ?? 0) > 0;
  }

  getEffectiveMaxAp(): number {
    // 히페리온 10레벨당 +1 TP, 상한 20
    const hyperionTp = Math.floor((this.hyperionLevel + this.hyperionBonus) / 10);
    return Math.min(20, this.base.maxAp + hyperionTp);
  }

  adjustAp(delta: number): void {
    this.base.ap = Math.max(0, Math.min(this.getEffectiveMaxAp(), this.base.ap + delta));
  }

  hasAp(cost: number = 1): boolean {
    return this.base.ap >= cost;
  }

  // --- 플래그/변수 ---
  setFlag(key: string, value: boolean): void { this.flags.set(key, value); }
  getFlag(key: string): boolean { return this.flags.get(key) ?? false; }
  setVariable(key: string, value: number): void { this.variables.set(key, value); }
  getVariable(key: string): number { return this.variables.get(key) ?? 0; }
  adjustVariable(key: string, delta: number): void {
    this.variables.set(key, (this.variables.get(key) ?? 0) + delta);
  }

  getEffectiveMaxHp(): number {
    const base = this.base.maxHp + (this.hyperionLevel + this.hyperionBonus) * 10;
    const pct = this.getVariable('meal_hp_pct');
    return pct > 0 ? Math.round(base * (1 + pct)) : base;
  }
  getEffectiveMaxMp(): number {
    const base = this.base.maxMp + (this.hyperionLevel + this.hyperionBonus) * 5;
    const pct = this.getVariable('meal_mp_pct');
    return pct > 0 ? Math.round(base * (1 + pct)) : base;
  }
  getEffectiveAttack(): number {
    const weaponBonus = this.equippedWeapon ? (getWeaponDef(this.equippedWeapon)?.attack ?? 0) : 0;
    const weaponDegrade = this.getVariable('degrade_weapon');
    const buffBonus = this.getVariable('buff_attack');
    const mealAtk = this.getVariable('meal_atk');
    return this.base.attack + (this.hyperionLevel + this.hyperionBonus) * 2
      + weaponBonus * (1 - weaponDegrade / 100) + buffBonus + mealAtk;
  }
  getEffectiveDefense(): number {
    const armorBonus = this.equippedArmor ? (getArmorDef(this.equippedArmor)?.defense ?? 0) : 0;
    const armorDegrade = this.getVariable('degrade_armor');
    const acc1Bonus = this.equippedAccessory ? (getArmorDef(this.equippedAccessory)?.defense ?? 0) : 0;
    const acc1Degrade = this.getVariable('degrade_accessory');
    const acc2Bonus = this.equippedAccessory2 ? (getArmorDef(this.equippedAccessory2)?.defense ?? 0) : 0;
    const acc2Degrade = this.getVariable('degrade_accessory2');
    const buffBonus = this.getVariable('buff_defense');
    const mealDef = this.getVariable('meal_def');
    return this.base.defense + (this.hyperionLevel + this.hyperionBonus) * 1
      + armorBonus * (1 - armorDegrade / 100)
      + acc1Bonus * (1 - acc1Degrade / 100)
      + acc2Bonus * (1 - acc2Degrade / 100)
      + buffBonus + mealDef;
  }
  receiveEventInfluence(influence: number[], _eventName: string, _time: GameTime): void {
    this.color.applyInfluence(influence);
  }
}
