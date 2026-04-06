// lore.ts — 로어 화면 (카테고리 탭 + 카드 그리드)

import type { Screen } from '../screen-manager';
import type { DataSection } from '../../data/parser';

type LoreCategory = '세계관' | '시스템' | '장소' | '사람들';

const CATEGORIES: LoreCategory[] = ['세계관', '시스템', '장소', '사람들'];

const CATEGORY_PREFIX: Record<LoreCategory, string> = {
  '세계관': '[1]',
  '시스템': '[2]',
  '장소':   '[3]',
  '사람들': '[4]',
};

function getCategory(name: string): LoreCategory {
  if (name === '엘리메스의 세계') return '세계관';
  if (/사람들/.test(name)) return '사람들';
  if (/종족|역할|세계의 구조|정령과 신|마왕|넓은 세계/.test(name)) return '세계관';
  if (/컬러|매트릭스|계절|날씨|시간의 흐름|인식과 정보|지역 활동|평판|선물|칭호|히페리온|동료|스킬|제작|퀘스트/.test(name)) return '시스템';
  return '장소';
}

function getPreview(section: DataSection): string {
  const lines = section.rawLines.length > 0
    ? section.rawLines
    : [...section.values.values()];
  // 비어있지 않은 첫 줄 찾기
  const first = lines.find(l => l.trim().length > 0) ?? '';
  return first.length > 48 ? first.substring(0, 48) + '…' : first;
}

export function createLoreScreen(
  loreData: DataSection[],
  onDone: () => void,
): Screen {
  let activeCategory: LoreCategory = '세계관';
  let openIdx = -1; // -1 = 목차

  // ---------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------

  function filteredSections(): DataSection[] {
    return loreData.filter(s => getCategory(s.name) === activeCategory);
  }

  // ---------------------------------------------------------------
  // render
  // ---------------------------------------------------------------

  function render(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen lore-screen';

    if (openIdx === -1) renderIndex(wrap, el);
    else renderDetail(wrap, el);

    el.appendChild(wrap);
  }

  function renderIndex(wrap: HTMLElement, el: HTMLElement): void {
    // 뒤로 버튼
    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.textContent = '\u2190 뒤로 [Esc]';
    backBtn.addEventListener('click', onDone);
    wrap.appendChild(backBtn);

    // 제목
    const title = document.createElement('h2');
    title.className = 'lore-title';
    title.textContent = '로어';
    wrap.appendChild(title);

    // 카테고리 탭 바
    const tabBar = document.createElement('div');
    tabBar.className = 'lore-tab-bar';
    CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'btn lore-tab' + (cat === activeCategory ? ' active' : '');
      btn.textContent = `${CATEGORY_PREFIX[cat]} ${cat}`;
      btn.addEventListener('click', () => {
        activeCategory = cat;
        render(el);
      });
      tabBar.appendChild(btn);
    });
    wrap.appendChild(tabBar);

    // 카드 그리드
    const filtered = filteredSections();
    const grid = document.createElement('div');
    grid.className = 'lore-grid';

    if (filtered.length === 0) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '내용이 없습니다.';
      grid.appendChild(p);
    } else {
      filtered.forEach(section => {
        const globalIdx = loreData.indexOf(section);
        const card = document.createElement('button');
        card.className = 'btn lore-card';
        const preview = getPreview(section);
        const titleEl = document.createElement('span');
        titleEl.className = 'lore-card-title';
        titleEl.textContent = section.name;
        const previewEl = document.createElement('span');
        previewEl.className = 'lore-card-preview';
        previewEl.textContent = preview;
        card.appendChild(titleEl);
        card.appendChild(previewEl);
        card.addEventListener('click', () => {
          openIdx = globalIdx;
          render(el);
        });
        grid.appendChild(card);
      });
    }
    wrap.appendChild(grid);

    // 힌트
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '1~4 카테고리 전환 · Esc 뒤로';
    wrap.appendChild(hint);
  }

  function renderDetail(wrap: HTMLElement, el: HTMLElement): void {
    const section = loreData[openIdx];

    // 뒤로 버튼
    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.textContent = '\u2190 목차로 [Esc]';
    backBtn.addEventListener('click', () => {
      openIdx = -1;
      render(el);
    });
    wrap.appendChild(backBtn);

    // 섹션 제목 + 카테고리 뱃지
    const header = document.createElement('div');
    header.className = 'lore-detail-header';

    const h2 = document.createElement('h2');
    h2.textContent = section.name;
    header.appendChild(h2);

    const badge = document.createElement('span');
    badge.className = 'lore-badge';
    badge.textContent = getCategory(section.name);
    header.appendChild(badge);

    wrap.appendChild(header);

    // 본문
    const content = document.createElement('div');
    content.className = 'text-display lore-content';

    const lines = section.rawLines.length > 0
      ? section.rawLines
      : [...section.values.values()].map(v => v.replace(/\|/g, '\n'));

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        const spacer = document.createElement('div');
        spacer.className = 'lore-spacer';
        content.appendChild(spacer);
      } else {
        const p = document.createElement('p');
        p.className = 'lore-line' + (line.startsWith('  ') ? ' lore-line-indent' : '');
        p.textContent = trimmed;
        content.appendChild(p);
      }
    }

    wrap.appendChild(content);

    // 이전/다음 탐색 (같은 카테고리 내)
    const filtered = filteredSections();
    const catIdx = filtered.indexOf(section);

    if (filtered.length > 1) {
      const nav = document.createElement('div');
      nav.className = 'lore-nav';

      if (catIdx > 0) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn lore-nav-btn';
        prevBtn.textContent = '\u2190 ' + filtered[catIdx - 1].name;
        prevBtn.addEventListener('click', () => {
          openIdx = loreData.indexOf(filtered[catIdx - 1]);
          render(el);
        });
        nav.appendChild(prevBtn);
      } else {
        const spacer = document.createElement('span');
        nav.appendChild(spacer);
      }

      if (catIdx < filtered.length - 1) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn lore-nav-btn lore-nav-next';
        nextBtn.textContent = filtered[catIdx + 1].name + ' \u2192';
        nextBtn.addEventListener('click', () => {
          openIdx = loreData.indexOf(filtered[catIdx + 1]);
          render(el);
        });
        nav.appendChild(nextBtn);
      }

      wrap.appendChild(nav);
    }
  }

  // ---------------------------------------------------------------
  // key handler
  // ---------------------------------------------------------------

  return {
    id: 'lore',
    render,
    onKey(key: string) {
      const el = document.querySelector('.lore-screen')?.parentElement;
      if (!(el instanceof HTMLElement)) return;

      if (key === 'Escape') {
        if (openIdx === -1) onDone();
        else { openIdx = -1; render(el); }
        return;
      }

      if (openIdx === -1 && /^[1-4]$/.test(key)) {
        activeCategory = CATEGORIES[parseInt(key, 10) - 1];
        render(el);
      }
    },
  };
}
