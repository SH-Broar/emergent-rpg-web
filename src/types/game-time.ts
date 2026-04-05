// ============================================================
// game-time.ts — 게임 시간 클래스
// 원본: Types.h:86-117
// ============================================================

import { DayOfWeek, dayOfWeekName } from './enums';

export class GameTime {
  day = 1;
  hour = 6;
  minute = 0;

  advance(minutes: number): void {
    this.minute += minutes;
    while (this.minute >= 60) { this.minute -= 60; this.hour++; }
    while (this.hour >= 24) { this.hour -= 24; this.day++; }
  }

  getDayOfWeek(): DayOfWeek {
    return ((this.day - 1) % 7) as DayOfWeek;
  }

  isWeekend(): boolean {
    const dow = this.getDayOfWeek();
    return dow === DayOfWeek.Sat || dow === DayOfWeek.Sun;
  }

  toString(): string {
    const h = String(this.hour).padStart(2, '0');
    const m = String(this.minute).padStart(2, '0');
    return `[${this.day}일차(${dayOfWeekName(this.getDayOfWeek())}) ${h}:${m}]`;
  }

  isNight(): boolean { return this.hour >= 21 || this.hour < 5; }
  isMorning(): boolean { return this.hour >= 5 && this.hour < 12; }
  isAfternoon(): boolean { return this.hour >= 12 && this.hour < 18; }
  isEvening(): boolean { return this.hour >= 18 && this.hour < 21; }

  clone(): GameTime {
    const t = new GameTime();
    t.day = this.day;
    t.hour = this.hour;
    t.minute = this.minute;
    return t;
  }
}
