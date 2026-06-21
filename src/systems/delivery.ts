/**
 * 거래(인정 게이트) 시스템 v2 — 전투/엘리트 노드를 "전투 vs 거래(수주형) vs 통과" 선택지로 만든다.
 *
 * v1(즉시 납품)에서 *수주형 퀘스트*로 재설계:
 *  - 요구가 막연한 "난이도 합"이 아니라 *구체적 품목 + 개수*다. 각 전투 노드의 거래 요구 =
 *    그 노드 권역에 배정된 생활 활동(activityForNode)의 산출물 N개. N = 1 + tier(tier1=2 … tier6=7).
 *    "이 권역이 내놓는 물건"을 원한다(테마적). 상위(-fine) 산출물은 하위 1개를 대체(1개로 카운트).
 *  - [거래한다]는 *항상 활성*. 재료가 없어도 누르면 그 노드에 거래 계약을 등록(tradeContracts)하고
 *    노드는 *미해결*로 둔다(전투 안 함·통과 아님). 안내: "○○ N개를 가져오면 완료. 마을이나 이 자리에서."
 *  - 보유 시 즉시 완료(한 턴 절약): 게이트에서 이미 요구 품목을 충분히 가졌으면 그 자리서 완료.
 *  - 완료처 = 마을(VillageView 계약 목록) + 현장(GateView 그 노드 재방문). 충분하면 소비 + 노드 해결 + 보상.
 *
 * 노드 해결 규칙(핵심): 노드 combatCleared(통과/회색)는 *오직* ①전투 승리 ②거래 완료 두 경우만.
 *  [그냥 지나친다]·[거래 수주]는 노드를 해결하지 않는다(재진입 자유).
 *
 * 보상(거래 완료): addLifeXp(1+tier) + 대표 element 컬러 +tier×2. (v1 deliver 보상 식 유지.)
 *
 * 신규 런 필드 `tradeContracts`(optional, EMPTY_RUN {} backfill) — 세이브 안전.
 *
 * 범위 밖(후속): 보스 게이트(boss-intro 불변), 마감/실패 패널티, 공방 2차 가공, 미니게임.
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { applyColorBoost, type ColorKey } from '@/systems/colors';
import { activityForNode, cropForActivity } from '@/systems/life-activity';
import type { Item, TradeContract } from '@/data/schemas';

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
  // 산출물 — 지연형은 cropForActivity의 crop, 반복형은 활동 정의.
  const crop = cropForActivity(act);
  const itemId = (crop ? crop.lowerItemId : act.lowerItemId) ?? 'i-crop-grain';
  const upperItemId = crop ? crop.upperItemId : act.upperItemId;
  const count = COUNT_PER_TIER_BASE + Math.max(1, tier);
  const element = nodeElement(nodeId, act.element as ColorKey);
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
 * 재료가 없어도 항상 가능. 이미 계약이 있으면 갱신(요구는 tier/활동 기반이라 동일).
 * 반환: 등록한 계약.
 */
export function acceptContract(nodeId: string): TradeContract {
  const run = useRunStore();
  const r = run.data;
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
 * 노드 해결(combatCleared) + 계약 제거. 부족하면 null(소비/해결 없음).
 *
 * 소비 우선순위: 하위 산출물부터 빼고, 모자라면 상위(-fine)로 채운다(상위를 아껴 줌).
 * 보상: addLifeXp(1 + tier) + element 컬러(+tier×2).
 */
export function fulfillContract(nodeId: string): TradeResult | null {
  const run = useRunStore();
  const r = run.data;
  const contract = r.tradeContracts?.[nodeId];
  if (!contract) return null;
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

  // 실제 제거 — instanceId(없으면 id) 기준으로 run.data.items에서 splice.
  const consumed: string[] = [];
  for (const it of pick) {
    const key = it.instanceId ?? it.id;
    const idx = r.items.findIndex((x) => (x.instanceId ?? x.id) === key);
    if (idx >= 0) {
      r.items.splice(idx, 1);
      consumed.push(it.instanceId ?? it.id);
    }
  }

  const tier = req.tier;
  const lifeXp = 1 + tier;
  const colorGain = tier * 2;
  const color = req.element;

  run.addLifeXp(lifeXp);
  applyColorBoost(color, colorGain);

  // 노드 해결 — combatCleared(재방문 시 'pass'로 자동 통과) + 계약 제거.
  if (!r.nodeStates[nodeId]) r.nodeStates[nodeId] = { visited: true };
  r.nodeStates[nodeId].visited = true;
  r.nodeStates[nodeId].combatCleared = true;
  delete r.tradeContracts![nodeId];

  return { consumed, lifeXp, colorGain, color, tier };
}

/**
 * 표시용 — 요구 품목의 한글 이름(data.items의 name). 못 찾으면 itemId.
 */
export function tradeItemName(itemId: string): string {
  return useDataStore().items.get(itemId)?.name ?? itemId;
}
