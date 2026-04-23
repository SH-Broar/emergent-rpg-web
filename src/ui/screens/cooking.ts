// cooking.ts — 쿠킹 화면 (tag + 희귀도 기반 재설계)
//
// 레시피 정의는 public/data/recipes.txt → recipe-defs.ts 레지스트리에서 로드.
// 재료 매칭은 tag 표현식으로 수행하며, 소비된 재료의 가중평균 희귀도 점수에 따라
// 결과 아이템이 여러 품질 티어 중 하나로 결정된다.
//
// 재료 자동 선택 전략: 보유 아이템 중 희귀도가 높은 것부터 우선 소비 → 고품질 재료로
// 고품질 결과를 얻는 감각적 보상.

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { getItemDef, getEquippedAccessoryEffects, type ItemDef } from '../../types/item-defs';
import { evaluateTagExpr } from '../../types/tag-system';
import {
  getAllRecipeDefs,
  rarityScore,
  selectTier,
  type RecipeDef,
  type RecipeIngredient,
  type RecipeTier,
} from '../../data/recipe-defs';
import { RARITY_COLORS, RARITY_NAMES } from '../item-labels';
import { checkAndAwardTitles } from '../../systems/title-system';

/** 단일 재료에 대해 플레이어가 실제로 사용할 아이템 묶음 */
interface IngredientPick {
  /** 이 재료 엔트리의 인덱스 */
  ingredientIdx: number;
  /** 소비할 아이템 묶음: (itemId, 소비수량) */
  picks: { itemId: string; def: ItemDef; take: number }[];
  /** 부족한 수량 (0이면 충족) */
  shortage: number;
}

/**
 * 플레이어 인벤토리에서 주어진 재료 하나를 충당하기 위한 아이템 목록.
 * 희귀도 내림차순으로 정렬하여 앞에서부터 take, 총 take 합이 amount가 될 때까지 소비.
 * reserved: 이미 다른 재료에서 소비하기로 잡아둔 (itemId → 수량) 맵.
 */
function collectIngredient(
  player: { items: Map<string, number> },
  ingredient: RecipeIngredient,
  ingredientIdx: number,
  reserved: Map<string, number>,
): IngredientPick {
  // 매칭 후보 수집
  const candidates: { itemId: string; def: ItemDef; available: number }[] = [];
  for (const [itemId, qty] of player.items) {
    if (qty <= 0) continue;
    const def = getItemDef(itemId);
    if (!def) continue;
    if (!evaluateTagExpr(ingredient.expr, def.tags)) continue;
    const available = qty - (reserved.get(itemId) ?? 0);
    if (available <= 0) continue;
    candidates.push({ itemId, def, available });
  }
  // 희귀도 내림차순 + 동률은 가격 내림차순
  candidates.sort((a, b) => {
    const diff = rarityScore(b.def.rarity) - rarityScore(a.def.rarity);
    if (diff !== 0) return diff;
    return b.def.price - a.def.price;
  });

  const picks: { itemId: string; def: ItemDef; take: number }[] = [];
  let remaining = ingredient.amount;
  for (const cand of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(cand.available, remaining);
    if (take > 0) {
      picks.push({ itemId: cand.itemId, def: cand.def, take });
      remaining -= take;
      reserved.set(cand.itemId, (reserved.get(cand.itemId) ?? 0) + take);
    }
  }
  return { ingredientIdx, picks, shortage: Math.max(0, remaining) };
}

/** 레시피 실행 가능 여부 + 예상 결과 */
interface RecipePlan {
  recipe: RecipeDef;
  ingredientPicks: IngredientPick[];
  canCraft: boolean;
  /** 전체 가중평균 희귀도 점수 (0.0 ~ 1.0) */
  score: number;
  /** 이 점수 기준으로 선택된 티어 */
  tier: RecipeTier | null;
}

function computeRecipePlan(
  player: { items: Map<string, number> },
  recipe: RecipeDef,
): RecipePlan {
  const reserved = new Map<string, number>();
  const picks: IngredientPick[] = [];
  let totalWeight = 0;
  let totalScore = 0;

  for (let i = 0; i < recipe.ingredients.length; i++) {
    const pick = collectIngredient(player, recipe.ingredients[i], i, reserved);
    picks.push(pick);
    for (const p of pick.picks) {
      const rs = rarityScore(p.def.rarity);
      totalWeight += p.take;
      totalScore += rs * p.take;
    }
  }

  const canCraft = picks.every(p => p.shortage === 0);
  const score = totalWeight > 0 ? totalScore / totalWeight : 0;
  const tier = selectTier(recipe.tiers, score);

  return { recipe, ingredientPicks: picks, canCraft, score, tier };
}

/** 재료 요구 표시용 라벨: 표현식 + 보유/필요 */
function describeIngredient(
  ing: RecipeIngredient,
  pick: IngredientPick,
): string {
  const actualHave = ing.amount - pick.shortage;
  const color = pick.shortage === 0 ? 'var(--success)' : 'var(--accent)';
  const exprShort = ing.expr.replace(/\s+/g, '');
  return `<span style="color:${color}">${exprShort} ${actualHave}/${ing.amount}</span>`;
}

/** 소비될 재료 미리보기 라벨 */
function describePicks(pick: IngredientPick): string {
  if (pick.picks.length === 0) return '—';
  return pick.picks
    .map(p => `${p.def.name}×${p.take}`)
    .join(' + ');
}

/** 티어 라벨 (이름 + 희귀도 색) */
function renderTierLabel(tier: RecipeTier | null): string {
  if (!tier) return '—';
  const def = getItemDef(tier.itemId);
  const name = def?.name ?? tier.itemId;
  const color = def ? RARITY_COLORS[def.rarity] : 'var(--text)';
  const rarityLabel = def ? RARITY_NAMES[def.rarity] : '';
  return `<span style="color:${color}">${name}${rarityLabel ? ` (${rarityLabel})` : ''}</span>`;
}

export function createCookingScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let message = '';

  function renderCooking(el: HTMLElement) {
    const recipes = getAllRecipeDefs();
    const plans = recipes.map(r => computeRecipePlan(p, r));

    el.innerHTML = `
      <div class="screen info-screen cooking-screen">
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>🍳 요리</h2>
        ${message ? `<div class="trade-message">${message}</div>` : ''}
        ${recipes.length === 0
          ? '<p class="hint">등록된 레시피가 없습니다.</p>'
          : `<div class="menu-buttons">
          ${plans.map((plan, i) => {
            const r = plan.recipe;
            const ok = plan.canCraft;
            const ingText = r.ingredients
              .map((ing, idx) => describeIngredient(ing, plan.ingredientPicks[idx]))
              .join(' · ');
            const preview = r.ingredients
              .map((_, idx) => describePicks(plan.ingredientPicks[idx]))
              .join(' / ');
            const scorePct = Math.round(plan.score * 100);
            return `
              <button class="btn" data-cook="${i}" ${ok ? '' : 'disabled'} style="text-align:left;opacity:${ok ? '1' : '0.5'}">
                <div><strong>${i + 1}. ${r.name}</strong></div>
                ${r.description ? `<div style="font-size:11px;color:var(--text-dim)">${r.description}</div>` : ''}
                <div style="font-size:11px">재료: ${ingText}</div>
                <div style="font-size:11px;color:var(--text-dim)">사용: ${preview}</div>
                <div style="font-size:11px">예상 품질: ${renderTierLabel(plan.tier)} <span style="color:var(--text-dim)">(희귀도 점수 ${scorePct}%)</span></div>
              </button>`;
          }).join('')}
        </div>`}
        <p class="hint">1~${Math.min(9, recipes.length)} 선택, Esc 뒤로. 재료는 희귀도가 높은 것부터 자동 선택됩니다.</p>
      </div>`;

    el.querySelector('[data-back]')?.addEventListener('click', onDone);
    el.querySelectorAll<HTMLButtonElement>('[data-cook]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.cook!, 10);
        doCook(idx, el);
      });
    });
  }

  function doCook(idx: number, el: HTMLElement) {
    const recipes = getAllRecipeDefs();
    const recipe = recipes[idx];
    if (!recipe) return;

    const plan = computeRecipePlan(p, recipe);
    if (!plan.canCraft || !plan.tier) {
      message = '재료가 부족합니다.';
      renderCooking(el);
      return;
    }

    // 가방 공간 확인 (결과 티어 아이템)
    if (p.isBagFull(session.knowledge.bagCapacity, plan.tier.itemId)) {
      message = '⚠ 인벤토리가 가득 찼습니다! 요리를 완성할 수 없었다.';
      renderCooking(el);
      return;
    }

    // 재료 소모
    for (const pick of plan.ingredientPicks) {
      for (const p_ of pick.picks) {
        p.removeItemById(p_.itemId, p_.take);
      }
    }

    // 악세서리 cookingBonus 는 결과 수량에 반영 (ceil)
    const accFx = getEquippedAccessoryEffects(p);
    const cookingMul = 1 + (accFx.cookingBonus ?? 0);
    const outputAmount = Math.max(1, Math.round(1 * cookingMul));

    p.addItemById(plan.tier.itemId, outputAmount);
    session.knowledge.discoverItem(plan.tier.itemId);
    session.knowledge.trackItemCrafted();

    const resultDef = getItemDef(plan.tier.itemId);
    const resultName = resultDef?.name ?? plan.tier.itemId;
    const rarityLabel = resultDef ? RARITY_NAMES[resultDef.rarity] : '';

    session.backlog.add(
      session.gameTime,
      `${p.name}이(가) ${recipe.name} 레시피로 ${resultName}${outputAmount > 1 ? ` ×${outputAmount}` : ''}을(를) 만들었다.`,
      '행동',
    );

    // 요리 완료: Fire+, Water+, Electric-
    const cookInfluence = new Array(8).fill(0);
    cookInfluence[0] = 0.007;
    cookInfluence[1] = 0.01;
    cookInfluence[2] = -0.005;
    p.color.applyInfluence(cookInfluence);
    session.knowledge.trackCookDone();
    const cookTitles = checkAndAwardTitles(session);
    for (const t of cookTitles) {
      session.backlog.add(session.gameTime, `✦ 칭호 획득: "${t}"`, '시스템');
    }

    const scorePct = Math.round(plan.score * 100);
    message =
      `${recipe.name} 제작 완료! → ${resultName}${rarityLabel ? ` (${rarityLabel})` : ''} ×${outputAmount}`
      + ` · 희귀도 점수 ${scorePct}%`
      + (cookTitles.length > 0 ? ` ✦ 칭호 획득: "${cookTitles[cookTitles.length - 1]}"` : '');
    renderCooking(el);
  }

  return {
    id: 'cooking',
    render: renderCooking,
    onKey(key) {
      const c = document.querySelector('.cooking-screen')?.parentElement;
      if (!(c instanceof HTMLElement)) return;
      if (key === 'Escape') { onDone(); return; }
      if (/^[1-9]$/.test(key)) {
        const recipes = getAllRecipeDefs();
        const idx = parseInt(key, 10) - 1;
        if (idx < recipes.length) doCook(idx, c);
      }
    },
  };
}
