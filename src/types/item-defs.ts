// item-defs.ts — 개별 아이템 정의 시스템
// 각 아이템은 고유 ID(string)를 가지며 카테고리, 태그, 효과 등을 정의

import { ItemType } from './enums';
import { DataSection } from '../data/parser';
import { getRaceCapabilitySet, parseTags } from './tag-system';
import type { Actor } from '../models/actor';

// ============================================================
// 아이템 정의
// ============================================================

export interface ItemDef {
  id: string;                   // 고유 ID: "red_apple", "iron_sword" 등
  name: string;                 // 표시 이름: "빨간 사과"
  category: ItemType;           // 카테고리: Food, Herb, Equipment 등
  price: number;                // 기본 가격
  tags: string;                 // /tag/ 형식 속성 문자열
  description: string;          // 설명문
  rarity: ItemRarity;           // 희귀도
  stackable: boolean;           // 중첩 가능 여부

  // 식사 효과 (섭취 가능 아이템)
  eatVigor: number;
  eatHp: number;
  eatMp: number;
  eatMood: number;
  eatMessage: string;
  eatStatus: string;            // 'poison', 'stomachache', '' 등
  eatBuffType: string;          // 'attack', 'defense', 'tp_regen', 'mp_regen', 'speed', ''
  eatBuffAmount: number;
  eatBuffDuration: number;      // 턴 수, 0이면 버프 없음

  // 하루 지속 식사 버프
  mealBuffAtk: number;          // 하루 ATK 보너스 (flat, actor variable 'meal_atk'에 누적)
  mealBuffDef: number;          // 하루 DEF 보너스 (flat, actor variable 'meal_def'에 누적)
  mealMpMaxPct: number;         // 하루 MP 상한 % 보너스 (0.25 = +25%)
  mealHpMaxPct: number;         // 하루 HP 상한 % 보너스
  mealCombatSpeed: number;      // 전투 속도 배수 (0 = 효과 없음, 3.0 = 3배 빠름)
  mealBuffSkillAppear: number;  // 하루 스킬 출현율 보너스 (0.1 = +10%)

  // 장비 스탯 (장비 아이템)
  equipSlot: EquipSlot;         // 'none', 'weapon', 'armor', 'accessory'
  equipAttack: number;
  equipDefense: number;
  equipMagic: number;
  equipSpeed: number;
  equipSkillAppear: number;     // 악세서리 착용 시 스킬 출현율 보너스 (0~1)
  equipSkillAppearJob: string;  // 특정 직업에만 적용 (빈 문자열=전체, 또는 'Warrior' 등)

  // 획득처
  source: string;               // 'gather:Cyan_Dunes', 'dungeon:Larmen_Forest', 'shop:Market' 등

  // 채집 제한
  minHyperion: number;          // 채집에 필요한 최소 히페리온 레벨 합계 (0=제한 없음)

  // 보관 선호
  preferredStorage: StorageZone[];
  avoidedStorage: StorageZone[];
  badStorageEffect: StoragePenalty;
}

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'unique';
export type EquipSlot = 'none' | 'weapon' | 'armor' | 'accessory';
export type StorageZone = 'cold' | 'room' | 'warm';
export type StoragePenalty = 'none' | 'spoil' | 'disable';

export function createDefaultItemDef(id: string): ItemDef {
  return {
    id, name: id, category: ItemType.Food, price: 1,
    tags: '', description: '', rarity: 'common', stackable: true,
    eatVigor: 0, eatHp: 0, eatMp: 0, eatMood: 0, eatMessage: '', eatStatus: '',
    eatBuffType: '', eatBuffAmount: 0, eatBuffDuration: 0,
    mealBuffAtk: 0, mealBuffDef: 0, mealMpMaxPct: 0, mealHpMaxPct: 0, mealCombatSpeed: 0, mealBuffSkillAppear: 0,
    equipSlot: 'none', equipAttack: 0, equipDefense: 0, equipMagic: 0, equipSpeed: 0,
    equipSkillAppear: 0, equipSkillAppearJob: '',
    source: '', minHyperion: 0,
    preferredStorage: [], avoidedStorage: [], badStorageEffect: 'none',
  };
}

// ============================================================
// 아이템 레지스트리
// ============================================================

const itemRegistry = new Map<string, ItemDef>();
const itemsByCategory = new Map<ItemType, ItemDef[]>();

/** items.txt 데이터 섹션에서 아이템 로드 */
export function loadItemDefs(sections: DataSection[]): void {
  itemRegistry.clear();
  itemsByCategory.clear();

  for (const s of sections) {
    if (s.name.startsWith('#') || s.name === 'Meta') continue;

    const def = createDefaultItemDef(s.name);
    def.name = s.get('name', s.name);
    def.description = s.get('description', '');
    def.price = s.getInt('price', 1);
    def.tags = s.get('tags', '');
    def.rarity = (s.get('rarity', 'common') as ItemRarity);
    def.stackable = s.getInt('stackable', 1) !== 0;
    def.source = s.get('source', '');

    // 카테고리 파싱
    const catStr = s.get('category', 'Food');
    def.category = parseCategoryString(catStr);

    // 식사 효과
    def.eatVigor = s.getFloat('eatVigor', 0);
    def.eatHp = s.getFloat('eatHp', 0);
    def.eatMp = s.getFloat('eatMp', 0);
    def.eatMood = s.getFloat('eatMood', 0);
    def.eatMessage = s.get('eatMessage', '');
    def.eatStatus = s.get('eatStatus', '');
    def.eatBuffType = s.get('eatBuffType', '');
    def.eatBuffAmount = s.getFloat('eatBuffAmount', 0);
    def.eatBuffDuration = s.getInt('eatBuffDuration', 0);

    // 하루 지속 식사 버프
    def.mealBuffAtk          = s.getFloat('mealBuffAtk', 0);
    def.mealBuffDef          = s.getFloat('mealBuffDef', 0);
    def.mealMpMaxPct         = s.getFloat('mealMpMaxPct', 0);
    def.mealHpMaxPct         = s.getFloat('mealHpMaxPct', 0);
    def.mealCombatSpeed      = s.getFloat('mealCombatSpeed', 0);
    def.mealBuffSkillAppear  = s.getFloat('mealBuffSkillAppear', 0);

    // 장비
    def.equipSlot = (s.get('equipSlot', 'none') as EquipSlot);
    def.equipAttack = s.getFloat('equipAttack', 0);
    def.equipDefense = s.getFloat('equipDefense', 0);
    def.equipMagic = s.getFloat('equipMagic', 0);
    def.equipSpeed = s.getFloat('equipSpeed', 0);
    def.equipSkillAppear = s.getFloat('equipSkillAppear', 0);
    def.equipSkillAppearJob = s.get('equipSkillAppearJob', '');

    def.minHyperion = s.getInt('minHyperion', 0);
    const inferred = inferStorageProfile(def.category, def.tags);
    def.preferredStorage = parseStorageZones(s.get('preferredStorage', ''), inferred.preferredStorage);
    def.avoidedStorage = parseStorageZones(s.get('avoidedStorage', ''), inferred.avoidedStorage);
    def.badStorageEffect = parseStoragePenalty(s.get('badStorageEffect', ''), inferred.badStorageEffect);

    registerItem(def);
  }
}

/** 개별 아이템 등록 */
export function registerItem(def: ItemDef): void {
  itemRegistry.set(def.id, def);
  const list = itemsByCategory.get(def.category) ?? [];
  list.push(def);
  itemsByCategory.set(def.category, list);
}

/** ID로 아이템 정의 조회 */
export function getItemDef(id: string): ItemDef | undefined {
  return itemRegistry.get(id);
}

/** ID로 아이템 정의 조회 (없으면 기본값) */
export function getItemDefOrDefault(id: string): ItemDef {
  return itemRegistry.get(id) ?? createDefaultItemDef(id);
}

/** 카테고리별 아이템 목록 */
export function getItemsByCategory(category: ItemType): readonly ItemDef[] {
  return itemsByCategory.get(category) ?? [];
}

/** 전체 아이템 목록 */
export function getAllItemDefs(): ReadonlyMap<string, ItemDef> {
  return itemRegistry;
}

/** 전체 아이템 수 */
export function getItemCount(): number {
  return itemRegistry.size;
}

/** 태그로 아이템 검색 */
export function findItemsByTag(tag: string): ItemDef[] {
  const result: ItemDef[] = [];
  for (const def of itemRegistry.values()) {
    if (def.tags.includes(`/${tag}/`)) result.push(def);
  }
  return result;
}

/** 희귀도로 아이템 검색 */
export function findItemsByRarity(rarity: ItemRarity): ItemDef[] {
  const result: ItemDef[] = [];
  for (const def of itemRegistry.values()) {
    if (def.rarity === rarity) result.push(def);
  }
  return result;
}

/** 소스(획득처)로 아이템 검색 */
export function findItemsBySource(sourcePrefix: string): ItemDef[] {
  const result: ItemDef[] = [];
  for (const def of itemRegistry.values()) {
    if (def.source.startsWith(sourcePrefix)) result.push(def);
  }
  return result;
}

export interface StorageProfile {
  preferredStorage: StorageZone[];
  avoidedStorage: StorageZone[];
  badStorageEffect: StoragePenalty;
}

export function getStorageProfileForCategory(category: ItemType): StorageProfile {
  switch (category) {
    case ItemType.Food:
      return { preferredStorage: ['room'], avoidedStorage: ['warm'], badStorageEffect: 'spoil' };
    case ItemType.Herb:
      return { preferredStorage: ['cold'], avoidedStorage: ['warm'], badStorageEffect: 'spoil' };
    case ItemType.MonsterLoot:
      return { preferredStorage: ['cold'], avoidedStorage: ['warm'], badStorageEffect: 'spoil' };
    case ItemType.Potion:
      return { preferredStorage: ['room'], avoidedStorage: ['warm'], badStorageEffect: 'disable' };
    case ItemType.Equipment:
      return { preferredStorage: ['room'], avoidedStorage: ['warm'], badStorageEffect: 'disable' };
    case ItemType.GuildCard:
      return { preferredStorage: ['room'], avoidedStorage: ['warm'], badStorageEffect: 'disable' };
    case ItemType.OreCommon:
    case ItemType.OreRare:
      return { preferredStorage: ['room'], avoidedStorage: [], badStorageEffect: 'none' };
    default:
      return { preferredStorage: ['room'], avoidedStorage: [], badStorageEffect: 'none' };
  }
}

export function getStorageProfileForItem(id: string): StorageProfile {
  const def = getItemDef(id);
  if (def) {
    return {
      preferredStorage: [...def.preferredStorage],
      avoidedStorage: [...def.avoidedStorage],
      badStorageEffect: def.badStorageEffect,
    };
  }
  const numericId = Number(id);
  if (Number.isInteger(numericId)) {
    return getStorageProfileForCategory(numericId as ItemType);
  }
  return { preferredStorage: ['room'], avoidedStorage: [], badStorageEffect: 'none' };
}

// ============================================================
// 카테고리 헬퍼
// ============================================================

function parseCategoryString(s: string): ItemType {
  switch (s.trim()) {
    case 'Food': return ItemType.Food;
    case 'Herb': return ItemType.Herb;
    case 'OreCommon': return ItemType.OreCommon;
    case 'OreRare': return ItemType.OreRare;
    case 'MonsterLoot': return ItemType.MonsterLoot;
    case 'Potion': return ItemType.Potion;
    case 'Equipment': return ItemType.Equipment;
    case 'GuildCard': return ItemType.GuildCard;
    default: return ItemType.Food;
  }
}

function parseStorageZones(raw: string, fallback: StorageZone[]): StorageZone[] {
  if (!raw.trim()) return [...fallback];
  return raw
    .split(',')
    .map(zone => zone.trim().toLowerCase())
    .filter((zone): zone is StorageZone => zone === 'cold' || zone === 'room' || zone === 'warm');
}

function parseStoragePenalty(raw: string, fallback: StoragePenalty): StoragePenalty {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'spoil' || normalized === 'disable' || normalized === 'none') return normalized;
  return fallback;
}

function inferStorageProfile(category: ItemType, tags: string): StorageProfile {
  if (category === ItemType.Food) {
    if (tags.includes('/raw/') || tags.includes('/fruit/') || tags.includes('/meat/')) {
      return { preferredStorage: ['cold'], avoidedStorage: ['warm'], badStorageEffect: 'spoil' };
    }
    if (tags.includes('/dish/')) {
      return { preferredStorage: ['warm'], avoidedStorage: ['cold'], badStorageEffect: 'disable' };
    }
    if (tags.includes('/drink/')) {
      return { preferredStorage: ['room'], avoidedStorage: ['warm'], badStorageEffect: 'disable' };
    }
    if (tags.includes('/bread/')) {
      return { preferredStorage: ['room'], avoidedStorage: ['warm'], badStorageEffect: 'spoil' };
    }
  }
  if (category === ItemType.Herb) {
    return { preferredStorage: ['cold'], avoidedStorage: ['warm'], badStorageEffect: 'spoil' };
  }
  if (category === ItemType.MonsterLoot) {
    return { preferredStorage: ['cold'], avoidedStorage: ['warm'], badStorageEffect: 'spoil' };
  }
  if (category === ItemType.Potion) {
    return { preferredStorage: ['room'], avoidedStorage: ['warm'], badStorageEffect: 'disable' };
  }
  if (category === ItemType.Equipment || category === ItemType.GuildCard) {
    return { preferredStorage: ['room'], avoidedStorage: ['warm'], badStorageEffect: 'disable' };
  }
  if (category === ItemType.OreCommon || category === ItemType.OreRare) {
    return { preferredStorage: ['room'], avoidedStorage: [], badStorageEffect: 'none' };
  }
  return getStorageProfileForCategory(category);
}

export function categoryName(cat: ItemType): string {
  switch (cat) {
    case ItemType.Food: return '식량';
    case ItemType.Herb: return '약초';
    case ItemType.OreCommon: return '광석';
    case ItemType.OreRare: return '희귀 광석';
    case ItemType.MonsterLoot: return '전리품';
    case ItemType.Potion: return '물약';
    case ItemType.Equipment: return '장비';
    case ItemType.GuildCard: return '특수';
    default: return '기타';
  }
}

export const RARITY_NAMES: Record<ItemRarity, string> = {
  common: '일반',
  uncommon: '고급',
  rare: '희귀',
  epic: '영웅',
  legendary: '전설',
  unique: '유일',
};

export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#aaaaaa',
  uncommon: '#4ecca3',
  rare: '#4ecdc4',
  epic: '#9b59b6',
  legendary: '#ffc857',
  unique: '#e94560',
};

// ============================================================
// 무기 정의
// ============================================================

export interface WeaponDef {
  id: string;
  name: string;
  type: string;       // Sword, Spear, Bow, Staff, Gun, Heavy, Fist, Dagger, Instrument, Special
  grade: string;      // Common, Uncommon, Rare, Epic, Legendary
  element: number;    // Element enum value, -1 for None
  attack: number;
  speed: number;
  magicBonus: number;
  price: number;
  description: string;
}

const weaponRegistry = new Map<string, WeaponDef>();

/** weapons.txt DataSection[] 에서 무기 로드 */
export function loadWeaponDefs(sections: DataSection[]): void {
  weaponRegistry.clear();
  for (const s of sections) {
    if (s.name.startsWith('#') || s.name === 'Meta') continue;
    const elementStr = s.get('element', 'None');
    const def: WeaponDef = {
      id: s.name,
      name: s.get('name', s.name),
      type: s.get('type', 'Sword'),
      grade: s.get('grade', 'Common'),
      element: parseElementString(elementStr),
      attack: s.getFloat('attack', 0),
      speed: s.getFloat('speed', 1.0),
      magicBonus: s.getFloat('magicBonus', 0),
      price: s.getInt('price', 0),
      description: s.get('description', ''),
    };
    weaponRegistry.set(def.id, def);
  }
}

export function getWeaponDef(id: string): WeaponDef | undefined {
  return weaponRegistry.get(id);
}

export function getAllWeaponDefs(): ReadonlyMap<string, WeaponDef> {
  return weaponRegistry;
}

export function getWeaponCount(): number {
  return weaponRegistry.size;
}

// ============================================================
// 방어구 정의
// ============================================================

export interface ArmorDef {
  id: string;
  name: string;
  type: string;       // Cloth, Light, Heavy, Robe, Shield, Accessory
  grade: string;
  element: number;
  defense: number;
  magicDefense: number;
  evasion: number;
  price: number;
  description: string;
  /**
   * 악세서리/방어구 특수 효과.
   * 지원 키 예시:
   *  - travelSpeed, gatherBonus, combatSpeed
   *  - hpRegen, mpRegen, tpRegen
   *  - magicPower, goldBonus, storageBonus
   *  - blockDialogue, blockRest
   *  - critChance, doubleGather, autoReviveOnce
   *  - fireResist, waterResist, electricResist, ironResist,
   *    earthResist, windResist, lightResist, darkResist
   */
  specialEffects: Record<string, number>;
  /** 장착 시 임시 학습되는 스킬 ID (해제 시 제거). 빈 문자열이면 없음. */
  grantedSkill: string;
}

const armorRegistry = new Map<string, ArmorDef>();

/** armor.txt DataSection[] 에서 방어구 로드 */
export function loadArmorDefs(sections: DataSection[]): void {
  armorRegistry.clear();
  for (const s of sections) {
    if (s.name.startsWith('#') || s.name === 'Meta') continue;
    const elementStr = s.get('element', 'None');
    const def: ArmorDef = {
      id: s.name,
      name: s.get('name', s.name),
      type: s.get('type', 'Cloth'),
      grade: s.get('grade', 'Common'),
      element: parseElementString(elementStr),
      defense: s.getFloat('defense', 0),
      magicDefense: s.getFloat('magicDefense', 0),
      evasion: s.getFloat('evasion', 0),
      price: s.getInt('price', 0),
      description: s.get('description', ''),
      specialEffects: parseSpecialEffects(s.get('specialEffects', '')),
      grantedSkill: s.get('grantedSkill', ''),
    };
    armorRegistry.set(def.id, def);
  }
}

export function getArmorDef(id: string): ArmorDef | undefined {
  return armorRegistry.get(id);
}

export function getAllArmorDefs(): ReadonlyMap<string, ArmorDef> {
  return armorRegistry;
}

export function getArmorCount(): number {
  return armorRegistry.size;
}

// ============================================================
// 악세서리 특수 효과
// ============================================================

function parseSpecialEffects(raw: string): Record<string, number> {
  const result: Record<string, number> = {};
  if (!raw.trim()) return result;
  for (const pair of raw.split(',')) {
    const [key, val] = pair.split(':').map(s => s.trim());
    if (key && val) {
      const n = parseFloat(val) || 0;
      // 타이핑 에러 방어: [-1, 5] 범위로 clamp
      result[key] = Math.max(-1, Math.min(5, n));
    }
  }
  return result;
}

/**
 * 장착 중인 악세서리 2슬롯의 특수 효과를 합산하여 반환.
 * 게임 시스템 각 지점에서 호출하여 보너스 적용.
 */
export function getEquippedAccessoryEffects(actor: { equippedAccessory: string; equippedAccessory2: string }): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const id of [actor.equippedAccessory, actor.equippedAccessory2]) {
    if (!id) continue;
    const def = getArmorDef(id);
    if (!def || !def.specialEffects) continue;
    for (const [k, v] of Object.entries(def.specialEffects)) {
      totals[k] = (totals[k] ?? 0) + v;
    }
  }
  return totals;
}

/**
 * 장착된 악세서리의 travelSpeed 효과를 이동 시간(분)에 적용한다.
 * - travelSpeed < 0 : 가속 (예: -0.2 → 20% 단축)
 * - travelSpeed > 0 : 감속 (예: 0.1 → 10% 지연)
 * 최종 시간은 최소 1분으로 clamp.
 */
export function applyTravelSpeed(
  actor: { equippedAccessory: string; equippedAccessory2: string },
  baseMinutes: number,
): number {
  if (baseMinutes <= 0) return baseMinutes;
  const fx = getEquippedAccessoryEffects(actor);
  const ts = fx.travelSpeed ?? 0;
  if (ts === 0) return baseMinutes;
  return Math.max(1, Math.round(baseMinutes * (1 + ts)));
}

// ============================================================
// 요소 파싱 헬퍼 (enums.ts의 Element와 동기화)
// ============================================================

const ELEMENT_STRING_MAP: Record<string, number> = {
  Fire: 0, Water: 1, Electric: 2, Iron: 3,
  Earth: 4, Wind: 5, Light: 6, Dark: 7,
};

export function parseElementString(s: string): number {
  const trimmed = s.trim();
  if (trimmed === 'None' || trimmed === '') return -1;
  return ELEMENT_STRING_MAP[trimmed] ?? -1;
}

// ============================================================
// 인벤토리 탭 분류
// ============================================================

/**
 * 종족 태그 규칙으로 해당 tags 문자열이 섭취 가능한지 판정.
 * tag-system.ts의 `canConsumeByTags(race, ItemType)`은 카테고리 enum 기반이므로
 * 여기서는 아이템의 free-form tags 문자열을 직접 파싱해 동일한 규칙을 적용한다.
 *   - potion_only: /liquid/ 만 허용
 *   - digest_all: 항상 허용
 *   - inedible 태그 있으면 불가
 */
export function canEatByItemTags(actor: { base: { race: number } }, tagsStr: string): boolean {
  const raceTags = getRaceCapabilitySet(actor.base.race);
  const itemTags = parseTags(tagsStr ?? '');
  if (raceTags.has('potion_only') && !itemTags.has('liquid')) return false;
  if (raceTags.has('digest_all')) return true;
  if (itemTags.has('inedible')) return false;
  return true;
}

/**
 * 인벤토리 UI의 탭 분류.
 * 우선순위: 무기 → 악세서리(ArmorDef.type==='Accessory') → 방어구 → 음식 → 기타.
 * 음식 판정: ItemDef.category ∈ {Food, Herb, Potion} AND canConsumeByTags.
 */
export function classifyItemForTab(
  id: string,
  actor: Actor,
): 'weapon' | 'armor' | 'accessory' | 'food' | 'misc' {
  if (getWeaponDef(id)) return 'weapon';
  const armor = getArmorDef(id);
  if (armor) return armor.type === 'Accessory' ? 'accessory' : 'armor';
  const def = getItemDef(id);
  if (def) {
    const isFoodCategory =
      def.category === ItemType.Food ||
      def.category === ItemType.Herb ||
      def.category === ItemType.Potion;
    if (isFoodCategory && canEatByItemTags(actor, def.tags)) return 'food';
  }
  return 'misc';
}

// ============================================================
// 특수 효과 한국어 표기 헬퍼
// ============================================================

/** specialEffects의 한 키-값 쌍을 사용자에게 보여줄 라벨로 변환 */
export function formatSpecialEffect(key: string, value: number): string {
  const pctPlus = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  switch (key) {
    case 'travelSpeed':
      // 음수 = 이동 시간 감소 = 속도 증가
      return value < 0
        ? `여행 속도 +${Math.round(-value * 100)}%`
        : `여행 속도 -${Math.round(value * 100)}%`;
    case 'gatherBonus':     return `채집 성공률 ${pctPlus(value)}`;
    case 'combatSpeed':     return `전투 속도 +${Math.round(value * 100)}%`;
    case 'hpRegen':         return `방 이동 시 HP ${pctPlus(value)}`;
    case 'mpRegen':         return `방 이동 시 MP ${pctPlus(value)}`;
    case 'tpRegen':         return `다음날 TP 추가 회복 ${pctPlus(value)}`;
    case 'magicPower':      return `마법 위력 ${pctPlus(value)}`;
    case 'goldBonus':       return `판매 가격 ${pctPlus(value)}`;
    case 'storageBonus':    return `창고 용량 ${pctPlus(value)}`;
    case 'blockDialogue':   return '⚠ 대화 불가';
    case 'blockRest':       return '⚠ 휴식/수면 불가';
    case 'critChance':      return `치명타 확률 ${pctPlus(value)}`;
    case 'doubleGather':    return `채집 2배 확률 ${pctPlus(value)}`;
    case 'autoReviveOnce':  return '하루 1회 자동 부활';
    case 'fireResist':      return `화염 저항 ${pctPlus(value)}`;
    case 'waterResist':     return `물 저항 ${pctPlus(value)}`;
    case 'electricResist':  return `전기 저항 ${pctPlus(value)}`;
    case 'ironResist':      return `철 저항 ${pctPlus(value)}`;
    case 'earthResist':     return `흙 저항 ${pctPlus(value)}`;
    case 'windResist':      return `바람 저항 ${pctPlus(value)}`;
    case 'lightResist':     return `빛 저항 ${pctPlus(value)}`;
    case 'darkResist':      return `어둠 저항 ${pctPlus(value)}`;
    default: {
      // 미지정 키는 원문 + 퍼센트로 표시
      const suffix = Math.abs(value) < 1 ? pctPlus(value) : String(value);
      return `${key} ${suffix}`;
    }
  }
}

/** 여러 specialEffects를 한 줄 요약으로 렌더 (빈 객체면 빈 문자열) */
export function formatSpecialEffectsList(effects: Record<string, number> | undefined): string {
  if (!effects) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(effects)) {
    if (!Number.isFinite(v) || v === 0) continue;
    parts.push(formatSpecialEffect(k, v));
  }
  return parts.join(' · ');
}
