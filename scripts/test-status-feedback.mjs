import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({root,server:{middlewareMode:true},appType:'custom'});
try{
  const {fieldStatusFeedback,STATUS_FEEDBACK}=await server.ssrLoadModule('/src/systems/field-status-feedback.ts');
  const {DEBUFFS,changeStatus}=await server.ssrLoadModule('/src/systems/world/status.ts');
  const {default:Overlay}=await server.ssrLoadModule('/src/components/FieldStatusFeedback.vue');
  const player={id:'player',name:'나',kind:'actor',nodeId:'test',pos:{x:2,y:3},colors:{},stock:{},tags:[],properties:{integrity:100}};
  assert.equal(fieldStatusFeedback(player),undefined);
  for(const key of DEBUFFS)assert(STATUS_FEEDBACK.some(rule=>rule.keys.includes(key)),key+' lacks perceptual feedback');
  changeStatus(player.properties,'poison',5);
  const before=JSON.stringify(player);
  const markup=await renderToString(createSSRApp(Overlay,{entity:player}));
  assert(markup.includes('data-status="poison"'));
  assert(markup.includes('aria-hidden="true"'));
  assert(!markup.includes('<button'),'the overlay cannot add gesture controls');
  assert.equal(JSON.stringify(player),before,'rendering must never mutate game state');
  changeStatus(player.properties,'poison',-5);
  assert.equal(fieldStatusFeedback(player),undefined,'clearing the status removes its effect immediately');
  for(const key of DEBUFFS)player.properties['status:'+key]=999;
  player.properties['status:devour']=4;
  const layered=fieldStatusFeedback(player,true);
  assert.equal(layered.id,'devour');assert(layered.edge<=.4);assert(layered.marks.length<=2);
  player.properties={integrity:100,'status:poison':1};
  const low=fieldStatusFeedback(player);player.properties['status:poison']=999;
  assert.deepEqual(fieldStatusFeedback(player),low,'stacks cannot make the screen unreadable');
  player.properties={integrity:100};
  assert.equal(fieldStatusFeedback(player,true).id,'transform');
  assert.equal(fieldStatusFeedback(player,false),undefined,'restoring the original race clears transformation feedback');
  player.properties.integrity=0;assert.equal(fieldStatusFeedback(player,true),undefined);
  console.log(JSON.stringify({status:'PASS',checks:['all field debuffs covered','SSR renders current state without mutations or controls','cleansing removes effects','overlapping effects and intensity bounded','transformation and death lifecycle']}));
}finally{await server.close();}
