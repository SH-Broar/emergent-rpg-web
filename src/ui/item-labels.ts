// item-labels.ts — 아이템 카테고리/희귀도/특수효과 i18n 라벨 (UI 레이어)
// types 레이어(item-defs.ts)에서 한국어 UI 문자열을 분리한 결과물.

import { ItemType } from '../types/enums';
import type { ItemRarity } from '../types/item-defs';

/** ItemType enum → 한국어 카테고리 라벨 */
export function categoryName(cat: ItemType): string {
  switch (cat) {
    case ItemType.Food: return '식량';
    case ItemType.Herb: return '약초';
    case ItemType.OreCommon: return '광석';
    case ItemType.OreRare: return '희귀 광석';
    case ItemType.MonsterLoot: return '전리품';
    case ItemType.Potion: return '물약';
    case ItemType.Equipment: return '장비 소재';
    case ItemType.GuildCard: return '특수';
    default: return '기타';
  }
}

/** 희귀도 한국어 라벨 */
export const RARITY_NAMES: Record<ItemRarity, string> = {
  common: '일반',
  uncommon: '고급',
  rare: '희귀',
  epic: '영웅',
  legendary: '전설',
  unique: '유일',
};

/** 희귀도 색상 (HEX) */
export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#aaaaaa',
  uncommon: '#4ecca3',
  rare: '#4ecdc4',
  epic: '#9b59b6',
  legendary: '#ffc857',
  unique: '#e94560',
};

/** specialEffects의 한 키-값 쌍을 사용자에게 보여줄 라벨로 변환 */
export function formatSpecialEffect(key: string, value: number): string {
  const pctPlus = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  switch (key) {
    case 'travelSpeed':
      // 음수 = 이동 시간 감소 = 속도 증가
      return value < 0
        ? `여행 속도 +${Math.round(-value * 100)}%`
        : `여행 속도 -${Math.round(value * 100)}%`;
    case 'gatherBonus':     return `채집 성공률 ${pctPlus(value)}`;
    case 'combatSpeed':     return `전투 속도 +${Math.round(value * 100)}%`;
    case 'hpRegen':         return `방 이동 시 HP ${pctPlus(value)}`;
    case 'mpRegen':         return `방 이동 시 MP ${pctPlus(value)}`;
    case 'tpRegen':         return `다음날 TP 추가 회복 ${pctPlus(value)}`;
    case 'magicPower':      return `마법 위력 ${pctPlus(value)}`;
    case 'goldBonus':       return `판매 가격 ${pctPlus(value)}`;
    case 'storageBonus':    return `창고 용량 ${pctPlus(value)}`;
    case 'blockDialogue':   return '⚠ 대화 불가';
    case 'blockRest':       return '⚠ 휴식/수면 불가';
    case 'critChance':      return `치명타 확률 ${pctPlus(value)}`;
    case 'doubleGather':    return `채집 2배 확률 ${pctPlus(value)}`;
    case 'autoReviveOnce':  return '하루 1회 자동 부활';
    case 'fireResist':      return `화염 저항 ${pctPlus(value)}`;
    case 'waterResist':     return `물 저항 ${pctPlus(value)}`;
    case 'electricResist':  return `전기 저항 ${pctPlus(value)}`;
    case 'ironResist':      return `철 저항 ${pctPlus(value)}`;
    case 'earthResist':     return `흙 저항 ${pctPlus(value)}`;
    case 'windResist':      return `바람 저항 ${pctPlus(value)}`;
    case 'lightResist':     return `빛 저항 ${pctPlus(value)}`;
    case 'darkResist':      return `어둠 저항 ${pctPlus(value)}`;
    default: {
      // 미지정 키는 원문 + 퍼센트로 표시
      const suffix = Math.abs(value) < 1 ? pctPlus(value) : String(value);
      return `${key} ${suffix}`;
    }
  }
}

/** 여러 specialEffects를 한 줄 요약으로 렌더 (빈 객체면 빈 문자열) */
export function formatSpecialEffectsList(effects: Record<string, number> | undefined): string {
  if (!effects) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(effects)) {
    if (!Number.isFinite(v) || v === 0) continue;
    parts.push(formatSpecialEffect(k, v));
  }
  return parts.join(' · ');
}
