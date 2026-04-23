// recipe-defs.ts — 요리 레시피 정의 레지스트리
//
// recipes.txt 포맷:
//   [recipe_id]
//   name = 허브 샐러드
//   description = 신선한 허브로 만든 샐러드.
//   ingredients = /herb/:2                       # 단일 태그 + 수량
//                 또는 /herb/ & !/raw/:2         # 불리언 표현식 + 수량
//                 또는 /herb/:2, /fruit/:1       # 다중 재료 (상위 콤마로 구분)
//   tiers = wilted_herb_salad:0.0, basic_herb_salad:0.2, herb_salad:0.4, fresh_herb_salad:0.6, master_herb_salad:0.8
//   buffDuration = 120

import type { DataSection } from './parser';

export interface RecipeIngredient {
  /** 태그 표현식 — tag-system.evaluateTagExpr 로 평가. 빈 문자열이면 모든 아이템 매칭. */
  expr: string;
  amount: number;
}

export interface RecipeTier {
  itemId: string;
  /** 재료 가중평균 희귀도 점수 임계값 (0.0~1.0) */
  minScore: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  description: string;
  ingredients: RecipeIngredient[];
  tiers: RecipeTier[];
  /** 요리 완성 시 적용되는 기본 버프 지속 시간(분). 0이면 티어 아이템의 eatBuffDuration 사용. */
  buffDuration: number;
}

// 희귀도 → 점수 맵 (0.0 ~ 1.0)
export const RARITY_SCORES: Record<string, number> = {
  common: 0.0,
  uncommon: 0.2,
  rare: 0.4,
  epic: 0.6,
  legendary: 0.8,
  unique: 1.0,
};

export function rarityScore(rarity: string): number {
  return RARITY_SCORES[rarity] ?? 0;
}

// ============================================================
// 파서 헬퍼
// ============================================================

/**
 * 재료 엔트리 파싱: "<tag 표현식>:<수량>"
 * 수량은 마지막 콜론 뒤의 숫자만 허용. 태그 표현식 내부의 콜론은 없음.
 */
function parseIngredientEntry(raw: string): RecipeIngredient | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 마지막 `:<숫자>` 패턴 분리
  const m = trimmed.match(/^(.+?)\s*:\s*(\d+)\s*$/);
  if (!m) return null;
  const expr = m[1].trim();
  const amount = parseInt(m[2], 10);
  if (!expr || !Number.isFinite(amount) || amount <= 0) return null;
  return { expr, amount };
}

/**
 * ingredients 라인 파싱: 상위 콤마 구분자.
 * 태그 표현식 내부엔 콤마가 없다고 전제. (tag-system 문법: & |)
 */
export function parseIngredients(raw: string): RecipeIngredient[] {
  if (!raw.trim()) return [];
  const result: RecipeIngredient[] = [];
  for (const token of raw.split(',')) {
    const entry = parseIngredientEntry(token);
    if (entry) result.push(entry);
  }
  return result;
}

/**
 * tiers 라인 파싱: "itemId:minScore, itemId:minScore"
 * minScore 오름차순 정렬.
 */
export function parseTiers(raw: string): RecipeTier[] {
  if (!raw.trim()) return [];
  const tiers: RecipeTier[] = [];
  for (const token of raw.split(',')) {
    const t = token.trim();
    if (!t) continue;
    const colon = t.lastIndexOf(':');
    if (colon === -1) continue;
    const itemId = t.slice(0, colon).trim();
    const score = parseFloat(t.slice(colon + 1));
    if (!itemId || Number.isNaN(score)) continue;
    tiers.push({ itemId, minScore: score });
  }
  return tiers.sort((a, b) => a.minScore - b.minScore);
}

/**
 * 주어진 점수에 대해 적용되는 티어 반환.
 * 점수 이하 minScore 중 가장 큰 값을 가진 티어 선택.
 * 모든 티어의 minScore > score 이면 가장 낮은 티어 반환.
 */
export function selectTier(tiers: RecipeTier[], score: number): RecipeTier | null {
  if (tiers.length === 0) return null;
  let selected: RecipeTier = tiers[0];
  for (const tier of tiers) {
    if (tier.minScore <= score) selected = tier;
    else break;
  }
  return selected;
}

// ============================================================
// 레지스트리
// ============================================================

const recipeRegistry = new Map<string, RecipeDef>();

export function loadRecipeDefs(sections: DataSection[]): void {
  recipeRegistry.clear();
  for (const s of sections) {
    if (s.name.startsWith('#') || s.name === 'Meta') continue;
    const ingredients = parseIngredients(s.get('ingredients', ''));
    const tiers = parseTiers(s.get('tiers', ''));
    if (ingredients.length === 0 || tiers.length === 0) continue; // 불완전한 섹션 스킵
    const def: RecipeDef = {
      id: s.name,
      name: s.get('name', s.name),
      description: s.get('description', ''),
      ingredients,
      tiers,
      buffDuration: s.getInt('buffDuration', 0),
    };
    recipeRegistry.set(def.id, def);
  }
}

export function getRecipeDef(id: string): RecipeDef | undefined {
  return recipeRegistry.get(id);
}

export function getAllRecipeDefs(): readonly RecipeDef[] {
  return [...recipeRegistry.values()];
}

export function getRecipeCount(): number {
  return recipeRegistry.size;
}
