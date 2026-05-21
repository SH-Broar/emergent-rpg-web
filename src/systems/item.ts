/**
 * 아이템 사용 시스템.
 *
 * useItem(itemInstance) — 효과를 RunState에 적용 + 소비 시 인벤토리에서 제거.
 *
 * teleport-village는 *옵션 콜백*으로 사용자 노드 선택을 받는다 (UI가 주입).
 * 콜백 없으면 첫 번째 village 노드로 자동 이동.
 *
 * === Item Economy: 전투/맵 분리 ===
 *  - 전투 중(run.data.combat set): combat=true 포션만 사용 가능. *턴당 1회*.
 *    전투 효과(combat-*)는 combat 상태에 직접 작용. heal은 combat.player.hp + r.hp 양쪽.
 *  - 맵 전용 효과(teleport-village/gold/time-shards/grant-* 등)는 전투 중 사용 불가.
 *  - 전투 밖: combat-* 효과는 무효(no-op), 기존 맵 효과는 그대로.
 */

import type { Item, ItemEffect, NodeId, ColorValues } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { instantiateCard, drawCards } from './deck';
import { acquireRelic, fireRelicTrigger } from './relic';
import { revertTransformationState } from './combat';
import { isNoMapPotion } from './chaos';

export interface UseItemContext {
  /** teleport-village 등 *대상 노드*가 필요한 효과에서 사용자가 노드 ID를 선택. */
  selectedNodeId?: NodeId;
}

/** 전투 중 사용 가능한 전투 포션 효과 종류. */
const COMBAT_EFFECT_KINDS = new Set<ItemEffect['kind']>([
  'heal',
  'combat-mana',
  'combat-draw',
  'combat-block',
  'combat-enemy-status',
  'combat-self-status',
  'combat-free-grapple',
]);

/**
 * 아이템 한 점 사용. 효과를 적용하고 consumable이면 인벤토리에서 제거.
 * 결과 문구 반환 (toast에 노출). 사용 거부 시 빈 문자열.
 */
export function useItem(item: Item, ctx?: UseItemContext): string {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const r = run.data;
  const inCombat = !!r.combat;

  // === 전투 중 사용 가드 ===
  if (inCombat) {
    if (!item.combat) {
      ui.toast('warning', '전투 중에는 전투용 포션만 쓸 수 있다.');
      return '';
    }
    if (r.combat?.potionUsedThisTurn) {
      ui.toast('warning', '이번 턴엔 이미 포션을 썼다.');
      return '';
    }
  } else {
    // 카오스 no-map-potion(봉인된 약병) — 맵(비전투)에서 포션 사용 전면 차단.
    if (isNoMapPotion()) {
      ui.toast('warning', '봉인된 약병 — 전투 밖에선 쓸 수 없다.');
      return '';
    }
    // 전투 밖에서 *전투 전용* 포션은 의미가 없다 — 막아서 낭비 방지.
    const onlyCombat =
      item.effects.length > 0 &&
      item.effects.every((e) => e.kind !== 'heal' && COMBAT_EFFECT_KINDS.has(e.kind));
    if (onlyCombat) {
      ui.toast('warning', '전투 중에만 쓸 수 있는 포션이다.');
      return '';
    }
  }

  const lines: string[] = [];
  for (const eff of item.effects) {
    applyItemEffect(eff, ctx, lines, inCombat);
  }

  // 전투 포션이면 턴당 1회 가드 마킹.
  if (inCombat && item.combat && r.combat) {
    r.combat.potionUsedThisTurn = true;
  }

  // 소모 — 인스턴스 ID로 정확히 한 점만 제거.
  if (item.consumable && item.instanceId) {
    const idx = run.data.items.findIndex((i) => i.instanceId === item.instanceId);
    if (idx >= 0) run.data.items.splice(idx, 1);
  }

  // 아이템 사용 시 유물 발동 (on-item-use).
  fireRelicTrigger('on-item-use', { run: run.data });

  const msg = `'${item.name}' 사용 — ${lines.join(' / ')}`;
  ui.toast('success', msg);
  void data; // (data store는 helper에서 사용 가능)
  return msg;
}

function applyItemEffect(
  eff: ItemEffect,
  ctx: UseItemContext | undefined,
  lines: string[],
  inCombat: boolean,
): void {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const r = run.data;
  const c = r.combat;

  switch (eff.kind) {
    case 'heal': {
      const v = eff.value ?? 0;
      // 전투 중이면 combat.player.hp만 올린다 — 전투 종료 시 clearCombat이 r.hp로 라이트백(영구화).
      if (inCombat && c) {
        const beforeC = c.player.hp;
        c.player.hp = Math.min(c.player.maxHp, c.player.hp + v);
        lines.push(`HP +${c.player.hp - beforeC}`);
      } else {
        const before = r.hp;
        r.hp = Math.min(r.maxHp, r.hp + v);
        lines.push(`HP +${r.hp - before}`);
      }
      break;
    }
    case 'gold': {
      const v = eff.value ?? 0;
      r.gold = Math.max(0, r.gold + v);
      lines.push(`골드 +${v}`);
      break;
    }
    case 'time-shards': {
      const v = eff.value ?? 0;
      r.timeShards = Math.max(0, r.timeShards + v);
      lines.push(`시간의 조각 +${v}`);
      break;
    }
    case 'color-boost': {
      const key = eff.param as keyof ColorValues | undefined;
      const v = eff.value ?? 0;
      if (key && key in r.colors) {
        r.colors[key] = Math.max(0, (r.colors[key] ?? 0) + v);
        lines.push(`${key} +${v}`);
      }
      break;
    }
    case 'color-all': {
      const v = eff.value ?? 0;
      for (const k of Object.keys(r.colors) as (keyof ColorValues)[]) {
        r.colors[k] = Math.max(0, (r.colors[k] ?? 0) + v);
      }
      lines.push(`8 컬러 모두 +${v}`);
      break;
    }
    case 'grant-card': {
      const cid = eff.param;
      if (!cid) break;
      const card = data.cards.get(cid);
      if (card) {
        run.addCardToCollection(card);
        lines.push(`카드 '${card.name}' 획득`);
      }
      break;
    }
    case 'grant-relic': {
      const rid = eff.param;
      if (!rid) break;
      const relic = data.relics.get(rid);
      if (relic) {
        acquireRelic(relic); // 중앙 진입점 — on-acquire/passive 즉시 발동 포함.
        lines.push(`유물 '${relic.name}' 획득`);
      }
      break;
    }
    case 'teleport-village': {
      // 사용자 선택이 있으면 그쪽, 없으면 임의의 village 노드.
      const tl = data.timelines.get(r.timelineId);
      const map = tl ? data.nodeMaps.get(tl.nodeMapId) : undefined;
      if (!map) {
        ui.toast('error', '맵을 찾을 수 없습니다.');
        break;
      }
      const villages = map.nodes.filter((n) => n.kind === 'village' && n.id !== r.currentNodeId);
      const target = ctx?.selectedNodeId
        ? map.nodes.find((n) => n.id === ctx.selectedNodeId)
        : villages[0];
      if (!target) {
        ui.toast('warning', '이동할 마을이 없습니다.');
        break;
      }
      r.currentNodeId = target.id;
      // 텔레포트는 *턴 소모 없이* — visitNode 호출하지 않음. 이미 visited면 그대로.
      if (!r.nodeStates[target.id]) r.nodeStates[target.id] = { visited: true };
      else r.nodeStates[target.id].visited = true;
      lines.push(`'${target.label}'(으)로 이동`);
      break;
    }
    case 'cleanse-transform': {
      // 변신(체인지) 정화 — 원래 종족·덱으로 복귀. 변신 중이 아니면 무효.
      if (revertTransformationState()) lines.push('변신이 풀려 원래 모습으로 돌아왔다');
      else lines.push('변신 상태가 아니다');
      break;
    }
    // ===== 전투 포션 전용 — 전투 중에만 의미. =====
    case 'combat-mana': {
      if (!inCombat || !c) break;
      const v = eff.value ?? 0;
      c.mana += v;
      lines.push(`마나 +${v}`);
      break;
    }
    case 'combat-draw': {
      if (!inCombat || !c) break;
      const n = eff.value ?? 1;
      const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, n);
      c.hand = [...c.hand, ...drawn];
      c.drawPile = newDrawPile;
      c.discardPile = newDiscardPile;
      lines.push(`카드 ${drawn.length}장 드로우`);
      break;
    }
    case 'combat-block': {
      if (!inCombat || !c) break;
      const v = eff.value ?? 0;
      c.player.block += v;
      lines.push(`방어 +${v}`);
      break;
    }
    case 'combat-enemy-status': {
      if (!inCombat || !c) break;
      const status = (eff.param as string) ?? 'vulnerable';
      const v = eff.value ?? 1;
      c.enemy.statuses[status] = (c.enemy.statuses[status] ?? 0) + v;
      lines.push(`적에게 ${status} +${v}`);
      break;
    }
    case 'combat-self-status': {
      if (!inCombat || !c) break;
      const status = (eff.param as string) ?? 'strength';
      const v = eff.value ?? 1;
      c.player.statuses[status] = (c.player.statuses[status] ?? 0) + v;
      lines.push(`${status} +${v}`);
      break;
    }
    case 'combat-free-grapple': {
      if (!inCombat || !c) break;
      if (c.grapple) {
        const wasBind = c.grapple.kind === 'bind';
        c.grapple = undefined;
        if (wasBind) c.lockedCardIds = [];
        lines.push('구속에서 벗어났다');
      } else {
        lines.push('묶인 상태가 아니다');
      }
      break;
    }
  }

  // instantiateCard는 grant-card에서 직접 안 쓰고 addCardToCollection 내부에서 처리.
  // (인스턴스 ID 일관성을 위해 이미 RunStore가 호출.)
  void instantiateCard;
}
