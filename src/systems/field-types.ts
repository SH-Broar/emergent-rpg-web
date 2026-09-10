import type { GridPos } from '@/data/schemas/base';

import { GESTURE_CATALOG } from './gesture-catalog';
export const GESTURES = GESTURE_CATALOG.map(g => g.id);
export type Gesture = string;
export const GLYPHS: Record<Gesture, string> = Object.fromEntries(GESTURE_CATALOG.map(g => [g.id,g.glyph]));
export type FieldTile = 'grass' | 'path' | 'water' | 'wall' | 'soil' | 'stone';
export interface FieldExit { pos: GridPos; to: string; label: string; requirement?: string }
export interface FieldSpace {
  id: string;
  nodeId: string;
  name: string;
  width: number;
  height: number;
  tiles: FieldTile[][];
  spawn: GridPos;
  exits: FieldExit[];
  dungeon?: { origin: string; floor: number; totalFloors: number };
  cleared?: boolean;
}
export interface FieldState {
  version: 1;
  /** Exact game time. Legacy systems settle each 864 seconds without rounding movement. */
  elapsedSeconds: number;
  selectedItem?: string;
  gestureXp: Partial<Record<Gesture, number>>;
  /** Each meaningful target change can award practice once per minute. */
  practiceAt: Record<string, number>;
  spoken: Record<string, number>;
  lastNpcStep: number;
  lastWorldStep: number;
  sequence: number;
  completedDungeons: string[];
  controlsVersion?: 2;
}
export interface FieldCreature {
  definitionId: string;
  rank: 'normal' | 'elite' | 'boss';
  maxHp: number;
  attack: number;
  range: number;
  /** Locked cells of the next attack; player and NPCs can leave them. */
  intent?: GridPos[];
  angry?: boolean;
  defeated?: boolean;
  phase?: number;
  reward: { gold: number; shards: number; itemId?: string };
}
export interface FieldSpeech { actorId: string; name: string; lines: string[] }
export interface FieldResult { ok: boolean; message: string; speech?: FieldSpeech; travel?: boolean; changed?: string[]; targetId?: string; targetPos?: GridPos }
