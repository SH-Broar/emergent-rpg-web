import type { RunState } from '@/data/schemas';
import type { InteractionWorld, SocialProfile, WorldEntity } from './types';
import { PLAYER_ACTOR_ID } from './types';
import { createSocialProfile } from './social';
import { observeWorld } from './engine';

export const REGION_ENTITIES = {
  storage: 'ilu-shared-storage', workshop: 'ilu-workshop', irrigation: 'ilu-irrigation',
  path: 'ilu-path', grove: 'ilu-raw-grove', stone: 'ilu-raw-stone',
} as const;

/** Authored individuals use existing playable species; no named canon character is assigned a job. */
export function seedWorld(run: RunState): InteractionWorld {
  const turn = run.visitedNodes.length;
  const previous = run.regionWorld;
  const world: InteractionWorld = { version: 1, turn, sequence: 0, entities: {}, events: [], knowledge: {}, receipts: [], legacyMigrated: !!previous };
  const add = (entity: WorldEntity) => { world.entities[entity.id] = entity; };
  const inventory: Record<string, number> = {};
  for (const item of run.items) inventory[item.id] = (inventory[item.id] ?? 0) + 1;
  add({
    id: PLAYER_ACTOR_ID, name: '나', kind: 'actor', nodeId: run.currentNodeId,
    colors: { ...run.colors }, tags: ['person'], stock: inventory, ownerId: PLAYER_ACTOR_ID,
    properties: { integrity: 100, lifeLevel: run.lifeLevel ?? 1, practice: run.lifeXp ?? 0 },
    agent: createSocialProfile(run.raceId, run.profession ?? 'traveler', { homeNodeId: run.currentNodeId, turn }),
  });
  const addResident = (id: string, name: string, nodeId: string, species: string, profession: string, values: Partial<SocialProfile['values']>, needs: Partial<SocialProfile['needs']>, colors: WorldEntity['colors'], norms: Partial<SocialProfile['norms']>) => {
    add({
      id, name, kind: 'actor', nodeId, colors, ownerId: id, tags: ['person', 'resident'], stock: { 'i-crop-grain': 1 },
      properties: { integrity: 100, lifeLevel: 1, practice: 0 },
      agent: createSocialProfile(species, profession, {
        homeNodeId: nodeId, turn, values, needs, norms,
        // Membership and personal experience are authored, rather than inferred from a species.
        normScopes: { guild: profession === 'artisan' ? { laborRespect: .95 } : { foodSharing: .95, laborRespect: .75 } },
      }),
    });
  };
  addResident('actor-ilu-grower', '텃밭을 돌보는 인간', 'n-ilu-larder', 'human', 'grower',
    { sharing: .9, labor: .65, curiosity: .35 }, { food: .2, work: .8 },
    { earth: 65, water: 35, light: 25 }, { foodSharing: .98, laborRespect: .7 });
  addResident('actor-ilu-artisan', '스민투스 가공 장인', 'n-iluneon-market', 'sminthus', 'artisan',
    { sharing: .6, labor: .95, curiosity: .6 }, { food: .2, work: .85 },
    { iron: 70, electric: 35, earth: 30 }, { foodSharing: .85, laborRespect: 1 });
  addResident('actor-ilu-courier', '길을 살피는 아르카나', 'n-iluneon-square', 'arcana', 'traveler',
    { sharing: .65, safety: .95, curiosity: .85 }, { food: .3, work: .45, curiosity: .8 },
    { light: 65, wind: 50, water: 20 }, { foodSharing: .95, harmAversion: .95 });

  add({
    id: REGION_ENTITIES.storage, name: '광장의 공유 식량 선반', kind: 'facility', nodeId: 'n-iluneon-square',
    colors: { earth: 35, water: 30 }, tags: ['storage', 'food', 'shared', 'flammable'],
    properties: { integrity: 100, moisture: 0, flammability: 2, hardness: 1 },
    stock: { 'i-crop-grain': previous ? Math.max(0, previous.supplies) : 3 },
    ownerId: 'local-community', labor: 8,
  });
  add({
    id: REGION_ENTITIES.workshop, name: '장인의 재료 가공대', kind: 'facility', nodeId: 'n-iluneon-market',
    colors: { iron: 70, fire: 20 }, tags: ['workshop', 'flammable'],
    properties: { integrity: 100, work: 0, workRequired: 100, flammability: 1, conductivity: 1, hardness: 4 },
    stock: { 'raw-fiber': 3, 'i-life-char': 1 }, ownerId: 'actor-ilu-artisan', labor: 30,
    workRecipe: { required: 100, inputs: { 'raw-fiber': 1 }, outputs: { 'i-life-char': 1 }, repeat: true },
  });
  add({
    id: REGION_ENTITIES.irrigation, name: '텃밭의 물길 설비', kind: 'facility', nodeId: 'n-ilu-larder',
    colors: { water: 65, iron: 35, earth: 45 }, tags: ['irrigation', 'shared'],
    properties: { integrity: 100, work: previous?.irrigation ? 100 : 0, workRequired: 100, irrigation: previous?.irrigation ? 1 : 0, moisture: 2, hardness: 4, conductivity: 1 },
    stock: { 'raw-stone': 2, water: 10 }, ownerId: 'local-community', labor: 25,
    workRecipe: { required: 100, inputs: { 'raw-stone': 1 }, outputs: {}, changes: { irrigation: 1 }, repeat: false },
  });
  add({
    id: REGION_ENTITIES.path, name: '식당 뒤편의 마물 경계선', kind: 'terrain', nodeId: 'n-ilu-diner-back',
    colors: { earth: 55, light: 25 }, tags: ['path', 'shared'],
    properties: { integrity: 100, work: 0, workRequired: 100, safety: previous ? Math.max(0, 6 - previous.threat) : 2, hardness: 3 },
    stock: {}, ownerId: 'local-community', labor: 15,
    workRecipe: { required: 100, inputs: {}, outputs: {}, changes: { safety: 2 }, repeat: false },
  });
  add({
    id: REGION_ENTITIES.grove, name: '저장고 옆 섬유풀 군락', kind: 'resource', nodeId: 'n-ilu-larder',
    colors: { earth: 55, water: 45 }, tags: ['renewable', 'shared', 'flammable'],
    properties: { integrity: 100, flammability: 3, moisture: 1, hardness: 0 },
    stock: { 'raw-fiber': 80 }, labor: 0,
    renewable: { resourceId: 'raw-fiber', capacity: 80, interval: 12, nextTurn: turn + 12 },
  });
  add({
    id: REGION_ENTITIES.stone, name: '시장 가장자리의 원석 더미', kind: 'resource', nodeId: 'n-iluneon-market',
    colors: { earth: 75, iron: 40 }, tags: ['renewable', 'shared'],
    properties: { integrity: 100, hardness: 7, conductivity: 1 },
    stock: { 'raw-stone': 60 }, labor: 0,
    renewable: { resourceId: 'raw-stone', capacity: 60, interval: 16, nextTurn: turn + 16 },
  });
  for (const entity of Object.values(world.entities)) if (entity.agent) observeWorld(world, entity.id);

  // Residents know public destinations from living here, but not their current remote stocks or condition.
  const destinations = [REGION_ENTITIES.storage, REGION_ENTITIES.workshop, REGION_ENTITIES.irrigation, REGION_ENTITIES.path, REGION_ENTITIES.grove, REGION_ENTITIES.stone];
  for (const actor of Object.values(world.entities).filter(e => e.agent && e.id !== PLAYER_ACTOR_ID)) {
    const known = world.knowledge[actor.id]!;
    for (const id of destinations) {
      if (known.targets[id]) continue;
      const e = world.entities[id]!;
      known.targets[id] = { id, name: e.name, kind: e.kind, nodeId: e.nodeId, turn: turn - 1,
        tags: [...e.tags], colors: {}, stock: {}, properties: {}, labor: 0 };
    }
  }
  return world;
}
