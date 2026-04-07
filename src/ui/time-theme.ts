// time-theme.ts — 게임 시간대별 UI 색상 테마
// 시간대: 아침(5-12), 낮(12-18), 저녁(18-21), 밤(21-5)
// 모드:   dark / light  (localStorage 영속)

import type { GameTime } from '../types/game-time';

export type TimeOfDay  = 'morning' | 'afternoon' | 'evening' | 'night';
export type ColorMode  = 'dark' | 'light';

const MODE_KEY = 'rdc-color-mode';

interface Theme {
  bg: string; bgPanel: string; bgCard: string;
  text: string; textDim: string;
  accent: string; accent2: string; border: string;
}

// ── 다크 테마 ────────────────────────────────────────────────
const DARK: Record<TimeOfDay, Theme> = {
  morning: {
    bg: '#0f1a10', bgPanel: '#162414', bgCard: '#1e3020',
    text: '#e8ead8', textDim: '#7a9470',
    accent: '#e8a030', accent2: '#1a3a18', border: '#2e4430',
  },
  afternoon: {
    bg: '#0a1520', bgPanel: '#122035', bgCard: '#1a2d48',
    text: '#dde8f4', textDim: '#5c82a8',
    accent: '#48b0e0', accent2: '#0a2a48', border: '#1e3a58',
  },
  evening: {
    bg: '#180f1a', bgPanel: '#281828', bgCard: '#361e38',
    text: '#eedde0', textDim: '#906070',
    accent: '#e06858', accent2: '#380a28', border: '#4a2240',
  },
  night: {
    bg: '#0f0f1a', bgPanel: '#1a1a2e', bgCard: '#222240',
    text: '#e0e0e0', textDim: '#777799',
    accent: '#e94560', accent2: '#0f3460', border: '#333355',
  },
};

// ── 라이트 테마 ──────────────────────────────────────────────
const LIGHT: Record<TimeOfDay, Theme> = {
  morning: {
    bg: '#fdf8ee', bgPanel: '#fff3d8', bgCard: '#fde8c0',
    text: '#2a1800', textDim: '#8a6030',
    accent: '#c86a00', accent2: '#fde0a0', border: '#e8c870',
  },
  afternoon: {
    bg: '#eef6ff', bgPanel: '#ddeef8', bgCard: '#c8e4f5',
    text: '#061220', textDim: '#3a6080',
    accent: '#0878b8', accent2: '#a8d8f0', border: '#78b8e0',
  },
  evening: {
    bg: '#fff4ee', bgPanel: '#ffe8d8', bgCard: '#ffd8c0',
    text: '#2a0800', textDim: '#904040',
    accent: '#b83820', accent2: '#ffc0a0', border: '#e89070',
  },
  night: {
    bg: '#f0f0f8', bgPanel: '#e4e4f0', bgCard: '#d8d8ec',
    text: '#080818', textDim: '#505080',
    accent: '#5530a0', accent2: '#c0c0e0', border: '#a0a0d0',
  },
};

// ── 상태 ────────────────────────────────────────────────────
/** `${TimeOfDay}-${ColorMode}` — 변경이 없으면 재적용 스킵 */
let _cacheKey: string | null = null;

// ── 공개 API ─────────────────────────────────────────────────
export function getColorMode(): ColorMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'dark';
}

export function setColorMode(mode: ColorMode): void {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  _cacheKey = null; // 캐시 무효화 → 다음 applyTimeTheme 시 강제 재적용
}

export function toggleColorMode(): ColorMode {
  const next: ColorMode = getColorMode() === 'dark' ? 'light' : 'dark';
  setColorMode(next);
  return next;
}

export function getTimeOfDay(gt: GameTime): TimeOfDay {
  if (gt.isMorning())   return 'morning';
  if (gt.isAfternoon()) return 'afternoon';
  if (gt.isEvening())   return 'evening';
  return 'night';
}

export function applyTimeTheme(gt: GameTime): void {
  const tod  = getTimeOfDay(gt);
  const mode = getColorMode();
  const key  = `${tod}-${mode}`;
  if (key === _cacheKey) return;
  _cacheKey = key;

  const t    = (mode === 'light' ? LIGHT : DARK)[tod];
  const root = document.documentElement.style;
  root.setProperty('--bg',       t.bg);
  root.setProperty('--bg-panel', t.bgPanel);
  root.setProperty('--bg-card',  t.bgCard);
  root.setProperty('--text',     t.text);
  root.setProperty('--text-dim', t.textDim);
  root.setProperty('--accent',   t.accent);
  root.setProperty('--accent2',  t.accent2);
  root.setProperty('--border',   t.border);

  document.documentElement.dataset.timeOfDay  = tod;
  document.documentElement.dataset.colorMode  = mode;
}

export function resetTimeTheme(): void {
  _cacheKey = null;
}
