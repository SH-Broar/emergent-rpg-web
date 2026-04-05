// ============================================================
// rng.ts — 시드 기반 PRNG (C++ mt19937 대응)
// 원본: Types.h:15-52
// ============================================================
// Mulberry32: 가볍고 시드 재현 가능한 32비트 PRNG
// mt19937과 동일 시퀀스는 아니지만, 시드→결과 재현성은 보장

let _seed = Date.now() >>> 0;
let _state = _seed;

function mulberry32(): number {
  _state = (_state + 0x6D2B79F5) >>> 0;
  let t = Math.imul(_state ^ (_state >>> 15), 1 | _state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function seedRNG(seed: number): void {
  _seed = seed >>> 0;
  _state = _seed;
}

export function serializeRNGState(): string {
  return `${_seed}:${_state}`;
}

export function deserializeRNGState(s: string): boolean {
  const parts = s.split(':');
  if (parts.length !== 2) return false;
  const seed = parseInt(parts[0], 10);
  const state = parseInt(parts[1], 10);
  if (isNaN(seed) || isNaN(state)) return false;
  _seed = seed >>> 0;
  _state = state >>> 0;
  return true;
}

export function randomFloat(min: number, max: number): number {
  return min + mulberry32() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(min + mulberry32() * (max - min + 1));
}

export function weightedRandomChoice(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = mulberry32() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
