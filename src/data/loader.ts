// ============================================================
// loader.ts — fetch() 기반 데이터 파일 로더
// 원본: GameData.cpp의 InitAll 흐름 대응
// ============================================================

import { DataSection, loadFileFromText } from './parser';

const DATA_BASE = './data';

/**
 * 단일 텍스트 파일을 fetch. 없으면 null 반환.
 */
async function fetchText(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * 기본 파일 + 확장 파일(+tag)을 함께 로드하여 DataSection[] 반환.
 * 예: loadDataFile('actors') → actors.txt + actors+first.txt + actors+extra.txt + ...
 */
export async function loadDataFile(
  baseName: string,
  addonTags: string[] = [],
): Promise<DataSection[]> {
  const baseText = await fetchText(`${DATA_BASE}/${baseName}.txt`);
  if (baseText === null) return [];

  const addonTexts: string[] = [];
  for (const tag of addonTags) {
    const text = await fetchText(`${DATA_BASE}/${baseName}+${tag}.txt`);
    if (text !== null) addonTexts.push(text);
  }

  return loadFileFromText(baseText, addonTexts);
}

/** 알려진 확장 파일 태그 매핑 */
const ADDON_TAGS: Record<string, string[]> = {
  actors: ['first', 'extra', 'newrace'],
  locations: ['rdc'],
};

/**
 * 전체 데이터 로딩 — GameData::InitAll 대응.
 * 각 파일을 로드하여 파싱된 DataSection 맵으로 반환.
 */
export interface GameDataFiles {
  items: DataSection[];
  locations: DataSection[];
  actors: DataSection[];
  events: DataSection[];
  dialogues: DataSection[];
  dungeons: DataSection[];
  monsters: DataSection[];
  dungeonEvents: DataSection[];
  combatBehavior: DataSection[];
  activities: DataSection[];
  productions: DataSection[];
  hyperion: DataSection[];
  titles: DataSection[];
  giftPreferences: DataSection[];
  weapons: DataSection[];
  armor: DataSection[];
  lore: DataSection[];
  diagnostic: DataSection[];
}

export async function loadAllData(): Promise<GameDataFiles> {
  const [
    items, locations, actors, events, dialogues,
    dungeons, monsters, dungeonEvents, combatBehavior,
    activities, productions, hyperion, titles,
    giftPreferences, weapons, armor, lore, diagnostic,
  ] = await Promise.all([
    loadDataFile('items'),
    loadDataFile('locations', ADDON_TAGS.locations ?? []),
    loadDataFile('actors', ADDON_TAGS.actors ?? []),
    loadDataFile('events'),
    loadDataFile('dialogues'),
    loadDataFile('dungeons'),
    loadDataFile('monsters'),
    loadDataFile('dungeon_events'),
    loadDataFile('combat_behavior'),
    loadDataFile('activities'),
    loadDataFile('productions'),
    loadDataFile('hyperion'),
    loadDataFile('titles'),
    loadDataFile('gift_preferences'),
    loadDataFile('weapons'),
    loadDataFile('armor'),
    loadDataFile('lore'),
    loadDataFile('diagnostic'),
  ]);

  return {
    items, locations, actors, events, dialogues,
    dungeons, monsters, dungeonEvents, combatBehavior,
    activities, productions, hyperion, titles,
    giftPreferences, weapons, armor, lore, diagnostic,
  };
}
