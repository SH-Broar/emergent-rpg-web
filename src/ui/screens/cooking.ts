// cooking.ts — 쿠킹 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { ItemType } from '../../types/enums';
import { categoryName } from '../../types/item-defs';

interface Recipe {
  name: string;
  resultId: string;
  ingredients: { type: ItemType; amount: number }[];
  buff: { stat: string; value: number }[];
  buffDuration: number;
  description: string;
}

const RECIPES: Recipe[] = [
  {
    name: '허브 샐러드',
    resultId: 'herb_salad',
    ingredients: [{ type: ItemType.Herb, amount: 2 }],
    buff: [{ stat: 'vigor', value: 20 }],
    buffDuration: 120,
    description: '신선한 허브로 만든 가벼운 샐러드. 기력을 회복시킨다.',
  },
  {
    name: '약초 수프',
    resultId: 'herb_soup',
    ingredients: [{ type: ItemType.Herb, amount: 3 }, { type: ItemType.Food, amount: 1 }],
    buff: [{ stat: 'hp', value: 30 }, { stat: 'vigor', value: 15 }],
    buffDuration: 180,
    description: '따뜻한 약초 수프. 체력과 기력을 함께 회복시킨다.',
  },
  {
    name: '강화 포션',
    resultId: 'enhanced_potion',
    ingredients: [{ type: ItemType.Herb, amount: 2 }, { type: ItemType.Potion, amount: 1 }],
    buff: [{ stat: 'attack', value: 5 }],
    buffDuration: 300,
    description: '약초를 첨가한 강화 포션. 공격력이 일시적으로 오른다.',
  },
  {
    name: '방어의 식사',
    resultId: 'defense_meal',
    ingredients: [{ type: ItemType.Food, amount: 3 }, { type: ItemType.Herb, amount: 1 }],
    buff: [{ stat: 'defense', value: 3 }, { stat: 'hp', value: 20 }],
    buffDuration: 240,
    description: '든든한 식사. 방어력과 체력을 동시에 올려준다.',
  },
  {
    name: '활력의 빵',
    resultId: 'vigor_bread',
    ingredients: [{ type: ItemType.Food, amount: 2 }],
    buff: [{ stat: 'vigor', value: 30 }],
    buffDuration: 120,
    description: '갓 구운 빵. 기력이 크게 회복된다.',
  },
  {
    name: '마나 티',
    resultId: 'mana_tea',
    ingredients: [{ type: ItemType.Herb, amount: 2 }, { type: ItemType.Potion, amount: 1 }],
    buff: [{ stat: 'mp', value: 25 }],
    buffDuration: 180,
    description: '허브를 우린 마나 회복 차.',
  },
  {
    name: '모험가의 도시락',
    resultId: 'adventure_lunch',
    ingredients: [{ type: ItemType.Food, amount: 2 }, { type: ItemType.Herb, amount: 1 }, { type: ItemType.Potion, amount: 1 }],
    buff: [{ stat: 'hp', value: 20 }, { stat: 'mp', value: 10 }, { stat: 'vigor', value: 20 }, { stat: 'attack', value: 2 }],
    buffDuration: 360,
    description: '온갖 재료를 넣은 든든한 도시락. 종합 버프를 준다.',
  },
  {
    name: '드래곤 스튜',
    resultId: 'dragon_stew',
    ingredients: [{ type: ItemType.Food, amount: 5 }, { type: ItemType.Herb, amount: 3 }],
    buff: [{ stat: 'hp', value: 50 }, { stat: 'attack', value: 5 }, { stat: 'defense', value: 3 }],
    buffDuration: 480,
    description: '드라카가 즐겨 먹는 묵직한 스튜. 강력한 효과를 낸다.',
  },
];

const STAT_LABELS: Record<string, string> = {
  hp: 'HP', mp: 'MP', vigor: '기력', attack: '공격', defense: '방어',
};

export function createCookingScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let message = '';

  function canCraft(recipe: Recipe): boolean {
    return recipe.ingredients.every(ing => (p.spirit.inventory.get(ing.type) ?? 0) >= ing.amount);
  }

  function renderCooking(el: HTMLElement) {
    el.innerHTML = `
      <div class="screen info-screen cooking-screen">
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>🍳 요리</h2>
        ${message ? `<div class="trade-message">${message}</div>` : ''}
        <div class="menu-buttons">
          ${RECIPES.map((r, i) => {
            const ok = canCraft(r);
            const ingText = r.ingredients.map(ing => {
              const have = p.spirit.inventory.get(ing.type) ?? 0;
              const color = have >= ing.amount ? 'var(--success)' : 'var(--accent)';
              return `<span style="color:${color}">${categoryName(ing.type)} ${have}/${ing.amount}</span>`;
            }).join(' · ');
            const buffText = r.buff.map(b => `${STAT_LABELS[b.stat] ?? b.stat}+${b.value}`).join(', ');
            return `
              <button class="btn" data-cook="${i}" ${ok ? '' : 'disabled'} style="text-align:left;opacity:${ok ? '1' : '0.5'}">
                <div><strong>${i + 1}. ${r.name}</strong></div>
                <div style="font-size:11px;color:var(--text-dim)">${r.description}</div>
                <div style="font-size:11px">재료: ${ingText}</div>
                <div style="font-size:11px;color:var(--warning)">효과: ${buffText} (${r.buffDuration}분)</div>
              </button>`;
          }).join('')}
        </div>
        <p class="hint">1~${RECIPES.length} 선택, Esc 뒤로</p>
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
    const recipe = RECIPES[idx];
    if (!recipe || !canCraft(recipe)) return;

    // Consume ingredients
    for (const ing of recipe.ingredients) {
      p.consumeItem(ing.type, ing.amount);
    }

    // Add result item
    p.addItemById(recipe.resultId, 1);
    session.knowledge.discoverItem(recipe.resultId);
    session.knowledge.trackItemCrafted();

    session.backlog.add(session.gameTime, `${p.name}이(가) ${recipe.name}을(를) 만들었다.`, '행동');
    message = `${recipe.name} 제작 완료!`;
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
        const idx = parseInt(key, 10) - 1;
        if (idx < RECIPES.length) doCook(idx, c);
      }
    },
  };
}
