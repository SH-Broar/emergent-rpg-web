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
import { bonusesFromColors } from './stats';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';

const STARTING_HAND_SIZE = 5;
const DEFAULT_MAX_MANA = 3;

/** 현재 런의 컬러 스탯에서 도출된 전투 보너스. */
function currentBonuses() {
  const run = useRunStore();
  return bonusesFromColors(run.data.colors);
}

/**
 * 전투 중 *버프/디버프*가 카드 effect.value에 더하는 보정.
 *   - damage: +strength, -weakness
 *   - block: +dexterity, -frail
 * 사용자 사양: 카드 표시에서 "(+1) / (-2)" 부가 표기.
 */
export function statusBonusForCardEffectKind(
  kind: string,
  statuses: Record<string, number> | undefined,
): number {
  if (!statuses) return 0;
  if (kind === 'damage') return (statuses.strength ?? 0) - (statuses.weakness ?? 0);
  if (kind === 'block') return (statuses.dexterity ?? 0) - (statuses.frail ?? 0);
  return 0;
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

  // on-combat-start 유물 발동
  void import('./relic').then(({ onCombatStart }) => onCombatStart());
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

  if (c.mana < card.cost) {
    ui.toast('warning', '마나가 부족합니다');
    return { enemyDefeated: false };
  }
  c.mana -= card.cost;

  for (const effect of card.effects) {
    applyEffect(effect, c);
  }

  c.hand = c.hand.filter((_, i) => i !== handIndex);
  c.discardPile = [...c.discardPile, card];

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
    // 유물의 bonus-damage 합산
    let relicBonus = 0;
    try {
      const run = useRunStore();
      for (const relic of run.data.relics) {
        for (const eff of relic.effects) {
          if (eff.kind === 'bonus-damage') relicBonus += eff.value ?? 0;
        }
      }
    } catch { /* store 미접근 가능 */ }
    // ATK 스탯 보너스 — 공격 카드 *최소 공격력* +N (10 ATK당 1).
    const atkBonus = currentBonuses().damage;
    // 전투 중 player buff/debuff (strength/weakness).
    const statusBonus = statusBonusForCardEffectKind('damage', c.player.statuses);
    const value = Math.max(0, (e.value ?? 0) + relicBonus + atkBonus + statusBonus);
    for (const t of targets) {
      const absorbed = Math.min(t.block, value);
      t.block -= absorbed;
      t.hp = Math.max(0, t.hp - (value - absorbed));
    }
  },
  heal: (e, c) => {
    const targets = resolveTargets(e.target ?? 'self', c);
    const value = e.value ?? 0;
    for (const t of targets) {
      t.hp = Math.min(t.maxHp, t.hp + value);
    }
  },
  block: (e, c) => {
    const targets = resolveTargets(e.target ?? 'self', c);
    // DEF 스탯 보너스 — 방어 카드 *방어력* +N (10 DEF당 1).
    const defBonus = currentBonuses().block;
    // 전투 중 player buff/debuff (dexterity/frail).
    const statusBonus = statusBonusForCardEffectKind('block', c.player.statuses);
    const value = Math.max(0, (e.value ?? 0) + defBonus + statusBonus);
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
};

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
 * 플레이어 사망 시 반환 { playerDefeated: true }.
 */
export function endPlayerTurn(monster: Monster): { playerDefeated: boolean } {
  const run = useRunStore();
  const r = run.data;
  const c = r.combat;
  if (!c) return { playerDefeated: false };

  executeMonsterIntent(c);

  if (c.player.hp <= 0) {
    return { playerDefeated: true };
  }

  c.discardPile = discardHand(c.hand, c.discardPile);
  c.hand = [];

  c.turn += 1;
  c.mana = c.maxMana;
  c.player.block = 0;

  // MAG 보너스로 매 턴 드로우 +.
  const handSize = STARTING_HAND_SIZE + currentBonuses().drawExtra;
  const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, handSize);
  c.hand = drawn;
  c.drawPile = newDrawPile;
  c.discardPile = newDiscardPile;

  c.enemyIntent = pickIntent(monster, c.turn);
  return { playerDefeated: false };
}

function executeMonsterIntent(c: CombatState) {
  const intent = c.enemyIntent;
  if (!intent) return;

  const [kind, valueStr] = intent.split(':');
  const value = Number(valueStr) || 0;

  switch (kind) {
    case 'attack': {
      const absorbed = Math.min(c.player.block, value);
      c.player.block -= absorbed;
      c.player.hp = Math.max(0, c.player.hp - (value - absorbed));
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
  void import('./relic').then(({ onCombatEnd }) => onCombatEnd());

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
}
