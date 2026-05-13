/**
 * Pinia 스토어 — 도감 (휘발 재화의 영구 기록).
 *
 * spec v2 Round 11: 골드/스탯/스킬/유물/카드는 한 런 휘발이지만,
 * 도감에는 영구 기록되어 "흔적이 누적되는 주인공" 비전의 수집적 표현이 된다.
 *
 * 단, 도감 데이터는 meta 스토어 안에 저장된다 (단일 localStorage 키).
 * 이 스토어는 meta 스토어의 codex 부분만 보는 *thin wrapper*.
 */

import { defineStore } from 'pinia';
import type { CodexEntry } from '@/data/schemas';
import { useMetaStore } from './meta';

export const useCodexStore = defineStore('codex', {
  getters: {
    entries(): CodexEntry[] {
      return useMetaStore().codex;
    },

    entryCount(): number {
      return useMetaStore().codex.length;
    },

    byKind(): Record<CodexEntry['kind'], CodexEntry[]> {
      const grouped: Record<CodexEntry['kind'], CodexEntry[]> = {
        card: [],
        relic: [],
        npc: [],
        event: [],
        boss: [],
        timeline: [],
      };
      for (const e of useMetaStore().codex) {
        grouped[e.kind].push(e);
      }
      return grouped;
    },
  },

  actions: {
    /** 도감에 항목 추가 또는 카운트 증가. */
    register(kind: CodexEntry['kind'], id: string) {
      const meta = useMetaStore();
      const existing = meta.codex.find((e) => e.id === id && e.kind === kind);
      if (existing) {
        meta.upsertCodexEntry({
          ...existing,
          encounterCount: existing.encounterCount + 1,
        });
      } else {
        meta.upsertCodexEntry({
          id,
          kind,
          discoveredAt: Date.now(),
          encounterCount: 1,
        });
      }
    },

    /** 런 종료 시 newCardEncounters 등을 일괄 등록. */
    absorbRunEncounters(input: {
      cards?: string[];
      relics?: string[];
      npcs?: string[];
      bosses?: string[];
    }) {
      if (input.cards) input.cards.forEach((id) => this.register('card', id));
      if (input.relics) input.relics.forEach((id) => this.register('relic', id));
      if (input.npcs) input.npcs.forEach((id) => this.register('npc', id));
      if (input.bosses) input.bosses.forEach((id) => this.register('boss', id));
    },
  },
});
