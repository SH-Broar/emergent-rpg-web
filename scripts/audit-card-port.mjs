import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';

// Read-only analysis: matching a primitive is not card execution support.
const GROUPS = [
  { id:'property', label:'공통 속성 연산 재사용', note:'대상·비용·수치 계산 후 influence로 연결. field-skills에서 카드별 전체 효과 지원 여부를 검사.', kinds:['damage','heal','block','break-armor','apply-status','ghost-self','grant-airborne','grant-color'] },
  { id:'formula', label:'수치 계산 이식', note:'원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행.', kinds:['damage-min-color','damage-top-color','damage-color-count','block-top-color','damage-per-debuff','consume-vulnerable','damage-from-hp','damage-per-confine','block-to-damage','adaptive-strike','spend-all-energy','damage-per-relic','consume-burn','consume-poison','double-block','heavy-blade','amplify-debuff'] },
  { id:'space', label:'격자·환경 연결', note:'범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용.', kinds:['terrain-water','terrain-fire','terrain-smoke','lure','move-self','pull-enemy','push-enemy','place-installation','status-spread','chain-explosion'] },
  { id:'hand', label:'손패 효과의 기술 역할 변환', note:'드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속.', kinds:['draw','return-hand-to-deck','draw-if-color','damage-per-hand','exhaust-self','return-self-to-hand','heal-per-hand','next-card-double','curse-tick','damage-per-cards-played','buff-card-instance','refill','hand-cost-down','damage-low-hand','feel-no-pain'] },
  { id:'duration', label:'발동·지속 범위 확인', note:'필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결.', kinds:['next-turn-energy','growing-block','growing-damage','skip-enemy-action','slow-enemy','delayed-damage','random-effect','negate-reflect','bloom-strength','this-turn-amp','metallicize','barricade','rupture','juggernaut'] },
  { id:'actor', label:'변신 및 이번 버전 제외 효과', note:'변신은 별도 기술 봉인과 NPC 해제로 연결. 동료·해제 카드 효과는 이번 버전에서 지원하지 않는다.', kinds:['damage-per-companion','release-transform','summon-ally'] },
];
const root=fileURLToPath(new URL('../',import.meta.url));
const publicDir=resolve(root,'public'),output=resolve(root,'docs/card-port-matrix.md');
const byKind=new Map(GROUPS.flatMap(g=>g.kinds.map(k=>[k,g])));
assert.equal(byKind.size,GROUPS.reduce((n,g)=>n+g.kinds.length,0),'duplicate classification');
const source=ts.createSourceFile('card.ts',readFileSync(resolve(root,'src/data/schemas/card.ts'),'utf8'),ts.ScriptTarget.Latest,true);
const alias=source.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text==='CardEffectKind');
assert(alias&&ts.isUnionTypeNode(alias.type),'CardEffectKind union not found');
const declared=alias.type.types.map(n=>n.literal?.text).filter(Boolean);
assert.deepEqual([...byKind.keys()].sort(),[...declared].sort(),'classify every schema effect, including unused kinds');
const oldFetch=globalThis.fetch;
const server=await createServer({root,server:{middlewareMode:true},appType:'custom'});
try {
  globalThis.fetch=async url=>{
    const path=resolve(publicDir,String(url).replace(/^\//,''));
    const rel=relative(publicDir,path);
    if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw new Error('Unexpected data path');
    return new Response(readFileSync(path,'utf8'));
  };
  const {loadAllData}=await server.ssrLoadModule('/src/data/loader.ts');
  const {skillUnavailable,FIELD_SKILL_EFFECTS}=await server.ssrLoadModule('/src/systems/field-skills.ts');
  const data=await loadAllData('/'),cards=[...data.cards.values()].sort((a,b)=>a.id.localeCompare(b.id,'en'));
  assert(cards.length>0);
  const uses=new Map(declared.map(k=>[k,new Set()]));
  for(const card of cards)for(const effect of card.effects){
    assert(uses.has(effect.kind),'Unclassified effect '+effect.kind+' in '+card.id);
    uses.get(effect.kind).add(card.id);
  }
  const countBy=key=>Object.fromEntries([...new Set(cards.map(c=>c[key]??'미지정'))].sort().map(v=>[v,cards.filter(c=>(c[key]??'미지정')===v).length]));
  const handKinds=new Set(GROUPS.find(g=>g.id==='hand').kinds);
  const hand=cards.filter(c=>c.effects.some(e=>handKinds.has(e.kind))||c.trigger==='on-draw');
  const metadata=c=>[
    c.cost>3?'기본 비용 3 초과':'', c.trigger!=='manual'?'발동 '+c.trigger:'',c.instant?'즉시 발동':'',
    c.unplayable?'사용 불가 카드':'',c.possession?'빙의 각성':'',c.curse?'저주 제거 제한':'',
    c.customEffectId?'custom:'+c.customEffectId:'',c.source==='form'?'변신 폼':''
  ].filter(Boolean);
  const special=cards.filter(c=>metadata(c).length);
  const esc=value=>String(value??'').replaceAll('|',' / ').replaceAll('\n',' ');
  let doc='# 카드 포팅 지원 행렬\n\n';
  doc+='현재 실행 로더와 CardEffectKind 스키마에서 생성한다. 명령: node scripts/audit-card-port.mjs --write. 재검증: node scripts/audit-card-port.mjs --check.\n\n';
  doc+='## 판정 기준\n\n';
  doc+='- 카드 데이터 존재, 비슷한 도형 행동 존재, 해당 카드 실행 지원은 서로 다르다. 필드는 장착된 카드의 모든 효과를 처리할 수 있을 때만 실행을 허용한다. 일부 효과만 실행하지 않는다.\n';
  doc+='- 아래 분류는 이식 경로와 필요한 기획 결정을 나타낸다. 완료/지원 선언이 아니다.\n';
  doc+='- 하나의 카드가 여러 효과를 가지면 모든 효과·비용·대상·수명 규칙을 처리하기 전에는 지원 완료로 표시하지 않는다.\n';
  doc+='- 기존 보유 카드와 강화·각성 투자를 보존한다. 상점 카드 판매는 폐지하고 탐험·교류·공방 제작으로 획득한다. 기술 장착형으로 확정했다. 기존 덱·컬렉션과 강화 단계는 보존하고 별도의 도형 슬롯으로 참조한다.\n\n';
  doc+='## 실측\n\n';
  doc+='| 항목 | 수 |\n| --- | ---: |\n';
  doc+='| 일반 장착 가능 정의 | '+cards.filter(c=>c.source!=='form'&&!skillUnavailable(c)).length+' |\n| 변신 중 전용 기술 | '+cards.filter(c=>c.source==='form'&&!skillUnavailable(c)).length+' |\n';
  doc+='| 실행 카드 정의 | '+cards.length+' |\n| 스키마 효과 종류 | '+declared.length+' |\n| 실제 사용 효과 종류 | '+[...uses.values()].filter(s=>s.size).length+' |\n| 원본 손패 효과 보유 카드 | '+hand.length+' |\n| 기본 마나 비용 3 초과 | '+cards.filter(c=>c.cost>3).length+' |\n| 비수동 발동 | '+cards.filter(c=>c.trigger!=='manual').length+' |\n| 즉시 발동 | '+cards.filter(c=>c.instant).length+' |\n| custom 함수 슬롯 | '+cards.filter(c=>c.customEffectId).length+' |\n\n';
  doc+='강화판·종족 폼·잡카드·빙의 카드·실행 시 합성되는 카드도 포함한다. 손패 의존 수는 손패 효과 또는 on-draw 발동을 포함하는 서로 다른 카드 수다. 분류별 수는 중복될 수 있다.\n\n';
  doc+='## 효과별 연결 계획\n\n| 효과 | 포함 카드 수 | 분류 | 원시 효과 연결 | 작업 |\n| --- | ---: | --- | --- | --- |\n';
  for(const g of GROUPS)for(const kind of g.kinds)doc+='| '+kind+' | '+uses.get(kind).size+' | '+g.label+' | '+(FIELD_SKILL_EFFECTS.has(kind)?'연결':'후속')+' | '+g.note+' |\n';
  doc+='\n## 별도 확인할 규칙\n\n';
  doc+='- 손패: 역할 유지 변환을 구현했다. 준비 효과는 4턴, 최근 사용 기록은 3턴으로 한정한다. 상세 규칙은 equipped-skills-port.md.\n';
  doc+='- 마나: 기본 비용이 최대 마나 3을 넘는 카드는 '+cards.filter(c=>c.cost>3).map(c=>c.name+' ('+c.id+', '+c.cost+')').join(', ')+'. 자동으로 3에 맞추지 않고 원본 의도와 비용 감소 경로를 확인한다.\n';
  doc+='- 시간: 모든 기술은 최소 마나 1과 행동 1턴을 사용한다. 빠른 기술도 행동 시간을 생략하지 않는다. 여정 제한시간만 폐지했다.\n';
  doc+='- 범위: 원본 shape와 perTileMul, aimed/throw, 시야·장애물·안전 칸을 함께 이식한다. 이름만 같은 단일 대상 공격으로 대체하지 않는다.\n';
  doc+='- 상태: metallicize는 구 카드의 매 턴 방어 획득과 현재 필드의 방어 감소 억제가 다르다. 이름만 매핑하지 않는다.\n';
  doc+='- 지속: growing 계열의 사본별 성장, 전투 한정 파워, 다음 카드/다음 턴 효과의 수명과 저장 복원을 구별한다.\n';
  doc+='- 특수: lock-in은 카드 필드만의 문제가 아니며 몬스터 구속·변신·빙의·동료와 함께 검토한다.\n\n';
  doc+='## 분포\n\n';
  for(const key of ['source','trigger','targetMode','castSpeed'])doc+='- '+key+': '+Object.entries(countBy(key)).map(([k,n])=>k+' '+n).join(', ')+'\n';
  doc+='\n## 카드별 인벤토리\n\n<details>\n<summary>전체 '+cards.length+'종 펼치기</summary>\n\n| ID | 이름 | 비용 | 효과 | 연결 분류 | 추가 조건 | 현재 장착 |\n| --- | --- | ---: | --- | --- | --- | --- |\n';
  for(const c of cards)doc+='| '+[c.id,c.name,c.cost,c.effects.map(e=>e.kind).join(', '),[...new Set(c.effects.map(e=>byKind.get(e.kind).label))].join(', '),metadata(c).join(', ')||'없음',skillUnavailable(c)||(c.source==='form'?'해당 종족으로 변신 중':'가능')].map(esc).join(' | ')+' |\n';
  doc+='\n</details>\n';
  if(process.argv.includes('--write'))writeFileSync(output,doc);
  if(process.argv.includes('--check'))assert.equal(readFileSync(output,'utf8'),doc,'Regenerate the card port matrix');
  console.log(JSON.stringify({status:'PASS',cards:cards.length,effectKinds:declared.length,usedEffectKinds:[...uses.values()].filter(s=>s.size).length,handDependent:hand.length,overThreeMana:cards.filter(c=>c.cost>3).length,nonManual:cards.filter(c=>c.trigger!=='manual').length,instant:cards.filter(c=>c.instant).length,custom:cards.filter(c=>c.customEffectId).length,specialCards:special.length,report:'docs/card-port-matrix.md'},null,2));
} finally {await server.close();globalThis.fetch=oldFetch;}
