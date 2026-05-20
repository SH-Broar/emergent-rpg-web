/**
 * 전투 시스템.
 *
 * spec v2 Round 8: 카드 = 여정. 핸드 드로우 + 카드 사용 + 적 행동 + 턴 진행.
 * 분기 B (하이브리드): 효과는 *데이터 드리븐* 기본, *함수 슬롯*은 특수 카드용.
 * 분기 C (하이브리드): *기본 턴제* + *persistent 카드*는 지속 효과.
 *
 * MVR 단계 효과 종류: damage / heal / block / draw / apply-status.
 * 사용자 정의: 몬스터는 골드 + 시간의 조각 드롭.
 */

import type {
  Card,
  CardEffect,
  CardEffectKind,
  CombatState,
  Combatant,
  EffectTarget,
  Monster,
  MonsterDrop,
} from '@/data/schemas';
import { drawCards, discardHand } from './deck';
import { rng } from './rng';
import { bonusesFromEffective } from './equipment';
import {
  applyModifiers,
  fireRelicTrigger,
  getModifierAdd,
  onCombatStart as fireOnCombatStart,
  onCombatEnd as fireOnCombatEnd,
} from './relic';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';

const STARTING_HAND_SIZE = 5;
const DEFAULT_MAX_MANA = 3;

/** 현재 런의 *effective* 컬러(베이스+장비)에서 도출된 전투 보너스 (B1 fix). */
function currentBonuses() {
  const run = useRunStore();
  const data = useDataStore();
  return bonusesFromEffective(run.data, data.equipments);
}

/**
 * 플레이어가 *이번 전투에서 실제로 받을* 컬러 스탯 보너스.
 *
 * regress(퇴행) 상태이면 ATK/DEF/MAG 컬러 보너스를 *전부 무효* — 모두 0.
 * 그 외에는 currentBonuses()와 동일.
 *
 * 주의: 컬러 *직접* 피해(damage-top-color / damage-min-color / damage-color-count 등)는
 * 스탯 보너스가 아니라 컬러값 자체를 쓰므로 regress 영향을 받지 않는다.
 */
function playerBonuses(c: CombatState): ReturnType<typeof currentBonuses> {
  if ((c.player.statuses?.regress ?? 0) > 0) {
    return { damage: 0, block: 0, drawExtra: 0, manaExtra: 0 };
  }
  return currentBonuses();
}

/**
 * 전투 중 *버프/디버프*가 카드 effect.value에 더하는 *플랫* 보정.
 *   - damage: +strength
 *   - block: +dexterity, -frail
 * 사용자 사양: 카드 표시에서 "(+1) / (-2)" 부가 표기.
 *
 * 주의 (status 통합 fix): weakness는 *배수 단계*(applyDamage의 ×0.75)로 일원화했다.
 * 따라서 여기서는 weakness 플랫 차감을 *제거* — 중복 적용 방지.
 * (frail은 block 전용이라 배수 단계가 없으므로 플랫으로 유지.)
 */
export function statusBonusForCardEffectKind(
  kind: string,
  statuses: Record<string, number> | undefined,
): number {
  if (!statuses) return 0;
  if (kind === 'damage') return statuses.strength ?? 0;
  if (kind === 'block') return (statuses.dexterity ?? 0) - (statuses.frail ?? 0);
  return 0;
}

/**
 * 통합 피해 적용 — 모든 피해 경로(카드 damage / 컬러 피해 / 적 공격)가 이 함수를 거친다.
 *
 * rawValue: 이미 strength/ATK/modifier 등 *플랫 보정이 끝난* 피해량.
 * attackerStatuses: 공격자의 statuses (플레이어 카드면 player, 적 공격이면 enemy).
 *
 * 적용 순서:
 *   rawValue → weakness(공격자) ×0.75 → vulnerable(대상) ×1.5 → block 흡수 → hp.
 * 각 배수마다 Math.floor.
 */
function applyDamage(
  target: Combatant,
  rawValue: number,
  attackerStatuses: Record<string, number> | undefined,
): void {
  let v = Math.max(0, rawValue);
  // weakness(약화): 공격자가 주는 피해 ×0.75.
  const weakness = attackerStatuses?.weakness ?? 0;
  if (weakness > 0) v = Math.floor(v * 0.75);
  // vulnerable(취약): 대상이 받는 피해 ×1.5.
  const vulnerable = target.statuses?.vulnerable ?? 0;
  if (vulnerable > 0) v = Math.floor(v * 1.5);
  // block 흡수 후 hp 차감.
  const absorbed = Math.min(target.block, v);
  target.block -= absorbed;
  target.hp = Math.max(0, target.hp - (v - absorbed));
}

/**
 * poison(중독) 턴 처리 — 대상 턴 종료 시 호출.
 * 스택만큼 *block 무시 직접 hp* 피해, 그 후 스택 -1. 스택 0이면 제거.
 * (vulnerable/weakness 배수는 적용하지 않음 — poison은 *순수 직접 피해*.)
 */
function tickPoison(target: Combatant): void {
  const stack = target.statuses?.poison ?? 0;
  if (stack <= 0) return;
  target.hp = Math.max(0, target.hp - stack);
  const next = stack - 1;
  if (next <= 0) {
    delete target.statuses.poison;
  } else {
    target.statuses.poison = next;
  }
}

/**
 * feral(수화)/regress(퇴행) 턴 감소 — 매 플레이어 턴 종료 시 양쪽(플레이어·적) -1.
 * 0이 되면 제거. vulnerable/weakness 등 기존 status는 여기서 건드리지 않는다.
 */
function decayTurnStatuses(target: Combatant): void {
  for (const key of ['feral', 'regress'] as const) {
    const stack = target.statuses?.[key] ?? 0;
    if (stack <= 0) continue;
    const next = stack - 1;
    if (next <= 0) delete target.statuses[key];
    else target.statuses[key] = next;
  }
}

/** 전투 시작 — Combat state 초기화 + 첫 핸드 드로우. */
export function startCombat(monster: Monster) {
  const run = useRunStore();
  const r = run.data;

  const player: Combatant = {
    hp: r.hp,
    maxHp: r.maxHp,
    block: 0,
    statuses: {},
  };

  const enemyCombatant: Combatant = {
    hp: monster.hp,
    maxHp: monster.hp,
    block: 0,
    statuses: {},
  };

  // MAG 보너스로 드로우/마나 증가.
  const bonus = currentBonuses();
  const handSize = STARTING_HAND_SIZE + bonus.drawExtra;
  const maxMana = DEFAULT_MAX_MANA + bonus.manaExtra;

  const drawPile = [...r.deck];
  const { drawn, newDrawPile, newDiscardPile } = drawCards(drawPile, [], handSize);

  const combat: CombatState = {
    enemy: enemyCombatant,
    enemyIntent: pickIntent(monster, 0),
    player,
    hand: drawn,
    drawPile: newDrawPile,
    discardPile: newDiscardPile,
    exhaustPile: [],
    turn: 1,
    mana: maxMana,
    maxMana: maxMana,
  };
  r.combat = combat;

  // on-combat-start 유물 발동, 이어서 1턴의 on-turn-start.
  fireOnCombatStart();
  fireRelicTrigger('on-turn-start', { run: r, combat });
}

/**
 * 카드를 핸드에서 사용. 효과 적용 후 디스카드.
 * 적 사망 시 false (호출자가 결과 화면으로 전환), 아니면 true.
 */
export function playCard(handIndex: number, monster: Monster): { enemyDefeated: boolean } {
  const run = useRunStore();
  const ui = useUiStore();
  const r = run.data;
  const c = r.combat;
  if (!c) return { enemyDefeated: false };

  const card = c.hand[handIndex];
  if (!card) return { enemyDefeated: false };

  // 동적 cost: c-tripps-rage는 *이번 런 누적 피해*만큼 cost 경감.
  let baseCost = card.cost;
  if (card.id === 'c-tripps-rage' || card.id === 'c-tripps-rage-plus') {
    const damageReceived = r.runDamageReceived ?? 0;
    baseCost = Math.max(0, baseCost - damageReceived);
  }
  // cost-mod-add 유물 (예: 모든 카드 비용 -1) 적용. 음수 cost는 0으로 clamp.
  const effCost = Math.max(0, baseCost + getModifierAdd('cost-mod-add'));
  // r4: debugFlag infiniteMana — 마나 가드 우회 + 차감 스킵.
  const inf = ui.debug.infiniteMana;
  if (!inf && c.mana < effCost) {
    ui.toast('warning', '마나가 부족합니다');
    return { enemyDefeated: false };
  }
  if (!inf) c.mana -= effCost;

  // 카드 효과 적용 *직전* trigger — 자기 자신의 데미지 계산에 영향을 줄 마지막 기회.
  fireRelicTrigger('on-card-played-before', { run: r, combat: c, triggeredBy: card.id });

  // growing-block/growing-damage 효과 핸들러가 카드 인스턴스의 bonus를 더하기 위해 임시 참조를 세팅.
  (c as { currentPlayingCard?: Card }).currentPlayingCard = card;

  // next-card-double: *이전* 카드가 세워 둔 플래그가 켜져 있으면 이 카드의 모든 effect value 2배.
  // 이번 카드가 스스로 세우는 플래그(자기 자신은 영향 X)와 구분하기 위해, 효과 루프 *전*에 캡처.
  const flags = c as { nextCardDouble?: boolean };
  const doubleThisCard = flags.nextCardDouble === true;
  if (doubleThisCard) flags.nextCardDouble = false;

  for (const effect of card.effects) {
    if (doubleThisCard && effect.value !== undefined) {
      // value를 2배로 한 *사본*으로 적용 — 원본 effect는 건드리지 않음.
      applyEffect({ ...effect, value: effect.value * 2 }, c);
    } else {
      applyEffect(effect, c);
    }
  }

  (c as { currentPlayingCard?: Card }).currentPlayingCard = undefined;

  // growing-block 효과가 있으면 *카드 인스턴스의 bonusBlock 누적* (다음 사용 시 block에 더해짐).
  if (card.effects.some((e) => e.kind === 'growing-block')) {
    card.bonusBlock = (card.bonusBlock ?? 0) + 1;
  }

  // growing-damage 효과가 있으면 *카드 인스턴스의 bonusDamage 누적* (다음 사용 시 damage에 더해짐).
  if (card.effects.some((e) => e.kind === 'growing-damage')) {
    card.bonusDamage = (card.bonusDamage ?? 0) + 1;
  }

  // 카드 효과 적용 *후*, 디스카드 *전* trigger.
  // alias 정규화 덕분에 옛 데이터의 trigger=on-card-play도 같은 시점에 매칭.
  fireRelicTrigger('on-card-played-after', { run: r, combat: c, triggeredBy: card.id });

  c.hand = c.hand.filter((_, i) => i !== handIndex);
  // exhaust-self 마커가 있으면 discardPile 대신 *exhaustPile*로 (이번 전투 재사용 불가).
  if (card.effects.some((e) => e.kind === 'exhaust-self')) {
    c.exhaustPile = [...c.exhaustPile, card];
  } else {
    c.discardPile = [...c.discardPile, card];
  }

  // c-rize-relay 특수 후처리: 같은 카드 *cost 0* 복제를 핸드에 push (이번 턴 안 재사용 가능).
  // 핸드 풀이면 discard로 fallback. 카드 자체 ID 비교 — 데이터 드리븐이 아닌 *카드 특이 분기*.
  if (card.id === 'c-rize-relay' || card.id === 'c-rize-relay-plus') {
    const replica = { ...card, cost: 0 };
    if (c.hand.length < 10) {
      c.hand = [...c.hand, replica];
    } else {
      c.discardPile = [...c.discardPile, replica];
    }
  }

  if (c.enemy.hp <= 0) {
    return { enemyDefeated: true };
  }
  void monster;
  return { enemyDefeated: false };
}

function applyEffect(effect: CardEffect, c: CombatState) {
  const handler = EFFECT_HANDLERS[effect.kind];
  if (handler) handler(effect, c);
}

const EFFECT_HANDLERS: Record<CardEffectKind, (e: CardEffect, c: CombatState) => void> = {
  damage: (e, c) => {
    const targets = resolveTargets(e.target ?? 'enemy', c);
    // feral(수화): 카드 *base damage ×2* — ATK 보너스 더하기 *전*에 2배.
    const base = (c.player.statuses?.feral ?? 0) > 0 ? (e.value ?? 0) * 2 : (e.value ?? 0);
    // ATK 스탯 보너스 — 공격 카드 *최소 공격력* +N (10 ATK당 1). regress면 0.
    const atkBonus = playerBonuses(c).damage;
    // 전투 중 player buff (strength). weakness는 applyDamage 배수 단계에서 처리.
    const statusBonus = statusBonusForCardEffectKind('damage', c.player.statuses);
    // base(×feral) + atk + status를 modifier pipeline에 흘려보냄.
    // 유물의 damage-out-add (옛 bonus-damage alias)는 applyModifiers 내부에서 합산.
    const value = applyModifiers(
      base + atkBonus + statusBonus,
      'damage-out-add',
      'damage-out-mul',
    );
    // 통합 피해: weakness(공격자=player) ×0.75 → vulnerable(대상) ×1.5 → block → hp.
    for (const t of targets) applyDamage(t, value, c.player.statuses);
  },
  // 8 컬러 중 *최솟값* × value 만큼 데미지. ATK/상태/modifier 보너스 모두 무시 — *순수 균형값*.
  // 단 weakness/vulnerable 배수는 통합 적용 (다른 피해 경로와 일관성).
  'damage-min-color': (e, c) => {
    const targets = resolveTargets(e.target ?? 'enemy', c);
    const colors = useRunStore().data.colors;
    const minColor = Math.min(
      colors.fire, colors.water, colors.electric, colors.iron,
      colors.earth, colors.wind, colors.light, colors.dark,
    );
    const value = Math.max(0, Math.floor(minColor * (e.value ?? 1)));
    for (const t of targets) applyDamage(t, value, c.player.statuses);
  },
  heal: (e, c) => {
    const targets = resolveTargets(e.target ?? 'self', c);
    const value = e.value ?? 0;
    for (const t of targets) {
      t.hp = Math.min(t.maxHp, t.hp + value);
    }
  },
  block: (e, c) => {
    // feral(수화): 플레이어는 *block을 전혀 쌓지 못함* — 0 부여.
    if ((c.player.statuses?.feral ?? 0) > 0) return;
    const targets = resolveTargets(e.target ?? 'self', c);
    // DEF 스탯 보너스 — 방어 카드 *방어력* +N (10 DEF당 1). regress면 0.
    const defBonus = playerBonuses(c).block;
    // 전투 중 player buff/debuff (dexterity/frail).
    const statusBonus = statusBonusForCardEffectKind('block', c.player.statuses);
    // base + def + status에 유물의 block-out-add 합산 (mul은 본 라운드 미사용).
    const value = applyModifiers(
      (e.value ?? 0) + defBonus + statusBonus,
      'block-out-add',
    );
    for (const t of targets) {
      t.block += value;
    }
  },
  draw: (e, c) => {
    const count = e.value ?? 1;
    const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, count);
    c.hand = [...c.hand, ...drawn];
    c.drawPile = newDrawPile;
    c.discardPile = newDiscardPile;
  },
  'apply-status': (e, c) => {
    const targets = resolveTargets(e.target ?? 'enemy', c);
    const statusName = (e.params?.status as string) ?? 'unknown';
    const stack = e.value ?? 1;
    for (const t of targets) {
      t.statuses[statusName] = (t.statuses[statusName] ?? 0) + stack;
    }
  },
  // 손에서 *가장 오른쪽* 1장을 drawPile 맨 위로 (칼리번 c-trace-step).
  // count = value (기본 1). 카드가 사용된 *직후* 시점이라 hand에는 *다른* 카드들만 남아 있음.
  'return-hand-to-deck': (e, c) => {
    let remaining = e.value ?? 1;
    while (remaining > 0 && c.hand.length > 0) {
      const last = c.hand[c.hand.length - 1];
      c.hand = c.hand.slice(0, -1);
      c.drawPile = [last, ...c.drawPile];
      remaining -= 1;
    }
  },
  // 다음 턴 시작 에너지 +value 누적 (칼리번 c-trace-step).
  // endPlayerTurn 끝부분에서 mana += nextTurnEnergyBonus 후 0으로 리셋.
  'next-turn-energy': (e) => {
    const r = useRunStore().data;
    r.nextTurnEnergyBonus = (r.nextTurnEnergyBonus ?? 0) + (e.value ?? 1);
  },
  // block:value + *이 카드 인스턴스의 bonusBlock +growthValue* 누적 (쿠르쿠마 c-growing-leaf).
  // e.value = 기본 block, e.params.growth = 누적량(기본 1). bonusBlock은 매 사용마다 누적 → 다음 사용 때 더해짐.
  'growing-block': (e, c) => {
    // 이 효과가 적용되는 시점에서 *어떤 카드*가 트리거됐는지 알기 위해 컨텍스트 카드 참조가 필요.
    // playCard의 currentPlayingCard를 통해 우회 — 여기선 c.hand에 없는 *방금 사용된 카드*를 추적해야 함.
    // 단순화: combat 상태에 latestPlayingCard 임시 필드를 두지 않고, playCard에서 `growing-block` 효과 카드를 미리 식별해 처리.
    // → 이 핸들러는 block 효과만 수행하고, *누적*은 playCard 본체에서.
    // feral(수화): block 부여 0. 단 bonusBlock *누적*은 playCard 본체에서 계속됨(다음 사용 대비).
    if ((c.player.statuses?.feral ?? 0) > 0) return;
    const targets = resolveTargets(e.target ?? 'self', c);
    const defBonus = playerBonuses(c).block;
    const statusBonus = statusBonusForCardEffectKind('block', c.player.statuses);
    const base = e.value ?? 0;
    const bonus = (c as { currentPlayingCard?: Card }).currentPlayingCard?.bonusBlock ?? 0;
    const value = applyModifiers(
      base + bonus + defBonus + statusBonus,
      'block-out-add',
    );
    for (const t of targets) {
      t.block += value;
    }
  },
  // === 측정 어려운 메커니즘 (1차 배치) — 컬러/상태/HP/패 ===
  // 순수 피해 헬퍼: block 흡수 후 hp 차감.
  // 8 컬러 중 *최댓값* × value (보강 무시).
  'damage-top-color': (e, c) => {
    const colors = useRunStore().data.colors;
    const top = Math.max(
      colors.fire, colors.water, colors.electric, colors.iron,
      colors.earth, colors.wind, colors.light, colors.dark,
    );
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), Math.floor(top * (e.value ?? 1)));
  },
  // *0보다 큰 컬러 종류 수* × value.
  'damage-color-count': (e, c) => {
    const colors = useRunStore().data.colors;
    const count = [
      colors.fire, colors.water, colors.electric, colors.iron,
      colors.earth, colors.wind, colors.light, colors.dark,
    ].filter((v) => v > 0).length;
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), count * (e.value ?? 1));
  },
  // 8 컬러 중 *최댓값* × value 방어.
  'block-top-color': (e, c) => {
    // feral(수화): 플레이어는 block을 전혀 쌓지 못함 — 0 부여.
    if ((c.player.statuses?.feral ?? 0) > 0) return;
    const colors = useRunStore().data.colors;
    const top = Math.max(
      colors.fire, colors.water, colors.electric, colors.iron,
      colors.earth, colors.wind, colors.light, colors.dark,
    );
    c.player.block += Math.floor(top * (e.value ?? 1));
  },
  // params.color 컬러 ≥ params.threshold면 value장 드로우.
  'draw-if-color': (e, c) => {
    const color = (e.params?.color as keyof typeof zeroColors) ?? 'fire';
    const threshold = Number(e.params?.threshold ?? 5);
    const colors = useRunStore().data.colors;
    if ((colors[color] ?? 0) >= threshold) {
      const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, e.value ?? 1);
      c.hand = [...c.hand, ...drawn];
      c.drawPile = newDrawPile;
      c.discardPile = newDiscardPile;
    }
  },
  // (적 디버프 스택 총합) × value + base 데미지.
  'damage-per-debuff': (e, c) => {
    const s = c.enemy.statuses;
    // regress(퇴행)/feral도 포함한 *모든* 적 디버프 스택 총합 (status 작동).
    const debuffSum = (s.vulnerable ?? 0) + (s.weakness ?? 0) + (s.frail ?? 0)
      + (s.poison ?? 0) + (s.feral ?? 0) + (s.regress ?? 0);
    // regress면 atkBonus 0 (playerBonuses).
    const atkBonus = playerBonuses(c).damage + statusBonusForCardEffectKind('damage', c.player.statuses);
    const value = applyModifiers((e.value ?? 0) * debuffSum + atkBonus, 'damage-out-add', 'damage-out-mul');
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), value);
  },
  // 적 *취약 스택 제거* → 제거량 × value 추가 데미지.
  'consume-vulnerable': (e, c) => {
    const vuln = c.enemy.statuses.vulnerable ?? 0;
    c.enemy.statuses.vulnerable = 0;
    dealRawDamage([c.enemy], vuln * (e.value ?? 1));
  },
  // 자기 HP를 value 지불, 지불액 × params.mult 데미지.
  'damage-from-hp': (e, c) => {
    const pay = Math.min(e.value ?? 0, Math.max(0, c.player.hp - 1));
    c.player.hp -= pay;
    const mult = Number(e.params?.mult ?? 2);
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), Math.floor(pay * mult));
  },
  // *현재 손패 수* × value 데미지 (이 카드 사용 후 핸드 — 자기 자신은 아직 hand에 있음).
  'damage-per-hand': (e, c) => {
    const handCount = c.hand.length;
    // regress면 atkBonus 0 (playerBonuses).
    const atkBonus = playerBonuses(c).damage + statusBonusForCardEffectKind('damage', c.player.statuses);
    const value = applyModifiers((e.value ?? 1) * handCount + atkBonus, 'damage-out-add', 'damage-out-mul');
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), value);
  },
  // === 측정 어려운 메커니즘 (3차 배치) ===
  // 마커: 실제 처리는 playCard 본체(card.effects에 exhaust-self 있으면 exhaustPile로). 핸들러는 no-op.
  'exhaust-self': () => {
    // no-op — playCard에서 카드 이동 분기로 처리.
  },
  // 현재 player.block × value 추가 피해 (block 소모하지 않음). weakness/vulnerable 통합 적용.
  'block-to-damage': (e, c) => {
    const value = c.player.block * (e.value ?? 1);
    for (const t of resolveTargets(e.target ?? 'enemy', c)) {
      applyDamage(t, value, c.player.statuses);
    }
  },
  // 남은 mana 전부 소비 → 소비액 × value 피해. (playCard에서 effCost 차감 후 남은 mana 기준.)
  'spend-all-energy': (e, c) => {
    const spent = c.mana;
    c.mana = 0;
    const value = spent * (e.value ?? 1);
    for (const t of resolveTargets(e.target ?? 'enemy', c)) {
      applyDamage(t, value, c.player.statuses);
    }
  },
  // 동료 수 × value 피해.
  'damage-per-companion': (e, c) => {
    const count = useRunStore().data.companions.length;
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), count * (e.value ?? 1));
  },
  // 유물 수 × value 피해.
  'damage-per-relic': (e, c) => {
    const count = useRunStore().data.relics.length;
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), count * (e.value ?? 1));
  },
  // growing-block의 공격판: damage = (value + 이 카드 인스턴스의 bonusDamage) + atk/status 보정.
  // 누적은 playCard 본체에서 (다음 사용 시 더해짐). feral ×2는 적용하지 않음(특수 효과 일관).
  'growing-damage': (e, c) => {
    const bonus = (c as { currentPlayingCard?: Card }).currentPlayingCard?.bonusDamage ?? 0;
    // regress면 atkBonus 0 (playerBonuses).
    const atkBonus = playerBonuses(c).damage + statusBonusForCardEffectKind('damage', c.player.statuses);
    const value = applyModifiers((e.value ?? 0) + bonus + atkBonus, 'damage-out-add', 'damage-out-mul');
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), value);
  },
  // *현재 손패 수* × value 회복 (self, maxHp clamp).
  'heal-per-hand': (e, c) => {
    const handCount = c.hand.length;
    const value = handCount * (e.value ?? 1);
    for (const t of resolveTargets(e.target ?? 'self', c)) {
      t.hp = Math.min(t.maxHp, t.hp + value);
    }
  },
  // combat flag: *다음 1장*의 모든 effect value 2배. 실제 2배 적용은 playCard 본체.
  // 이 카드 자신은 영향 없음(playCard가 효과 루프 전에 플래그를 캡처하기 때문).
  'next-card-double': (_e, c) => {
    (c as { nextCardDouble?: boolean }).nextCardDouble = true;
  },
};

/** 컬러 키 참조용 (draw-if-color params 타입). */
const zeroColors = {
  fire: 0, water: 0, electric: 0, iron: 0, earth: 0, wind: 0, light: 0, dark: 0,
};

/**
 * 플레이어 컬러/특수 효과 피해 — 통합 applyDamage 경유.
 * 공격자는 항상 *플레이어*(이 헬퍼는 카드 효과 전용)이므로 player.statuses의 weakness,
 * 대상의 vulnerable 배수가 일관 적용된다.
 */
function dealRawDamage(targets: Combatant[], value: number) {
  const playerStatuses = useRunStore().data.combat?.player.statuses;
  for (const t of targets) applyDamage(t, value, playerStatuses);
}

function resolveTargets(target: EffectTarget, c: CombatState): Combatant[] {
  switch (target) {
    case 'self':
      return [c.player];
    case 'enemy':
    case 'all-enemies':
    case 'random-enemy':
      return [c.enemy];
  }
}

/**
 * 플레이어 턴 종료. 적 행동 → 다음 턴 시작.
 * 플레이어 사망 시 { playerDefeated: true }.
 * 적이 (poison 등으로) 턴 종료 중 사망하면 { enemyDefeated: true } — 호출자가 승리 처리.
 */
export function endPlayerTurn(monster: Monster): { playerDefeated: boolean; enemyDefeated?: boolean } {
  const run = useRunStore();
  const r = run.data;
  const c = r.combat;
  if (!c) return { playerDefeated: false };

  // 플레이어 턴 종료 trigger — 몬스터 행동 *전*.
  fireRelicTrigger('on-turn-end', { run: r, combat: c });

  // 적 poison(중독) — 적 턴 종료 처리. 몬스터 행동 *전*에 틱.
  // (poison으로 적 hp 0이 되면 행동을 생략하고 *승리* 신호 — CombatView가 onVictory.)
  tickPoison(c.enemy);
  if (c.enemy.hp <= 0) {
    return { playerDefeated: false, enemyDefeated: true };
  }

  // r4: debugFlag freezeEnemies — 적 행동 시뮬 스킵 (전투 정지 디버그).
  if (!useUiStore().debug.freezeEnemies) {
    executeMonsterIntent(c);
  }

  if (c.player.hp <= 0) {
    return { playerDefeated: true };
  }

  // feral(수화)/regress(퇴행) 턴 감소 — 양쪽 -1, 0이면 제거. (vulnerable/weakness는 불변.)
  // 새 턴의 mana/handSize 계산 *전*에 감소시켜야 regress가 다음 턴부터 풀린다.
  decayTurnStatuses(c.player);
  decayTurnStatuses(c.enemy);

  c.discardPile = discardHand(c.hand, c.discardPile);
  c.hand = [];

  c.turn += 1;
  // regress(퇴행)면 MAG manaExtra 무효 → 기본 maxMana만. (playerBonuses가 0 반환.)
  const effMaxMana = DEFAULT_MAX_MANA + playerBonuses(c).manaExtra;
  c.mana = effMaxMana;
  // 칼리번 c-trace-step: 다음 턴 시작 에너지 +N 보너스 소비.
  const nextEnergyBonus = r.nextTurnEnergyBonus ?? 0;
  if (nextEnergyBonus > 0) {
    c.mana += nextEnergyBonus;
    r.nextTurnEnergyBonus = 0;
  }
  c.player.block = 0;

  // MAG 보너스로 매 턴 드로우 +. regress면 drawExtra 무효(playerBonuses 0).
  const handSize = STARTING_HAND_SIZE + playerBonuses(c).drawExtra;
  const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, handSize);
  c.hand = drawn;
  c.drawPile = newDrawPile;
  c.discardPile = newDiscardPile;

  c.enemyIntent = pickIntent(monster, c.turn);

  // 플레이어 poison(중독) — 새 턴 시작 시 틱. block 무시 직접 hp 피해.
  tickPoison(c.player);
  if (c.player.hp <= 0) {
    return { playerDefeated: true };
  }

  // 새 턴 진입 trigger — 드로우/마나 리셋 완료 후.
  fireRelicTrigger('on-turn-start', { run: r, combat: c });
  return { playerDefeated: false };
}

function executeMonsterIntent(c: CombatState) {
  const intent = c.enemyIntent;
  if (!intent) return;

  const [kind, valueStr] = intent.split(':');
  const value = Number(valueStr) || 0;

  switch (kind) {
    case 'attack': {
      // 통합 피해: weakness(공격자=enemy) ×0.75 → vulnerable(대상=player) ×1.5 → block → hp.
      const hpBefore = c.player.hp;
      applyDamage(c.player, value, c.enemy.statuses);
      const hpLoss = hpBefore - c.player.hp;
      // 모나토 c-tripps-rage 동적 cost용 누적 피해 — block 흡수 제외 *실제 HP 손실*만.
      if (hpLoss > 0) {
        const r = useRunStore().data;
        r.runDamageReceived = (r.runDamageReceived ?? 0) + hpLoss;
      }
      break;
    }
    case 'defend': {
      c.enemy.block += value;
      break;
    }
    case 'buff': {
      c.enemy.statuses['strength'] = (c.enemy.statuses['strength'] ?? 0) + value;
      break;
    }
    default:
      break;
  }
}

function pickIntent(monster: Monster, turn: number): string {
  if (monster.intents.length === 0) return 'attack:5';
  return monster.intents[turn % monster.intents.length].encoded;
}

/**
 * 드롭 정보를 반환하고 run에 적용. CombatView가 결과 화면에 표시.
 */
export interface CombatVictoryDrop {
  gold: number;
  timeShards: number;
  cards: Card[];     // 드롭된 카드 (확률 통과)
}

export function applyMonsterDrop(drop: MonsterDrop, allCards: Map<string, Card>): CombatVictoryDrop {
  const run = useRunStore();
  const r = run.data;

  r.gold += drop.gold;
  r.timeShards += drop.timeShards;

  const droppedCards: Card[] = [];
  for (const cd of drop.cardDrops ?? []) {
    if (rng() < cd.chance) {
      const card = allCards.get(cd.cardId);
      if (card) {
        droppedCards.push(card);
        // 컬렉션에 추가 — 덱 슬롯 등록은 사용자가 덱 편집에서.
        run.addCardToCollection(card);
      }
    }
  }

  // on-combat-end 유물 발동 (bonus-gold 등)
  fireOnCombatEnd();

  return {
    gold: drop.gold,
    timeShards: drop.timeShards,
    cards: droppedCards,
  };
}

/** 전투 종료 정리 (CombatView가 결과 화면 이후 호출). */
export function clearCombat() {
  const run = useRunStore();
  run.data.combat = undefined;
  // 디버그 전투 오버라이드는 1회용 — 전투 종료 시 해제해 일반 전투에 영향 없게.
  useUiStore().clearDebugBattle();
}
