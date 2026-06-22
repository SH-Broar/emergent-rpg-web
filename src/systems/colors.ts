/**
 * 컬러 값 시스템 — *게임의 축*.
 *
 * 사용자 사양:
 *  - 컬러 상한 100. 시작 ≈ 0, 종족 시드로 한 컬러당 최대 5.
 *  - 80 이상이 *후반 임계*의 대표 예시 (채집 후반, 강한 이벤트 선택지 등).
 *  - 컬러를 어떻게 올리느냐가 *모든 시스템의 등뼈*.
 *
 * 본 모듈은 *단일 진입점*. 직접 colors[k] += N 하지 말고 applyColorBoost / applySeedColors 사용.
 */

import type { ColorValues } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import { colorLabel } from '@/systems/labels';

export const COLOR_MAX = 100;

/**
 * 컬러 상승 팝 억제 플래그 — 런 시작 시드 컬러(applySeedColors)는 한꺼번에 8색이 오르므로
 * 상단 팝이 폭주하지 않게 잠시 끈다. 게임 중 실제 행동으로 오르는 컬러만 팝을 띄운다.
 */
let suppressColorPop = false;

export type ColorKey = keyof ColorValues;

const ALL_COLORS: ColorKey[] = [
  'fire', 'water', 'electric', 'iron',
  'earth', 'wind', 'light', 'dark',
];

/**
 * 컬러 상승 훅 — on-color-gain 유물 발동용. main.ts가 relic.fireColorGain을 등록.
 * colors.ts↔relic.ts 순환을 피하려 콜백 주입. inColorGain 가드로 무한 재귀 차단
 * (훅 내부가 다시 applyColorBoost를 호출해도 재발동하지 않음).
 */
let colorGainHook: ((color: ColorKey, delta: number) => void) | null = null;
let inColorGain = false;
export function setColorGainHook(fn: (color: ColorKey, delta: number) => void): void {
  colorGainHook = fn;
}

/** 단일 컬러에 amount를 더하고 상한 100 적용. lines 주어지면 결과 텍스트 push. */
export function applyColorBoost(color: ColorKey, amount: number, lines?: string[]): number {
  if (amount === 0) return 0;
  const run = useRunStore();
  const c = run.data.colors;
  const before = c[color];
  const after = Math.max(0, Math.min(COLOR_MAX, before + amount));
  c[color] = after;
  const delta = after - before;
  if (lines && delta !== 0) {
    lines.push(`컬러: ${colorLabel(color)} ${delta >= 0 ? '+' : ''}${delta} (${after}/${COLOR_MAX})`);
  }
  // 컬러가 실제로 *오른* 경우에만 on-color-gain 발동 (재진입 가드).
  if (delta > 0 && colorGainHook && !inColorGain) {
    inColorGain = true;
    try {
      colorGainHook(color, delta);
    } finally {
      inColorGain = false;
    }
  }
  // 컬러 상승 시각 피드백(item 6) — 상단 중앙 팝. 시드 컬러 일괄 적용 중엔 억제.
  if (delta > 0 && !suppressColorPop) {
    try {
      useUiStore().colorPop(color, delta, after);
    } catch {
      // 스토어 미초기화(테스트 등) — 팝 생략, 핵심 로직 무영향.
    }
  }
  // (F5: 색→최대 HP(VIT)는 은퇴. 물=드로우·바람=이동으로 분리됐으므로 HP 재조정 없음.)
  return delta;
}

/** 8 컬러 모두에 amount 일괄 적용. */
export function applyColorBoostAll(amount: number, lines?: string[]): void {
  for (const k of ALL_COLORS) {
    applyColorBoost(k, amount);
  }
  if (lines && amount !== 0) {
    lines.push(`컬러: 모든 컬러 ${amount >= 0 ? '+' : ''}${amount}`);
  }
}

/** 종족·캐릭터 시드 컬러 적용 — 런 시작 시 1회 호출. cap은 100. (시드 일괄 적용 중엔 상단 팝 억제.) */
export function applySeedColors(seed: Partial<ColorValues> | undefined): void {
  if (!seed) return;
  suppressColorPop = true;
  try {
    for (const [k, v] of Object.entries(seed)) {
      if (typeof v !== 'number') continue;
      applyColorBoost(k as ColorKey, v);
    }
  } finally {
    suppressColorPop = false;
  }
}

/** 현재 컬러가 임계 이상인지 — 채집 후반 분기 등에서 사용. */
export function hasColorAtLeast(color: ColorKey, threshold: number): boolean {
  const run = useRunStore();
  return run.data.colors[color] >= threshold;
}
