/**
 * 납품(인정 게이트) 시스템 v1 — 전투/엘리트 노드를 "전투 vs 납품 vs 통과" 선택지로 만든다.
 *
 * 설계:
 *  - 전투 노드 진입 시 곧장 전투가 아니라 GateView가 [전투]/[납품]/[지나치기] 3선택을 띄운다.
 *  - [납품]은 보유한 생활 재료(i-crop- / i-life- 접두, category=material)의 난이도 합이
 *    그 노드의 권역 tier 기반 요구치(threshold) 이상이면 활성. 누르면 난이도 큰 재료부터
 *    그리디로 threshold 충족분까지 소비 → 생활 XP + 대표 element 컬러 부여 + 노드 통과.
 *  - 부족하면 비활성(재료 더 모아 오라는 안내). 어떤 빌드도 막히지 않게 [지나치기]는 항상 가능.
 *
 * 난이도 규칙(team-lead grounding):
 *  - 지연형 산출(농사 grow 엔진 — CROPS): 그 crop의 `growTurns + waterAt.length`. 상품(-fine)은 올림(×1.5).
 *  - 반복형 산출(LIFE_ACTIVITIES type='repeat'): 평작 2 · 상품 3.
 *  → 손이 많이 가는 산출일수록 고난이도.
 *
 * 통과 표시는 *combatCleared 재사용*이라 신규 런 필드가 없다(세이브 영향 0).
 * 재료 소비는 run.data.items에서 직접 제거(전용 removeItem 메서드 없음).
 *
 * 범위 밖(이번 금지 — 후속): 보스 게이트(boss-intro 불변), 납품 약속/마감/실패 패널티,
 * 공방 2차 가공, 미니게임. 이 v1은 *즉시 납품*만.
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { applyColorBoost, type ColorKey } from '@/systems/colors';
import { CROPS } from '@/systems/farming';
import { LIFE_ACTIVITIES } from '@/systems/life-activity';
import type { Element, Item } from '@/data/schemas';

/** 권역 tier를 못 찾을 때 쓰는 기본 요구치. (tier×4 = tier1=4 … tier4=16의 tier2 상당.) */
const DEFAULT_THRESHOLD = 8;
/** tier 1당 요구치 — threshold = tier × 이 값. */
const THRESHOLD_PER_TIER = 4;
/** 반복형 산출 난이도(평작/상품) — 지연형의 grow 비용과 균형 맞춘 고정값. */
const REPEAT_DIFFICULTY_LOWER = 2;
const REPEAT_DIFFICULTY_UPPER = 3;

/**
 * 생활 재료 itemId → 난이도 역인덱스(모듈 1회 빌드).
 *  - CROPS(지연형): lowerItemId=growTurns+waterAt.length / upperItemId=ceil(그 값×1.5).
 *  - LIFE_ACTIVITIES type='repeat': lowerItemId=2 / upperItemId=3.
 * (지연형 활동은 cropId로 CROPS를 가리키므로 CROPS만 돌면 i-life-* 지연형 산출도 모두 포함된다.)
 */
const ITEM_DIFFICULTY: Record<string, number> = buildItemDifficulty();

function buildItemDifficulty(): Record<string, number> {
  const m: Record<string, number> = {};
  // 지연형 — CROPS의 grow 비용. (농사 earth + 숯/사냥/볕말림/버섯 등 지연형 활동 산출 전부.)
  for (const crop of CROPS) {
    const base = crop.growTurns + crop.waterAt.length;
    m[crop.lowerItemId] = base;
    m[crop.upperItemId] = Math.ceil(base * 1.5);
  }
  // 반복형 — 낚시/채광/집전. 고정 2/3.
  for (const act of LIFE_ACTIVITIES) {
    if (act.type !== 'repeat') continue;
    if (act.lowerItemId) m[act.lowerItemId] = REPEAT_DIFFICULTY_LOWER;
    if (act.upperItemId) m[act.upperItemId] = REPEAT_DIFFICULTY_UPPER;
  }
  return m;
}

/** 생활 재료인가 — id가 i-crop-/i-life-로 시작 + category 'material'. */
function isLifeMaterial(item: Item): boolean {
  if (item.category !== 'material') return false;
  return item.id.startsWith('i-crop-') || item.id.startsWith('i-life-');
}

/**
 * 한 생활 재료 아이템의 납품 난이도. 역인덱스에 없으면(=정의되지 않은 생활 재료) 평작 1로 폴백.
 * (i-crop-herb/pepper/vine/lumina처럼 CROPS에 cropId가 없는 산출도 최소 1로 납품 가치를 준다.)
 */
export function itemDifficulty(itemId: string): number {
  return ITEM_DIFFICULTY[itemId] ?? 1;
}

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

/**
 * 노드의 납품 요구치 — 권역 tier × 4(tier1=4 … tier4=16). tier 못 찾으면 기본 8.
 */
export function nodeDeliveryThreshold(nodeId: string): number {
  const tier = nodeRegionTier(nodeId);
  if (tier === undefined || tier <= 0) return DEFAULT_THRESHOLD;
  return tier * THRESHOLD_PER_TIER;
}

/** 노드의 대표 element — 권역 primaryColor, 없으면 보유 재료 중 가장 흔한 element, 그래도 없으면 earth. */
function nodeElement(nodeId: string, materials: Item[]): ColorKey {
  const run = useRunStore();
  const data = useDataStore();
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  const node = map?.nodes.find((n) => n.id === nodeId);
  const region = node?.region ? map?.regions.find((rg) => rg.id === node.region) : undefined;
  if (region?.primaryColor) return region.primaryColor as ColorKey;
  // 폴백 — 소비할 재료 중 가장 많이 등장하는 element.
  const counts = new Map<Element, number>();
  for (const it of materials) {
    if (it.element) counts.set(it.element, (counts.get(it.element) ?? 0) + 1);
  }
  let best: Element | undefined;
  let bestN = 0;
  for (const [el, n] of counts) if (n > bestN) { bestN = n; best = el; }
  return (best ?? 'earth') as ColorKey;
}

/** 보유 중인 생활 재료 인스턴스 목록. */
export function heldDeliveryMaterials(): Item[] {
  return useRunStore().data.items.filter(isLifeMaterial);
}

/** 보유 생활 재료의 난이도 합(납품 가능 자원). */
export function heldDeliveryValue(): number {
  return heldDeliveryMaterials().reduce((sum, it) => sum + itemDifficulty(it.id), 0);
}

/** 그 노드에 지금 납품할 수 있는가 — 보유 난이도 합 ≥ 요구치. */
export function canDeliver(nodeId: string): boolean {
  return heldDeliveryValue() >= nodeDeliveryThreshold(nodeId);
}

/** 납품 결과 — 소비한 재료 id 목록 + 적립 생활 XP + 부여 컬러량 + 컬러 종류. (UI·테스트용 반환.) */
export interface DeliveryResult {
  /** 소비한 재료 인스턴스 id 목록. */
  consumed: string[];
  /** 적립한 생활 XP. */
  lifeXp: number;
  /** 부여한 컬러량. */
  colorGain: number;
  /** 부여한 컬러 종류. */
  color: ColorKey;
  /** 적용한 권역 tier(요구치 산정에 쓰인 값, 기본 2). */
  tier: number;
}

/**
 * 납품 실행 — threshold 이상이면 *난이도 큰 재료부터* 그리디로 충족분까지 소비하고,
 * 생활 XP(1 + tier) + 대표 element 컬러(+tier×2)를 부여한 뒤 노드를 combatCleared로 마킹한다.
 * 부족하면 null(소비/마킹 없음).
 *
 * 그리디 소비: threshold를 *처음으로 도달/초과*할 때까지 큰 것부터 빼므로, 작은 재료를 아껴
 * 둘 수 있다(과소비 방지). 마지막 한 점은 threshold를 넘길 수 있으나 1점 단위라 손실 최소.
 */
export function deliver(nodeId: string): DeliveryResult | null {
  const run = useRunStore();
  const r = run.data;
  const threshold = nodeDeliveryThreshold(nodeId);
  if (heldDeliveryValue() < threshold) return null;

  // 난이도 내림차순으로 정렬한 보유 재료 — 큰 것부터 소비.
  const sorted = heldDeliveryMaterials()
    .map((it) => ({ it, diff: itemDifficulty(it.id) }))
    .sort((a, b) => b.diff - a.diff);

  const toConsume: Item[] = [];
  let acc = 0;
  for (const { it, diff } of sorted) {
    if (acc >= threshold) break;
    toConsume.push(it);
    acc += diff;
  }

  // 실제 제거 — instanceId(없으면 id) 기준으로 run.data.items에서 splice.
  const consumed: string[] = [];
  for (const it of toConsume) {
    const key = it.instanceId ?? it.id;
    const idx = r.items.findIndex((x) => (x.instanceId ?? x.id) === key);
    if (idx >= 0) {
      r.items.splice(idx, 1);
      consumed.push(it.instanceId ?? it.id);
    }
  }

  const tier = nodeRegionTier(nodeId) ?? 2;
  const lifeXp = 1 + tier;
  const colorGain = tier * 2;
  const color = nodeElement(nodeId, toConsume);

  run.addLifeXp(lifeXp);
  applyColorBoost(color, colorGain);

  // 노드 통과 마킹 — combatCleared 재사용(재방문 시 getEnterAction이 'pass'로 자동 통과).
  if (!r.nodeStates[nodeId]) r.nodeStates[nodeId] = { visited: true };
  r.nodeStates[nodeId].visited = true;
  r.nodeStates[nodeId].combatCleared = true;

  return { consumed, lifeXp, colorGain, color, tier };
}
