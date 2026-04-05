// character-select.ts — 캐릭터 선택 화면
// 원본: CharacterCreation.cpp ShowCharacterSelect — 기존 캐릭터 + 탄생 + 커스텀 + 삭제

import type { Screen } from '../screen-manager';
import { Actor } from '../../models/actor';
import { raceName, spiritRoleName } from '../../types/enums';
import { locationName } from '../../types/registry';

// 기본 NPC 수 (삭제 불가)
export function createCharacterSelectScreen(
  actors: Actor[],
  onSelect: (index: number) => void,
  onBirth: () => void,
  onCustom: () => void,
  onBack: () => void,
): Screen {
  let cursor = 0;

  function getPlayable() {
    return actors
      .map((a, i) => ({ actor: a, idx: i }))
      .filter(x => x.actor.playable);
  }

  function renderList(el: HTMLElement) {
    const playable = getPlayable();
    el.innerHTML = `
      <div class="screen select-screen">
        <h2>플레이할 캐릭터를 선택하세요</h2>
        <div class="char-list">
          ${playable.map((p, i) => `
            <button class="btn char-btn ${i === cursor ? 'active' : ''}" data-idx="${i}">
              <span class="char-name">${p.actor.name}${p.actor.isCustom ? ' ★' : ''}</span>
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
        <p class="hint">↑↓ 이동 · Enter 선택 · b 탄생 · 0 커스텀 · Esc 뒤로</p>
      </div>`;

    el.querySelectorAll<HTMLButtonElement>('.char-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        cursor = parseInt(btn.dataset.idx!, 10);
        const playableNow = getPlayable();
        if (cursor < playableNow.length) onSelect(playableNow[cursor].idx);
      });
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
      if (key === 'ArrowUp' || key === 'w') {
        cursor = (cursor - 1 + playable.length) % playable.length;
        const c = document.querySelector('.select-screen')?.parentElement;
        if (c instanceof HTMLElement) renderList(c);
      } else if (key === 'ArrowDown' || key === 's') {
        cursor = (cursor + 1) % playable.length;
        const c = document.querySelector('.select-screen')?.parentElement;
        if (c instanceof HTMLElement) renderList(c);
      } else if (key === 'Enter') {
        if (cursor < playable.length) onSelect(playable[cursor].idx);
      } else if (key === 'Escape') {
        onBack();
      } else if (key === 'b' || key === 'B') {
        onBirth();
      } else if (key === '0') {
        onCustom();
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
