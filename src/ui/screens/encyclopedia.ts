// encyclopedia.ts — 도감 화면
// 아이템, 몬스터, NPC, 장소 4개 탭

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { getAllItemDefs, categoryName, RARITY_NAMES, RARITY_COLORS, type ItemDef, type ItemRarity } from '../../types/item-defs';
import { locationName } from '../../types/registry';

type Tab = 'items' | 'monsters' | 'npcs' | 'locations';

const TAB_LABELS: Record<Tab, string> = {
  items: '아이템',
  monsters: '몬스터',
  npcs: 'NPC',
  locations: '장소',
};

const TAB_KEYS: Tab[] = ['items', 'monsters', 'npcs', 'locations'];

export function createEncyclopediaScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  let activeTab: Tab = 'items';
  let selectedIdx = 0;
  let savedScrollTop = 0;

  // ----------------------------------------------------------------
  // helpers
  // ----------------------------------------------------------------

  function isItemDiscovered(id: string): boolean {
    const disc = (session.knowledge as any).discoveredItems as Set<string> | undefined;
    if (disc) return disc.has(id);
    // fallback: items currently in player inventory count as discovered
    return session.player?.items.has(id) ?? false;
  }

  function getSortedItems(): ItemDef[] {
    const all = Array.from(getAllItemDefs().values());
    const rarityOrder: Record<string, number> = {
      common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, unique: 5,
    };
    return all.sort((a, b) => {
      if (a.category !== b.category) return a.category - b.category;
      return (rarityOrder[a.rarity] ?? 0) - (rarityOrder[b.rarity] ?? 0);
    });
  }

  // ----------------------------------------------------------------
  // render helpers
  // ----------------------------------------------------------------

  function renderTabButtons(wrap: HTMLElement, currentEl: HTMLElement): void {
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;';
    TAB_KEYS.forEach((tab, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn' + (tab === activeTab ? ' active' : '');
      btn.style.cssText = 'min-height:36px;padding:4px 12px;' +
        (tab === activeTab ? 'background:var(--accent,#4ecca3);color:#111;font-weight:bold;' : '');
      btn.textContent = `[${i + 1}] ${TAB_LABELS[tab]}`;
      btn.addEventListener('click', () => {
        activeTab = tab;
        selectedIdx = 0;
        render(currentEl);
      });
      tabBar.appendChild(btn);
    });
    wrap.appendChild(tabBar);
  }

  function renderItemsTab(wrap: HTMLElement): void {
    const items = getSortedItems();
    if (items.length === 0) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '등록된 아이템이 없습니다.';
      wrap.appendChild(p);
      return;
    }

    const list = document.createElement('div');
    list.className = 'npc-list';
    list.style.cssText = 'max-height:45vh;overflow-y:auto;';

    items.forEach((item, i) => {
      const discovered = isItemDiscovered(item.id);
      const row = document.createElement('div');
      row.className = 'npc-item' + (i === selectedIdx ? ' active' : '');
      row.style.cursor = 'pointer';
      if (i === selectedIdx) row.style.background = 'rgba(78,204,163,0.15)';

      if (!discovered) {
        row.innerHTML = `<span class="npc-name" style="color:#666">???</span>
          <span class="npc-detail" style="color:#555">${categoryName(item.category)}</span>`;
      } else {
        const rarityColor = RARITY_COLORS[item.rarity as ItemRarity] ?? '#aaa';
        row.innerHTML = `
          <span class="npc-name">${item.name}</span>
          <span class="npc-detail">
            <span style="color:${rarityColor}">${RARITY_NAMES[item.rarity as ItemRarity]}</span>
            · ${categoryName(item.category)}
            · ${item.price}G
          </span>`;
      }
      row.addEventListener('click', () => { selectedIdx = i; render(wrap.parentElement!); });
      list.appendChild(row);
    });
    wrap.appendChild(list);

    // detail panel
    const sel = items[selectedIdx];
    if (sel && isItemDiscovered(sel.id)) {
      const detail = document.createElement('div');
      detail.style.cssText = 'margin-top:12px;padding:10px;border:1px solid #333;border-radius:4px;';
      const rarityColor = RARITY_COLORS[sel.rarity as ItemRarity] ?? '#aaa';
      let html = `<p><strong>${sel.name}</strong>
        <span style="color:${rarityColor}"> [${RARITY_NAMES[sel.rarity as ItemRarity]}]</span></p>`;
      if (sel.description) html += `<p style="color:var(--text-dim,#888);font-size:13px">${sel.description}</p>`;
      html += `<p style="font-size:13px">분류: ${categoryName(sel.category)} · 가격: ${sel.price}G</p>`;
      if (sel.tags) html += `<p style="font-size:12px;color:#777">태그: ${sel.tags}</p>`;
      if (sel.source) html += `<p style="font-size:12px;color:#777">획득처: ${sel.source}</p>`;
      if (sel.equipSlot !== 'none') {
        html += `<p style="font-size:13px">장비 슬롯: ${sel.equipSlot}`;
        if (sel.equipAttack) html += ` | 공격+${sel.equipAttack}`;
        if (sel.equipDefense) html += ` | 방어+${sel.equipDefense}`;
        if (sel.equipMagic) html += ` | 마력+${sel.equipMagic}`;
        html += `</p>`;
      }
      if (sel.eatVigor || sel.eatHp || sel.eatMp) {
        html += `<p style="font-size:13px">섭취 효과:`;
        if (sel.eatVigor) html += ` 기력+${sel.eatVigor}`;
        if (sel.eatHp) html += ` HP+${sel.eatHp}`;
        if (sel.eatMp) html += ` MP+${sel.eatMp}`;
        html += `</p>`;
      }
      detail.innerHTML = html;
      wrap.appendChild(detail);
    }
  }

  function renderMonstersTab(wrap: HTMLElement): void {
    const dungeons = session.dungeonSystem.getAllDungeons();
    // collect unique monsters across all dungeons
    const seen = new Set<string>();
    const monsterEntries: Array<{ id: string; name: string; hp: number; attack: number; defense: number; dungeon: string }> = [];

    for (const d of dungeons) {
      for (const eid of d.enemyIds) {
        if (seen.has(eid)) continue;
        seen.add(eid);
        const m = (session.dungeonSystem as any).monsters?.get(eid) as
          { id: string; name: string; hp: number; attack: number; defense: number } | undefined;
        monsterEntries.push({
          id: eid,
          name: m?.name ?? eid,
          hp: m?.hp ?? 0,
          attack: m?.attack ?? 0,
          defense: m?.defense ?? 0,
          dungeon: d.name,
        });
      }
    }

    if (monsterEntries.length === 0) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '등록된 몬스터가 없습니다.';
      wrap.appendChild(p);
      return;
    }

    const list = document.createElement('div');
    list.className = 'npc-list';
    list.style.cssText = 'max-height:55vh;overflow-y:auto;';

    monsterEntries.forEach((m, i) => {
      const known = session.knowledge.monsterTypesKilled.has(m.id) ||
        session.knowledge.monsterTypesKilled.has(m.name);
      const row = document.createElement('div');
      row.className = 'npc-item' + (i === selectedIdx ? ' active' : '');
      if (i === selectedIdx) row.style.background = 'rgba(78,204,163,0.15)';

      if (!known) {
        row.innerHTML = `<span class="npc-name" style="color:#666">???</span>
          <span class="npc-detail" style="color:#555">${m.dungeon}</span>`;
      } else {
        row.innerHTML = `
          <span class="npc-name">${m.name}</span>
          <span class="npc-detail">HP ${m.hp} · 공격 ${m.attack} · 방어 ${m.defense} · ${m.dungeon}</span>`;
      }
      row.addEventListener('click', () => { selectedIdx = i; render(wrap.parentElement!); });
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  function renderNpcsTab(wrap: HTMLElement): void {
    const knownNames = session.knowledge.knownActorNames;
    const npcs = session.actors.filter(a =>
      a !== session.player && knownNames.has(a.name)
    );

    if (npcs.length === 0) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '아직 만난 NPC가 없습니다.';
      wrap.appendChild(p);
      return;
    }

    const list = document.createElement('div');
    list.className = 'npc-list';
    list.style.cssText = 'max-height:55vh;overflow-y:auto;';

    npcs.forEach((npc, i) => {
      const row = document.createElement('div');
      row.className = 'npc-item' + (i === selectedIdx ? ' active' : '');
      if (i === selectedIdx) row.style.background = 'rgba(78,204,163,0.15)';
      const stars = '★'.repeat(npc.hyperionLevel) + '☆'.repeat(Math.max(0, 5 - npc.hyperionLevel));
      row.innerHTML = `
        <span class="npc-name">${npc.name}</span>
        <span class="npc-detail">${npc.base.race} · ${npc.spirit.role} · ${locationName(npc.homeLocation)} · ${stars}</span>`;
      row.addEventListener('click', () => { selectedIdx = i; render(wrap.parentElement!); });
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  function renderLocationsTab(wrap: HTMLElement): void {
    const allLocs = Array.from(session.world.getAllLocations().entries());
    const visited = session.knowledge.visitedLocations;

    if (allLocs.length === 0) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '등록된 장소가 없습니다.';
      wrap.appendChild(p);
      return;
    }

    const list = document.createElement('div');
    list.className = 'npc-list';
    list.style.cssText = 'max-height:40vh;overflow-y:auto;';

    allLocs.forEach(([id, locData], i) => {
      const isVisited = visited.has(id);
      const row = document.createElement('div');
      row.className = 'npc-item' + (i === selectedIdx ? ' active' : '');
      row.style.cursor = 'pointer';
      if (i === selectedIdx) row.style.background = 'rgba(78,204,163,0.15)';

      if (!isVisited) {
        row.innerHTML = `<span class="npc-name" style="color:#666">???</span>`;
      } else {
        row.innerHTML = `
          <span class="npc-name">${locationName(id)}</span>
          <span class="npc-detail" style="color:#888;font-size:12px">${locData.description || ''}</span>`;
      }
      row.addEventListener('click', () => { selectedIdx = i; render(wrap.parentElement!); });
      list.appendChild(row);
    });
    wrap.appendChild(list);

    // detail for selected visited location
    const [selId, selData] = allLocs[selectedIdx] ?? [];
    if (selId && visited.has(selId)) {
      const dungeons = session.dungeonSystem.getAllDungeons()
        .filter(d => d.accessFrom === selId)
        .map(d => d.name);

      const detail = document.createElement('div');
      detail.style.cssText = 'margin-top:10px;padding:10px;border:1px solid #333;border-radius:4px;font-size:13px;';
      let html = `<p><strong>${locationName(selId)}</strong></p>`;
      if (selData.description) html += `<p style="color:var(--text-dim,#888)">${selData.description}</p>`;
      if (dungeons.length > 0) html += `<p>연결 던전: ${dungeons.join(', ')}</p>`;
      detail.innerHTML = html;
      wrap.appendChild(detail);
    }
  }

  // ----------------------------------------------------------------
  // main render
  // ----------------------------------------------------------------

  function render(el: HTMLElement): void {
    // 스크롤 위치 저장
    const prevList = el.querySelector('.npc-list') as HTMLElement | null;
    if (prevList) savedScrollTop = prevList.scrollTop;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen encyclopedia-screen';

    // back button
    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.dataset.back = '';
    backBtn.textContent = '\u2190 뒤로 [Esc]';
    backBtn.style.minHeight = '44px';
    backBtn.addEventListener('click', onDone);
    wrap.appendChild(backBtn);

    // title
    const title = document.createElement('h2');
    title.textContent = '도감';
    wrap.appendChild(title);

    // tab buttons
    renderTabButtons(wrap, el);

    // tab content
    switch (activeTab) {
      case 'items':     renderItemsTab(wrap); break;
      case 'monsters':  renderMonstersTab(wrap); break;
      case 'npcs':      renderNpcsTab(wrap); break;
      case 'locations': renderLocationsTab(wrap); break;
    }

    // hint
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '1~4 탭 전환, ↑↓ 선택, Esc 뒤로';
    wrap.appendChild(hint);

    el.appendChild(wrap);

    // 스크롤 위치 복원
    requestAnimationFrame(() => {
      const list = el.querySelector('.npc-list') as HTMLElement | null;
      if (list && savedScrollTop > 0) list.scrollTop = savedScrollTop;
    });
  }

  // ----------------------------------------------------------------
  // key handler
  // ----------------------------------------------------------------

  function getListLength(): number {
    switch (activeTab) {
      case 'items':     return getSortedItems().length;
      case 'monsters': {
        let count = 0;
        const seen = new Set<string>();
        for (const d of session.dungeonSystem.getAllDungeons())
          for (const eid of d.enemyIds) { if (!seen.has(eid)) { seen.add(eid); count++; } }
        return count;
      }
      case 'npcs':
        return session.actors.filter(a =>
          a !== session.player && session.knowledge.knownActorNames.has(a.name)
        ).length;
      case 'locations':
        return session.world.getAllLocations().size;
    }
  }

  return {
    id: 'encyclopedia',
    render,
    onKey(key: string) {
      const container = document.querySelector('.encyclopedia-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') { onDone(); return; }

      if (/^[1-4]$/.test(key)) {
        activeTab = TAB_KEYS[parseInt(key, 10) - 1];
        selectedIdx = 0;
        render(container);
        return;
      }

      const len = getListLength();
      if (key === 'ArrowUp' || key === 'ArrowLeft') {
        selectedIdx = Math.max(0, selectedIdx - 1);
        render(container);
      } else if (key === 'ArrowDown' || key === 'ArrowRight') {
        selectedIdx = Math.min(len - 1, selectedIdx + 1);
        render(container);
      }
    },
  };
}
