// crafting.ts — 제작/합성 시스템
// 라이트 슬로우 라이프 판타지 테마: 아늑하고 보람찬 제작 경험

import { Actor } from '../models/actor';
import { ItemType, parseItemType } from '../types/enums';

// ============================================================
// 제작 레시피 정의
// ============================================================

export interface RecipeInput {
  item: string;        // ItemType 이름 (예: 'Herb', 'Food') 또는 개별 아이템 ID
  amount: number;
}

export interface RecipeOutput {
  item: string;        // ItemType 이름 또는 개별 아이템 ID
  amount: number;
}

export interface CraftRecipe {
  id: string;
  name: string;
  description: string;
  inputs: RecipeInput[];
  output: RecipeOutput;
  vigorCost: number;
  requiredLocation?: string;   // 제작 가능 장소 (LocationID)
  colorBonus?: number[];       // 보너스 수율을 주는 원소 인덱스 목록
}

// ============================================================
// 레시피 데이터 (하드코딩 스타터 세트)
// ============================================================

const RECIPES: CraftRecipe[] = [
  // --- 요리 ---
  {
    id: 'herbal_tea',
    name: '허브차',
    description: '마음이 편안해지는 따뜻한 차',
    inputs: [{ item: 'Herb', amount: 2 }],
    output: { item: 'Potion', amount: 1 },
    vigorCost: 5,
    colorBonus: [1],   // Water: 차분함
  },
  {
    id: 'hearty_stew',
    name: '든든한 스튜',
    description: '여행자의 배를 든든히 채워주는 스튜',
    inputs: [{ item: 'Food', amount: 2 }, { item: 'Herb', amount: 1 }],
    output: { item: 'Food', amount: 4 },
    vigorCost: 10,
    colorBonus: [4],   // Earth: 풍요
  },
  {
    id: 'trail_mix',
    name: '행동식',
    description: '오래 보관할 수 있는 간편 식량',
    inputs: [{ item: 'Food', amount: 3 }],
    output: { item: 'Food', amount: 5 },
    vigorCost: 5,
  },

  // --- 연금술 ---
  {
    id: 'healing_salve',
    name: '치유 연고',
    description: '상처를 아물게 하는 약초 연고',
    inputs: [{ item: 'Herb', amount: 3 }],
    output: { item: 'Potion', amount: 2 },
    vigorCost: 10,
    colorBonus: [6],   // Light: 치유
  },
  {
    id: 'vigor_tonic',
    name: '활력 강장제',
    description: '피로를 씻어주는 강장제',
    inputs: [{ item: 'Herb', amount: 2 }, { item: 'Potion', amount: 1 }],
    output: { item: 'Potion', amount: 3 },
    vigorCost: 15,
    colorBonus: [0],   // Fire: 활력
  },

  // --- 대장간 ---
  {
    id: 'refined_ore',
    name: '정제된 광석',
    description: '불순물을 제거한 질 좋은 광석',
    inputs: [{ item: 'OreCommon', amount: 3 }],
    output: { item: 'OreRare', amount: 1 },
    vigorCost: 20,
    requiredLocation: 'Moss_Forge',
    colorBonus: [3],   // Iron: 단련
  },
  {
    id: 'simple_tool',
    name: '간단한 도구',
    description: '일상에 쓰이는 작은 도구',
    inputs: [{ item: 'OreCommon', amount: 2 }],
    output: { item: 'Equipment', amount: 1 },
    vigorCost: 15,
    requiredLocation: 'Moss_Forge',
  },

  // --- 선물 & 장식 (따뜻한 테마) ---
  {
    id: 'flower_bouquet',
    name: '꽃다발',
    description: '마음을 전하는 예쁜 꽃다발',
    inputs: [{ item: 'Herb', amount: 2 }],
    output: { item: 'GuildCard', amount: 1 },
    vigorCost: 5,
    colorBonus: [5],   // Wind: 자유로운 마음
  },
  {
    id: 'lucky_charm',
    name: '행운의 부적',
    description: '좋은 일이 생길 것 같은 부적',
    inputs: [{ item: 'OreCommon', amount: 1 }, { item: 'Herb', amount: 1 }],
    output: { item: 'GuildCard', amount: 1 },
    vigorCost: 10,
    colorBonus: [6],   // Light: 행운
  },

  // --- 몬스터 전리품 활용 ---
  {
    id: 'trophy',
    name: '모험 기념품',
    description: '던전 탐험의 기념품',
    inputs: [{ item: 'MonsterLoot', amount: 3 }],
    output: { item: 'Equipment', amount: 1 },
    vigorCost: 15,
    colorBonus: [7],   // Dark: 깊은 어둠에서 건진 보물
  },
];

// ============================================================
// 내부 헬퍼: ItemType 이름 → ItemType 변환
// ============================================================

function resolveItemType(itemKey: string): ItemType {
  return parseItemType(itemKey);
}

/** actor.spirit.inventory에서 해당 ItemType 보유량 조회 */
function getInventoryCount(actor: Actor, type: ItemType): number {
  return actor.spirit.inventory.get(type) ?? 0;
}

// ============================================================
// 공개 API
// ============================================================

/** 전체 레시피 목록 반환 */
export function getAllRecipes(): CraftRecipe[] {
  return RECIPES;
}

/**
 * 현재 장소와 보유 재료를 기준으로 제작 가능한 레시피 목록 반환.
 * requiredLocation 이 설정된 레시피는 해당 장소에서만 표시된다.
 * 재료가 완전히 충족된 레시피만 반환한다.
 */
export function getAvailableRecipes(actor: Actor, location: string): CraftRecipe[] {
  return RECIPES.filter(recipe => {
    // 장소 제약 확인
    if (recipe.requiredLocation && recipe.requiredLocation !== location) {
      return false;
    }

    // 모든 재료 충족 여부 확인
    for (const input of recipe.inputs) {
      const type = resolveItemType(input.item);
      if (getInventoryCount(actor, type) < input.amount) {
        return false;
      }
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
  // TP 확인
  const tpCost = Math.ceil(recipe.vigorCost / 10);
  if (!actor.hasAp(tpCost)) {
    return {
      possible: false,
      reason: `TP가 부족하다. (필요: ${tpCost}, 현재: ${actor.base.ap})`,
    };
  }

  // 재료 확인
  for (const input of recipe.inputs) {
    const type = resolveItemType(input.item);
    const held = getInventoryCount(actor, type);
    if (held < input.amount) {
      const categoryLabel = input.item;
      return {
        possible: false,
        reason: `재료가 부족하다: ${categoryLabel} ×${input.amount} (보유: ${held})`,
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
 * - 출력 아이템 추가
 * - 색상 친화도 보너스 수율 (colorBonus 원소의 값 > 0.6 이면 30% 확률로 +1)
 */
export function executeCraft(actor: Actor, recipe: CraftRecipe): CraftResult {
  const check = canCraft(actor, recipe);
  if (!check.possible) {
    return { success: false, message: check.reason ?? '제작할 수 없다.', bonusYield: false };
  }

  // 재료 소모
  for (const input of recipe.inputs) {
    const type = resolveItemType(input.item);
    const cur = actor.spirit.inventory.get(type) ?? 0;
    actor.spirit.inventory.set(type, cur - input.amount);
  }

  // TP 소모
  actor.adjustAp(-Math.ceil(recipe.vigorCost / 10));

  // 기본 출력량 계산
  const outputType = resolveItemType(recipe.output.item);
  let outputAmount = recipe.output.amount;

  // 색상 친화도 보너스 수율
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

  // 출력 아이템 추가
  actor.addItem(outputType, outputAmount);

  // 결과 메시지
  const baseMsg = `${recipe.name}을(를) 제작했다. (×${recipe.output.amount})`;
  const message = bonusYield
    ? `${baseMsg} ✦ 친화력 보너스! 추가로 1개를 더 얻었다.`
    : baseMsg;

  return { success: true, message, bonusYield };
}
