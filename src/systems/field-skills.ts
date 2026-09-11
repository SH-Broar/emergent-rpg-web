import type { Card, CardEffect, CardEffectKind, RunState } from '@/data/schemas';
import type { GridPos } from '@/data/schemas/base';
import type { InteractionWorld, WorldEntity } from './world/types';
import { influenceEntity, recordFact, resolveInteraction } from './world/engine';
import { cardinal, distance, entitiesAt, hasSight, positionKey, walkable } from './world/spatial';
import { actionRestriction, DEBUFFS, DECAYING, outgoingDamage, status, STATUS_HELP } from './world/status';
import { configurationFailure } from './field-bases';
import { enforceTamamoSubmission, afterMovement, beginBossEncounter, combatDefinition } from './field-combat';
import { bonusesFromEffective } from './equipment';
import { scaledValue } from './enhance';
import { SKILL_GESTURES, type SkillGesture, skillEffects, skillFamily, skillStrokes, skillMana, skillCooldown, skillCastTurns, skillFitsGesture, skillReach } from './field-skill-rules';
export { SKILL_GESTURES, type SkillGesture, skillEffects, skillFamily, skillStrokes, skillMana, skillCooldown, skillCastTurns, skillFitsGesture, skillReach, skillEffectText } from './field-skill-rules';
import { useDataStore } from '@/stores/data';

export interface SkillCell { pos: GridPos; multiplier: number }
export interface FieldSkills {
  version: 1 | 2;
  slots: Partial<Record<SkillGesture, string>>;
  /** Definition family, so duplicate copies / awakening / reassignment cannot reset a skill. */
  readyAt: Record<string, number>;
  nextPower?: { multiplier: number; expires: number };
  nextCost?: { amount: number; expires: number };
  manaDue?: { amount: number; due: number }[];
  recent?: { family: string; turn: number }[];
  pending?: { card: Card; nodeId: string; cells: SkillCell[]; due: number; paid: number; power: number };
}
export const FIELD_SKILL_EFFECTS: ReadonlySet<CardEffectKind> = new Set([
  'damage', 'heal', 'block', 'break-armor', 'apply-status', 'ghost-self', 'grant-airborne',
  'damage-min-color', 'damage-top-color', 'damage-color-count', 'block-top-color',
  'damage-per-debuff', 'consume-vulnerable', 'consume-burn', 'consume-poison',
  'damage-from-hp', 'damage-per-confine', 'block-to-damage', 'adaptive-strike',
  'spend-all-energy', 'damage-per-relic', 'double-block', 'heavy-blade',
  'draw','return-hand-to-deck','draw-if-color','exhaust-self','return-self-to-hand','damage-per-hand','heal-per-hand','damage-low-hand','damage-per-cards-played','next-card-double','hand-cost-down','next-turn-energy','this-turn-amp',
  'move-self', 'push-enemy', 'pull-enemy', 'terrain-water', 'terrain-fire', 'terrain-smoke',
]);
const turn = (run: RunState) => Math.floor((run.field?.elapsedSeconds ?? 0) / 30);
const selfEffect = (e: CardEffect) => e.target === 'self' || ['heal','block','block-top-color','double-block','ghost-self','grant-airborne','move-self','draw','return-hand-to-deck','draw-if-color','exhaust-self','return-self-to-hand','heal-per-hand','next-card-double','hand-cost-down','next-turn-energy','this-turn-amp'].includes(e.kind);
const environmental = (e: CardEffect) => e.kind.startsWith('terrain-');
const hostileEffect = (e: CardEffect) => !selfEffect(e) && !environmental(e);

/** Reject the whole skill when even one effect lacks a faithful field implementation. */
export function skillUnavailable(card: Card): string | undefined {
  if (card.unplayable || card.source === 'junk') return '사용할 수 없는 카드';
  if (card.possession || card.curse || card.source === 'possession' || card.source === 'form' && !card.magic) return '변신·빙의 기술 준비 중';
  if (card.trigger !== 'manual' || card.customEffectId || !skillEffects(card).length) return '발동 규칙 준비 중';
  if (!Number.isInteger(skillStrokes(card)) || skillStrokes(card)<2 || card.magic?.glyphs?.some(g=>!SKILL_GESTURES.includes(g as SkillGesture))) return '도형 규칙 확인 필요';
  if (!Number.isFinite(card.cost) || card.cost < 0 || !Number.isFinite(skillMana(card)) || skillMana(card) > 3 || !Number.isInteger(skillCooldown(card))) return '마나 규칙 준비 중';
  if (card.targetMode === 'throw') return '투척 기술 준비 중';
  if (skillEffects(card).some(e => !FIELD_SKILL_EFFECTS.has(e.kind))) return '효과 포팅 중';
  if (skillEffects(card).some(e => e.kind === 'apply-status' && (!STATUS_HELP[String(e.params?.status)] ||
    (selfEffect(e) && !DECAYING.has(String(e.params?.status)) && !['regen','paralyze','spasm','poison','burn'].includes(String(e.params?.status)))))) return '지속 효과 준비 중';
  if (skillEffects(card).some(e => !Number.isFinite(e.value ?? 0))) return '수치 확인 필요';
}
/** A supported spell can still be sealed for this particular body. */
export function fieldSkillRestriction(run:RunState,card:Card):string|undefined {
  const allowed=run.transform?.field ? useDataStore().races.get(run.transform.formRaceId)?.fieldSkills??[] : [];
  if(run.transform?.field && !allowed.includes(card.id))return '본래 기술이 봉인되어 있다.';
  if(card.source==='form' && !allowed.includes(card.id))return '변신 중에만 사용할 수 있다.';
  return skillUnavailable(card);
}
export function ensureFieldSkills(run: RunState): FieldSkills {
  const field = run.field!;
  if (!field.skills) {
    const slots: FieldSkills['slots'] = {}, seen = new Set<string>();
    for (const card of [...run.deck, ...run.collection]) {
      if (!card.instanceId || fieldSkillRestriction(run,card) || seen.has(skillFamily(card)) || !run.collection.some(c => c.instanceId === card.instanceId)) continue;
      const gesture = SKILL_GESTURES.find(g=>!slots[g]&&skillFitsGesture(card,g)); if (!gesture) continue;
      slots[gesture] = card.instanceId; seen.add(skillFamily(card));
    }
    field.skills = { version: 2, slots, readyAt: {} };
  }
  const skills = field.skills;
  if(skills.version!==2){
    const prior=SKILL_GESTURES.map(g=>skills.slots[g]).filter((id):id is string=>!!id);skills.slots={};
    for(const iid of prior){const c=run.collection.find(c=>c.instanceId===iid);if(!c)continue;const g=SKILL_GESTURES.find(g=>!skills.slots[g]&&skillFitsGesture(c,g));if(g)skills.slots[g]=iid;}
    skills.version=2;
  }
  for (const gesture of SKILL_GESTURES) if (skills.slots[gesture] && !run.collection.some(c => c.instanceId === skills.slots[gesture])) delete skills.slots[gesture];
  return skills;
}
export function equippedSkill(run: RunState, gesture: string): Card | undefined {
  const id = run.field?.skills?.slots[gesture as SkillGesture];
  return id ? run.collection.find(c => c.instanceId === id) : undefined;
}
export function skillRemaining(run: RunState, card: Card): number {
  return Math.max(0, (run.field?.skills?.readyAt[skillFamily(card)] ?? 0) - turn(run));
}
export function skillLoadoutLocked(run: RunState): boolean {
  const world = run.interactionWorld, player = world?.entities.player;
  return !!run.field?.skills?.pending || !!run.field?.encounter || !!(world && player && Object.values(world.entities).some(e =>
    e.nodeId === player.nodeId && e.creature && (e.properties.integrity ?? 100) > 0 && hasSight(world, player, e)));
}
export function equipFieldSkill(run: RunState, gesture: string, instanceId?: string): string | undefined {
  if (!run.field || !SKILL_GESTURES.includes(gesture as SkillGesture)) return '기술 도형을 선택하세요.';
  const access=configurationFailure(run);if(access)return access;
  const skills = ensureFieldSkills(run), card = run.collection.find(c => c.instanceId === instanceId);
  if (instanceId && (!card || fieldSkillRestriction(run,card))) return card ? fieldSkillRestriction(run,card) : '카드를 찾을 수 없다.';
  if (card && !skillFitsGesture(card,gesture)) return skillStrokes(card)+'획 이상 도형이 필요하다.';
  if (card) {
    for (const id of SKILL_GESTURES) {
      const other = equippedSkill(run, id);
      if (other && skillFamily(other) === skillFamily(card)) delete skills.slots[id];
    }
    skills.slots[gesture as SkillGesture] = card.instanceId;
  } else delete skills.slots[gesture as SkillGesture];
}

/** Authored pattern stays fixed; aimed skills use the selected cell as their anchor. */
export function fieldSkillCells(world: InteractionWorld, player: WorldEntity, card: Card, aim: GridPos): SkillCell[] {
  if (!player.pos) return [];
  const space = world.spaces?.[player.nodeId]; if (!space) return [];
  const mode = card.targetMode ?? (skillEffects(card).some(hostileEffect) ? 'pattern' : 'self');
  if (mode === 'self') return [{pos: {...player.pos}, multiplier: 1}];
  if (mode === 'aimed' && (distance(player.pos, aim) > skillReach(card) || !hasSight(world, player, aim))) return [];
  const anchor = mode === 'aimed' ? aim : player.pos;
  const shape = card.shape?.length ? card.shape : mode === 'aimed' ? [{dx: 0, dy: 0}] : [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}];
  const cells = new Map<string, SkillCell>();
  shape.forEach((off, i) => {
    const pos = {x: anchor.x + off.dx, y: anchor.y + off.dy};
    if (!space.tiles[pos.y]?.[pos.x] || space.tiles[pos.y]![pos.x] === 'wall' || !hasSight(world, player, pos)) return;
    const multiplier = card.perTileMul?.[i] ?? 1, key = positionKey(pos);
    if (!cells.has(key) || cells.get(key)!.multiplier < multiplier) cells.set(key, {pos, multiplier});
  });
  return [...cells.values()];
}
const targetsAt = (world: InteractionWorld, player: WorldEntity, cells: SkillCell[]) => cells.flatMap(cell =>
  entitiesAt(world, player.nodeId, cell.pos).filter(e => e.id !== player.id && (e.properties.integrity ?? 100) > 0)
    .map(target => ({target, multiplier: cell.multiplier})));
export function skillFailure(run: RunState, world: InteractionWorld, card: Card, cells: SkillCell[]): string | undefined {
  const unavailable = fieldSkillRestriction(run,card); if (unavailable) return unavailable;
  const player = world.entities.player!;
  if (run.field?.skills?.pending) return '기술을 시전 중이다.';
  const blocked = actionRestriction(player); if (blocked) return blocked;
  const cooldown = skillRemaining(run, card); if (cooldown) return cooldown + '턴 남음';
  if ((player.properties.mana ?? 0) < fieldSkillMana(run,card)) return '마나 부족';
  if (!cells.length) return '사거리 밖이다.';
  if (skillEffects(card).some(e => e.kind === 'move-self') && actionRestriction(player, true)) return actionRestriction(player, true);
  if (skillEffects(card).every(hostileEffect) && !targetsAt(world, player, cells).some(({target}) =>
    !(status(target, 'ghost') && (card.targetMode === 'aimed' || status(player,'ghost'))))) return '범위 안에 대상이 없다.';
}
function change(world: InteractionWorld, actor: WorldEntity, target: WorldEntity, property: string, amount: number) {
  return influenceEntity(world, target, property, amount, actor.id);
}
function damage(world: InteractionWorld, actor: WorldEntity, target: WorldEntity, base: number, multiplier: number, addStats: boolean, bonus: number, ranged: boolean) {
  if ((target.properties.integrity ?? 100) <= 0 || status(target,'ghost') && (ranged || status(actor,'ghost'))) return;
  const value = Math.max(0, Math.floor((addStats ? outgoingDamage(actor, base + bonus, ranged) : base) * multiplier) -
    (target.creature ? combatDefinition(target)?.defense ?? 0 : 0));
  const amount = value / (target.properties.maxHp ?? 100) * 100;
  const facts = change(world, actor, target, 'force', amount + (target.properties.hardness ?? 0) + (target.colors.iron ?? 0) / 20);
  if (target.creature && value > 0) target.creature.angry = true;
  return facts.some(f => (f.property === 'integrity' || f.property === 'guard') && f.after! < f.before!);
}
function displace(world: InteractionWorld, actor: WorldEntity, target: WorldEntity, origin: GridPos, count: number, toward: boolean) {
  if (!target.pos || actionRestriction(target,true)) return;
  for (let i = 0; i < count; i++) {
    const current = target.pos;
    const candidates = cardinal(current).filter(p => walkable(world,target.nodeId,p,target.id) &&
      !world.spaces?.[target.nodeId]?.exits.some(e => distance(e.pos,p) === 0));
    candidates.sort((a,b) => (distance(a,origin)-distance(b,origin)) * (toward ? 1 : -1));
    const next = candidates.find(p => toward ? distance(p,origin) < distance(current,origin) : distance(p,origin) > distance(current,origin));
    if (!next) break;
    const result = resolveInteraction(world, actor.id, target.id, {id:'skill:move',label:'이동',description:'',duration:0,reach:99,effects:[{kind:'relocate',pos:next}]});
    if (!result.ok) break;
    afterMovement(target);
  }
}
export function resolveFieldSkill(run: RunState, world: InteractionWorld, card: Card, cells: SkillCell[], paid: number, power=1) {
  if(enforceTamamoSubmission(run,world)||fieldSkillRestriction(run,card))return;
  const player = world.entities.player!;
  const ranged = card.targetMode === 'aimed';
  const targets = targetsAt(world, player, cells).filter(({target})=>!(status(target,'ghost') && (ranged || status(player,'ghost'))));
  const raw = bonusesFromEffective(run, useDataStore().equipments);
  const bonus = {damage: Math.floor(raw.damage * (status(player,'regress') ? .5 : 1)), block: Math.floor(raw.block * (status(player,'regress') ? .5 : 1))};
  const skills=ensureFieldSkills(run), family=skillFamily(card);
  const ready=SKILL_GESTURES.map(g=>equippedSkill(run,g)).filter((c):c is Card=>!!c&&skillFamily(c)!==family&&skillRemaining(run,c)===0).length;
  const recharge=(n:number)=>{for(const g of SKILL_GESTURES){const c=equippedSkill(run,g);if(c&&skillFamily(c)!==family){const key=skillFamily(c);skills.readyAt[key]=Math.max(turn(run), (skills.readyAt[key]??0)-n);}}};
  const colors = Object.values(player.colors).filter((n): n is number => typeof n === 'number' && n > 0);
  const boost = (base:number) => Math.floor(scaledValue(base,card)*power);
  const hitTargets = new Set<WorldEntity>();
  const strike = (target:WorldEntity, base:number, multiplier:number, stats=true) => {
    if(damage(world,player,target,boost(base),multiplier,stats,bonus.damage,ranged))hitTargets.add(target);
  };
  const deal = (base: number, stats = true) => targets.forEach(({target,multiplier}) => strike(target,base,multiplier,stats));
  const block = (base: number, stats = true) => {
    if (!status(player,'feral') && !status(player,'feral-heavy')) change(world,player,player,'guard', Math.max(0,boost(base) + (stats ? bonus.block + status(player,'dexterity') - status(player,'frail') : 0)));
  };
  for (const effect of skillEffects(card)) {
    const v = effect.value ?? 0;
    switch (effect.kind) {
      case 'draw': recharge(Math.min(2,v)); break;
      case 'return-hand-to-deck': recharge(2); break;
      case 'draw-if-color': { const color=String(effect.params?.color??'water');if((player.colors[color as keyof typeof player.colors]??0)>=Number(effect.params?.threshold??30))recharge(Math.min(2,v)); break; }
      case 'exhaust-self': case 'return-self-to-hand': break; // cooldown terms applied at cast time
      case 'damage-per-hand': deal(v*ready); break;
      case 'heal-per-hand': change(world,player,player,'integrity',boost(v*ready)/run.maxHp*100);break;
      case 'damage-low-hand': deal(v*(ready<=Number(effect.params?.threshold??2)?2:1));break;
      case 'damage-per-cards-played': deal(v*Math.max(1,(skills.recent??[]).filter(x=>turn(run)-x.turn<3).length));break;
      case 'next-card-double': skills.nextPower={multiplier:2,expires:turn(run)+4};break;
      case 'this-turn-amp': skills.nextPower={multiplier:1+v/100,expires:turn(run)+4};break;
      case 'hand-cost-down': skills.nextCost={amount:Math.max(0,v),expires:turn(run)+4};break;
      case 'next-turn-energy': (skills.manaDue??=[]).push({amount:v,due:turn(run)+1});break;
      case 'damage': deal(v); break;
      case 'heal': change(world,player,player,'integrity',boost(v) / run.maxHp * 100); break;
      case 'block': block(v); break;
      case 'break-armor': targets.forEach(({target}) => change(world,player,target,'guard',-(target.properties.guard ?? 0))); break;
      case 'apply-status': (selfEffect(effect) ? [player] : targets.map(t => t.target)).forEach(target => change(world,player,target,'status:' + String(effect.params?.status),v)); break;
      case 'ghost-self': change(world,player,player,'status:ghost',v); break;
      case 'grant-airborne': change(world,player,player,'status:airborne',v); break;
      case 'damage-min-color': deal(Math.floor((colors.length ? Math.min(...colors) : 0) * v),false); break;
      case 'damage-top-color': deal(Math.floor(Math.max(0,...colors) * v),false); break;
      case 'damage-color-count': deal(colors.length * Math.floor(v),false); break;
      case 'block-top-color': block(Math.floor(Math.max(0,...colors) * v),false); break;
      case 'damage-per-confine': deal(cardinal(player.pos!).filter(p => !walkable(world,player.nodeId,p,player.id)).length * v,false); break;
      case 'damage-per-relic': deal(run.relics.length * v); break;
      case 'block-to-damage': deal((player.properties.guard ?? 0) * v,false); break;
      case 'double-block': block(player.properties.guard ?? 0,false); break;
      case 'spend-all-energy': deal(paid * v,false); break;
      case 'damage-from-hp': {
        const pay = Math.min(Math.floor(v), Math.max(0,(player.properties.integrity ?? 100) * run.maxHp / 100 - 1));
        change(world,player,player,'integrity',-pay / run.maxHp * 100);
        deal(pay * Number(effect.params?.mult ?? 2),false); break;
      }
      case 'adaptive-strike': if (player.properties.guard) deal(v + Number(effect.params?.bonus ?? 4)); else block(v); break;
      case 'heavy-blade': deal(outgoingDamage(player,v + bonus.damage,ranged) + status(player,'strength') * (Number(effect.params?.mult ?? 1)-1),false); break;
      case 'damage-per-debuff': targets.forEach(({target,multiplier}) => strike(target,v * [...DEBUFFS].reduce((n,key)=>n+status(target,key),0),multiplier)); break;
      case 'consume-vulnerable': case 'consume-burn': case 'consume-poison': {
        const key = effect.kind.slice(8);
        targets.forEach(({target,multiplier}) => { const count=status(target,key); change(world,player,target,'status:'+key,-count); strike(target,count*v,multiplier,false); }); break;
      }
      case 'move-self': {
        const nearest = Object.values(world.entities).filter(e=>e.id!==player.id&&e.nodeId===player.nodeId&&e.pos&&e.kind==='actor'&&(e.properties.integrity??100)>0&&hasSight(world,player,e)).sort((a,b)=>distance(player.pos!,a.pos!)-distance(player.pos!,b.pos!))[0];
        if (nearest?.pos) displace(world,player,player,nearest.pos,Math.max(1,v),effect.params?.mode === 'toward'); break;
      }
      case 'push-enemy': case 'pull-enemy': targets.forEach(({target}) => displace(world,player,target,player.pos!,Math.max(1,v),effect.kind === 'pull-enemy')); break;
      case 'terrain-water': case 'terrain-fire': case 'terrain-smoke': {
        const property = effect.kind === 'terrain-water' ? 'moisture' : effect.kind === 'terrain-fire' ? 'heat' : 'smoke';
        for (const {pos} of cells) {
          const id = player.nodeId + ':residue:' + positionKey(pos);
          const ground = world.entities[id] ??= {id,name:'바닥',kind:'terrain',nodeId:player.nodeId,pos:{...pos},colors:{},stock:{},tags:['ground','storage','shared'],properties:{integrity:100}};
          for (const target of [ground,...entitiesAt(world,player.nodeId,pos).filter(e=>e.id !== id)]) change(world,player,target,property,Math.max(1,v));
        }
        break;
      }
      default: throw new Error('Unsupported field skill effect: ' + effect.kind);
    }
  }
  if(card.enchantment==='ember')for(const target of hitTargets)if((target.properties.integrity??0)>0)change(world,player,target,'status:burn',2);
  if(card.enchantment==='shelter'&&!status(player,'feral')&&!status(player,'feral-heavy'))change(world,player,player,'guard',3);
  if(card.enchantment==='renewal')change(world,player,player,'status:regen',1);
  recordFact(world,{turn:world.turn,nodeId:player.nodeId,actorId:player.id,targetId:player.id,kind:'signal',labor:0,message:card.name});
}
export function castFieldSkill(run: RunState, world: InteractionWorld, gesture: string, aim: GridPos): {ok:boolean;message:string} {
  if(enforceTamamoSubmission(run,world))return {ok:false,message:''};
  const card = equippedSkill(run,gesture);
  if (!card) return {ok:false,message:'기술을 장착하세요.'};
  if(!skillFitsGesture(card,gesture))return {ok:false,message:skillStrokes(card)+'획 이상 도형이 필요하다.'};
  const player = world.entities.player!, cells = fieldSkillCells(world,player,card,aim);
  const failure = skillFailure(run,world,card,cells); if (failure) return {ok:false,message:failure};
  const boss = targetsAt(world,player,cells).find(({target}) => target.creature?.rank === 'boss' && !target.creature.engaged)?.target;
  if (boss) {beginBossEncounter(run,boss,true);return {ok:false,message:''};}
  const paid = skillEffects(card).some(e=>e.kind === 'spend-all-energy') ? player.properties.mana ?? 0 : fieldSkillMana(run,card);
  change(world,player,player,'mana',-paid);
  const skills = ensureFieldSkills(run), power=skills.nextPower&&skills.nextPower.expires>=turn(run)?skills.nextPower.multiplier:1;
  skills.nextPower=undefined;skills.nextCost=undefined;
  skills.recent=[...(skills.recent??[]).filter(x=>turn(run)-x.turn<3),{family:skillFamily(card),turn:turn(run)}].slice(-8);
  const castTurns = skillCastTurns(card);
  skills.readyAt[skillFamily(card)] = turn(run) + 1 + skillCooldown(card);
  if (castTurns === 0) resolveFieldSkill(run,world,card,cells,paid,power);
  else skills.pending = {card:JSON.parse(JSON.stringify(card)),nodeId:player.nodeId,cells,due:turn(run)+castTurns,paid,power};
  return {ok:true,message:castTurns > 1 ? card.name + ' 시전' : ''};
}
export function tickFieldSkills(run: RunState, world: InteractionWorld) {
  if(enforceTamamoSubmission(run,world))return;
  const skills = run.field?.skills, pending = skills?.pending, player = world.entities.player;
  if(skills&&player&&(player.properties.integrity??0)>0){
    if(skills.nextPower&&skills.nextPower.expires<turn(run))skills.nextPower=undefined;
    if(skills.nextCost&&skills.nextCost.expires<turn(run))skills.nextCost=undefined;
    for(const due of skills.manaDue??[])if(due.due<=turn(run))change(world,player,player,'mana',Math.max(0,Math.min(due.amount,3-(player.properties.mana??0))));
    skills.manaDue=skills.manaDue?.filter(d=>d.due>turn(run));
  }
  if (!pending || !player) return;
  if (pending.nodeId !== player.nodeId || (player.properties.integrity ?? 100) <= 0 || actionRestriction(player)) {
    skills!.pending = undefined; return;
  }
  if (turn(run) < pending.due) return;
  skills!.pending = undefined;
  // Locked cells are retained across saves. A target that walked away can evade.
  resolveFieldSkill(run,world,pending.card,pending.cells.filter(c=>hasSight(world,player,c.pos)),pending.paid,pending.power??1);
}

export function fieldSkillMana(run: RunState, card: Card): number {
  const prepared=run.field?.skills?.nextCost;
  return Math.max(1,skillMana(card)-(prepared&&prepared.expires>=turn(run)?prepared.amount:0));
}
