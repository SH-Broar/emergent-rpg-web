// dungeon.ts — 던전 시스템
// 원본: DungeonSystem.h

import { ItemType, Element } from '../types/enums';
import { TimeWindow } from '../types/game-time';
import { LocationID } from '../types/location';
import { randomInt, randomFloat } from '../types/rng';

export interface LootEntry {
  item: ItemType;
  amount: number;
  chance: number; // 0~1
  itemId?: string; // 특정 아이템 ID (있으면 item 대신 사용)
}

/** 루트 테이블 판정 — 확률에 따라 획득 아이템 목록 반환 */
export function rollLoot(table: LootEntry[]): LootEntry[] {
  const result: LootEntry[] = [];
  for (const entry of table) {
    if (randomFloat(0, 1) <= entry.chance) {
      result.push(entry);
    }
  }
  return result;
}

export interface MonsterSkillDef {
  name: string;
  type: 'attack' | 'heal' | 'buff';
  value: number;        // 데미지 배율 또는 힐량
  description: string;
}

export interface MonsterDef {
  id: string;
  name: string;
  attack: number;
  defense: number;
  hp: number;
  lootTable: LootEntry[];
  skills: MonsterSkillDef[];
  skillChance: number;  // 0.0~1.0, 틱당 스킬 발동 확률
  /** 첫 본 공격(버스트가 아닐 때)에만 적용되는 공격력 배율. 이후 턴은 기본 attack만 사용한다. */
  openingAttackMultiplier?: number;
  /** 턴당 연속 명중(방어 무시). burstOnce면 전투 중 첫 발동만. */
  burstHitCount?: number;
  burstHitDamage?: number;
  burstOnce?: boolean;
  /** 적 턴 처리 후 매 틱 추가로 들어오는 피해(이상 신호·도트 압박 등) */
  tickPressureDamage?: number;
  /** 0~1. 플레이어 자동 공격·동료 공격·공격 스킬이 빗맞을 확률(비행·환영 등) */
  evasionChance?: number;
}

/** 플레이어 측 공격이 빗맞을지 굴림 */
export function rollMonsterEvasionMiss(enemy: MonsterDef): boolean {
  const raw = enemy.evasionChance ?? 0;
  if (raw <= 0) return false;
  const p = Math.min(0.92, raw);
  return randomFloat(0, 1) < p;
}

export enum DungeonEventType { Treasure, Hazard, Heal, Discovery }

export interface DungeonEventDef {
  id: string;
  name: string;
  description: string;
  chance: number;
  type: DungeonEventType;
  gives: LootEntry[];
  hpDamage: number;
  vigorDamage: number;
  hpHeal: number;
  vigorHeal: number;
  colorInfluence: number[];
  ruleTemplates?: string[];
  dungeonIds?: string[];
  accessFrom?: LocationID[];
}

export type DungeonRuleTemplateId =
  | 'MoonPhase'
  | 'TidalRoute'
  | 'CollapsingPath'
  | 'DeepFog'
  | 'FrostPressure'
  | 'PredatorTerritory'
  | 'TraceHunt'
  | 'AncientResonance'
  | 'HeatGauge'
  | 'PurityCurrent'
  | 'GreedRisk'
  | 'ShelterWindow';

export interface DungeonRuleConfig {
  template: DungeonRuleTemplateId | string;
  rank: number;
  valueA: number;
  valueB: number;
  valueC: number;
  hint: string;
}

export interface MidBossDef {
  afterFloor: number;
  enemyId: string;
}

export interface DungeonFloorDef {
  floor: number;
  enemyIds: string[];
}

export interface DungeonDef {
  id: string;
  name: string;
  deepName: string;
  description: string;
  deepDescription: string;
  difficulty: number;
  progressPerAdvance: number;
  accessFrom: LocationID;
  availableHours?: TimeWindow;
  hiddenLocation?: LocationID;
  hiddenUnlockProgress?: number;
  rule?: DungeonRuleConfig;
  enemyIds: string[];
  lootOnClear: LootEntry[];
  lootPerAdvance: LootEntry[];
  lootRareChance: number;
  lootRare: LootEntry[];
  colorInfluence: number[];
  floors: number;
  progressSteps: number;
  choicesPerStep: number;
  requiredClears: number;
  midBosses: MidBossDef[];
  floorDefs: DungeonFloorDef[];
  combatWeight: number;
  eventWeight: number;
  restWeight: number;
  /** S랭크: 보스 클리어까지 총 턴 수가 이 값 이하이면 달성 (입수·연출용) */
  sRankTurnLimit?: number;
}

export interface CombatBehaviorRule {
  hpThresholdRetreat: number;
  hpThresholdRest: number;
  vigorMinimum: number;
  mpCostPerTurn: number;
}

export interface ColorCombatRule {
  element: Element;
  isHigh: boolean;
  threshold: number;
  effect: string;
  value: number;
}

export interface CombatState {
  dungeonId: string;
  combatTurn: number;
  currentEnemy: MonsterDef;
  enemyHp: number;
  combatLog: string[];
}

export interface CombatTurnResult {
  damageDealt: number;
  damageTaken: number;
  vigorCost: number;
  mpCost: number;
  enemyDead: boolean;
  playerDead: boolean;
  attackMod: number;
  defenseMod: number;
}

export enum DungeonAction { Advance, Rest, Retreat }

// ============================================================
// 던전 탐색 (방 기반)
// ============================================================

export enum RoomType { Combat, Event, Rest }

export interface DungeonRoom {
  type: RoomType;
  label: string;
  enemyId?: string;
  eventIdx?: number;
}

export interface StepChoice {
  type: RoomType;
  label: string;
  enemyId?: string;
  eventIdx?: number;
  cleared: boolean;
}

export interface DungeonRunState {
  dungeonId: string;
  floor: number;
  maxFloor: number;
  step: number;
  maxStep: number;
  choices: StepChoice[];
  requiredClears: number;
  bossDefeated: boolean;
  roomsCleared: number;
  totalTurns: number;
  ruleIntensity: number;
  tracePoints: number;
  resonance: number;
  heat: number;
  purity: number;
  greed: number;
}

export class DungeonSystem {
  private dungeons: DungeonDef[] = [];
  private monsters = new Map<string, MonsterDef>();
  private dungeonEvents: DungeonEventDef[] = [];
  private defaultRule: CombatBehaviorRule = {
    hpThresholdRetreat: 20, hpThresholdRest: 40, vigorMinimum: 10, mpCostPerTurn: 5,
  };
  private roleRules = new Map<string, CombatBehaviorRule>();
  private colorRules: ColorCombatRule[] = [];

  addDungeon(d: DungeonDef): void { this.dungeons.push(d); }
  addMonster(m: MonsterDef): void { this.monsters.set(m.id, m); }
  addDungeonEvent(e: DungeonEventDef): void { this.dungeonEvents.push(e); }
  setDefaultRule(r: CombatBehaviorRule): void { this.defaultRule = r; }
  setRoleRule(role: string, r: CombatBehaviorRule): void { this.roleRules.set(role, r); }
  addColorRule(r: ColorCombatRule): void { this.colorRules.push(r); }

  getDungeon(id: string): DungeonDef | undefined {
    return this.dungeons.find(d => d.id === id);
  }

  getAllDungeons(): readonly DungeonDef[] { return this.dungeons; }

  isDungeonEntrance(loc: LocationID): boolean {
    return this.dungeons.some(d => d.accessFrom === loc);
  }

  getDungeonByLocation(loc: LocationID): DungeonDef | undefined {
    return this.dungeons.find(d => d.accessFrom === loc || d.accessFrom + '_Deep' === loc);
  }

  isDeepLocation(loc: LocationID): boolean {
    return loc.endsWith('_Deep');
  }

  selectEnemy(dungeon: DungeonDef, floor = 0): MonsterDef {
    const floorDef = dungeon.floorDefs.find(f => f.floor === floor);
    const enemyIds = floorDef?.enemyIds ?? dungeon.enemyIds;
    if (enemyIds.length === 0) {
      return { id: 'unknown', name: '???', attack: 5, defense: 3, hp: 20, lootTable: [], skills: [], skillChance: 0 };
    }
    const idx = randomInt(0, enemyIds.length - 1);
    const id = enemyIds[idx];
    return this.monsters.get(id) ?? { id, name: id, attack: 10, defense: 5, hp: 30, lootTable: [], skills: [], skillChance: 0 };
  }

  calcDifficultyStars(dungeon: DungeonDef): number {
    return Math.max(1, Math.min(10, Math.round(dungeon.difficulty * 10)));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private computeRuleIntensity(dungeon: DungeonDef, depth: number, hour: number): number {
    const rule = dungeon.rule;
    if (!rule) return 0;
    switch (rule.template) {
      case 'MoonPhase': {
        const isNight = hour >= 18 || hour < 6;
        if (!isNight) return this.clamp(rule.valueC, 0, 1);
        const nightBonus = hour >= 18 ? (hour - 18) / 6 : (6 - hour) / 6;
        return this.clamp(rule.valueA + nightBonus * 0.12 + depth * 0.01, 0, 0.45);
      }
      case 'TidalRoute': {
        const cycle = Math.max(2, Math.round(rule.valueA || 2));
        const highTide = depth % cycle === 0;
        return this.clamp((highTide ? rule.valueC : rule.valueB) + depth * 0.01, 0, 0.35);
      }
      case 'CollapsingPath':
        return this.clamp(rule.valueA * 0.03 + depth * 0.025 + rule.rank * 0.01, 0, 0.40);
      case 'DeepFog':
        return this.clamp(rule.valueA + depth * 0.015, 0, 0.40);
      case 'FrostPressure':
        return this.clamp(rule.valueA * 0.03 + depth * 0.02, 0, 0.45);
      case 'PredatorTerritory':
        return this.clamp(rule.valueA + depth * 0.02 + rule.rank * 0.01, 0, 0.45);
      case 'TraceHunt':
        return this.clamp(rule.rank * 0.04 + depth * 0.01, 0, 0.30);
      case 'AncientResonance':
        return this.clamp(rule.valueA * 0.04 + depth * 0.012, 0, 0.35);
      case 'HeatGauge':
        return this.clamp(rule.valueA * 0.03 + depth * 0.02, 0, 0.45);
      case 'PurityCurrent':
        return this.clamp(rule.valueA * 0.03 + depth * 0.01, 0, 0.35);
      case 'GreedRisk':
        return this.clamp(rule.valueB + depth * 0.015 + rule.rank * 0.01, 0, 0.40);
      case 'ShelterWindow': {
        const cycle = Math.max(2, Math.round(rule.valueA || 3));
        const shelterOpen = depth % cycle === 0;
        return this.clamp(shelterOpen ? rule.valueB : rule.valueC, 0, 0.35);
      }
      default:
        return 0;
    }
  }

  private getRoomWeights(dungeon: DungeonDef, depth: number, hour: number): { combat: number; event: number; rest: number } {
    let combat = dungeon.combatWeight;
    let event = dungeon.eventWeight;
    let rest = dungeon.restWeight;
    const rule = dungeon.rule;
    const intensity = this.computeRuleIntensity(dungeon, depth, hour);
    if (!rule) return { combat, event, rest };

    switch (rule.template) {
      case 'MoonPhase':
        event += intensity;
        combat += rule.valueB * 0.4;
        rest -= intensity * 0.6;
        break;
      case 'TidalRoute': {
        const cycle = Math.max(2, Math.round(rule.valueA || 2));
        const highTide = depth % cycle === 0;
        if (highTide) {
          combat += rule.valueC + intensity;
          event -= Math.max(0.02, rule.valueB * 0.4);
        } else {
          event += rule.valueB + intensity * 0.5;
          rest += 0.04;
          combat -= Math.max(0.03, rule.valueC * 0.4);
        }
        break;
      }
      case 'CollapsingPath':
        combat += intensity * 0.6;
        event += rule.valueC * 0.2;
        rest -= Math.max(0.06, rule.valueB);
        break;
      case 'DeepFog':
        event += rule.valueB;
        combat -= rule.valueC;
        rest -= Math.max(0.03, rule.valueC * 0.5);
        break;
      case 'FrostPressure':
        combat += intensity * 0.35;
        event += rule.valueB * 0.25;
        rest -= Math.max(0.05, rule.valueB);
        break;
      case 'PredatorTerritory':
        combat += intensity;
        rest -= Math.max(0.08, rule.valueB);
        event -= Math.max(0.02, rule.valueC * 0.3);
        break;
      case 'TraceHunt':
        event += rule.valueA * 0.05 + intensity * 0.4;
        combat -= Math.max(0.03, rule.valueC);
        rest -= 0.03;
        break;
      case 'AncientResonance':
        event += rule.valueB + intensity * 0.3;
        rest -= 0.03;
        combat -= Math.max(0.02, rule.valueC * 0.2);
        break;
      case 'HeatGauge':
        combat += intensity * 0.5;
        event += rule.valueC * 0.2;
        rest += 0.03;
        break;
      case 'PurityCurrent':
        event += rule.valueB * 0.35;
        rest += intensity * 0.45;
        combat -= Math.max(0.04, rule.valueC * 0.25);
        break;
      case 'GreedRisk':
        combat += intensity * 0.55;
        event += rule.valueA * 0.2;
        rest -= Math.max(0.05, rule.valueC);
        break;
      case 'ShelterWindow': {
        const cycle = Math.max(2, Math.round(rule.valueA || 3));
        const shelterOpen = depth % cycle === 0;
        if (shelterOpen) {
          rest += rule.valueB + 0.08;
          combat -= 0.06;
        } else {
          rest -= Math.max(0.05, rule.valueC);
          combat += 0.04;
        }
        break;
      }
    }

    combat = this.clamp(combat, 0.15, 0.80);
    event = this.clamp(event, 0.10, 0.60);
    rest = this.clamp(rest, 0.05, 0.40);
    const total = combat + event + rest;
    return { combat: combat / total, event: event / total, rest: rest / total };
  }

  // @ts-ignore — reserved for future rule use
  private getSidePathChance(dungeon: DungeonDef, depth: number, hour: number): number {
    let chance = 0.40;
    const rule = dungeon.rule;
    const intensity = this.computeRuleIntensity(dungeon, depth, hour);
    if (!rule) return chance;
    switch (rule.template) {
      case 'MoonPhase':
        chance += rule.valueB + intensity * 0.5;
        break;
      case 'TidalRoute': {
        const cycle = Math.max(2, Math.round(rule.valueA || 2));
        const highTide = depth % cycle === 0;
        chance += highTide ? -rule.valueC * 0.5 : rule.valueB + intensity * 0.4;
        break;
      }
      case 'CollapsingPath':
        chance += rule.valueC * 0.2 - intensity * 0.35;
        break;
      case 'DeepFog':
        chance += rule.valueB + intensity * 0.35;
        break;
      case 'FrostPressure':
        chance -= rule.valueB * 0.4;
        break;
      case 'PredatorTerritory':
        chance -= rule.valueB + intensity * 0.35;
        break;
      case 'TraceHunt':
        chance += rule.valueA * 0.06 + intensity * 0.3;
        break;
      case 'AncientResonance':
        chance += rule.valueB * 0.2;
        break;
      case 'HeatGauge':
        chance -= rule.valueC * 0.3;
        break;
      case 'PurityCurrent':
        chance += rule.valueB * 0.15;
        break;
      case 'GreedRisk':
        chance += rule.valueA * 0.1;
        break;
      case 'ShelterWindow': {
        const cycle = Math.max(2, Math.round(rule.valueA || 3));
        const shelterOpen = depth % cycle === 0;
        chance += shelterOpen ? 0.06 : -rule.valueC * 0.2;
        break;
      }
    }
    return this.clamp(chance, 0.10, 0.75);
  }

  getEffectiveDepth(run: DungeonRunState): number {
    return run.floor * run.maxStep + run.step;
  }

  getRuleStatus(dungeon: DungeonDef, run: DungeonRunState, hour: number): string {
    const rule = dungeon.rule;
    if (!rule) return '';
    const depth = this.getEffectiveDepth(run);
    const intensity = this.computeRuleIntensity(dungeon, depth, hour);
    switch (rule.template) {
      case 'MoonPhase':
        return `달빛 농도 ${Math.round(intensity * 100)}% · 밤일수록 샛길과 특수 이벤트가 늘어난다.`;
      case 'TidalRoute': {
        const cycle = Math.max(2, Math.round(rule.valueA || 2));
        const highTide = depth % cycle === 0;
        return `${highTide ? '밀물' : '썰물'} 흐름 · ${highTide ? '전투 압박이 높다.' : '샛길과 이벤트가 늘어난다.'}`;
      }
      case 'CollapsingPath':
        return `붕락 압력 ${Math.round(intensity * 100)}% · 머뭇거릴수록 불리하고 휴식 여유가 줄어든다.`;
      case 'DeepFog':
        return `안개 농도 ${Math.round(intensity * 100)}% · 일부 길 정보가 흐려지고 샛길이 조금 늘어난다.`;
      case 'FrostPressure':
        return `한기 압력 ${Math.round(intensity * 100)}% · 깊어질수록 휴식 효율이 떨어진다.`;
      case 'PredatorTerritory':
        return `추적 압력 ${Math.round(intensity * 100)}% · 깊게 쉴수록 불리하고 전투가 잦아진다.`;
      case 'TraceHunt': {
        const target = Math.max(2, Math.round(rule.valueB || 3));
        return `흔적 ${run.tracePoints}/${target} · 단서를 모을수록 샛길을 더 잘 찾아낸다.`;
      }
      case 'AncientResonance':
        return `공명 ${run.resonance}층 · 쌓일수록 작은 회복과 유리한 흐름이 생긴다.`;
      case 'HeatGauge':
        return `열기 ${run.heat}단계 · 높을수록 돌파 압박이 커지고 쉬면 열기가 식는다.`;
      case 'PurityCurrent':
        return `정화 ${run.purity}층 · 회복과 안정이 조금씩 쌓인다.`;
      case 'GreedRisk':
        return `욕심 ${run.greed}단계 · 더 노릴수록 보상과 위험이 함께 커진다.`;
      case 'ShelterWindow': {
        const cycle = Math.max(2, Math.round(rule.valueA || 3));
        const next = cycle - (depth % cycle);
        return depth % cycle === 0
          ? '은신처 구간 · 이번 층은 휴식 방과 회복 효율이 좋아진다.'
          : `다음 은신처까지 ${next}단계 · 지금은 장기 탐사 압박이 더 크다.`;
      }
      default:
        return rule.hint;
    }
  }

  private eventMatchesDungeon(event: DungeonEventDef, dungeon?: DungeonDef): boolean {
    if (!dungeon) return true;
    if (event.dungeonIds && event.dungeonIds.length > 0 && !event.dungeonIds.includes(dungeon.id)) return false;
    if (event.accessFrom && event.accessFrom.length > 0 && !event.accessFrom.includes(dungeon.accessFrom)) return false;
    if (event.ruleTemplates && event.ruleTemplates.length > 0) {
      const template = dungeon.rule?.template ?? '';
      if (!event.ruleTemplates.includes(template)) return false;
    }
    return true;
  }

  rollDungeonEvent(dungeon?: DungeonDef): DungeonEventDef | null {
    const pool = this.dungeonEvents.filter(e => this.eventMatchesDungeon(e, dungeon));
    for (const e of pool) {
      if (randomFloat(0, 1) < e.chance) return e;
    }
    return null;
  }

  simulateCombatTurn(
    playerAttack: number, playerDefense: number, playerHp: number,
    colorValues: number[], state: CombatState,
  ): CombatTurnResult {
    let attackMod = 1.0;
    let defenseMod = 1.0;
    for (const rule of this.colorRules) {
      const val = colorValues[rule.element] ?? 0.5;
      const meets = rule.isHigh ? val >= rule.threshold : val <= rule.threshold;
      if (meets) {
        if (rule.effect === 'bonus_attack') attackMod += rule.value;
        if (rule.effect === 'bonus_defense') defenseMod += rule.value;
      }
    }

    const dmg = Math.max(1, Math.round(playerAttack * attackMod - state.currentEnemy.defense * 0.5));
    const taken = Math.max(0, Math.round(state.currentEnemy.attack - playerDefense * defenseMod * 0.5));
    state.enemyHp -= dmg;
    state.combatTurn++;

    return {
      damageDealt: dmg,
      damageTaken: taken,
      vigorCost: 5,
      mpCost: this.defaultRule.mpCostPerTurn,
      enemyDead: state.enemyHp <= 0,
      playerDead: playerHp - taken <= 0,
      attackMod,
      defenseMod,
    };
  }

  getBehaviorRule(role: string): CombatBehaviorRule {
    return this.roleRules.get(role) ?? this.defaultRule;
  }

  getNpcDungeonChoice(hpRatio: number, vigorRatio: number, role: string): DungeonAction {
    const rule = this.getBehaviorRule(role);
    if (hpRatio * 100 < rule.hpThresholdRetreat) return DungeonAction.Retreat;
    if (hpRatio * 100 < rule.hpThresholdRest || vigorRatio * 100 < rule.vigorMinimum) return DungeonAction.Rest;
    return DungeonAction.Advance;
  }

  // ============================================================
  // 방 기반 던전 탐색
  // ============================================================

  /** 던전 총 층 수 */
  calcMaxDepth(dungeon: DungeonDef): number {
    return dungeon.floors;
  }

  /** 랜덤 방 생성 (전투 50%, 이벤트 25%, 휴식 25%) */
  generateRoom(dungeon: DungeonDef, floor: number, depth = 0, hour = 12): DungeonRoom {
    const weights = this.getRoomWeights(dungeon, depth, hour);
    const roll = randomFloat(0, 1);
    if (roll < weights.combat) {
      const enemy = this.selectEnemy(dungeon, floor);
      return { type: RoomType.Combat, label: `전투: ${enemy.name}`, enemyId: enemy.id };
    } else if (roll < weights.combat + weights.event) {
      const event = this.rollDungeonEvent(dungeon);
      if (event) {
        const idx = this.dungeonEvents.indexOf(event);
        return { type: RoomType.Event, label: `이벤트: ${event.name}`, eventIdx: idx };
      }
      const enemy = this.selectEnemy(dungeon, floor);
      return { type: RoomType.Combat, label: `전투: ${enemy.name}`, enemyId: enemy.id };
    } else {
      return { type: RoomType.Rest, label: '휴식' };
    }
  }

  /** 보스 방 생성 — 해당 던전의 가장 강한 적 */
  generateBossRoom(dungeon: DungeonDef): DungeonRoom {
    const lastEnemyId = dungeon.enemyIds[dungeon.enemyIds.length - 1];
    const boss = this.monsters.get(lastEnemyId);
    const bossName = boss?.name ?? lastEnemyId;
    return { type: RoomType.Combat, label: `보스: ${bossName}`, enemyId: lastEnemyId };
  }

  /** N개 선택지 생성 */
  generateChoices(dungeon: DungeonDef, floor: number, step: number, hour: number): StepChoice[] {
    const n = dungeon.choicesPerStep;
    const depth = floor * dungeon.progressSteps + step;
    const choices: StepChoice[] = [];
    for (let i = 0; i < n; i++) {
      const room = this.generateRoom(dungeon, floor, depth, hour);
      choices.push({
        type: room.type,
        label: room.label,
        enemyId: room.enemyId,
        eventIdx: room.eventIdx,
        cleared: false,
      });
    }
    return choices;
  }

  /** 던전 탐색 초기 상태 생성 */
  createRunState(dungeon: DungeonDef, hour = 12): DungeonRunState {
    return {
      dungeonId: dungeon.id,
      floor: 0,
      maxFloor: dungeon.floors,
      step: 0,
      maxStep: dungeon.progressSteps,
      choices: this.generateChoices(dungeon, 0, 0, hour),
      requiredClears: dungeon.requiredClears,
      bossDefeated: false,
      roomsCleared: 0,
      totalTurns: 0,
      ruleIntensity: this.computeRuleIntensity(dungeon, 0, hour),
      tracePoints: 0,
      resonance: 0,
      heat: 0,
      purity: 0,
      greed: 0,
    };
  }

  /** 다음 진행 단계 또는 층으로 전진 */
  advanceStep(run: DungeonRunState, dungeon: DungeonDef, hour = 12): 'nextStep' | 'nextFloor' | 'midBoss' | 'boss' {
    run.step++;
    const depth = run.floor * run.maxStep + run.step;
    run.ruleIntensity = this.computeRuleIntensity(dungeon, depth, hour);

    if (run.step >= run.maxStep) {
      const prevFloor = run.floor;
      run.floor++;
      run.step = 0;

      if (run.floor >= run.maxFloor) {
        return 'boss';
      }

      const midBoss = dungeon.midBosses.find(m => m.afterFloor === prevFloor);
      if (midBoss) {
        return 'midBoss';
      }

      run.choices = this.generateChoices(dungeon, run.floor, 0, hour);
      return 'nextFloor';
    }

    run.choices = this.generateChoices(dungeon, run.floor, run.step, hour);
    return 'nextStep';
  }

  /** 중간 보스 격파 후 계속 진행 */
  continueAfterMidBoss(run: DungeonRunState, dungeon: DungeonDef, hour = 12): void {
    run.choices = this.generateChoices(dungeon, run.floor, run.step, hour);
  }

  /** 중간 보스 조회 */
  getMidBoss(dungeon: DungeonDef, afterFloor: number): MonsterDef | null {
    const mb = dungeon.midBosses.find(m => m.afterFloor === afterFloor);
    if (!mb) return null;
    return this.monsters.get(mb.enemyId) ?? null;
  }

  /** 이벤트 인덱스로 이벤트 조회 */
  getDungeonEventByIndex(idx: number): DungeonEventDef | null {
    return this.dungeonEvents[idx] ?? null;
  }
}
