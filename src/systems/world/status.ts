import type { WorldEntity } from './types';

/** Status values share the same property vocabulary for people, creatures and props. */
export const status = (e: WorldEntity, key: string) => e.properties['status:' + key] ?? 0;
export const statusEntries = (e?: WorldEntity) => Object.entries(e?.properties ?? {})
  .filter(([k,v]) => k.startsWith('status:') && v > 0).map(([k,v]) => ({key:k.slice(7), value:v}));
export const DEBUFFS = new Set(['weakness','vulnerable','poison','burn','feral','feral-heavy','regress','paralyze','spasm','sap','ghost','anchored','drowsy','brainwash','possession','confusion','sleep','slime','imprint','frail','slowed']);
export const DECAYING = new Set(['weakness','vulnerable','ghost','anchored','drowsy','airborne','brainwash','sleep','haste','move-haste','confusion','ward','thorns','resolve','frail','slowed']);
export function changeStatus(p: Record<string,number>, key:string, amount:number): void {
  const prop = 'status:' + key;
  if (amount > 0 && DEBUFFS.has(key) && key !== 'feral-heavy' && (p['status:resolve'] ?? 0) > 0) amount = Math.max(0, amount - 1);
  p[prop] = Math.max(0, key === 'brainwash' && amount > 0 ? Math.max(p[prop] ?? 0, amount) : (p[prop] ?? 0) + amount);
  if (key === 'drowsy' && p[prop]! >= 2) { p[prop] = 0; p['status:sleep'] = Math.max(1, p['status:sleep'] ?? 0); p['status:airborne'] = 0; }
  if (key === 'sleep' && p[prop]! > 0) p['status:airborne'] = 0;
  if (key === 'feral' && p[prop]! >= 10) { p[prop] = 0; p['status:feral-heavy'] = 1; }
}
export function outgoingDamage(actor: WorldEntity, base:number, ranged=false):number {
  let amount = Math.floor(base * (status(actor,'feral-heavy') ? 2 : status(actor,'feral') ? 1.5 : 1));
  amount += status(actor,'strength') + status(actor,'focus') - status(actor,'sap') - (ranged ? 0 : status(actor,'slime'));
  if(status(actor,'weakness'))amount *= .75;
  if(status(actor,'brainwash'))amount *= .66;
  if(status(actor,'possession'))amount *= .5;
  amount *= Math.pow(.9, status(actor,'imprint'));
  return Math.max(0,Math.floor(amount));
}
export function actionRestriction(e:WorldEntity, moving=false):string|undefined {
  if(status(e,'sleep'))return '잠들어 있다.';
  if(status(e,'paralyze'))return '몸이 움직이지 않는다.';
  if(moving && status(e,'anchored'))return '발이 묶여 있다.';
}
export const movesAsAir = (e:WorldEntity) => !!(status(e,'airborne') || status(e,'ghost') || status(e,'regress'));
export const movementRange = (e:WorldEntity) => status(e,'slime') ? 1 : 2 + status(e,'move-haste') + (status(e,'feral-heavy') ? 1 : 0) + (status(e,'regress') ? 1 : 0);
export const STATUS_HELP: Record<string,string> = {
  strength:'공격 +수치', dexterity:'방어 +수치', weakness:'공격 25% 감소', vulnerable:'받는 피해 50% 증가',
  poison:'매 턴 수치만큼 피해. 1 감소', burn:'매 턴 수치만큼 피해. 절반 감소', sap:'매 턴 수치만큼 피해. 정화 필요',
  feral:'공격 1.5배, 방어 불가. 10이면 심수화', 'feral-heavy':'공격 2배, 방어·회복 불가. 휴식으로 해제',
  regress:'장애물 통과, 이동기 +1칸. 장비 공격·방어 절반', paralyze:'행동을 못 한다. 턴마다 1 감소',
  spasm:'다음 턴 마나가 수치만큼 감소', ghost:'장애물 통과, 원거리 피격 불가. 유령끼리 공격 불가',
  anchored:'이동 불가', drowsy:'2가 되면 수면', airborne:'이동기로 장애물 통과. 착지하면 해제',
  brainwash:'공격 34% 감소', possession:'공격 절반, 매 턴 HP 소모. 이동할 때 1 감소',
  confusion:'대기 시 가까운 빈 칸으로 비틀거림', sleep:'이동·공격 불가. 피해를 받으면 깨어남',
  slime:'이동기 1칸, 근접 피해 −수치', imprint:'수치당 공격 10% 감소. 6부터 자연 해제 불가',
  regen:'매 턴 수치만큼 회복', haste:'마나 회복 때 추가 1', 'move-haste':'이동기 거리 +수치',
  ward:'방어 유지', thorns:'피격 시 수치만큼 반격', resolve:'받는 해로운 상태 수치 −1',
  metallicize:'방어 감소를 매 턴 1로 제한', focus:'공격 +수치', frail:'방어 −수치', slowed:'이동기 거리 감소',
};
