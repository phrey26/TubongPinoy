// Cross-language replay fixtures: PHP must match the browser's 60 Hz physics.
import { build } from 'esbuild';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const dir = await mkdtemp(join(tmpdir(), 'ranked-parity-'));
try {
 const require = createRequire(import.meta.url);
 async function source(path, name) {
  const outfile=join(dir,name+'.cjs'); await build({entryPoints:[path],outfile,bundle:true,platform:'node',format:'cjs'}); return require(outfile);
 }
 const { replayShot } = await source('supabase/functions/_shared/replay.ts','edge');
 const { launchShot, stepShot } = await source('src/app/features/games/tumbang-preso/shot-physics.ts','tumbang');
 const { stepMarbles } = await source('src/app/features/games/jolens-blast/marble-physics.ts','jolens');
 const { scatterMarbles } = await source('src/app/features/games/jolens-blast/marble-placement.ts','placement');
 const layouts=JSON.parse(await readFile('backend/game-data/tumbang-levels.json','utf8'));
 const cases=[];const expected=[];
 for(const variants of Object.values(layouts)) for(const layout of variants) {
  const {angle,power}=layout.solution;const vx=Math.sin(angle*Math.PI/180)*17.6*power,vy=-Math.cos(angle*Math.PI/180)*17.6*power;
  const shot=launchShot(vx,vy);let result;
  for(let frames=1;frames<=600;frames++){const r=stepShot(shot,layout.obstacles);if(r.hit||r.missed){result={hit:r.hit,frames};break;}}
  assert.equal(result.hit,true);cases.push({game:'tumbang',vx,vy,board:layout.obstacles});expected.push(result);
 }
 let seed=747;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let sample=0;sample<40;sample++) {
  const targetCount=2+sample%5*2;
  let targets=scatterMarbles(targetCount,{x:225,y:300},150,20,random).map(p=>({...p,radius:20,dx:0,dy:0,isMoving:false}));
  const board=structuredClone(targets);const angle=(random()-.5)*2;const speed=2+random()*20.5;
  const vx=Math.sin(angle)*speed,vy=-Math.cos(angle)*speed;
  const shooter={x:225,y:600,radius:20,dx:vx,dy:vy,isMoving:true};let pending=[],frames=0;
  for(frames=1;frames<=600;frames++) {
   const out=stepMarbles(shooter,targets,{x:225,y:300,radius:150},{width:450,height:800},undefined,pending);
   pending.push(...targets.filter(b=>out.has(b)));targets=targets.filter(b=>!out.has(b));
   if(![shooter,...targets,...pending].some(b=>b.isMoving))break;
  }
  const outside=b=>Math.hypot(b.x-225,b.y-300)-20>150;
  targets.push(...pending.filter(b=>!outside(b)));pending=pending.filter(outside);
  const delta=outside(shooter)?pending.length:-1;
  if(!outside(shooter)) {
   const spots=[];for(let row=-3;row<=3;row++)for(let column=-3;column<=3;column++)if(Math.hypot(column*42,row*42)<=130)spots.push({x:225+column*42,y:300+row*42});
   spots.sort((a,b)=>Math.hypot(a.x-225,a.y-300)-Math.hypot(b.x-225,b.y-300));
   for(const ball of pending){const spot=spots.find(p=>targets.every(b=>Math.hypot(p.x-b.x,p.y-b.y)>=40));
    if(!spot){targets=[...pending,...targets.filter(b=>!pending.includes(b))];targets.forEach((b,i)=>Object.assign(b,spots[i]));break;}
    Object.assign(ball,spot);targets.push(ball);
   }
  }
  expected.push({frames:Math.min(frames,600),delta,targets:targets.map(({x,y,radius})=>({x,y,radius,dx:0,dy:0}))});cases.push({game:'jolens',vx,vy,board});
 }
 const code="require 'backend/game-physics.php'; $cases=json_decode(stream_get_contents(STDIN),true); $out=[]; foreach($cases as $c) $out[]=$c['game']==='tumbang'?replay_tumbang($c['vx'],$c['vy'],$c['board']):replay_jolens($c['vx'],$c['vy'],$c['board']); echo json_encode($out,JSON_THROW_ON_ERROR);";
 const result=spawnSync(process.env.TUBONG_PHP_BIN||'/Applications/MAMP/bin/php/php8.3.30/bin/php',['-r',code],{input:JSON.stringify(cases),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const actual=JSON.parse(result.stdout);
 for(let i=0;i<actual.length;i++) {
  assert.equal(actual[i].frames,expected[i].frames,`frames ${i}`);
  if(i<64)assert.equal(actual[i].hit,expected[i].hit);
  else {assert.equal(actual[i].delta,expected[i].delta,`delta ${i}`);assert.equal(actual[i].targets.length,expected[i].targets.length);
   actual[i].targets.forEach((b,j)=>{assert.ok(Math.abs(b.x-expected[i].targets[j].x)<1e-6,`x ${i}`);assert.ok(Math.abs(b.y-expected[i].targets[j].y)<1e-6,`y ${i}`);});}
 }
 for (let i=0;i<cases.length;i++) {
  const c=cases[i], r=replayShot(c.game==='tumbang'?'tumbang-preso':'jolens-blast',c.vx,c.vy,{id:'test',sequence:0,obstacles:c.board,targets:c.board});
  assert.equal(r.frames,expected[i].frames,`Edge frames ${i}`);
  if(c.game==='tumbang') assert.equal(r.hit,expected[i].hit);
  else { assert.equal(r.delta,expected[i].delta); assert.equal(r.targets.length,expected[i].targets.length); r.targets.forEach((b,j)=>{assert.ok(Math.abs(b.x-expected[i].targets[j].x)<1e-6);assert.ok(Math.abs(b.y-expected[i].targets[j].y)<1e-6);}); }
 }
 console.log(`${cases.length} browser/PHP/Supabase Edge physics parity fixtures passed.`);
} finally { await rm(dir,{recursive:true,force:true}); }
