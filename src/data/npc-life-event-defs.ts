// npc-life-event-defs.ts — NPC 생활 이벤트 튜닝 데이터 레지스트리
//
// 이벤트 실행 로직은 src/systems/npc-life.ts 에 그대로 남아 있다.
// 이 파일은 디자이너가 조정할 수 있는 수치·문구만 public/data/npc_life_events.txt 에서 읽어 저장한다.

import type { DataSection } from './parser';

export interface LifeEventTuning {
  weight?: number;
  cooldownDays?: number;
  a1MoodDelta?: number;
  a2MoodDelta?: number;
  a1TrustDelta?: number;
  a1AffinityDelta?: number;
  a2TrustDelta?: number;
  a2AffinityDelta?: number;
  a1MemoryWeight?: number;
  a2MemoryWeight?: number;
  /** 백로그 메시지 템플릿. 플레이스홀더 {a1}/{a2}/{location}/{gift}/{pctLabel} */
  message?: string;
}

const tuningRegistry = new Map<string, LifeEventTuning>();

function numOrUndef(s: DataSection, key: string): number | undefined {
  if (!s.has(key)) return undefined;
  const v = s.getFloat(key, NaN);
  return Number.isFinite(v) ? v : undefined;
}

export function loadNpcLifeEventDefs(sections: DataSection[]): void {
  tuningRegistry.clear();
  for (const s of sections) {
    const id = s.name.trim();
    if (!id || id.startsWith('#')) continue;
    const tuning: LifeEventTuning = {};
    tuning.weight = numOrUndef(s, 'weight');
    tuning.cooldownDays = numOrUndef(s, 'cooldownDays');
    tuning.a1MoodDelta = numOrUndef(s, 'a1MoodDelta');
    tuning.a2MoodDelta = numOrUndef(s, 'a2MoodDelta');
    tuning.a1TrustDelta = numOrUndef(s, 'a1TrustDelta');
    tuning.a1AffinityDelta = numOrUndef(s, 'a1AffinityDelta');
    tuning.a2TrustDelta = numOrUndef(s, 'a2TrustDelta');
    tuning.a2AffinityDelta = numOrUndef(s, 'a2AffinityDelta');
    tuning.a1MemoryWeight = numOrUndef(s, 'a1MemoryWeight');
    tuning.a2MemoryWeight = numOrUndef(s, 'a2MemoryWeight');
    if (s.has('message')) tuning.message = s.get('message', '');
    tuningRegistry.set(id, tuning);
  }
}

/** 이벤트 ID 로 튜닝 조회. 없으면 undefined → 호출자가 기본값을 사용. */
export function getLifeEventTuning(eventId: string): LifeEventTuning | undefined {
  return tuningRegistry.get(eventId);
}

/** 템플릿 치환 헬퍼: {a1}/{a2}/{location}/{gift}/{pctLabel} 등 */
export function formatEventMessage(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key];
    return val === undefined ? `{${key}}` : String(val);
  });
}
