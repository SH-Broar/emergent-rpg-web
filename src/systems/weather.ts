// weather.ts — 날씨 시스템
// 원본: (신규) 계절별 날씨 확률 + 날씨 효과

import { Weather, Season } from '../types/enums';
import { Loc } from '../types/location';

// ============================================================
// WeatherEffect
// ============================================================

export interface WeatherEffect {
  outdoorActivityMod: number; // multiplier for outdoor actions
  indoorActivityMod: number;  // multiplier for indoor actions
  moodEffect: number;         // mood adjustment per tick (per 5-min factor=1)
  vigorDrainMod: number;      // vigor drain multiplier (1.0 = normal)
  description: string;        // atmospheric flavor text
}

// ============================================================
// Weather effect table
// ============================================================

const WEATHER_EFFECTS: Record<Weather, WeatherEffect> = {
  [Weather.Clear]: {
    outdoorActivityMod: 1.1,
    indoorActivityMod: 0.9,
    moodEffect: 0.01,
    vigorDrainMod: 0.9,
    description: '맑은 하늘 아래 기분이 상쾌하다',
  },
  [Weather.Cloudy]: {
    outdoorActivityMod: 1.0,
    indoorActivityMod: 1.0,
    moodEffect: 0,
    vigorDrainMod: 1.0,
    description: '구름이 낀 평화로운 날이다',
  },
  [Weather.Rain]: {
    outdoorActivityMod: 0.7,
    indoorActivityMod: 1.3,
    moodEffect: 0.02,
    vigorDrainMod: 1.1,
    description: '빗소리가 포근하게 들린다',
  },
  [Weather.Storm]: {
    outdoorActivityMod: 0.4,
    indoorActivityMod: 1.4,
    moodEffect: -0.01,
    vigorDrainMod: 1.2,
    description: '폭풍이 몰아치지만 실내는 아늑하다',
  },
  [Weather.Fog]: {
    outdoorActivityMod: 0.8,
    indoorActivityMod: 1.0,
    moodEffect: 0,
    vigorDrainMod: 1.0,
    description: '안개 속에 세상이 신비롭다',
  },
  [Weather.Snow]: {
    outdoorActivityMod: 0.6,
    indoorActivityMod: 1.3,
    moodEffect: 0.03,
    vigorDrainMod: 1.1,
    description: '눈이 내려 세상이 하얗게 물들었다',
  },
  [Weather.Count]: {
    outdoorActivityMod: 1.0,
    indoorActivityMod: 1.0,
    moodEffect: 0,
    vigorDrainMod: 1.0,
    description: '',
  },
};

export function getWeatherEffect(weather: Weather): WeatherEffect {
  return WEATHER_EFFECTS[weather] ?? WEATHER_EFFECTS[Weather.Cloudy];
}

// ============================================================
// Season weather probability tables
// Seasons mapped thematically:
//   Blaze   → Summer  (clear, hot)
//   Frost   → Winter  (snow, cold)
//   Thunder → Autumn  (stormy, fog)
//   Harvest → Spring  (rainy, growth)
//   Radiance→ Spring  (clear, healing)
//   Silence → Winter  (fog, dark)
//
// Each entry: [Weather, cumulative weight (0-100)]
// ============================================================

type WeatherTable = [Weather, number][];

// Summer (Blaze): Clear 45%, Cloudy 20%, Rain 15%, Storm 10%, Fog 8%, Snow 2%
const BLAZE_TABLE: WeatherTable = [
  [Weather.Clear,  45],
  [Weather.Cloudy, 65],
  [Weather.Rain,   80],
  [Weather.Storm,  90],
  [Weather.Fog,    98],
  [Weather.Snow,  100],
];

// Winter (Frost): Clear 20%, Cloudy 25%, Snow 30%, Fog 10%, Rain 10%, Storm 5%
const FROST_TABLE: WeatherTable = [
  [Weather.Clear,  20],
  [Weather.Cloudy, 45],
  [Weather.Snow,   75],
  [Weather.Fog,    85],
  [Weather.Rain,   95],
  [Weather.Storm, 100],
];

// Autumn (Thunder): Clear 25%, Cloudy 30%, Rain 25%, Fog 15%, Storm 3%, Snow 2%
const THUNDER_TABLE: WeatherTable = [
  [Weather.Clear,  25],
  [Weather.Cloudy, 55],
  [Weather.Rain,   80],
  [Weather.Fog,    95],
  [Weather.Storm,  98],
  [Weather.Snow,  100],
];

// Spring (Harvest): Clear 35%, Cloudy 25%, Rain 25%, Fog 10%, Storm 3%, Snow 2%
const HARVEST_TABLE: WeatherTable = [
  [Weather.Clear,  35],
  [Weather.Cloudy, 60],
  [Weather.Rain,   85],
  [Weather.Fog,    95],
  [Weather.Storm,  98],
  [Weather.Snow,  100],
];

// Spring/clear (Radiance): Clear 45%, Cloudy 20%, Rain 15%, Storm 5%, Fog 13%, Snow 2%
const RADIANCE_TABLE: WeatherTable = [
  [Weather.Clear,  45],
  [Weather.Cloudy, 65],
  [Weather.Rain,   80],
  [Weather.Fog,    93],
  [Weather.Storm,  98],
  [Weather.Snow,  100],
];

// Winter/dark (Silence): Clear 20%, Cloudy 25%, Snow 25%, Fog 15%, Rain 10%, Storm 5%
const SILENCE_TABLE: WeatherTable = [
  [Weather.Clear,  20],
  [Weather.Cloudy, 45],
  [Weather.Snow,   70],
  [Weather.Fog,    85],
  [Weather.Rain,   95],
  [Weather.Storm, 100],
];

const SEASON_WEATHER_TABLES: Record<Season, WeatherTable> = {
  [Season.Blaze]:    BLAZE_TABLE,
  [Season.Frost]:    FROST_TABLE,
  [Season.Thunder]:  THUNDER_TABLE,
  [Season.Harvest]:  HARVEST_TABLE,
  [Season.Radiance]: RADIANCE_TABLE,
  [Season.Silence]:  SILENCE_TABLE,
  [Season.Count]:    HARVEST_TABLE,
};

// ============================================================
// rollDailyWeather
// ============================================================

export function rollDailyWeather(season: Season, _currentWeather: Weather): Weather {
  const table = SEASON_WEATHER_TABLES[season] ?? HARVEST_TABLE;
  const roll = Math.random() * 100;
  for (const [w, threshold] of table) {
    if (roll < threshold) return w;
  }
  return Weather.Cloudy;
}

// ============================================================
// getWeatherFlavorText
// ============================================================

const SEASON_WEATHER_FLAVOR: Partial<Record<Season, Partial<Record<Weather, string>>>> = {
  [Season.Blaze]: {
    [Weather.Clear]: '화염기의 뜨거운 햇살이 내리쬔다',
    [Weather.Storm]: '화염기의 폭풍은 거센 열풍을 동반한다',
    [Weather.Snow]:  '화염기에 눈이 내리다니 — 이상한 날이다',
  },
  [Season.Frost]: {
    [Weather.Snow]:  '빙결기의 눈이 소복소복 쌓여간다',
    [Weather.Clear]: '빙결기의 맑은 하늘은 차갑게 빛난다',
    [Weather.Fog]:   '빙결기 안개가 세상을 희고 고요하게 감싼다',
  },
  [Season.Thunder]: {
    [Weather.Storm]: '뇌명기의 폭풍이 번개와 함께 몰아친다',
    [Weather.Rain]:  '뇌명기의 빗소리가 창문을 두드린다',
    [Weather.Fog]:   '뇌명기 안개 속에서 번개가 멀리 번쩍인다',
  },
  [Season.Harvest]: {
    [Weather.Rain]:  '풍요기의 비가 대지를 촉촉이 적신다',
    [Weather.Clear]: '풍요기의 햇살 아래 들판이 황금빛으로 물든다',
  },
  [Season.Radiance]: {
    [Weather.Clear]: '광명기의 눈부신 햇살이 만물을 비춘다',
    [Weather.Rain]:  '광명기의 단비가 꽃을 피운다',
  },
  [Season.Silence]: {
    [Weather.Snow]:  '침묵기의 눈이 세상의 소리를 삼킨다',
    [Weather.Fog]:   '침묵기 안개가 세상을 적막하게 감싼다',
    [Weather.Clear]: '침묵기의 맑은 밤하늘에 별이 선명하다',
  },
};

export function getWeatherFlavorText(weather: Weather, season: Season): string {
  const seasonFlavor = SEASON_WEATHER_FLAVOR[season];
  if (seasonFlavor) {
    const specific = seasonFlavor[weather];
    if (specific) return specific;
  }
  return WEATHER_EFFECTS[weather]?.description ?? '';
}

// ============================================================
// isOutdoorLocation
// ============================================================

const OUTDOOR_LOCATIONS = new Set<string>([
  Loc.Farm,
  Loc.Erumen_Seoncheon,
  Loc.Tiklit_Range,
  Loc.Cyan_Dunes,
  Loc.Herb_Garden,
  Loc.Ekres,
  Loc.Memory_Spring,
  Loc.Limun_Ruins,
  Loc.Dungeon_Entrance,
  Loc.Falcon_Garden,
]);

export function isOutdoorLocation(locationId: string): boolean {
  return OUTDOOR_LOCATIONS.has(locationId);
}
