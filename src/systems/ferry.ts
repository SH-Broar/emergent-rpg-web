// ferry.ts — 마틴 항 배편 시스템

import type { LocationID } from '../types/location';
import type { Actor } from '../models/actor';
import type { GameSession } from './game-session';

export interface FerryRoute {
  destination: LocationID;
  name: string;          // 노선명 (한국어)
  departureTimes: number[]; // 출발 시각 배열 (0~23 정수)
  price: number;         // 1회 요금 (골드)
  travelMinutes: number; // 소요 시간 (게임 내 분)
}

export const FERRY_ROUTES: FerryRoute[] = [
  { destination: 'Kishina',       name: '키시나 해안행',    departureTimes: [8, 14, 20], price: 150,  travelMinutes: 90  },
  { destination: 'Penta',         name: '펜타 섬행',        departureTimes: [9, 21],     price: 200,  travelMinutes: 150 },
  { destination: 'Manyu',         name: '마뉴 수몰도시행',  departureTimes: [7, 19],     price: 350,  travelMinutes: 120 },
  { destination: 'Iluneon',       name: '일루네온행',       departureTimes: [6, 14, 22], price: 400,  travelMinutes: 240 },
  { destination: 'Alimes',        name: '알리메스행',       departureTimes: [8, 20],     price: 500,  travelMinutes: 300 },
  { destination: 'Falcon_Garden', name: '팔콘 가든행',      departureTimes: [6, 18],     price: 600,  travelMinutes: 360 },
  { destination: 'Tacomi',        name: '타코미행',         departureTimes: [10, 22],    price: 750,  travelMinutes: 480 },
  { destination: 'Clutch_Landing', name: '클러치 외항행',    departureTimes: [0, 12],     price: 900,  travelMinutes: 600 },
];

export const FERRY_PASS_PRICE = 3000;
export const FERRY_PASS_DAYS = 30;

/** 현재 시각 기준 다음 출발 시각 계산 (당일 or 익일) */
export function nextDeparture(
  route: FerryRoute,
  currentHour: number,
  currentDay: number,
): { day: number; hour: number } {
  for (const h of route.departureTimes) {
    if (h > currentHour) return { day: currentDay, hour: h };
  }
  // 당일 없으면 익일 첫 출발
  return { day: currentDay + 1, hour: route.departureTimes[0] };
}

/** 정기권 보유 여부 */
export function hasFerryPass(player: Actor, currentDay: number): boolean {
  if (!player.flags.get('ferry_pass')) return false;
  const expiry = player.variables.get('ferry_pass_expiry') ?? 0;
  return expiry > currentDay;
}

/** 티켓 구매 (정기권 없고 골드 충분할 때) */
export function buyTicket(
  player: Actor,
  routeIdx: number,
  session: GameSession,
): { success: boolean; message: string } {
  const route = FERRY_ROUTES[routeIdx];
  if (!route) return { success: false, message: '유효하지 않은 노선입니다.' };
  if (hasFerryPass(player, session.gameTime.day)) {
    // 정기권 있으면 바로 예약
    return scheduleTicket(player, routeIdx, session);
  }
  if (player.spirit.gold < route.price) {
    return { success: false, message: `골드가 부족합니다. (필요: ${route.price}G)` };
  }
  player.addGold(-route.price);
  return scheduleTicket(player, routeIdx, session);
}

function scheduleTicket(
  player: Actor,
  routeIdx: number,
  session: GameSession,
): { success: boolean; message: string } {
  const route = FERRY_ROUTES[routeIdx];
  const { day, hour } = nextDeparture(route, session.gameTime.hour, session.gameTime.day);
  player.variables.set('pending_ferry_dest', routeIdx);
  player.variables.set('pending_ferry_day', day);
  player.variables.set('pending_ferry_hour', hour);
  return {
    success: true,
    message: `${route.name} 티켓 예약 완료. 출발: ${hour < 10 ? '0' : ''}${hour}:00`,
  };
}

/** 정기권 구매 */
export function buyFerryPass(
  player: Actor,
  session: GameSession,
): { success: boolean; message: string } {
  if (player.spirit.gold < FERRY_PASS_PRICE) {
    return { success: false, message: `골드가 부족합니다. (필요: ${FERRY_PASS_PRICE}G)` };
  }
  player.addGold(-FERRY_PASS_PRICE);
  player.flags.set('ferry_pass', true);
  player.variables.set('ferry_pass_expiry', session.gameTime.day + FERRY_PASS_DAYS);
  return { success: true, message: `정기권 구매 완료. ${FERRY_PASS_DAYS}일간 전 노선 무제한 이용 가능.` };
}

/** 현재 예약된 티켓이 탑승 가능 상태인지 (출발 시각이 됐는지) */
export function canBoardNow(player: Actor, session: GameSession): boolean {
  const destIdx = player.variables.get('pending_ferry_dest');
  if (destIdx === undefined || destIdx < 0) return false;
  const boardDay = player.variables.get('pending_ferry_day') ?? -1;
  const boardHour = player.variables.get('pending_ferry_hour') ?? -1;
  const { day, hour } = session.gameTime;
  if (day > boardDay) return true;
  if (day === boardDay && hour >= boardHour) return true;
  return false;
}

/** 탑승 처리: 목적지 정보 반환 후 티켓 소멸 */
export function boardFerry(
  player: Actor,
  _session: GameSession,
): { destination: LocationID; travelMinutes: number } | null {
  const destIdx = player.variables.get('pending_ferry_dest');
  if (destIdx === undefined || destIdx < 0) return null;
  const route = FERRY_ROUTES[destIdx];
  if (!route) return null;
  // 티켓 초기화
  player.variables.delete('pending_ferry_dest');
  player.variables.delete('pending_ferry_day');
  player.variables.delete('pending_ferry_hour');
  return { destination: route.destination, travelMinutes: route.travelMinutes };
}
