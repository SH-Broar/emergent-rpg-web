import type { WorldEntity } from './types';

/** Contact probability: 80% at level 1, -4 percentage points per level, minimum 10%. */
export function transformationChance(level=1): number {
  return Math.max(.1, .8 - (Math.max(1,Number.isFinite(level)?level:1)-1)*.04);
}
/** One common property transition, whether imposed by a spell or lifted by a service. */
export function syncEntityForm(entity:WorldEntity,property:string,sourceId?:string) {
  if(!property.startsWith('form:') || entity.kind!=='actor')return;
  const raceId=property.slice(5);
  if((entity.properties[property]??0)>0) {
    if(entity.form)return;
    entity.form={raceId,originalSpecies:entity.agent?.species??'human',sourceId};
    if(entity.agent)entity.agent.species=raceId;
  } else if(entity.form?.raceId===raceId) {
    if(entity.agent)entity.agent.species=entity.form.originalSpecies;
    entity.form=undefined;
  }
}
