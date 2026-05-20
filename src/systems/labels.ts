/**
 * UI 표시용 한글 라벨 — 데이터/코드 식별자를 화면 텍스트로 변환.
 *
 * 원칙: 화면에 *raw 코드*(damage, apply-status, insight2-50 등)가 보이지 않게 한다.
 * 모든 컴포넌트가 이 모듈을 거쳐 라벨을 표시.
 */

import type { CardEffect } from '@/data/schemas';

/**
 * 카드 효과 종류(CardEffectKind) → 한글 *간결 라벨*.
 *
 * 자세한 설명은 툴팁(CARD_EFFECT_DESCRIPTIONS)이 담으므로, 라벨은 짧게 유지한다.
 */
const CARD_EFFECT_KIND_LABELS: Record<string, string> = {
  damage: '피해',
  'damage-min-color': '최소색 타격',
  heal: '회복',
  block: '방어',
  draw: '드로우',
  'apply-status': '상태 부여',
  'return-hand-to-deck': '되돌리기',
  'next-turn-energy': '예비 마나',
  'growing-block': '성장 방어',
  'damage-top-color': '최고색 타격',
  'damage-color-count': '다색 타격',
  'block-top-color': '최고색 방어',
  'draw-if-color': '조건 드로우',
  'damage-per-debuff': '약점 타격',
  'consume-vulnerable': '취약 폭발',
  'damage-from-hp': '피의 대가',
  'damage-per-hand': '패 타격',
  'exhaust-self': '소멸',
  'block-to-damage': '돌파',
  'spend-all-energy': '전력',
  'damage-per-companion': '동행 타격',
  'damage-per-relic': '수집 타격',
  'growing-damage': '성장 피해',
  'heal-per-hand': '패 회복',
  'next-card-double': '메아리',
};

/**
 * 카드 효과 종류 → *툴팁용 상세 설명*. 라벨이 간결한 만큼 의미를 여기서 보강.
 * apply-status는 status별 설명(STATUS_DESCRIPTIONS)으로 대체된다.
 */
const CARD_EFFECT_DESCRIPTIONS: Record<string, string> = {
  damage: '적에게 피해를 줍니다.',
  'damage-min-color': '8 컬러 중 가장 낮은 값 × 수치만큼 피해(보강 무시).',
  heal: '잃은 HP를 회복합니다.',
  block: '이번 턴 피해를 막는 방어막.',
  draw: '덱에서 카드를 뽑습니다.',
  'return-hand-to-deck': '손패 맨 오른쪽 1장을 덱 맨 위로 올립니다.',
  'next-turn-energy': '다음 턴 시작 마나가 수치만큼 늘어납니다.',
  'growing-block': '방어막. 쓸 때마다 이 카드의 방어가 +1씩 누적됩니다.',
  'damage-top-color': '8 컬러 중 가장 높은 값 × 수치만큼 피해.',
  'damage-color-count': '0보다 큰 컬러 종류 수 × 수치만큼 피해.',
  'block-top-color': '8 컬러 중 가장 높은 값 × 수치만큼 방어.',
  'draw-if-color': '특정 컬러가 임계 이상이면 추가로 카드를 뽑습니다.',
  'damage-per-debuff': '적이 가진 디버프 스택 총합 × 수치 + 기본 피해.',
  'consume-vulnerable': '적의 취약 스택을 모두 없애고, 없앤 만큼 × 수치 추가 피해.',
  'damage-from-hp': '자기 HP를 지불하고 그 곱절로 피해를 줍니다.',
  'damage-per-hand': '현재 손패 수 × 수치만큼 피해.',
  'exhaust-self': '사용 후 이번 전투에서 사라집니다(소멸).',
  'block-to-damage': '현재 방어막 × 수치만큼 추가 피해. 방어막은 사라지지 않습니다.',
  'spend-all-energy': '남은 마나를 전부 소비해 소비량 × 수치만큼 피해.',
  'damage-per-companion': '동료 수 × 수치만큼 피해.',
  'damage-per-relic': '보유 유물 수 × 수치만큼 피해.',
  'growing-damage': '피해. 쓸 때마다 이 카드의 피해가 +1씩 누적됩니다.',
  'heal-per-hand': '현재 손패 수 × 수치만큼 회복.',
  'next-card-double': '다음에 쓰는 카드 1장의 모든 수치가 2배가 됩니다.',
};

/** 상태이상/버프 키 → *툴팁용 상세 설명*. */
const STATUS_DESCRIPTIONS: Record<string, string> = {
  vulnerable: '받는 피해가 1.5배가 됩니다.',
  weakness: '주는 피해가 0.75배가 됩니다.',
  poison: '턴이 끝날 때마다 스택만큼 HP 피해를 입고, 스택이 1 줄어듭니다.',
  feral: '공격력이 2배가 되지만 방어를 쌓을 수 없습니다. 매 턴 1씩 감소.',
  regress: '컬러 보너스(ATK/DEF/MAG)를 받지 못합니다. 매 턴 1씩 감소.',
  strength: '주는 피해가 스택만큼 늘어납니다.',
  dexterity: '방어가 스택만큼 늘어납니다.',
  frail: '쌓는 방어가 스택만큼 줄어듭니다.',
  burn: '화상 — 지속 피해 계열.',
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

/** 상태이상/버프 *툴팁 설명*. 미상 키는 빈 문자열. */
export function statusDescription(name: string | undefined): string {
  if (!name) return '';
  return STATUS_DESCRIPTIONS[name] ?? '';
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

/**
 * 카드 효과 *툴팁 설명*. apply-status는 부여하는 상태의 설명으로 대체된다.
 * 예: apply-status(status=poison) → "턴이 끝날 때마다 …".
 */
export function cardEffectDescription(effect: CardEffect): string {
  if (effect.kind === 'apply-status') {
    const st = effect.params?.status as string | undefined;
    return statusDescription(st) || '상태를 부여합니다.';
  }
  return CARD_EFFECT_DESCRIPTIONS[effect.kind] ?? '';
}

/** 게이지 키 → 한글 (사용자 정의: hyperion=히페리온, insight=해석, composite=종합). */
const GAUGE_LABELS: Record<string, string> = {
  hyperion1: '히페리온',
  hyperion2: '히페리온',
  insight1: '해석',
  insight2: '해석',
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
 *  - `insight2-50` → "해석 50% 도달"
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
