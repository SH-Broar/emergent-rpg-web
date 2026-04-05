// backlog.ts — 백로그 시스템
// 원본: Backlog.h

import { GameTime } from '../types/game-time';
import { LocationID } from '../types/location';

export interface BacklogEntry {
  time: GameTime;
  text: string;
  category: string; // "행동", "이벤트", "시스템", "대사"
  sourceActorName: string;
  sourceLocation: LocationID;
}

export class Backlog {
  private entries: BacklogEntry[] = [];

  add(time: GameTime, text: string, category = '시스템',
      sourceActorName = '', sourceLocation: LocationID = ''): void {
    this.entries.push({
      time: time.clone(),
      text,
      category,
      sourceActorName,
      sourceLocation,
    });
  }

  getAll(): readonly BacklogEntry[] { return this.entries; }

  getRecent(count: number): BacklogEntry[] {
    return this.entries.slice(-count);
  }

  getByCategory(category: string): BacklogEntry[] {
    return this.entries.filter(e => e.category === category);
  }

  formatRecent(count: number, textTransform?: (s: string) => string): string {
    const recent = this.getRecent(count);
    return recent.map(e => {
      const t = textTransform ? textTransform(e.text) : e.text;
      return `${e.time.toString()} ${t}`;
    }).join('\n');
  }

  size(): number { return this.entries.length; }

  clear(): void { this.entries = []; }
}
