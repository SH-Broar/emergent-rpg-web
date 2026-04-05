// world-map.ts — 격자 기반 세계 지도 (확대/축소/이동 지원)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';

export function createWorldMapScreen(session: GameSession, onDone: () => void): Screen {
  let zoom = 1;
  let panX = 0;
  let panY = 0;

  const W = 580, H = 500;
  const MIN_ZOOM = 0.5, MAX_ZOOM = 12;

  return {
    id: 'world-map',
    render(el) {
      const world = session.world;
      const playerLoc = session.player.currentLocation;
      const allLocs = [...world.getAllLocations().values()];

      // 좌표 범위 계산
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const loc of allLocs) {
        const gx = loc.gridX;
        const gy = loc.gridY;
        if (gx < minX) minX = gx;
        if (gx > maxX) maxX = gx;
        if (gy < minY) minY = gy;
        if (gy > maxY) maxY = gy;
      }
      const padX = (maxX - minX) * 0.1 || 5;
      const padY = (maxY - minY) * 0.1 || 5;
      minX -= padX; maxX += padX; minY -= padY; maxY += padY;

      function toScreen(gx: number, gy: number): [number, number] {
        const sx = ((gx - minX) / (maxX - minX)) * (W - 40) + 20;
        const sy = H - (((gy - minY) / (maxY - minY)) * (H - 40) + 20);
        return [sx, sy];
      }

      // SVG 내용 생성
      let svgContent = '';

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
          svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333355" stroke-width="1"/>`;
        }
        for (const link of loc.linksOneWayOut) {
          const target = world.getAllLocations().get(link.target);
          if (!target) continue;
          const [x2, y2] = toScreen(target.gridX, target.gridY);
          svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333355" stroke-width="1" stroke-dasharray="4"/>`;
        }
      }

      // 장소 점 + 이름 그리기
      for (const loc of allLocs) {
        const [cx, cy] = toScreen(loc.gridX, loc.gridY);
        const isPlayer = loc.id === playerLoc;
        const isVisited = session.knowledge.visitedLocations.has(loc.id);
        const r = isPlayer ? 6 : 4;
        const fill = isPlayer ? '#e94560' : isVisited ? '#4ecca3' : '#555577';
        const desc = (loc as unknown as Record<string, unknown>).description as string || '';
        svgContent += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="${isPlayer ? 2 : 0.5}" class="map-dot" data-loc="${loc.id}" data-name="${locationName(loc.id)}" data-desc="${desc.replace(/"/g, '&quot;')}" style="cursor:pointer"/>`;
        const name = locationName(loc.id);
        const shortName = name.length > 4 ? name.slice(0, 4) + '…' : name;
        const fontSize = isPlayer ? 11 : 9;
        const textFill = isPlayer ? '#e94560' : isVisited ? '#aaaacc' : '#666688';
        const labelClass = isPlayer ? 'map-label-player' : isVisited ? 'map-label-visited' : 'map-label-other';
        svgContent += `<text x="${cx}" y="${cy - r - 3}" text-anchor="middle" font-size="${fontSize}" fill="${textFill}" font-family="var(--font-main)" class="${labelClass}" data-shortname="${shortName}" data-fullname="${name}">${name}</text>`;
      }

      function getViewBox(): string {
        const vw = W / zoom;
        const vh = H / zoom;
        const vx = (W - vw) / 2 + panX;
        const vy = (H - vh) / 2 + panY;
        return `${vx} ${vy} ${vw} ${vh}`;
      }

      el.innerHTML = `
        <div class="screen info-screen">
          <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
          <h2>세계 지도</h2>
          <div class="map-container" style="position:relative;touch-action:none;overflow:hidden;border-radius:8px;background:var(--bg-card)">
            <svg id="world-svg" viewBox="${getViewBox()}" width="100%" style="max-height:65vh;display:block;cursor:grab">${svgContent}</svg>
            <div id="map-tooltip" style="display:none;position:absolute;background:rgba(20,20,40,0.95);color:#e0e0f0;border:1px solid #4ecca3;border-radius:6px;padding:6px 10px;font-size:12px;max-width:180px;pointer-events:none;z-index:10;line-height:1.4"></div>
          </div>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:6px">
            <button class="btn" data-zoom="in" style="min-width:44px;font-size:18px">+</button>
            <button class="btn" data-zoom="reset" style="min-width:60px;font-size:12px">초기화</button>
            <button class="btn" data-zoom="out" style="min-width:44px;font-size:18px">−</button>
          </div>
          <div style="display:flex;gap:12px;justify-content:center;font-size:11px;color:var(--text-dim);margin-top:4px">
            <span><span style="color:#e94560">●</span> 현재 위치</span>
            <span><span style="color:#4ecca3">●</span> 방문한 곳</span>
            <span><span style="color:#555577">●</span> 미방문</span>
            <span>— 양방향 ┄ 일방통행</span>
          </div>
          <p class="hint" style="text-align:center;margin-top:2px">마우스 휠/핀치로 확대, 드래그로 이동</p>
        </div>`;

      el.querySelector('[data-back]')?.addEventListener('click', onDone);

      const svg = el.querySelector('#world-svg') as SVGSVGElement | null;
      if (!svg) return;

      const tooltip = el.querySelector('#map-tooltip') as HTMLDivElement | null;
      let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

      function hideTooltip() {
        if (tooltip) tooltip.style.display = 'none';
        if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
      }

      function updateLabels() {
        svg!.querySelectorAll<SVGTextElement>('.map-label-player').forEach(t => {
          t.style.display = '';
          t.textContent = t.dataset.fullname ?? t.textContent;
        });
        svg!.querySelectorAll<SVGTextElement>('.map-label-visited').forEach(t => {
          if (zoom < 2) {
            t.style.display = 'none';
          } else if (zoom < 4) {
            t.style.display = '';
            t.textContent = t.dataset.shortname ?? t.textContent;
          } else {
            t.style.display = '';
            t.textContent = t.dataset.fullname ?? t.textContent;
          }
        });
        svg!.querySelectorAll<SVGTextElement>('.map-label-other').forEach(t => {
          if (zoom < 4) {
            t.style.display = 'none';
          } else {
            t.style.display = '';
            t.textContent = t.dataset.fullname ?? t.textContent;
          }
        });
      }

      function updateView() {
        svg!.setAttribute('viewBox', getViewBox());
        updateLabels();
      }

      // 클릭 툴팁
      svg.addEventListener('click', (e) => {
        const circle = (e.target as Element).closest('.map-dot') as SVGCircleElement | null;
        if (!circle || !tooltip) { hideTooltip(); return; }
        const name = circle.dataset.name ?? '';
        const desc = circle.dataset.desc ?? '';
        tooltip.innerHTML = `<strong style="color:#4ecca3">${name}</strong>${desc ? '<br><span style="color:#aaaacc">' + desc + '</span>' : ''}`;
        const container = tooltip.parentElement!.getBoundingClientRect();
        const cx = parseFloat(circle.getAttribute('cx') ?? '0');
        const cy = parseFloat(circle.getAttribute('cy') ?? '0');
        // convert SVG coords to container-relative pixel coords
        const pt = svg!.createSVGPoint();
        pt.x = cx; pt.y = cy;
        const screenPt = pt.matrixTransform(svg!.getScreenCTM()!);
        let left = screenPt.x - container.left + 10;
        let top = screenPt.y - container.top - 10;
        tooltip.style.display = 'block';
        // keep within container bounds after display
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        if (left + tw > container.width - 4) left = screenPt.x - container.left - tw - 10;
        if (top + th > container.height - 4) top = screenPt.y - container.top - th - 10;
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        if (tooltipTimer) clearTimeout(tooltipTimer);
        tooltipTimer = setTimeout(hideTooltip, 3000);
        e.stopPropagation();
      });

      // 줌 버튼
      el.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.zoom;
          if (action === 'in') zoom = Math.min(MAX_ZOOM, zoom * 1.4);
          else if (action === 'out') zoom = Math.max(MIN_ZOOM, zoom / 1.4);
          else { zoom = 1; panX = 0; panY = 0; }
          updateView();
        });
      });

      // 마우스 휠 줌
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
        updateView();
      }, { passive: false });

      // 드래그 이동
      let dragging = false;
      let lastX = 0, lastY = 0;

      svg.addEventListener('mousedown', (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        svg!.style.cursor = 'grabbing';
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = svg!.getBoundingClientRect();
        const scaleX = (W / zoom) / rect.width;
        const scaleY = (H / zoom) / rect.height;
        panX -= (e.clientX - lastX) * scaleX;
        panY -= (e.clientY - lastY) * scaleY;
        lastX = e.clientX;
        lastY = e.clientY;
        updateView();
      });
      window.addEventListener('mouseup', () => {
        dragging = false;
        svg!.style.cursor = 'grab';
      });

      // 터치 핀치 줌 + 드래그
      let lastTouchDist = 0;
      let lastTouchX = 0, lastTouchY = 0;

      svg.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastTouchDist = Math.sqrt(dx * dx + dy * dy);
        } else if (e.touches.length === 1) {
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;
        }
      }, { passive: true });

      svg.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (lastTouchDist > 0) {
            const factor = dist / lastTouchDist;
            zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
            updateView();
          }
          lastTouchDist = dist;
        } else if (e.touches.length === 1) {
          const rect = svg!.getBoundingClientRect();
          const scaleX = (W / zoom) / rect.width;
          const scaleY = (H / zoom) / rect.height;
          panX -= (e.touches[0].clientX - lastTouchX) * scaleX;
          panY -= (e.touches[0].clientY - lastTouchY) * scaleY;
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;
          updateView();
        }
      }, { passive: false });

      svg.addEventListener('touchend', () => { lastTouchDist = 0; }, { passive: true });

      // apply initial label visibility
      updateLabels();
    },
    onKey(key) {
      if (key === 'Escape') onDone();
      if (key === '+' || key === '=') { zoom = Math.min(MAX_ZOOM, zoom * 1.4); }
      if (key === '-') { zoom = Math.max(MIN_ZOOM, zoom / 1.4); }
      if (key === '0') { zoom = 1; panX = 0; panY = 0; }
      const svgEl = document.querySelector('#world-svg') as SVGSVGElement | null;
      if (svgEl) {
        const vw = W / zoom;
        const vh = H / zoom;
        const vx = (W - vw) / 2 + panX;
        const vy = (H - vh) / 2 + panY;
        svgEl.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
        // update label visibility for keyboard zoom
        svgEl.querySelectorAll<SVGTextElement>('.map-label-player').forEach(t => { t.style.display = ''; t.textContent = t.dataset.fullname ?? t.textContent; });
        svgEl.querySelectorAll<SVGTextElement>('.map-label-visited').forEach(t => {
          if (zoom < 2) { t.style.display = 'none'; }
          else if (zoom < 4) { t.style.display = ''; t.textContent = t.dataset.shortname ?? t.textContent; }
          else { t.style.display = ''; t.textContent = t.dataset.fullname ?? t.textContent; }
        });
        svgEl.querySelectorAll<SVGTextElement>('.map-label-other').forEach(t => {
          t.style.display = zoom < 4 ? 'none' : '';
          if (zoom >= 4) t.textContent = t.dataset.fullname ?? t.textContent;
        });
      }
    },
  };
}
