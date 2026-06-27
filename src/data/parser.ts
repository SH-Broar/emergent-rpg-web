/**
 * INI-style 파서 (legacy 호환).
 *
 * 분기 A (하이브리드): 입력은 INI .txt, 내부 모델은 JSON.
 * 이 파서는 .txt → 중간 표현(섹션 → 키 → 값) 까지만 담당하며,
 * 도메인 스키마 변환은 각 schema 모듈의 `from()` 함수가 수행한다.
 *
 * legacy 포맷 호환:
 *   [section]
 *   key = value        # 주석
 *   key2 = a, b, c     ; 주석2 (콤마 분리 리스트)
 *
 * 한국어 처리: UTF-8 가정. 다중바이트 안전.
 */

export type IniValue = string;
export type IniSection = Record<string, IniValue>;
export type IniData = Record<string, IniSection>;

const COMMENT_PREFIXES = ['#', ';'];

/**
 * 한 줄에서 주석을 제거한다. (값 안에 따옴표가 있으면 그 안의 #/;는 보존)
 * MVR 단계에서는 따옴표 처리는 생략 — 필요 시 확장.
 */
function stripComment(line: string): string {
  let cut = -1;
  for (const prefix of COMMENT_PREFIXES) {
    const idx = line.indexOf(prefix);
    if (idx >= 0 && (cut === -1 || idx < cut)) cut = idx;
  }
  return cut >= 0 ? line.slice(0, cut) : line;
}

/**
 * INI 텍스트를 파싱하여 섹션별 키-값 맵을 반환한다.
 * 동일 키 재정의 시: 마지막 값이 우선.
 * 섹션 없는 라인은 `__default__` 섹션으로 들어간다.
 */
export function parseIni(text: string): IniData {
  const result: IniData = {};
  let currentSection = '__default__';
  result[currentSection] = {};

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const cleaned = stripComment(rawLine).trim();
    if (cleaned.length === 0) continue;

    // [section]
    if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
      currentSection = cleaned.slice(1, -1).trim();
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }

    // key = value
    const eqIdx = cleaned.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = cleaned.slice(0, eqIdx).trim();
    let value = cleaned.slice(eqIdx + 1).trim();
    if (value.includes('\\n')) {
      value = value.replace(/\\n/g, '\n');
    }
    if (!key) continue;
    result[currentSection][key] = value;
  }

  // __default__ 섹션이 비어있으면 제거
  if (Object.keys(result.__default__).length === 0) {
    delete result.__default__;
  }

  return result;
}

/**
 * 콤마 분리 값을 배열로 분해. 공백 제거. 빈 토큰 제외.
 */
export function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 숫자 변환 (실패 시 fallback).
 */
export function parseNumber(value: string | undefined, fallback = 0): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * boolean 변환. 'true', '1', 'yes', 'on' = true.
 */
export function parseBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  const v = value.toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

/**
 * 파일 fetch + parse. Vite 환경에서 public/ 경로 기준.
 */
export async function fetchIni(path: string): Promise<IniData> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const text = await res.text();
  return parseIni(text);
}
