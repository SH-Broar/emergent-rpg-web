/**
 * 지역 납품 의뢰. 일반 의뢰는 생활 산출물, 엘리트 의뢰는 공방 가공품을 요구한다.
 * 필드에서는 살아 있는 마을 창구 옆에서 같은 권역 의뢰를 받고, 받은 의뢰는 어느 마을에서나 완료한다.
 * 물품은 공통 라우터로 창구 재고에 이전한다. 완수는 tradeCleared만 기록하며 실제 마물 격파와 별개다.
 * 기존 게이트 화면은 비필드 런에서만 유지한다. 수주 시 품목·개수·보상을 고정하여 저장한다.
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { applyColorBoost, type ColorKey } from '@/systems/colors';
import { activityForNode, cropForActivity } from '@/systems/life-activity';
import { craftItemIdForElement } from '@/systems/workshop';
import { effectiveKind } from '@/systems/map';
import { reportRegionDelivery } from '@/systems/region-world';
import type { Item, TradeContract } from '@/data/schemas';
import { actionRestriction } from './world/status';
import { distance, hasSight } from './world/spatial';
import { resolveInteraction } from './world/engine';
import { processSocialFacts } from './world/social';
import { syncPlayerFromWorld, syncPlayerToWorld } from './world-interaction';

function deliveryMap() {
  const run = useRunStore().data, data = useDataStore();
  return data.nodeMaps.get(data.timelines.get(run.timelineId)?.nodeMapId ?? '');
}
function fieldDeliveryBoard() {
  const run = useRunStore().data, world = run.interactionWorld, player = world?.entities.player;
  if (!run.field || !world || !player?.pos || player.nodeId !== run.currentNodeId) return;
  const node = deliveryMap()?.nodes.find(n => n.id === run.currentNodeId);
  if (node?.kind !== 'village') return;
  return Object.values(world.entities).find(e => e.nodeId === player.nodeId && e.pos &&
    e.tags.includes('service:village') && (e.properties.integrity ?? 100) > 0 &&
    distance(e.pos, player.pos!) <= 1 && hasSight(world, player, e));
}
/** Field contracts are offered and handed over at an actual village counter. */
export function deliveryFailure(nodeId: string, accepting = false): string | undefined {
  const run = useRunStore().data, map = deliveryMap(), node = map?.nodes.find(n => n.id === nodeId);
  if (!node || !['combat','elite'].includes(effectiveKind(node, run))) return '납품처를 찾을 수 없다.';
  if (run.nodeStates[nodeId]?.tradeCleared) return '이미 납품했다.';
  if (run.ended || run.hp <= 0) return '지금은 거래할 수 없다.';
  if (!run.field) return;
  const world = run.interactionWorld, player = world?.entities.player;
  if (!world || !player || actionRestriction(player) || run.field.encounter || run.field.skills?.pending ||
    Object.values(world.entities).some(e => e.nodeId === player.nodeId && e.creature && (e.properties.integrity ?? 100) > 0 && hasSight(world,player,e))) return '위험이 지나간 뒤 거래할 수 있다.';
  if (!fieldDeliveryBoard()) return '마을 창구 가까이에서 거래할 수 있다.';
  if (accepting && node.region !== map?.nodes.find(n => n.id === run.currentNodeId)?.region) return '이 지역의 의뢰만 받을 수 있다.';
}

export function availableDeliveryContracts() {
  const run = useRunStore().data, map = deliveryMap(), here = map?.nodes.find(n => n.id === run.currentNodeId);
  if (here?.kind !== 'village') return [];
  return (map?.nodes ?? []).filter(n => n.region === here.region && ['combat','elite'].includes(effectiveKind(n,run)) &&
    !run.nodeStates[n.id]?.tradeCleared && !run.tradeContracts?.[n.id]).map(node => ({node,req:tradeRequirement(node.id)}));
}

/** tier를 못 찾을 때 쓰는 기본 tier(요구 개수 산정·보상에 쓰임). */
const DEFAULT_TIER = 2;
/** 요구 개수 = 1 + tier (tier1=2 … tier6=7). */
const COUNT_PER_TIER_BASE = 1;

/** 권역 tier 조회 헬퍼 — 현재 노드 맵에서 노드→권역→tier. 못 찾으면 undefined. */
function nodeRegionTier(nodeId: string): number | undefined {
  const run = useRunStore();
  const data = useDataStore();
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  const node = map?.nodes.find((n) => n.id === nodeId);
  if (!node?.region) return undefined;
  const region = map?.regions.find((rg) => rg.id === node.region);
  return region?.tier;
}

/** 노드의 권역 id(없으면 undefined). */
function nodeRegionId(nodeId: string): string | undefined {
  const run = useRunStore();
  const data = useDataStore();
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n) => n.id === nodeId)?.region;
}

/** 이 노드가 엘리트(런타임 격상 포함)인가 — 엘리트 의뢰는 2차 가공품을 요구한다(item 9). */
function isEliteNode(nodeId: string): boolean {
  const run = useRunStore();
  const data = useDataStore();
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  const node = map?.nodes.find((n) => n.id === nodeId);
  return node ? effectiveKind(node, run.data) === 'elite' : false;
}

/** 노드의 대표 element — 권역 primaryColor, 없으면 그 노드 배정 활동의 element, 그래도 없으면 earth. */
function nodeElement(nodeId: string, activityElement: ColorKey): ColorKey {
  const run = useRunStore();
  const data = useDataStore();
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  const node = map?.nodes.find((n) => n.id === nodeId);
  const region = node?.region ? map?.regions.find((rg) => rg.id === node.region) : undefined;
  if (region?.primaryColor) return region.primaryColor as ColorKey;
  return activityElement ?? ('earth' as ColorKey);
}

/**
 * 노드의 거래 요구 — 그 노드 권역 배정 활동의 *하위 산출물*과 그 *상위 산출물*, 요구 개수, element, tier.
 *  - lowerItemId : 요구 품목(하위 산출물). delayed=crop.lowerItemId / repeat=act.lowerItemId.
 *  - upperItemId : 상위(-fine) 산출물 — 요구 충족에 하위 1개를 대체(1개로 카운트). 없으면 undefined.
 *  - count       : 1 + tier(tier1=2 … tier6=7). tier 못 찾으면 DEFAULT_TIER 기준.
 *  - element     : 보상 컬러(권역 primaryColor 폴백 활동 element).
 *  - tier        : 보상 산정용(요구 개수·XP·컬러).
 */
export interface TradeRequirement {
  itemId: string;
  upperItemId?: string;
  count: number;
  element: ColorKey;
  tier: number;
}

export function tradeRequirement(nodeId: string): TradeRequirement {
  const tier = nodeRegionTier(nodeId) ?? DEFAULT_TIER;
  const region = nodeRegionId(nodeId);
  const act = activityForNode(nodeId, region);
  const element = nodeElement(nodeId, act.element as ColorKey);

  // 엘리트 의뢰(item 9) — 그 활동 속성의 *2차 가공품*을 요구한다(공방 가공을 거쳐야 모인다).
  //   가공품은 비싸므로 개수는 일반보다 적게(1 + ceil(tier/2)). 상위 대체 없음.
  if (isEliteNode(nodeId)) {
    const craftId = craftItemIdForElement(act.element);
    const count = 1 + Math.ceil(Math.max(1, tier) / 2);
    return { itemId: craftId, upperItemId: undefined, count, element, tier };
  }

  // 일반 의뢰 — 그 노드 권역 배정 활동의 티어1 산출물(하위, 상위는 대체).
  const crop = cropForActivity(act);
  const itemId = (crop ? crop.lowerItemId : act.lowerItemId) ?? 'i-crop-grain';
  const upperItemId = crop ? crop.upperItemId : act.upperItemId;
  const count = COUNT_PER_TIER_BASE + Math.max(1, tier);
  return { itemId, upperItemId, count, element, tier };
}

/** 보유 중인 특정 산출물(하위/상위) 인스턴스 목록 — id 일치(인스턴스 무관). */
function heldByItemId(itemId: string): Item[] {
  return useRunStore().data.items.filter((it) => it.id === itemId);
}

/**
 * 요구 충족에 쓸 수 있는 보유 수량 — 하위 + 상위(-fine, 1개=요구 1개로 대체) 합.
 * (상위 산출물도 요구를 채우는 데 1개로 카운트한다.)
 */
export function heldTradeCount(req: TradeRequirement): number {
  const lower = heldByItemId(req.itemId).length;
  const upper = req.upperItemId ? heldByItemId(req.upperItemId).length : 0;
  return lower + upper;
}

/** 그 요구를 지금 충족할 수 있는가 — 보유(하위+상위) ≥ 요구 개수. */
export function canFulfill(req: TradeRequirement): boolean {
  return heldTradeCount(req) >= req.count;
}

/** 노드에 활성 거래 계약이 있는가. */
export function hasContract(nodeId: string): boolean {
  return !!useRunStore().data.tradeContracts?.[nodeId];
}

/** 노드의 활성 거래 계약(없으면 undefined). */
export function getContract(nodeId: string): TradeContract | undefined {
  return useRunStore().data.tradeContracts?.[nodeId];
}

/**
 * 거래 수주 — 그 노드에 계약을 등록한다(노드는 미해결로 둔다 — 전투 안 함·통과 아님).
 * 재료는 수주 시 없어도 된다. 이미 받은 계약은 당시 조건을 유지한다.
 * 반환: 등록한 계약.
 */
export function acceptContract(nodeId: string): TradeContract | undefined {
  const run = useRunStore();
  const r = run.data;
  if (deliveryFailure(nodeId, true)) return;
  if (r.tradeContracts?.[nodeId]) return r.tradeContracts[nodeId];
  const req = tradeRequirement(nodeId);
  if (!r.tradeContracts) r.tradeContracts = {};
  const contract: TradeContract = {
    itemId: req.itemId,
    upperItemId: req.upperItemId,
    count: req.count,
    element: req.element,
    tier: req.tier,
  };
  r.tradeContracts[nodeId] = contract;
  return contract;
}

/** 거래 완료 결과 — 소비 품목 id 목록 + 적립 생활 XP + 부여 컬러량 + 컬러 종류 + tier. (UI·테스트용.) */
export interface TradeResult {
  /** 소비한 품목 인스턴스 id 목록. */
  consumed: string[];
  lifeXp: number;
  colorGain: number;
  color: ColorKey;
  tier: number;
  /** 엘리트 거래 추가 보상 — 골드/시간의 조각(일반 거래는 0). */
  gold: number;
  shards: number;
  /** 엘리트(2차 가공품) 거래였는가 — UI 표기용. */
  elite: boolean;
}

/**
 * 계약 요구로부터 TradeRequirement 형태 복원 — 완료 판정/소비는 *계약에 박힌 요구*를 쓴다
 * (수주 시점에 확정한 품목·개수가 권위. 활동 매핑이 바뀌어도 계약은 그대로 이행).
 */
function reqFromContract(c: TradeContract): TradeRequirement {
  return {
    itemId: c.itemId,
    upperItemId: c.upperItemId,
    count: c.count,
    element: c.element as ColorKey,
    tier: c.tier,
  };
}

/**
 * 거래 완료 실행 — 요구 품목을 충분히 보유하면 *하위부터* 소비(상위는 모자랄 때만), 보상 부여,
 * 거래 소비(tradeCleared) + 계약 제거. 부족하면 null(소비/해결 없음).
 *
 * 소비 우선순위: 하위 산출물부터 빼고, 모자라면 상위(-fine)로 채운다(상위를 아껴 줌).
 * 보상: addLifeXp(1 + tier) + element 컬러(+tier×2).
 */
export function fulfillContract(nodeId: string): TradeResult | null {
  const run = useRunStore();
  const r = run.data;
  const contract = r.tradeContracts?.[nodeId];
  if (!contract || deliveryFailure(nodeId)) return null;
  const req = reqFromContract(contract);
  if (heldTradeCount(req) < req.count) return null;

  // 소비할 인스턴스 — 하위 우선, 모자라면 상위.
  const lowerHeld = heldByItemId(req.itemId);
  const upperHeld = req.upperItemId ? heldByItemId(req.upperItemId) : [];
  const pick: Item[] = [];
  for (const it of lowerHeld) {
    if (pick.length >= req.count) break;
    pick.push(it);
  }
  for (const it of upperHeld) {
    if (pick.length >= req.count) break;
    pick.push(it);
  }

  const consumed = pick.map(it => it.instanceId ?? it.id);
  if (r.field) {
    const world = r.interactionWorld!, counter = fieldDeliveryBoard()!;
    // Item identities and world stock are synchronized before the atomic transfer.
    syncPlayerToWorld(r, world);
    const quantities: Record<string,number> = {};
    for (const item of pick) quantities[item.id] = (quantities[item.id] ?? 0) + 1;
    const result = resolveInteraction(world, 'player', counter.id, {
      id:'delivery:' + nodeId,label:'납품',description:'',duration:0,reach:1,
      effects:Object.entries(quantities).map(([resourceId,quantity]) => ({kind:'transfer',resourceId,quantity,from:'actor',to:'target'})),
    });
    if (!result.ok) return null;
    syncPlayerFromWorld(r, world);
    processSocialFacts(world);
  } else for (const it of pick) {
    const key = it.instanceId ?? it.id;
    const idx = r.items.findIndex(x => (x.instanceId ?? x.id) === key);
    if (idx >= 0) r.items.splice(idx, 1);
  }

  // 엘리트 거래(2차 가공품)는 투자가 큰 만큼 보상도 크다 — XP·컬러 2배 + 골드·조각.
  const elite = req.itemId.startsWith('i-craft-');
  const tier = req.tier;
  const lifeXp = (1 + tier) * (elite ? 2 : 1);
  const colorGain = tier * 2 * (elite ? 2 : 1);
  const color = req.element;
  const gold = elite ? 20 + tier * 10 : 0;
  const shards = elite ? 3 + tier : 0;

  run.addLifeXp(lifeXp);
  applyColorBoost(color, colorGain);
  if (gold > 0) r.gold += gold;
  if (shards > 0) r.timeShards += shards;

  // 거래(납품) 소비 — tradeCleared만 세팅(전투 승리 combatCleared와 독립). 둘 다 소비돼야
  //   노드가 '정리됨'(isNodeSettled)이 되어 자동 통과한다. 계약은 완료했으니 제거.
  if (!r.nodeStates[nodeId]) r.nodeStates[nodeId] = { visited: true };
  r.nodeStates[nodeId].visited = true;
  r.nodeStates[nodeId].tradeCleared = true;
  delete r.tradeContracts![nodeId];
  if (r.field) syncPlayerToWorld(r, r.interactionWorld!);
  else reportRegionDelivery(r, nodeId, req.count, pick.map(item => item.id));

  return { consumed, lifeXp, colorGain, color, tier, gold, shards, elite };
}

/**
 * 표시용 — 요구 품목의 한글 이름(data.items의 name). 못 찾으면 itemId.
 */
export function tradeItemName(itemId: string): string {
  return useDataStore().items.get(itemId)?.name ?? itemId;
}
