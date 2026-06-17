/**
 * 전투 포션(아이템) *격자 전투 사용* 계층 (신규).
 *
 * 구 systems/item.ts의 useItem은 1v1 CombatState(c.enemy 단일 타깃·c.player)에 작용하므로
 * 격자(GridCombatState: player + enemies[])에 그대로 못 맞는다. 전투 포션 효과만 격자에 다시 적는다.
 *
 * 지원 효과(item.ts COMBAT_EFFECT_KINDS 미러):
 *  - heal               → player.hp (격자 전투 hp, 종료 시 run.hp로 라이트백)
 *  - combat-block       → player.block (gainBlock 주입 — juggernaut 경유)
 *  - combat-mana        → mana
 *  - combat-draw        → drawIntoHand 주입(on-draw 유물 포함)
 *  - combat-enemy-status→ 가장 가까운 살아 있는 적에 상태 부여
 *  - combat-self-status → player에 상태 부여
 *  - combat-free-grapple→ 격자엔 구속 개념 미이식 → 안전 무시
 *  - cleanse-group      → player.statuses에서 해당 그룹 디버프 제거
 * 맵 전용 효과(gold/teleport/grant-* 등)는 격자에서 무시(전투 중 사용 불가).
 *
 * 소비·턴당 1회 가드는 grid-combat.ts(useItemInGrid 호출 측)가 처리.
 */

import type { GridCombatState, GridCombatant, Item, ItemEffect } from '@/data/schemas';

/** 정화 그룹 → 제거할 상태키 (item.ts CLEANSE_GROUPS 미러). */
const CLEANSE_GROUPS: Record<string, string[]> = {
  low: ['weakness', 'vulnerable', 'frail', 'poison', 'slime', 'burn'],
  mid: ['sleep', 'brainwash', 'imprint', 'ghost', 'spasm'],
  high: ['regress', 'paralyze'],
};
CLEANSE_GROUPS.all = [...CLEANSE_GROUPS.low, ...CLEANSE_GROUPS.mid, ...CLEANSE_GROUPS.high];

/** grid-combat.ts가 주입하는 격자 헬퍼(순환 회피). */
export interface GridItemHooks {
  gainBlock: (state: GridCombatState, v: number) => void;
  drawCards: (state: GridCombatState, n: number) => void;
  nearest: (state: GridCombatState) => GridCombatant | undefined;
}

let HOOKS: GridItemHooks | undefined;
export function registerGridItemHooks(h: GridItemHooks): void {
  HOOKS = h;
}

/**
 * 전투 포션 1점을 격자 state에 적용. 반환: 적용 결과 한 줄들(로그용). 적용된 효과가 없으면 빈 배열.
 * 소비·턴 가드는 호출 측이 처리한다(이 함수는 효과 적용만).
 */
export function useItemInGrid(state: GridCombatState, item: Item): string[] {
  const lines: string[] = [];
  const h = HOOKS;
  for (const eff of item.effects) applyOne(state, eff, lines, h);
  return lines;
}

function applyOne(
  state: GridCombatState,
  eff: ItemEffect,
  lines: string[],
  h: GridItemHooks | undefined,
): void {
  const p = state.player;
  switch (eff.kind) {
    case 'heal': {
      const v = eff.value ?? 0;
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + v);
      if (p.hp - before > 0) lines.push(`HP +${p.hp - before}`);
      break;
    }
    case 'combat-block': {
      const v = eff.value ?? 0;
      if (v > 0) {
        if (h) h.gainBlock(state, v);
        else p.block += v;
        lines.push(`방어 +${v}`);
      }
      break;
    }
    case 'combat-mana': {
      const v = eff.value ?? 0;
      state.mana += v;
      lines.push(`마나 +${v}`);
      break;
    }
    case 'combat-draw': {
      const n = eff.value ?? 1;
      if (h) h.drawCards(state, n);
      lines.push(`카드 ${n}장 드로우`);
      break;
    }
    case 'combat-enemy-status': {
      const status = (eff.param as string) ?? 'vulnerable';
      const v = eff.value ?? 1;
      const tgt = h ? h.nearest(state) : state.enemies.find((e) => e.hp > 0);
      if (tgt) {
        tgt.statuses[status] = (tgt.statuses[status] ?? 0) + v;
        lines.push(`적에게 ${status} +${v}`);
      }
      break;
    }
    case 'combat-self-status': {
      const status = (eff.param as string) ?? 'strength';
      const v = eff.value ?? 1;
      p.statuses[status] = (p.statuses[status] ?? 0) + v;
      lines.push(`${status} +${v}`);
      break;
    }
    case 'cleanse-group': {
      const group = String(eff.param ?? 'all');
      const keys = CLEANSE_GROUPS[group] ?? CLEANSE_GROUPS.all;
      let removed = 0;
      for (const key of keys) {
        if ((p.statuses?.[key] ?? 0) > 0) { delete p.statuses[key]; removed += 1; }
      }
      lines.push(removed > 0 ? `디버프 ${removed}종을 씻어냈다` : '씻어낼 디버프가 없다');
      break;
    }
    case 'combat-free-grapple':
      // 격자엔 구속(grapple) 개념 미이식 — 안전 무시.
      break;
    default:
      // 맵 전용 효과(gold/teleport/grant-* 등)는 격자 전투에서 무시.
      break;
  }
}
