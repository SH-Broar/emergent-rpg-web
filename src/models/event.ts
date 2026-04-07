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
}
