// craft.ts — 제작/대장간 화면
//
// 데이터 소스: public/data/craft_recipes.txt → src/data/craft-defs.ts 레지스트리.
// 게임 로직(자원 검사, 소비, 산출, 색상 보너스)은 src/systems/crafting.ts 가 담당.
// 이 화면은 현재 위치에서 제작 가능한 레시피를 나열하고, 클릭 시 executeCraft 를 호출한다.

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import {
  getAllRecipes,
  canCraft,
  executeCraft,
  craftItemLabel,
  type CraftRecipe,
} from '../../systems/crafting';
import { checkAndAwardTitles } from '../../systems/title-system';
import { getItemDef } from '../../types/item-defs';

/** 결과 아이템의 사용 효과 미리보기 (제작 전에 알 수 있도록) */
function renderCraftEffects(item: unknown): string {
  if (typeof item !== 'string') return '';
  const def = getItemDef(item);
  if (!def) return '';
  const parts: string[] = [];
  if (def.eatHp) parts.push(`HP ${def.eatHp >= 0 ? '+' : ''}${def.eatHp}`);
  if (def.eatMp) parts.push(`MP ${def.eatMp >= 0 ? '+' : ''}${def.eatMp}`);
  if (def.eatVigor) parts.push(`TP ${def.eatVigor >= 0 ? '+' : ''}${Math.round(def.eatVigor / 10)}`);
  if (def.eatBuffType && def.eatBuffDuration > 0) {
    parts.push(`${def.eatBuffType} +${def.eatBuffAmount} (${def.eatBuffDuration}턴)`);
  }
  if (def.eatStatus) parts.push(`⚠ ${def.eatStatus}`);
  return parts.length > 0 ? parts.join(' · ') : '';
}

const ELEMENT_LABELS = ['🔥불', '💧물', '⚡전기', '🩶철', '🌿흙', '🌬바람', '✨빛', '🌑어둠'];

function describeColorBonus(bonus: number[] | undefined): string {
  if (!bonus || bonus.length === 0) return '';
  return bonus.map(i => ELEMENT_LABELS[i] ?? `?${i}`).join('·');
}

export function createCraftScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let message = '';

  function visibleRecipes(): CraftRecipe[] {
    const loc = p.currentLocation;
    return getAllRecipes().filter(r => !r.requiredLocation || r.requiredLocation === loc);
  }

  function renderCraft(el: HTMLElement) {
    const recipes = visibleRecipes();
    el.innerHTML = `
      <div class="screen info-screen craft-screen">
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>🔨 제작</h2>
        ${message ? `<div class="trade-message">${message}</div>` : ''}
        <p style="text-align:center;color:var(--text-dim);font-size:11px">
          현재 위치: ${p.currentLocation} · TP ${p.base.ap}/${p.getEffectiveMaxAp()}
        </p>
        ${recipes.length === 0
          ? '<p class="hint" style="text-align:center;padding:16px;color:var(--text-dim)">이 장소에서 제작 가능한 레시피가 없습니다.</p>'
          : `<div class="menu-buttons">
          ${recipes.map((r, i) => {
            const check = canCraft(p, r);
            const ok = check.possible;
            const inputText = r.inputs
              .map(input => {
                const need = input.amount;
                const label = craftItemLabel(input.item);
                return `${label} ×${need}`;
              })
              .join(' + ');
            const outputLabel = `${craftItemLabel(r.output.item)} ×${r.output.amount}`;
            const tpCost = Math.ceil(r.vigorCost / 10);
            const colorHint = describeColorBonus(r.colorBonus);
            return `
              <button class="btn" data-craft="${i}" ${ok ? '' : 'disabled'} style="text-align:left;opacity:${ok ? '1' : '0.5'}">
                <div><strong>${i + 1}. ${r.name}</strong> <span style="color:var(--text-dim);font-size:11px">TP ${tpCost}</span></div>
                ${r.description ? `<div style="font-size:11px;color:var(--text-dim)">${r.description}</div>` : ''}
                <div style="font-size:11px">재료: ${inputText} → 결과: <span style="color:var(--success)">${outputLabel}</span></div>
                ${(() => { const eff = renderCraftEffects(r.output.item); return eff ? `<div style="font-size:11px;color:var(--accent)">효과: ${eff}</div>` : ''; })()}
                ${colorHint ? `<div style="font-size:11px;color:var(--text-dim)">친화 보너스: ${colorHint} (해당 원소 색상 > 0.6 시 30% 확률로 +1)</div>` : ''}
                ${!ok && check.reason ? `<div style="font-size:11px;color:var(--accent)">${check.reason}</div>` : ''}
              </button>`;
          }).join('')}
        </div>`}
        <p class="hint">1~${Math.min(9, recipes.length)} 선택, Esc 뒤로</p>
      </div>`;

    el.querySelector('[data-back]')?.addEventListener('click', onDone);
    el.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.craft!, 10);
        doCraft(idx, el);
      });
    });
  }

  function doCraft(idx: number, el: HTMLElement) {
    const recipes = visibleRecipes();
    const recipe = recipes[idx];
    if (!recipe) return;

    const result = executeCraft(p, recipe, session.knowledge.bagCapacity);
    if (!result.success) {
      message = result.message;
      renderCraft(el);
      return;
    }

    // 발견·통계 트래킹
    session.knowledge.discoverItem(recipe.output.item);
    session.knowledge.trackItemCrafted();

    session.backlog.add(session.gameTime, `${p.name}이(가) ${result.message}`, '행동');

    // 제작 완료: Iron+, Earth+, Fire+
    const craftInfluence = new Array(8).fill(0);
    craftInfluence[3] = 0.008; // Iron
    craftInfluence[4] = 0.005; // Earth
    craftInfluence[0] = 0.005; // Fire
    p.color.applyInfluence(craftInfluence);

    const titles = checkAndAwardTitles(session);
    for (const t of titles) {
      session.backlog.add(session.gameTime, `✦ 칭호 획득: "${t}"`, '시스템');
    }

    message = result.message + (titles.length > 0 ? ` ✦ 칭호: "${titles[titles.length - 1]}"` : '');
    renderCraft(el);
  }

  return {
    id: 'craft',
    render: renderCraft,
    onKey(key) {
      const c = document.querySelector('.craft-screen')?.parentElement;
      if (!(c instanceof HTMLElement)) return;
      if (key === 'Escape') { onDone(); return; }
      if (/^[1-9]$/.test(key)) {
        const recipes = visibleRecipes();
        const idx = parseInt(key, 10) - 1;
        if (idx < recipes.length) doCraft(idx, c);
      }
    },
  };
}
