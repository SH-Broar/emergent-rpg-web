import { ItemType, Race } from './enums';
import { randomFloat } from './rng';

export interface EatResult {
  success: boolean;
  message: string;
  vigor: number;
  hp: number;
  mp: number;
  mood: number;
  statusEffect?: 'poison' | 'stomachache';
}

// Tags per item type
const ITEM_EAT_TAGS: Record<number, string[]> = {
  [ItemType.Food]: ['edible'],
  [ItemType.Herb]: ['edible', 'raw', 'medicine'],
  [ItemType.Potion]: ['edible', 'medicine', 'magical'],
  [ItemType.OreCommon]: ['mineral', 'inedible', 'metallic'],
  [ItemType.OreRare]: ['mineral', 'inedible', 'toxic', 'metallic'],
  [ItemType.MonsterLoot]: ['raw'],
  [ItemType.Equipment]: ['inedible', 'metallic'],
  [ItemType.GuildCard]: ['inedible'],
};

// Base effects per item
const BASE_EFFECTS: Record<number, Omit<EatResult, 'success'>> = {
  [ItemType.Food]: { message: '식사를 했다.', vigor: 40, hp: 0, mp: 0, mood: 0.05 },
  [ItemType.Herb]: { message: '약초를 먹었다. 쓴 맛이다.', vigor: 10, hp: 15, mp: 0, mood: -0.02 },
  [ItemType.Potion]: { message: '물약을 마셨다.', vigor: 0, hp: 10, mp: 20, mood: 0.03 },
  [ItemType.OreCommon]: { message: '이가 아프다!', vigor: 0, hp: -10, mp: 0, mood: -0.1 },
  [ItemType.OreRare]: { message: '독성 광물이다!', vigor: 0, hp: -20, mp: 0, mood: -0.15, statusEffect: 'poison' },
  [ItemType.MonsterLoot]: { message: '맛이 이상하다...', vigor: 0, hp: 0, mp: 0, mood: -0.05 },
  [ItemType.Equipment]: { message: '씹을 수 없다!', vigor: 0, hp: -5, mp: 0, mood: -0.08 },
  [ItemType.GuildCard]: { message: '종이 맛이다.', vigor: 0, hp: 0, mp: 0, mood: -0.02 },
};

// Races immune to toxic
const TOXIC_IMMUNE: Race[] = [Race.Construct, Race.Arcana, Race.Dragon, Race.Slime];

// Races immune to raw side effects
const RAW_IMMUNE: Race[] = [Race.Construct, Race.Arcana, Race.Dragon, Race.Slime];

// Races that can eat mineral/metallic/inedible items
const MINERAL_EATERS: Race[] = [Race.Construct, Race.Arcana, Race.Slime];

// Phantom can only eat potions
const PHANTOM_ONLY_POTIONS = true;

export function getEatTags(item: ItemType): string[] {
  return ITEM_EAT_TAGS[item] ?? [];
}

export function canEatItem(item: ItemType, race: Race): { allowed: boolean; warning: string } {
  const tags = getEatTags(item);

  // Phantom special rule: only potions
  if (race === Race.Phantom) {
    if (item === ItemType.Potion) return { allowed: true, warning: '' };
    return { allowed: false, warning: '유령은 물약만 섭취할 수 있다.' };
  }

  // Slime can eat everything
  if (race === Race.Slime) return { allowed: true, warning: tags.includes('inedible') ? '⚠ 슬라임이라 먹을 수는 있지만...' : '' };

  // Mineral eaters can eat inedible mineral items
  if (tags.includes('inedible') && tags.includes('mineral') && MINERAL_EATERS.includes(race)) {
    return { allowed: true, warning: '' };
  }

  // Inedible items: show warning but allow (NetHack style)
  if (tags.includes('inedible')) {
    return { allowed: true, warning: '⚠ 먹을 수 있는 것이 아닌 것 같다...' };
  }

  return { allowed: true, warning: '' };
}

export function computeEatEffect(item: ItemType, race: Race): EatResult {
  const tags = getEatTags(item);
  const base = BASE_EFFECTS[item] ?? { message: '???', vigor: 0, hp: 0, mp: 0, mood: 0 };
  const result: EatResult = { success: true, ...base };

  // Phantom: only potions
  if (race === Race.Phantom && item !== ItemType.Potion) {
    return { success: false, message: '유령은 물약만 섭취할 수 있다.', vigor: 0, hp: 0, mp: 0, mood: 0 };
  }

  // Slime: everything edible but 50% effect
  if (race === Race.Slime) {
    result.vigor = Math.round(result.vigor * 0.5);
    result.hp = Math.round(result.hp * 0.5);
    result.mp = Math.round(result.mp * 0.5);
    result.statusEffect = undefined; // Immune to all side effects
    if (tags.includes('inedible')) result.message = '슬라임이 흡수했다.';
    return result;
  }

  // Construct/Arcana: mineral/metallic bonus, toxic immune
  if (MINERAL_EATERS.includes(race) && (tags.includes('mineral') || tags.includes('metallic'))) {
    // Positive effect instead of negative
    result.hp = Math.abs(result.hp) + 10;
    result.vigor = 20;
    result.mood = 0.05;
    result.statusEffect = undefined;
    result.message = item === ItemType.Equipment ? '철분 보충!' : '광석을 씹어 먹었다. 힘이 솟는다!';
    return result;
  }

  // Dragon: toxic immune, raw immune
  if (race === Race.Dragon) {
    result.statusEffect = undefined;
  }

  // Vampire: MonsterLoot 2x, Food 50%
  if (race === Race.Vampire) {
    if (item === ItemType.MonsterLoot) {
      result.vigor = 20;
      result.hp = 10;
      result.mood = 0.05;
      result.message = '피의 맛이다... 좋군.';
    } else if (item === ItemType.Food) {
      result.vigor = Math.round(result.vigor * 0.5);
      result.message = '평범한 음식은 별로다.';
    }
  }

  // Dryad/Alraune: Herb 2x
  if ((race === Race.Dryad || race === Race.Alraune) && item === ItemType.Herb) {
    result.hp *= 2;
    result.vigor *= 2;
    result.message = '약초의 기운이 온몸에 퍼진다!';
  }

  // Raw: 50% chance of stomachache for non-immune races
  if (tags.includes('raw') && !RAW_IMMUNE.includes(race)) {
    if (randomFloat(0, 1) < 0.5) {
      result.statusEffect = 'stomachache';
      result.hp -= 5;
      result.message += ' 배가 아프다...';
    }
  }

  // Toxic: poison for non-immune races
  if (tags.includes('toxic') && !TOXIC_IMMUNE.includes(race)) {
    result.statusEffect = 'poison';
  }

  // MonsterLoot random effect
  if (item === ItemType.MonsterLoot && race !== Race.Vampire) {
    if (randomFloat(0, 1) < 0.5) {
      result.vigor = 20;
      result.hp = 5;
    } else {
      result.hp = -10;
      result.vigor = -5;
    }
  }

  return result;
}

export function itemEatLabel(item: ItemType): string {
  switch (item) {
    case ItemType.Food: return '식량';
    case ItemType.Herb: return '약초';
    case ItemType.Potion: return '물약';
    case ItemType.OreCommon: return '일반 광석';
    case ItemType.OreRare: return '희귀 광석';
    case ItemType.MonsterLoot: return '몬스터 전리품';
    case ItemType.Equipment: return '장비';
    case ItemType.GuildCard: return '길드 카드';
    default: return '???';
  }
}

// Suppress unused variable warning for the constant
void PHANTOM_ONLY_POTIONS;
