/**
 * 한국어 조사 선택 — 앞 단어의 *마지막 글자 받침*에 따라 올바른 조사를 고른다.
 *
 * UI/토스트에서 `${name}을(를)` 같은 이중표기를 없애기 위한 헬퍼.
 *   예: `${name}${eulReul(name)}` → "들곡 씨앗을" / "사냥감를"이 아니라 "사냥감을".
 *
 * 비한글(숫자·영문)로 끝나면 받침 판별 불가 → 기본값(받침 있음 형태: 을/이/은/과/으로)로 폴백.
 * (정확한 숫자 읽기 기반 조사는 범위 밖 — 게임 명사는 거의 한글이라 충분.)
 */

/** 마지막 글자가 한글 음절이고 받침이 있으면 true, 없으면 false, 한글이 아니면 null. */
function finalConsonant(word: string): boolean | null {
  if (!word) return null;
  const code = word.charCodeAt(word.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0;
  }
  return null;
}

/** 마지막 글자 받침이 ㄹ인가 — (으)로 판정용. */
function endsWithRieul(word: string): boolean {
  if (!word) return false;
  const code = word.charCodeAt(word.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 8;
  return false;
}

/** 목적격 을/를. */
export function eulReul(word: string): string {
  return finalConsonant(word) === false ? '를' : '을';
}

/** 주격 이/가. */
export function iGa(word: string): string {
  return finalConsonant(word) === false ? '가' : '이';
}

/** 보조사 은/는. */
export function eunNeun(word: string): string {
  return finalConsonant(word) === false ? '는' : '은';
}

/** 접속 와/과. */
export function waGwa(word: string): string {
  return finalConsonant(word) === false ? '와' : '과';
}

/** 방향/수단 (으)로 — 받침 없거나 ㄹ받침이면 '로', 그 외 '으로'. */
export function euRo(word: string): string {
  return finalConsonant(word) === false || endsWithRieul(word) ? '로' : '으로';
}
