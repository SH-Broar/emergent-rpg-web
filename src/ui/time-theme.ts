// time-theme.ts — 게임 시간대별 UI 색상 테마
// 아침(5-12), 낮(12-18), 저녁(18-21), 밤(21-5)

import type { GameTime } from '../types/game-time';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

interface Theme {
  bg: string;
  bgPanel: string;
  bgCard: string;
  text: string;
  textDim: string;
  accent: string;
  accent2: string;
  border: string;
}

const THEMES: Record<TimeOfDay, Theme> = {
  morning: {
    bg:       '#0f1a10',
    bgPanel:  '#162414',
    bgCard:   '#1e3020',
    text:     '#e8ead8',
    textDim:  '#7a9470',
    accent:   '#e8a030',
    accent2:  '#1a3a18',
    border:   '#2e4430',
  },
  afternoon: {
    bg:       '#0a1520',
    bgPanel:  '#122035',
    bgCard:   '#1a2d48',
    text:     '#dde8f4',
    textDim:  '#5c82a8',
    accent:   '#48b0e0',
    accent2:  '#0a2a48',
    border:   '#1e3a58',
  },
  evening: {
    bg:       '#180f1a',
    bgPanel:  '#281828',
    bgCard:   '#361e38',
    text:     '#eedde0',
    textDim:  '#906070',
    accent:   '#e06858',
    accent2:  '#380a28',
    border:   '#4a2240',
  },
  night: {
    bg:       '#0f0f1a',
    bgPanel:  '#1a1a2e',
    bgCard:   '#222240',
    text:     '#e0e0e0',
    textDim:  '#777799',
    accent:   '#e94560',
    accent2:  '#0f3460',
    border:   '#333355',
  },
};

export function getTimeOfDay(gt: GameTime): TimeOfDay {
  if (gt.isMorning())   return 'morning';
  if (gt.isAfternoon()) return 'afternoon';
  if (gt.isEvening())   return 'evening';
  return 'night';
}

let _current: TimeOfDay | null = null;

export function applyTimeTheme(gt: GameTime): void {
  const tod = getTimeOfDay(gt);
  if (tod === _current) return;
  _current = tod;

  const t = THEMES[tod];
  const root = document.documentElement.style;
  root.setProperty('--bg',       t.bg);
  root.setProperty('--bg-panel', t.bgPanel);
  root.setProperty('--bg-card',  t.bgCard);
  root.setProperty('--text',     t.text);
  root.setProperty('--text-dim', t.textDim);
  root.setProperty('--accent',   t.accent);
  root.setProperty('--accent2',  t.accent2);
  root.setProperty('--border',   t.border);

  // data 속성으로 시간대 표시 (디버깅 / 추가 CSS 선택자용)
  document.documentElement.dataset.timeOfDay = tod;
}

export function resetTimeTheme(): void {
  _current = null;
}
