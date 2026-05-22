/**
 * 활동(activity) 노드 보상 처리.
 *
 * 사용자 사양:
 *  - 활동 노드는 *반복 가능*. 매 방문마다 작은 보상.
 *  - 노드별 *flavor + 보상 편향* 분기. 미지정 노드는 기본(다양한 보상 풀).
 *  - 마노니클라 — 노을 톤 + 차/야시장 디테일.
 *  - 알림은 *짧은 토스트 여러 개* (한 줄 긴 알림 X). 획득물마다 하나씩.
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { applyColorBoost, type ColorKey } from '@/systems/colors';
import { colorLabel } from '@/systems/labels';
import { rng } from '@/systems/rng';

type ActivityHandler = () => void;

/** 짧은 성공 토스트 한 줄. */
function notify(msg: string): void {
  useUiStore().toast('success', msg);
}

/** 활동 보상이 강화형으로 나올 확률 — 마을 제작과 달리 활동은 *가끔 강화판*도 준다. */
const ACTIVITY_UPGRADE_CHANCE = 0.3;

/** race 시드 카드 1장을 컬렉션에 추가하고 토스트. 성공하면 true. */
function grantSeedCard(): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const race = data.races.get(run.data.raceId);
  const pool = race?.seedCardIds ?? [];
  if (pool.length === 0) return false;
  const cardId = pool[Math.floor(rng() * pool.length)];
  let card = data.cards.get(cardId);
  if (!card) return false;
  // 활동은 마을 제작과 달리 *강화형*도 나올 수 있다 — 강화판이 있으면 일정 확률로 업그레이드해 지급.
  if (card.upgradeToId && rng() < ACTIVITY_UPGRADE_CHANCE) {
    const upgraded = data.cards.get(card.upgradeToId);
    if (upgraded) card = upgraded;
  }
  run.addCardToCollection(card);
  notify(`'${card.name}' 획득`);
  return true;
}

/** 컬러 부스트 + 토스트(한글 컬러명). 실제로 오른 경우만 알림. */
function grantColor(color: ColorKey, amount: number): void {
  const d = applyColorBoost(color, amount);
  if (d > 0) notify(`${colorLabel(color)} 컬러 +${d}`);
}

/** 아이템 1장 지급 + 토스트. */
function grantItem(itemId: string): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const itm = data.items.get(itemId);
  if (!itm) return false;
  run.addItem(itm);
  notify(`${itm.name} 획득`);
  return true;
}

/**
 * 노드별 활동 핸들러. 미지정 시 defaultActivity 호출.
 * 각 핸들러는 *직접* 짧은 토스트를 여러 개 띄운다.
 */
const HANDLERS: Record<string, ActivityHandler> = {
  // 마노니클라 — 노을차집: 차 한 잔, 작은 HP + iron 컬러 약간 + 가끔 카드.
  'n-mano-tea-house': () => {
    const run = useRunStore();
    const r = run.data;
    notify('차 한 잔 — 노을이 식기 전에');

    const heal = 3 + Math.floor(rng() * 3);
    r.hp = Math.min(r.maxHp, r.hp + heal);
    notify(`HP +${heal}`);

    // 마노니클라 primary color = iron. 차 한 잔이 결을 한 호흡 정렬한다.
    grantColor('iron', 1);

    // 25% 확률로 race 시드 카드 1장.
    if (rng() < 0.25) grantSeedCard();
  },

  // 마노니클라 — 야시장: 좌판, 골드 + 가끔 특산물 + 가끔 카드.
  'n-mano-night-market': () => {
    const run = useRunStore();
    const r = run.data;
    notify('좌판 — 한 자리에서');

    const gold = 6 + Math.floor(rng() * 5);
    r.gold += gold;
    notify(`골드 +${gold}`);

    // 30% 확률로 마노니클라 특산물.
    if (rng() < 0.30) grantItem('i-sunset-shard');

    // 20% 확률로 race 시드 카드 1장.
    if (rng() < 0.20) grantSeedCard();
  },
};

/** 활동 기본 보상 풀 — 다양한 결과 중 하나를 추첨(골드/조각/컬러/카드/재료). */
const DEFAULT_COLORS: ColorKey[] = [
  'fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark',
];

/**
 * 기본 활동 핸들러 — 보상 풀을 넓혀 *여러 결과* 중 하나둘을 추첨.
 *  - 골드 / 시간의 조각 / 무작위 컬러 / race 시드 카드 / 일반 재료.
 * 항상 *최소 1개*는 보장(기본 골드). 각 보너스는 확률 가산.
 */
function defaultActivity(): void {
  const run = useRunStore();
  const r = run.data;
  notify('활동 — 한 자리에서');

  // 기본: 골드 또는 시간의 조각 (둘 중 하나는 확정).
  if (rng() < 0.5) {
    const gold = 5 + Math.floor(rng() * 6);
    r.gold += gold;
    notify(`골드 +${gold}`);
  } else {
    const shards = 2 + Math.floor(rng() * 3);
    r.timeShards += shards;
    notify(`시간의 조각 +${shards}`);
  }

  // 35% — 무작위 컬러 +1~2.
  if (rng() < 0.35) {
    const color = DEFAULT_COLORS[Math.floor(rng() * DEFAULT_COLORS.length)];
    grantColor(color, 1 + Math.floor(rng() * 2));
  }

  // 30% — race 시드 카드 1장.
  if (rng() < 0.30) grantSeedCard();

  // 20% — 일반 재료 1개.
  if (rng() < 0.20) grantItem('i-material-common');

  // 10% — 작은 회복.
  if (rng() < 0.10) {
    const heal = 2 + Math.floor(rng() * 4);
    r.hp = Math.min(r.maxHp, r.hp + heal);
    notify(`HP +${heal}`);
  }
}

/**
 * 노드 진입 시 활동 보상을 적용. (구 경로 — 현재 MapView는 ActivityView로 라우팅.)
 */
export function performActivity(nodeId: string): void {
  const run = useRunStore();
  const r = run.data;
  if (r.nodeStates[nodeId]?.activityDone) {
    useUiStore().toast('info', '이미 다녀간 활동 — 갱신 후 다시.');
    return;
  }
  applyActivityBaseline(nodeId);
  markActivityDone(nodeId);
}

// === 활동 주사위(도전) 시스템 (2026-05-22) ===
// 활동 노드 진입 → 컬러 하나를 골라 d100 굴림. (건 컬러값 + 기본 보정)이 성공 확률 n.
// roll ≤ n 이면 성공. 실패해도 *기본 보상*은 받고, 성공하면 *특수 보상*(건 컬러 대폭 + 보너스).

/** 컬러값과 무관한 기본 성공 보정 — 컬러 0이어도 이만큼 성공 확률. */
export const ACTIVITY_BASE_BONUS = 20;

/** 건 컬러값(0~100) → 성공 확률 n(0~100). roll ≤ n 이면 성공. */
export function activitySuccessChance(colorValue: number): number {
  return Math.max(0, Math.min(100, Math.round(colorValue) + ACTIVITY_BASE_BONUS));
}

/** 기본 보상(성공/실패 무관 항상) — 노드별 핸들러 또는 기본 풀. */
export function applyActivityBaseline(nodeId: string): void {
  const handler = HANDLERS[nodeId] ?? defaultActivity;
  handler();
}

/** 성공 특수 보상 — 건 컬러 대폭 상승 + 추가 보너스(골드/조각/카드 중 하나). */
export function applyActivitySuccess(color: ColorKey): void {
  const run = useRunStore();
  grantColor(color, 12);
  const roll = rng();
  if (roll < 0.4) {
    const g = 12 + Math.floor(rng() * 9);
    run.data.gold += g;
    notify(`골드 +${g}`);
  } else if (roll < 0.7) {
    const s = 5 + Math.floor(rng() * 5);
    run.data.timeShards += s;
    notify(`시간의 조각 +${s}`);
  } else {
    if (!grantSeedCard()) {
      const g = 12 + Math.floor(rng() * 9);
      run.data.gold += g;
      notify(`골드 +${g}`);
    }
  }
}

/** 활동 완료 표시. */
export function markActivityDone(nodeId: string): void {
  const r = useRunStore().data;
  if (!r.nodeStates[nodeId]) r.nodeStates[nodeId] = { visited: true };
  r.nodeStates[nodeId].activityDone = true;
}

/** 이미 다녀간 활동인가. */
export function isActivityDone(nodeId: string): boolean {
  return !!useRunStore().data.nodeStates[nodeId]?.activityDone;
}
