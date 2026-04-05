// world-map.ts — 격자 기반 세계 지도

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';

export function createWorldMapScreen(session: GameSession, onDone: () => void): Screen {
  return {
    id: 'world-map',
    render(el) {
      const world = session.world;
      const playerLoc = session.player.currentLocation;
      const allLocs = [...world.getAllLocations().values()];

      // 좌표 범위 계산
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const loc of allLocs) {
        if (loc.gridX < minX) minX = loc.gridX;
        if (loc.gridX > maxX) maxX = loc.gridX;
        if (loc.gridY < minY) minY = loc.gridY;
        if (loc.gridY > maxY) maxY = loc.gridY;
      }
      const padX = (maxX - minX) * 0.1 || 5;
      const padY = (maxY - minY) * 0.1 || 5;
      minX -= padX; maxX += padX; minY -= padY; maxY += padY;

      const W = 580, H = 500;
      function toScreen(gx: number, gy: number): [number, number] {
        const sx = ((gx - minX) / (maxX - minX)) * (W - 40) + 20;
        const sy = H - (((gy - minY) / (maxY - minY)) * (H - 40) + 20); // y 반전
        return [sx, sy];
      }

      // SVG 생성
      let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-height:70vh;background:var(--bg-card);border-radius:8px">`;

      // 경로 선 그리기
      const drawn = new Set<string>();
      for (const loc of allLocs) {
        const [x1, y1] = toScreen(loc.gridX, loc.gridY);
        for (const link of loc.linksBidirectional) {
          const target = world.getAllLocations().get(link.target);
          if (!target) continue;
          const edgeKey = [loc.id, link.target].sort().join('-');
          if (drawn.has(edgeKey)) continue;
          drawn.add(edgeKey);
          const [x2, y2] = toScreen(target.gridX, target.gridY);
          svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333355" stroke-width="1"/>`;
        }
        for (const link of loc.linksOneWayOut) {
          const target = world.getAllLocations().get(link.target);
          if (!target) continue;
          const [x2, y2] = toScreen(target.gridX, target.gridY);
          svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333355" stroke-width="1" stroke-dasharray="4"/>`;
        }
      }

      // 장소 점 + 이름 그리기
      for (const loc of allLocs) {
        const [cx, cy] = toScreen(loc.gridX, loc.gridY);
        const isPlayer = loc.id === playerLoc;
        const isVisited = session.knowledge.visitedLocations.has(loc.id);
        const r = isPlayer ? 6 : 4;
        const fill = isPlayer ? '#e94560' : isVisited ? '#4ecca3' : '#555577';
        svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="${isPlayer ? 2 : 0.5}"/>`;
        const name = locationName(loc.id);
        const shortName = name.length > 6 ? name.slice(0, 5) + '…' : name;
        const fontSize = isPlayer ? 11 : 9;
        const textFill = isPlayer ? '#e94560' : isVisited ? '#aaaacc' : '#666688';
        svg += `<text x="${cx}" y="${cy - r - 3}" text-anchor="middle" font-size="${fontSize}" fill="${textFill}" font-family="var(--font-main)">${shortName}</text>`;
      }

      svg += '</svg>';

      // 범례
      const legend = `
        <div style="display:flex;gap:12px;justify-content:center;font-size:11px;color:var(--text-dim);margin-top:4px">
          <span><span style="color:#e94560">●</span> 현재 위치</span>
          <span><span style="color:#4ecca3">●</span> 방문한 곳</span>
          <span><span style="color:#555577">●</span> 미방문</span>
          <span>— 양방향 ┄ 일방통행</span>
        </div>`;

      el.innerHTML = `
        <div class="screen info-screen">
          <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
          <h2>세계 지도</h2>
          ${svg}
          ${legend}
        </div>`;
      el.querySelector('[data-back]')?.addEventListener('click', onDone);
    },
    onKey(key) { if (key === 'Escape') onDone(); },
  };
}
