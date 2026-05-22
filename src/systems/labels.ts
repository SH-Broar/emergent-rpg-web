/**
 * UI 표시용 한글 라벨 — 데이터/코드 식별자를 화면 텍스트로 변환.
 *
 * 원칙: 화면에 *raw 코드*(damage, apply-status, insight2-50 등)가 보이지 않게 한다.
 * 모든 컴포넌트가 이 모듈을 거쳐 라벨을 표시.
 */

import type { CardEffect, RelicEffect } from '@/data/schemas';

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
  'ghost-self': '흐려지기',
  'curse-tick': '저주 피해',
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
  'ghost-self': '수치만큼 턴 동안 비실체가 됩니다 — 받는·주는 피해가 절반.',
  'curse-tick': '손에 쥐고 있으면 매 턴 시작마다 수치만큼 직접 피해를 입습니다.',
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
  paralyze: '마비 — 다음 턴 행동할 수 없습니다(스킵). 매 발동 시 1 감소.',
  spasm: '경련 — 이번 턴 마나가 0이 됩니다. 매 발동 시 1 감소.',
  sap: '주는 피해와 방어가 스택만큼 줄어듭니다. 매 턴 1 감소.',
  ghost: '비실체 — 받는 피해와 주는 피해가 절반이 됩니다. 매 턴 1 감소.',
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
  paralyze: '마비',
  spasm: '경련',
  sap: '잠식',
  ghost: '유령화',
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

/** 몬스터 의도(intent) 종류 → 한글 동사. UI는 "{라벨} {수치}" 형태로 표시. */
const INTENT_KIND_LABELS: Record<string, string> = {
  attack: '공격',
  defend: '방어',
  buff: '강화',
  debuff: '약화 부여',
  bind: '구속',
  devour: '삼킴',
  web: '거미줄',
  drain: '흡혈',
  'drain-stat': '잠식',
  charge: '기력 모으기',
  'add-card': '잡카드 주입',
  'add-card-draw': '잡카드 주입',
  'add-card-discard': '잡카드 섞기',
  'add-card-hand': '잡카드 쥐어주기',
  obscure: '시야 가리기',
  'cost-up': '비용 교란',
  'force-discard': '드로우 감소',
  'transform-card': '카드 망가뜨리기',
  ghost: '유령화',
};

/**
 * 몬스터 의도 인코딩(예: 'attack:8', 'devour:4:3', 'add-card-draw:c-junk-wound:2')을
 * 사람이 읽는 라벨로. 수치가 의미 있는 종류만 숫자를 덧붙인다.
 */
export function intentLabel(encoded: string | undefined): string {
  if (!encoded) return '';
  const parts = encoded.split(':');
  const kind = parts[0];
  const label = INTENT_KIND_LABELS[kind] ?? kind;
  const n = Number(parts[1]);
  // 공격/흡혈/방어/강화/약화는 수치를 같이 보여줌. 잡카드류는 장수(parts[2])를 보여줌.
  if ((kind === 'attack' || kind === 'defend' || kind === 'buff' || kind === 'drain' || kind === 'charge') && n > 0) {
    return `${label} ${n}`;
  }
  if (kind === 'debuff') {
    const st = statusLabel(parts[2]);
    return st ? `${st} 부여` : label;
  }
  if (kind.startsWith('add-card')) {
    const cnt = Number(parts[2]) || 1;
    return `${label} ×${cnt}`;
  }
  if ((kind === 'force-discard' || kind === 'transform-card' || kind === 'obscure' || kind === 'ghost') && n > 0) {
    return `${label} ${n}`;
  }
  // 거미줄/잠식은 누적/흡수량을 같이 보여줌.
  if ((kind === 'web' || kind === 'drain-stat') && n > 0) {
    return `${label} ${n}`;
  }
  if (kind === 'bind' || kind === 'devour') {
    return label; // 게이지는 grapple 표시에서 별도로.
  }
  return label;
}

/**
 * 몬스터 의도 *상세 설명* — 다음 턴에 무슨 일이 일어나는지(특히 상태이상). 의도 표시 툴팁용.
 * 예: 'debuff:2:weakness' → "약화 2 — 주는 피해가 0.75배가 됩니다."
 */
export function intentDescription(encoded: string | undefined): string {
  if (!encoded) return '';
  const parts = encoded.split(':');
  const kind = parts[0];
  const n = Number(parts[1]) || 0;
  switch (kind) {
    case 'attack': return `공격 — ${n} 피해를 줍니다.`;
    case 'defend': return `방어 — 방어막 ${n}을 얻습니다.`;
    case 'buff': return `강화 — 힘이 ${n} 늘어 이후 공격이 강해집니다.`;
    case 'charge': return `기력을 모읍니다 — 힘 +${n}. 다음 공격이 강해집니다.`;
    case 'drain': return `흡혈 — ${n} 피해를 주고 그만큼 회복합니다.`;
    case 'debuff': {
      const st = parts[2];
      const d = STATUS_DESCRIPTIONS[st ?? ''];
      return `${statusLabel(st)} ${n}${d ? ` — ${d}` : ' 부여'}`;
    }
    case 'bind': return '구속 — 매 턴 손패 일부가 잠깁니다. 발버둥(마나 1)으로 탈출. 방치할수록 잠금이 늘어납니다.';
    case 'devour': return '삼킴 — 매 턴 직접 피해를 입습니다. 발버둥(마나 1)으로 탈출. 방치할수록 피해가 커집니다.';
    case 'web': return `거미줄 — 다음 턴 손패 ${n || 1}장이 묶입니다. 카드를 쓸 때마다 한 겹씩 풀립니다(누적).`;
    case 'drain-stat': return `잠식 — 잠식 ${n || 1}을 걸어 주는 피해와 방어를 깎고, 적이 그만큼 강해집니다. 매 턴 1씩 감소.`;
    case 'obscure': return `시야 가리기 — ${n || 1}턴 동안 손패가 가려집니다(뒷면).`;
    case 'cost-up': return `비용 교란 — ${parts[2] || 2}턴 동안 모든 카드 비용이 ${n || 1} 늘어납니다.`;
    case 'transform-card': return `카드 망가뜨리기 — 손패 ${n || 1}장이 '상처'(쓸 수 없음)로 바뀝니다.`;
    case 'force-discard': return `드로우 감소 — 다음 손패를 ${n || 1}장 적게 뽑습니다.`;
    case 'add-card':
    case 'add-card-draw':
    case 'add-card-discard':
    case 'add-card-hand': {
      const cnt = Number(parts[2]) || 1;
      return `잡카드 ${cnt}장을 덱/손패에 밀어 넣습니다(쓸모없는 카드).`;
    }
    case 'ghost': return `유령화 — ${n || 2}턴 동안 비실체가 됩니다. 받는·주는 피해가 절반(매 턴 1 감소).`;
    case 'change': return '체인지 — 종족·덱이 변신 폼으로 바뀐다. \'본모습\' 카드로 복귀.';
    default: return intentLabel(encoded);
  }
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

// ===== 유물 =====

/** 유물 trigger → 한글 (ShopView·InventoryMenu 공용). */
const RELIC_TRIGGER_LABELS: Record<string, string> = {
  passive: '상시',
  'on-combat-start': '전투 시작 시',
  'on-combat-end': '전투 승리 시',
  'on-node-enter': '노드 진입 시',
  'on-rest': '휴식 시',
  'on-turn-start': '턴 시작 시',
  'on-turn-end': '턴 종료 시',
  'on-card-play': '카드 사용 시',
  'on-card-played-before': '카드 사용 직전',
  'on-card-played-after': '카드 사용 시',
  'on-damage-taken': '피해 받을 시',
  'on-block-gain': '방어 획득 시',
  'on-acquire': '획득 즉시',
  'on-item-use': '아이템 사용 시',
  'on-color-gain': '컬러 상승 시',
};

/** 컬러 키 → 한글 (유물 효과 표기용). */
const COLOR_KO: Record<string, string> = {
  fire: '불', water: '물', electric: '전기', iron: '철',
  earth: '흙', wind: '바람', light: '빛', dark: '어둠',
  all: '모든 컬러', random: '무작위 컬러',
};
/** 지표(컬러/스탯) 키 → 한글. */
const METRIC_KO: Record<string, string> = {
  ...COLOR_KO, atk: 'ATK', def: 'DEF', mag: 'MAG',
  'top-color': '최고 컬러값', 'color-count': '컬러 종류 수',
};
function colorKo(arg: unknown): string {
  const k = String(arg ?? 'random');
  return COLOR_KO[k] ?? k;
}
function metricKo(arg: unknown): string {
  const k = String(arg ?? '');
  return METRIC_KO[k] ?? k;
}
/**
 * boost-stat arg → *부스트되는 컬러쌍* 한글 표기.
 * boost-stat은 스탯이 아니라 *컬러쌍*을 올리므로(스탯 파생과 분리), 라벨도 색으로 표기해야 정확.
 * (예: 'mag' 태그는 역사적으로 물·바람 쌍을 가리킨다.)
 */
const BOOST_STAT_PAIR_KO: Record<string, string> = {
  atk: '불·전기', def: '흙·철', mag: '물·바람',
};

export function relicTriggerLabel(trigger: string | undefined): string {
  if (!trigger) return '';
  return RELIC_TRIGGER_LABELS[trigger] ?? trigger;
}

/** 컬러 키(영문) → 한글 컬러 이름. 미상 키는 그대로(폴백). 채집/활동 토스트 등에서 사용. */
export function colorLabel(color: string | undefined): string {
  if (!color) return '';
  return COLOR_KO[color] ?? color;
}

/**
 * 유물 효과 → 한글 *완성 문장*. 화면에 raw kind가 보이지 않게 한다.
 * 카드 라벨(간결)과 달리 유물은 한 줄 설명을 그대로 보여주므로 풀 문장.
 */
export function relicEffectText(eff: RelicEffect): string {
  const v = eff.value ?? 0;
  const signed = (x: number) => (x >= 0 ? `+${x}` : `${x}`);
  switch (eff.kind) {
    // --- 패시브 / 단순 ---
    case 'bonus-hp': return `최대 HP ${signed(v)}`;
    case 'bonus-mana': return `전투 시작 시 마나 ${signed(v)}`;
    case 'bonus-gold': return `전투 승리 시 골드 ${signed(v)}`;
    case 'bonus-damage':
    case 'damage-out-add': return `주는 피해 ${signed(v)}`;
    case 'damage-out-mul': return `주는 피해 ×${v}`;
    case 'damage-in-mul': return `받는 피해 ×${v}`;
    case 'block-out-add': return `방어 ${signed(v)}`;
    case 'draw-extra-add': return `매 턴 드로우 ${signed(v)}`;
    case 'mana-extra-add': return `매 턴 마나 ${signed(v)}`;
    case 'cost-mod-add': return `모든 카드 비용 ${signed(v)}`;
    case 'chance-random-color-1': return `${v}% 확률로 무작위 컬러 +1`;
    case 'skip-turn-every': return `${v}턴마다 적 행동 1회 거름`;
    case 'discount': return `제작 비용 ${Math.round(v * 100)}% 할인`;
    // --- 전투/턴 시작 ---
    case 'combat-start-block': return `전투 시작 시 방어 ${v}`;
    case 'combat-start-draw': return `전투 시작 시 카드 ${v}장 더 뽑기`;
    case 'combat-start-status': return `전투 시작 시 ${statusLabel((eff.params?.arg ?? eff.params?.status) as string | undefined)} ${v}`;
    case 'turn-start-block': return `매 턴 방어 ${v}`;
    case 'turn-start-hp-loss': return `매 턴 시작 시 HP -${v}`;
    // --- 회복 ---
    case 'combat-end-heal': return `전투 승리 시 HP ${v} 회복`;
    case 'node-enter-heal': return `노드 진입 시 HP ${v} 회복`;
    // --- 카운터형 (value = 주기 N) ---
    case 'cards-to-draw': return `카드 ${v}장 사용마다 1장 더 뽑기`;
    case 'cards-to-color': return `카드 ${v}장 사용마다 무작위 컬러 +1`;
    case 'attacks-to-strength': return `공격 ${v}회마다 힘 +1`;
    case 'attacks-to-color': return `공격 ${v}회마다 무작위 컬러 +1`;
    // --- 반응형 ---
    case 'hurt-to-color': return `피해를 받으면 무작위 컬러 +${v}`;
    case 'retaliate': return `피해를 받으면 적에게 ${v} 피해`;
    case 'hurt-to-block': return `피해를 받으면 방어 ${v}`;
    // --- 컬러/스탯 영구 상승 (트리거가 '언제'를 결정) ---
    case 'boost-color': return `${colorKo(eff.params?.arg)} ${signed(v)}`;
    case 'boost-stat': return `${BOOST_STAT_PAIR_KO[String(eff.params?.arg ?? '')] ?? metricKo(eff.params?.arg)} 컬러쌍 ${signed(v)}`;
    // --- 스케일링 (현재값 비례) ---
    case 'block-from-metric': return `전투 시작 시 ${metricKo(eff.params?.arg)} ${v}당 방어 +1`;
    case 'strength-from-metric': return `전투 시작 시 ${metricKo(eff.params?.arg)} ${v}당 힘 +1`;
    case 'combat-start-mana-from-metric': return `전투 시작 시 ${metricKo(eff.params?.arg)} ${v}당 마나 +1`;
    case 'combat-start-draw-from-metric': return `전투 시작 시 ${metricKo(eff.params?.arg)} ${v}당 카드 1장 더 뽑기`;
    // --- 턴 수 연동 ---
    case 'turn-start-block-snowball': return `매 턴 (턴 번호 ×${v})만큼 방어`;
    case 'turn-after-strength': return `${Number(eff.params?.arg ?? 4)}턴째부터 매 턴 힘 +${v || 1}`;
    case 'turn-before-block': return `${Number(eff.params?.arg ?? 3)}턴까지 매 턴 방어 ${v}`;
    case 'turn-units-color': return `턴 번호의 1의 자리가 ${Number(eff.params?.arg ?? 0)}일 때 무작위 컬러 +${v || 1}`;
    // --- 즉시 자원 ---
    case 'gain-time-shards': return `시간의 조각 ${signed(v)}`;
    case 'heal-now': return `HP ${v} 회복`;
    case 'gain-card': return `카드 획득`;
    // --- C 메커니즘 (패시브 마커) ---
    case 'block-carryover': return `방어가 다음 턴으로 이월됩니다`;
    case 'mana-carryover': return `쓰지 않은 마나가 다음 턴으로 이월됩니다`;
    case 'first-card-free': return `매 턴 첫 카드의 비용이 0`;
    case 'double-debuff': return `적에게 거는 디버프가 2배`;
    default: return `${eff.kind}${eff.value !== undefined ? ` ${eff.value}` : ''}`;
  }
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
