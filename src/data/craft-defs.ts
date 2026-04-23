// craft-defs.ts — 제작 레시피 정의 레지스트리
//
// public/data/craft_recipes.txt 의 INI 데이터를 파싱해서 보관한다.
// crafting.ts (제작 로직)와 craft.ts (UI 화면) 양쪽에서 동일한 레지스트리를 공유한다.

import type { DataSection } from './parser';

export interface CraftInputDef {
  /** ItemType 카테고리 키(Food/Herb/...) 또는 개별 itemId */
  item: string;
  amount: number;
}

export interface CraftOutputDef {
  /** ItemType 카테고리 키 또는 개별 itemId */
  item: string;
  amount: number;
}

export interface CraftRecipeDef {
  id: string;
  name: string;
  description: string;
  inputs: CraftInputDef[];
  output: CraftOutputDef;
  vigorCost: number;
  /** 제작 가능 장소 (LocationID). 빈 문자열이면 어디서나 가능. */
  requiredLocation: string;
  /** 친화도 보너스 수율 트리거 원소 인덱스 목록. */
  colorBonus: number[];
}

// ============================================================
// 파서 헬퍼
// ============================================================

/** "<itemKey>:<amount>" 단일 토큰 파싱 */
function parseItemAmount(raw: string): { item: string; amount: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const colon = trimmed.lastIndexOf(':');
  if (colon === -1) return null;
  const item = trimmed.slice(0, colon).trim();
  const amount = parseInt(trimmed.slice(colon + 1), 10);
  if (!item || !Number.isFinite(amount) || amount <= 0) return null;
  return { item, amount };
}

/** "<itemKey>:<amount>, <itemKey>:<amount>" 다중 파싱 */
export function parseInputs(raw: string): CraftInputDef[] {
  if (!raw.trim()) return [];
  const result: CraftInputDef[] = [];
  for (const token of raw.split(',')) {
    const entry = parseItemAmount(token);
    if (entry) result.push(entry);
  }
  return result;
}

/** "<itemKey>:<amount>" 단건 파싱 */
export function parseOutput(raw: string): CraftOutputDef | null {
  return parseItemAmount(raw);
}

/** "1, 6, 7" → [1, 6, 7] */
export function parseColorBonus(raw: string): number[] {
  if (!raw.trim()) return [];
  const result: number[] = [];
  for (const token of raw.split(',')) {
    const n = parseInt(token.trim(), 10);
    if (Number.isFinite(n) && n >= 0 && n <= 7) result.push(n);
  }
  return result;
}

// ============================================================
// 레지스트리
// ============================================================

const recipeRegistry = new Map<string, CraftRecipeDef>();

export function loadCraftRecipeDefs(sections: DataSection[]): void {
  recipeRegistry.clear();
  for (const s of sections) {
    if (s.name.startsWith('#') || s.name === 'Meta') continue;
    const inputs = parseInputs(s.get('inputs', ''));
    const output = parseOutput(s.get('output', ''));
    if (inputs.length === 0 || !output) continue; // 불완전 섹션 스킵
    const def: CraftRecipeDef = {
      id: s.name,
      name: s.get('name', s.name),
      description: s.get('description', ''),
      inputs,
      output,
      vigorCost: s.getInt('vigorCost', 5),
      requiredLocation: s.get('requiredLocation', '').trim(),
      colorBonus: parseColorBonus(s.get('colorBonus', '')),
    };
    recipeRegistry.set(def.id, def);
  }
}

export function getCraftRecipeDef(id: string): CraftRecipeDef | undefined {
  return recipeRegistry.get(id);
}

export function getAllCraftRecipeDefs(): readonly CraftRecipeDef[] {
  return [...recipeRegistry.values()];
}

export function getCraftRecipeCount(): number {
  return recipeRegistry.size;
}
