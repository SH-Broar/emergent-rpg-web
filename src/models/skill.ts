// skill.ts — 스킬 데이터 모델 + 레지스트리
// 데이터 드리븐: skills.txt에서 로드, ALL_SKILLS는 폴백

import type { DataSection } from '../data/parser';
import { parseFloatList, parseStringList } from '../data/parser';

export enum SkillType { Attack, Defense, Buff, Debuff }

export interface SkillEffect {
  damageMultiplier?: number;
  flatDamage?: number;
  healHp?: number;
  healMp?: number;
  defenseMultiplier?: number;
  attackMultiplier?: number;
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
  tpCost: number;
  hpCost: number;
  preDelay: number;
  postDelay: number;
  appearRate: number;
  maxUsesPerCombat: number;
  element: number;

  // --- 학습 조건 ---
  raceTagExpr: string;       // 종족 태그 표현식 (빈=제한없음)
  minLevel: number;           // 학습 최소 레벨 (0=제한없음)
  colorReq: number[];         // 8원소 최소값 (빈=제한없음)
  isBasicSkill: boolean;      // 기본 스킬 (자동 습득, 제거 불가)
  basicForRace: string;       // 종족 키 (해당 종족 전용 기본 스킬, 빈=공용)
  roleAffinity: string[];     // NPC에게 우선 배정되는 역할 키

  // --- 장소 학습 (스킬 상점) ---
  learnLocation?: string;      // 학습 가능 장소 (LocationID, 빈=상점 불가)
  learnCost?: { item: string; amount: number }[];  // 재료 비용
  learnMinHyperion?: number;   // 최소 히페리온 레벨
  replacesSkill?: string;      // 이전 단계 스킬 ID (빈=교체 없음)
  shopTier?: number;            // 상점 표시용 단계 (0=상점 아님)
}

export interface PlayerSkillState {
  learnedSkills: Map<string, number>;  // skillId → 레벨 (1-5)
  skillOrder: string[];
  skillUsage: Map<string, number>;     // skillId → 총 사용 횟수
}

// ============================================================
// 스킬 레벨링 상수 & 함수
// ============================================================

export const SKILL_MAX_LEVEL = 5;
export const SKILL_LEVEL_THRESHOLDS = [0, 10, 25, 50, 100]; // 1→2, 2→3, 3→4, 4→5

/** 레벨별 데미지/힐 배율: 1.0, 1.15, 1.30, 1.45, 1.60 */
export function getSkillLevelMultiplier(level: number): number {
  return 1.0 + (Math.max(1, Math.min(SKILL_MAX_LEVEL, level)) - 1) * 0.15;
}

/** 레벨별 MP 코스트 감소: 1.0, 0.9, 0.8, 0.7, 0.6 */
export function getSkillCostReduction(level: number): number {
  return Math.max(0.6, 1.0 - (Math.max(1, Math.min(SKILL_MAX_LEVEL, level)) - 1) * 0.1);
}

/** 레벨별 출현율 보너스: 0, 0.05, 0.10, 0.15, 0.20 */
export function getSkillAppearBonus(level: number): number {
  return (Math.max(1, Math.min(SKILL_MAX_LEVEL, level)) - 1) * 0.05;
}

/** 스킬 레벨업 가능 여부 */
export function checkSkillLevelUp(_skillId: string, currentLevel: number, totalUses: number): boolean {
  if (currentLevel >= SKILL_MAX_LEVEL) return false;
  return totalUses >= SKILL_LEVEL_THRESHOLDS[currentLevel];
}

// ============================================================
// 기본 SkillDef 생성
// ============================================================

function createDefaultSkillDef(id: string): SkillDef {
  return {
    id, name: id, description: '', type: SkillType.Attack,
    effect: {}, mpCost: 5, tpCost: 0, hpCost: 0,
    preDelay: 0, postDelay: 0, appearRate: 0.5, maxUsesPerCombat: 99,
    element: -1, raceTagExpr: '', minLevel: 0, colorReq: [],
    isBasicSkill: false, basicForRace: '', roleAffinity: [],
    learnLocation: '', learnCost: [], learnMinHyperion: 0, replacesSkill: '', shopTier: 0,
  };
}

// ============================================================
// 레지스트리
// ============================================================

const skillRegistry = new Map<string, SkillDef>();
const skillsByType = new Map<SkillType, SkillDef[]>();
const basicSkillsByRace = new Map<string, SkillDef[]>();

function registerSkill(def: SkillDef): void {
  skillRegistry.set(def.id, def);

  const typeList = skillsByType.get(def.type) ?? [];
  typeList.push(def);
  skillsByType.set(def.type, typeList);

  if (def.isBasicSkill && def.basicForRace) {
    const raceList = basicSkillsByRace.get(def.basicForRace) ?? [];
    raceList.push(def);
    basicSkillsByRace.set(def.basicForRace, raceList);
  }
}

// ============================================================
// 데이터 파일에서 스킬 로드 (items.txt 패턴)
// ============================================================

function parseSkillType(s: string): SkillType {
  switch (s.trim()) {
    case 'Attack': return SkillType.Attack;
    case 'Defense': return SkillType.Defense;
    case 'Buff': return SkillType.Buff;
    case 'Debuff': return SkillType.Debuff;
    default: return SkillType.Attack;
  }
}

const ELEMENT_KEY_MAP: Record<string, number> = {
  Fire: 0, Water: 1, Electric: 2, Iron: 3,
  Earth: 4, Wind: 5, Light: 6, Dark: 7,
};

function parseSkillElement(s: string): number {
  const trimmed = s.trim();
  if (trimmed === 'None' || trimmed === '') return -1;
  return ELEMENT_KEY_MAP[trimmed] ?? -1;
}

export function loadSkillDefs(sections: DataSection[]): void {
  skillRegistry.clear();
  skillsByType.clear();
  basicSkillsByRace.clear();

  for (const s of sections) {
    if (s.name.startsWith('#') || s.name === 'Meta') continue;

    const def = createDefaultSkillDef(s.name);
    def.name = s.get('name', s.name);
    def.description = s.get('description', '');
    def.type = parseSkillType(s.get('type', 'Attack'));

    // Effect
    const effect: SkillEffect = {};
    if (s.has('damageMultiplier')) effect.damageMultiplier = s.getFloat('damageMultiplier', 1.0);
    if (s.has('flatDamage')) effect.flatDamage = s.getInt('flatDamage', 0);
    if (s.has('healHp')) effect.healHp = s.getInt('healHp', 0);
    if (s.has('healMp')) effect.healMp = s.getInt('healMp', 0);
    if (s.has('defenseMultiplier')) effect.defenseMultiplier = s.getFloat('defenseMultiplier', 1.0);
    if (s.has('attackMultiplier')) effect.attackMultiplier = s.getFloat('attackMultiplier', 1.0);
    if (s.has('buffDuration')) effect.buffDuration = s.getInt('buffDuration', 1);
    if (s.has('debuffType')) effect.debuffType = s.get('debuffType', 'poison') as 'poison' | 'weaken' | 'slow';
    if (s.has('debuffValue')) effect.debuffValue = s.getFloat('debuffValue', 0);
    if (s.has('debuffDuration')) effect.debuffDuration = s.getInt('debuffDuration', 1);
    def.effect = effect;

    // Combat stats
    def.mpCost = s.getInt('mpCost', 5);
    def.tpCost = s.getInt('tpCost', 0);
    def.hpCost = s.getInt('hpCost', 0);
    def.preDelay = s.getInt('preDelay', 0);
    def.postDelay = s.getInt('postDelay', 0);
    def.appearRate = s.getFloat('appearRate', 0.5);
    def.maxUsesPerCombat = s.getInt('maxUsesPerCombat', 99);
    def.element = parseSkillElement(s.get('element', 'None'));

    // Learning requirements
    def.raceTagExpr = s.get('raceTagExpr', '');
    def.minLevel = s.getInt('minLevel', 0);
    const colorReqStr = s.get('colorReq', '');
    def.colorReq = colorReqStr ? parseFloatList(colorReqStr) : [];
    def.isBasicSkill = s.getInt('isBasicSkill', 0) === 1;
    def.basicForRace = s.get('basicForRace', '');
    const roleStr = s.get('roleAffinity', '');
    def.roleAffinity = roleStr ? parseStringList(roleStr) : [];

    // Shop learning
    def.learnLocation = s.get('learnLocation', '');
    const costStr = s.get('learnCost', '');
    if (costStr) {
      def.learnCost = costStr.split(',').map(c => {
        const [item, amt] = c.trim().split(':');
        return { item: item.trim(), amount: parseInt(amt, 10) || 1 };
      });
    }
    def.learnMinHyperion = s.getInt('learnMinHyperion', 0);
    def.replacesSkill = s.get('replacesSkill', '');
    def.shopTier = s.getInt('shopTier', 0);

    registerSkill(def);
  }
}

// ============================================================
// 하드코딩 폴백 (skills.txt 없을 때)
// ============================================================

const ALL_SKILLS: SkillDef[] = [
  // Attack (5)
  {
    id: 'slash', name: '베기', description: '기본 베기 공격. 빠르고 안정적이다.',
    type: SkillType.Attack, effect: { damageMultiplier: 1.2 },
    mpCost: 5, tpCost: 0, hpCost: 0, preDelay: 0, postDelay: 0,
    appearRate: 0.8, maxUsesPerCombat: 99, element: -1,
    raceTagExpr: '', minLevel: 0, colorReq: [], isBasicSkill: true, basicForRace: '', roleAffinity: [],
  },
  {
    id: 'heavy_strike', name: '강타', description: '강력한 일격. 사용 후 잠시 행동 불가.',
    type: SkillType.Attack, effect: { damageMultiplier: 1.8 },
    mpCost: 10, tpCost: 0, hpCost: 0, preDelay: 0, postDelay: 1,
    appearRate: 0.6, maxUsesPerCombat: 5, element: 3,
    raceTagExpr: '', minLevel: 3, colorReq: [], isBasicSkill: false, basicForRace: '', roleAffinity: ['Adventurer', 'Guard'],
  },
  {
    id: 'flame_slash', name: '화염참', description: '불꽃을 실은 베기. TP를 소모한다.',
    type: SkillType.Attack, effect: { damageMultiplier: 2.0 },
    mpCost: 15, tpCost: 1, hpCost: 0, preDelay: 0, postDelay: 1,
    appearRate: 0.5, maxUsesPerCombat: 3, element: 0,
    raceTagExpr: '', minLevel: 5, colorReq: [0.3, 0, 0, 0, 0, 0, 0, 0], isBasicSkill: false, basicForRace: '', roleAffinity: ['Adventurer'],
  },
  {
    id: 'thunder_bolt', name: '번개', description: '번개를 소환해 강타한다. 준비 시간이 필요하다.',
    type: SkillType.Attack, effect: { damageMultiplier: 2.5 },
    mpCost: 20, tpCost: 1, hpCost: 0, preDelay: 1, postDelay: 1,
    appearRate: 0.4, maxUsesPerCombat: 2, element: 2,
    raceTagExpr: '/magic_affinity/ | /elemental/', minLevel: 7, colorReq: [0, 0, 0.4, 0, 0, 0, 0, 0], isBasicSkill: false, basicForRace: '', roleAffinity: ['Adventurer'],
  },
  {
    id: 'light_arrow', name: '빛의 화살', description: '빛 속성 화살. 빠르게 날아간다.',
    type: SkillType.Attack, effect: { damageMultiplier: 1.5 },
    mpCost: 8, tpCost: 0, hpCost: 0, preDelay: 0, postDelay: 0,
    appearRate: 0.7, maxUsesPerCombat: 8, element: 6,
    raceTagExpr: '', minLevel: 3, colorReq: [0, 0, 0, 0, 0, 0, 0.3, 0], isBasicSkill: false, basicForRace: '', roleAffinity: ['Adventurer'],
  },

  // Defense (3)
  {
    id: 'guard', name: '방어태세', description: '1턴 동안 방어력을 2배로 높인다.',
    type: SkillType.Defense, effect: { defenseMultiplier: 2.0, buffDuration: 1 },
    mpCost: 5, tpCost: 0, hpCost: 0, preDelay: 0, postDelay: 0,
    appearRate: 0.7, maxUsesPerCombat: 99, element: -1,
    raceTagExpr: '', minLevel: 0, colorReq: [], isBasicSkill: true, basicForRace: '', roleAffinity: [],
  },
  {
    id: 'iron_wall', name: '철벽', description: '2턴 동안 방어력을 3배로 높인다.',
    type: SkillType.Defense, effect: { defenseMultiplier: 3.0, buffDuration: 2 },
    mpCost: 15, tpCost: 1, hpCost: 0, preDelay: 1, postDelay: 0,
    appearRate: 0.4, maxUsesPerCombat: 2, element: -1,
    raceTagExpr: '', minLevel: 5, colorReq: [0, 0, 0, 0.3, 0, 0, 0, 0], isBasicSkill: false, basicForRace: '', roleAffinity: ['Guard'],
  },
  {
    id: 'dodge', name: '회피', description: '1턴 동안 모든 데미지를 무효화한다.',
    type: SkillType.Defense, effect: { defenseMultiplier: 999, buffDuration: 1 },
    mpCost: 8, tpCost: 0, hpCost: 0, preDelay: 0, postDelay: 0,
    appearRate: 0.6, maxUsesPerCombat: 5, element: -1,
    raceTagExpr: '', minLevel: 3, colorReq: [], isBasicSkill: false, basicForRace: '', roleAffinity: ['Adventurer'],
  },

  // Buff (4)
  {
    id: 'heal', name: '치유', description: 'HP를 30 회복한다.',
    type: SkillType.Buff, effect: { healHp: 30 },
    mpCost: 10, tpCost: 0, hpCost: 0, preDelay: 0, postDelay: 1,
    appearRate: 0.7, maxUsesPerCombat: 5, element: -1,
    raceTagExpr: '', minLevel: 0, colorReq: [], isBasicSkill: true, basicForRace: '', roleAffinity: [],
  },
  {
    id: 'focus', name: '집중', description: '3턴 동안 공격력을 1.5배로 높인다.',
    type: SkillType.Buff, effect: { attackMultiplier: 1.5, buffDuration: 3 },
    mpCost: 12, tpCost: 0, hpCost: 0, preDelay: 0, postDelay: 0,
    appearRate: 0.5, maxUsesPerCombat: 3, element: -1,
    raceTagExpr: '', minLevel: 3, colorReq: [], isBasicSkill: false, basicForRace: '', roleAffinity: ['Adventurer'],
  },
  {
    id: 'mana_charge', name: '마력충전', description: 'MP를 20 회복한다. TP가 필요하다.',
    type: SkillType.Buff, effect: { healMp: 20 },
    mpCost: 0, tpCost: 1, hpCost: 0, preDelay: 0, postDelay: 0,
    appearRate: 0.5, maxUsesPerCombat: 2, element: -1,
    raceTagExpr: '/magic_affinity/', minLevel: 5, colorReq: [], isBasicSkill: false, basicForRace: '', roleAffinity: ['Priest'],
  },
  {
    id: 'vigor_up', name: '기합', description: 'MP를 15 회복한다.',
    type: SkillType.Buff, effect: { healHp: 0 },
    mpCost: 8, tpCost: 0, hpCost: 0, preDelay: 0, postDelay: 0,
    appearRate: 0.6, maxUsesPerCombat: 5, element: -1,
    raceTagExpr: '', minLevel: 3, colorReq: [], isBasicSkill: false, basicForRace: '', roleAffinity: [],
  },

  // Debuff (3)
  {
    id: 'poison_mist', name: '독안개', description: '3턴 동안 매 턴 5의 독 데미지.',
    type: SkillType.Debuff, effect: { debuffType: 'poison', debuffValue: 5, debuffDuration: 3 },
    mpCost: 12, tpCost: 0, hpCost: 0, preDelay: 0, postDelay: 1,
    appearRate: 0.5, maxUsesPerCombat: 3, element: -1,
    raceTagExpr: '', minLevel: 5, colorReq: [], isBasicSkill: false, basicForRace: '', roleAffinity: ['Adventurer'],
  },
  {
    id: 'weaken', name: '약화', description: '3턴 동안 적의 공격력을 0.7배로 낮춘다.',
    type: SkillType.Debuff, effect: { debuffType: 'weaken', debuffValue: 0.7, debuffDuration: 3 },
    mpCost: 10, tpCost: 0, hpCost: 0, preDelay: 1, postDelay: 0,
    appearRate: 0.5, maxUsesPerCombat: 3, element: -1,
    raceTagExpr: '', minLevel: 5, colorReq: [], isBasicSkill: false, basicForRace: '', roleAffinity: [],
  },
  {
    id: 'slow', name: '둔화', description: '3턴 동안 적의 후딜레이를 +1 증가시킨다.',
    type: SkillType.Debuff, effect: { debuffType: 'slow', debuffValue: 1, debuffDuration: 3 },
    mpCost: 8, tpCost: 0, hpCost: 0, preDelay: 0, postDelay: 0,
    appearRate: 0.6, maxUsesPerCombat: 5, element: -1,
    raceTagExpr: '', minLevel: 3, colorReq: [], isBasicSkill: false, basicForRace: '', roleAffinity: [],
  },
];

// 폴백 초기화 — loadSkillDefs가 호출되지 않았을 때 사용
function ensureFallback(): void {
  if (skillRegistry.size === 0) {
    for (const s of ALL_SKILLS) {
      registerSkill(s);
    }
  }
}

// ============================================================
// 공개 API
// ============================================================

export function getSkillDef(id: string): SkillDef | undefined {
  ensureFallback();
  return skillRegistry.get(id);
}

export function getAllSkills(): readonly SkillDef[] {
  ensureFallback();
  return [...skillRegistry.values()];
}

export function getAllSkillDefs(): ReadonlyMap<string, SkillDef> {
  ensureFallback();
  return skillRegistry;
}

export function getSkillsByType(type: SkillType): SkillDef[] {
  ensureFallback();
  return skillsByType.get(type) ?? [];
}

/** 장소에서 학습 가능한 스킬 목록 */
export function getShopSkillsForLocation(locationId: string): SkillDef[] {
  ensureFallback();
  return [...skillRegistry.values()].filter(s => s.learnLocation === locationId && (s.shopTier ?? 0) > 0);
}

/** 종족별 기본 스킬 세트 반환 */
export function getBasicSkillsForRace(raceKey: string): SkillDef[] {
  ensureFallback();
  const raceBasics = basicSkillsByRace.get(raceKey);
  if (raceBasics && raceBasics.length > 0) return raceBasics;

  // 종족 전용 없으면 공용 기본 스킬 (basicForRace === '')
  const universal = [...skillRegistry.values()].filter(
    s => s.isBasicSkill && !s.basicForRace
  );
  return universal;
}

/** 스킬 수 */
export function getSkillCount(): number {
  ensureFallback();
  return skillRegistry.size;
}

/** 종족 전용이 아닌 학습 가능 스킬만 반환 */
export function getNonBasicSkills(): SkillDef[] {
  ensureFallback();
  return [...skillRegistry.values()].filter(s => !s.isBasicSkill);
}

/** 스킬 타입 한국어 이름 */
export function skillTypeName(type: SkillType): string {
  switch (type) {
    case SkillType.Attack: return '공격';
    case SkillType.Defense: return '방어';
    case SkillType.Buff: return '버프';
    case SkillType.Debuff: return '디버프';
  }
}

/** 원소 인덱스 → 원소 이름 (스킬 UI용) */
export function skillElementName(element: number): string {
  const names = ['불', '물', '전기', '철', '흙', '바람', '빛', '어둠'];
  if (element < 0 || element >= names.length) return '무속성';
  return names[element];
}
