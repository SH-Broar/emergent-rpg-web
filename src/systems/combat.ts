/**
 * 전투 시스템.
 *
 * spec v2 Round 8: 카드 = 여정. 핸드 드로우 + 카드 사용 + 적 행동 + 턴 진행.
 * 분기 B (하이브리드): 효과는 *데이터 드리븐* 기본, *함수 슬롯*은 특수 카드용.
 * 분기 C (하이브리드): *기본 턴제* + *persistent 카드*는 지속 효과.
 *
 * MVR 단계 효과 종류: damage / heal / block / draw / apply-status.
 */

import type {
  Card,
  CardEffect,
  CardEffectKind,
  CombatState,
  Combatant,
  EffectTarget,
} from '@/data/schemas';
import { drawCards, discardHand } from './deck';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';

const STARTING_HAND_SIZE = 5;
const DEFAULT_MAX_MANA = 3;

/** 적 시드 — MVR 단계의 단순 적. */
export interface EnemySeed {
  name: string;
  hp: number;
  intents: string[]; // 'attack:5' | 'defend:3' | 'buff:1' 형식 (단순)
}

/** 전투 시작 — Combat state 초기화 + 첫 핸드 드로우. */
export function startCombat(enemy: EnemySeed) {
  const run = useRunStore();
  const r = run.data;

  const player: Combatant = {
    hp: r.hp,
    maxHp: r.maxHp,
    block: 0,
    statuses: {},
  };

  const enemyCombatant: Combatant = {
    hp: enemy.hp,
    maxHp: enemy.hp,
    block: 0,
    statuses: {},
  };

  const drawPile = [...r.deck];
  const { drawn, newDrawPile, newDiscardPile } = drawCards(drawPile, [], STARTING_HAND_SIZE);

  const combat: CombatState = {
    enemy: enemyCombatant,
    enemyIntent: pickIntent(enemy, 0),
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

  // 지속 카드 (trigger=persistent)는 핸드에 안 들어감 — 별도 처리 가능, 단순화
}

/** 카드를 핸드에서 사용. 효과 적용 후 디스카드. */
export function playCard(handIndex: number, enemySeed: EnemySeed) {
  const run = useRunStore();
  const ui = useUiStore();
  const r = run.data;
  const c = r.combat;
  if (!c) return;

  const card = c.hand[handIndex];
  if (!card) return;

  // 디버그: 무한 마나
  if (!ui.debug.infiniteMana && c.mana < card.cost) {
    ui.toast('warning', '마나가 부족합니다');
    return;
  }
  if (!ui.debug.infiniteMana) c.mana -= card.cost;

  // 효과 적용
  for (const effect of card.effects) {
    applyEffect(effect, c);
  }
  // customEffectId가 있으면 추후 핸들러 레지스트리로 (MVR에는 미사용)

  // 핸드에서 디스카드
  c.hand = c.hand.filter((_, i) => i !== handIndex);
  c.discardPile = [...c.discardPile, card];

  // 적 사망 체크
  if (c.enemy.hp <= 0) {
    onVictory(card);
    return;
  }

  // 적 intent 갱신 (다음 행동 미리 보여주기 위함은 endPlayerTurn에서)
  void enemySeed; // (MVR 단계에서는 enemy 변동 없음)
}

/** 효과 단위 처리 — 5종 MVR. */
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

/** 플레이어 턴 종료. 적 행동 → 다음 턴 시작. */
export function endPlayerTurn(enemySeed: EnemySeed) {
  const run = useRunStore();
  const ui = useUiStore();
  const r = run.data;
  const c = r.combat;
  if (!c) return;

  // 적 행동 (디버그 동결 시 스킵)
  if (!ui.debug.freezeEnemies) {
    executeEnemyIntent(c);
  }

  // 플레이어 사망 체크
  if (c.player.hp <= 0) {
    onDefeat();
    return;
  }

  // 핸드 디스카드
  c.discardPile = discardHand(c.hand, c.discardPile);
  c.hand = [];

  // 턴 진행
  c.turn += 1;
  c.mana = c.maxMana;
  // 블록은 턴 종료 시 리셋 (STS 표준)
  c.player.block = 0;

  // 새 핸드 드로우
  const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, STARTING_HAND_SIZE);
  c.hand = drawn;
  c.drawPile = newDrawPile;
  c.discardPile = newDiscardPile;

  // 다음 적 intent
  c.enemyIntent = pickIntent(enemySeed, c.turn);
}

function executeEnemyIntent(c: CombatState) {
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

function pickIntent(enemy: EnemySeed, turn: number): string {
  if (enemy.intents.length === 0) return 'attack:5';
  return enemy.intents[turn % enemy.intents.length];
}

function onVictory(_lastCard: Card) {
  const run = useRunStore();
  const ui = useUiStore();
  const r = run.data;
  r.combat = undefined;
  // MVR: 보상은 노드 컨텍스트에 따라. 여기선 단순 토스트만.
  ui.toast('success', '전투에서 승리했습니다');
}

function onDefeat() {
  const run = useRunStore();
  const ui = useUiStore();
  run.endRun('hp-zero');
  ui.toast('error', '전투에서 패배했습니다');
}
