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

// --- ItemType ↔ String ID 매핑 (인벤토리 통합용) ---
const ITEM_TYPE_ID_MAP: Record<number, string> = {
  [ItemType.Food]: 'cat_food',
  [ItemType.Herb]: 'cat_herb',
  [ItemType.OreCommon]: 'cat_ore_common',
  [ItemType.OreRare]: 'cat_ore_rare',
  [ItemType.MonsterLoot]: 'cat_monster_loot',
  [ItemType.Potion]: 'cat_potion',
  [ItemType.Equipment]: 'cat_equipment',
  [ItemType.GuildCard]: 'cat_guild_card',
};

const ID_TO_ITEM_TYPE = new Map<string, ItemType>();
for (const [type, id] of Object.entries(ITEM_TYPE_ID_MAP)) {
  ID_TO_ITEM_TYPE.set(id, Number(type) as ItemType);
}

/** ItemType enum → 개별 아이템 ID (통합 인벤토리용) */
export function itemTypeToId(type: ItemType): string {
  return ITEM_TYPE_ID_MAP[type] ?? 'cat_food';
}

/** 개별 아이템 ID → ItemType (없으면 undefined) */
export function itemIdToType(id: string): ItemType | undefined {
  return ID_TO_ITEM_TYPE.get(id);
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

// --- CombatJob ---
export type CombatJob = '' | 'Warrior' | 'Ranger' | 'DarkMage' | 'WhiteMage' | 'Rogue';

export const COMBAT_JOB_NAMES: Record<CombatJob, string> = {
  '': '없음',
  Warrior: '전사',
  Ranger: '궁수',
  DarkMage: '흑마법사',
  WhiteMage: '백마법사',
  Rogue: '도적',
};

export const COMBAT_JOB_DESC: Record<CombatJob, string> = {
  '': '직업을 선택하지 않았습니다.',
  Warrior: '근접 물리 전문. 높은 방어력과 강력한 일격으로 전장을 지배한다.',
  Ranger: '원거리 공격과 기동력. 바람과 번개를 다루는 민첩한 사냥꾼.',
  DarkMage: '파괴 마법과 저주. 적을 약화시키고 폭발적 피해를 입히는 전문가.',
  WhiteMage: '회복과 축복. 아군을 지키고 전세를 뒤집는 수호자.',
  Rogue: '회피와 독. 빠른 판단과 기습으로 승부를 가르는 달인.',
};

export const ALL_COMBAT_JOBS: CombatJob[] = ['Warrior', 'Ranger', 'DarkMage', 'WhiteMage', 'Rogue'];

// --- LifeJob ---
export type LifeJob = '' | 'Villager' | 'Meteorologist' | 'Herbalist' | 'Merchant' | 'Cook' | 'Miner'
  | 'Astrologer' | 'GuildClerk' | 'Guard' | 'Farmer' | 'Fisher' | 'Priest'
  | 'Craftsman' | 'Adventurer' | 'Bard' | 'Cartographer' | 'Veterinarian';

export const LIFE_JOB_NAMES: Record<LifeJob, string> = {
  '': '없음',
  Villager: '주민',
  Meteorologist: '기상학자',
  Herbalist: '약초꾼',
  Merchant: '상인',
  Cook: '요리사',
  Miner: '광부',
  Astrologer: '점성술사',
  GuildClerk: '길드 직원',
  Guard: '경비병',
  Farmer: '농부',
  Fisher: '어부',
  Priest: '사제',
  Craftsman: '장인',
  Adventurer: '모험가',
  Bard: '음유시인',
  Cartographer: '지도 제작자',
  Veterinarian: '수의사',
};

export const LIFE_JOB_DESC: Record<LifeJob, string> = {
  '': '생활 직업을 선택하지 않았습니다.',
  Villager: '특별한 전문 분야 없이 평범하게 살아간다. 어떤 일이든 무난하게 해낸다.',
  Meteorologist: '날씨를 읽고 예측한다. 내일의 날씨를 미리 알 수 있다.',
  Herbalist: '약초와 포션에 정통하다. 채집 시 약초를 더 많이 얻고, 포션을 만들 수 있다.',
  Merchant: '거래와 흥정의 달인. 사고팔 때 가격이 유리해진다.',
  Cook: '음식으로 사람을 살린다. 다양한 요리를 만들 수 있고, 음식 효과가 증가한다.',
  Miner: '광석을 캐는 전문가. 채집 시 광석을 더 많이 얻고, 희귀 광석 확률이 오른다.',
  Astrologer: '별을 읽어 운명을 점친다. 던전 이벤트의 힌트를 얻고, 컬러 변화를 예측한다.',
  GuildClerk: '길드 업무의 전문가. 퀘스트 보상이 증가하고, 길드 정보를 더 폭넓게 열람한다.',
  Guard: '마을과 동료를 지킨다. 던전에서 동료의 방어력 보너스가 증가하고, 전투 시 선제 방어 확률이 오른다.',
  Farmer: '땅을 일구는 사람. 농작물 수확량이 늘고, 음식 재료를 더 자주 발견한다.',
  Fisher: '물가의 달인. 낚시 수확량이 늘고, 수상 던전에서 이동력 보너스를 얻는다.',
  Priest: '기도와 축복으로 사람을 돕는다. 휴식 시 HP 회복이 증가하고, Light 컬러가 서서히 오른다.',
  Craftsman: '손재주의 달인. 장비 수리와 제작 효율이 오르고, 제작 시 재료 절약 확률이 생긴다.',
  Adventurer: '끝없이 떠도는 자. 던전 탐색 HP 비용이 줄고, 미탐색 던전 진입 시 경험치 보너스를 얻는다.',
  Bard: '노래와 이야기로 분위기를 바꾼다. NPC 호감도 상승이 가속되고, 대화 시 특별한 선택지가 열린다.',
  Cartographer: '세상을 지도에 담는다. 이동 시간이 50% 줄고, 숨겨진 장소 발견 확률이 오른다.',
  Veterinarian: '동물과 정령을 돌본다. 킨·정령 계열 동료의 전투 발동 확률이 오르고, 야생 몬스터 드롭률이 증가한다.',
};

export const ALL_LIFE_JOBS: LifeJob[] = [
  'Villager',
  'Meteorologist', 'Herbalist', 'Merchant', 'Cook', 'Miner', 'Astrologer',
  'GuildClerk', 'Guard', 'Farmer', 'Fisher', 'Priest', 'Craftsman',
  'Adventurer', 'Bard', 'Cartographer', 'Veterinarian',
];

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
