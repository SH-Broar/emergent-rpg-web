// ============================================================
// location.ts — LocationID 타입 + 상수
// 원본: Types.h:122-152
// ============================================================

export type LocationID = string;

export const Loc = {
  Town_Elimes: 'Town_Elimes',
  Guild_Hall: 'Guild_Hall',
  Market_Square: 'Market_Square',
  Tavern: 'Tavern',
  Wilderness: 'Wilderness',
  Blacksmith: 'Blacksmith',
  Herb_Garden: 'Herb_Garden',
  Church: 'Church',
  Lake: 'Lake',
  Mountain_Path: 'Mountain_Path',
  Wizard_Tower: 'Wizard_Tower',
  Farm: 'Farm',
  Trade_Route: 'Trade_Route',
  Memory_Spring: 'Memory_Spring',
  Limun_Ruins: 'Limun_Ruins',
  Dungeon_Entrance: 'Dungeon_Entrance',
  Dungeon_Interior: 'Dungeon_Interior',
  Abandoned_Mine: 'Abandoned_Mine',
  Bandit_Hideout: 'Bandit_Hideout',
  Falcon_Garden: 'Falcon_Garden',
  Starfall_Basin: 'Starfall_Basin',
  Mirage_Oasis: 'Mirage_Oasis',
  Twilight_Spire: 'Twilight_Spire',
  Ancient_Tree_Crown: 'Ancient_Tree_Crown',
  Crystal_Cavern: 'Crystal_Cavern',
} as const;

export function parseLocationID(s: string): LocationID {
  const trimmed = s.trim();
  return trimmed.length === 0 ? Loc.Town_Elimes : trimmed;
}
