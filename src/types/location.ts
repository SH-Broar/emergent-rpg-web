// ============================================================
// location.ts — LocationID 타입 + 상수
// 원본: Types.h:122-152
// ============================================================

export type LocationID = string;

export const Loc = {
  // === 알리메스 권역 (locations.txt) ===
  Alimes: 'Alimes',
  Alimes_High: 'Alimes_High',
  Guild_Hall: 'Guild_Hall',
  Guild_Branch: 'Guild_Branch',
  Herb_Garden: 'Herb_Garden',
  Silk_Workshop: 'Silk_Workshop',
  Moonlit_Clearing: 'Moonlit_Clearing',
  Cyan_Dunes: 'Cyan_Dunes',
  Tiklit_Range: 'Tiklit_Range',
  Abandoned_Mine: 'Abandoned_Mine',
  Bandit_Hideout: 'Bandit_Hideout',
  Bagreat: 'Bagreat',
  Reshud_Junction: 'Reshud_Junction',
  Alime_Mountain: 'Alime_Mountain',
  Erumen_Mistwood: 'Erumen_Mistwood',
  Erumen_Seoncheon: 'Erumen_Seoncheon',
  Gelider: 'Gelider',
  Grand_Crack: 'Grand_Crack',
  Ode_Mountain: 'Ode_Mountain',

  // === 일루네온 권역 (locations+rdc.txt) ===
  Iluneon: 'Iluneon',
  Iluneon_Square: 'Iluneon_Square',
  Market_Square: 'Market_Square',
  Kanon: 'Kanon',
  Iluneon_Diner: 'Iluneon_Diner',

  // === 아르케아 가도 ===
  Arukea_1: 'Arukea_1',
  Hanabridge: 'Hanabridge',
  Arukea_2: 'Arukea_2',
  Memory_Spring: 'Memory_Spring',
  Arukea_3: 'Arukea_3',
  Arcadia: 'Arcadia',

  // === 리아그랄타 평원 ===
  Riagralta: 'Riagralta',
  Navrit: 'Navrit',

  // === 라르 포레스트 권역 ===
  Lar_Forest: 'Lar_Forest',
  World_Tree: 'World_Tree',

  // === 모스 권역 ===
  Moss: 'Moss',
  Moss_Forge: 'Moss_Forge',
  Farm: 'Farm',
  Moss_Tavern: 'Moss_Tavern',
  Triflower: 'Triflower',

  // === 타코미 · 에니챰 ===
  Void_Forest: 'Void_Forest',
  Enicham: 'Enicham',
  Tacomi: 'Tacomi',
  Night_Tacomi: 'Night_Tacomi',
  Kazed: 'Kazed',
  Hologram_Field: 'Hologram_Field',
  Bloom_Terrace: 'Bloom_Terrace',
  Tacomi_Cafe: 'Tacomi_Cafe',

  // === 마법학교 루나 ===
  Luna_Academy: 'Luna_Academy',
  Luna_Practice_Hall: 'Luna_Practice_Hall',
  Phantom_Spire: 'Phantom_Spire',

  // === 마틴 항 · 남쪽 바다 ===
  Valkyr_Canal: 'Valkyr_Canal',
  Martin_Port: 'Martin_Port',
  Kishina: 'Kishina',
  Manyu: 'Manyu',
  Halpia: 'Halpia',
  Riel_Sky: 'Riel_Sky',
  Penta: 'Penta',
  Falcon_Garden: 'Falcon_Garden',
  Bug_Sea: 'Bug_Sea',

  // === 마노니클라 권역 ===
  Manonickla: 'Manonickla',
  Manonickla_Forge: 'Manonickla_Forge',
  Limun_Ruins: 'Limun_Ruins',
  Old_Eas: 'Old_Eas',
  Clutch_Gorge: 'Clutch_Gorge',
  Sand_Dunes: 'Sand_Dunes',
  Manonickla_Tavern: 'Manonickla_Tavern',

  // === 외곽 고레벨 ===
  Yusejeria: 'Yusejeria',
  Uppio_Swamp: 'Uppio_Swamp',
  Demon_Castle: 'Demon_Castle',
  Puchi_Tower: 'Puchi_Tower',
  Puchi_Tower_Bar: 'Puchi_Tower_Bar',
  Stella_Ville: 'Stella_Ville',
  Haratikus: 'Haratikus',
  Ikar: 'Ikar',
  Windfall_Valley: 'Windfall_Valley',
  Ekres: 'Ekres',
} as const;

export function parseLocationID(s: string): LocationID {
  const trimmed = s.trim();
  return trimmed.length === 0 ? Loc.Alimes : trimmed;
}
