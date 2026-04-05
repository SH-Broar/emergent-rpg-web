// ============================================================
// parser.ts — INI-style 데이터 파일 파서
// 원본: GameData.cpp:162-230
// ============================================================

export class DataSection {
  name = '';
  values = new Map<string, string>();
  /** key=value 형식이 아닌 평문 줄들 (lore.txt 등) */
  rawLines: string[] = [];

  get(key: string, def = ''): string {
    return this.values.get(key) ?? def;
  }

  getInt(key: string, def = 0): number {
    const v = this.values.get(key);
    if (v === undefined || v === '') return def;
    const n = parseInt(v, 10);
    return isNaN(n) ? def : n;
  }

  getFloat(key: string, def = 0): number {
    const v = this.values.get(key);
    if (v === undefined || v === '') return def;
    const n = parseFloat(v);
    return isNaN(n) ? def : n;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }
}

export function trimStr(s: string): string {
  return s.trim();
}

function stripUtf8Bom(line: string): string {
  if (line.charCodeAt(0) === 0xFEFF) return line.slice(1);
  return line;
}

function parseFileContent(text: string, sections: DataSection[]): void {
  let current: DataSection | null = null;
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (i === 0) line = stripUtf8Bom(line);
    line = line.trim();

    if (line.length === 0 || line[0] === '#' || line[0] === ';') continue;

    if (line[0] === '[' && line[line.length - 1] === ']') {
      current = new DataSection();
      current.name = line.slice(1, -1).trim();
      sections.push(current);
      continue;
    }

    if (current) {
      const eq = line.indexOf('=');
      if (eq !== -1) {
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        current.values.set(key, val);
      } else {
        // key=value 형식이 아닌 평문 줄 수집
        current.rawLines.push(line);
      }
    }
  }
}

/**
 * 데이터 파일 로드 (확장 파일 자동 병합).
 * 웹에서는 fetch()로 텍스트를 가져온 뒤 파싱.
 * addonTexts: basename+tag.ext 파일들의 텍스트 (이미 로드된 상태)
 */
export function loadFileFromText(baseText: string, addonTexts: string[] = []): DataSection[] {
  const sections: DataSection[] = [];
  parseFileContent(baseText, sections);
  for (const addon of addonTexts) {
    parseFileContent(addon, sections);
  }
  return sections;
}

// --- Parse utilities (GameData.cpp:124-160) ---

export function parsePairList(str: string): [string, string][] {
  if (!str) return [];
  return str.split(',').map(token => {
    const t = token.trim();
    const colon = t.indexOf(':');
    if (colon === -1) return null;
    return [t.slice(0, colon).trim(), t.slice(colon + 1).trim()] as [string, string];
  }).filter((x): x is [string, string] => x !== null);
}

export function parseTripleList(str: string): [string, string, string][] {
  if (!str) return [];
  return str.split(',').map(token => {
    const t = token.trim();
    const c1 = t.indexOf(':');
    if (c1 === -1) return null;
    const c2 = t.indexOf(':', c1 + 1);
    if (c2 === -1) return null;
    return [
      t.slice(0, c1).trim(),
      t.slice(c1 + 1, c2).trim(),
      t.slice(c2 + 1).trim(),
    ] as [string, string, string];
  }).filter((x): x is [string, string, string] => x !== null);
}

export function parseFloatList(str: string): number[] {
  if (!str) return [];
  return str.split(',').map(s => {
    const n = parseFloat(s.trim());
    return isNaN(n) ? 0 : n;
  });
}

export function parseStringList(str: string): string[] {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * "Element:float, Element:float" → ELEMENT_COUNT 크기의 float 배열
 * 예: "Earth:0.15, Fire:0.1" → [0.1, 0, 0, 0, 0.15, 0, 0, 0]
 */
export function parseColorInfluence(str: string): number[] {
  const ELEMENT_COUNT = 8;
  const result = new Array(ELEMENT_COUNT).fill(0);
  if (!str) return result;
  const ELEMENT_MAP: Record<string, number> = {
    Fire: 0, Water: 1, Electric: 2, Iron: 3,
    Earth: 4, Wind: 5, Light: 6, Dark: 7,
  };
  for (const token of str.split(',')) {
    const t = token.trim();
    const colon = t.indexOf(':');
    if (colon === -1) continue;
    const name = t.slice(0, colon).trim();
    const val = parseFloat(t.slice(colon + 1));
    const idx = ELEMENT_MAP[name];
    if (idx !== undefined && !isNaN(val)) result[idx] = val;
  }
  return result;
}

/**
 * "Item:amount:chance, ..." → LootEntry 형식 배열
 * chance 없으면 기본 1.0
 */
export function parseLootList(str: string): { item: string; amount: number; chance: number }[] {
  if (!str) return [];
  return str.split(',').map(token => {
    const t = token.trim();
    if (!t) return null;
    const parts = t.split(':');
    if (parts.length < 2) return null;
    const item = parts[0].trim();
    const amount = parseInt(parts[1], 10) || 1;
    const chance = parts.length >= 3 ? parseFloat(parts[2]) : 1.0;
    return { item, amount, chance: isNaN(chance) ? 1.0 : chance };
  }).filter((x): x is { item: string; amount: number; chance: number } => x !== null);
}
