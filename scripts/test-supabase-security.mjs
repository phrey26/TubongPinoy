import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const temporary=await mkdtemp(join(tmpdir(),'tubong-security-'));
let checks=0;
function check(value,label){assert.ok(value,label);checks++;console.log('PASS:',label);}
const guestId=randomUUID();
const request=(endpoint,data={},headers={},method='POST')=>new Request('https://api.example.test',{method,
 headers:{'Content-Type':'application/json',...headers},...(method==='OPTIONS'?{}:{body:JSON.stringify({endpoint,method:'POST',data,guestId})})});
const config=await readFile('src/environments/environment.ts','utf8');
const url=config.match(/supabaseUrl: '([^']+)'/)[1],key=config.match(/supabaseKey: '([^']+)'/)[1];
const ref=new URL(url).hostname.split('.')[0];
function sql(statement){
 const result=spawnSync('node_modules/.bin/supabase',['db','query','--remote='+ref,'--yes',statement],{encoding:'utf8'});
 if(result.status!==0||!result.stdout.trim().startsWith('{'))throw new Error('Security fixture database command failed.');
 const parsed=JSON.parse(result.stdout);
 if(!Array.isArray(parsed.rows))throw new Error('Security query failed; inspect Supabase CLI access.');
 return parsed.rows;
}
const literal=value=>value===null?'null':"'"+String(value).replaceAll("'","''")+"'";
const name='tp_security_'+randomBytes(6).toString('hex');
const password=randomBytes(18).toString('hex');
const ip='security-test-'+randomUUID();
function api(endpoint,body={},token='',method='POST'){
 return sql(`select public.tp_api(${literal(endpoint)},${literal(method)},${literal(JSON.stringify(body))}::jsonb,${literal(token)},${literal(guestId)},${literal(ip)},null) as result`)[0].result;
}
try{
 await build({entryPoints:['supabase/functions/_shared/handler.ts'],outfile:join(temporary,'handler.mjs'),bundle:true,platform:'node',format:'esm'});
 const {createHandler}=await import(pathToFileURL(join(temporary,'handler.mjs')));
 let calls=0,args;
 const handler=createHandler(async(_name,input)=>{calls++;args=input;return {message:'OK'};});
 let response=await handler(request('session',{}, {Origin:'https://evil.example'}));
 check(response.status===403&&calls===0&&!response.headers.has('access-control-allow-origin'),'Unapproved origins are rejected before database work');
 response=await handler(request('session',{}, {Origin:'https://html-classic.itch.zone'},'OPTIONS'));
 check(response.status===204&&response.headers.get('access-control-allow-origin')==='https://html-classic.itch.zone'&&!response.headers.has('access-control-allow-credentials'),'itch.io preflight uses an exact origin without cookies');
 check((await handler(request('session',{}, {Origin:'null'}))).status===403,'Opaque origins are rejected');
 check((await handler(request('session',{}, {'Content-Type':'application/json-evil'}))).status===415,'Content type must be application/json');
 check((await handler(request('session',{value:'a'.repeat(13000)}))).status===413,'Oversized requests are rejected');
 await handler(request('session',{}, {'cf-connecting-ip':'203.0.113.5','x-forwarded-for':'1.2.3.4'}));
 check(args.p_ip==='203.0.113.5','Spoofed first X-Forwarded-For cannot choose the rate bucket');
 check((await handler(request('verify-email'))).status===404,'Email endpoints are not exposed');
 const malformed=new Request('https://api.example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'});
 check((await handler(malformed)).status===400,'Malformed JSON is rejected');
 const invalidGuest=new Request('https://api.example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:'session',method:'GET',data:{},guestId:'-'.repeat(36)})});
 check((await handler(invalidGuest)).status===422,'Malformed guest IDs are rejected');
 check((await handler(request('me',{}, {'x-game-session':'forged-token'}))).status===401,'Malformed bearer tokens are rejected');
 const challenge=api('signup-challenge',{},'','GET');
 await new Promise(resolve=>setTimeout(resolve,2100));
 const numbers=challenge.question.match(/\d+/g).map(Number);
 const signup=api('signup',{username:name,password,terms:true,challengeId:challenge.id,challengeAnswer:String(numbers[0]+numbers[1]),website:''});
 check(signup._status===201&&!!signup.sessionToken&&signup.user?.username===name,'Username-only signup creates a working account without email');
 check(!('email' in signup.user)&&!('verificationRequired' in signup),'Account responses collect no email or verification state');
 check(api('profile',{displayName:'<script>alert(1)</script>',avatarId:'sunny'},signup.sessionToken)._status===422,'Stored profile input rejects HTML payloads');
 check(api('profile',{displayName:'Safe Player',avatarId:'../../etc/passwd'},signup.sessionToken)._status===422,'Avatar paths must match the server allowlist');
 check(api('login',{identity:"' OR 1=1 --",password})._status===422,'SQL injection payload is rejected by account validation');
 check(api('wallet',{action:'topup',amount:999999,requestId:randomUUID()},signup.sessionToken)._status>=400,'Client cannot mint currency through top-ups');
 for(let i=0;i<15;i++)check(api('login',{identity:name,password:'incorrect'})._status===401,'Bad login attempt '+(i+1)+' is rejected');
 check(api('login',{identity:name,password})._status===429,'Failed login attempts survive rollback and enforce the identity limit');
 check(api('me',{},signup.sessionToken,'GET').user?.username===name,'Login throttling does not revoke the existing session');
 check(sql("select count(*)::integer as unsafe from pg_tables where schemaname='game_private' and not rowsecurity")[0].unsafe===0,'Every private game table has RLS enabled');
 check(sql("select count(*)::integer as buckets from storage.buckets")[0].buckets===0,'No file upload buckets are exposed');
 response=await fetch(url+'/functions/v1/tubong-api',{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Origin:'https://html-classic.itch.zone'},body:JSON.stringify({endpoint:'session',method:'GET',data:{},guestId})});
 check(response.ok&&response.headers.get('x-content-type-options')==='nosniff'&&response.headers.get('cache-control')==='no-store'&&response.headers.get('access-control-allow-origin')==='https://html-classic.itch.zone','Hosted API returns production security and CORS headers');
 response=await fetch(url+'/functions/v1/tubong-api',{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify({endpoint:'session',method:'GET',data:{},guestId})});
 check(response.status===403&&!response.headers.has('access-control-allow-origin'),'Hosted API rejects unapproved browser origins');
 for(const fn of ['tp_api','tp_game_context']){
  response=await fetch(url+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(fn==='tp_api'?{p_endpoint:'session',p_method:'GET',p_body:{},p_token:'',p_guest:'',p_ip:''}:{p_token:'',p_game:'tumbang-preso'})});
  check(!response.ok,'Public key cannot call privileged '+fn);
 }
 console.log(`${checks} security checks passed.`);
}finally{
 assert.match(name,/^tp_security_[a-f0-9]{12}$/);
 sql(`delete from game_private.players where username=${literal(name)}`);
 await rm(temporary,{recursive:true,force:true});
 console.log('Temporary security account removed.');
}
