import type { Npc, NodeMap } from './schemas';
export const WEEK_DAYS=['월','화','수','목','금','토','일'] as const;
export function worldDate(elapsed=0){const seconds=Math.floor(elapsed+43200),day=Math.floor(seconds/86400)+1;return {day,weekday:(day-1)%7,hour:(seconds%86400)/3600};}
export const homeId=(npc:Npc)=>npc.homeNodeId+'::home:'+npc.id;
export const courtId=(nodeId:string)=>nodeId+'::residents';
export const commonId=(nodeId:string)=>nodeId+'::commons';
export interface ResidentEvent {id:string;npcId:string;nodeId:string;title:string;weekdays?:number[];days?:number[];start:number;end:number;lines:string[];choice:string;result:string;input?:Record<string,number>;output?:Record<string,number>;practice?:number;}
/** Dates are journey days. Weekly appointments use the same clock as movement. */
export const RESIDENT_EVENTS:ResidentEvent[]=[
 {id:'cassis-embers',npcId:'npc-cassis',nodeId:'n-moss-forge',title:'불씨를 다루는 오후',weekdays:[1,4],start:14,end:17,lines:['크게 피우는 건 쉬워. 줄여 놓고도 안 꺼지게 하는 게 어렵지.','숯 하나만 줘 봐. 네 손에서도 한번 해 보자.'],choice:'불씨를 옮겨 본다',result:'그래, 그 정도. 손을 떨었는데도 불이 남았네.',input:{'i-life-char':1},output:{'i-material-common':1},practice:2},
 {id:'echo-repair',npcId:'npc-echo',nodeId:'n-iluneon-market',title:'수선하는 날',weekdays:[2,5],start:9,end:12,lines:['이쪽 잡아.','틀어진 데만 맞추면 아직 쓸 수 있어.'],choice:'재료를 보태 수선한다',result:'됐어. 남은 건 가져가.',input:{'raw-fiber':2},output:{'i-material-common':2},practice:2},
 {id:'seed-weather',npcId:'npc-seed',nodeId:'n-manonickla',title:'바람을 읽는 시간',weekdays:[0,3],start:15,end:18,lines:['내 깃털 말고, 저기 빨랫줄 끝을 봐. 바람이 먼저 닿는 쪽.','같은 하늘이어도 서 있는 높이에 따라 다르게 불어.'],choice:'함께 관측한다',result:'방금 봤지? 기록에 네 이름도 적어 둘게.',practice:2},
 {id:'seira-song',npcId:'npc-seira',nodeId:'n-coral-song',title:'저녁의 화음',weekdays:[4,6],start:18,end:21,lines:['내가 멈추면 그때 소리를 내 줘. 한 음이어도 돼.','같이 부를 자리를 비워 두는 중이거든.'],choice:'한 음을 보탠다',result:'응. 방금은 파도 소리 사이로 잘 들렸어.',practice:1},
 {id:'hako-welcome',npcId:'npc-hako',nodeId:'n-iluneon-square',title:'다시 만난 여행자',days:[2],start:12,end:18,lines:['어제도 여기 있지 않았어? 얼굴이 기억나서.','벌써 돌아갈 곳이 생긴 기분이면, 제법 잘 지내고 있는 거야.'],choice:'옆에 앉아 이야기한다',result:'다음에 마주치면 그땐 네 얘기부터 듣자.',practice:1},
 {id:'cayo-tools',npcId:'npc-cayo',nodeId:'n-manonickla-forge',title:'손에 맞는 도구',days:[3],start:9,end:18,lines:['힘이 부족해서 안 되는 줄 알았지? 손잡이가 네 손보다 굵잖아.','가져온 섬유로 감아 보자. 꽉 쥐지 않아도 안 미끄러지게.'],choice:'손잡이를 함께 감는다',result:'한번 들어 봐. 이번엔 네 손에 맞을 거야.',input:{'raw-fiber':2},output:{'i-material-common':2},practice:3},
 {id:'phoenix-photo',npcId:'npc-phoenix',nodeId:'n-iluneon-square',title:'일주일째의 사진',days:[7],start:15,end:18,lines:['잠깐, 그대로 있어 봐. 뒤쪽 빛이 좋아.','처음 왔을 때랑 표정이 좀 달라졌네.'],choice:'사진을 남긴다',result:'흔들린 쪽도 버리긴 아깝다. 이것도 네 표정이니까.',practice:1},
 {id:'shinsian-cup',npcId:'npc-shinsian',nodeId:'n-tacomi-cafe',title:'잔을 데우는 아침',weekdays:[1,5],start:7,end:10,lines:['잔부터 데워 둘래? 같은 걸 담아도 식는 속도가 다르거든.','오늘은 급한 손님도 없으니, 천천히 해 보자.'],choice:'물을 나누어 붓는다',result:'딱 좋아. 네 잔도 하나 꺼내 놨어.',input:{water:1},practice:2},
];
export function eventActive(event:ResidentEvent,elapsed:number){const d=worldDate(elapsed);return d.hour>=event.start&&d.hour<event.end&&(!event.weekdays||event.weekdays.includes(d.weekday))&&(!event.days||event.days.includes(d.day));}
export function residentGoal(npc:Npc,map:NodeMap,elapsed:number){
 const date=worldDate(elapsed),home=homeId(npc),valid=(id:string)=>map.nodes.some(n=>n.id===id);
 const event=RESIDENT_EVENTS.find(e=>e.npcId===npc.id&&eventActive(e,elapsed)&&valid(e.nodeId));
 if(event)return {nodeId:event.nodeId,activity:event.title,eventId:event.id};
 const night=npc.tags?.includes('night')||npc.id==='npc-papyrus'||npc.id==='npc-seraphine';
 const hour=(date.hour+(night?12:0))%24;
 if(hour<7||hour>=22)return {nodeId:home,activity:'집에서 쉬는 중'};
 const places=(npc.presenceNodeIds??[]).filter(valid);
 if(npc.id==='npc-cassis'&&valid('n-moss-forge'))places.push('n-moss-forge');
 if(hour>=9&&hour<12||hour>=14&&hour<18){const nodeId=places.length?places[(date.day-1+(hour>=14?1:0))%places.length]!:npc.homeNodeId!;return {nodeId,activity:npc.role==='Craftsman'?'작업 중':npc.role==='Priest'?'길을 살피는 중':'볼일을 보는 중'};}
 const node=map.nodes.find(n=>n.id===npc.homeNodeId);
 return {nodeId:node?.kind==='village'?commonId(node.id):courtId(npc.homeNodeId!),activity:hour<9?'아침을 보내는 중':hour<14?'식사 중':'이웃과 쉬는 중'};
}
