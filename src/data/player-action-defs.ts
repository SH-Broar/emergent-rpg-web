// player-action-defs.ts — 플레이어 영향 액션 튜닝 레지스트리
//
// 액션 로직(predicate / execute side effects)은 src/systems/player-actions.ts 에 그대로 남고,
// 디자이너가 조정할 수 있는 수치·문구만 public/data/player_actions.txt 에서 읽어 보관한다.

import type { DataSection } from './parser';

export interface PlayerActionTuning {
  vigorCost?: number;
  goldCost?: number;
  minNpcs?: number;
  minHour?: number;
  maxHour?: number;
  minOre?: number;
  foodCost?: number;
  maxCompanions?: number;

  npcMoodDelta?: number;
  npcTrustDelta?: number;
  npcAffinityDelta?: number;
  playerTrustDelta?: number;
  playerAffinityDelta?: number;
  companionTrustDelta?: number;
  companionAffinityDelta?: number;
  targetMoodDelta?: number;
  targetTrustDelta?: number;
  targetAffinityDelta?: number;

  memoryWeight?: number;
  targetMemoryWeight?: number;
  reciprocateMemoryWeight?: number;

  rumorImportance?: number;
  rumorTemplate?: string;
  message?: string;

  capacityMultiplier?: number;
  resourceMultiplier?: number;
  dangerReduction?: number;

  reciprocateAffinityThreshold?: number;

  /** share_news 액션 전용 — news_1, news_2, ... 순으로 수집된 소문 템플릿 */
  newsTemplates?: string[];
}

const tuningRegistry = new Map<string, PlayerActionTuning>();
let settlementLocations: Set<string> = new Set();
let dataLoaded = false;

function numOrUndef(s: DataSection, key: string): number | undefined {
  if (!s.has(key)) return undefined;
  const v = s.getFloat(key, NaN);
  return Number.isFinite(v) ? v : undefined;
}
function strOrUndef(s: DataSection, key: string): string | undefined {
  if (!s.has(key)) return undefined;
  return s.get(key, '');
}

function parseSection(s: DataSection): PlayerActionTuning {
  const t: PlayerActionTuning = {};
  // 숫자 필드
  for (const key of [
    'vigorCost', 'goldCost', 'minNpcs', 'minHour', 'maxHour', 'minOre', 'foodCost', 'maxCompanions',
    'npcMoodDelta', 'npcTrustDelta', 'npcAffinityDelta',
    'playerTrustDelta', 'playerAffinityDelta',
    'companionTrustDelta', 'companionAffinityDelta',
    'targetMoodDelta', 'targetTrustDelta', 'targetAffinityDelta',
    'memoryWeight', 'targetMemoryWeight', 'reciprocateMemoryWeight',
    'rumorImportance',
    'capacityMultiplier', 'resourceMultiplier', 'dangerReduction',
    'reciprocateAffinityThreshold',
  ] as const) {
    const v = numOrUndef(s, key);
    if (v !== undefined) (t as Record<string, number>)[key] = v;
  }
  // 문자열 필드
  for (const key of ['rumorTemplate', 'message'] as const) {
    const v = strOrUndef(s, key);
    if (v !== undefined) (t as Record<string, string>)[key] = v;
  }
  // 뉴스 템플릿 — news_1, news_2, ...
  const news: string[] = [];
  for (let i = 1; i <= 50; i++) {
    if (s.has(`news_${i}`)) {
      const line = s.get(`news_${i}`, '').trim();
      if (line) news.push(line);
    } else if (i > news.length + 1) {
      // 연속 키만 받음 — 끊기면 종료
      break;
    }
  }
  if (news.length > 0) t.newsTemplates = news;
  return t;
}

export function loadPlayerActionDefs(sections: DataSection[]): void {
  tuningRegistry.clear();
  settlementLocations = new Set();
  dataLoaded = false;
  for (const s of sections) {
    const id = s.name.trim();
    if (!id || id.startsWith('#')) continue;
    if (id === '__SettlementLocations') {
      const raw = s.get('locations', '');
      for (const loc of raw.split(',')) {
        const trimmed = loc.trim();
        if (trimmed) settlementLocations.add(trimmed);
      }
      continue;
    }
    tuningRegistry.set(id, parseSection(s));
  }
  dataLoaded = tuningRegistry.size > 0 || settlementLocations.size > 0;
}

export function getPlayerActionTuning(actionId: string): PlayerActionTuning | undefined {
  return tuningRegistry.get(actionId);
}

export function getSettlementLocations(): ReadonlySet<string> {
  return settlementLocations;
}

export function isPlayerActionDataLoaded(): boolean {
  return dataLoaded;
}

/** 메시지 템플릿 치환 헬퍼 (npc-life-event-defs 와 동일한 규칙) */
export function formatActionMessage(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key];
    return val === undefined ? `{${key}}` : String(val);
  });
}
