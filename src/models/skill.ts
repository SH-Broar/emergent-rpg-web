// skill.ts — 스킬 데이터 모델
// 원본 설계: EmergentRPG 스킬 시스템

export enum SkillType { Attack, Defense, Buff, Debuff }

export interface SkillEffect {
  damageMultiplier?: number;   // 공격 데미지 배율
  flatDamage?: number;         // 고정 데미지
  healHp?: number;
  healMp?: number;
  defenseMultiplier?: number;  // 방어력 배율 (N턴)
  attackMultiplier?: number;   // 공격력 배율 (N턴)
  buffDuration?: number;
  debuffType?: 'poison' | 'weaken' | 'slow';
  debuffValue?: number;
  debuffDuration?: number;
}

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  effect: SkillEffect;
  mpCost: number;
  tpCost: number;              // 강력한 스킬은 기력(TP) 소모
  hpCost: number;              // 일부 스킬은 HP 소모
  preDelay: number;            // 발동 전 대기 턴 (0=즉시)
  postDelay: number;           // 사용 후 행동 불가 턴 (0=없음)
  appearRate: number;          // 선택 확률 0.0-1.0
  maxUsesPerCombat: number;    // 전투 중 최대 사용 횟수 (-1=무제한)
  element: number;             // 관련 원소 인덱스 (-1=없음)
}

export interface PlayerSkillState {
  learnedSkills: Map<string, number>;  // skillId → 레벨 (1-5)
  skillOrder: string[];                 // 선택 우선순위 정렬된 스킬 ID
  skillUsage: Map<string, number>;      // skillId → 총 사용 횟수 (레벨업용)
}

// --- 15개 기본 스킬 정의 ---

// Element 인덱스: Fire=0, Water=1, Electric=2, Iron=3, Earth=4, Wind=5, Light=6, Dark=7

export const ALL_SKILLS: SkillDef[] = [
  // Attack (5)
  {
    id: 'slash',
    name: '베기',
    description: '기본 베기 공격. 빠르고 안정적이다.',
    type: SkillType.Attack,
    effect: { damageMultiplier: 1.2 },
    mpCost: 5, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 0,
    appearRate: 0.8, maxUsesPerCombat: 99, element: -1,
  },
  {
    id: 'heavy_strike',
    name: '강타',
    description: '강력한 일격. 사용 후 잠시 행동 불가.',
    type: SkillType.Attack,
    effect: { damageMultiplier: 1.8 },
    mpCost: 10, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 1,
    appearRate: 0.6, maxUsesPerCombat: 5, element: 3, // Iron
  },
  {
    id: 'flame_slash',
    name: '화염참',
    description: '불꽃을 실은 베기. 기력을 소모한다.',
    type: SkillType.Attack,
    effect: { damageMultiplier: 2.0 },
    mpCost: 15, tpCost: 1, hpCost: 0,
    preDelay: 0, postDelay: 1,
    appearRate: 0.5, maxUsesPerCombat: 3, element: 0, // Fire
  },
  {
    id: 'thunder_bolt',
    name: '번개',
    description: '번개를 소환해 강타한다. 준비 시간이 필요하다.',
    type: SkillType.Attack,
    effect: { damageMultiplier: 2.5 },
    mpCost: 20, tpCost: 1, hpCost: 0,
    preDelay: 1, postDelay: 1,
    appearRate: 0.4, maxUsesPerCombat: 2, element: 2, // Electric
  },
  {
    id: 'light_arrow',
    name: '빛의 화살',
    description: '빛 속성 화살. 빠르게 날아간다.',
    type: SkillType.Attack,
    effect: { damageMultiplier: 1.5 },
    mpCost: 8, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 0,
    appearRate: 0.7, maxUsesPerCombat: 8, element: 6, // Light
  },

  // Defense (3)
  {
    id: 'guard',
    name: '방어태세',
    description: '1턴 동안 방어력을 2배로 높인다.',
    type: SkillType.Defense,
    effect: { defenseMultiplier: 2.0, buffDuration: 1 },
    mpCost: 5, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 0,
    appearRate: 0.7, maxUsesPerCombat: 99, element: -1,
  },
  {
    id: 'iron_wall',
    name: '철벽',
    description: '2턴 동안 방어력을 3배로 높인다. 준비 시간이 필요하다.',
    type: SkillType.Defense,
    effect: { defenseMultiplier: 3.0, buffDuration: 2 },
    mpCost: 15, tpCost: 1, hpCost: 0,
    preDelay: 1, postDelay: 0,
    appearRate: 0.4, maxUsesPerCombat: 2, element: -1,
  },
  {
    id: 'dodge',
    name: '회피',
    description: '1턴 동안 모든 데미지를 무효화한다.',
    type: SkillType.Defense,
    effect: { defenseMultiplier: 999, buffDuration: 1 },
    mpCost: 8, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 0,
    appearRate: 0.6, maxUsesPerCombat: 5, element: -1,
  },

  // Buff (4)
  {
    id: 'heal',
    name: '치유',
    description: 'HP를 30 회복한다.',
    type: SkillType.Buff,
    effect: { healHp: 30 },
    mpCost: 10, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 1,
    appearRate: 0.7, maxUsesPerCombat: 5, element: -1,
  },
  {
    id: 'focus',
    name: '집중',
    description: '3턴 동안 공격력을 1.5배로 높인다.',
    type: SkillType.Buff,
    effect: { attackMultiplier: 1.5, buffDuration: 3 },
    mpCost: 12, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 0,
    appearRate: 0.5, maxUsesPerCombat: 3, element: -1,
  },
  {
    id: 'mana_charge',
    name: '마력충전',
    description: 'MP를 20 회복한다. 기력이 필요하다.',
    type: SkillType.Buff,
    effect: { healMp: 20 },
    mpCost: 0, tpCost: 1, hpCost: 0,
    preDelay: 0, postDelay: 0,
    appearRate: 0.5, maxUsesPerCombat: 2, element: -1,
  },
  {
    id: 'vigor_up',
    name: '기합',
    description: '기력을 15 회복한다.',
    type: SkillType.Buff,
    effect: { healHp: 0 }, // vigor is handled separately in skill-combat
    mpCost: 8, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 0,
    appearRate: 0.6, maxUsesPerCombat: 5, element: -1,
  },

  // Debuff (3)
  {
    id: 'poison_mist',
    name: '독안개',
    description: '3턴 동안 매 턴 5의 독 데미지.',
    type: SkillType.Debuff,
    effect: { debuffType: 'poison', debuffValue: 5, debuffDuration: 3 },
    mpCost: 12, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 1,
    appearRate: 0.5, maxUsesPerCombat: 3, element: -1,
  },
  {
    id: 'weaken',
    name: '약화',
    description: '3턴 동안 적의 공격력을 0.7배로 낮춘다.',
    type: SkillType.Debuff,
    effect: { debuffType: 'weaken', debuffValue: 0.7, debuffDuration: 3 },
    mpCost: 10, tpCost: 0, hpCost: 0,
    preDelay: 1, postDelay: 0,
    appearRate: 0.5, maxUsesPerCombat: 3, element: -1,
  },
  {
    id: 'slow',
    name: '둔화',
    description: '3턴 동안 적의 후딜레이를 +1 증가시킨다.',
    type: SkillType.Debuff,
    effect: { debuffType: 'slow', debuffValue: 1, debuffDuration: 3 },
    mpCost: 8, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 0,
    appearRate: 0.6, maxUsesPerCombat: 5, element: -1,
  },
];

const SKILL_MAP = new Map<string, SkillDef>(ALL_SKILLS.map(s => [s.id, s]));

export function getSkillDef(id: string): SkillDef | undefined {
  return SKILL_MAP.get(id);
}

export function getAllSkills(): readonly SkillDef[] {
  return ALL_SKILLS;
}

export function getSkillsByType(type: SkillType): SkillDef[] {
  return ALL_SKILLS.filter(s => s.type === type);
}
