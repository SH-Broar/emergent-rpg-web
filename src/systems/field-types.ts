import type { ProductionMode } from './life-production';
import type { GridPos } from '@/data/schemas/base';

import { GESTURE_CATALOG } from './gesture-catalog';
export const GESTURES = GESTURE_CATALOG.map(g => g.id);
export type Gesture = string;
export const GLYPHS: Record<Gesture, string> = Object.fromEntries(GESTURE_CATALOG.map(g => [g.id,g.glyph]));
export type FieldTile = 'grass' | 'path' | 'water' | 'wall' | 'soil' | 'stone' | 'sand' | 'wood';
export interface FieldExit { pos: GridPos; to: string; label: string; requirement?: string; destination?:string; roads?:number }
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
  layoutVersion?: 2 | 3;
  theme?: string;
  housingVersion?:1;
  basesVersion?:1;
  residence?:{parent:string;kind:'home'|'court'|'commons'|'player-home'|'inn';npcId?:string};
  road?: {from:string;to:string;index:number;count:number};
}
export interface FieldState {
  version: 1;
  /** Exact game time. Legacy systems settle each 864 seconds without rounding movement. */
  elapsedSeconds: number;
  selectedItem?: string;
  productionMode?: ProductionMode;
  gestureXp: Partial<Record<Gesture, number>>;
  /** Each meaningful target change can award practice once per minute. */
  practiceAt: Record<string, number>;
  spoken: Record<string, number>;
  lastNpcStep: number;
  lastWorldStep: number;
  sequence: number;
  completedDungeons: string[];
  controlsVersion?: 2 | 3;
  combatVersion?: 1;
  formVersion?: 1;
  residentsVersion?:1;
  bases?:{owned:Record<string,boolean>;rentals:Record<string,number>;lastHouse:string;knockouts:number};
  knockoutReason?:'tamamo';
  clearedAt?:number;
  residentEvents?:Record<string,number>;
  skills?: import('./field-skills').FieldSkills;
  /** Inactive bodies retain their learned skills and absolute cooldowns. */
  formTraining?: Record<string,{cards:import('@/data/schemas').Card[];skills:import('./field-skills').FieldSkills}>;
  manaStep?: number;
  encounter?: FieldSpeech;
  notification?: FieldSpeech;
}
export interface FieldCreature {
  definitionId: string;
  species?: string;
  balanceVersion?: 1;
  pending?: FieldAttack;
  recovery?: number;
  tempoStep?: number;
  engaged?: boolean;
  challengeAfter?: number;
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
export interface FieldSpeech { actorId: string; name: string; lines: string[]; topics?: {label:string;lines:string[];action?:string;confirmLabel?:string}[] }
export interface FieldResult { ok: boolean; message: string; speech?: FieldSpeech; travel?: boolean; route?:string; changed?: string[]; targetId?: string; targetPos?: GridPos }

export interface FieldAttack {
  name:string;
  cells:{pos:GridPos;multiplier:number}[];
  damage:number;
  status?:string;
  transform?: import('@/data/schemas/monster').GridAttack['transform'];
  remaining:number;
  castTurns:number;
  castSpeed:'fast'|'normal'|'slow';
}
