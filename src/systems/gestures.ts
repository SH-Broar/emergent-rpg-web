import { GESTURE_CATALOG, type GestureDefinition, type StrokePoint } from './gesture-catalog';
export type { StrokePoint } from './gesture-catalog';
export interface GestureMatch { gesture: string; quality: number; directions: number[] }
const length = (a: StrokePoint, b: StrokePoint) => Math.hypot(a.x-b.x,a.y-b.y);
const COUNT = 48;
function resample(points: readonly StrokePoint[], count = COUNT): StrokePoint[] {
  const cumulative = [0];
  for(let i=1;i<points.length;i++) cumulative.push(cumulative[i-1]!+length(points[i-1]!,points[i]!));
  const total = cumulative.at(-1) ?? 0;
  let segment = 1;
  return Array.from({length:count},(_,i)=>{
    const at = total*i/(count-1);
    while(segment<points.length-1 && cumulative[segment]!<at) segment++;
    const a=points[segment-1]!,b=points[segment]??a;
    const t=(at-cumulative[segment-1]!)/Math.max(.0001,cumulative[segment]!-cumulative[segment-1]!);
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  });
}
function bounds(points: readonly StrokePoint[]) {
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};
}
function normalized(points: readonly StrokePoint[]) {
  const b=bounds(points);
  return resample(points).map(p=>({x:(p.x-b.x)/Math.max(b.w,.001),y:(p.y-b.y)/Math.max(b.h,.001)}));
}
/** Eight movement directions, independent of the position of the drawing on the pad. */
export function strokeDirections(points: readonly StrokePoint[]): number[] {
  if(points.length<2) return [];
  const sample=resample(points,33),runs:{direction:number;length:number}[]=[];
  for(let i=1;i<sample.length;i++) {
    const a=sample[i-1]!,b=sample[i]!,distance=length(a,b);
    if(distance<.01) continue;
    const angle=Math.atan2(b.y-a.y,b.x-a.x);
    let direction=(Math.round(angle/(Math.PI/4))+8)%8;
    const prior=runs.at(-1);
    if(prior) {
      const difference=Math.abs(Math.atan2(Math.sin(angle-prior.direction*Math.PI/4),Math.cos(angle-prior.direction*Math.PI/4)));
      if(difference<Math.PI/8+.10) direction=prior.direction;
    }
    if(prior?.direction===direction) prior.length+=distance;
    else runs.push({direction,length:distance});
  }
  const total=runs.reduce((n,r)=>n+r.length,0);
  return runs.filter(r=>r.length>=total*.035).map(r=>r.direction).filter((d,i,a)=>i===0||a[i-1]!==d);
}
function orderedDistance(points: StrokePoint[], template: StrokePoint[], closed: boolean) {
  let best=Infinity;
  for(const direction of [1,-1]) for(let shift=0;shift<(closed?COUNT:1);shift++) {
    let score=0;
    for(let i=0;i<COUNT;i++) {
      const index=closed?(shift+direction*i+COUNT*2)%COUNT:direction===1?i:COUNT-1-i;
      score+=length(points[i]!,template[index]!);
    }
    best=Math.min(best,score/COUNT);
  }
  return best;
}
function shapeDistance(a: StrokePoint[],b: StrokePoint[]) {
  const nearest=(from:StrokePoint[],to:StrokePoint[])=>from.reduce((sum,p)=>sum+Math.min(...to.map(q=>length(p,q))),0)/from.length;
  return (nearest(a,b)+nearest(b,a))/2;
}
const templates = new Map(GESTURE_CATALOG.filter(g=>!g.direction&&!g.tap&&!g.lineSectors).map(g=>[g.id,normalized(g.points)]));
/** Basic patterns tolerate uneven sides and imperfect closure; advanced patterns enforce their authored threshold. */
export function recognizeGestureMatch(input: readonly StrokePoint[], catalog: readonly GestureDefinition[] = GESTURE_CATALOG): GestureMatch | undefined {
  const points:StrokePoint[]=[];
  for(const p of input) if(Number.isFinite(p.x)&&Number.isFinite(p.y)&&(!points.length||length(p,points.at(-1)!)>.3)) points.push(p);
  if(!points.length) return;
  const b=bounds(points),first=points[0]!,last=points.at(-1)!;
  const path=points.slice(1).reduce((n,p,i)=>n+length(points[i]!,p),0);
  const travel=length(first,last),diagonal=Math.hypot(b.w,b.h);
  if(diagonal<=5&&path<=10&&catalog.some(g=>g.tap)) return {gesture:catalog.find(g=>g.tap)!.id,quality:1,directions:[]};
  if(Math.max(b.w,b.h)<8||path<8) return;
  const directions=strokeDirections(points);
  if(travel/path>.84) {
    const direction=(Math.round(Math.atan2(last.y-first.y,last.x-first.x)/(Math.PI/4))+8)%8;
    const candidate=catalog.find(g=>g.lineSectors?.includes(direction)||g.direction && (Math.round(Math.atan2(g.direction.y,g.direction.x)/(Math.PI/4))+8)%8===direction);
    return candidate?{gesture:candidate.id,quality:travel/path,directions}:undefined;
  }
  if(Math.min(b.w,b.h)<12||Math.max(b.w/b.h,b.h/b.w)>3) return;
  const ranked:{definition:GestureDefinition;score:number}[]=[];
  for(const definition of catalog.filter(g=>!g.direction&&!g.tap&&!g.lineSectors)) {
    if(definition.closed && travel>diagonal*(definition.drawOnly ? .25:.52)) continue;
    if(!definition.closed && travel<diagonal*.30) continue;
    if(definition.closed && directions.length<3) continue;
    const template=templates.get(definition.id)??normalized(definition.points);
    const closed=definition.closed?[...points,first]:points;
    const sample=normalized(closed);
    const expectedLength=template.slice(1).reduce((n,p,i)=>n+length(template[i]!,p),0);
    const actualLength=sample.slice(1).reduce((n,p,i)=>n+length(sample[i]!,p),0);
    if(actualLength>expectedLength*1.45||actualLength<expectedLength*.7) continue;
    const ordered=orderedDistance(sample,template,!!definition.closed);
    const shape=shapeDistance(sample,template);
    const expectedDirections=strokeDirections(definition.points).length;
    const turnPenalty=Math.min(.06,Math.max(0,Math.abs(directions.length-expectedDirections)-2)*.012);
    const score=definition.drawOnly?ordered*.8+shape*.2:ordered*.35+shape*.65+turnPenalty;
    ranked.push({definition,score});
  }
  ranked.sort((a,b)=>a.score-b.score);
  const best=ranked[0],second=ranked[1];
  if(!best||best.score>best.definition.tolerance||second&&second.score-best.score<.012) return;
  return {gesture:best.definition.id,quality:Math.max(0,1-best.score),directions};
}
export function recognizeGesture(input: readonly StrokePoint[]): string | undefined { return recognizeGestureMatch(input)?.gesture; }
