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

export interface DungeonRunState {
  dungeonId: string;
  depth: number;
  maxDepth: number;
  leftRoom: DungeonRoom;
  rightRoom: DungeonRoom;
  hasSidePath: boolean;
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

  selectEnemy(dungeon: DungeonDef, progress: number): MonsterDef {
    if (dungeon.enemyIds.length === 0) {
      return { id: 'unknown', name: '???', attack: 5, defense: 3, hp: 20, lootTable: [], skills: [], skillChance: 0 };
    }
    const maxIdx = Math.min(
      dungeon.enemyIds.length - 1,
      Math.floor((progress / 100) * dungeon.enemyIds.length)
    );
    const idx = randomInt(0, maxIdx);
    const id = dungeon.enemyIds[idx];
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
    let combat = 0.50;
    let event = 0.25;
    let rest = 0.25;
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

  getRuleStatus(dungeon: DungeonDef, run: DungeonRunState, hour: number): string {
    const rule = dungeon.rule;
    if (!rule) return '';
    const intensity = this.computeRuleIntensity(dungeon, run.depth, hour);
    switch (rule.template) {
      case 'MoonPhase':
        return `달빛 농도 ${Math.round(intensity * 100)}% · 밤일수록 샛길과 특수 이벤트가 늘어난다.`;
      case 'TidalRoute': {
        const cycle = Math.max(2, Math.round(rule.valueA || 2));
        const highTide = run.depth % cycle === 0;
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
        const next = cycle - (run.depth % cycle);
        return run.depth % cycle === 0
          ? '은신처 구간 · 이번 층은 휴식 방과 회복 효율이 좋아진다.'
          : `다음 은신처까지 ${next}층 · 지금은 장기 탐사 압박이 더 크다.`;
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

  /** 던전 난이도 기반 최대 깊이 (보스 등장 층) */
  calcMaxDepth(dungeon: DungeonDef): number {
    return Math.round(5 + dungeon.difficulty * 3);
  }

  /** 랜덤 방 생성 (전투 50%, 이벤트 25%, 휴식 25%) */
  generateRoom(dungeon: DungeonDef, progress: number, depth = 0, hour = 12): DungeonRoom {
    const weights = this.getRoomWeights(dungeon, depth, hour);
    const roll = randomFloat(0, 1);
    if (roll < weights.combat) {
      // 전투 방
      const enemy = this.selectEnemy(dungeon, progress);
      return { type: RoomType.Combat, label: `전투: ${enemy.name}`, enemyId: enemy.id };
    } else if (roll < weights.combat + weights.event) {
      // 이벤트 방
      const event = this.rollDungeonEvent(dungeon);
      if (event) {
        const idx = this.dungeonEvents.indexOf(event);
        return { type: RoomType.Event, label: `이벤트: ${event.name}`, eventIdx: idx };
      }
      // 이벤트 없으면 전투로 대체
      const enemy = this.selectEnemy(dungeon, progress);
      return { type: RoomType.Combat, label: `전투: ${enemy.name}`, enemyId: enemy.id };
    } else {
      // 휴식 방
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

  /** 던전 탐색 초기 상태 생성 */
  createRunState(dungeon: DungeonDef, progress: number, hour = 12): DungeonRunState {
    return {
      dungeonId: dungeon.id,
      depth: 0,
      maxDepth: this.calcMaxDepth(dungeon),
      leftRoom: this.generateRoom(dungeon, progress, 0, hour),
      rightRoom: this.generateRoom(dungeon, progress, 0, hour),
      hasSidePath: randomFloat(0, 1) < this.getSidePathChance(dungeon, 0, hour),
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

  /** 방 클리어 후 다음 방 생성 */
  advanceRun(run: DungeonRunState, dungeon: DungeonDef, progress: number, hour = 12): void {
    run.depth++;
    run.roomsCleared++;
    run.ruleIntensity = this.computeRuleIntensity(dungeon, run.depth, hour);
    if (run.depth >= run.maxDepth) {
      // 보스 방
      run.leftRoom = this.generateBossRoom(dungeon);
      run.rightRoom = this.generateBossRoom(dungeon);
      run.hasSidePath = false;
    } else {
      run.leftRoom = this.generateRoom(dungeon, progress, run.depth, hour);
      run.rightRoom = this.generateRoom(dungeon, progress, run.depth, hour);
      run.hasSidePath = randomFloat(0, 1) < this.getSidePathChance(dungeon, run.depth, hour);
    }
  }

  /** 이벤트 인덱스로 이벤트 조회 */
  getDungeonEventByIndex(idx: number): DungeonEventDef | null {
    return this.dungeonEvents[idx] ?? null;
  }
}
