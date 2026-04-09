// world-map.ts — 격자 기반 세계 지도 (확대/축소/이동 지원)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';

// 마을 구역별 색상 매핑
export function getZoneColor(locationId: string): string {
  // 일루네온 — 하늘색
  if (locationId.startsWith('Iluneon') || locationId === 'Memory_Spring')
    return '#87CEEB';
  // 엘리메스 마을 및 근처 야외 — 초록
  if (['Alimes','Guild_Hall','Market_Square','Herb_Garden','Farm','Erumen_Seoncheon',
       'Cyan_Dunes','Tiklit_Range','Ekres','Abandoned_Mine','Bandit_Hideout',
       'Silk_Workshop','Moonlit_Clearing','Bloom_Terrace'].includes(locationId))
    return '#4ecca3';
  // 루나 (마법학교) — 보라
  if (['Luna_Academy','Phantom_Spire','Stella_Ville'].includes(locationId))
    return '#9b59b6';
  // 마노니클라 — 주황
  if (['Manonickla','Limun_Ruins'].includes(locationId))
    return '#e67e22';
  // 마틴 항 — 남색
  if (locationId.startsWith('Martin'))
    return '#2980b9';
  // 할퓌아 — 밝은 하늘
  if (locationId === 'Halpia')
    return '#5dade2';
  // 알리메스 — 금빛
  if (locationId === 'Alimes')
    return '#f1c40f';
  // 라르/허공 숲 — 진초록
  if (['Lar_Forest','Void_Forest','World_Tree','Ancient_Tree_Crown'].includes(locationId))
    return '#27ae60';
  // 마왕성 — 심홍
  if (locationId === 'Demon_Castle')
    return '#c0392b';
  // 리엘 / 푸치탑 — 연보라
  if (['Puchi_Tower','Riel_Sky'].includes(locationId))
    return '#bb8fce';
  // 에니챰 — 노랑/전기
  if (['Enicham','Night_Tacomi'].includes(locationId))
    return '#f39c12';
  // 기타 도시 — 연회색
  if (['Ekres','Yusejeria','Hanabridge','Moss','Triflower'].includes(locationId))
    return '#95a5a6';
  // 풍혈지대 — 하늘+바람
  if (locationId === 'Windfall_Valley' || locationId === 'Hologram_Field')
    return '#76d7c4';
  // 팔콘 가든 등 특수지역 — 연분홍
  if (['Falcon_Garden','Starfall_Basin','Mirage_Oasis','Twilight_Spire','Crystal_Cavern'].includes(locationId))
    return '#d4a0c0';
  // 고위험 야외 — 심홍
  if (['Erumen_Mistwood','Bandit_Hideout','Ode_Mountain'].includes(locationId))
    return '#c0392b';
  // 기본
  return '#888899';
}

export function createWorldMapScreen(session: GameSession, onDone: () => void): Screen {
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let selectedLocIndex = 0;

  const W = 580, H = 500;
  const MIN_ZOOM = 0.5, MAX_ZOOM = 12;

  return {
    id: 'world-map',
    render(el) {
      const world = session.world;
      const playerLoc = session.player.currentLocation;

      function isLocationVisible(loc: { timeVisible?: { fromHour: number; toHour: number } }): boolean {
        if (!loc.timeVisible) return true;
        const hour = session.gameTime.hour;
        const { fromHour, toHour } = loc.timeVisible;
        if (fromHour < toHour) {
          return hour >= fromHour && hour < toHour;
        } else {
          // 자정 넘는 경우 (18~6 등)
          return hour >= fromHour || hour < toHour;
        }
      }

      const allLocs = [...world.getAllLocations().values()].filter(loc =>
        isLocationVisible(loc)
        && (!loc.hidden || loc.id === playerLoc || session.knowledge.visitedLocations.has(loc.id)),
      );

      // 최초 진입 시 플레이어 위치로 선택 초기화
      const playerIdx = allLocs.findIndex(l => l.id === playerLoc);
      if (playerIdx >= 0) selectedLocIndex = playerIdx;

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
        const isBase = (session.knowledge as unknown as Record<string, unknown>).ownedBases instanceof Set
          ? ((session.knowledge as unknown as Record<string, { has(id: string): boolean }>).ownedBases).has(loc.id)
          : false;
        const r = isPlayer ? 6 : 4;
        const zoneColor = getZoneColor(loc.id);
        const fill = isPlayer ? '#e94560' : zoneColor;
        const opacity = isPlayer ? 1.0 : isVisited ? 1.0 : 0.3;
        const desc = (loc as unknown as Record<string, unknown>).description as string || '';
        svgContent += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}" stroke="#fff" stroke-width="${isPlayer ? 2 : 0.5}" class="map-dot" data-loc="${loc.id}" data-name="${locationName(loc.id)}" data-desc="${desc.replace(/"/g, '&quot;')}" style="cursor:pointer"/>`;
        if (isBase) {
          svgContent += `<polygon points="${cx},${cy-5} ${cx+4},${cy} ${cx},${cy+5} ${cx-4},${cy}" fill="#2ecc71" stroke="#fff" stroke-width="0.5"/>`;
        }
        const name = locationName(loc.id);
        const shortName = name.length > 4 ? name.slice(0, 4) + '…' : name;
        const fontSize = isPlayer ? 11 : 9;
        const textFill = isPlayer ? '#e94560' : isVisited ? zoneColor : `${zoneColor}55`;
        const labelClass = isPlayer ? 'map-label-player' : isVisited ? 'map-label-visited' : 'map-label-other';
        svgContent += `<text x="${cx}" y="${cy - r - 3}" text-anchor="middle" font-size="${fontSize}" fill="${textFill}" font-family="var(--font-main)" class="${labelClass}" data-shortname="${shortName}" data-fullname="${name}" pointer-events="none">${name}</text>`;
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
            <svg id="world-svg" viewBox="${getViewBox()}" width="100%" style="max-height:60vh;display:block;cursor:grab">${svgContent}</svg>
            <div id="map-tooltip" style="display:none;position:absolute;background:rgba(20,20,40,0.95);color:#e0e0f0;border:1px solid #4ecca3;border-radius:6px;padding:6px 10px;font-size:12px;max-width:180px;pointer-events:none;z-index:10;line-height:1.4"></div>
          </div>
          <div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-top:6px">
            <button class="btn" id="nav-prev" style="min-width:36px;font-size:16px" title="이전 장소 [←]">◀</button>
            <button class="btn" data-zoom="in" style="min-width:44px;font-size:18px">+</button>
            <button class="btn" data-zoom="reset" style="min-width:60px;font-size:12px">초기화</button>
            <button class="btn" data-zoom="out" style="min-width:44px;font-size:18px">−</button>
            <button class="btn" id="nav-next" style="min-width:36px;font-size:16px" title="다음 장소 [→]">▶</button>
          </div>
          <div id="nav-panel" style="margin-top:6px;background:rgba(20,20,40,0.6);border:1px solid #333355;border-radius:8px;padding:8px 14px">
            <div id="nav-name" style="color:#4ecca3;font-weight:bold;font-size:13px"></div>
            <div id="nav-desc" style="color:#aaaacc;font-size:11px;margin-top:4px;line-height:1.5"></div>
          </div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;font-size:10px;color:var(--text-dim);margin-top:4px">
            <span><span style="color:#e94560">●</span> 현재</span>
            <span><span style="color:#4ecca3">●</span> 엘리메스</span>
            <span><span style="color:#87CEEB">●</span> 일루네온</span>
            <span><span style="color:#9b59b6">●</span> 루나</span>
            <span><span style="color:#e67e22">●</span> 마노니클라</span>
            <span><span style="color:#2980b9">●</span> 마틴</span>
            <span><span style="color:#27ae60">●</span> 숲</span>
            <span><span style="color:#666677">●</span> 야외</span>
            <span>— 양방향 ┄ 일방통행</span>
          </div>
          <p class="hint" style="text-align:center;margin-top:2px">휠/핀치로 확대 · 드래그로 이동 · ◀▶ 또는 ← → 키로 장소 탐색</p>
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

      // 도트를 뷰포트 내 (fx, fy) 비율 위치에 오도록 팬 이동
      function panToLocation(dotCx: number, dotCy: number, fx = 0.45, fy = 0.48) {
        panX = dotCx - fx * (W / zoom) - (W - W / zoom) / 2;
        panY = dotCy - fy * (H / zoom) - (H - H / zoom) / 2;
        updateView();
      }

      // 도트 위치에 팝업 표시 (자동 종료 없음)
      function showTooltipForDot(dot: SVGCircleElement) {
        if (!tooltip) return;
        const name = dot.dataset.name ?? '';
        const desc = dot.dataset.desc ?? '';
        tooltip.innerHTML = `<strong style="color:#4ecca3">${name}</strong>${desc ? '<br><span style="color:#aaaacc">' + desc + '</span>' : ''}`;
        const container = tooltip.parentElement!.getBoundingClientRect();
        const cx = parseFloat(dot.getAttribute('cx') ?? '0');
        const cy = parseFloat(dot.getAttribute('cy') ?? '0');
        const pt = svg!.createSVGPoint();
        pt.x = cx; pt.y = cy;
        const screenPt = pt.matrixTransform(svg!.getScreenCTM()!);
        tooltip.style.display = 'block';
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        // 도트 우측하단 기본, 경계 초과 시 좌측/상단으로 전환
        let left = screenPt.x - container.left + 12;
        let top  = screenPt.y - container.top  + 8;
        if (left + tw > container.width  - 4) left = screenPt.x - container.left - tw - 12;
        if (top  + th > container.height - 4) top  = screenPt.y - container.top  - th - 8;
        if (left < 4) left = 4;
        if (top  < 4) top  = 4;
        tooltip.style.left = left + 'px';
        tooltip.style.top  = top  + 'px';
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

      // 네비게이션 패널 업데이트
      const navNameEl = el.querySelector('#nav-name') as HTMLElement | null;
      const navDescEl = el.querySelector('#nav-desc') as HTMLElement | null;

      function updateNavPanel(pan = false) {
        const loc = allLocs[selectedLocIndex];
        if (!loc || !navNameEl || !navDescEl) return;
        const name = locationName(loc.id);
        const desc = (loc as unknown as Record<string, unknown>).description as string || '';
        navNameEl.textContent = name + (loc.id === playerLoc ? ' ★' : '');
        navDescEl.textContent = desc || '설명 없음';
        // 선택 강조: 이전 강조 해제 후 새 강조
        svg!.querySelectorAll<SVGCircleElement>('.map-dot').forEach(c => {
          const isPlayer = c.dataset.loc === playerLoc;
          c.setAttribute('stroke', '#fff');
          c.setAttribute('stroke-width', isPlayer ? '2' : '0.5');
        });
        const dot = svg!.querySelector<SVGCircleElement>(`.map-dot[data-loc="${loc.id}"]`);
        if (dot) {
          dot.setAttribute('stroke', '#ffdd00');
          dot.setAttribute('stroke-width', '3');
          if (pan) {
            // 도트를 뷰포트 55%, 52% 위치(중앙 우측하단)에 배치
            panToLocation(
              parseFloat(dot.getAttribute('cx') ?? '0'),
              parseFloat(dot.getAttribute('cy') ?? '0'),
              0.45, 0.48,
            );
            showTooltipForDot(dot);
          }
        }
      }

      function navigate(dir: 1 | -1) {
        selectedLocIndex = (selectedLocIndex + dir + allLocs.length) % allLocs.length;
        updateNavPanel(true);
      }

      el.querySelector('#nav-prev')?.addEventListener('click', () => navigate(-1));
      el.querySelector('#nav-next')?.addEventListener('click', () => navigate(1));

      // 클릭: nav 패널 반영 + 팝업 표시 (자동 종료 없음)
      svg.addEventListener('click', (e) => {
        const circle = (e.target as Element).closest('.map-dot') as SVGCircleElement | null;
        if (!circle) { hideTooltip(); return; }
        const locId = circle.dataset.loc ?? '';
        const idx = allLocs.findIndex(l => l.id === locId);
        if (idx >= 0) { selectedLocIndex = idx; updateNavPanel(false); }
        showTooltipForDot(circle);
        e.stopPropagation();
      });

      // 초기 패널 표시 (팬 없음)
      updateNavPanel(false);

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

      // 좌우 방향키로 장소 탐색 (render()의 navigate와 동일 동작)
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const allLocs2 = [...session.world.getAllLocations().values()];
        const dir = key === 'ArrowLeft' ? -1 : 1;
        selectedLocIndex = (selectedLocIndex + dir + allLocs2.length) % allLocs2.length;
        const loc = allLocs2[selectedLocIndex];
        const svgEl2 = document.querySelector('#world-svg') as SVGSVGElement | null;
        const navNameEl2 = document.querySelector('#nav-name') as HTMLElement | null;
        const navDescEl2 = document.querySelector('#nav-desc') as HTMLElement | null;
        const tooltipEl2 = document.querySelector('#map-tooltip') as HTMLDivElement | null;
        const playerLoc2 = session.player.currentLocation;
        if (loc && navNameEl2 && navDescEl2 && svgEl2) {
          navNameEl2.textContent = locationName(loc.id) + (loc.id === playerLoc2 ? ' ★' : '');
          navDescEl2.textContent = ((loc as unknown as Record<string, unknown>).description as string) || '설명 없음';
          svgEl2.querySelectorAll<SVGCircleElement>('.map-dot').forEach(c => {
            c.setAttribute('stroke', '#fff');
            c.setAttribute('stroke-width', c.dataset.loc === playerLoc2 ? '2' : '0.5');
          });
          const dot2 = svgEl2.querySelector<SVGCircleElement>(`.map-dot[data-loc="${loc.id}"]`);
          if (dot2 && tooltipEl2) {
            dot2.setAttribute('stroke', '#ffdd00');
            dot2.setAttribute('stroke-width', '3');
            // 팬: 도트를 (45%, 48%) 위치에
            const cx2 = parseFloat(dot2.getAttribute('cx') ?? '0');
            const cy2 = parseFloat(dot2.getAttribute('cy') ?? '0');
            panX = cx2 - 0.45 * (W / zoom) - (W - W / zoom) / 2;
            panY = cy2 - 0.48 * (H / zoom) - (H - H / zoom) / 2;
            const vw2 = W / zoom, vh2 = H / zoom;
            svgEl2.setAttribute('viewBox', `${(W - vw2) / 2 + panX} ${(H - vh2) / 2 + panY} ${vw2} ${vh2}`);
            // 팝업
            const name2 = dot2.dataset.name ?? '';
            const desc2 = dot2.dataset.desc ?? '';
            tooltipEl2.innerHTML = `<strong style="color:#4ecca3">${name2}</strong>${desc2 ? '<br><span style="color:#aaaacc">' + desc2 + '</span>' : ''}`;
            const container2 = tooltipEl2.parentElement!.getBoundingClientRect();
            const pt2 = svgEl2.createSVGPoint();
            pt2.x = cx2; pt2.y = cy2;
            const sp2 = pt2.matrixTransform(svgEl2.getScreenCTM()!);
            tooltipEl2.style.display = 'block';
            const tw2 = tooltipEl2.offsetWidth, th2 = tooltipEl2.offsetHeight;
            let l2 = sp2.x - container2.left + 12;
            let t2 = sp2.y - container2.top  + 8;
            if (l2 + tw2 > container2.width  - 4) l2 = sp2.x - container2.left - tw2 - 12;
            if (t2 + th2 > container2.height - 4) t2 = sp2.y - container2.top  - th2 - 8;
            if (l2 < 4) l2 = 4;
            if (t2 < 4) t2 = 4;
            tooltipEl2.style.left = l2 + 'px';
            tooltipEl2.style.top  = t2 + 'px';
          }
        }
        return;
      }

      const svgEl = document.querySelector('#world-svg') as SVGSVGElement | null;
      if (svgEl) {
        const vw = W / zoom;
        const vh = H / zoom;
        const vx = (W - vw) / 2 + panX;
        const vy = (H - vh) / 2 + panY;
        svgEl.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
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
