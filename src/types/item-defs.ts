// item-defs.ts — 개별 아이템 정의 시스템
// 각 아이템은 고유 ID(string)를 가지며 카테고리, 태그, 효과 등을 정의

import { ItemType } from './enums';
import { DataSection } from '../data/parser';

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

  // 장비 스탯 (장비 아이템)
  equipSlot: EquipSlot;         // 'none', 'weapon', 'armor', 'accessory'
  equipAttack: number;
  equipDefense: number;
  equipMagic: number;
  equipSpeed: number;

  // 획득처
  source: string;               // 'gather:Wilderness', 'dungeon:Larmen_Forest', 'shop:Market' 등
}

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'unique';
export type EquipSlot = 'none' | 'weapon' | 'armor' | 'accessory';

export function createDefaultItemDef(id: string): ItemDef {
  return {
    id, name: id, category: ItemType.Food, price: 1,
    tags: '', description: '', rarity: 'common', stackable: true,
    eatVigor: 0, eatHp: 0, eatMp: 0, eatMood: 0, eatMessage: '', eatStatus: '',
    equipSlot: 'none', equipAttack: 0, equipDefense: 0, equipMagic: 0, equipSpeed: 0,
    source: '',
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

    // 장비
    def.equipSlot = (s.get('equipSlot', 'none') as EquipSlot);
    def.equipAttack = s.getFloat('equipAttack', 0);
    def.equipDefense = s.getFloat('equipDefense', 0);
    def.equipMagic = s.getFloat('equipMagic', 0);
    def.equipSpeed = s.getFloat('equipSpeed', 0);

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
