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
import { acquireRelic, fireRelicTrigger, fireOnDraw } from './relic';
import { revertTransformationState } from './combat';
import { isNoMapPotion } from './chaos';
// 포션 방어도 block 락 progress 에 반영(QA Medium-1) — 카드/유물과 동일 경로(순환 없는 locks.ts).
import { gainPlayerBlock } from './locks';

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
  'cleanse-group',
]);

/**
 * 정화 물약 그룹 → 제거할 상태키 목록.
 *  - low : 약화·취약(vulnerable/frail)·중독·점액·화상
 *  - mid : 수면·세뇌·각인·유령화·경련
 *  - high: 퇴행·마비 (+ 비용교란 costUp은 핸들러에서 별도 처리)
 *  - all : 위 일반 디버프 전부
 * 구속/삼킴/거미줄(grapple/web)·빙의/혼란(possession/brainwash 잔존)은 *제외*.
 */
const CLEANSE_GROUPS: Record<string, string[]> = {
  low: ['weakness', 'vulnerable', 'frail', 'poison', 'slime', 'burn'],
  mid: ['sleep', 'brainwash', 'imprint', 'ghost', 'spasm'],
  high: ['regress', 'paralyze'],
};
CLEANSE_GROUPS.all = [...CLEANSE_GROUPS.low, ...CLEANSE_GROUPS.mid, ...CLEANSE_GROUPS.high];

/**
 * *클릭해서 사용 가능한* 아이템인가 — 효과가 있는 소비형.
 *
 * 재료(category=material)·특산물(category=specialty)은 *제작 연료*일 뿐 직접 사용 X.
 * effects가 비어 있으면(= 재료) 사용 불가. category 미지정이라도 effects 비면 사용 불가로 본다.
 * 전투 포션(combat-* / heal)·텔레포트·정화 등 효과가 하나라도 있으면 사용 가능.
 *
 * UI(InventoryMenu)는 이 헬퍼로 클릭/사용 버튼을 막고, useItem 자체도 방어적으로 거른다.
 */
export function isUsableItem(item: Item): boolean {
  if (item.category === 'material' || item.category === 'specialty') return false;
  return item.effects.length > 0;
}

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

  // === 재료/특산물 가드 — 효과 없이 *제작 재료로만* 쓰이는 아이템은 사용 불가. ===
  if (!isUsableItem(item)) {
    ui.toast('info', '제작 재료입니다 — 공방에서 사용됩니다.');
    return '';
  }

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
    case 'revive-node': {
      // 이미 소진한 노드 1곳을 되살려 다시 들어갈 수 있게 — 전투/사건/활동/채집 완료 표식 해제.
      const tl = data.timelines.get(r.timelineId);
      const map = tl ? data.nodeMaps.get(tl.nodeMapId) : undefined;
      const targetId = ctx?.selectedNodeId;
      if (!map || !targetId) {
        ui.toast('warning', '되살릴 장소를 고르지 못했다.');
        break;
      }
      const node = map.nodes.find((n) => n.id === targetId);
      const st = r.nodeStates[targetId];
      if (!node || !st) {
        lines.push('되살릴 수 없는 장소다');
        break;
      }
      st.combatCleared = false;
      st.combatStealthed = false;
      st.eventTriggered = undefined;
      st.eventCount = 0;
      st.activityDone = false;
      st.gatherDone = false;
      st.gatherCount = 0;
      lines.push(`'${node.label}'이(가) 다시 깨어났다`);
      break;
    }
    case 'cleanse-transform': {
      // 정화(본명의 거울) — 변신 복귀 + *빙의/세뇌* 정화. 둘 다 아니면 무효.
      let did = false;
      if (revertTransformationState()) { lines.push('변신이 풀려 원래 모습으로 돌아왔다'); did = true; }
      if ((r.possessed ?? 0) > 0 || (c?.player.statuses?.possession ?? 0) > 0) {
        r.possessed = 0;
        if (c) { delete c.player.statuses.possession; delete c.player.statuses.brainwash; }
        lines.push('혼란이 정화되었다');
        did = true;
      }
      if (!did) lines.push('정화할 상태가 없다');
      break;
    }
    case 'gain-life': {
      // 목숨 회복(맵 전용) — 상한(maxLives)까지. 이미 가득이면 효과 없음.
      const n = eff.value ?? 1;
      let gained = 0;
      for (let i = 0; i < n; i++) {
        if (run.gainLife()) gained += 1;
        else break;
      }
      lines.push(gained > 0 ? `목숨 +${gained}` : '목숨이 이미 가득하다');
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
      fireOnDraw(c, drawn.length);
      lines.push(`카드 ${drawn.length}장 드로우`);
      break;
    }
    case 'combat-block': {
      if (!inCombat || !c) break;
      const v = eff.value ?? 0;
      gainPlayerBlock(c, v);
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
      let freed = false;
      if (c.grapple) {
        const wasBind = c.grapple.kind === 'bind';
        c.grapple = undefined;
        if (wasBind) c.lockedCardIds = [];
        lines.push('구속에서 벗어났다');
        freed = true;
      }
      // 정신 속박(빙의/세뇌)도 끊어낸다 — 전투 중 빙의 정화 경로. (잔존도 함께 0.)
      if ((c.player.statuses?.possession ?? 0) > 0 || (c.player.statuses?.brainwash ?? 0) > 0) {
        delete c.player.statuses.possession;
        delete c.player.statuses.brainwash;
        r.possessed = 0;
        lines.push('정신을 옭아매던 것이 끊겼다');
        freed = true;
      }
      if (!freed) lines.push('묶인 상태가 아니다');
      break;
    }
    case 'cleanse-group': {
      if (!inCombat || !c) break;
      const group = String(eff.param ?? 'all');
      const keys = CLEANSE_GROUPS[group] ?? CLEANSE_GROUPS.all;
      let removed = 0;
      for (const key of keys) {
        if ((c.player.statuses?.[key] ?? 0) > 0) {
          delete c.player.statuses[key];
          removed += 1;
        }
      }
      // high/all 그룹은 비용교란(costUp 교란 객체)도 함께 푼다 — 상태키가 아니라 별도 필드.
      if ((group === 'high' || group === 'all') && c.costUp) {
        c.costUp = undefined;
        removed += 1;
      }
      lines.push(removed > 0 ? `디버프 ${removed}종을 씻어냈다` : '씻어낼 디버프가 없다');
      break;
    }
  }

  // instantiateCard는 grant-card에서 직접 안 쓰고 addCardToCollection 내부에서 처리.
  // (인스턴스 ID 일관성을 위해 이미 RunStore가 호출.)
  void instantiateCard;
}
