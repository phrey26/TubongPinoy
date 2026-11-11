// Live regression against the configured project. Only uniquely named fixtures are deleted.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const env = await readFile('src/environments/environment.ts','utf8');
const url = env.match(/supabaseUrl: '([^']+)'/)[1];
const key = env.match(/supabaseKey: '([^']+)'/)[1];
const ref = new URL(url).hostname.split('.')[0];
const password = randomBytes(18).toString('hex');
const names = [0,1].map(()=> 'tp_cloud_'+randomBytes(6).toString('hex'));
let checks=0;
function check(ok, message) { assert.ok(ok,message); checks++; console.log('PASS:',message); }
function sql(statement) {
 const result=spawnSync('node_modules/.bin/supabase',['db','query','--remote='+ref,'--yes',statement],{encoding:'utf8'});
 if(result.status!==0 || result.stdout.includes('"_tag":"Error"')) throw new Error('Fixture database operation failed; inspect CLI access.');
}
class Client {
 token=''; guest=randomUUID();
 async call(endpoint,data={},method='GET',expected=200) {
  const response=await fetch(url+'/functions/v1/tubong-api',{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(this.token?{'X-Game-Session':this.token}:{})},body:JSON.stringify({endpoint,method,data,guestId:this.guest}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  assert.equal(response.status,expected,endpoint+': '+(result.message??'Unexpected response'));
  if(result.sessionToken) this.token=result.sessionToken;
  if(endpoint==='logout'&&response.ok) this.token='';
  return result;
 }
 async signup(name) {
  const challenge=await this.call('signup-challenge');
  const nums=challenge.question.match(/\d+/g).map(Number);
  await new Promise(resolve=>setTimeout(resolve,2100));
  return this.call('signup',{username:name,password,terms:true,challengeId:challenge.id,challengeAnswer:String(nums[0]+nums[1]),website:''},'POST',201);
 }
 async action(run,action,input={},expected=200) {
  return this.call('game-run',{game:run.game,action,runId:run.id,sequence:run.sequence,requestId:randomUUID(),...input},'POST',expected);
 }
 async start(game,expected=200) { return this.call('game-run',{game,action:'start',requestId:randomUUID()},'POST',expected); }
}
try {
 const guest=new Client(),a=new Client(),b=new Client();
 check((await guest.call('session')).user===null,'Guest session contains no account');
 await guest.call('me',{},'GET',401);check(true,'Protected profile rejects guests');
 const sa=await a.signup(names[0]), sb=await b.signup(names[1]);
 check(sa.user.juice===100&&sa.user.tansans===0,'New account starts with 100 Juice and zero Tansans');
 check(sa.user.id!==sb.user.id,'Account identities are isolated');
 check((await a.call('session')).user.id===sa.user.id,'Bearer session restores the correct account');
 check(!(await guest.call('username-availability',{username:names[0].toUpperCase()})).available,'Username uniqueness is case insensitive');
 const inv=await a.call('inventory');check(inv.items.length===9,'All nine free starter skins are available');
 await a.call('profile',{displayName:'Cloud Player',avatarId:'maya'},'POST');
 await a.call('inventory',{game:'tumbang-preso',skinId:'slipper_blue'},'POST');
 check((await a.call('me')).user.equippedSkins['tumbang-preso']==='slipper_blue','Equipment persists');
 check((await b.call('me')).user.avatarId==='sunny','Profile changes do not affect another account');
 await a.call('tutorial',{game:'jolens-blast'},'POST');check((await a.call('tutorial',{game:'jolens-blast'})).seen,'Tutorial state is saved');
 await a.call('settings',{action:'username',username:names[0]+'x',currentPassword:'wrong'},'POST',422);
 check((await a.call('me')).user.username===names[0],'Wrong confirmation password keeps session and credentials');
 // Only the uniquely named audit account is funded for purchase regressions.
 sql(`update game_private.players set tansans=5000,juice=60,refill_at=floor(extract(epoch from now())) where username='${names[0]}'`);
 const purchase={action:'purchase',item:'skin_1',requestId:randomUUID()};
 const bought=await a.call('wallet',purchase,'POST');
 check(bought.user.tansans===4700&&bought.user.ownedSkins.includes('skin_1'),'Purchase uses the server price and grants ownership');
 check((await a.call('wallet',purchase,'POST')).user.tansans===4700,'Purchase retry cannot charge twice');
 await a.call('wallet',{...purchase,item:'skin_2'},'POST',409);check(true,'Operation ID cannot be reused for a different purchase');
 await a.call('inventory',{game:'tumbang-preso',skinId:'skin_1'},'POST');
 check(!(await b.call('me')).user.ownedSkins.includes('skin_1'),'Purchased skins stay isolated');
 await a.call('scores',{game:'tumbang-preso',points:999999},'POST',422);check(true,'Direct score claims are rejected');
 // Only the second fixture's Juice/entitlements are changed for start eligibility.
 for (const juice of [0,1,19]) {
  sql(`update game_private.players set juice=${juice},refill_at=floor(extract(epoch from now())),permanent_juice=false,unlimited_until=0 where username='${names[1]}'`);
  await b.start('tumbang-preso',409);
  check((await b.call('me')).user.juice===juice,`Tumbang start rejects ${juice} Juice without changing the balance`);
 }
 sql(`update game_private.players set juice=20,refill_at=floor(extract(epoch from now())) where username='${names[1]}'`);
 const admittedStart={game:'tumbang-preso',action:'start',requestId:randomUUID()};
 const admitted=await b.call('game-run',admittedStart,'POST');
 check(admitted.user.juice===20,'Exactly 20 Juice admits the free first attempt');
 await new Promise(resolve=>setTimeout(resolve,1100));
 const missed=await b.action(admitted.run,'shot',{vx:0,vy:0});
 const paid=await b.action(missed.run,'retry');
 check(paid.user.juice===0&&paid.run.status==='ready','Last 20 Juice still buys a playable retry');
 check((await b.call('game-run',admittedStart,'POST')).run.id===paid.run.id,'Admitted start retries remain idempotent at zero Juice');
 await b.start('tumbang-preso',409);
 await new Promise(resolve=>setTimeout(resolve,1100));
 check((await b.action(paid.run,'shot',{vx:0,vy:0})).run.status==='miss','The paid attempt can finish after spending the final 20 Juice');
 sql(`update game_private.players set juice=19,refill_at=floor(extract(epoch from now()))-144 where username='${names[1]}'`);
 check((await b.start('tumbang-preso')).user.juice===20,'Start eligibility includes passive Juice recovery');
 sql(`update game_private.players set juice=0,refill_at=floor(extract(epoch from now())),unlimited_until=floor(extract(epoch from now()))+3600 where username='${names[1]}'`);
 check((await b.start('tumbang-preso')).user.juice===0,'Active unlimited pass admits a start at zero Juice');
 sql(`update game_private.players set permanent_juice=true,unlimited_until=0 where username='${names[1]}'`);
 check((await b.start('tumbang-preso')).user.juice===0,'Permanent unlimited Juice admits a start at zero');
 sql(`update game_private.players set permanent_juice=false,unlimited_until=floor(extract(epoch from now()))-1 where username='${names[1]}'`);
 await b.start('tumbang-preso',409);check(true,'Expired unlimited pass does not bypass the start requirement');
 sql(`update game_private.players set juice=100,refill_at=0,unlimited_until=0 where username='${names[1]}'`);
 let {run}=await a.start('tumbang-preso');
 await b.action(run,'shot',{vx:0,vy:-17.6},409);check(true,'Another account cannot submit a stolen run');
 await a.action(run,'shot',{vx:0,vy:-100},422);check(true,'Overpowered shots are rejected');
 await new Promise(resolve=>setTimeout(resolve,1500));
 const shot={game:run.game,action:'shot',runId:run.id,sequence:run.sequence,requestId:randomUUID(),vx:0,vy:-17.6};
 const hit=await a.call('game-run',shot,'POST');
 check(hit.run.status==='hit'&&hit.run.score===100,'Server replay awards exactly 100 for a real hit');
 check((await a.call('game-run',shot,'POST')).run.score===100,'Duplicate shot cannot award more points');
 run=(await a.action(hit.run,'next')).run;
 run=(await a.action(run,'shot',{vx:0,vy:0})).run;
 const juice=(await a.call('me')).user.juice;
 check((await a.action(run,'retry')).user.juice===juice-20,'Verified retry charges 20 Juice atomically');
 check((await a.call('scores',{game:'tumbang-preso'})).personalBest===100,'Leaderboard reads verified scores');
 run=(await a.start('jolens-blast')).run;
 run=(await a.action(run,'round',{bet:1})).run;
 check(run.inventory===9&&run.targets.length===2,'Jolens stakes server inventory and selects targets');
 await a.action(run,'shot',{vx:0,vy:0},422);check(true,'Zero-power Jolens cannot mark a session played');
 await new Promise(resolve=>setTimeout(resolve,600));
 run=(await a.action(run,'shot',{vx:22.5,vy:0})).run;
 run=(await a.action(run,'finish')).run;
 check(run.score===450,'Jolens final score comes from verified inventory');
 const other=new Client();await other.call('login',{identity:names[0],password,rememberMe:true},'POST');
 const oldToken=a.token;
 await a.call('settings',{action:'password',currentPassword:password,newPassword:password+'!',confirmPassword:password+'!'},'POST');
 check(a.token!==oldToken,'Credential change rotates bearer token');
 await other.call('me',{},'GET',401);check(true,'Credential change revokes other sessions');
 check((await a.call('me')).user.id===sa.user.id,'Current session survives credential change');
 await a.call('logout',{},'POST');await a.call('me',{},'GET',401);check(true,'Logout revokes access');
 // Published database RPCs must never be callable with the public key.
 for(const fn of ['tp_api','tp_game_context']) {
  const response=await fetch(url+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(fn==='tp_api'?{p_endpoint:'session',p_method:'GET',p_body:{},p_token:'',p_guest:'',p_ip:''}:{p_token:'',p_game:'tumbang-preso'})});
  check(!response.ok,'Public key cannot call privileged '+fn);
 }
 console.log(`${checks} Supabase API checks passed.`);
} finally {
 for(const name of names) assert.match(name,/^tp_cloud_[a-f0-9]{12}$/);
 sql(`delete from game_private.players where username in ('${names[0]}','${names[0]}x','${names[1]}')`);
 console.log('Temporary Supabase test accounts removed.');
}
