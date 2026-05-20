/**
 * 메타 해금 — 런 풀 가용성 판정.
 *
 * 어떤 해금 항목(data.unlocks)의 grants에 포함된 카드/유물은 *기본 잠금*.
 * meta.unlockedCardIds / unlockedRelicIds 에 들어와야 런 풀(상점·공방·마을 제작)에 등장.
 * grants에 없는 카드/유물은 항상 가용(잠금 대상 아님).
 *
 * 디버그 unlockAll이면 전부 가용.
 */

import { useDataStore } from '@/stores/data';
import { useMetaStore } from '@/stores/meta';
import { useUiStore } from '@/stores/ui';
import type { Card, Relic } from '@/data/schemas';

/** 해금 항목들이 잠그는 카드 id 집합. */
function lockedCardIdSet(): Set<string> {
  const s = new Set<string>();
  for (const u of useDataStore().unlocks.values()) {
    for (const id of u.grantsCardIds ?? []) s.add(id);
  }
  return s;
}

/** 해금 항목들이 잠그는 유물 id 집합. */
function lockedRelicIdSet(): Set<string> {
  const s = new Set<string>();
  for (const u of useDataStore().unlocks.values()) {
    for (const id of u.grantsRelicIds ?? []) s.add(id);
  }
  return s;
}

/** 런 풀에 등장 가능한 카드만 — 잠긴(미해금) 카드 제외. */
export function availableCards(): Card[] {
  if (useUiStore().debug.unlockAll) return [...useDataStore().cards.values()];
  const locked = lockedCardIdSet();
  const unlocked = new Set(useMetaStore().unlockedCardIds);
  return [...useDataStore().cards.values()].filter(
    (c) => !locked.has(c.id) || unlocked.has(c.id),
  );
}

/** 런 풀에 등장 가능한 유물만 — 잠긴(미해금) 유물 제외. */
export function availableRelics(): Relic[] {
  if (useUiStore().debug.unlockAll) return [...useDataStore().relics.values()];
  const locked = lockedRelicIdSet();
  const unlocked = new Set(useMetaStore().unlockedRelicIds);
  return [...useDataStore().relics.values()].filter(
    (r) => !locked.has(r.id) || unlocked.has(r.id),
  );
}
