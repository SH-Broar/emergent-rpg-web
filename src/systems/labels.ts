/**
 * UI 표시용 한글 라벨 — 데이터/코드 식별자를 화면 텍스트로 변환.
 *
 * 원칙: 화면에 *raw 코드*(damage, apply-status, insight2-50 등)가 보이지 않게 한다.
 * 모든 컴포넌트가 이 모듈을 거쳐 라벨을 표시.
 */

import type { CardEffect } from '@/data/schemas';

/** 카드 효과 종류(CardEffectKind) → 한글. */
const CARD_EFFECT_KIND_LABELS: Record<string, string> = {
  damage: '피해',
  'damage-min-color': '최소 컬러 피해',
  heal: '회복',
  block: '방어',
  draw: '드로우',
  'apply-status': '상태 부여',
  'return-hand-to-deck': '패를 덱 위로',
  'next-turn-energy': '다음 턴 마나',
  'growing-block': '방어(성장)',
  'damage-top-color': '최고 컬러 피해',
  'damage-color-count': '컬러 종류 피해',
  'block-top-color': '최고 컬러 방어',
  'draw-if-color': '컬러 조건 드로우',
  'damage-per-debuff': '디버프당 피해',
  'consume-vulnerable': '취약 소모 피해',
  'damage-from-hp': '체력 대가 피해',
  'damage-per-hand': '패당 피해',
  'exhaust-self': '소멸',
  'block-to-damage': '방어를 피해로',
  'spend-all-energy': '마나 전부 피해',
  'damage-per-companion': '동료당 피해',
  'damage-per-relic': '유물당 피해',
  'growing-damage': '피해(성장)',
  'heal-per-hand': '패당 회복',
  'next-card-double': '다음 카드 2배',
};

/** 상태이상/버프 키 → 한글. */
const STATUS_LABELS: Record<string, string> = {
  strength: '힘',
  weakness: '약화',
  dexterity: '민첩',
  frail: '취약',
  vulnerable: '취약',
  poison: '중독',
  burn: '화상',
  feral: '수화',
  regress: '퇴행',
};

/** 효과 대상 → 한글. */
const TARGET_LABELS: Record<string, string> = {
  self: '자신',
  enemy: '적',
  'all-enemies': '적 전체',
  'random-enemy': '무작위 적',
};

export function statusLabel(name: string | undefined): string {
  if (!name) return '';
  return STATUS_LABELS[name] ?? name;
}

export function effectTargetLabel(target: string | undefined): string {
  if (!target) return '';
  return TARGET_LABELS[target] ?? target;
}

/**
 * 카드 효과 *종류* 한글. apply-status는 부여하는 상태 이름을 녹여서 보여준다.
 * 예: apply-status(status=vulnerable) → "취약 부여".
 */
export function cardEffectKindLabel(effect: CardEffect): string {
  if (effect.kind === 'apply-status') {
    const st = effect.params?.status as string | undefined;
    return st ? `${statusLabel(st)} 부여` : '상태 부여';
  }
  return CARD_EFFECT_KIND_LABELS[effect.kind] ?? effect.kind;
}

/** 게이지 키 → 한글 (사용자 정의: hyperion=히페리온, insight=연구, composite=종합). */
const GAUGE_LABELS: Record<string, string> = {
  hyperion1: '히페리온',
  hyperion2: '히페리온',
  insight1: '연구',
  insight2: '연구',
  composite: '종합',
};

/** 콘텐츠 종류 prefix → 한글. */
const UNLOCK_KIND_LABELS: Record<string, string> = {
  race: '종족',
  card: '카드',
  timeline: '연표',
  character: '인물',
};

/**
 * 해금/진행 키 → 한글.
 *  - `insight2-50` → "연구 50% 도달"
 *  - `unlock-race-human` → "종족 해금"
 *  - 그 외 미상 키는 그대로 (최후 폴백).
 */
export function unlockKeyLabel(key: string): string {
  const gauge = /^(hyperion1|hyperion2|insight1|insight2|composite)-(\d+)$/.exec(key);
  if (gauge) return `${GAUGE_LABELS[gauge[1]]} ${gauge[2]}% 도달`;
  const unlock = /^unlock-(race|card|timeline|character)-(.+)$/.exec(key);
  if (unlock) return `${UNLOCK_KIND_LABELS[unlock[1]] ?? unlock[1]} 해금`;
  return key;
}
