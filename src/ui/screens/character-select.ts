// character-select.ts — 캐릭터 선택 화면
// 원본: CharacterCreation.cpp ShowCharacterSelect — 기존 캐릭터 + 탄생 + 커스텀 + 삭제

import type { Screen } from '../screen-manager';
import { Actor } from '../../models/actor';
import { raceName, spiritRoleName } from '../../types/enums';
import { locationName } from '../../types/registry';
export interface CharSelectOptions {
  /** true이면 하코만 표시하고 탄생/커스텀 버튼을 숨긴다 (최초 플레이) */
  isFirstPlay?: boolean;
  /** 활성화된 RDC팩에서 추가된 플레이어블 캐릭터 이름 집합 */
  extraPlayableNames?: Set<string>;
}

export function createCharacterSelectScreen(
  actors: Actor[],
  onSelect: (index: number) => void,
  onBirth: () => void,
  onCustom: () => void,
  onBack: () => void,
  options: CharSelectOptions = {},
): Screen {
  let cursor = 0;

  function getPlayable() {
    return actors
      .map((a, i) => ({ actor: a, idx: i }))
      .filter(x => x.actor.playable || (options.extraPlayableNames?.has(x.actor.name) ?? false))
      .filter(x => !options.isFirstPlay || x.actor.name === '하코');
  }

  function renderList(el: HTMLElement) {
    const playable = getPlayable();
    if (cursor >= playable.length) cursor = Math.max(0, playable.length - 1);
    el.innerHTML = `
      <div class="screen select-screen">
        <h2>플레이할 캐릭터를 선택하세요</h2>
        <div class="char-list">
          ${playable.length === 0
            ? `<p style="color:var(--text-dim);text-align:center;padding:16px">캐릭터가 없습니다.</p>`
            : playable.map((p, i) => `
            <button class="btn char-btn ${i === cursor ? 'active' : ''}" data-idx="${i}">
              <span class="char-name">${p.actor.name}${p.actor.isCustom ? ' ★' : ''}</span>
              <span class="char-info">${raceName(p.actor.base.race)} · ${spiritRoleName(p.actor.spirit.role)} — ${locationName(p.actor.currentLocation)}</span>
            </button>
          `).join('')}
        </div>
        ${options.isFirstPlay ? `
        <p style="text-align:center;color:var(--text-dim);font-size:12px;margin-top:8px">
          첫 번째 이야기는 하코의 모험으로 시작됩니다.
        </p>` : `
        <div class="menu-buttons" style="margin-top:8px">
          <button class="btn" data-action="birth">탄생 — 빈 영혼으로 세계에 태어나기</button>
          <button class="btn" data-action="custom">나만의 캐릭터 만들기</button>
        </div>`}
        <div class="menu-buttons" style="margin-top:8px">
          <button class="btn" data-action="back">뒤로 [Esc]</button>
          <button class="btn btn-primary" data-action="confirm">선택 [Enter]</button>
        </div>
        <p class="hint">${options.isFirstPlay
          ? '↑↓ 이동 · Enter 선택 · Esc 뒤로'
          : '↑↓ 이동 · Enter 선택 · b 탄생 · 0 커스텀 · Esc 뒤로'}</p>
      </div>`;

    el.querySelectorAll<HTMLButtonElement>('.char-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        cursor = parseInt(btn.dataset.idx!, 10);
        const playableNow = getPlayable();
        if (cursor < playableNow.length) onSelect(playableNow[cursor].idx);
      });
    });
    if (!options.isFirstPlay) {
      el.querySelector('[data-action="birth"]')?.addEventListener('click', onBirth);
      el.querySelector('[data-action="custom"]')?.addEventListener('click', onCustom);
    }
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
      } else if ((key === 'b' || key === 'B') && !options.isFirstPlay) {
        onBirth();
      } else if (key === '0' && !options.isFirstPlay) {
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
