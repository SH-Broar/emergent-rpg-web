/**
 * 빙의(재설계) 시스템.
 *
 * 사양 (2026-05-23 인터뷰 확정):
 *  - 받으면 *제외 불가* 빙의 카드 1장이 덱/컬렉션에 박힌다(양날 강카드 c-possessed).
 *  - 받을 때 *수호령/악령* 정렬이 결정되나 플레이어에겐 숨겨진다(겉모습 동일).
 *  - 그 카드를 *쓸 때마다 각성도 +1*(여러 전투 누적). 최대(기본 8) 도달 시:
 *      이벤트(토스트 + 즉시 효과) + 카드 변신 — 수호령=축복 카드(c-blessed) / 악령=저주 카드(c-cursed).
 *  - 저주 카드는 *상점에서만* 떼어낼 수 있다(공방·이벤트 제외 불가). 변신 전 빙의 카드는 *어디서도* 제외 불가.
 *
 * 각성도/정렬은 *카드 instanceId 키*로 run.possessions에 저장 — 덱/컬렉션/손패 객체 동일성에 의존하지 않는다.
 * 모나토-트립스 등 향후 보스도 grantPossession을 재사용한다.
 */

import type { Card } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { instantiateCard } from './deck';
import { rng } from './rng';

const BASE_POSSESSION_CARD = 'c-possessed';
const GUARDIAN_CARD = 'c-blessed';
const EVIL_CARD = 'c-cursed';
const DEFAULT_MAX = 8;

export type PossessionAlignment = 'guardian' | 'evil';

/**
 * 빙의 부여 — 빙의 카드 1장을 덱+컬렉션에 강제 편입(제외 불가). 정렬 미지정 시 50/50 추첨.
 * 하나브릿지 신전 등 *수호령 보장* 경로는 alignment='guardian'으로 호출.
 */
export function grantPossession(alignment?: PossessionAlignment): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const def = data.cards.get(BASE_POSSESSION_CARD);
  if (!def) {
    console.warn('[possession] 기본 빙의 카드 정의 없음:', BASE_POSSESSION_CARD);
    return false;
  }
  const inst = instantiateCard(def);
  // 제외 불가 — deckSize 한도를 무시하고 덱+컬렉션에 강제 편입.
  run.data.collection.push(inst);
  run.data.deck.push(inst);
  const align: PossessionAlignment = alignment ?? (rng() < 0.5 ? 'guardian' : 'evil');
  if (!run.data.possessions) run.data.possessions = {};
  run.data.possessions[inst.instanceId!] = {
    alignment: align,
    awakening: 0,
    max: def.possessionMax ?? DEFAULT_MAX,
  };
  ui.toast('warning', `${inst.name} — 무언가가 마음에 들러붙었다. 떼어낼 수 없다.`);
  return true;
}

/** 빙의 카드를 사용했을 때 호출(combat.playCard, 카드를 버린 더미로 옮긴 *후*). 각성 +1, 최대 도달 시 변신. */
export function notePossessionPlayed(card: Card): void {
  if (!card.instanceId) return;
  const run = useRunStore();
  const rec = run.data.possessions?.[card.instanceId];
  if (!rec) return;
  rec.awakening += 1;
  if (rec.awakening < rec.max) {
    useUiStore().toast('info', `각성 ${rec.awakening} / ${rec.max}`);
    return;
  }
  transformPossession(card.instanceId);
}

/** 컬렉션/덱/전투 더미의 모든 동일 instanceId 카드를 새 정의로 교체(instanceId 유지). */
function swapCardEverywhere(instanceId: string, def: Card): void {
  const r = useRunStore().data;
  const apply = (arr: Card[] | undefined) => {
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].instanceId === instanceId) arr[i] = { ...def, instanceId };
    }
  };
  apply(r.collection);
  apply(r.deck);
  const c = r.combat;
  if (c) {
    apply(c.hand);
    apply(c.drawPile);
    apply(c.discardPile);
    apply(c.exhaustPile);
  }
}

/** 최대 각성 도달 — 카드 변신 + 결말(이벤트). 양분: 수호령=축복+회복 / 악령=저주+HP 손실. */
export function transformPossession(instanceId: string): void {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const rec = run.data.possessions?.[instanceId];
  if (!rec) return;
  const guardian = rec.alignment === 'guardian';
  const def = data.cards.get(guardian ? GUARDIAN_CARD : EVIL_CARD);
  if (def) swapCardEverywhere(instanceId, def);
  if (run.data.possessions) delete run.data.possessions[instanceId];

  if (guardian) {
    const heal = 12;
    run.data.hp = Math.min(run.data.maxHp, run.data.hp + heal);
    ui.toast(
      'success',
      `들러붙은 것은 수호령이었다 — 빛이 스며들어 ${def?.name ?? '축복'}으로 피어났다. (HP +${heal})`,
    );
  } else {
    const before = run.data.hp;
    run.data.hp = Math.max(1, before - 8);
    const loss = before - run.data.hp;
    ui.toast(
      'warning',
      `들러붙은 것은 악령이었다 — ${def?.name ?? '저주'}로 일그러졌다. (HP -${loss})`,
    );
  }
}

/** 변신 전 *제외 불가 빙의 카드*인가 — 상점/공방 제거 가드용. */
export function isPossessionLocked(card: Card): boolean {
  if (!card.instanceId) return false;
  return !!useRunStore().data.possessions?.[card.instanceId];
}
