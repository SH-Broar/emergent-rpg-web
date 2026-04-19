// 던전 S랭크(클리어 턴 상한) — dungeons.txt의 sRankTurnLimit과 동기화되어야 함.
// 입수 조건 등에서 DungeonSystem 없이 조회할 때 사용.

const limits = new Map<string, number>();

/** 던전 데이터 로드 직전에 호출 */
export function clearDungeonSRankRegistry(): void {
  limits.clear();
}

export function registerDungeonSRankLimit(dungeonId: string, maxTurns: number): void {
  if (maxTurns > 0) limits.set(dungeonId, maxTurns);
}

export function getDungeonSRankTurnLimit(dungeonId: string): number | undefined {
  return limits.get(dungeonId);
}

// ── 던전 display name → id 매핑 ─────────────────────────────
// 기본 alias (수동 등록) — 구버전 조건문 호환 용도.
// data-init.ts의 initDungeonSystem 호출 후 자동 등록이 여기에 덮어쓰지 않도록 has() 체크.
const DISPLAY_NAME_TO_ID: Record<string, string> = {
  '마력 정원': 'Mana_Garden',
  '마력 골짜기': 'Mana_Valley',
  '마력 폭포': 'Mana_Falls',
};

/**
 * 던전 display name을 id로 등록. 이미 등록된 이름은 덮어쓰지 않음 (alias 우선).
 * 주로 data-init이 dungeons.txt 로딩 후 일괄 등록 시 사용.
 */
export function registerDungeonDisplayName(name: string, id: string): void {
  const clean = name.trim();
  if (!clean) return;
  if (Object.prototype.hasOwnProperty.call(DISPLAY_NAME_TO_ID, clean)) return;
  DISPLAY_NAME_TO_ID[clean] = id;
}

export function resolveDungeonIdForSRankDisplayName(displayName: string): string | undefined {
  return DISPLAY_NAME_TO_ID[displayName.trim()];
}
