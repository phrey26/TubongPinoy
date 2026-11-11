// Temporary accounts only. Never read or change a real player's password.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const config=await readFile('src/environments/environment.ts','utf8');
const url=config.match(/supabaseUrl: '([^']+)'/)[1],key=config.match(/supabaseKey: '([^']+)'/)[1];
const ref=new URL(url).hostname.split('.')[0];
const suffix=randomBytes(6).toString('hex');
const names=['tp_pwd_'+suffix,'tp_old_'+suffix];
const password='Mga-tala-sa-gabi!'+randomBytes(8).toString('hex');
let checks=0;
function check(value,label){assert.ok(value,label);checks++;console.log('PASS:',label);}
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
function sql(statement){
 const result=spawnSync('node_modules/.bin/supabase',['db','query','--remote='+ref,'--yes',statement],{encoding:'utf8'});
 let parsed;try{parsed=JSON.parse(result.stdout);}catch{}
 if(result.status!==0||!Array.isArray(parsed?.rows))throw new Error('Password-policy database check failed; inspect CLI access.');
 return parsed.rows;
}
class Client{
 token='';guestId=randomUUID();
 async call(endpoint,data={},method='POST',expected=200){
  const response=await fetch(url+'/functions/v1/tubong-api',{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(this.token?{'X-Game-Session':this.token}:{})},body:JSON.stringify({endpoint,method,data,guestId:this.guestId}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();assert.equal(response.status,expected,endpoint+': '+(result.code??'unexpected status'));
  if(result.sessionToken)this.token=result.sessionToken;
  return result;
 }
}
try{
 const compiled=await build({entryPoints:['src/app/core/validators/password-policy.ts'],bundle:true,write:false,format:'esm',platform:'node'});
 const {assessPassword,COMMON_PASSWORD_ROOTS,PASSWORD_SEQUENCES}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const prefix='Café sa tahimik na gabi • 4829! 🌺';
 const unicode72=prefix+'AbcDefGhJkLmNpQrStUvWxYz0123456789'.slice(0,72-new TextEncoder().encode(prefix).length);
 const values=['','short','Password123456789!','a'.repeat(20),'abc'.repeat(8),'little little little','a'.repeat(20)+'\n',
  '       short       ','\u00a0'.repeat(20),'ab\n'.repeat(7),'mga bituin sa tahimik na gabi','Mga tala sa gabi! 4829',
  'Player42 sa tahimik na gabi!',unicode72,unicode72+'é',...COMMON_PASSWORD_ROOTS.map(root=>root+'123456789012345!'),
  ...PASSWORD_SEQUENCES.map(sequence=>sequence.slice(0,20))];
 const fixtures=values.map((value,index)=>({id:index,password:value,username:'Player42',expected:assessPassword(value,'Player42').accepted}));
 const rows=sql(`select (item->>'id')::integer as id, game_private.valid_new_password(item->>'password',item->>'username') as accepted from jsonb_array_elements(${literal(JSON.stringify(fixtures))}::jsonb) item order by (item->>'id')::integer`);
 check(rows.length===fixtures.length&&rows.every(row=>row.accepted===fixtures[row.id].expected),`${fixtures.length} browser/Postgres password policy fixtures agree`);
 const client=new Client();
 for(const weak of ['short','a'.repeat(20),'Password123456789!','123456789012345',names[0]+' password!',unicode72+'é']){
  const result=await client.call('signup',{username:names[0],password:weak,terms:true,challengeId:'invalid',challengeAnswer:'1',website:''},'POST',422);
  check(result.code==='weak_password','Direct signup rejects a weak password before creating an account');
 }
 check(sql(`select count(*)::integer as count from game_private.players where username=${literal(names[0])}`)[0].count===0,'Rejected signups do not create partial accounts');
 const challenge=await client.call('signup-challenge',{},'GET');
 await new Promise(resolve=>setTimeout(resolve,2100));
 const numbers=challenge.question.match(/\d+/g).map(Number);
 const signup=await client.call('signup',{username:names[0],password,terms:true,challengeId:challenge.id,challengeAnswer:String(numbers[0]+numbers[1]),website:''},'POST',201);
 check(signup.user.username===names[0]&&!!client.token,'Strong signup succeeds with the human check');
 const originalToken=client.token;
 const rejected=await client.call('settings',{action:'password',currentPassword:password,newPassword:'Password123456789!',confirmPassword:'Password123456789!'},'POST',422);
 check(rejected.code==='weak_password'&&(await client.call('me',{},'GET')).user.id===signup.user.id,'Weak password changes are rejected without losing the session');
 const replacement='Bagong-parol-sa-gabi!'+randomBytes(8).toString('hex');
 await client.call('settings',{action:'password',currentPassword:password,newPassword:replacement,confirmPassword:replacement});
 check(client.token!==originalToken,'A strong password change succeeds and rotates the session');
 await client.call('logout');
 await client.call('login',{identity:names[0],password:replacement,rememberMe:false});
 check((await client.call('me',{},'GET')).user.username===names[0],'The new strong password signs in successfully');
 // A migrated account with a short pre-policy password must remain accessible.
 sql(`insert into game_private.players(username,password_hash,display_name) values(${literal(names[1])},extensions.crypt('old-pass',extensions.gen_salt('bf',10)),${literal(names[1])})`);
 const legacy=new Client();await legacy.call('login',{identity:names[1],password:'old-pass',rememberMe:false});
 check((await legacy.call('me',{},'GET')).user.username===names[1],'Existing shorter passwords remain valid for login');
 await legacy.call('settings',{action:'password',currentPassword:'old-pass',newPassword:replacement,confirmPassword:replacement});
 check(!!legacy.token,'An existing short password can confirm a change to a stronger password');
 console.log(`${checks} password-policy checks passed.`);
}finally{
 for(const name of names)assert.match(name,/^tp_(pwd|old)_[a-f0-9]{12}$/);
 sql(`delete from game_private.players where username in (${names.map(literal).join(',')})`);
 console.log('Temporary password-policy accounts removed.');
}
