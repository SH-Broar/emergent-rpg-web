import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
  const {recognizeGesture,recognizeGestureMatch,strokeDirections}=await server.ssrLoadModule('/src/systems/gestures.ts');
  const {GESTURE_CATALOG}=await server.ssrLoadModule('/src/systems/gesture-catalog.ts');
  const {createFieldIdleClock}=await server.ssrLoadModule('/src/systems/field-idle.ts');
  const line=(vertices,n=12)=>vertices.slice(1).flatMap((b,i)=>Array.from({length:n},(_,j)=>({x:vertices[i].x+(b.x-vertices[i].x)*j/n,y:vertices[i].y+(b.y-vertices[i].y)*j/n}))).concat(vertices.at(-1));
  const counts={templates:0,triangles:0,idle:0};
  for(const g of GESTURE_CATALOG) for(const size of [28,60,130]) {
    const sample=line(g.points.map(p=>({x:83+p.x*size,y:37+p.y*size})));
    assert.equal(recognizeGesture(sample),g.id,`${g.id} ${size}`);counts.templates++;
  }
  for(const vertices of [
    [{x:40,y:2},{x:86,y:68},{x:3,y:80},{x:36,y:8}],
    [{x:35,y:0},{x:77,y:92},{x:0,y:61},{x:32,y:5}],
    [{x:2,y:66},{x:28,y:0},{x:83,y:75},{x:8,y:65}],
    [{x:1,y:76},{x:55,y:82},{x:48,y:3},{x:4,y:72}],
  ]) for(const scale of [.5,1,1.5]) for(const reverse of [false,true]) {
    const sampled=line(vertices.map(p=>({x:p.x*scale+50,y:p.y*scale+20})));
    assert.equal(recognizeGesture(reverse?sampled.reverse():sampled),'triangle',`uneven triangle ${counts.triangles}`);counts.triangles++;
  }
  assert.equal(recognizeGesture(line([{x:0,y:0},{x:0,y:10}])),'down');
  assert.equal(recognizeGesture([{x:10,y:10},{x:12,y:11},{x:10,y:13}]),'tap');
  assert.deepEqual(strokeDirections(line([{x:30,y:0},{x:60,y:60},{x:0,y:60},{x:30,y:0}])),[1,4,7]);
  const extra={id:'custom-lightning',glyph:'ϟ',name:'번개',points:[{x:1,y:0},{x:0,y:.45},{x:1,y:.55},{x:0,y:1}],tolerance:.1};
  assert.equal(recognizeGestureMatch(line(extra.points.map(p=>({x:p.x*100,y:p.y*100}))),[extra]).gesture,extra.id,'new patterns do not require recognizer branches');
  const idle=createFieldIdleClock();idle.reset(1000);
  assert.equal(idle.poll(5999,false),false);assert.equal(idle.poll(6000,false),true);counts.idle++;
  idle.reset(7000);assert.equal(idle.poll(11999,false),false);assert.equal(idle.poll(12000,false),true);counts.idle++;
  assert.equal(idle.poll(50000,true),false);assert.equal(idle.poll(54999,false),false);assert.equal(idle.poll(55000,false),true);counts.idle++;
  assert.equal(idle.poll(100000,false),true);assert.equal(idle.poll(100001,false),false);counts.idle++;
  console.log(JSON.stringify({status:'PASS',...counts}));
} finally {await server.close();}
