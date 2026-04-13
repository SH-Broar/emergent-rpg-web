// global-save.ts — 글로벌 세이브 (런 간 공유 데이터)
// 게임 세이브 슬롯과 독립적으로 유지되는 전역 상태.

const GLOBAL_SAVE_KEY = 'rdc-global-save';

export interface GlobalSave {
  hasEverStarted: boolean;
  unlockedRdcPacks: string[];
  activeRdcPacks: string[];
}

function defaultGlobalSave(): GlobalSave {
  return { hasEverStarted: false, unlockedRdcPacks: [], activeRdcPacks: [] };
}

export function getGlobalSave(): GlobalSave {
  try {
    const raw = localStorage.getItem(GLOBAL_SAVE_KEY);
    if (!raw) return defaultGlobalSave();
    const parsed = JSON.parse(raw) as Partial<GlobalSave>;
    return {
      hasEverStarted: parsed.hasEverStarted ?? false,
      unlockedRdcPacks: parsed.unlockedRdcPacks ?? [],
      activeRdcPacks: parsed.activeRdcPacks ?? [],
    };
  } catch {
    return defaultGlobalSave();
  }
}

export function saveGlobalSave(gs: GlobalSave): void {
  localStorage.setItem(GLOBAL_SAVE_KEY, JSON.stringify(gs));
}

/** 최초 게임 시작 기록. 이미 true이면 아무것도 하지 않는다. */
export function markHasEverStarted(): void {
  const gs = getGlobalSave();
  if (!gs.hasEverStarted) {
    gs.hasEverStarted = true;
    saveGlobalSave(gs);
  }
}

/** 팩 해금 및 자동 활성화. 이미 해금된 경우 무시. */
export function unlockRdcPack(packId: string): void {
  const gs = getGlobalSave();
  if (!gs.unlockedRdcPacks.includes(packId)) {
    gs.unlockedRdcPacks.push(packId);
    if (!gs.activeRdcPacks.includes(packId)) {
      gs.activeRdcPacks.push(packId);
    }
    saveGlobalSave(gs);
  }
}

/** 팩 활성/비활성 토글. 해금된 팩에만 의미 있음. */
export function setRdcPackActive(packId: string, active: boolean): void {
  const gs = getGlobalSave();
  if (active && !gs.activeRdcPacks.includes(packId)) {
    gs.activeRdcPacks.push(packId);
  } else if (!active) {
    gs.activeRdcPacks = gs.activeRdcPacks.filter(id => id !== packId);
  }
  saveGlobalSave(gs);
}
