// Run after npm run build:itch and serving its browser folder on localhost:4173.
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const config=await readFile('src/environments/environment.ts','utf8');
const url=config.match(/supabaseUrl: '([^']+)'/)[1], key=config.match(/supabaseKey: '([^']+)'/)[1];
const name='tp_browser_'+randomBytes(6).toString('hex'), password=randomBytes(18).toString('hex'), guestId=randomUUID();
const call=async(endpoint,data={},method='GET')=>{
 const res=await fetch(url+'/functions/v1/tubong-api',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({endpoint,method,data,guestId})});
 const body=await res.json(); assert.ok(res.ok,body.message||'API failure'); return body;
};
function setJuice(juice) {
 assert.match(name,/^tp_browser_[a-f0-9]{12}$/);
 assert.ok(Number.isInteger(juice)&&juice>=0&&juice<=100);
 const result=spawnSync('node_modules/.bin/supabase',['db','query','--remote='+new URL(url).hostname.split('.')[0],'--yes',
  `update game_private.players set juice=${juice},refill_at=floor(extract(epoch from now())) where username='${name}'`],{encoding:'utf8'});
 assert.equal(result.status,0,'Only the browser fixture Juice is updated');
}
let browser;
try {
 const challenge=await call('signup-challenge'), numbers=challenge.question.match(/\d+/g).map(Number);
 await new Promise(resolve=>setTimeout(resolve,2100));
 await call('signup',{username:name,password,terms:true,challengeId:challenge.id,challengeAnswer:String(numbers[0]+numbers[1]),website:''},'POST');
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[]; const legacy=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
 page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))legacy.push(request.url());});
 await page.goto('http://127.0.0.1:4173/index.html#/login');
 await page.locator('#login-identity').fill(name);
 await page.locator('#login-password').fill(password);
 await page.locator('button[type=submit]').click();
 await page.waitForURL('**/index.html#/games');
 await page.goto('http://127.0.0.1:4173/index.html#/account/profile');
 await page.locator('#display-name').fill('Browser Player');
 await page.getByRole('button',{name:'Save profile',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Save profile',exact:true}).click();
 await page.getByText('Profile saved. See you on the leaderboard!').waitFor();
 await page.reload();
 await page.locator('#display-name').waitFor();
 assert.equal(await page.locator('#display-name').inputValue(),'Browser Player');
 await page.goto('http://127.0.0.1:4173/index.html#/games/tumbang-preso');
 await page.getByRole('button',{name:'Close tutorial'}).click();
 await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.getByRole('heading',{name:'Ready to knock it down?'}).waitFor({state:'hidden'});
 await page.reload();
 // Reload resets the run but retains session and saved tutorial preference.
 await page.getByRole('button',{name:'Play',exact:true}).waitFor();
 assert.equal(await page.getByRole('dialog').filter({has:page.getByText('Welcome to Tumbang Preso!')}).isVisible(),false);
 setJuice(19);
 await page.reload();
 await page.getByRole('heading',{name:/Out of Juice!/}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Play',exact:true}).isDisabled(),true,'Play is disabled below 20 Juice');
 setJuice(20);
 await page.reload();
 const play=page.getByRole('button',{name:'Play',exact:true});
 await play.waitFor();
 const startResponse=page.waitForResponse(response=>{
  const body=response.request().postDataJSON();
  return body?.endpoint==='game-run'&&body?.data?.action==='start';
 });
 await play.click();
 assert.equal((await (await startResponse).json()).user.juice,20,'The first attempt remains free at the 20 Juice boundary');
 await page.getByRole('heading',{name:'Ready to knock it down?'}).waitFor({state:'hidden'});
 assert.deepEqual(errors,[],'No JavaScript errors');
 assert.deepEqual(legacy,[],'No requests to a local PHP backend');
 // Serve the production artifact at the actual shared-origin hostname without uploading it.
 const shared=await browser.newPage({viewport:{width:1280,height:900}});
 const buildRoot=resolve('dist/tubongpinoybeta2/browser');
 await shared.route('https://html-classic.itch.zone/**',async route=>{
  const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
  if(!pathname.startsWith('/html/tubong-security/'))return route.fulfill({status:404,body:''});
  // itch.io rejects directory requests instead of resolving them to index.html.
  if(pathname.endsWith('/'))return route.fulfill({status:403,body:'Directory requests are forbidden'});
  const file=resolve(buildRoot,pathname.slice('/html/tubong-security/'.length));
  if(!file.startsWith(buildRoot+'/'))return route.fulfill({status:404,body:''});
  try { await route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.woff2':'font/woff2'})[extname(file)]??'application/octet-stream'}); }
  catch { await route.fulfill({status:404,body:''}); }
 });
 shared.on('pageerror',error=>errors.push(error.message));
 await shared.goto('https://html-classic.itch.zone/html/tubong-security/index.html#/login?returnUrl=/account/settings');
 assert.equal(await shared.locator('input[formcontrolname=rememberMe]').count(),0,'No Remember Me on itch.io');
 await shared.locator('#login-identity').fill(name); await shared.locator('#login-password').fill(password);
 await shared.locator('button[type=submit]').click(); await shared.waitForURL('**/index.html#/account/settings');
 assert.equal(await shared.evaluate(()=>localStorage.getItem('tubong.session.v1')),null,'Shared origin cannot read a stored login token');
 assert.equal(await shared.evaluate(()=>sessionStorage.getItem('tubong.session.v1')),null,'Shared session storage contains no token');
 await shared.locator('#username-value').waitFor();
 await shared.reload(); await shared.locator('#login-identity').waitFor();
 assert.deepEqual(errors,[],'No JavaScript errors under the CSP');
 console.log('Chrome verified memory-only itch.io sessions, protected account settings and sign-out after reload.');
 console.log('Chrome verified 19 Juice blocks Play and exactly 20 admits the free first attempt.');
 console.log('Chrome verified cloud login, profile save/reload, protected game start, tutorial persistence and zero PHP requests.');
} finally {
 await browser?.close();
 assert.match(name,/^tp_browser_[a-f0-9]{12}$/);
 const cleanup=spawnSync('node_modules/.bin/supabase',['db','query','--remote='+new URL(url).hostname.split('.')[0],'--yes',`delete from game_private.players where username='${name}'`],{encoding:'utf8'});
 assert.equal(cleanup.status,0,'Browser test account cleanup');
 console.log('Temporary browser account removed.');
}
