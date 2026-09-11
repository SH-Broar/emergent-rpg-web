import type { Card } from '@/data/schemas';
import { gestureDefinition } from './gesture-catalog';
import { statusLabel } from './labels';
import { scaledValue } from './enhance';

export const SKILL_GESTURES = ['corner','angle','triangle','inverted','circle','square','diamond','star'] as const;
export type SkillGesture = typeof SKILL_GESTURES[number];
export const skillEffects = (card: Card) => card.magic?.effects ?? card.effects;
export const skillFamily = (card: Card) => card.magic?.family ?? card.id.replace(/-plus$/, '');
export const skillStrokes = (card: Card) => card.magic?.strokes ?? (card.rank === 'legendary' ? 5 : card.rank === 'rare' ? 4 : card.cost >= 2 ? 3 : 2);
export const skillMana = (card: Card) => Math.max(1, Math.ceil(card.magic?.mana ?? card.cost) - (card.skillUpgrades?.efficiency ?? 0));
export const skillCooldown = (card: Card) => Math.max(1,
  (card.magic?.cooldown ?? Math.max(1,Math.ceil(card.magic?.mana ?? card.cost))*2) -
  (card.skillUpgrades?.recovery ?? 0) +
  (skillEffects(card).some(e=>e.kind === 'exhaust-self') ? 6 : 0) -
  (skillEffects(card).some(e=>e.kind === 'return-self-to-hand') ? 1 : 0));
export const skillReach = (card: Card) => (card.aimRange ?? 3) + (card.skillUpgrades?.reach ?? 0);
export const skillCastTurns = (card: Card) => card.castSpeed === 'slow' ? 2 : card.castSpeed === 'fast' ? 0 : 1;
export function skillFitsGesture(card: Card, gesture: string): boolean {
  return SKILL_GESTURES.includes(gesture as SkillGesture) &&
    (gestureDefinition(gesture)?.strokes ?? 0) >= skillStrokes(card) &&
    (!card.magic?.glyphs?.length || card.magic.glyphs.includes(gesture));
}
export const skillValue = (value: number, card: Card, multiplier=1) => Math.floor(scaledValue(value,card)*multiplier);
/** Player-facing semantics of the port; never show obsolete hand instructions. */
export function skillEffectText(card: Card): string[] {
  return skillEffects(card).map(e => {
    const v=e.value??0,n=skillValue(v,card);
    const simple:Record<string,string>={damage:'기본 피해 '+n,heal:'회복 '+n,block:'기본 방어 '+n,
      'break-armor':'방어 파괴','ghost-self':'유령화 '+v+'턴','grant-airborne':'비행 '+v+'턴',
      'move-self':'이동 '+v+'칸','push-enemy':'밀기 '+v+'칸','pull-enemy':'끌기 '+v+'칸',
      'terrain-water':'물 퍼뜨리기','terrain-fire':'불 퍼뜨리기','terrain-smoke':'연기 퍼뜨리기',
      draw:'다른 기술 재사용 −'+Math.min(2,v)+'턴','return-hand-to-deck':'다른 기술 재사용 −2턴',
      'draw-if-color':'컬러 조건 충족 시 다른 기술 재사용 단축',
      'exhaust-self':'사용 후 재사용 +6턴','return-self-to-hand':'재사용 −1턴',
      'damage-per-hand':'준비된 다른 기술 수 ×'+n+' 피해','heal-per-hand':'준비된 다른 기술 수 ×'+n+' 회복',
      'damage-low-hand':'피해 '+n+' · 준비된 다른 기술 '+Number(e.params?.threshold??2)+'개 이하이면 두 배',
      'damage-per-cards-played':'최근 3턴 사용 기술 수 ×'+n+' 피해',
      'next-card-double':'다음 기술 위력 두 배 · 4턴 내 사용','hand-cost-down':'다음 기술 마나 −'+v+' · 4턴 내 사용',
      'next-turn-energy':'다음 턴 마나 +'+v,'this-turn-amp':'다음 기술 위력 +'+v+'% · 4턴 내 사용',
      'damage-min-color':'최저 컬러 ×'+v+' 피해','damage-top-color':'최고 컬러 ×'+v+' 피해',
      'damage-color-count':'컬러 수 ×'+v+' 피해','block-top-color':'최고 컬러 ×'+v+' 방어',
      'damage-per-debuff':'약화 수치 ×'+n+' 피해','consume-vulnerable':'취약 소모 피해','consume-burn':'화상 소모 피해','consume-poison':'독 소모 피해',
      'damage-from-hp':'체력을 써서 공격','damage-per-confine':'막힌 인접 칸마다 추가 피해','block-to-damage':'방어에 비례한 피해',
      'adaptive-strike':'방어 중이면 공격, 아니면 방어','spend-all-energy':'모든 마나로 공격','damage-per-relic':'유물 수에 비례한 피해',
      'double-block':'방어 두 배','heavy-blade':'힘에 비례한 피해'};
    if(e.kind==='apply-status')return statusLabel(String(e.params?.status ?? '상태'))+' '+v;
    return simple[e.kind]??'특수 효과';
  });
}

export const skillHasPower = (card:Card) => skillEffects(card).some(e => ['damage','heal','block','damage-per-hand','heal-per-hand','damage-low-hand','damage-per-cards-played','damage-min-color','damage-top-color','damage-color-count','block-top-color','damage-per-confine','damage-per-relic','block-to-damage','double-block','spend-all-energy','damage-from-hp','adaptive-strike','heavy-blade','damage-per-debuff','consume-vulnerable','consume-burn','consume-poison'].includes(e.kind));
