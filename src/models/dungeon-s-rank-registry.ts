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

const DISPLAY_NAME_TO_ID: Record<string, string> = {
  '마력 정원': 'Mana_Garden',
  '마력 골짜기': 'Mana_Valley',
  '마력 폭포': 'Mana_Falls',
};

export function resolveDungeonIdForSRankDisplayName(displayName: string): string | undefined {
  return DISPLAY_NAME_TO_ID[displayName.trim()];
}
