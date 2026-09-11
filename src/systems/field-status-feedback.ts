import type { WorldEntity } from './world/types';

export type StatusMark = 'grasp' | 'drowsy' | 'fracture' | 'embers' | 'drops' | 'runes' | 'haze' | 'claws';
export interface StatusFeedbackRule {
  id: string;
  keys: readonly string[];
  tint: string;
  edge: number;
  mark: StatusMark;
}
/** Perception, not simulation: one veil and at most two edge motifs, regardless of stack count. */
export const STATUS_FEEDBACK: readonly StatusFeedbackRule[] = [
  {id:'devour',keys:['devour'],tint:'25 14 30',edge:.38,mark:'grasp'},
  {id:'sleep',keys:['sleep','drowsy'],tint:'24 30 58',edge:.3,mark:'drowsy'},
  {id:'possession',keys:['possession'],tint:'76 41 92',edge:.25,mark:'runes'},
  {id:'paralyze',keys:['paralyze','spasm'],tint:'146 122 66',edge:.2,mark:'fracture'},
  {id:'bound',keys:['anchored','slowed','slime'],tint:'77 110 106',edge:.22,mark:'grasp'},
  {id:'feral',keys:['feral-heavy','feral'],tint:'127 61 49',edge:.24,mark:'claws'},
  {id:'burn',keys:['burn'],tint:'171 86 49',edge:.23,mark:'embers'},
  {id:'poison',keys:['poison','sap'],tint:'113 131 73',edge:.22,mark:'drops'},
  {id:'mental',keys:['brainwash','confusion','imprint'],tint:'125 94 139',edge:.22,mark:'runes'},
  {id:'ghost',keys:['ghost','regress'],tint:'153 187 186',edge:.24,mark:'haze'},
  {id:'weakened',keys:['weakness','vulnerable','frail'],tint:'130 111 98',edge:.16,mark:'fracture'},
];
const TRANSFORM_FEEDBACK: StatusFeedbackRule = {id:'transform',keys:[],tint:'155 119 174',edge:.2,mark:'haze'};
export function fieldStatusFeedback(entity?: WorldEntity, transformed=false) {
  if(!entity || (entity.properties.integrity??100)<=0)return undefined;
  const active=STATUS_FEEDBACK.filter(rule=>rule.keys.some(key=>(entity.properties['status:'+key]??0)>0));
  if(transformed)active.push(TRANSFORM_FEEDBACK);
  const veil=active[0];
  if(!veil)return undefined;
  const marks=[...new Set(active.map(rule=>rule.mark))].slice(0,2);
  return {id:veil.id,tint:veil.tint,edge:veil.edge,marks};
}
