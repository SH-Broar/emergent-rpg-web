// level-up.ts — 레벨업 화면 (스탯 → 컬러 → 스킬)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { elementName, Element, ELEMENT_COUNT } from '../../types/enums';
import { SkillDef, skillTypeName, skillElementName } from '../../models/skill';
import { getLearnableSkills, learnSkill } from '../../systems/skill-learning';

export function createLevelUpScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let statPoints = 3;
  let colorPoints = 2;
  let phase: 'stat' | 'color' | 'skill' | 'done' = 'stat';

  const statAlloc = { hp: 0, attack: 0, defense: 0 };

  // 스킬 선택 상태
  let learnableSkills: SkillDef[] = [];
  let skillPage = 0;
  const SKILLS_PER_PAGE = 6;

  function renderStat(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen levelup-screen';

    wrap.innerHTML = `
      <h2>레벨 업! Lv.${p.base.level}</h2>
      <p class="levelup-subtitle">스탯 포인트 배분 (남은: ${statPoints})</p>
      <div class="levelup-stats">
        <div class="levelup-row">
          <span>HP (${Math.round(p.base.maxHp)} +${statAlloc.hp * 10})</span>
          <button class="btn action-button" data-stat="hp" ${statPoints <= 0 ? 'disabled' : ''}>
            <span class="action-label">+HP</span>
            <span class="key-hint">[1]</span>
          </button>
        </div>
        <div class="levelup-row">
          <span>공격 (${p.base.attack.toFixed(1)} +${statAlloc.attack * 2})</span>
          <button class="btn action-button" data-stat="attack" ${statPoints <= 0 ? 'disabled' : ''}>
            <span class="action-label">+공격</span>
            <span class="key-hint">[2]</span>
          </button>
        </div>
        <div class="levelup-row">
          <span>방어 (${p.base.defense.toFixed(1)} +${statAlloc.defense * 1})</span>
          <button class="btn action-button" data-stat="defense" ${statPoints <= 0 ? 'disabled' : ''}>
            <span class="action-label">+방어</span>
            <span class="key-hint">[3]</span>
          </button>
        </div>
      </div>
      ${statPoints <= 0
        ? `<button class="btn btn-primary levelup-confirm" data-confirm>확인 [Enter]</button>`
        : '<p class="hint">1=HP 2=공격 3=방어</p>'
      }
    `;

    wrap.querySelectorAll<HTMLButtonElement>('[data-stat]').forEach(btn => {
      btn.addEventListener('click', () => {
        allocStat(btn.dataset.stat as 'hp' | 'attack' | 'defense', el);
      });
    });

    wrap.querySelector('[data-confirm]')?.addEventListener('click', () => {
      applyStat();
      if (colorPoints > 0) {
        phase = 'color';
        renderColor(el);
      } else {
        trySkillPhase(el);
      }
    });

    el.appendChild(wrap);
  }

  function allocStat(stat: 'hp' | 'attack' | 'defense', el: HTMLElement) {
    if (statPoints <= 0) return;
    statAlloc[stat]++;
    statPoints--;
    renderStat(el);
  }

  function applyStat() {
    p.base.maxHp += statAlloc.hp * 10;
    p.base.hp = Math.min(p.base.hp + statAlloc.hp * 10, p.getEffectiveMaxHp());
    p.base.attack += statAlloc.attack * 2;
    p.base.defense += statAlloc.defense * 1;
    session.backlog.add(
      session.gameTime,
      `${p.name} 레벨업! HP+${statAlloc.hp * 10}, 공격+${statAlloc.attack * 2}, 방어+${statAlloc.defense}`,
      '시스템',
    );
  }

  function renderColor(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen levelup-screen';

    let buttonsHtml = '';
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      const val = p.color.values[i];
      buttonsHtml += `
        <button class="btn levelup-color-btn" data-el="${i}" ${colorPoints <= 0 ? 'disabled' : ''}>
          <span style="color:var(--el-${i})">${elementName(i as Element)}</span>
          <span>${(val ?? 0.5).toFixed(2)}</span>
          <span class="key-hint">[${i + 1}]</span>
        </button>
      `;
    }

    wrap.innerHTML = `
      <h2>컬러 포인트 배분</h2>
      <p class="levelup-subtitle">남은 포인트: ${colorPoints}</p>
      <div class="levelup-colors">${buttonsHtml}</div>
      ${colorPoints <= 0
        ? `<button class="btn btn-primary levelup-confirm" data-confirm>완료 [Enter]</button>`
        : '<p class="hint">1~8 원소 선택</p>'
      }
    `;

    wrap.querySelectorAll<HTMLButtonElement>('[data-el]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.el!, 10);
        allocColor(idx, el);
      });
    });

    wrap.querySelector('[data-confirm]')?.addEventListener('click', () => {
      trySkillPhase(el);
    });

    el.appendChild(wrap);
  }

  function allocColor(elementIdx: number, el: HTMLElement) {
    if (colorPoints <= 0) return;
    if (elementIdx < 0 || elementIdx >= ELEMENT_COUNT) return;
    p.color.values[elementIdx] = Math.min(1.0, (p.color.values[elementIdx] ?? 0.5) + 0.05);
    colorPoints--;
    session.backlog.add(
      session.gameTime,
      `${elementName(elementIdx as Element)} 속성 강화!`,
      '시스템',
    );
    renderColor(el);
  }

  function trySkillPhase(el: HTMLElement) {
    learnableSkills = getLearnableSkills(p);
    if (learnableSkills.length > 0) {
      phase = 'skill';
      skillPage = 0;
      renderSkill(el);
    } else {
      phase = 'done';
      onDone();
    }
  }

  function renderSkill(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen levelup-screen';

    const totalPages = Math.max(1, Math.ceil(learnableSkills.length / SKILLS_PER_PAGE));
    const start = skillPage * SKILLS_PER_PAGE;
    const pageSkills = learnableSkills.slice(start, start + SKILLS_PER_PAGE);

    let skillsHtml = '';
    for (let i = 0; i < pageSkills.length; i++) {
      const s = pageSkills[i];
      const typeLabel = skillTypeName(s.type);
      const elemLabel = skillElementName(s.element);
      const costLabel = s.tpCost > 0 ? `MP${s.mpCost} TP${s.tpCost}` : `MP${s.mpCost}`;
      skillsHtml += `
        <button class="btn skill-learn-btn" data-learn="${start + i}" style="text-align:left;padding:8px 12px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:bold">${i + 1}. ${s.name}</span>
            <span style="font-size:11px;color:var(--text-dim)">[${typeLabel}] ${elemLabel} ${costLabel}</span>
          </div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:2px">${s.description}</div>
        </button>
      `;
    }

    wrap.innerHTML = `
      <h2>새 스킬 습득</h2>
      <p class="levelup-subtitle">배울 수 있는 스킬 (${learnableSkills.length}개) — 1개를 선택하세요</p>
      <div class="skill-learn-list" style="display:flex;flex-direction:column;gap:6px;margin:8px 0">
        ${skillsHtml}
      </div>
      ${totalPages > 1 ? `<div style="text-align:center;font-size:12px;color:var(--text-dim);margin:4px 0">${skillPage + 1}/${totalPages} 페이지 (←→ 이동)</div>` : ''}
      <button class="btn levelup-confirm" data-skip style="margin-top:8px">건너뛰기 [0]</button>
      <p class="hint">1~${pageSkills.length} 선택, 0=건너뛰기${totalPages > 1 ? ', ←→=페이지' : ''}</p>
    `;

    wrap.querySelectorAll<HTMLButtonElement>('[data-learn]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.learn!, 10);
        selectSkill(idx, el);
      });
    });

    wrap.querySelector('[data-skip]')?.addEventListener('click', () => {
      phase = 'done';
      onDone();
    });

    el.appendChild(wrap);
  }

  function selectSkill(index: number, _el: HTMLElement) {
    const skill = learnableSkills[index];
    if (!skill) return;
    if (learnSkill(p, skill.id)) {
      session.backlog.add(
        session.gameTime,
        `${p.name}이(가) ${skill.name}을(를) 습득했다!`,
        '시스템',
      );
    }
    phase = 'done';
    onDone();
  }

  return {
    id: 'level-up',
    render(el) {
      if (phase === 'color') renderColor(el);
      else if (phase === 'skill') renderSkill(el);
      else renderStat(el);
    },
    onKey(key) {
      const container = document.querySelector('.levelup-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (phase === 'stat') {
        if (key === '1') allocStat('hp', container);
        else if (key === '2') allocStat('attack', container);
        else if (key === '3') allocStat('defense', container);
        else if (key === 'Enter' && statPoints <= 0) {
          applyStat();
          if (colorPoints > 0) {
            phase = 'color';
            renderColor(container);
          } else {
            trySkillPhase(container);
          }
        }
      } else if (phase === 'color') {
        if (/^[1-8]$/.test(key)) {
          allocColor(parseInt(key, 10) - 1, container);
        } else if (key === 'Enter' && colorPoints <= 0) {
          trySkillPhase(container);
        }
      } else if (phase === 'skill') {
        if (key === '0') {
          phase = 'done';
          onDone();
        } else if (/^[1-9]$/.test(key)) {
          const idx = skillPage * SKILLS_PER_PAGE + parseInt(key, 10) - 1;
          if (idx < learnableSkills.length) {
            selectSkill(idx, container);
          }
        } else if (key === 'ArrowRight' || key === 'ArrowDown') {
          const totalPages = Math.ceil(learnableSkills.length / SKILLS_PER_PAGE);
          if (skillPage < totalPages - 1) {
            skillPage++;
            renderSkill(container);
          }
        } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
          if (skillPage > 0) {
            skillPage--;
            renderSkill(container);
          }
        }
      }
    },
  };
}
