// event.ts — 이벤트 시스템
// 원본: Event.h

import { ELEMENT_COUNT } from '../types/enums';
import { GameTime } from '../types/game-time';
import { LocationID, Loc } from '../types/location';

export interface GameEvent {
  name: string;
  description: string;
  colorInfluence: number[]; // ELEMENT_COUNT size
  location: LocationID;
  worldScript?: (world: unknown, time: GameTime) => void;
  poolWeight: number;
  triggered: boolean;
  triggeredAt: GameTime;
}

export function createGameEvent(name = '', description = ''): GameEvent {
  return {
    name,
    description,
    colorInfluence: new Array(ELEMENT_COUNT).fill(0),
    location: Loc.Alimes,
    poolWeight: 1.0,
    triggered: false,
    triggeredAt: new GameTime(),
  };
}

export interface ScheduledTrigger {
  day: number;
  hour: number;
}

export class EventSystem {
  private events: GameEvent[] = [];
  private triggers: ScheduledTrigger[] = [];
  private randomPool: GameEvent[] = [];
  /** 랜덤 풀 이벤트 쿨다운: poolIndex → 마지막 발동일 */
  private randomCooldown = new Map<number, number>();

  addEvent(event: GameEvent): void {
    this.events.push(event);
  }

  addScheduledEvent(event: GameEvent, triggerDay: number, triggerHour: number): void {
    const idx = this.events.length;
    this.events.push(event);
    while (this.triggers.length <= idx) {
      this.triggers.push({ day: 0, hour: 0 });
    }
    this.triggers[idx] = { day: triggerDay, hour: triggerHour };
  }

  addRandomPoolEvent(event: GameEvent): void {
    this.randomPool.push(event);
  }

  checkAndTrigger(time: GameTime): number[] {
    const triggered: number[] = [];
    for (let i = 0; i < this.events.length; i++) {
      if (this.events[i].triggered) continue;
      if (i < this.triggers.length) {
        const t = this.triggers[i];
        if (t.day > 0 && time.day >= t.day && time.hour >= t.hour) {
          this.events[i].triggered = true;
          this.events[i].triggeredAt = time.clone();
          triggered.push(i);
        }
      }
    }
    return triggered;
  }

  getEvent(index: number): GameEvent { return this.events[index]; }
  getAllEvents(): readonly GameEvent[] { return this.events; }
  getRandomPool(): readonly GameEvent[] { return this.randomPool; }

  /**
   * 랜덤 풀에서 가중치 기반으로 이벤트를 발동 시도한다.
   * @param time 현재 게임 시간
   * @param chance 발동 확률 (0~1, 기본 0.08 = 8%)
   * @returns 발동된 이벤트, 없으면 null
   */
  rollRandomEvent(time: GameTime, chance = 0.08): GameEvent | null {
    if (this.randomPool.length === 0) return null;
    if (Math.random() > chance) return null;

    // 같은 날 이미 발동된 이벤트 제외 (최소 1일 쿨다운)
    const eligible = this.randomPool
      .map((ev, i) => ({ ev, i }))
      .filter(({ i }) => (this.randomCooldown.get(i) ?? -999) < time.day);

    if (eligible.length === 0) return null;

    // poolWeight 가중치 기반 선택
    const totalWeight = eligible.reduce((sum, { ev }) => sum + ev.poolWeight, 0);
    let rand = Math.random() * totalWeight;
    for (const { ev, i } of eligible) {
      rand -= ev.poolWeight;
      if (rand <= 0) {
        this.randomCooldown.set(i, time.day);
        return ev;
      }
    }
    return null;
  }
}
