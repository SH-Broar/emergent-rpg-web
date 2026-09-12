import type { RunState } from '@/data/schemas';
import type { FieldSpace, FieldSpeech } from './field-types';
import type { InteractionWorld, WorldEntity } from './world/types';
import type { GridPos } from '@/data/schemas/base';
import { FIELD_RECORDS, FIELD_RECORD_VERSION } from '@/data/field-records';
import { ensureJourney } from './field-journey';

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
  const record = FIELD_RECORDS.find(r => r.id === entity.recordId);
  if (!record || (entity.properties.integrity ?? 0) <= 0) return;
  const legible = Object.entries(record.min ?? {}).every(([key, n]) => (entity.properties[key] ?? 0) >= n);
  return { record, legible, lines: legible ? record.lines : [record.hint ?? '지금은 읽을 수 없다.'] };
}
/** Evidence is remembered only after a successful, nearby read of the actual object. */
export function recordReading(run: RunState, entity: WorldEntity): FieldSpeech | undefined {
  const reading = fieldReading(entity);
  if (!reading) return;
  if (reading.legible) {
    const state = ensureJourney(run);
    state.readings![reading.record.id] ??= { at: run.field!.elapsedSeconds, lines: [...reading.lines] };
  }
  return { actorId: entity.id, name: entity.name, lines: [...reading.lines] };
}
