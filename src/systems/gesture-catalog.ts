export interface StrokePoint { x: number; y: number }
export interface GestureDefinition {
  id: string;
  glyph: string;
  name: string;
  points: readonly StrokePoint[];
  closed?: boolean;
  quick?: boolean;
  direction?: { x: number; y: number };
  /** Straight diagonal strokes are actions, not diagonal movement. */
  lineSectors?: readonly number[];
  tap?: boolean;
  /** Complex patterns require actual drawing, with their own accuracy threshold. */
  drawOnly?: boolean;
  tolerance: number;
  effect?: { property: string; amount: number; mana: number; reach: number };
}
const points = (...pairs: number[][]): StrokePoint[] => pairs.map(([x,y]) => ({ x: x!, y: y! }));
const star = [0,2,4,1,3,0].map(i => ({ x: .5 + .48 * Math.sin(i * Math.PI * 2 / 5), y: .5 - .48 * Math.cos(i * Math.PI * 2 / 5) }));
/** Add patterns here; recognition, drawing guides and the field catalogue share this definition. */
export const GESTURE_CATALOG: readonly GestureDefinition[] = [
  { id:'tap', glyph:'●', name:'점 터치', points:points([.5,.5]), tap:true, tolerance:0 },
  { id:'up', glyph:'↑', name:'위 선', points:points([.5,1],[.5,0]), direction:{x:0,y:-1}, quick:true, tolerance:.15 },
  { id:'down', glyph:'↓', name:'아래 선', points:points([.5,0],[.5,1]), direction:{x:0,y:1}, quick:true, tolerance:.15 },
  { id:'left', glyph:'←', name:'왼쪽 선', points:points([1,.5],[0,.5]), direction:{x:-1,y:0}, quick:true, tolerance:.15 },
  { id:'right', glyph:'→', name:'오른쪽 선', points:points([0,.5],[1,.5]), direction:{x:1,y:0}, quick:true, tolerance:.15 },
  { id:'strike', glyph:'╱', name:'올라가는 빗금', points:points([0,1],[1,0]), lineSectors:[3,7], tolerance:.15 },
  { id:'tend', glyph:'╲', name:'내려가는 빗금', points:points([0,0],[1,1]), lineSectors:[1,5], tolerance:.15 },
  { id:'triangle', glyph:'△', name:'정삼각형', points:points([.5,0],[1,1],[0,1],[.5,0]), closed:true, quick:true, tolerance:.16 },
  { id:'inverted', glyph:'▽', name:'역삼각형', points:points([0,0],[1,0],[.5,1],[0,0]), closed:true, quick:true, tolerance:.16 },
  { id:'circle', glyph:'○', name:'원', points:Array.from({length:65},(_,i)=>({x:.5+.5*Math.cos(i*Math.PI/32),y:.5+.5*Math.sin(i*Math.PI/32)})), closed:true, quick:true, tolerance:.13 },
  { id:'lift', glyph:'∧', name:'위로 꺾인 선', points:points([0,1],[.5,0],[1,1]), tolerance:.13 },
  { id:'place', glyph:'∨', name:'아래로 꺾인 선', points:points([0,0],[.5,1],[1,0]), tolerance:.13 },
  { id:'take', glyph:'⊂', name:'왼쪽 열린 네모', points:points([1,0],[0,0],[0,1],[1,1]), tolerance:.13 },
  { id:'give', glyph:'⊃', name:'오른쪽 열린 네모', points:points([0,0],[1,0],[1,1],[0,1]), tolerance:.13 },
  { id:'dash', glyph:'ϟ', name:'번개선', points:points([1,0],[0,.5],[1,.5],[0,1]), tolerance:.13 },
  { id:'star', glyph:'☆', name:'오각별', points:star, closed:true, drawOnly:true, tolerance:.075, effect:{property:'charge',amount:28,mana:3,reach:4} },
];
export const gestureDefinition = (id: string) => GESTURE_CATALOG.find(g => g.id === id);
