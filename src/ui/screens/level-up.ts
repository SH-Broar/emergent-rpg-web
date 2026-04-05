// level-up.ts — 레벨업 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { elementName, Element, ELEMENT_COUNT } from '../../types/enums';

export function createLevelUpScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let statPoints = 3;
  let colorPoints = 2;
  let phase: 'stat' | 'color' | 'done' = 'stat';

  // 임시 추적용
  const statAlloc = { hp: 0, attack: 0, defense: 0 };

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
        phase = 'done';
        onDone();
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
      phase = 'done';
      onDone();
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

  return {
    id: 'level-up',
    render(el) {
      if (phase === 'color') renderColor(el);
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
            phase = 'done';
            onDone();
          }
        }
      } else if (phase === 'color') {
        if (/^[1-8]$/.test(key)) {
          allocColor(parseInt(key, 10) - 1, container);
        } else if (key === 'Enter' && colorPoints <= 0) {
          phase = 'done';
          onDone();
        }
      }
    },
  };
}
