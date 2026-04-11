// skill-shop.ts — 장소 스킬 학습 화면 (루나 마법학교 / 하나브릿지 신전)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { getShopSkillsForLocation, type SkillDef } from '../../models/skill';
import { parseItemType, itemTypeName } from '../../types/enums';

export function createSkillShopScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  const loc = p.currentLocation;
  const shopSkills = getShopSkillsForLocation(loc);

  // 스킬을 기본 계열별로 그룹화 (replacesSkill 체인을 추적)
  interface SkillLine {
    name: string;  // 계열 이름
    tiers: SkillDef[];  // 1단계, 2단계, 3단계
  }

  function buildSkillLines(): SkillLine[] {
    // 1단계 스킬 찾기 (replacesSkill이 없는 것)
    const tier1s = shopSkills.filter(s => !s.replacesSkill || s.replacesSkill === '');
    const lines: SkillLine[] = [];

    for (const base of tier1s) {
      const tiers: SkillDef[] = [base];
      // 2단계: replacesSkill === base.id
      const t2 = shopSkills.find(s => s.replacesSkill === base.id);
      if (t2) {
        tiers.push(t2);
        // 3단계: replacesSkill === t2.id
        const t3 = shopSkills.find(s => s.replacesSkill === t2.id);
        if (t3) tiers.push(t3);
      }
      lines.push({ name: base.name.split(' ')[0] || base.name, tiers });
    }
    return lines;
  }

  function getPlayerCurrentTier(line: SkillLine): number {
    for (let i = line.tiers.length - 1; i >= 0; i--) {
      if (p.learnedSkills.has(line.tiers[i].id)) return i + 1;
    }
    return 0;
  }

  function getNextTier(line: SkillLine): SkillDef | null {
    const current = getPlayerCurrentTier(line);
    if (current >= line.tiers.length) return null;
    return line.tiers[current] ?? null;
  }

  function canAfford(skill: SkillDef): boolean {
    for (const cost of skill.learnCost ?? []) {
      const itemType = parseItemType(cost.item);
      const count = p.spirit.inventory.get(itemType) ?? 0;
      if (count < cost.amount) return false;
    }
    return true;
  }

  function meetsHyperion(skill: SkillDef): boolean {
    return p.hyperionLevel >= (skill.learnMinHyperion ?? 0);
  }

  function purchaseSkill(skill: SkillDef): boolean {
    if (!canAfford(skill) || !meetsHyperion(skill)) return false;
    // 재료 소모
    for (const cost of skill.learnCost ?? []) {
      const itemType = parseItemType(cost.item);
      const current = p.spirit.inventory.get(itemType) ?? 0;
      p.spirit.inventory.set(itemType, current - cost.amount);
    }
    // 스킬 교체 또는 학습
    p.replaceSkill(skill.replacesSkill ?? '', skill.id);
    session.backlog.add(session.gameTime, `${skill.name} 스킬을 습득했다!`, '행동');
    return true;
  }

  const locLabel = loc === 'Luna_Academy' ? '마법학교 루나 — 스킬 학습' : '하나브릿지 신전 — 스킬 학습';

  return {
    id: 'skill_shop',
    render(el) {
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'screen info-screen';

      const lines = buildSkillLines();

      const lineHtml = lines.map((line, li) => {
        const currentTier = getPlayerCurrentTier(line);
        const next = getNextTier(line);

        const tierDisplay = line.tiers.map((t, ti) => {
          const owned = ti < currentTier;
          const isNext = ti === currentTier;
          const color = owned ? 'var(--success)' : isNext ? 'var(--warning)' : 'var(--text-dim)';
          return `<span style="color:${color};font-weight:${owned || isNext ? '600' : '400'}">${t.name}</span>`;
        }).join(' → ');

        let actionHtml = '';
        if (!next) {
          actionHtml = '<span style="color:var(--success);font-size:12px">최대 단계</span>';
        } else {
          const affordable = canAfford(next);
          const hyp = meetsHyperion(next);
          const costText = (next.learnCost ?? []).map(c => `${itemTypeName(parseItemType(c.item))} ${c.amount}개`).join(', ');
          const hypText = (next.learnMinHyperion ?? 0) > 0 ? `히페리온 ${next.learnMinHyperion}+` : '';
          const canBuy = affordable && hyp;

          actionHtml = `
            <div style="font-size:12px;margin-top:4px">
              <span style="color:${affordable ? 'var(--text-dim)' : 'var(--accent)'}">${costText}</span>
              ${hypText ? `<span style="color:${hyp ? 'var(--text-dim)' : 'var(--accent)'}"> · ${hypText}</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${next.description}</div>
            <button class="btn${canBuy ? ' btn-primary' : ''}" data-buy="${li}" ${canBuy ? '' : 'disabled'} style="margin-top:6px;font-size:12px;padding:4px 12px">
              ${canBuy ? `${next.name} 습득` : '조건 부족'}
            </button>
          `;
        }

        return `
          <div style="padding:10px 12px;background:var(--bg-card);border-radius:6px;margin-bottom:8px">
            <div style="font-size:13px">${tierDisplay}</div>
            ${actionHtml}
          </div>
        `;
      }).join('');

      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>${locLabel}</h2>
        <p class="hint" style="margin-bottom:12px">던전 재료로 강력한 스킬을 습득하거나 강화할 수 있습니다.</p>
        ${lines.length === 0 ? '<p class="hint">이 장소에서 학습 가능한 스킬이 없습니다.</p>' : lineHtml}
      `;

      wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
      wrap.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(btn => {
        btn.addEventListener('click', () => {
          const li = parseInt(btn.dataset.buy!, 10);
          const line = lines[li];
          if (!line) return;
          const next = getNextTier(line);
          if (!next) return;
          if (purchaseSkill(next)) {
            this.render(el); // re-render
          }
        });
      });

      el.appendChild(wrap);
    },
    onKey(key) {
      if (key === 'Escape') onDone();
    },
  };
}
