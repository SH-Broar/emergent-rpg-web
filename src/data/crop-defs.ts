// crop-defs.ts — 작물 정의 (성장 시간, 기본가, 계절/날씨 보너스)

import { Season, Weather } from '../types/enums';

export interface CropDef {
  id: string;
  name: string;
  basePrice: number;
  growthDays: number;
  /** season enum value -> bonus multiplier (e.g. 0.2 = +20%) */
  seasonBonus: Partial<Record<number, number>>;
  /** weather enum value -> bonus multiplier */
  weatherBonus: Partial<Record<number, number>>;
  /** 지역 특산물이면 true */
  regional: boolean;
  /** regional=true일 때 재배 가능 locationId 목록 */
  regionIds: string[];
}

export const CROP_DEFS: CropDef[] = [
  {
    id: 'wheat',
    name: '밀',
    basePrice: 30,
    growthDays: 2,
    seasonBonus: { [Season.Harvest]: 0.2 },
    weatherBonus: {},
    regional: false,
    regionIds: [],
  },
  {
    id: 'carrot',
    name: '당근',
    basePrice: 50,
    growthDays: 3,
    seasonBonus: { [Season.Radiance]: 0.2 },
    weatherBonus: {},
    regional: false,
    regionIds: [],
  },
  {
    id: 'herb',
    name: '약초',
    basePrice: 80,
    growthDays: 4,
    seasonBonus: { [Season.Blaze]: 0.2 },
    weatherBonus: {},
    regional: false,
    regionIds: [],
  },
  {
    id: 'mushroom',
    name: '버섯',
    basePrice: 60,
    growthDays: 2,
    seasonBonus: {},
    weatherBonus: { [Weather.Rain]: 0.3 },
    regional: false,
    regionIds: [],
  },
  // 지역 특산물
  {
    id: 'starbloom',
    name: '별빛꽃',
    basePrice: 150,
    growthDays: 5,
    seasonBonus: { [Season.Radiance]: 0.3 },
    weatherBonus: {},
    regional: true,
    regionIds: ['Halpia', 'Alimes_High'],
  },
  {
    id: 'ironshroom',
    name: '철 버섯',
    basePrice: 120,
    growthDays: 5,
    seasonBonus: {},
    weatherBonus: {},
    regional: true,
    regionIds: ['Enicham', 'Moss_Forge'],
  },
  {
    id: 'mana_grass',
    name: '마나 풀',
    basePrice: 130,
    growthDays: 5,
    seasonBonus: { [Season.Silence]: 0.3 },
    weatherBonus: {},
    regional: true,
    regionIds: ['Luna_Academy'],
  },
  {
    id: 'sea_kelp',
    name: '해초',
    basePrice: 100,
    growthDays: 5,
    seasonBonus: {},
    weatherBonus: { [Weather.Rain]: 0.4 },
    regional: true,
    regionIds: ['Martin_Port'],
  },
  {
    id: 'forest_berry',
    name: '숲 열매',
    basePrice: 110,
    growthDays: 5,
    seasonBonus: { [Season.Harvest]: 0.3 },
    weatherBonus: {},
    regional: true,
    regionIds: ['Lar_Forest'],
  },
  {
    id: 'spice_root',
    name: '향신 뿌리',
    basePrice: 90,
    growthDays: 5,
    seasonBonus: { [Season.Blaze]: 0.3 },
    weatherBonus: {},
    regional: true,
    regionIds: ['Manonickla'],
  },
  {
    id: 'golden_grain',
    name: '황금 곡물',
    basePrice: 140,
    growthDays: 5,
    seasonBonus: { [Season.Harvest]: 0.4 },
    weatherBonus: {},
    regional: true,
    regionIds: ['Alimes', 'Farm'],
  },
];

export function getCropDef(id: string): CropDef | undefined {
  return CROP_DEFS.find(c => c.id === id);
}

export function getAvailableCrops(locationId: string): CropDef[] {
  return CROP_DEFS.filter(c =>
    !c.regional || c.regionIds.includes(locationId)
  );
}
