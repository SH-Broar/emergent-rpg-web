/**
 * 길드 우편(타이머 드립) 시스템 — 2026-07-02.
 *
 * 타이머(사건 개입권)를 런 시작에 전량 선지급하지 않고, 길드 우편으로 조금씩 배달한다.
 *  - 경과 30턴마다 우편 2통 생성(pending += 2). 단, pending>0인 동안은 사이클이 멈춘다
 *    (미수령 우편이 있으면 다음 배달 없음). 어느 마을 길드에서든 수령 → 타이머로 전환하고
 *    다음 배달을 *수령 시점부터* 다시 30턴 뒤로 잡는다. 최속 수령 시 30·60·…·150턴에 총 10개.
 *
 * 개입 보상(2026-07-02 개정) — 사건 노드별 *고유*(같은 사건은 항상 같은 보상):
 *  - 지급량·티어: 개입 1회당 timerCost 1 = T1 1개 / 2 = T2 1개 / 3+ = T2 1개 + T1 1개.
 *  - 보상 선택: choice/variation의 `premium_reward = <id>`가 있으면 그것을(우선), 없으면 eventId
 *    문자열 해시(djb2)로 해당 티어 풀 인덱스를 고정 선택한다(rng 미사용 — 노드별 불변이 목적).
 *    유물이 배정됐는데 이미 보유 중이면 +1 순회로 같은 풀의 다음 미보유/비유물 항목.
 *
 * 순환 의존: run.ts가 tickMail을 import하고, 이 모듈은 run 스토어를 import한다(relic.ts와 동일 구조).
 *   tickMail은 RunState만 받아 ui 스토어만 참조하므로, 스토어 조회는 전부 *함수 실행 시점*(런타임)에만
 *   일어난다 → 모듈 평가 시점 순환 미사용으로 안전.
 */

import type { RunState } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { acquireRelic } from '@/systems/relic';
import { rewardCard, rewardItem, rewardRelic } from '@/systems/reward-feed';

/** 우편 생성 주기(경과 턴). 최속 수령 시 30·60·…·150턴에 총 10개(= 기존 선지급 총량). */
export const MAIL_INTERVAL = 30;
/** 한 번에 도착하는 우편 수. */
export const MAIL_BATCH = 2;

/** 프리미엄 보상 1항목 — id + 종류(카드/아이템/유물). 티어 풀은 이 항목들의 고정 순서 배열. */
interface PremiumEntry {
  id: string;
  kind: 'card' | 'item' | 'relic';
}

/**
 * T1 풀(15종) — 타이머 1개 개입 보상. rank=legendary·source=event(일반 공급 밖).
 * public/data 의 cards-timer / act-1-timer-items / relics-timer 와 1:1 대응. 순서는 해시 인덱싱 기준(불변).
 */
const T1_POOL: PremiumEntry[] = [
  { id: 'c-tm-flicker', kind: 'card' },
  { id: 'c-tm-advance', kind: 'card' },
  { id: 'c-tm-written-end', kind: 'card' },
  { id: 'c-tm-slow-noon', kind: 'card' },
  { id: 'c-tm-full-stop', kind: 'card' },
  { id: 'i-tm-spare-morning', kind: 'item' },
  { id: 'i-tm-greeting-alley', kind: 'item' },
  { id: 'i-tm-still-noon', kind: 'item' },
  { id: 'i-tm-back-pay', kind: 'item' },
  { id: 'i-tm-endured-season', kind: 'item' },
  { id: 'r-tm-generous-day', kind: 'relic' },
  { id: 'r-tm-yesterday-share', kind: 'relic' },
  { id: 'r-tm-simmering-evening', kind: 'relic' },
  { id: 'r-tm-mending-hours', kind: 'relic' },
  { id: 'r-tm-diligent-hands', kind: 'relic' },
];

/**
 * T2 풀(9종) — 타이머 2~3개 개입 보상. T1보다 확연히 희귀·강력.
 * 데이터(cards-timer / act-1-timer-items / relics-timer의 tmx 항목)는 조율자가 작성 —
 * 아직 로드 전이어도 build는 통과하고, 지급 시 미로드면 console.warn 폴백(아래 grant).
 */
const T2_POOL: PremiumEntry[] = [
  { id: 'c-tmx-blink-step', kind: 'card' },
  { id: 'c-tmx-hourfold', kind: 'card' },
  { id: 'c-tmx-eon-edge', kind: 'card' },
  { id: 'i-tmx-second-dawn', kind: 'item' },
  { id: 'i-tmx-worldpause', kind: 'item' },
  { id: 'i-tmx-monos-ledger', kind: 'item' },
  { id: 'r-tmx-endless-noon', kind: 'relic' },
  { id: 'r-tmx-borrowed-eternity', kind: 'relic' },
  { id: 'r-tmx-last-promise', kind: 'relic' },
];

/** id → 종류 판별을 위한 통합 색인(풀 밖 explicit id는 접두 폴백). */
const ALL_ENTRIES: PremiumEntry[] = [...T1_POOL, ...T2_POOL];

/** 티어(1|2) → 해당 풀. */
function tierPool(tier: 1 | 2): PremiumEntry[] {
  return tier === 1 ? T1_POOL : T2_POOL;
}

/** id의 종류 — 풀 색인 우선, 밖이면 id 접두(c-/i-/r-)로 추정(폴백 card). */
function entryKindOf(id: string): 'card' | 'item' | 'relic' {
  const known = ALL_ENTRIES.find((e) => e.id === id);
  if (known) return known.kind;
  if (id.startsWith('r-')) return 'relic';
  if (id.startsWith('i-')) return 'item';
  return 'card';
}

/** djb2 문자열 해시(부호 없는 32비트) — 노드별 고정 보상 인덱스 산출용(rng 대체). */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0; // h * 33 + c
  }
  return h >>> 0;
}

/**
 * timerCost → 뽑을 티어 목록. 1 → [T1] / 2 → [T2] / 3+ → [T2, T1] / 0 이하 → [].
 * (스펙 확정: 1=T1 1개, 2=T2 1개, 3=T2 1개+T1 1개. 4 이상도 3과 동일하게 관대 처리.)
 */
export function rewardTiersForCost(timerCost: number): (1 | 2)[] {
  if (timerCost <= 0) return [];
  if (timerCost === 1) return [1];
  if (timerCost === 2) return [2];
  return [2, 1];
}

/**
 * 한 티어에서 지급할 항목을 *결정론*으로 선택.
 *  - explicitId(premium_reward)가 있으면 그것을 그대로(종류 판별해서) 반환.
 *  - 없으면 eventId 해시 % 풀길이로 시작 인덱스를 잡고, 유물이 이미 보유 중이면 +1 순회로
 *    같은 풀의 다음 미보유/비유물 항목. (전부 보유 유물뿐인 극단 케이스는 시작 항목 폴백.)
 */
function resolveTierEntry(
  tier: 1 | 2,
  eventId: string,
  explicitId: string | undefined,
  ownedRelicIds: Set<string>,
): PremiumEntry | undefined {
  if (explicitId) return { id: explicitId, kind: entryKindOf(explicitId) };
  const pool = tierPool(tier);
  if (pool.length === 0) return undefined;
  const start = hashString(eventId) % pool.length;
  for (let step = 0; step < pool.length; step++) {
    const entry = pool[(start + step) % pool.length];
    if (entry.kind === 'relic' && ownedRelicIds.has(entry.id)) continue;
    return entry;
  }
  return pool[start];
}

/**
 * 이 개입이 주는 보상 항목 목록을 *결정론*으로 산출(지급·미리보기 공용).
 *  - timerCost로 티어 목록을 정하고(rewardTiersForCost), 티어마다 항목 1개.
 *  - explicitId(premium_reward)는 *첫 항목에만* 적용(단일 지정). 나머지 티어는 eventId 해시.
 * ownedRelicIds는 호출자가 현재 보유 유물로 구성. 여러 티어 지급 시 방금 배정한 유물도 누적해 중복 방지.
 * 데이터 미로드 id도 그대로 반환된다(지급/표시 단계에서 폴백 처리).
 */
export function resolveInterventionRewards(
  eventId: string,
  timerCost: number,
  explicitId: string | undefined,
  ownedRelicIds: Set<string>,
): PremiumEntry[] {
  const tiers = rewardTiersForCost(timerCost);
  const out: PremiumEntry[] = [];
  const owned = new Set(ownedRelicIds);
  for (const tier of tiers) {
    const explicit = out.length === 0 ? explicitId : undefined; // explicit은 첫 항목만.
    const entry = resolveTierEntry(tier, eventId, explicit, owned);
    if (entry) {
      out.push(entry);
      if (entry.kind === 'relic') owned.add(entry.id);
    }
  }
  return out;
}

/**
 * 우편 상태 기본값 — startRun(elapsed=0)과 구세이브 마이그레이션 공용.
 * 다음 배달을 현재 경과턴 + 30으로 예약하고 대기 우편은 0으로 둔다.
 */
export function initialMailState(elapsed: number): { nextReadyAtTurn: number; pending: number } {
  return { nextReadyAtTurn: elapsed + MAIL_INTERVAL, pending: 0 };
}

/**
 * 경과턴 기준 우편 사이클 진행 — visitNode의 *시간 카운트 지점*에서 매 이동마다 호출.
 * pending==0 이고 경과턴이 nextReadyAtTurn에 도달하면 우편 2통을 만들고 알림을 띄운다.
 * pending>0(미수령)인 동안은 아무 것도 하지 않는다(수령 전까지 사이클 정지).
 * RunState만 읽고 ui 스토어만 건드린다(run 스토어 미조회 → 순환 안전).
 */
export function tickMail(r: RunState): void {
  const mail = r.mail;
  if (!mail) return;
  if (mail.pending > 0) return;
  if (r.visitedNodes.length < mail.nextReadyAtTurn) return;
  mail.pending = MAIL_BATCH;
  useUiStore().toast('info', '길드 앞으로 우편이 도착했다. 가까운 마을에서 받자.');
}

/**
 * 다음 우편까지 남은 경과턴. pending>0(이미 도착 대기)이면 0.
 * HUD·마을 안내가 조회. mail 미설정이면 한 주기(MAIL_INTERVAL) 폴백.
 */
export function turnsUntilMail(r: RunState): number {
  const mail = r.mail;
  if (!mail) return MAIL_INTERVAL;
  if (mail.pending > 0) return 0;
  return Math.max(0, mail.nextReadyAtTurn - r.visitedNodes.length);
}

/**
 * 마을 길드 우편 수령 — 대기 우편을 타이머로 전환.
 * timers.cur = min(cur + pending, max), pending = 0, 다음 배달을 *수령 시점*부터 30턴 뒤로 재기산.
 * 반환: 받은 우편 수(0이면 받을 것 없음). 상한 초과분은 버려지지만 pending은 비운다(스펙 확정).
 */
export function collectMail(): number {
  const run = useRunStore();
  const r = run.data;
  if (!r.mail || r.mail.pending <= 0) return 0;
  const got = r.mail.pending;
  r.timers.cur = Math.min(r.timers.cur + got, r.timers.max);
  r.mail.pending = 0;
  r.mail.nextReadyAtTurn = r.visitedNodes.length + MAIL_INTERVAL;
  return got;
}

/**
 * 사건 개입 보상 지급 — 이 개입(eventId, timerCost, explicitId)에 배정된 프리미엄을 지급.
 * 티어·항목은 resolveInterventionRewards로 결정론 산출(미리보기와 동일 계산). 각 항목은 중앙 진입점
 * (addCardToCollection/addItem/acquireRelic)으로 지급하고 reward-feed로 한 줄씩 표기.
 * 데이터 미로드(T2 미작성 등) id는 console.warn 폴백 — 지급 없이 넘어가고 build/런타임 크래시 없음.
 */
export function grantInterventionRewards(eventId: string, timerCost: number, explicitId?: string): void {
  if (timerCost <= 0) return;
  const run = useRunStore();
  const data = useDataStore();
  const ownedRelicIds = new Set(run.data.relics.map((rel) => rel.id));
  const entries = resolveInterventionRewards(eventId, timerCost, explicitId, ownedRelicIds);

  for (const entry of entries) {
    if (entry.kind === 'card') {
      const card = data.cards.get(entry.id);
      if (card) { run.addCardToCollection(card); rewardCard(card.name); }
      else console.warn('[mail] 미로드 카드 보상 — 지급 생략:', entry.id);
    } else if (entry.kind === 'item') {
      const item = data.items.get(entry.id);
      if (item) { run.addItem(item); rewardItem(item); }
      else console.warn('[mail] 미로드 아이템 보상 — 지급 생략:', entry.id);
    } else {
      const relic = data.relics.get(entry.id);
      if (relic) { acquireRelic(relic); rewardRelic(relic.name); }
      else console.warn('[mail] 미로드 유물 보상 — 지급 생략:', entry.id);
    }
  }
}

/**
 * 이 개입의 보상 이름 목록(미리보기 표시용) — 지급(grantInterventionRewards)과 동일 계산.
 * 데이터 미로드 id는 id 자체를 폴백 표시(빈 화면 방지). EventView 개입 버튼이 조회.
 */
export function previewInterventionRewards(eventId: string, timerCost: number, explicitId?: string): string[] {
  if (timerCost <= 0) return [];
  const run = useRunStore();
  const data = useDataStore();
  const ownedRelicIds = new Set(run.data.relics.map((rel) => rel.id));
  const entries = resolveInterventionRewards(eventId, timerCost, explicitId, ownedRelicIds);
  return entries.map((e) => {
    if (e.kind === 'card') return data.cards.get(e.id)?.name ?? e.id;
    if (e.kind === 'item') return data.items.get(e.id)?.name ?? e.id;
    return data.relics.get(e.id)?.name ?? e.id;
  });
}
