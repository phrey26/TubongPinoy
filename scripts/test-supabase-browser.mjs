// Run after npm run build:itch and serving its browser folder on localhost:4173.
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
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
let browser;
try {
 const challenge=await call('signup-challenge'), numbers=challenge.question.match(/\d+/g).map(Number);
 await new Promise(resolve=>setTimeout(resolve,2100));
 await call('signup',{username:name,password,terms:true,challengeId:challenge.id,challengeAnswer:String(numbers[0]+numbers[1]),website:''},'POST');
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[]; const legacy=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))legacy.push(request.url());});
 await page.goto('http://127.0.0.1:4173/index.html#/login');
 await page.locator('#login-identity').fill(name);
 await page.locator('#login-password').fill(password);
 await page.locator('button[type=submit]').click();
 await page.waitForURL('**/#/games');
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
 assert.deepEqual(errors,[],'No JavaScript errors');
 assert.deepEqual(legacy,[],'No requests to a local PHP backend');
 console.log('Chrome verified cloud login, profile save/reload, protected game start, tutorial persistence and zero PHP requests.');
} finally {
 await browser?.close();
 assert.match(name,/^tp_browser_[a-f0-9]{12}$/);
 const cleanup=spawnSync('node_modules/.bin/supabase',['db','query','--remote='+new URL(url).hostname.split('.')[0],'--yes',`delete from game_private.players where username='${name}'`],{encoding:'utf8'});
 assert.equal(cleanup.status,0,'Browser test account cleanup');
 console.log('Temporary browser account removed.');
}
