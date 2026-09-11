import type { ColorValues, PlotState } from '@/data/schemas';
import type { GridPos } from '@/data/schemas/base';
import type { FieldCreature, FieldSpace } from '../field-types';

export const PLAYER_ACTOR_ID = 'player';
export type ColorProfile = Partial<ColorValues>;
export interface ProductionBatch {
  id: string;
  recipeId: string;
  producerId: string;
  startedTurn: number;
  duration: number;
  settled: boolean;
  output: Record<string, number>;
  plot?: PlotState;
  level: number;
  colorValue: number;
  upper: boolean;
  /** Fixed at planting; care changes the quality threshold, never rerolls the batch. */
  qualityRoll?: number;
  automaticCare: boolean;
  careProperty?: string;
}
export interface SocialProfile {
  species: string;
  profession: string;
  /** Individual values; species never implies a moral alignment. */
  values: { sharing: number; labor: number; safety: number; curiosity: number };
  needs: { food: number; work: number; rest: number; curiosity: number };
  skills: Record<string, number>;
  norms: { foodSharing: number; laborRespect: number; harmAversion: number };
  /** Authored local/association/individual norms; species does not assign morality. */
  normScopes?: Partial<Record<'individual' | 'guild' | 'region' | 'culture', Partial<SocialProfile['norms']>>>;
  relations: Record<string, { trust: number; regard: number }>;
  beliefs: { factId: number; subjectId?: string; confidence: number; interpretation: string; trustDelta: number }[];
  nextActionTurn: number;
  homeNodeId: string;
}
export interface WorldEntity {
  id: string;
  name: string;
  kind: 'actor' | 'resource' | 'facility' | 'plot' | 'terrain';
  nodeId: string;
  pos?: GridPos;
  carriedBy?: string;
  npcId?: string;
  creature?: FieldCreature;
  form?: { raceId: string; originalSpecies: string; sourceId?: string };
  fieldUpdatedAt?: number;
  fieldNpcAt?: number;
  routine?:{goal:string;activity:string;route:string[];nextAt:number;travel?:{to:string;arrivesAt:number;from:string}};
  colors: ColorProfile;
  tags: string[];
  /** Material state and capacities, all effects use this vocabulary. */
  properties: Record<string, number>;
  stock: Record<string, number>;
  ownerId?: string;
  labor?: number;
  agent?: SocialProfile;
  production?: ProductionBatch;
  renewable?: { resourceId: string; capacity: number; interval: number; nextTurn: number };
  workRecipe?: { required: number; inputs: Record<string, number>; outputs: Record<string, number>; changes?: Record<string, number>; repeat: boolean };
}
export interface WorldFact {
  pos?: GridPos;
  id: number;
  turn: number;
  nodeId: string;
  actorId?: string;
  targetId: string;
  kind: 'property' | 'transfer' | 'work' | 'production' | 'move' | 'signal';
  property?: string;
  before?: number;
  after?: number;
  resourceId?: string;
  quantity?: number;
  ownerId?: string;
  labor: number;
  message: string;
  witnesses: string[];
  targetTags?: string[];
  /** Resource classification at the time, independent of a mixed container. */
  resourceTags?: string[];
  /** A rumor retains original provenance; hearing it is not direct evidence. */
  sourceFactId?: number;
}
export interface ObservedTarget {
  id: string;
  name: string;
  kind: WorldEntity['kind'];
  nodeId: string;
  turn: number;
  colors: ColorProfile;
  properties: Record<string, number>;
  tags: string[];
  stock: Record<string, number>;
  ownerId?: string;
  ownerName?: string;
  species?: string;
  profession?: string;
  labor: number;
}
export interface WorldKnowledge {
  targets: Record<string, ObservedTarget>;
  facts: WorldFact[];
}
export interface InteractionWorld {
  version: 1;
  turn: number;
  sequence: number;
  itemSequence?: number;
  entities: Record<string, WorldEntity>;
  events: WorldFact[];
  knowledge: Record<string, WorldKnowledge>;
  receipts: string[];
  /** Legacy aggregate rewards are migrated once, never replayed. */
  legacyMigrated?: boolean;
  spaces?: Record<string, FieldSpace>;
}
export type EntitySide = 'actor' | 'target';
export type PrimitiveEffect =
  | { kind: 'influence'; property: string; amount: number; side?: EntitySide }
  | { kind: 'transfer'; resourceId: string; quantity: number; from: EntitySide; to: EntitySide }
  | { kind: 'stock'; resourceId: string; amount: number; side?: EntitySide }
  | { kind: 'work'; amount: number }
  | { kind: 'move'; nodeId: string }
  | { kind: 'relocate'; pos: GridPos; side?: EntitySide }
  | { kind: 'carry'; held: boolean; pos?: GridPos }
  | { kind: 'signal'; message: string; sourceFactId?: number }
  | { kind: 'production'; batch?: ProductionBatch };
export interface InteractionAction {
  id: string;
  label: string;
  description: string;
  duration: number;
  reach?: number;
  effects: PrimitiveEffect[];
  requires?: { tags?: string[]; min?: Record<string, number>; max?: Record<string, number>; actorMin?: Record<string, number> };
  /** Actual fulfillment after successful execution; travel is only expected utility. */
  satisfies?: Partial<SocialProfile['needs']>;
  /** Utility metadata is authored with the action; NPCs do not branch on action IDs. */
  utility?: Partial<Record<'food' | 'work' | 'rest' | 'curiosity' | 'safety' | 'sharing', number>>;
}
export interface InteractionRequest { actorId: string; targetId: string; actionId: string }
export interface InteractionResult { ok: boolean; reason?: string; message: string; duration: number; facts: WorldFact[] }
export interface ActionOffer {
  id: string;
  label: string;
  description: string;
  duration: number;
  enabled: boolean;
  reason?: string;
}
