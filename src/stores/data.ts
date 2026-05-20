/**
 * Pinia 스토어 — 게임 데이터 (런타임 캐시).
 *
 * 모든 getter에 명시적 return type — TS 6 strict + Pinia reactivity unwrap 대응.
 */

import { defineStore } from 'pinia';
import { loadAllData, type GameData } from '@/data/loader';
import type {
  Boss,
  Card,
  ChaosModifier,
  Equipment,
  Event,
  Item,
  MetaUnlock,
  Monster,
  NodeMap,
  Npc,
  Race,
  Relic,
  Timeline,
} from '@/data/schemas';

interface State {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  data: GameData | null;
}

export const useDataStore = defineStore('data', {
  state: (): State => ({
    loaded: false,
    loading: false,
    error: null,
    data: null,
  }),

  getters: {
    timelines(state): Map<string, Timeline> {
      return state.data?.timelines ?? new Map<string, Timeline>();
    },
    races(state): Map<string, Race> {
      return state.data?.races ?? new Map<string, Race>();
    },
    cards(state): Map<string, Card> {
      return state.data?.cards ?? new Map<string, Card>();
    },
    relics(state): Map<string, Relic> {
      return state.data?.relics ?? new Map<string, Relic>();
    },
    events(state): Map<string, Event> {
      return state.data?.events ?? new Map<string, Event>();
    },
    bosses(state): Map<string, Boss> {
      return state.data?.bosses ?? new Map<string, Boss>();
    },
    monsters(state): Map<string, Monster> {
      return state.data?.monsters ?? new Map<string, Monster>();
    },
    nodeMaps(state): Map<string, NodeMap> {
      return state.data?.nodeMaps ?? new Map<string, NodeMap>();
    },
    npcs(state): Map<string, Npc> {
      return state.data?.npcs ?? new Map<string, Npc>();
    },
    items(state): Map<string, Item> {
      return state.data?.items ?? new Map<string, Item>();
    },
    equipments(state): Map<string, Equipment> {
      return state.data?.equipments ?? new Map<string, Equipment>();
    },
    chaos(state): Map<string, ChaosModifier> {
      return state.data?.chaos ?? new Map<string, ChaosModifier>();
    },
    clues(state): Map<string, import('@/data/schemas').Clue> {
      return state.data?.clues ?? new Map<string, import('@/data/schemas').Clue>();
    },
    unlocks(state): Map<string, MetaUnlock> {
      return state.data?.unlocks ?? new Map<string, MetaUnlock>();
    },
  },

  actions: {
    async ensureLoaded() {
      if (this.loaded || this.loading) return;
      this.loading = true;
      this.error = null;
      try {
        const data = await loadAllData();
        this.data = data;
        this.loaded = true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        console.error('[data] load failed:', err);
      } finally {
        this.loading = false;
      }
    },
  },
});
