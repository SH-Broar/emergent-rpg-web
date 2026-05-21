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

/** race 시드 카드 1장을 컬렉션에 추가하고 토스트. 성공하면 true. */
function grantSeedCard(): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const race = data.races.get(run.data.raceId);
  const pool = race?.seedCardIds ?? [];
  if (pool.length === 0) return false;
  const cardId = pool[Math.floor(rng() * pool.length)];
  const card = data.cards.get(cardId);
  if (!card) return false;
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
 * 노드 진입 시 활동 보상을 적용. MapView의 `case 'activity'` 분기에서 호출.
 */
export function performActivity(nodeId: string): void {
  const handler = HANDLERS[nodeId] ?? defaultActivity;
  handler();
}
