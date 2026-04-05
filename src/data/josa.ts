// ============================================================
// josa.ts — 한국어 조사 처리
// 원본: Josa.h/.cpp
// ============================================================

function lastCodepoint(s: string): number {
  if (s.length === 0) return 0;
  const code = s.codePointAt(s.length - (s.charCodeAt(s.length - 1) >= 0xDC00 ? 2 : 1));
  return code ?? 0;
}

function hangulJongseongIndex(ch: number): number {
  if (ch < 0xAC00 || ch > 0xD7A3) return -1;
  return (ch - 0xAC00) % 28;
}

function hasBatchim(ch: number): boolean {
  return hangulJongseongIndex(ch) > 0;
}

export function iGa(noun: string): string {
  const ch = lastCodepoint(noun);
  if (hangulJongseongIndex(ch) >= 0) return hasBatchim(ch) ? '이' : '가';
  return '가';
}

export function eulReul(noun: string): string {
  const ch = lastCodepoint(noun);
  if (hangulJongseongIndex(ch) >= 0) return hasBatchim(ch) ? '을' : '를';
  return '를';
}

export function gwaWa(noun: string): string {
  const ch = lastCodepoint(noun);
  if (hangulJongseongIndex(ch) >= 0) return hasBatchim(ch) ? '과' : '와';
  return '와';
}

export function euroRo(noun: string): string {
  const ch = lastCodepoint(noun);
  const j = hangulJongseongIndex(ch);
  if (j >= 0) {
    if (j === 0 || j === 8) return '로'; // 무종성 or ㄹ 받침
    return '으로';
  }
  return '로';
}
