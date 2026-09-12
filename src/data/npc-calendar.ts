import type { Npc, NodeMap } from './schemas';
export const WEEK_DAYS=['월','화','수','목','금','토','일'] as const;
export function worldDate(elapsed=0){const seconds=Math.floor(elapsed+43200),day=Math.floor(seconds/86400)+1;return {day,weekday:(day-1)%7,hour:(seconds%86400)/3600};}
export const homeId=(npc:Npc)=>npc.homeNodeId+'::home:'+npc.id;
export const courtId=(nodeId:string)=>nodeId+'::residents';
export const commonId=(nodeId:string)=>nodeId+'::commons';
export interface ResidentEvent {id:string;npcId:string;nodeId:string;title:string;weekdays?:number[];days?:number[];start:number;end:number;lines:string[];choice:string;result:string;input?:Record<string,number>;output?:Record<string,number>;practice?:number;}
/** Dates are journey days. Weekly appointments use the same clock as movement. */
export const RESIDENT_EVENTS:ResidentEvent[]=[
 {id:'cassis-embers',npcId:'npc-cassis',nodeId:'n-moss-forge',title:'불씨를 다루는 오후',weekdays:[1,4],start:14,end:17,lines:["이 불씨는 내가 옮길게. 너는 숯 하나만 얹어 봐.","한꺼번에 덮지 말고. 공기가 드나들 틈은 남겨 줘."],choice:'불씨를 옮겨 본다',result:"옳지. 이제 손 놔도 안 꺼질 거야.",input:{'i-life-char':1},output:{'i-material-common':1},practice:2},
 {id:'echo-repair',npcId:'npc-echo',nodeId:'n-iluneon-market',title:'수선하는 날',weekdays:[2,5],start:9,end:12,lines:["여기 끝 좀 잡아 줘. 혼자 당기면 자꾸 틀어져.","붙이고 나면 다시 쓸 수 있어. 네 것도 뜯어졌으면 가져오고."],choice:'재료를 보태 수선한다',result:"됐다. 손 안 다쳤지? 남은 재료는 챙겨 가.",input:{'raw-fiber':2},output:{'i-material-common':2},practice:2},
 {id:'seed-weather',npcId:'npc-seed',nodeId:'n-manonickla',title:'바람을 읽는 시간',weekdays:[0,3],start:15,end:18,lines:["저기 빨랫줄 봐. 조금 전까진 반대로 흔들렸거든.","너는 아래쪽을 봐 줘. 나는 한 바퀴 날고 올게."],choice:'함께 관측한다',result:"아래도 바뀌었구나. 좋아, 같은 시각으로 적어 둘게.",practice:2},
 {id:'seira-song',npcId:'npc-seira',nodeId:'n-coral-song',title:'저녁의 화음',weekdays:[4,6],start:18,end:21,lines:["이 부분에서 내가 숨을 쉬거든. 그때 네 목소리를 넣어 볼래?","길게 안 해도 돼. 내가 먼저 해 볼게."],choice:'한 음을 보탠다',result:"잘 들렸어. 한 번 더 할까? 이번엔 내가 작게 부를게.",practice:1},
 {id:'hako-welcome',npcId:'npc-hako',nodeId:'n-iluneon-square',title:'다시 만난 여행자',days:[2],start:12,end:18,lines:["또 만났네! 어제는 인사만 하고 가 버렸지?","잠깐 앉아. 나도 아직 출발 안 했어."],choice:'옆에 앉아 이야기한다',result:"그래서 그쪽으로 갔구나. 다음엔 내가 다녀온 데도 들려줄게.",practice:1},
 {id:'cayo-tools',npcId:'npc-cayo',nodeId:'n-manonickla-forge',title:'손에 맞는 도구',days:[3],start:9,end:18,lines:["손을 펴 보게. 손잡이 굵기가 안 맞는군.","섬유로 감아 줄 테니 한번 쥐어 봐. 불편하면 바로 말하고."],choice:'손잡이를 함께 감는다',result:"이제 힘을 덜 줘도 되지? 오래 쓰다 헐거워지면 다시 오게.",input:{'raw-fiber':2},output:{'i-material-common':2},practice:3},
 {id:'phoenix-photo',npcId:'npc-phoenix',nodeId:'n-iluneon-square',title:'일주일째의 사진',days:[7],start:15,end:18,lines:["일주일쯤 됐나? 처음 봤을 때보다 짐이 익숙해 보이네.","한 장 찍어도 돼? 빛이 곧 옮겨갈 것 같아서."],choice:'사진을 남긴다',result:"됐어. 눈 안 감았네. 다음에 돌아오면 보여 줄게.",practice:1},
 {id:'shinsian-cup',npcId:'npc-shinsian',nodeId:'n-tacomi-cafe',title:'잔을 데우는 아침',weekdays:[1,5],start:7,end:10,lines:["잔을 몇 개 데워 두려는데 같이 할래?","맨손으로 들지 말고 손잡이 잡아. 물은 내가 부을게."],choice:'물을 나누어 붓는다',result:"고마워. 그건 네 잔으로 써. 마실 건 뭘로 줄까?",input:{water:1},practice:2},
];
export function eventActive(event:ResidentEvent,elapsed:number){const d=worldDate(elapsed);return d.hour>=event.start&&d.hour<event.end&&(!event.weekdays||event.weekdays.includes(d.weekday))&&(!event.days||event.days.includes(d.day));}
export function residentGoal(npc:Npc,map:NodeMap,elapsed:number){
 const date=worldDate(elapsed),home=homeId(npc),valid=(id:string)=>map.nodes.some(n=>n.id===id);
 const event=RESIDENT_EVENTS.find(e=>e.npcId===npc.id&&eventActive(e,elapsed)&&valid(e.nodeId));
 if(event)return {nodeId:event.nodeId,activity:event.title,eventId:event.id};
 const night=npc.tags?.includes('night')||npc.id==='npc-papyrus'||npc.id==='npc-seraphine';
 const hour=(date.hour+(night?12:0))%24;
 if(hour<7||hour>=22)return {nodeId:home,activity:'집에서 쉬는 중'};
 const guides:Record<string,string>={'npc-niayur':'n-iluneon-square','npc-hako':'n-iluneon-square','npc-echo':'n-iluneon-market','npc-olyu':'n-iluneon-clocktower','npc-miyu':'n-iluneon-clocktower'};
 if(hour>=9&&hour<20&&guides[npc.id]&&valid(guides[npc.id]!))return {nodeId:guides[npc.id]!,activity:npc.id==='npc-hako'?'광장에서 여행 준비 중':npc.id==='npc-niayur'?'분수 곁에서 쉬는 중':'작업 중'};
 const places=(npc.presenceNodeIds??[]).filter(valid);
 if(npc.id==='npc-cassis'&&valid('n-moss-forge'))places.push('n-moss-forge');
 if(hour>=9&&hour<12||hour>=14&&hour<18){const nodeId=places.length?places[(date.day-1+(hour>=14?1:0))%places.length]!:npc.homeNodeId!;return {nodeId,activity:npc.role==='Craftsman'?'작업 중':npc.role==='Priest'?'길을 살피는 중':'볼일을 보는 중'};}
 const node=map.nodes.find(n=>n.id===npc.homeNodeId);
 return {nodeId:node?.kind==='village'?commonId(node.id):courtId(npc.homeNodeId!),activity:hour<9?'아침을 보내는 중':hour<14?'식사 중':'이웃과 쉬는 중'};
}
