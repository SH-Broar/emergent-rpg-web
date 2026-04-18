// crafting.ts — 제작/합성 시스템
// 라이트 슬로우 라이프 판타지 테마: 아늑하고 보람찬 제작 경험

import { Actor } from '../models/actor';
import { ItemType, parseItemType } from '../types/enums';
import { categoryName, getItemDef } from '../types/item-defs';

// ============================================================
// 제작 레시피 정의
// ============================================================

export interface RecipeInput {
  item: string;        // ItemType 이름 (예: 'Herb', 'Food') 또는 개별 아이템 ID
  amount: number;
}

export interface RecipeOutput {
  item: string;        // ItemType 이름 또는 개별 아이템 ID
  amount: number;
}

export interface CraftRecipe {
  id: string;
  name: string;
  description: string;
  inputs: RecipeInput[];
  output: RecipeOutput;
  vigorCost: number;
  requiredLocation?: string;   // 제작 가능 장소 (LocationID)
  colorBonus?: number[];       // 보너스 수율을 주는 원소 인덱스 목록
}

// ============================================================
// 레시피 데이터
// ============================================================

const RECIPES: CraftRecipe[] = [
  // --- 기본 범용 제작 ---
  {
    id: 'brew_herbal_tea',
    name: '허브차 우려내기',
    description: '가장 기본적인 따뜻한 허브차를 만든다.',
    inputs: [{ item: 'Herb', amount: 2 }],
    output: { item: 'herbal_tea', amount: 1 },
    vigorCost: 5,
    colorBonus: [1],
  },
  {
    id: 'brew_moonshine',
    name: '월주 소병 빚기',
    description: '만월 수액으로 달빛 증류주를 만든다.',
    inputs: [{ item: 'fullmoon_sap', amount: 1 }],
    output: { item: 'moonshine', amount: 1 },
    vigorCost: 6,
    requiredLocation: 'Fullmoon_Pavilion',
    colorBonus: [6, 7],
  },
  {
    id: 'refine_mana_water',
    name: '빙하수 정제',
    description: '산정 빙결정을 녹여 맑은 마나수를 얻는다.',
    inputs: [{ item: 'summit_ice_crystal', amount: 1 }],
    output: { item: 'mana_water', amount: 1 },
    vigorCost: 6,
    requiredLocation: 'Summit',
    colorBonus: [1, 6],
  },
  {
    id: 'distill_starlight_nectar',
    name: '별빛 넥타르 추출',
    description: '경면 파편에서 별빛 정수를 추출한다.',
    inputs: [{ item: 'mirrorway_shard', amount: 1 }],
    output: { item: 'starlight_nectar', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Starlit_Mirrorway',
    colorBonus: [6, 1],
  },

  // --- 약초원/알리메스 라인 ---
  {
    id: 'dry_pluen_bundle',
    name: '플루엔 약초 묶기',
    description: '플루엔 약초를 표준 납품 규격으로 건조한다.',
    inputs: [{ item: 'pluen_mint', amount: 2 }, { item: 'pluen_blossom', amount: 1 }],
    output: { item: 'dried_pluen_bundle', amount: 1 },
    vigorCost: 6,
    requiredLocation: 'Herb_Garden',
    colorBonus: [4, 1],
  },
  {
    id: 'craft_pluen_healing_wrap',
    name: '플루엔 치유포 제작',
    description: '꽃잎과 이슬잎으로 응급 치유포를 만든다.',
    inputs: [{ item: 'pluen_blossom', amount: 1 }, { item: 'dewleaf_bundle', amount: 1 }],
    output: { item: 'pluen_healing_wrap', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Herb_Garden',
    colorBonus: [6, 4],
  },
  {
    id: 'pack_herb_trade_crate',
    name: '약초 상단 상자 포장',
    description: '약초 묶음과 치유포를 지부 납품용 상자로 묶는다.',
    inputs: [{ item: 'dried_pluen_bundle', amount: 2 }, { item: 'pluen_healing_wrap', amount: 1 }],
    output: { item: 'herb_trade_crate', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Alimes',
    colorBonus: [4],
  },
  {
    id: 'cook_herb_honey_jelly',
    name: '약초 꿀젤리 만들기',
    description: '박하와 허브를 달여 장터용 디저트를 만든다.',
    inputs: [{ item: 'pluen_mint', amount: 1 }, { item: 'Herb', amount: 1 }],
    output: { item: 'herb_honey_jelly', amount: 1 },
    vigorCost: 5,
    requiredLocation: 'Alimes',
    colorBonus: [1, 6],
  },

  // --- 비단 공방/티클릿 라인 ---
  {
    id: 'spin_silk_spool',
    name: '비단 실타래 감기',
    description: '비단풀 섬유와 씨솜을 감아 표준 실타래를 만든다.',
    inputs: [{ item: 'silkweed_fiber', amount: 2 }, { item: 'tiklit_seed_floss', amount: 1 }],
    output: { item: 'silk_spool', amount: 1 },
    vigorCost: 7,
    requiredLocation: 'Silk_Workshop',
    colorBonus: [5],
  },
  {
    id: 'brew_silkflower_tea',
    name: '비단꽃차 달이기',
    description: '공방 손님용 향차를 천천히 우린다.',
    inputs: [{ item: 'silkweed_fiber', amount: 1 }, { item: 'Herb', amount: 1 }],
    output: { item: 'silkflower_tea', amount: 1 },
    vigorCost: 6,
    requiredLocation: 'Silk_Workshop',
    colorBonus: [1, 5],
  },
  {
    id: 'bundle_silk_parcel',
    name: '의전 비단 꾸러미 묶기',
    description: '실타래와 달풀을 함께 묶어 선물용 비단 꾸러미를 만든다.',
    inputs: [{ item: 'silk_spool', amount: 1 }, { item: 'moon_rabbit_clover', amount: 1 }],
    output: { item: 'silk_parcel', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Silk_Workshop',
    colorBonus: [5, 6],
  },
  {
    id: 'craft_tiklit_incense',
    name: '티클릿 향묶음 제작',
    description: '벚수지와 씨솜으로 산길용 향묶음을 만든다.',
    inputs: [{ item: 'cherry_resin', amount: 1 }, { item: 'tiklit_seed_floss', amount: 1 }],
    output: { item: 'tiklit_incense', amount: 1 },
    vigorCost: 6,
    requiredLocation: 'Tiklit_Range',
    colorBonus: [5, 7],
  },
  {
    id: 'pack_cherry_smoke_bundle',
    name: '벚연기 훈향 꾸러미 포장',
    description: '벚수지를 티클릿 목재 상자에 담아 납품용 꾸러미를 만든다.',
    inputs: [{ item: 'cherry_resin', amount: 1 }, { item: 'tiklit_timber', amount: 1 }],
    output: { item: 'cherry_smoke_bundle', amount: 1 },
    vigorCost: 7,
    requiredLocation: 'Tiklit_Range',
    colorBonus: [5],
  },

  // --- 달빛/사구 라인 ---
  {
    id: 'distill_moon_dew_extract',
    name: '월이슬 추출액 제조',
    description: '월이슬 꽃잎과 수액을 농축해 밤약을 만든다.',
    inputs: [{ item: 'moon_dew_petal', amount: 2 }, { item: 'fullmoon_sap', amount: 1 }],
    output: { item: 'moon_dew_extract', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Moonlit_Clearing',
    colorBonus: [6, 7],
  },
  {
    id: 'brew_observer_tonic',
    name: '야간 관측 강장제 조합',
    description: '추출액과 달풀로 밤눈을 돕는 강장제를 만든다.',
    inputs: [{ item: 'moon_dew_extract', amount: 1 }, { item: 'moon_rabbit_clover', amount: 1 }],
    output: { item: 'moon_observer_tonic', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Moonlit_Clearing',
    colorBonus: [6, 1],
  },
  {
    id: 'pack_dune_salt',
    name: '사구 소금주머니 포장',
    description: '염초풀과 유리병을 엮어 소금주머니를 만든다.',
    inputs: [{ item: 'dune_saltweed', amount: 2 }, { item: 'dune_glass_shard', amount: 1 }],
    output: { item: 'dune_salt_pack', amount: 1 },
    vigorCost: 6,
    requiredLocation: 'Cyan_Dunes',
    colorBonus: [4],
  },
  {
    id: 'brew_rehydration_draught',
    name: '재수화 음료 제조',
    description: '사구 채집자들이 쓰는 물 보충용 음료를 만든다.',
    inputs: [{ item: 'dune_saltweed', amount: 1 }, { item: 'dune_salt_pack', amount: 1 }],
    output: { item: 'rehydration_draught', amount: 1 },
    vigorCost: 6,
    requiredLocation: 'Cyan_Dunes',
    colorBonus: [1, 4],
  },

  // --- 폐광/바그레트 라인 ---
  {
    id: 'assemble_mine_tool_kit',
    name: '광산 정비키트 조립',
    description: '고철과 철모래를 정리해 간단한 정비키트를 만든다.',
    inputs: [{ item: 'abandoned_gear_scrap', amount: 2 }, { item: 'mine_iron_sand', amount: 1 }],
    output: { item: 'mine_tool_kit', amount: 1 },
    vigorCost: 7,
    requiredLocation: 'Abandoned_Mine',
    colorBonus: [3],
  },
  {
    id: 'mix_miner_focus_tonic',
    name: '광부 집중제 조합',
    description: '철모래와 박하를 섞어 짧은 집중용 약제를 만든다.',
    inputs: [{ item: 'mine_iron_sand', amount: 1 }, { item: 'pluen_mint', amount: 1 }],
    output: { item: 'miner_focus_tonic', amount: 1 },
    vigorCost: 6,
    requiredLocation: 'Abandoned_Mine',
    colorBonus: [3, 0],
  },
  {
    id: 'pack_bagreat_ration',
    name: '바그레트 산행식량 포장',
    description: '산길용 보존식과 버섯을 묶어 운반용 식량으로 만든다.',
    inputs: [{ item: 'cliff_dried_fish', amount: 1 }, { item: 'bagreat_stone_truffle', amount: 1 }],
    output: { item: 'bagreat_field_ration', amount: 1 },
    vigorCost: 7,
    requiredLocation: 'Bagreat',
    colorBonus: [4],
  },
  {
    id: 'cook_bagreat_heat_balm',
    name: '바그레트 열기 연고 조제',
    description: '버섯과 화근을 섞어 몸을 데우는 연고를 만든다.',
    inputs: [{ item: 'bagreat_stone_truffle', amount: 1 }, { item: 'gelider_ember_root', amount: 1 }],
    output: { item: 'bagreat_heat_balm', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Bagreat',
    colorBonus: [0, 4],
  },

  // --- 설산/안개/성천 라인 ---
  {
    id: 'press_snowfield_tea_brick',
    name: '설산 차벽돌 압착',
    description: '설산 찻잎과 서리눈을 눌러 오래 가는 차 벽돌을 만든다.',
    inputs: [{ item: 'snow_cedar_leaf', amount: 2 }, { item: 'frostbud', amount: 1 }],
    output: { item: 'snowfield_tea_brick', amount: 1 },
    vigorCost: 7,
    requiredLocation: 'Alime_Mountain',
    colorBonus: [1],
  },
  {
    id: 'distill_summit_drop',
    name: '빙하 방울수 추출',
    description: '산정 얼음과 잎차를 천천히 녹여 빙하 방울수를 만든다.',
    inputs: [{ item: 'summit_ice_crystal', amount: 1 }, { item: 'snow_cedar_leaf', amount: 1 }],
    output: { item: 'summit_glacier_drop', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Summit',
    colorBonus: [1, 6],
  },
  {
    id: 'weave_mistwood_filter',
    name: '안개 여과포 짜기',
    description: '포자 갓과 수초 섬유를 엮어 여과포를 만든다.',
    inputs: [{ item: 'mistwood_spore_cap', amount: 1 }, { item: 'mistpond_reed', amount: 1 }],
    output: { item: 'mistwood_filter', amount: 1 },
    vigorCost: 7,
    requiredLocation: 'Erumen_Mistwood',
    colorBonus: [1, 7],
  },
  {
    id: 'brew_mistward_draught',
    name: '안개막 차제 달이기',
    description: '포자와 여과포 정수를 달여 길찾기용 차를 만든다.',
    inputs: [{ item: 'mistwood_spore_cap', amount: 1 }, { item: 'mistwood_filter', amount: 1 }],
    output: { item: 'mistward_draught', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Erumen_Mistwood',
    colorBonus: [1, 7],
  },
  {
    id: 'bottle_clearwater_vial',
    name: '성천 맑은물 병입',
    description: '연꽃잎과 마나수를 써 성천호 채수 병을 봉한다.',
    inputs: [{ item: 'seoncheon_lotus_petal', amount: 1 }, { item: 'mana_water', amount: 1 }],
    output: { item: 'seoncheon_clearwater_vial', amount: 1 },
    vigorCost: 7,
    requiredLocation: 'Erumen_Seoncheon',
    colorBonus: [1, 6],
  },
  {
    id: 'brew_lotus_purifier',
    name: '연정 정화수 조합',
    description: '성천 맑은물 병과 연꽃잎으로 정화수를 만든다.',
    inputs: [{ item: 'seoncheon_clearwater_vial', amount: 1 }, { item: 'seoncheon_lotus_petal', amount: 1 }],
    output: { item: 'lotus_purifier', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Erumen_Seoncheon',
    colorBonus: [1, 6],
  },

  // --- 겔리더/오드/숨겨진 지역 라인 ---
  {
    id: 'cook_gelider_heat_paste',
    name: '겔리더 열고약 조제',
    description: '화근과 탄흑 광석을 빻아 따뜻한 고약을 만든다.',
    inputs: [{ item: 'gelider_ember_root', amount: 1 }, { item: 'gelider_char_ore', amount: 1 }],
    output: { item: 'gelider_heat_paste', amount: 1 },
    vigorCost: 7,
    requiredLocation: 'Gelider',
    colorBonus: [0],
  },
  {
    id: 'brew_ode_hunter_broth',
    name: '사냥꾼 농축수프 끓이기',
    description: '산약초와 늑대 가죽 조각을 우려 사냥꾼용 농축수를 만든다.',
    inputs: [{ item: 'ode_wolfberry_leaf', amount: 1 }, { item: 'ode_wolf_pelt_strip', amount: 1 }],
    output: { item: 'ode_hunter_broth', amount: 1 },
    vigorCost: 7,
    requiredLocation: 'Ode_Mountain',
    colorBonus: [4, 7],
  },
  {
    id: 'craft_foxfire_incense',
    name: '여우불 향환 제작',
    description: '여우불 꽃과 티클릿 향묶음을 엮어 숨길용 향환을 만든다.',
    inputs: [{ item: 'foxfire_blossom', amount: 1 }, { item: 'tiklit_incense', amount: 1 }],
    output: { item: 'foxfire_incense', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Fox_Village',
    colorBonus: [5, 7],
  },
  {
    id: 'brew_mistpond_syrup',
    name: '미스트폰드 수초청 졸이기',
    description: '수초와 허브차를 졸여 은은한 회복청을 만든다.',
    inputs: [{ item: 'mistpond_reed', amount: 1 }, { item: 'herbal_tea', amount: 1 }],
    output: { item: 'mistpond_reed_syrup', amount: 1 },
    vigorCost: 8,
    requiredLocation: 'Mistpond',
    colorBonus: [1, 4],
  },
  {
    id: 'mix_mirrorway_polish',
    name: '경면 연마액 배합',
    description: '경면 파편과 투명정을 섞어 유리 연마액을 만든다.',
    inputs: [{ item: 'mirrorway_shard', amount: 1 }, { item: 'seoncheon_clear_crystal', amount: 1 }],
    output: { item: 'mirrorway_polish', amount: 1 },
    vigorCost: 9,
    requiredLocation: 'Starlit_Mirrorway',
    colorBonus: [6, 1],
  },
  {
    id: 'scribe_mirrorway_pass',
    name: '경면 통행패 필사',
    description: '연마액과 공명정을 사용해 통행패를 만든다.',
    inputs: [{ item: 'mirrorway_polish', amount: 1 }, { item: 'mirror_resonance_crystal', amount: 1 }],
    output: { item: 'mirrorway_clearance_pass', amount: 1 },
    vigorCost: 10,
    requiredLocation: 'Starlit_Mirrorway',
    colorBonus: [6, 7],
  },

  // --- 장비 제작 (대장간 전용) ---
  {
    id: 'forge_iron_sword',
    name: '철검 제작',
    description: '광석을 녹여 기본적인 철검을 만든다.',
    inputs: [{ item: 'OreCommon', amount: 3 }],
    output: { item: 'Iron_Sword', amount: 1 },
    vigorCost: 15,
    requiredLocation: 'Moss_Forge',
    colorBonus: [3, 0],
  },
  {
    id: 'forge_iron_mace',
    name: '쇠뭉치 제작',
    description: '무거운 철 덩어리를 망치 형태로 단련한다.',
    inputs: [{ item: 'OreCommon', amount: 4 }],
    output: { item: 'Iron_Mace', amount: 1 },
    vigorCost: 18,
    requiredLocation: 'Moss_Forge',
    colorBonus: [3],
  },
  {
    id: 'forge_iron_plate',
    name: '철판 갑옷 제작',
    description: '철판을 두들겨 기본 갑옷을 만든다.',
    inputs: [{ item: 'OreCommon', amount: 5 }],
    output: { item: 'Iron_Plate', amount: 1 },
    vigorCost: 20,
    requiredLocation: 'Moss_Forge',
    colorBonus: [3, 0],
  },
  {
    id: 'forge_steel_lance',
    name: '강철 창 제작',
    description: '정제된 강철로 날카로운 장창을 만든다.',
    inputs: [{ item: 'OreCommon', amount: 5 }, { item: 'OreRare', amount: 1 }],
    output: { item: 'Steel_Lance', amount: 1 },
    vigorCost: 22,
    requiredLocation: 'Moss_Forge',
    colorBonus: [3],
  },
  {
    id: 'forge_wind_blade',
    name: '바람의 검 제작',
    description: '바람의 기운을 담아 가벼운 검을 단련한다.',
    inputs: [{ item: 'OreCommon', amount: 4 }, { item: 'OreRare', amount: 2 }],
    output: { item: 'Wind_Blade', amount: 1 },
    vigorCost: 25,
    requiredLocation: 'Moss_Forge',
    colorBonus: [5, 3],
  },
  {
    id: 'forge_flame_edge',
    name: '화염검 제작',
    description: '트리플라워 화산의 용암으로 불꽃의 검을 단련한다.',
    inputs: [{ item: 'OreRare', amount: 4 }, { item: 'OreCommon', amount: 3 }],
    output: { item: 'Flame_Edge', amount: 1 },
    vigorCost: 30,
    requiredLocation: 'Moss_Forge',
    colorBonus: [0, 3],
  },
  {
    id: 'forge_wooden_shield',
    name: '나무 방패 제작',
    description: '단단한 나무를 깎아 기본 방패를 만든다.',
    inputs: [{ item: 'OreCommon', amount: 2 }],
    output: { item: 'Wooden_Shield', amount: 1 },
    vigorCost: 10,
    requiredLocation: 'Moss_Forge',
    colorBonus: [4],
  },
  {
    id: 'forge_leather_armor',
    name: '가죽 갑옷 제작',
    description: '가죽을 다듬어 기본적인 방어구를 만든다.',
    inputs: [{ item: 'OreCommon', amount: 2 }, { item: 'MonsterLoot', amount: 2 }],
    output: { item: 'Leather_Armor', amount: 1 },
    vigorCost: 15,
    requiredLocation: 'Moss_Forge',
    colorBonus: [4, 3],
  },
  {
    id: 'forge_heavy_gauntlet',
    name: '강철 건틀릿 제작',
    description: '손등을 보호하는 강철 건틀릿을 만든다.',
    inputs: [{ item: 'OreCommon', amount: 3 }, { item: 'OreRare', amount: 1 }],
    output: { item: 'Heavy_Gauntlet', amount: 1 },
    vigorCost: 18,
    requiredLocation: 'Moss_Forge',
    colorBonus: [3],
  },
  {
    id: 'forge_guardian_shield',
    name: '수호자의 방패 제작',
    description: '경비대 규격의 견고한 방패를 만든다.',
    inputs: [{ item: 'OreCommon', amount: 4 }, { item: 'OreRare', amount: 1 }],
    output: { item: 'Guardian_Shield', amount: 1 },
    vigorCost: 20,
    requiredLocation: 'Moss_Forge',
    colorBonus: [3],
  },

  // --- 카요 공방 (고급 장비) ---
  {
    id: 'dragon_forge_valencia_replica',
    name: '발렌시아 복제창 제작',
    description: '카요의 화염으로 발렌시아의 창을 복제한다.',
    inputs: [{ item: 'OreRare', amount: 6 }, { item: 'OreCommon', amount: 5 }],
    output: { item: 'Valencia_Replica', amount: 1 },
    vigorCost: 35,
    requiredLocation: 'Manonickla_Forge',
    colorBonus: [3, 0],
  },
  {
    id: 'dragon_forge_construct_shell',
    name: '인공물 외장 제작',
    description: '에니참 기술 데이터를 기반으로 인공 갑옷을 만든다.',
    inputs: [{ item: 'OreRare', amount: 8 }, { item: 'OreCommon', amount: 4 }],
    output: { item: 'Construct_Shell', amount: 1 },
    vigorCost: 40,
    requiredLocation: 'Manonickla_Forge',
    colorBonus: [2, 3],
  },
];

// ============================================================
// 내부 헬퍼: ItemType 이름 → ItemType 변환
// ============================================================

type ItemRef = { kind: 'category'; type: ItemType } | { kind: 'id'; id: string };

function isItemTypeKey(itemKey: string): boolean {
  switch (itemKey.trim()) {
    case 'Food':
    case 'Herb':
    case 'OreCommon':
    case 'OreRare':
    case 'MonsterLoot':
    case 'Potion':
    case 'Equipment':
    case 'GuildCard':
      return true;
    default:
      return false;
  }
}

function resolveItemRef(itemKey: string): ItemRef {
  return isItemTypeKey(itemKey)
    ? { kind: 'category', type: parseItemType(itemKey) }
    : { kind: 'id', id: itemKey };
}

function getHeldAmount(actor: Actor, itemKey: string): number {
  const ref = resolveItemRef(itemKey);
  return ref.kind === 'category'
    ? actor.getItemCountByType(ref.type)
    : actor.getItemCount(ref.id);
}

function removeHeld(actor: Actor, itemKey: string, amount: number): void {
  const ref = resolveItemRef(itemKey);
  if (ref.kind === 'category') {
    actor.consumeItem(ref.type, amount);
  } else {
    actor.removeItemById(ref.id, amount);
  }
}

function addHeld(actor: Actor, itemKey: string, amount: number): void {
  const ref = resolveItemRef(itemKey);
  if (ref.kind === 'category') {
    actor.addItem(ref.type, amount);
  } else {
    actor.addItemById(ref.id, amount);
  }
}

function getItemLabel(itemKey: string): string {
  const ref = resolveItemRef(itemKey);
  if (ref.kind === 'category') return categoryName(ref.type);
  return getItemDef(ref.id)?.name ?? ref.id;
}

// ============================================================
// 공개 API
// ============================================================

/** 전체 레시피 목록 반환 */
export function getAllRecipes(): CraftRecipe[] {
  return RECIPES;
}

/**
 * 현재 장소와 보유 재료를 기준으로 제작 가능한 레시피 목록 반환.
 * requiredLocation 이 설정된 레시피는 해당 장소에서만 표시된다.
 * 재료가 완전히 충족된 레시피만 반환한다.
 */
export function getAvailableRecipes(actor: Actor, location: string): CraftRecipe[] {
  return RECIPES.filter(recipe => {
    // 장소 제약 확인
    if (recipe.requiredLocation && recipe.requiredLocation !== location) {
      return false;
    }

    // 모든 재료 충족 여부 확인
    for (const input of recipe.inputs) {
      if (getHeldAmount(actor, input.item) < input.amount) {
        return false;
      }
    }

    return true;
  });
}

export interface CraftCheck {
  possible: boolean;
  reason?: string;
}

/**
 * 레시피 제작 가능 여부와 불가 이유 반환.
 * 장소 제약은 여기서 검사하지 않는다 — 호출측이 location 을 별도로 처리한다.
 */
export function canCraft(actor: Actor, recipe: CraftRecipe): CraftCheck {
  // TP 확인
  const tpCost = Math.ceil(recipe.vigorCost / 10);
  if (!actor.hasAp(tpCost)) {
    return {
      possible: false,
      reason: `TP가 부족하다. (필요: ${tpCost}, 현재: ${actor.base.ap})`,
    };
  }

  // 재료 확인
  for (const input of recipe.inputs) {
    const held = getHeldAmount(actor, input.item);
    if (held < input.amount) {
      return {
        possible: false,
        reason: `재료가 부족하다: ${getItemLabel(input.item)} ×${input.amount} (보유: ${held})`,
      };
    }
  }

  return { possible: true };
}

export interface CraftResult {
  success: boolean;
  message: string;
  bonusYield: boolean;
}

/**
 * 제작 실행.
 * - 입력 재료 소모
 * - TP 소모
 * - 출력 아이템 추가
 * - 색상 친화도 보너스 수율 (colorBonus 원소의 값 > 0.6 이면 30% 확률로 +1)
 */
export function executeCraft(actor: Actor, recipe: CraftRecipe, bagCapacity?: number): CraftResult {
  const check = canCraft(actor, recipe);
  if (!check.possible) {
    return { success: false, message: check.reason ?? '제작할 수 없다.', bonusYield: false };
  }

  // 출력 아이템이 개별 아이템(ID)인 경우 인벤토리 공간 확인
  if (bagCapacity !== undefined) {
    const ref = resolveItemRef(recipe.output.item);
    if (ref.kind === 'id' && actor.isBagFull(bagCapacity, ref.id)) {
      return { success: false, message: '⚠ 인벤토리가 가득 찼습니다!', bonusYield: false };
    }
  }

  // 재료 소모
  for (const input of recipe.inputs) {
    removeHeld(actor, input.item, input.amount);
  }

  // TP 소모
  actor.adjustAp(-Math.ceil(recipe.vigorCost / 10));

  // 기본 출력량 계산
  let outputAmount = recipe.output.amount;

  // 색상 친화도 보너스 수율
  let bonusYield = false;
  if (recipe.colorBonus && recipe.colorBonus.length > 0) {
    for (const elemIdx of recipe.colorBonus) {
      const colorVal = actor.color.values[elemIdx] ?? 0;
      if (colorVal > 0.6 && Math.random() < 0.3) {
        outputAmount += 1;
        bonusYield = true;
        break;
      }
    }
  }

  // 출력 아이템 추가
  addHeld(actor, recipe.output.item, outputAmount);

  // 결과 메시지
  const baseMsg = `${recipe.name}을(를) 제작했다. (${getItemLabel(recipe.output.item)} ×${recipe.output.amount})`;
  const message = bonusYield
    ? `${baseMsg} ✦ 친화력 보너스! 추가로 1개를 더 얻었다.`
    : baseMsg;

  return { success: true, message, bonusYield };
}
