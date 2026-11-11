// Report paths only; never echo a suspected credential into terminal/CI output.
import { execFileSync } from 'node:child_process';
const git=(...args)=>execFileSync('git',args,{maxBuffer:100*1024*1024});
const rules=[
 /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
 /\bsb_secret_[A-Za-z0-9_-]{16,}/,
 /\b(?:sbp_|supabase_pat_|ghp_|github_pat_|sk_live_|sk-proj-)[A-Za-z0-9_-]{20,}/,
 /\bAKIA[A-Z0-9]{16}\b/,
 /(?:SMTP_PASSWORD|RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN)\s*["']?\s*[:=]\s*["'][A-Za-z0-9_./+=-]{12,}["']/,
];
function secret(text){
 if(rules.some(rule=>rule.test(text)))return true;
 for(const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[]){
  try{if(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).role==='service_role')return true;}catch{}
 }
 return false;
}
const problems=new Set();
const paths=git('ls-files','--cached','--others','--exclude-standard','-z').toString().split('\0').filter(Boolean);
const {readFileSync}=await import('node:fs');
for(const path of paths){
 if(/(^|\/)\.env(?:\.|$)/.test(path)&&!path.endsWith('.example'))problems.add(path+' (tracked environment file)');
 if(/(?:config\.local\.php|\.(?:pem|p12|pfx))$/.test(path))problems.add(path+' (tracked private configuration)');
 try{const bytes=readFileSync(path);if(bytes.length<2e6&&!bytes.includes(0)&&secret(bytes.toString()))problems.add(path);}catch{}
}
if(process.argv.includes('--history')){
 const objects=git('rev-list','--objects','--all').toString().trim().split('\n');
 const details=execFileSync('git',['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize) %(rest)'],{input:objects.join('\n')+'\n',maxBuffer:100*1024*1024}).toString().trim().split('\n');
 for(const detail of details){
  const [oid,type,size,...name]=detail.split(' ');
  if(type!=='blob'||Number(size)>2e6||Number(size)===0)continue;
  const bytes=git('cat-file','blob',oid);
  if(!bytes.includes(0)&&secret(bytes.toString()))problems.add(name.join(' ')+' (Git history)');
 }
}
if(problems.size){console.error('Potential secrets require review:\n'+[...problems].join('\n'));process.exitCode=1;}
else console.log('Credential scan passed'+(process.argv.includes('--history')?' (tracked files and Git history).':' (tracked files).'));
