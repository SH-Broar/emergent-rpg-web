// guild-dungeon.ts — 길드 던전 정보 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';

export function createGuildDungeonScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  const ds = session.dungeonSystem;

  return {
    id: 'guild_dungeon',
    render(el) {
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'screen info-screen';

      const allDungeons = [...ds.getAllDungeons()].sort((a, b) => a.difficulty - b.difficulty);

      const rows = allDungeons.map(d => {
        const progress = p.getDungeonProgress(d.id);
        const isCleared = progress >= 100;
        const best = p.dungeonBestTurns.get(d.id);

        const diffPoints = Math.max(1, Math.min(20, Math.round(d.difficulty * 20)));
        const major = Math.floor(diffPoints / 10);
        const remainder = diffPoints % 10;
        const full = Math.floor(remainder / 2);
        const half = remainder % 2;
        const majorStars = '<span style="color:#ff6b6b;font-weight:700">★</span>'.repeat(major);
        const stars = `${majorStars}${'★'.repeat(full)}${'☆'.repeat(half)}`;

        const ruleLevel = d.rule ? (d.rule.rank <= 2 ? '◆◇◇' : d.rule.rank <= 4 ? '◆◆◇' : '◆◆◆') : '';
        const progressColor = isCleared ? 'var(--success)' : progress > 0 ? 'var(--warning)' : 'var(--text-dim)';
        const progressLabel = isCleared ? '클리어' : progress > 0 ? `${progress}%` : '미탐색';

        return `
          <div style="padding:6px 10px;background:var(--bg-card);border-radius:4px;margin-bottom:4px;${isCleared ? 'border-left:3px solid var(--success)' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600;font-size:13px">${d.name}</span>
              <span style="font-size:11px">${stars}</span>
            </div>
            <div style="display:flex;gap:8px;font-size:11px;color:var(--text-dim);margin-top:2px;flex-wrap:wrap">
              <span>${locationName(d.accessFrom)}</span>
              <span>${d.floors}층</span>
              <span style="color:${progressColor}">${progressLabel}</span>
              ${best ? `<span style="color:var(--warning)">최단 ${best}턴</span>` : ''}
              ${ruleLevel ? `<span style="color:#6ba3d6">특수 ${ruleLevel}</span>` : ''}
              ${d.midBosses.length > 0 ? `<span style="color:var(--accent)">중간보스 ${d.midBosses.length}</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${d.description.slice(0, 60)}${d.description.length > 60 ? '...' : ''}</div>
          </div>
        `;
      }).join('');

      const clearedCount = allDungeons.filter(d => p.getDungeonProgress(d.id) >= 100).length;

      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>던전 정보</h2>
        <p class="hint" style="margin-bottom:8px">전체 ${allDungeons.length}개 던전 · 클리어 ${clearedCount}개 (난이도순)</p>
        <div style="overflow-y:auto;flex:1">
          ${rows}
        </div>
      `;

      wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
      el.appendChild(wrap);
    },
    onKey(key) {
      if (key === 'Escape') onDone();
    },
  };
}
