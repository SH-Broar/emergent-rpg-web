/**
 * UI 표시용 한글 라벨 — 데이터/코드 식별자를 화면 텍스트로 변환.
 *
 * 원칙: 화면에 *raw 코드*(damage, apply-status, insight2-50 등)가 보이지 않게 한다.
 * 모든 컴포넌트가 이 모듈을 거쳐 라벨을 표시.
 */

import type { Card, CardEffect, Relic, RelicEffect } from '@/data/schemas';

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
  'break-armor': '방어 파괴',
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
  'consume-burn': '화상 폭발',
  'consume-poison': '독 폭발',
  'damage-from-hp': '피의 대가',
  'damage-per-hand': '패 타격',
  'damage-low-hand': '빈손 타격',
  'exhaust-self': '소멸',
  'return-self-to-hand': '손에 남음',
  'block-to-damage': '돌파',
  'adaptive-strike': '임기응변',
  'hand-cost-down': '질풍',
  'grant-color': '색 봉헌',
  'spend-all-energy': '전력',
  'damage-per-companion': '동행 타격',
  'damage-per-relic': '수집 타격',
  'growing-damage': '성장 피해',
  'heal-per-hand': '패 회복',
  'next-card-double': '메아리',
  'ghost-self': '흐려지기',
  'curse-tick': '저주 피해',
  'release-transform': '본모습 (스택 -2)',
  // 인간 재설계 (STS 아이언클래드式, 2026-06-16) — 전투 휘발 buff 7종.
  metallicize: '강철',
  barricade: '불굴',
  'feel-no-pain': '무통',
  rupture: '각혈',
  juggernaut: '반격진',
  'double-block': '참호',
  'heavy-blade': '중검',
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
  'break-armor': '닿은 적의 방어막을 전부 즉시 제거합니다.',
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
  'consume-burn': '적의 화상 스택을 모두 없애고, 없앤 만큼 × 수치 추가 피해.',
  'consume-poison': '적의 독 스택을 모두 없애고, 없앤 만큼 × 수치 추가 피해.',
  'damage-from-hp': '자기 HP를 지불하고 그 곱절로 피해를 줍니다.',
  'damage-per-hand': '현재 손패 수 × 수치만큼 피해.',
  'damage-low-hand': '기본 피해. 이 카드를 뺀 손패가 임계 이하(기본 2장)면 피해가 2배가 됩니다.',
  'exhaust-self': '사용 후 이번 전투에서 사라집니다(소멸).',
  'return-self-to-hand': '사용 후 버려지지 않고 손으로 돌아옵니다.',
  'block-to-damage': '현재 방어막 × 수치만큼 추가 피해. 방어막은 사라지지 않습니다.',
  'adaptive-strike': '방어막이 있으면 더 큰 피해로, 없으면 방어막으로 전환됩니다.',
  'hand-cost-down': '이번 턴 손에 든 카드의 비용이 수치만큼 줄어듭니다.',
  'grant-color': '지정한 색(무작위/모든 색 포함)을 수치만큼 영구히 얻습니다. 색이 짙고 다채로울수록 공명 카드가 강해집니다.',
  'spend-all-energy': '남은 마나를 전부 소비해 소비량 × 수치만큼 피해.',
  'damage-per-companion': '동료 수 × 수치만큼 피해.',
  'damage-per-relic': '보유 유물 수 × 수치만큼 피해.',
  'growing-damage': '피해. 쓸 때마다 이 카드의 피해가 +1씩 누적됩니다.',
  'heal-per-hand': '현재 손패 수 × 수치만큼 회복.',
  'next-card-double': '다음에 쓰는 카드 1장의 모든 수치가 2배가 됩니다.',
  'ghost-self': '수치만큼 턴 동안 비실체가 됩니다 — 받는·주는 피해가 절반.',
  'curse-tick': '손에 쥐고 있으면 매 턴 시작마다 수치만큼 직접 피해를 입습니다.',
  'release-transform': '변신 스택을 2 줄입니다. 스택이 0 이하가 되면 원래 모습으로 돌아옵니다. 이 카드는 사라지지 않아 여러 번 낼 수 있습니다.',
  // 인간 재설계 (STS 아이언클래드式, 2026-06-16) — 전투 휘발 buff 7종.
  metallicize: '이번 전투 동안 방어막이 매 턴 절반이 아니라 1씩만 줄어듭니다(천천히 감소).',
  barricade: '이번 전투 동안 방어막이 턴이 지나도 사라지지 않습니다.',
  'feel-no-pain': '이번 전투 동안 카드가 소멸될 때마다 방어막을 수치만큼 얻습니다.',
  rupture: '이번 전투 동안 카드로 HP를 잃을 때마다 힘이 수치만큼 늘어납니다.',
  juggernaut: '이번 전투 동안 방어막을 얻을 때마다 적에게 수치만큼 피해를 줍니다.',
  'double-block': '현재 방어막을 두 배로 만듭니다.',
  'heavy-blade': '피해를 줍니다. 힘이 배수만큼 더 크게 반영됩니다.',
};

/** 상태이상/버프 키 → *툴팁용 상세 설명*. */
const STATUS_DESCRIPTIONS: Record<string, string> = {
  vulnerable: '받는 피해가 1.5배가 됩니다.',
  weakness: '주는 피해가 0.75배가 됩니다.',
  poison: '턴이 끝날 때마다 스택만큼 HP 피해를 입고, 스택이 1 줄어듭니다.',
  feral: '수화 — 공격 1.5배, 방어를 쌓을 수 없습니다. 3턴마다 1 감소, 10이 되면 심수화로.',
  regress: '퇴행 — 컬러 보너스가 절반이 되지만, 한 턴에 이동 2번·이동이 공중 속성·턴 종료 대기가 시간을 쓰지 않습니다. 영구(아이템·이벤트로 해제).',
  strength: '주는 피해가 스택만큼 늘어납니다.',
  dexterity: '방어가 스택만큼 늘어납니다.',
  burn: '화상 — 매 턴 화상 수치만큼 직접 피해를 입고, 그 뒤 수치가 절반으로 줄어듭니다(1 미만이면 사라짐).',
  paralyze: '마비 — 다음 턴 행동할 수 없습니다(스킵). 매 발동 시 1 감소.',
  spasm: '경련 — 이번 턴 마나가 스택만큼 줄고, 턴이 지나면 모두 사라집니다.',
  sap: '잠식 — 매 턴 스택만큼 직접 HP 피해. 전투 종료나 정화로만 해소됩니다(감쇠 없음).',
  ghost: '유령화 — 이동이 장애물을 넘고(공중), 원거리 공격에 표적이 되지 않으며, 유령끼리는 서로 공격할 수 없습니다. 매 턴 1 감소.',
  anchored: '결박 — 닻에 묶여 이동할 수 없습니다. 매 턴 1 감소.',
  drowsy: '졸음 — 행동이 느려집니다(적은 그만큼 늦게 행동). 두 번 쌓이면 수면이 됩니다. 매 턴 1 감소.',
  airborne: '비행 — 이동 시 장애물 위를 넘어 착지 가능 칸까지 갑니다. 이동하면 착지(해제). 매 턴 1 감소.',
  brainwash: '세뇌 — 홀려서 주는 피해가 0.66배가 됩니다. 매 턴 1 감소.',
  possession: '빙의 — 주는 피해가 절반이 되고 매 턴 시작에 HP를 잃습니다. 정화 전까지 전투 후에도 남습니다. (co-location 재설계 예정)',
  confusion: '혼란 — 대기할 때마다 인접 8칸 중 무작위 칸으로 비틀거립니다. 매 턴 1 감소.',
  sleep: '수면 — 이번 턴 이동·공격 불가(턴 스킵), 비행 해제. 피해를 받으면 즉시 깨어납니다. 매 턴 1 감소.',
  slime: '점액 — 매 턴 마나가 스택만큼 줄어듭니다. 매 턴 1 감소.',
  imprint: '각인 — 스택당 주는 피해가 10%씩 줄어듭니다(복리). 5 이하는 3턴마다 1 감소, 6 이상은 줄지 않습니다.',
  'feral-heavy': '심수화 — 너무 신나서 멈출 수 없다. 공격이 2배지만 회복도 방어도 못 합니다. 전투 후에도 남으며 탐색 보상이 늘고, 마을이나 휴식에서만 가라앉습니다.',
  // === 이로운(버프) 상태 (Colorz 18-c) — 매 턴 1씩 감소. ===
  regen: '재생 — 매 턴 시작에 스택만큼 HP를 회복합니다. 매 턴 1 감소.',
  haste: '사고 가속 — 켜져 있는 동안 매 턴 카드를 한 장 더 뽑습니다. 매 턴 1 감소.',
  'move-haste': '가속 — 이동 사거리가 스택만큼 늘어납니다. 매 턴 1 감소.',
  ward: '보호막 — 켜져 있는 동안 방어막이 다음 턴으로 그대로 넘어갑니다. 매 턴 1 감소.',
  thorns: '반격 — 적의 공격에 맞으면 스택만큼 적에게 되돌려 줍니다. 매 턴 1 감소.',
  resolve: '정신력 — 디버프를 받을 때 스택을 1 줄여 받습니다(최소 0). 매 턴 1 감소.',
  // 인간 재설계 (STS 아이언클래드式, 2026-06-16) — 전투 휘발 파워(감쇠 없음).
  metallicize: '강철 — 방어막이 매 턴 절반이 아니라 1씩만 줄어듭니다(천천히 감소). 이번 전투 동안 유지.',
};

/** 상태이상/버프 키 → 한글. */
const STATUS_LABELS: Record<string, string> = {
  strength: '힘',
  weakness: '약화',
  dexterity: '민첩',
  vulnerable: '취약',
  poison: '중독',
  burn: '화상',
  feral: '수화',
  regress: '퇴행',
  paralyze: '마비',
  spasm: '경련',
  sap: '잠식',
  ghost: '유령화',
  anchored: '결박',
  drowsy: '졸음',
  airborne: '비행',
  brainwash: '세뇌',
  possession: '빙의',
  confusion: '혼란',
  sleep: '수면',
  slime: '점액',
  imprint: '각인',
  'feral-heavy': '심수화',
  // 이로운(버프) 상태 (Colorz 18-c).
  regen: '재생',
  haste: '사고 가속',
  'move-haste': '가속',
  ward: '보호막',
  thorns: '반격',
  resolve: '정신력',
  // 인간 재설계 (STS 아이언클래드式, 2026-06-16) — 전투 휘발 파워.
  metallicize: '강철',
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

/**
 * 한글 조사 선택 (Item 37-② Stage C, 1D) — 단어의 마지막 글자 받침 유무로 조사를 고른다.
 *   josa('시이드', '이', '가') → '시이드가'   (받침 없음 → withoutBatchim)
 *   josa('로큐', '이', '가')   → '로큐가'
 *   josa('하코', '이', '가')   → '하코가'
 *   josa('칼리번', '이', '가') → '칼리번이'   (받침 있음 → withBatchim)
 * 마지막 글자가 한글 음절이 아니면(영문·숫자·기호) 받침 없음으로 간주한다.
 * @param name           단어(이름).
 * @param withBatchim    받침 있을 때 붙일 조사(예: '이', '은', '을', '과').
 * @param withoutBatchim 받침 없을 때 붙일 조사(예: '가', '는', '를', '와').
 */
export function josa(name: string, withBatchim: string, withoutBatchim: string): string {
  if (!name) return name;
  const code = name.charCodeAt(name.length - 1);
  // 한글 음절 영역(가~힣): 받침 유무 = (code - 0xAC00) % 28 !== 0.
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  const hasBatchim = isHangul && (code - 0xac00) % 28 !== 0;
  return name + (hasBatchim ? withBatchim : withoutBatchim);
}

/** 락 해제 조건(LockCondition) → 한글 배지 라벨. */
const LOCK_CONDITION_LABELS: Record<string, string> = {
  block: '방어',
  damage: '피해',
  draw: '드로우',
  'no-attack': '공격 금지',
  'no-defense': '방어 금지',
};

/**
 * 락 배지 한 줄 — 이름 + 조건 + 진행도. 예: '조준 — 방어 20/40', '정전 — 공격 금지 0/1'.
 * 금욕형(no-attack/no-defense)은 "턴" 단위 진행도로 표기.
 */
export function lockBadgeText(lock: { condition: string; threshold: number; progress: number; label: string }): string {
  const cond = LOCK_CONDITION_LABELS[lock.condition] ?? lock.condition;
  const unit = (lock.condition === 'no-attack' || lock.condition === 'no-defense') ? '턴' : '';
  const p = Math.min(lock.progress, lock.threshold);
  return `${lock.label} — ${cond} ${p}/${lock.threshold}${unit}`;
}

/** 락 배지 *툴팁* — 해제 방법 설명. */
export function lockTooltip(lock: { condition: string; threshold: number; progress: number }): string {
  switch (lock.condition) {
    case 'block': return `방어를 누적 ${lock.threshold}만큼 쌓으면 풀립니다(턴에 걸쳐 누적, 줄지 않음).`;
    case 'damage': return `적에게 누적 ${lock.threshold}만큼 피해를 주면 풀립니다(턴에 걸쳐 누적).`;
    case 'draw': return `카드를 누적 ${lock.threshold}장 뽑으면 풀립니다(턴에 걸쳐 누적).`;
    case 'no-attack': return `공격하지 않고 ${lock.threshold}턴을 넘기면 풀립니다. 그 턴에 공격하면 무효가 됩니다.`;
    case 'no-defense': return `방어하지 않고 ${lock.threshold}턴을 넘기면 풀립니다. 그 턴에 방어하면 무효가 됩니다.`;
    default: return '조건을 채우면 풀립니다.';
  }
}

/** 몬스터 의도(intent) 종류 → 한글 동사. UI는 "{라벨} {수치}" 형태로 표시. */
const INTENT_KIND_LABELS: Record<string, string> = {
  attack: '공격',
  defend: '방어',
  buff: '강화',
  debuff: '약화 부여',
  bind: '구속',
  'bind-hard': '강한 구속',
  devour: '삼킴',
  web: '거미줄',
  drain: '흡혈',
  'drain-stat': '잠식',
  charge: '강화', // charge → buff 통합(Colorz 18-c): 라벨 일원화. 엔진은 buff 와 동일 처리.
  'add-card': '잡카드 주입',
  'add-card-draw': '잡카드 주입',
  'add-card-discard': '잡카드 섞기',
  'add-card-hand': '잡카드 쥐어주기',
  obscure: '손패 절반 가리기',
  'cost-up': '비용 교란',
  'force-discard': '드로우 감소',
  'transform-card': '카드 망가뜨리기',
  ghost: '유령화',
  'heavy-feral': '심수화로',
  'absorb-emotion': '감정 흡수',
  'feast-debuff': '동기화',
  'grant-possession': '들러붙기',
  change: '둔갑',
  lockin: '락인',
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
  if (kind === 'bind' || kind === 'bind-hard' || kind === 'devour') {
    return label; // 게이지는 grapple 표시에서 별도로.
  }
  // 락인 — 텔레그래프엔 "락인"만(해제법·수치·이름 비공개). 걸린 뒤 배지에서 상세 공개.
  if (kind === 'lockin') return '락인';
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
    case 'buff':
    case 'charge': return `강화 — 힘이 ${n} 늘어 이후 공격이 강해집니다.`; // charge=buff 통합.
    case 'drain': return `흡혈 — ${n} 피해를 주고 그만큼 회복합니다.`;
    case 'debuff': {
      const st = parts[2];
      const d = STATUS_DESCRIPTIONS[st ?? ''];
      return `${statusLabel(st)} ${n}${d ? ` — ${d}` : ' 부여'}`;
    }
    case 'bind': return '구속 — 매 턴 손패 일부가 잠깁니다. 발버둥(마나 1)으로 탈출. 방치할수록 잠금이 늘어납니다.';
    case 'bind-hard': return '강한 구속 — 매 턴 손패가 더 많이 잠깁니다. 색상 순서 미니게임으로만 발버둥칠 수 있습니다.';
    case 'devour': return '삼킴 — 매 턴 직접 피해를 입습니다. 색상 순서 미니게임으로만 발버둥칠 수 있습니다.';
    case 'web': return `거미줄 — 다음 턴 손패 ${n || 1}장이 묶입니다. 카드를 쓸 때마다 한 겹씩 풀립니다(누적).`;
    case 'drain-stat': return `잠식 — 잠식 ${n || 1}을 걸어 주는 피해와 방어를 깎고, 적이 그만큼 강해집니다. 매 턴 1씩 감소.`;
    case 'obscure': return `손패 절반 가리기 — ${n || 1}턴 동안 손패의 절반(올림)이 가려집니다(뒷면). 위치로만 사용 가능.`;
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
    // 조건부 특수 행동 — 플레이어가 특정 상태일 때만 의도가 이것으로 바뀐다(아니면 원래 행동).
    case 'heavy-feral': return '심수화로 — 이미 수화 상태라면 심수화로 끌어올립니다(전투 후에도 남고 탐색 보상↑).';
    case 'absorb-emotion': return '감정 흡수 — 방어막이 있으면 그 마음을 흡수해 적이 그만큼 강해지고 방어가 사라집니다.';
    case 'feast-debuff': return '동기화 — 디버프에 걸려 있으면 그에 동기화해 디버프 종류 수만큼 적이 회복하고 단단해집니다.';
    case 'grant-possession': return '들러붙기 — 떼어낼 수 없는 빙의 카드를 덱에 박습니다. 쓸수록 각성이 차오르고, 끝에 가서 좋은 것이든 나쁜 것이든 정체를 드러냅니다.';
    case 'lockin': return '락인 — 적이 조준합니다. 걸린 뒤 배지의 조건을 채우면 풀립니다. 다 풀지 못한 채 적이 노리면 강하게 몰아칩니다.';
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
    if (!st) return '상태 부여';
    // 대상을 단어에 녹인다(적/자신 라벨 없이도 구분): 자신=상태명만(버프), 적='부여'(디버프).
    return effect.target === 'self' ? statusLabel(st) : `${statusLabel(st)} 부여`;
  }
  if (effect.kind === 'grant-color') {
    // 획득하는 색을 라벨에 녹인다 (불/물/.../무작위/모든 색). 미지정 시 무작위.
    const color = (effect.params?.color as string | undefined) ?? 'random';
    return `${colorLabel(color)} 봉헌`;
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

/** 등급 한글 라벨. */
const RANK_KO: Record<string, string> = { basic: '기본', common: '일반', rare: '희귀', legendary: '전설' };

/**
 * 카드 *상세* 한 줄 — 길게 누름/호버 툴팁용(보상 카드 성능 확인). 이름·등급·코스트 + 효과 요약.
 */
export function cardDetailText(card: Card | undefined): string {
  if (!card) return '';
  const head = `${card.name} · ${RANK_KO[card.rank] ?? card.rank} · ${card.cost}코`;
  const effs = card.effects
    .map((e) => {
      const v = e.value !== undefined ? ` ${e.value}` : '';
      const t = e.target ? ` ${effectTargetLabel(e.target)}` : '';
      return `${cardEffectKindLabel(e)}${v}${t}`.trim();
    })
    .filter(Boolean)
    .join(', ');
  return effs ? `${head} — ${effs}` : head;
}

/**
 * 유물 *상세* 한 줄 — 길게 누름/호버 툴팁용. 이름·등급·트리거 + 효과.
 */
export function relicDetailText(relic: Relic | undefined): string {
  if (!relic) return '';
  const head = `${relic.name} · ${RANK_KO[relic.rank] ?? relic.rank}`;
  const trig = relicTriggerLabel(relic.trigger);
  const effs = relic.effects.map(relicEffectText).join(', ');
  return `${head}${trig ? ` (${trig})` : ''}${effs ? ` — ${effs}` : ''}`;
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
  'on-draw': '카드 드로우 시',
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
    // --- 활동(주사위) ---
    case 'activity-success-add': return `활동 성공 확률 ${signed(v)}%`;
    case 'activity-reward-mul': return `활동 성공 보상 +${Math.round(v * 100)}%`;
    // --- 전투/턴 시작 ---
    case 'combat-start-block': return `전투 시작 시 방어 ${v}`;
    case 'combat-start-draw': return `전투 시작 시 카드 ${v}장 더 뽑기`;
    case 'combat-start-hand-card': return `전투 시작 시 손에 특수 카드 1장 지급`;
    case 'retain-hand': return `보존 — 턴이 끝나도 손패를 버리지 않음`;
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
    case 'damage-enemy': return `카드를 뽑을 때마다 적에게 ${v} 피해`;
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

/**
 * 런 종료 사유 → *문장형* 안내 (RunEndView 요약 머리글). 미상 사유는 일반 문구.
 */
const END_REASON_TEXT: Record<string, string> = {
  'time-up': '시간이 다 됐다.',
  'free-end': '런을 포기했다.',
  'hp-zero': 'HP가 0이 되었다.',
  'boss-cleared': '보스를 마주하고 살아 돌아왔다.',
  'boss-defeated': '보스에게 무너졌다.',
};
export function endReasonText(reason: string | undefined): string {
  return END_REASON_TEXT[reason ?? ''] ?? '여정이 끝났다.';
}

/**
 * 런 종료 사유 → *짧은 결과 배지* (기록 목록). 미상 사유는 '종료'.
 */
const END_REASON_LABEL: Record<string, string> = {
  'time-up': '시간 만료',
  'free-end': '포기',
  'hp-zero': '쓰러짐',
  'boss-cleared': '클리어',
  'boss-defeated': '패배',
};
export function endReasonLabel(reason: string | undefined): string {
  return END_REASON_LABEL[reason ?? ''] ?? '종료';
}

/** 런 종료 사유 → 배지 색 (기록 목록·요약 공용). */
const END_REASON_COLOR: Record<string, string> = {
  'time-up': '#f6e8b8',
  'free-end': '#9a8fb8',
  'hp-zero': '#ff8e8e',
  'boss-cleared': '#8effb8',
  'boss-defeated': '#ff8e8e',
};
export function endReasonColor(reason: string | undefined): string {
  return END_REASON_COLOR[reason ?? ''] ?? '#b6b6c4';
}
