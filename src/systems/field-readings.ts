import type { RunState } from '@/data/schemas';
import type { FieldSpace, FieldSpeech } from './field-types';
import type { InteractionWorld, WorldEntity } from './world/types';
import type { GridPos } from '@/data/schemas/base';
import { FIELD_RECORDS, FIELD_RECORD_VERSION } from '@/data/field-records';
import { ensureJourney, questTopics, questRemainsNpc, canInspectQuestEntity } from './field-journey';

type Place = (world: InteractionWorld, space: FieldSpace, entity: WorldEntity, pos: GridPos) => WorldEntity;
export function ensureFieldRecords(world: InteractionWorld, space: FieldSpace, place: Place) {
  if (space.recordsVersion === FIELD_RECORD_VERSION || space.road || space.dungeon || space.residence) return;
  const records = FIELD_RECORDS.filter(r => r.nodeId === space.id);
  if (!records.length) return;
  for (const record of records) {
    const id = 'record:' + record.id;
    if (world.entities[id]) continue;
    place(world, space, { id, recordId: record.id, name: record.name, kind: 'resource', nodeId: space.id,
      tags: ['record'], colors: record.colors ?? {}, stock: {},
      properties: { integrity: 100, portable: 1, mass: 1, hardness: 4, ...record.properties },
    }, { x: space.width - 2, y: 2 });
  }
  space.recordsVersion = FIELD_RECORD_VERSION;
}
export function fieldReading(entity: WorldEntity) {
  const remains = entity.tags.includes('quest-remains') && entity.recordId === entity.id;
  const record = remains ? {id:entity.id,nodeId:entity.nodeId,name:entity.name,lines:['접힌 쪽지와 남겨진 준비물이 있다. 필요한 기록을 살펴볼 수 있다.'],min:undefined} :
    FIELD_RECORDS.find(r => r.id === entity.recordId);
  if (!record) return;
  const recovered = (entity.properties.integrity ?? 100) <= 0;
  const legible = recovered || Object.entries(record.min ?? {}).every(([key,n]) => (entity.properties[key] ?? 0) >= n);
  return { record, recovered, legible, lines: recovered ? ['흩어진 조각을 맞추고, 남은 글과 압흔을 옮겨 적었다.',...record.lines] :
    legible ? record.lines : ['hint' in record ? record.hint ?? '지금은 읽을 수 없다.' : '지금은 읽을 수 없다.'] };
}
/** Evidence requires local inspection; destroyed originals remain destroyed after their fragments are read. */
export function recordReading(run: RunState, entity: WorldEntity): FieldSpeech | undefined {
  const world=run.interactionWorld;
  if (!world || world.entities[entity.id]!==entity || !canInspectQuestEntity(run,world,entity)) return;
  const reading=fieldReading(entity);
  if (!reading) return;
  if (entity.tags.includes('quest-remains')) {
    if (!questRemainsNpc(run,entity)) return;
  } else if (reading.legible) {
    ensureJourney(run).readings![reading.record.id] ??= {at:run.field!.elapsedSeconds,lines:[...reading.record.lines],recovered:reading.recovered};
  }
  return {actorId:entity.id,name:entity.name+(reading.recovered?'의 잔해':''),lines:[...reading.lines],topics:questTopics(run,entity)};
}
