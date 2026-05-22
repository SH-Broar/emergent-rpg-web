/**
 * 이벤트 노드 처리.
 *
 * spec v2: 이벤트 = 본문 + 선택지 + 효과.
 * 선택지 효과: hp/gold/카드/유물/관계/후속 이벤트 트리거.
 *
 * r4: condition DSL 평가기 + customEffectId 핸들러 레지스트리.
 *
 * condition DSL 토큰 (6종, `&&`로 결합):
 *   color:fire>=3            베이스 컬러 (effective 아님)
 *   has-item:i-potion        아이템 인스턴스 존재
 *   companion:n-alice        현재 동료
 *   affinity:n-alice>=5      NPC 친밀도
 *   gold>=20                 골드
 *   hp<=10                   체력
 *
 * 비교 연산자: >=, <=, >, <, ==, !=. 미지원 토큰은 false 폴백 + console.warn.
 *
 * customEffectId 사용:
 *   registerEventEffect('my-id', (ctx) => { ... });
 *   데이터에서 `custom = my-id` 지정.
 *   placeholder로 'log-only' 핸들러 1개 미리 등록.
 */

import type {
  Element,
  Event,
  EventChoice,
  EventChoiceEffect,
  RunState,
} from '@/data/schemas';
import { rng } from './rng';
import { applyAffinityDelta } from './affinity';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';

/**
 * 이벤트 풀에서 트리거 조건이 맞는 이벤트를 가중치 추첨.
 *
 * 필터: `trigger.condition`이 있고 충족 안 되면 *풀에서 제외*.
 * chain 이벤트(시이드 만남 2/3 등)는 `affinity:npc-X>=N` 조건으로 점층.
 */
export function pickEvent(pool: readonly Event[]): Event | undefined {
  if (pool.length === 0) return undefined;
  const run = useRunStore().data;
  const eligible = pool.filter((e) => {
    if (!e.trigger.condition) return true;
    const tokens = e.trigger.condition.split('&&').map((s) => s.trim()).filter(Boolean);
    return tokens.every((tok) => evalToken(tok, run));
  });
  if (eligible.length === 0) return undefined;
  const totalWeight = eligible.reduce((sum, e) => sum + (e.trigger.weight ?? 1), 0);
  let r = rng() * totalWeight;
  for (const e of eligible) {
    r -= e.trigger.weight ?? 1;
    if (r <= 0) return e;
  }
  return eligible[eligible.length - 1];
}

// ============================================================
// condition DSL 평가기
// ============================================================

type CmpOp = '>=' | '<=' | '>' | '<' | '==' | '!=';
const CMP_OPS: CmpOp[] = ['>=', '<=', '==', '!=', '>', '<'];

function splitOp(s: string): { lhs: string; op?: CmpOp; rhs?: number } {
  for (const op of CMP_OPS) {
    const idx = s.indexOf(op);
    if (idx >= 0) {
      const lhs = s.slice(0, idx);
      const rhs = Number(s.slice(idx + op.length));
      return { lhs, op, rhs: Number.isFinite(rhs) ? rhs : undefined };
    }
  }
  return { lhs: s };
}

function cmp(actual: number, op: CmpOp, expected: number): boolean {
  switch (op) {
    case '>=': return actual >= expected;
    case '<=': return actual <= expected;
    case '>': return actual > expected;
    case '<': return actual < expected;
    case '==': return actual === expected;
    case '!=': return actual !== expected;
  }
}

function evalToken(tok: string, run: RunState): boolean {
  // NOT 접두 — `!has-clue:cl-X`, `!has-item:i-X` 등.
  let negate = false;
  let actual = tok;
  if (actual.startsWith('!')) {
    negate = true;
    actual = actual.slice(1).trim();
  }
  const result = evalTokenInner(actual, run);
  return negate ? !result : result;
}

function evalTokenInner(tok: string, run: RunState): boolean {
  const colonIdx = tok.indexOf(':');
  // kind = 선행 토큰명만(영문/하이픈). 비교형 토큰(gold>=20, hp<10, day>=2)은 콜론이 없으므로
  // 콜론 split만 쓰면 kind에 연산자가 섞여 매칭 실패한다 → 선행 [a-z-]+ 만 추출.
  const kindMatch = /^[a-z-]+/.exec(tok);
  const kind = kindMatch ? kindMatch[0] : (colonIdx < 0 ? tok : tok.slice(0, colonIdx));
  const rest = colonIdx < 0 ? '' : tok.slice(colonIdx + 1);

  switch (kind) {
    case 'color': {
      const { lhs, op, rhs } = splitOp(rest);
      const c = lhs as Element;
      const val = (run.colors as unknown as Record<string, number>)[c] ?? 0;
      if (!op || rhs === undefined) return val > 0;
      return cmp(val, op, rhs);
    }
    case 'has-item': {
      return run.items.some((i) => i.id === rest);
    }
    case 'has-relic': {
      return run.relics.some((r) => r.id === rest);
    }
    case 'has-card': {
      // 카드 정의 ID로 검사 (collection 또는 deck 둘 다).
      return (
        run.collection.some((c) => c.id === rest) ||
        run.deck.some((c) => c.id === rest)
      );
    }
    case 'has-clue': {
      return (run.clues ?? []).some((c) => c.id === rest);
    }
    case 'companion': {
      return run.companions.includes(rest);
    }
    case 'affinity': {
      // 친밀도 시스템 *비활성* (2026-05-19 사용자 결정). chain은 has-clue로 대체.
      // 데이터 잔여 호환: npcAffinity 필드는 아직 그대로 있지만 *값은 더 이상 갱신되지 않음*.
      const { lhs, op, rhs } = splitOp(rest);
      const val = run.npcAffinity[lhs] ?? 0;
      if (!op || rhs === undefined) return val > 0;
      return cmp(val, op, rhs);
    }
    case 'gold': {
      const { op, rhs } = splitOp(tok);
      if (!op || rhs === undefined) return run.gold > 0;
      return cmp(run.gold, op, rhs);
    }
    case 'hp': {
      const { op, rhs } = splitOp(tok);
      if (!op || rhs === undefined) return run.hp > 0;
      return cmp(run.hp, op, rhs);
    }
    case 'day': {
      // 일차 게이팅 — 예: `day>=2` (2일차 이후). currentDay 시작은 1.
      const { op, rhs } = splitOp(tok);
      if (!op || rhs === undefined) return (run.currentDay ?? 1) > 0;
      return cmp(run.currentDay ?? 1, op, rhs);
    }
    default:
      console.warn('[event] unknown condition token:', tok);
      return false;
  }
}

/**
 * 선택지가 사용 가능한가? (DSL 평가)
 *
 * 비-인자 호출도 허용 — store 자동 lookup.
 */
export function isChoiceAvailable(choice: EventChoice, run?: RunState): boolean {
  if (!choice.condition) return true;
  const r = run ?? useRunStore().data;
  const tokens = choice.condition.split('&&').map((s) => s.trim()).filter(Boolean);
  return tokens.every((tok) => evalToken(tok, r));
}

// ============================================================
// customEffectId 핸들러 레지스트리
// ============================================================

/** customEffect 핸들러에 주입되는 컨텍스트. */
export interface EventEffectContext {
  run: RunState;
  ui: ReturnType<typeof useUiStore>;
  data: ReturnType<typeof useDataStore>;
  choice: EventChoice;
  effect: EventChoiceEffect;
  /** EventView가 결과 라인을 누적하는 배열 — 핸들러가 직접 push 가능. */
  lines: string[];
}

export type EventEffectHandler = (ctx: EventEffectContext) => void;

const EVENT_EFFECT_HANDLERS = new Map<string, EventEffectHandler>();

/** customEffectId → 핸들러 등록. 게임 부팅·테스트에서 호출. */
export function registerEventEffect(id: string, h: EventEffectHandler): void {
  EVENT_EFFECT_HANDLERS.set(id, h);
}

/** 등록된 핸들러 호출. 등록 안 된 id면 false + console.warn. */
export function invokeCustomEffect(id: string, ctx: EventEffectContext): boolean {
  const h = EVENT_EFFECT_HANDLERS.get(id);
  if (!h) {
    console.warn('[event] unknown customEffectId:', id);
    return false;
  }
  h(ctx);
  return true;
}

// placeholder 핸들러 — 데이터 등록 패턴 검증용. 다음 라운드에 실제 효과 핸들러 추가.
registerEventEffect('log-only', (ctx) => {
  ctx.lines.push(`(디버그) custom effect 발동: ${ctx.choice.label}`);
});

// ============================================================
// 레거시 selectChoice — EventView가 자체 applyChoice를 가지므로 미사용.
// 외부 호출자(테스트 등)를 위해 유지.
// ============================================================

/** 선택지 선택 — 효과 적용 + 결과 텍스트 반환. */
export function selectChoice(choice: EventChoice): string {
  const run = useRunStore();
  const ui = useUiStore();
  const r = run.data;

  const resultParts: string[] = [];

  for (const effect of choice.effects) {
    applyEffect(effect, resultParts);
    if (effect.resultText) resultParts.push(effect.resultText);
  }

  // 토스트 알림
  if (resultParts.length > 0) {
    ui.toast('info', resultParts[0]);
  }
  void r; // run state는 applyEffect 내부에서 직접 변경

  return resultParts.join('\n');
}

function applyEffect(effect: EventChoiceEffect, resultParts: string[]) {
  const run = useRunStore();
  const r = run.data;

  if (effect.hpDelta !== undefined) {
    r.hp = Math.max(0, Math.min(r.maxHp, r.hp + effect.hpDelta));
    resultParts.push(effect.hpDelta >= 0 ? `HP +${effect.hpDelta}` : `HP ${effect.hpDelta}`);
  }
  if (effect.goldDelta !== undefined) {
    r.gold = Math.max(0, r.gold + effect.goldDelta);
    resultParts.push(effect.goldDelta >= 0 ? `골드 +${effect.goldDelta}` : `골드 ${effect.goldDelta}`);
  }
  if (effect.affinityDelta) {
    const a = effect.affinityDelta;
    resultParts.push(`${a.npcId} 친밀도 ${a.delta >= 0 ? '+' : ''}${a.delta}`);
    applyAffinityDelta(a.npcId, a.delta, resultParts);
  }
  // 카드/유물 grant — EventView.applyEffectWithNames에서 *이름 lookup 포함* 처리.
  if (effect.grantCardId) {
    resultParts.push(`카드 획득: ${effect.grantCardId}`);
  }
  if (effect.grantRelicId) {
    resultParts.push(`유물 획득: ${effect.grantRelicId}`);
  }
}
