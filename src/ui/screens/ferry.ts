// ferry.ts — 마틴 항 배편 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import {
  FERRY_ROUTES, FERRY_PASS_PRICE, FERRY_PASS_DAYS, SEA_ONLY_LOCATIONS,
  hasFerryPass, buyTicket, buyFerryPass, canBoardNow, boardFerry, nextDeparture,
} from '../../systems/ferry';
import { locationName } from '../../types/registry';
import { checkAndAwardTitles } from '../../systems/title-system';
import { applyTravelSpeed } from '../../types/item-defs';

export function createFerryScreen(
  session: GameSession,
  onDone: () => void,
  onTravel?: (fromId: string, toId: string, minutes: number) => void,
): Screen {
  const p = session.player;

  function render(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    const loc = p.currentLocation;
    const isReturnPort = SEA_ONLY_LOCATIONS.includes(loc);

    // 현재 위치에서 출발하는 노선만 필터링
    const visibleRoutes = FERRY_ROUTES
      .map((route, i) => ({ route, i }))
      .filter(({ route }) => isReturnPort
        ? route.fromLocation === loc          // 복귀 항구: 해당 지역의 복귀 노선만
        : !route.fromLocation,                // 마틴 항: 출발지 없는(마틴 발) 노선만
      );

    const hasPass = hasFerryPass(p, session.gameTime.day);
    const passExpiry = p.variables.get('ferry_pass_expiry') ?? 0;

    const pendingIdx = p.variables.get('pending_ferry_dest');
    const hasPending = pendingIdx !== undefined && pendingIdx >= 0 && pendingIdx < FERRY_ROUTES.length;
    const pendingRoute = hasPending ? FERRY_ROUTES[pendingIdx] : null;
    const pendingDay = p.variables.get('pending_ferry_day') ?? 0;
    const pendingHour = p.variables.get('pending_ferry_hour') ?? 0;
    const canBoard = hasPending && canBoardNow(p, session);

    // 정기권 (마틴 항에서만 표시)
    const passHtml = isReturnPort ? '' : hasPass
      ? `<div style="margin:8px 0;padding:8px 12px;background:var(--bg-card);border-radius:6px;border:1px solid var(--success)">
          <span style="color:var(--success)">✓ 정기권 보유</span>
          <span style="color:var(--text-dim);font-size:12px;margin-left:8px">만료: ${passExpiry}일차</span>
        </div>`
      : `<div style="margin:8px 0">
          <button class="btn" data-action="buy-pass" ${p.spirit.gold < FERRY_PASS_PRICE ? 'disabled' : ''}>
            정기권 구매 (${FERRY_PASS_PRICE}G / ${FERRY_PASS_DAYS}일)
          </button>
          ${p.spirit.gold < FERRY_PASS_PRICE ? '<span style="color:var(--accent);font-size:11px;margin-left:6px">골드 부족</span>' : ''}
        </div>`;

    // 노선 목록
    const routesHtml = visibleRoutes.map(({ route, i }) => {
      const next = nextDeparture(route, session.gameTime.hour, session.gameTime.day);
      const nextTimeStr = `${next.hour < 10 ? '0' : ''}${next.hour}:00`;
      const isToday = next.day === session.gameTime.day;
      const dayLabel = isToday ? '오늘' : `${next.day}일차`;
      const isFree = route.price === 0;
      const priceLabel = isFree
        ? '<span style="color:var(--success)">무료</span>'
        : hasPass ? '<span style="color:var(--success)">정기권 이용</span>' : `${route.price}G`;
      const canAfford = isFree || hasPass || p.spirit.gold >= route.price;
      const disabled = !canAfford || hasPending;
      const destName = locationName(route.destination) || route.destination;
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-card);border-radius:6px;margin:4px 0;border:1px solid var(--border)">
          <div>
            <div style="font-weight:600">${route.name}</div>
            <div style="font-size:11px;color:var(--text-dim)">→ ${destName} · ${route.travelMinutes}분 · 다음: ${dayLabel} ${nextTimeStr}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px">${priceLabel}</span>
            <button class="btn btn-primary" data-action="book" data-route="${i}" ${disabled ? 'disabled' : ''} style="font-size:12px;padding:4px 12px">
              예약
            </button>
          </div>
        </div>`;
    }).join('');

    // 예약된 배편
    let pendingHtml = '';
    if (hasPending && pendingRoute) {
      const hourStr = `${pendingHour < 10 ? '0' : ''}${pendingHour}:00`;
      const destName = locationName(pendingRoute.destination) || pendingRoute.destination;
      pendingHtml = `
        <div style="margin:12px 0;padding:12px;background:var(--bg-card);border-radius:8px;border:2px solid var(--warning)">
          <h3 style="margin-bottom:6px;color:var(--warning)">예약된 배편</h3>
          <p>${pendingRoute.name} → ${destName}</p>
          <p style="font-size:12px;color:var(--text-dim)">출발: ${pendingDay}일차 ${hourStr}</p>
          ${canBoard
            ? '<button class="btn btn-primary" data-action="board" style="margin-top:8px">탑승하기 [Enter]</button>'
            : '<p style="color:var(--text-dim);margin-top:6px">다음 출발까지 대기 중...</p>'}
        </div>`;
    }

    const title = isReturnPort ? '⛵ 마틴 항 복귀 배편' : '⛵ 마틴 항 배편 예약';
    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>${title}</h2>
      <p style="color:var(--text-dim);font-size:12px">보유 골드: ${p.spirit.gold}G</p>
      ${passHtml}
      ${pendingHtml}
      <div style="margin-top:12px">
        <h3 style="margin-bottom:6px">노선 목록</h3>
        ${routesHtml || '<p style="color:var(--text-dim)">이용 가능한 노선이 없습니다.</p>'}
      </div>
      <p class="hint" style="margin-top:12px">Esc=닫기</p>
    `;

    // 이벤트 바인딩
    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);

    wrap.querySelector('[data-action="buy-pass"]')?.addEventListener('click', () => {
      const result = buyFerryPass(p, session);
      session.backlog.add(session.gameTime, result.message, '행동');
      render(el);
    });

    wrap.querySelectorAll<HTMLButtonElement>('[data-action="book"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const routeIdx = parseInt(btn.dataset.route!, 10);
        const result = buyTicket(p, routeIdx, session);
        session.backlog.add(session.gameTime, result.message, '행동');
        render(el);
      });
    });

    wrap.querySelector('[data-action="board"]')?.addEventListener('click', () => {
      handleBoard(el);
    });

    el.appendChild(wrap);
  }

  function handleBoard(_el: HTMLElement) {
    const result = boardFerry(p, session);
    if (!result) return;
    // 악세서리 travelSpeed 적용 (여행 시간 가감)
    const adjustedMinutes = applyTravelSpeed(p, result.travelMinutes);
    session.backlog.add(session.gameTime, `${p.name}이(가) 배에 탑승했다. 목적지: ${locationName(result.destination) || result.destination}`, '행동');
    if (onTravel) {
      onTravel(p.currentLocation, result.destination, adjustedMinutes);
    } else {
      // 즉시 이동 폴백
      session.gameTime.advance(adjustedMinutes);
      p.currentLocation = result.destination;
      session.knowledge.trackVisit(result.destination);
      for (const t of checkAndAwardTitles(session)) {
        session.backlog.add(session.gameTime, `✦ 칭호 획득: "${t}"`, '시스템');
      }
      onDone();
    }
  }

  return {
    id: 'ferry',
    render(el) {
      render(el);
    },
    onKey(key) {
      if (key === 'Escape') onDone();
      if (key === 'Enter') {
        const pendingIdx = p.variables.get('pending_ferry_dest');
        const hasPending = pendingIdx !== undefined && pendingIdx >= 0;
        if (hasPending && canBoardNow(p, session)) {
          const container = document.querySelector('.info-screen')?.parentElement;
          if (container instanceof HTMLElement) handleBoard(container);
        }
      }
    },
  };
}
