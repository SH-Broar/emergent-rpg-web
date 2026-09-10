import type { RunState, Node, Monster, Boss } from '@/data/schemas';
import type { GridPos } from '@/data/schemas/base';
import { useDataStore } from '@/stores/data';
import type { FieldSpace, FieldTile } from './field-types';
import type { InteractionWorld, WorldEntity } from './world/types';
import { createSocialProfile } from './world/social';
import { walkable } from './world/spatial';

export const FIELD_ITEMS: Record<string, { name: string; glyph: string; color: string }> = {
  water: { name: '물', glyph: '◉', color: '#80d5ef' },
  'field-seed': { name: '들곡 씨앗', glyph: '⌁', color: '#dec58c' },
  'raw-fiber': { name: '풀섬유', glyph: '≋', color: '#a8c986' },
  'raw-stone': { name: '원석', glyph: '◆', color: '#b3bdce' },
  'i-crop-grain': { name: '들곡', glyph: '♧', color: '#e1ca80' },
  'i-life-char': { name: '숯', glyph: '⬟', color: '#dc9e81' },
  'i-life-charge': { name: '모은 전하', glyph: 'ϟ', color: '#c6b0f5' },
};
export function fieldItemName(id: string): string { return FIELD_ITEMS[id]?.name ?? useDataStore().items.get(id)?.name ?? id; }
export function fieldMap(run: RunState) {
  const data = useDataStore();
  return data.nodeMaps.get(data.timelines.get(run.timelineId)?.nodeMapId ?? '');
}
export function baseNode(run: RunState, spaceId = run.currentNodeId): Node | undefined {
  return fieldMap(run)?.nodes.find(n => n.id === (run.interactionWorld?.spaces?.[spaceId]?.nodeId ?? spaceId.split('::')[0]));
}
function hash(text: string): number { let n = 2166136261; for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
function openPosition(world: InteractionWorld, space: FieldSpace, preferred: GridPos, id?: string): GridPos {
  if (walkable(world, space.id, preferred, id)) return preferred;
  for (let radius = 1; radius < space.width + space.height; radius++) for (let y = 1; y < space.height - 1; y++) for (let x = 1; x < space.width - 1; x++) {
    if (Math.abs(x - preferred.x) + Math.abs(y - preferred.y) === radius && walkable(world, space.id, { x, y }, id)) return { x, y };
  }
  return { ...space.spawn };
}
export function placeFieldEntity(world: InteractionWorld, space: FieldSpace, entity: WorldEntity, preferred: GridPos): WorldEntity {
  entity.nodeId = space.id;
  entity.pos = openPosition(world, space, preferred, entity.id);
  world.entities[entity.id] = entity;
  return entity;
}
function object(world: InteractionWorld, space: FieldSpace, suffix: string, name: string, pos: GridPos, tags: string[], properties: Record<string, number>, stock: Record<string, number> = {}): WorldEntity {
  return placeFieldEntity(world, space, { id: `${space.id}:field:${suffix}`, name, kind: 'resource', nodeId: space.id, colors: {}, tags, stock, properties: { integrity: 100, ...properties } }, pos);
}
export function spawnCreature(run: RunState, world: InteractionWorld, space: FieldSpace, definition: Monster | Boss, index: number, rank: 'normal' | 'elite' | 'boss'): WorldEntity {
  const maxHp = Math.max(10, definition.hp);
  const drop = 'drop' in definition ? definition.drop : undefined;
  const e: WorldEntity = {
    id: `${space.id}:creature:${index}`, name: definition.name, kind: 'actor', nodeId: space.id,
    colors: {}, stock: {}, tags: ['monster', rank, ...(rank !== 'normal' ? ['humanoid'] : [])],
    properties: { integrity: 100, hardness: Math.max(0, (definition.defense ?? 0) / 3), flammability: 1, moisture: 0, solid: 1 },
    creature: { definitionId: definition.id, rank, maxHp, attack: Math.max(2, definition.attack), range: rank === 'normal' ? 1 : 2,
      reward: { gold: drop?.gold ?? (rank === 'normal' ? 3 : 12), shards: drop?.timeShards ?? (rank === 'normal' ? 1 : 5), itemId: baseNode(run, space.id)?.region ? fieldMap(run)?.regions.find(r => r.id === baseNode(run, space.id)?.region)?.specialtyItemId : undefined } },
  };
  const locations = [{ x: 10, y: 6 }, { x: 11, y: 3 }, { x: 11, y: 9 }, { x: 8, y: 10 }];
  return placeFieldEntity(world, space, e, locations[index % locations.length]!);
}
function residents(run: RunState, world: InteractionWorld, space: FieldSpace, node: Node) {
  const data = useDataStore();
  const pool = new Set(node.contentRef?.npcIdPool ?? []);
  const npcs = [...data.npcs.values()].filter(n => n.homeNodeId === node.id || pool.has(n.id));
  for (const [i, npc] of npcs.entries()) {
    const id = `npc:${npc.id}`;
    if (world.entities[id]) continue;
    const colors = npc.colorValues ? Object.fromEntries(Object.entries(npc.colorValues).map(([k, v]) => [k, v <= 1 ? v * 100 : v])) : {};
    const body = data.races.get(npc.raceId)?.baseStats;
    placeFieldEntity(world, space, {
      id, npcId: npc.id, name: npc.name, kind: 'actor', nodeId: space.id, ownerId: id, colors, tags: ['person', 'resident', ...(npc.tags ?? [])], stock: { 'i-crop-grain': 1 },
      properties: { integrity: 100, lifeLevel: 1, practice: 0, laborPower: body ? body.vigor + body.attack / 4 : 12, hardness: body ? body.defense / 2 : 0 },
      agent: createSocialProfile(npc.raceId, npc.role || 'traveler', { homeNodeId: node.id, turn: run.visitedNodes.length }),
    }, { x: 5 + i % 4, y: 4 + Math.floor(i / 4) * 3 });
  }
}
function connectExits(space: FieldSpace, node: Node, run: RunState) {
  const map = fieldMap(run);
  const entries = [...node.neighbors.map(to => ({ to, requirement: undefined as string | undefined })), ...(node.conditionalNeighbors ?? []).filter(c => !node.neighbors.includes(c.nodeId)).map(c => ({ to: c.nodeId, requirement: c.requires }))];
  const positions: GridPos[] = [];
  for (let x = 2; x < space.width - 1; x += 3) positions.push({ x, y: 0 }, { x, y: space.height - 1 });
  for (let y = 2; y < space.height - 1; y += 3) positions.push({ x: 0, y }, { x: space.width - 1, y });
  entries.forEach((entry, i) => {
    const pos = positions[i];
    if (!pos) return;
    space.exits.push({ ...entry, pos, label: map?.nodes.find(n => n.id === entry.to)?.label ?? '이어진 길' });
    // Every exit is connected to the central cross, including authored conditional routes.
    let x = pos.x, y = pos.y;
    while (y !== 6) { space.tiles[y]![x] = 'path'; y += Math.sign(6 - y); }
    while (x !== 7) { space.tiles[y]![x] = 'path'; x += Math.sign(7 - x); }
    space.tiles[y]![x] = 'path';
  });
}
export function ensureFieldSpace(run: RunState, world: InteractionWorld, id: string): FieldSpace {
  world.spaces ??= {};
  if (world.spaces[id]) return world.spaces[id]!;
  const data = useDataStore();
  const split = id.split('::dungeon:');
  const node = fieldMap(run)?.nodes.find(n => n.id === split[0]) ?? fieldMap(run)?.nodes[0];
  if (!node) throw new Error('플레이할 장소가 없습니다.');
  const floor = split[1] ? Number(split[1]) : 0;
  const dungeon = floor >= 1 && floor <= 3;
  const town = !dungeon && ['village', 'shop', 'workshop', 'start', 'rest', 'activity'].includes(node.kind);
  const width = 15, height = 13;
  const tiles: FieldTile[][] = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'wall' : dungeon ? 'stone' : town && (y === 6 || x === 7) ? 'path' : 'grass'));
  const space: FieldSpace = { id, nodeId: node.id, name: dungeon ? `${node.label} · 지하 ${floor}층` : node.label, width, height, tiles, spawn: dungeon ? { x: 2, y: 6 } : { x: 7, y: 6 }, exits: [], ...(dungeon ? { dungeon: { origin: node.id, floor, totalFloors: 3 } } : {}) };
  world.spaces[id] = space;
  if (!dungeon) connectExits(space, node, run);
  else {
    space.exits.push({ pos: { x: 1, y: 6 }, to: floor === 1 ? node.id : `${node.id}::dungeon:${floor - 1}`, label: floor === 1 ? '지상' : '윗층' });
    if (floor < 3) space.exits.push({ pos: { x: 13, y: 6 }, to: `${node.id}::dungeon:${floor + 1}`, label: '아랫층', requirement: 'room-clear' });
    for (const p of [{ x: 6, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 8 }, { x: 6, y: 9 }, { x: 10, y: 2 }, { x: 10, y: 10 }]) tiles[p.y]![p.x] = 'wall';
  }
  if (!dungeon) {
    // One seeded scene per place; revisiting never replaces moved objects or inventories.
    for (const e of Object.values(world.entities)) if (e.nodeId === id && e.id !== 'player' && !e.carriedBy && !e.pos) {
      const n = hash(e.id);
      e.properties.solid ??= e.kind === 'actor' || e.kind === 'facility' ? 1 : 0;
      placeFieldEntity(world, space, e, { x: 3 + n % 9, y: 3 + Math.floor(n / 9) % 7 });
    }
    residents(run, world, space, node);
    if (town) {
      const building = object(world, space, 'building', node.kind === 'workshop' ? '공방' : node.kind === 'shop' ? '교환소' : '쉼터', { x: 4, y: 3 }, ['building', 'shelter'], { solid: 1, hardness: 10 });
      building.kind = 'facility';
      building.stock = { 'i-crop-grain': 6, 'field-seed': 4 };
      building.tags.push('storage', 'shared');
      const bench = object(world, space, 'workbench', '작업대', { x: 4, y: 9 }, ['workshop'], { solid: 1, hardness: 4, work: 0, workRequired: 3 });
      bench.workRecipe = { required: 3, inputs: { 'raw-fiber': 2 }, outputs: { 'i-life-char': 2, 'field-seed': 1 }, repeat: true };
      bench.stock = { 'raw-fiber': 2 };
    }
    for (const p of [{ x: 5, y: 8 }, { x: 6, y: 8 }, { x: 5, y: 9 }]) {
      tiles[p.y]![p.x] = 'soil';
      const plot = object(world, space, `soil-${p.x}-${p.y}`, '빈 밭', p, ['field-plot', 'food', 'shared'], { soil: 1, flammability: 1, moisture: 0 });
      plot.kind = 'plot';
      if (p.x === 6) { plot.name = '여문 들곡'; plot.stock = { 'i-crop-grain': 2, 'field-seed': 1 }; }
    }
    const shrub = object(world, space, 'brush', '섬유풀', { x: 10, y: 8 }, ['brush', 'renewable'], { flammability: 3, moisture: 1 }, { 'raw-fiber': 16 });
    shrub.renewable = { resourceId: 'raw-fiber', capacity: 16, interval: 4, nextTurn: run.visitedNodes.length + 4 };
  }
  const barrel = object(world, space, 'barrel', '물통', { x: 6, y: 6 }, ['barrel', 'storage', 'shared'], { portable: 1, mass: 2, solid: 1, moisture: 2, hardness: 1, spillOnBreak: 1 }, { water: 8 });
  barrel.colors = { water: 50, earth: 10 };
  object(world, space, 'stone', '돌덩이', { x: 9, y: 7 }, ['stone', 'shared'], { portable: 1, mass: 3, solid: 1, hardness: 8 });
  object(world, space, 'brazier', '화로', { x: 9, y: 4 }, ['brazier', 'storage', 'shared'], { heat: 4, solid: 1, hardness: 4 }, { 'i-life-char': 4 });
  if (!dungeon) {
    const well = object(world, space, 'well', '샘', { x: 10, y: 3 }, ['well', 'storage', 'shared'], { solid: 1, moisture: 5, hardness: 8 }, { water: 100 });
    well.renewable = { resourceId: 'water', capacity: 100, interval: 1, nextTurn: run.visitedNodes.length + 1 };
    object(world, space, 'bundle', '여행자의 꾸러미', { x: 8, y: 6 }, ['bundle', 'storage', 'shared'], { portable: 1, mass: 1 }, { 'field-seed': 2, 'i-crop-grain': 1 });
  }
  const region = fieldMap(run)?.regions.find(r => r.id === node.region);
  const monsters = (region?.enemyPool ?? []).map(x => data.monsters.get(x)).filter((x): x is Monster => !!x && x.tier !== 'elite');
  const elites = (region?.eliteEnemyPool ?? []).map(x => data.monsters.get(x)).filter((x): x is Monster => !!x);
  const normal = monsters[hash(id) % Math.max(1, monsters.length)] ?? [...data.monsters.values()].find(m => m.tier !== 'elite');
  const elite = elites[hash(id) % Math.max(1, elites.length)] ?? [...data.monsters.values()].find(m => m.tier === 'elite');
  const wild = ['combat', 'elite', 'boss', 'boss-gate'].includes(node.kind);
  if (!dungeon && wild) {
    if (normal && !run.nodeStates[node.id]?.combatCleared) spawnCreature(run, world, space, normal, 0, 'normal');
    object(world, space, 'entrance', '던전 입구', { x: 12, y: 6 }, ['dungeon-entry'], { solid: 1, hardness: 100 });
  }
  if (dungeon) {
    const boss = data.bosses.get(node.contentRef?.bossId ?? (node.isBossGate || node.kind === 'boss' ? data.timelines.get(run.timelineId)?.bossId ?? '' : ''));
    if (floor === 3 && boss) spawnCreature(run, world, space, boss, 0, 'boss');
    else if (floor >= 2 && elite) spawnCreature(run, world, space, elite, 0, 'elite');
    if (normal && floor < 3) for (let i = floor === 1 ? 0 : 1; i < 3; i++) spawnCreature(run, world, space, normal, i, 'normal');
    if (floor === 3 && !boss && !elite && normal) spawnCreature(run, world, space, normal, 0, 'normal');
    const cache = object(world, space, 'cache', '오래된 보관함', { x: 12, y: 9 }, ['storage', 'shared'], { solid: 1, portable: 1, mass: 3, hardness: 3 }, { 'i-crop-grain': 3, water: 3, 'i-life-char': 2 });
    cache.labor = 20;
  }
  for (const e of Object.values(world.entities).filter(e=>e.nodeId===space.id)) { e.fieldUpdatedAt=run.field?.elapsedSeconds??0; e.fieldNpcAt=e.fieldUpdatedAt; }
  return space;
}
