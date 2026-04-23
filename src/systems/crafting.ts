// crafting.ts — 제작/합성 시스템
// 라이트 슬로우 라이프 판타지 테마: 아늑하고 보람찬 제작 경험
//
// 레시피 데이터는 public/data/craft_recipes.txt 에서 로드되어 src/data/craft-defs.ts
// 의 레지스트리에 저장된다. 이 파일은 그 위에 얹은 게임 로직(자원 검사, 소비, 산출)만 담는다.
// UI 화면(craft.ts)도 동일한 레지스트리를 통해 동일한 레시피를 보게 된다.

import { Actor } from '../models/actor';
import { ItemType, parseItemType } from '../types/enums';
import { getItemDef } from '../types/item-defs';
import { categoryName } from '../ui/item-labels';
import {
  getAllCraftRecipeDefs,
  getCraftRecipeDef,
  type CraftRecipeDef,
} from '../data/craft-defs';

// ============================================================
// 외부 노출용 타입 (구 시그니처 호환)
// ============================================================

export interface RecipeInput {
  item: string;        // ItemType 이름 또는 개별 아이템 ID
  amount: number;
}

export interface RecipeOutput {
  item: string;
  amount: number;
}

export interface CraftRecipe {
  id: string;
  name: string;
  description: string;
  inputs: RecipeInput[];
  output: RecipeOutput;
  vigorCost: number;
  requiredLocation?: string;
  colorBonus?: number[];
}

/** 데이터 레지스트리의 정의를 외부 노출용 형태로 변환 */
function toRecipe(def: CraftRecipeDef): CraftRecipe {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    inputs: def.inputs.map(i => ({ item: i.item, amount: i.amount })),
    output: { item: def.output.item, amount: def.output.amount },
    vigorCost: def.vigorCost,
    requiredLocation: def.requiredLocation || undefined,
    colorBonus: def.colorBonus.length > 0 ? [...def.colorBonus] : undefined,
  };
}

// ============================================================
// 내부 헬퍼: ItemType 이름 ↔ 개별 ID 분기
// ============================================================

type ItemRef = { kind: 'category'; type: ItemType } | { kind: 'id'; id: string };

function isItemTypeKey(itemKey: string): boolean {
  switch (itemKey.trim()) {
    case 'Food':
    case 'Herb':
    case 'OreCommon':
    case 'OreRare':
    case 'MonsterLoot':
    case 'Potion':
    case 'Equipment':
    case 'GuildCard':
      return true;
    default:
      return false;
  }
}

function resolveItemRef(itemKey: string): ItemRef {
  return isItemTypeKey(itemKey)
    ? { kind: 'category', type: parseItemType(itemKey) }
    : { kind: 'id', id: itemKey };
}

function getHeldAmount(actor: Actor, itemKey: string): number {
  const ref = resolveItemRef(itemKey);
  return ref.kind === 'category'
    ? actor.getItemCountByType(ref.type)
    : actor.getItemCount(ref.id);
}

function removeHeld(actor: Actor, itemKey: string, amount: number): void {
  const ref = resolveItemRef(itemKey);
  if (ref.kind === 'category') {
    actor.consumeItem(ref.type, amount);
  } else {
    actor.removeItemById(ref.id, amount);
  }
}

function addHeld(actor: Actor, itemKey: string, amount: number): void {
  const ref = resolveItemRef(itemKey);
  if (ref.kind === 'category') {
    actor.addItem(ref.type, amount);
  } else {
    actor.addItemById(ref.id, amount);
  }
}

function getItemLabel(itemKey: string): string {
  const ref = resolveItemRef(itemKey);
  if (ref.kind === 'category') return categoryName(ref.type);
  return getItemDef(ref.id)?.name ?? ref.id;
}

// ============================================================
// 공개 API (구 시그니처 유지)
// ============================================================

/** 전체 레시피 목록 반환 */
export function getAllRecipes(): CraftRecipe[] {
  return getAllCraftRecipeDefs().map(toRecipe);
}

/** ID 로 레시피 조회 */
export function getRecipeById(id: string): CraftRecipe | undefined {
  const def = getCraftRecipeDef(id);
  return def ? toRecipe(def) : undefined;
}

/**
 * 현재 장소와 보유 재료를 기준으로 제작 가능한 레시피 목록 반환.
 * requiredLocation 이 설정된 레시피는 해당 장소에서만 표시된다.
 * 재료가 완전히 충족된 레시피만 반환한다.
 */
export function getAvailableRecipes(actor: Actor, location: string): CraftRecipe[] {
  return getAllRecipes().filter(recipe => {
    if (recipe.requiredLocation && recipe.requiredLocation !== location) return false;
    for (const input of recipe.inputs) {
      if (getHeldAmount(actor, input.item) < input.amount) return false;
    }
    return true;
  });
}

export interface CraftCheck {
  possible: boolean;
  reason?: string;
}

/**
 * 레시피 제작 가능 여부와 불가 이유 반환.
 * 장소 제약은 여기서 검사하지 않는다 — 호출측이 location 을 별도로 처리한다.
 */
export function canCraft(actor: Actor, recipe: CraftRecipe): CraftCheck {
  const tpCost = Math.ceil(recipe.vigorCost / 10);
  if (!actor.hasAp(tpCost)) {
    return {
      possible: false,
      reason: `TP가 부족하다. (필요: ${tpCost}, 현재: ${actor.base.ap})`,
    };
  }
  for (const input of recipe.inputs) {
    const held = getHeldAmount(actor, input.item);
    if (held < input.amount) {
      return {
        possible: false,
        reason: `재료가 부족하다: ${getItemLabel(input.item)} ×${input.amount} (보유: ${held})`,
      };
    }
  }
  return { possible: true };
}

export interface CraftResult {
  success: boolean;
  message: string;
  bonusYield: boolean;
}

/**
 * 제작 실행.
 * - 입력 재료 소모
 * - TP 소모
 * - 출력 아이템 추가 (가방 용량 검사 — actor.ts 정책 준수)
 * - 색상 친화도 보너스 수율 (colorBonus 원소 값 > 0.6 이면 30% 확률로 +1)
 */
export function executeCraft(actor: Actor, recipe: CraftRecipe, bagCapacity?: number): CraftResult {
  const check = canCraft(actor, recipe);
  if (!check.possible) {
    return { success: false, message: check.reason ?? '제작할 수 없다.', bonusYield: false };
  }

  // 출력이 개별 아이템(ID)이고 bagCapacity 가 주어지면 가방 여유 확인
  if (bagCapacity !== undefined) {
    const ref = resolveItemRef(recipe.output.item);
    if (ref.kind === 'id' && actor.isBagFull(bagCapacity, ref.id)) {
      return { success: false, message: '⚠ 인벤토리가 가득 찼습니다!', bonusYield: false };
    }
  }

  for (const input of recipe.inputs) {
    removeHeld(actor, input.item, input.amount);
  }

  actor.adjustAp(-Math.ceil(recipe.vigorCost / 10));

  let outputAmount = recipe.output.amount;
  let bonusYield = false;
  if (recipe.colorBonus && recipe.colorBonus.length > 0) {
    for (const elemIdx of recipe.colorBonus) {
      const colorVal = actor.color.values[elemIdx] ?? 0;
      if (colorVal > 0.6 && Math.random() < 0.3) {
        outputAmount += 1;
        bonusYield = true;
        break;
      }
    }
  }

  addHeld(actor, recipe.output.item, outputAmount);

  const baseMsg = `${recipe.name}을(를) 제작했다. (${getItemLabel(recipe.output.item)} ×${recipe.output.amount})`;
  const message = bonusYield
    ? `${baseMsg} ✦ 친화력 보너스! 추가로 1개를 더 얻었다.`
    : baseMsg;

  return { success: true, message, bonusYield };
}

/** 외부에서 라벨 표시할 때 사용 */
export function craftItemLabel(itemKey: string): string {
  return getItemLabel(itemKey);
}
