// ============================================================
// enums.ts — C++ enum class 1:1 포팅
// 원본: Types.h, Color.h, Actor.h, World.h, Season.h
// ============================================================

// --- DayOfWeek (Types.h:58) ---
export enum DayOfWeek { Mon, Tue, Wed, Thu, Fri, Sat, Sun }

export function dayOfWeekName(d: DayOfWeek): string {
  return ['월', '화', '수', '목', '금', '토', '일'][d] ?? '?';
}

export function dayOfWeekNameFull(d: DayOfWeek): string {
  return ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'][d] ?? '?';
}

// --- ItemType (Types.h:157) ---
export enum ItemType {
  Food = 0, Herb, OreCommon, OreRare, MonsterLoot, Potion, Equipment, GuildCard, Count,
}

const ITEM_TYPE_KEYS: Record<string, ItemType> = {
  Food: ItemType.Food, Herb: ItemType.Herb, OreCommon: ItemType.OreCommon,
  OreRare: ItemType.OreRare, MonsterLoot: ItemType.MonsterLoot, Potion: ItemType.Potion,
  Equipment: ItemType.Equipment, GuildCard: ItemType.GuildCard,
};

export function parseItemType(s: string): ItemType {
  return ITEM_TYPE_KEYS[s.trim()] ?? ItemType.Food;
}

const ITEM_TYPE_NAMES: Record<ItemType, string> = {
  [ItemType.Food]: '식량', [ItemType.Herb]: '약초', [ItemType.OreCommon]: '광석',
  [ItemType.OreRare]: '희귀 광석', [ItemType.MonsterLoot]: '몬스터 전리품',
  [ItemType.Potion]: '포션', [ItemType.Equipment]: '장비', [ItemType.GuildCard]: '길드 카드',
  [ItemType.Count]: '?',
};

export function itemTypeName(t: ItemType): string {
  return ITEM_TYPE_NAMES[t] ?? '?';
}

// --- Element (Color.h:15) ---
export enum Element {
  Fire = 0, Water, Electric, Iron, Earth, Wind, Light, Dark, Count,
}

export const ELEMENT_COUNT = Element.Count as number;

const ELEMENT_NAMES: Record<Element, string> = {
  [Element.Fire]: '불', [Element.Water]: '물', [Element.Electric]: '전기',
  [Element.Iron]: '철', [Element.Earth]: '흙', [Element.Wind]: '바람',
  [Element.Light]: '빛', [Element.Dark]: '어둠', [Element.Count]: '?',
};

export function elementName(e: Element): string {
  return ELEMENT_NAMES[e] ?? '?';
}

const ELEMENT_KEYS: Record<string, Element> = {
  Fire: Element.Fire, Water: Element.Water, Electric: Element.Electric,
  Iron: Element.Iron, Earth: Element.Earth, Wind: Element.Wind,
  Light: Element.Light, Dark: Element.Dark,
};

export function parseElement(s: string): Element {
  return ELEMENT_KEYS[s.trim()] ?? Element.Fire;
}

// --- Trait (Color.h:47) ---
export enum Trait {
  Passionate, Aggressive, Excited, Calm, Melancholy, Cautious,
  Empathetic, Adaptable, Indifferent, Rigid,
  Impulsive, Inventive, Methodical, Stagnant,
  Stubborn, Reliable, Flexible, Fragile,
  Patient, Greedy, Generous, Restless,
  Freesprited, Flighty, Grounded, Withdrawn,
  Hopeful, Righteous, Cynical, Apathetic,
  Cunning, Secretive, Honest, Naive,
  Count,
}

const TRAIT_NAMES: Record<Trait, string> = {
  [Trait.Passionate]: '열정적', [Trait.Aggressive]: '다혈질', [Trait.Excited]: '신남',
  [Trait.Calm]: '침착', [Trait.Melancholy]: '시무룩', [Trait.Cautious]: '조심스러운',
  [Trait.Empathetic]: '공감적', [Trait.Adaptable]: '유연한(물)',
  [Trait.Indifferent]: '무관심', [Trait.Rigid]: '경직된',
  [Trait.Impulsive]: '충동적', [Trait.Inventive]: '창의적',
  [Trait.Methodical]: '체계적', [Trait.Stagnant]: '정체된',
  [Trait.Stubborn]: '고집스러운', [Trait.Reliable]: '신뢰할 수 있는',
  [Trait.Flexible]: '유연한(철)', [Trait.Fragile]: '나약한',
  [Trait.Patient]: '인내심 있는', [Trait.Greedy]: '탐욕적',
  [Trait.Generous]: '관대한', [Trait.Restless]: '불안정한',
  [Trait.Freesprited]: '자유분방', [Trait.Flighty]: '변덕스러운',
  [Trait.Grounded]: '현실적', [Trait.Withdrawn]: '내향적',
  [Trait.Hopeful]: '희망적', [Trait.Righteous]: '정의로운',
  [Trait.Cynical]: '냉소적', [Trait.Apathetic]: '무기력',
  [Trait.Cunning]: '교활한', [Trait.Secretive]: '비밀스러운',
  [Trait.Honest]: '솔직한', [Trait.Naive]: '순진한',
  [Trait.Count]: '?',
};

export function traitName(t: Trait): string {
  return TRAIT_NAMES[t] ?? '?';
}

const TRAIT_KEY_MAP: Record<string, Trait> = {
  Passionate: Trait.Passionate, Aggressive: Trait.Aggressive, Excited: Trait.Excited,
  Calm: Trait.Calm, Melancholy: Trait.Melancholy, Cautious: Trait.Cautious,
  Empathetic: Trait.Empathetic, Adaptable: Trait.Adaptable,
  Indifferent: Trait.Indifferent, Rigid: Trait.Rigid,
  Impulsive: Trait.Impulsive, Inventive: Trait.Inventive,
  Methodical: Trait.Methodical, Stagnant: Trait.Stagnant,
  Stubborn: Trait.Stubborn, Reliable: Trait.Reliable,
  Flexible: Trait.Flexible, Fragile: Trait.Fragile,
  Patient: Trait.Patient, Greedy: Trait.Greedy,
  Generous: Trait.Generous, Restless: Trait.Restless,
  Freesprited: Trait.Freesprited, Flighty: Trait.Flighty,
  Grounded: Trait.Grounded, Withdrawn: Trait.Withdrawn,
  Hopeful: Trait.Hopeful, Righteous: Trait.Righteous,
  Cynical: Trait.Cynical, Apathetic: Trait.Apathetic,
  Cunning: Trait.Cunning, Secretive: Trait.Secretive,
  Honest: Trait.Honest, Naive: Trait.Naive,
};

export function traitToKey(t: Trait): string {
  for (const [k, v] of Object.entries(TRAIT_KEY_MAP)) {
    if (v === t) return k;
  }
  return 'Unknown';
}

export function parseTrait(s: string): Trait {
  return TRAIT_KEY_MAP[s.trim()] ?? Trait.Calm;
}

// --- Race (Actor.h:22) ---
export enum Race {
  Human, Elf, Dwarf, Beastkin, Harpy, Centaur, Nekomimi, Spirit,
  Foxkin, Dragon, Angel, Demon, Arcana, Construct, Moth, Dryad,
  FallenAngel, Phantom, Merfolk, Goblin, Vampire, Lamia, Fairy,
  Arachne, Slime, Lizardfolk, Minotaur, Werewolf, Halfling, Siren, Alraune,
  Count,
}

const RACE_NAMES: Record<Race, string> = {
  [Race.Human]: '인간', [Race.Elf]: '엘프', [Race.Dwarf]: '드워프',
  [Race.Beastkin]: '수인', [Race.Harpy]: '하피', [Race.Centaur]: '켄타우로스',
  [Race.Nekomimi]: '네코미미', [Race.Spirit]: '정령', [Race.Foxkin]: '여우 수인',
  [Race.Dragon]: '드래곤', [Race.Angel]: '천사', [Race.Demon]: '악마',
  [Race.Arcana]: '아르카나', [Race.Construct]: '인공물', [Race.Moth]: '나방족',
  [Race.Dryad]: '드라이어드', [Race.FallenAngel]: '타천사', [Race.Phantom]: '팬텀',
  [Race.Merfolk]: '인어', [Race.Goblin]: '고블린', [Race.Vampire]: '뱀파이어',
  [Race.Lamia]: '라미아', [Race.Fairy]: '요정', [Race.Arachne]: '아라크네',
  [Race.Slime]: '슬라임', [Race.Lizardfolk]: '리자드맨', [Race.Minotaur]: '미노타우로스',
  [Race.Werewolf]: '늑대인간', [Race.Halfling]: '하프링', [Race.Siren]: '사이렌',
  [Race.Alraune]: '알라우네', [Race.Count]: '???',
};

export function raceName(r: Race): string {
  return RACE_NAMES[r] ?? '???';
}

const RACE_KEYS: Record<string, Race> = {
  Human: Race.Human, Elf: Race.Elf, Dwarf: Race.Dwarf, Beastkin: Race.Beastkin,
  Harpy: Race.Harpy, Centaur: Race.Centaur, Nekomimi: Race.Nekomimi, Spirit: Race.Spirit,
  Foxkin: Race.Foxkin, Dragon: Race.Dragon, Angel: Race.Angel, Demon: Race.Demon,
  Arcana: Race.Arcana, Construct: Race.Construct, Moth: Race.Moth, Dryad: Race.Dryad,
  FallenAngel: Race.FallenAngel, Phantom: Race.Phantom, Merfolk: Race.Merfolk,
  Goblin: Race.Goblin, Vampire: Race.Vampire, Lamia: Race.Lamia, Fairy: Race.Fairy,
  Arachne: Race.Arachne, Slime: Race.Slime, Lizardfolk: Race.Lizardfolk,
  Minotaur: Race.Minotaur, Werewolf: Race.Werewolf, Halfling: Race.Halfling,
  Siren: Race.Siren, Alraune: Race.Alraune,
};

export function parseRace(s: string): Race {
  return RACE_KEYS[s.trim()] ?? Race.Human;
}

export function raceToKey(r: Race): string {
  for (const [k, v] of Object.entries(RACE_KEYS)) {
    if (v === r) return k;
  }
  return 'Human';
}

// --- SpiritRole (Actor.h:130) ---
export enum SpiritRole {
  GuildClerk, Adventurer, Merchant, Farmer, Guard, Villager,
  Meteorologist, Miner, Fisher, Priest, Craftsman, Count,
}

const SPIRIT_ROLE_NAMES: Record<SpiritRole, string> = {
  [SpiritRole.GuildClerk]: '길드 직원', [SpiritRole.Adventurer]: '모험가',
  [SpiritRole.Merchant]: '상인', [SpiritRole.Farmer]: '농부',
  [SpiritRole.Guard]: '경비병', [SpiritRole.Villager]: '주민',
  [SpiritRole.Meteorologist]: '기상학자', [SpiritRole.Miner]: '광부',
  [SpiritRole.Fisher]: '어부', [SpiritRole.Priest]: '사제',
  [SpiritRole.Craftsman]: '장인', [SpiritRole.Count]: '???',
};

export function spiritRoleName(r: SpiritRole): string {
  return SPIRIT_ROLE_NAMES[r] ?? '???';
}

const SPIRIT_ROLE_KEYS: Record<string, SpiritRole> = {
  GuildClerk: SpiritRole.GuildClerk, Adventurer: SpiritRole.Adventurer,
  Merchant: SpiritRole.Merchant, Farmer: SpiritRole.Farmer,
  Guard: SpiritRole.Guard, Villager: SpiritRole.Villager,
  Meteorologist: SpiritRole.Meteorologist, Miner: SpiritRole.Miner,
  Fisher: SpiritRole.Fisher, Priest: SpiritRole.Priest, Craftsman: SpiritRole.Craftsman,
};

export function parseSpiritRole(s: string): SpiritRole {
  return SPIRIT_ROLE_KEYS[s.trim()] ?? SpiritRole.Villager;
}

export function spiritRoleToKey(r: SpiritRole): string {
  for (const [k, v] of Object.entries(SPIRIT_ROLE_KEYS)) {
    if (v === r) return k;
  }
  return 'Villager';
}

// --- Weather (World.h:16) ---
export enum Weather { Clear, Cloudy, Rain, Storm, Fog, Snow, Count }

const WEATHER_NAMES: Record<Weather, string> = {
  [Weather.Clear]: '맑음', [Weather.Cloudy]: '흐림', [Weather.Rain]: '비',
  [Weather.Storm]: '폭풍', [Weather.Fog]: '안개', [Weather.Snow]: '눈',
  [Weather.Count]: '???',
};

export function weatherName(w: Weather): string {
  return WEATHER_NAMES[w] ?? '???';
}

export const WEATHER_COUNT = Weather.Count as number;

// --- Season (Season.h:7) ---
export enum Season { Blaze, Frost, Thunder, Harvest, Radiance, Silence, Count }

export const SEASON_COUNT = Season.Count as number;
export const SEASON_DURATION_DAYS = 7;

const SEASON_NAMES: Record<Season, string> = {
  [Season.Blaze]: '화염기', [Season.Frost]: '빙결기', [Season.Thunder]: '뇌명기',
  [Season.Harvest]: '풍요기', [Season.Radiance]: '광명기', [Season.Silence]: '침묵기',
  [Season.Count]: '???',
};

export function seasonName(s: Season): string {
  return SEASON_NAMES[s] ?? '???';
}

const SEASON_KEYS: Record<string, Season> = {
  Blaze: Season.Blaze, Frost: Season.Frost, Thunder: Season.Thunder,
  Harvest: Season.Harvest, Radiance: Season.Radiance, Silence: Season.Silence,
};

export function seasonKey(s: Season): string {
  for (const [k, v] of Object.entries(SEASON_KEYS)) {
    if (v === s) return k;
  }
  return 'Blaze';
}

export function parseSeason(s: string): Season {
  return SEASON_KEYS[s.trim()] ?? Season.Harvest;
}
