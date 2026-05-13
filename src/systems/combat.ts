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
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';

const STARTING_HAND_SIZE = 5;
const DEFAULT_MAX_MANA = 3;

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

  const drawPile = [...r.deck];
  const { drawn, newDrawPile, newDiscardPile } = drawCards(drawPile, [], STARTING_HAND_SIZE);

  const combat: CombatState = {
    enemy: enemyCombatant,
    enemyIntent: pickIntent(monster, 0),
    player,
    hand: drawn,
    drawPile: newDrawPile,
    discardPile: newDiscardPile,
    exhaustPile: [],
    turn: 1,
    mana: DEFAULT_MAX_MANA,
    maxMana: DEFAULT_MAX_MANA,
  };
  r.combat = combat;
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
    const value = e.value ?? 0;
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
    const value = e.value ?? 0;
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

  const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, STARTING_HAND_SIZE);
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
    if (Math.random() < cd.chance) {
      const card = allCards.get(cd.cardId);
      if (card) {
        droppedCards.push(card);
        // 드롭 카드는 *새 발견* — 도감 등록은 progression에서. 여기선 newCardEncounters 추가.
        if (!r.newCardEncounters.includes(card.id)) {
          r.newCardEncounters.push(card.id);
        }
      }
    }
  }

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
