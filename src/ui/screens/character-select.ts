// character-select.ts — 캐릭터 선택 화면
// 원본: CharacterCreation.cpp ShowCharacterSelect — 기존 캐릭터 + 탄생 + 커스텀 + 삭제

import type { Screen } from '../screen-manager';
import { Actor } from '../../models/actor';
import { raceName, spiritRoleName } from '../../types/enums';
import { locationName } from '../../types/registry';
import { getHyperionEntry } from '../../systems/hyperion';

// 기본 NPC 수 (삭제 불가)
export function createCharacterSelectScreen(
  actors: Actor[],
  onSelect: (index: number) => void,
  onBirth: () => void,
  onCustom: () => void,
  onBack: () => void,
): Screen {
  let cursor = 0;
  let hyperionOnly = false;

  function getPlayable() {
    return actors
      .map((a, i) => ({ actor: a, idx: i }))
      .filter(x => x.actor.playable)
      .filter(x => !hyperionOnly || getHyperionEntry(x.actor.name) !== undefined);
  }

  function renderList(el: HTMLElement) {
    const playable = getPlayable();
    if (cursor >= playable.length) cursor = Math.max(0, playable.length - 1);
    el.innerHTML = `
      <div class="screen select-screen">
        <h2>플레이할 캐릭터를 선택하세요</h2>
        <div style="display:flex;justify-content:flex-end;margin-bottom:6px">
          <button class="btn" data-action="toggle-hyperion" style="font-size:11px;padding:3px 10px;border-left:3px solid ${hyperionOnly ? 'var(--success)' : 'var(--border)'}">
            히페리온 보유 [H] ${hyperionOnly ? '✓ ON' : 'OFF'}
          </button>
        </div>
        <div class="char-list">
          ${playable.length === 0
            ? `<p style="color:var(--text-dim);text-align:center;padding:16px">히페리온 보유 캐릭터가 없습니다.</p>`
            : playable.map((p, i) => `
            <button class="btn char-btn ${i === cursor ? 'active' : ''}" data-idx="${i}">
              <span class="char-name">${p.actor.name}${p.actor.isCustom ? ' ★' : ''}${getHyperionEntry(p.actor.name) ? ' <span style="color:var(--success);font-size:10px">히</span>' : ''}</span>
              <span class="char-info">${raceName(p.actor.base.race)} · ${spiritRoleName(p.actor.spirit.role)} — ${locationName(p.actor.currentLocation)}</span>
            </button>
          `).join('')}
        </div>
        <div class="menu-buttons" style="margin-top:8px">
          <button class="btn" data-action="birth">탄생 — 빈 영혼으로 세계에 태어나기</button>
          <button class="btn" data-action="custom">나만의 캐릭터 만들기</button>
        </div>
        <div class="menu-buttons" style="margin-top:8px">
          <button class="btn" data-action="back">뒤로 [Esc]</button>
          <button class="btn btn-primary" data-action="confirm">선택 [Enter]</button>
        </div>
        <p class="hint">↑↓ 이동 · Enter 선택 · b 탄생 · 0 커스텀 · H 히페리온 필터 · Esc 뒤로</p>
      </div>`;

    el.querySelectorAll<HTMLButtonElement>('.char-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        cursor = parseInt(btn.dataset.idx!, 10);
        const playableNow = getPlayable();
        if (cursor < playableNow.length) onSelect(playableNow[cursor].idx);
      });
    });
    el.querySelector('[data-action="toggle-hyperion"]')?.addEventListener('click', () => {
      hyperionOnly = !hyperionOnly;
      cursor = 0;
      renderList(el);
    });
    el.querySelector('[data-action="birth"]')?.addEventListener('click', onBirth);
    el.querySelector('[data-action="custom"]')?.addEventListener('click', onCustom);
    el.querySelector('[data-action="back"]')?.addEventListener('click', onBack);
    el.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
      const playableNow = getPlayable();
      if (cursor < playableNow.length) onSelect(playableNow[cursor].idx);
    });
  }

  return {
    id: 'character-select',
    render: renderList,
    onKey(key) {
      const playable = getPlayable();
      const c = document.querySelector('.select-screen')?.parentElement;
      if (key === 'ArrowUp' || key === 'w') {
        cursor = (cursor - 1 + Math.max(1, playable.length)) % Math.max(1, playable.length);
        if (c instanceof HTMLElement) renderList(c);
      } else if (key === 'ArrowDown' || key === 's') {
        cursor = (cursor + 1) % Math.max(1, playable.length);
        if (c instanceof HTMLElement) renderList(c);
      } else if (key === 'Enter') {
        if (cursor < playable.length) onSelect(playable[cursor].idx);
      } else if (key === 'Escape') {
        onBack();
      } else if (key === 'b' || key === 'B') {
        onBirth();
      } else if (key === '0') {
        onCustom();
      } else if (key === 'h' || key === 'H') {
        hyperionOnly = !hyperionOnly;
        cursor = 0;
        if (c instanceof HTMLElement) renderList(c);
      } else if (/^[1-9]$/.test(key)) {
        const i = parseInt(key, 10) - 1;
        if (i < playable.length) {
          cursor = i;
          onSelect(playable[cursor].idx);
        }
      }
    },
  };
}
