/**
 * 활동(activity) 노드 보상 처리.
 *
 * 사용자 사양:
 *  - 활동 노드는 *반복 가능*. 매 방문마다 작은 보상.
 *  - 노드별 *flavor + 보상 편향* 분기. 미지정 노드는 기본(race 시드 카드 or 골드).
 *  - 마노니클라 — 노을 톤 + 차/야시장 디테일.
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { applyColorBoost } from '@/systems/colors';
import { rng } from '@/systems/rng';

type ActivityResult = {
  /** 토스트 prefix (예: "차 한 잔") */
  flavor: string;
  /** 결과 라인 — applyEffects 후 호출자가 합쳐서 토스트. */
  lines: string[];
};

type ActivityHandler = () => ActivityResult;

/**
 * 노드별 활동 핸들러. 미지정 시 defaultActivity 호출.
 */
const HANDLERS: Record<string, ActivityHandler> = {
  // 마노니클라 — 노을차집: 차 한 잔, 작은 HP + iron 컬러 약간 + 가끔 카드.
  'n-mano-tea-house': () => {
    const run = useRunStore();
    const data = useDataStore();
    const r = run.data;
    const lines: string[] = [];

    const heal = 3 + Math.floor(rng() * 3);
    r.hp = Math.min(r.maxHp, r.hp + heal);
    lines.push(`HP +${heal}`);

    // 마노니클라 primary color = iron. 차 한 잔이 *결을 한 박자* 정렬한다.
    const boosted = applyColorBoost('iron', 1);
    if (boosted > 0) lines.push(`iron 컬러 +${boosted}`);

    // 25% 확률로 race 시드 카드 1장.
    if (rng() < 0.25) {
      const race = data.races.get(r.raceId);
      const pool = race?.seedCardIds ?? [];
      if (pool.length > 0) {
        const cardId = pool[Math.floor(rng() * pool.length)];
        const card = data.cards.get(cardId);
        if (card) {
          run.addCardToCollection(card);
          lines.push(`'${card.name}'`);
        }
      }
    }

    return { flavor: '차 한 잔 — 노을이 식기 전에', lines };
  },

  // 마노니클라 — 야시장: 좌판, 골드 + 가끔 특산물 + 가끔 카드.
  'n-mano-night-market': () => {
    const run = useRunStore();
    const data = useDataStore();
    const r = run.data;
    const lines: string[] = [];

    const gold = 6 + Math.floor(rng() * 5);
    r.gold += gold;
    lines.push(`골드 +${gold}`);

    // 30% 확률로 마노니클라 특산물(i-sunset-shard).
    if (rng() < 0.30) {
      const itm = data.items.get('i-sunset-shard');
      if (itm) {
        run.addItem(itm);
        lines.push(`특산물 — '${itm.name}'`);
      }
    }

    // 20% 확률로 race 시드 카드 1장.
    if (rng() < 0.20) {
      const race = data.races.get(r.raceId);
      const pool = race?.seedCardIds ?? [];
      if (pool.length > 0) {
        const cardId = pool[Math.floor(rng() * pool.length)];
        const card = data.cards.get(cardId);
        if (card) {
          run.addCardToCollection(card);
          lines.push(`'${card.name}'`);
        }
      }
    }

    return { flavor: '좌판 — 한 자리에서', lines };
  },
};

/**
 * 기본 활동 핸들러 — race 시드 카드 1장 또는 골드 5~9.
 */
function defaultActivity(): ActivityResult {
  const run = useRunStore();
  const data = useDataStore();
  const r = run.data;
  const lines: string[] = [];

  const race = data.races.get(r.raceId);
  const pool = race?.seedCardIds ?? [];
  if (pool.length > 0) {
    const cardId = pool[Math.floor(rng() * pool.length)];
    const card = data.cards.get(cardId);
    if (card) {
      run.addCardToCollection(card);
      lines.push(`'${card.name}' 획득`);
      return { flavor: '활동', lines };
    }
  }

  const gold = 5 + Math.floor(rng() * 5);
  r.gold += gold;
  lines.push(`골드 +${gold}`);
  return { flavor: '활동', lines };
}

/**
 * 노드 진입 시 활동 보상을 적용. MapView의 `case 'activity'` 분기에서 호출.
 */
export function performActivity(nodeId: string): void {
  const ui = useUiStore();
  const handler = HANDLERS[nodeId] ?? defaultActivity;
  const { flavor, lines } = handler();
  ui.toast('success', `${flavor} — ${lines.join(', ')}`);
}
