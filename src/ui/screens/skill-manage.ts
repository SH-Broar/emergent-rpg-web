// skill-manage.ts — 스킬 관리 화면 (목록 + 순서 변경)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { getSkillDef, skillTypeName, skillElementName, SKILL_LEVEL_THRESHOLDS, SKILL_MAX_LEVEL } from '../../models/skill';

export function createSkillManageScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let selectedIdx = 0;

  function render(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen skill-manage-screen';

    const skills = p.skillOrder;
    const totalSkills = skills.length;

    let listHtml = '';
    if (totalSkills === 0) {
      listHtml = '<p class="hint">습득한 스킬이 없습니다.</p>';
    } else {
      for (let i = 0; i < skills.length; i++) {
        const def = getSkillDef(skills[i]);
        if (!def) continue;
        const level = p.learnedSkills.get(skills[i]) ?? 1;
        const usage = p.skillUsage.get(skills[i]) ?? 0;
        const nextThreshold = level < SKILL_MAX_LEVEL ? SKILL_LEVEL_THRESHOLDS[level] : -1;
        const typeLabel = skillTypeName(def.type);
        const elemLabel = skillElementName(def.element);
        const isSelected = i === selectedIdx;
        const tpLabel = def.tpCost > 0 ? ` TP${def.tpCost}` : '';

        listHtml += `
          <div class="skill-row${isSelected ? ' skill-selected' : ''}" data-idx="${i}" style="
            padding:8px 12px;border:1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'};
            border-radius:4px;margin-bottom:4px;cursor:pointer;
            background:${isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)'}
          ">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span>
                <span style="color:var(--text-dim);min-width:20px;display:inline-block">${i + 1}.</span>
                <span style="font-weight:bold">${def.name}</span>
                <span style="font-size:11px;color:var(--accent2);margin-left:4px">Lv.${level}</span>
              </span>
              <span style="font-size:11px;color:var(--text-dim)">[${typeLabel}] ${elemLabel} MP${def.mpCost}${tpLabel}</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
              ${def.description}
              ${nextThreshold >= 0 ? ` | 사용: ${usage}/${nextThreshold}` : ' | MAX'}
            </div>
          </div>
        `;
      }
    }

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>스킬 관리</h2>
      <p class="levelup-subtitle">습득 스킬: ${totalSkills}개 (위쪽 스킬이 전투에서 우선 출현)</p>
      <div class="skill-list" style="display:flex;flex-direction:column;gap:2px;margin:8px 0;max-height:60vh;overflow-y:auto">
        ${listHtml}
      </div>
      ${totalSkills > 1 ? `
        <div style="display:flex;gap:8px;justify-content:center;margin-top:8px">
          <button class="btn" data-action="up" ${selectedIdx <= 0 ? 'disabled' : ''}>↑ 위로 [U]</button>
          <button class="btn" data-action="down" ${selectedIdx >= totalSkills - 1 ? 'disabled' : ''}>↓ 아래로 [D]</button>
        </div>
      ` : ''}
      <p class="hint">↑↓=선택, U=위로, D=아래로, Esc=닫기</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);

    wrap.querySelectorAll<HTMLDivElement>('[data-idx]').forEach(row => {
      row.addEventListener('click', () => {
        selectedIdx = parseInt(row.dataset.idx!, 10);
        render(el);
      });
    });

    wrap.querySelector('[data-action="up"]')?.addEventListener('click', () => {
      moveSkill(-1, el);
    });
    wrap.querySelector('[data-action="down"]')?.addEventListener('click', () => {
      moveSkill(1, el);
    });

    el.appendChild(wrap);
  }

  function moveSkill(dir: number, el: HTMLElement) {
    const skills = p.skillOrder;
    const newIdx = selectedIdx + dir;
    if (newIdx < 0 || newIdx >= skills.length) return;

    // 스왑
    const temp = skills[selectedIdx];
    skills[selectedIdx] = skills[newIdx];
    skills[newIdx] = temp;
    selectedIdx = newIdx;
    render(el);
  }

  return {
    id: 'skill-manage',
    render,
    onKey(key) {
      const container = document.querySelector('.skill-manage-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') { onDone(); return; }

      const skills = p.skillOrder;
      if (skills.length === 0) return;

      if (key === 'ArrowUp' || key === 'k') {
        if (selectedIdx > 0) { selectedIdx--; render(container); }
      } else if (key === 'ArrowDown' || key === 'j') {
        if (selectedIdx < skills.length - 1) { selectedIdx++; render(container); }
      } else if (key === 'u' || key === 'U') {
        moveSkill(-1, container);
      } else if (key === 'd' || key === 'D') {
        moveSkill(1, container);
      } else if (/^[1-9]$/.test(key)) {
        const idx = parseInt(key, 10) - 1;
        if (idx < skills.length) {
          selectedIdx = idx;
          render(container);
        }
      }
    },
  };
}
