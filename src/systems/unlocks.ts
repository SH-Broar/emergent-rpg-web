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

/** 런 풀에 등장 가능한 카드만 — 잠긴(미해금) 카드 + 잡카드(source=junk) 제외. */
export function availableCards(): Card[] {
  // 잡카드(junk)·변신 폼 카드(form)는 특수 전용 — 어떤 풀(상점/공방/보상)에도 등장 금지.
  // 강화판(`-plus`)도 *어떤 풀에도 등장 금지* — 강화판은 *공방 강화*로만 얻는다(마을 제작·상점 제외).
  //   (활동 보상은 별도로 base 카드를 가끔 강화형으로 올려 지급 — activity.ts.)
  const all = [...useDataStore().cards.values()].filter(
    (c) => c.source !== 'junk' && c.source !== 'form' && !c.id.endsWith('-plus'),
  );
  if (useUiStore().debug.unlockAll) return all;
  const locked = lockedCardIdSet();
  const unlocked = new Set(useMetaStore().unlockedCardIds);
  return all.filter((c) => !locked.has(c.id) || unlocked.has(c.id));
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
