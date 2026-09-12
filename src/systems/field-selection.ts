import type { WorldEntity } from './world/types';
export function fieldTargetPriority(e:WorldEntity):number {
 if(e.id==='player')return 6;
 if(e.kind==='actor')return 0;
 if(e.tags.some(t=>t.startsWith('service:')||t.startsWith('base:')||t==='dungeon-entry'||t==='home-door'))return 1;
 if(e.kind==='plot'||e.workRecipe||e.tags.includes('shelter'))return 2;
 if(e.kind==='terrain'||e.tags.includes('ground'))return 5;
 return 3;
}
/** Explicit selection wins; facilities otherwise remain reachable above dropped items. */
export function fieldTargets(entities:WorldEntity[]):WorldEntity[] {
 return entities.filter(e=>e.kind!=='actor'||(e.properties.integrity??100)>0)
  .sort((a,b)=>fieldTargetPriority(a)-fieldTargetPriority(b)||a.id.localeCompare(b.id));
}
