import { execFileSync } from 'node:child_process';
import { lstat, readdir, readFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const browser=resolve(root,'dist/tubongpinoybeta2/browser');
const output=resolve(root,'dist/tubong-pinoy-itch.zip');
execFileSync(process.execPath,[resolve(root,'scripts/check-public-files.mjs'),'build'],{cwd:root,stdio:'inherit'});
const files=[];let total=0;
async function walk(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  if(entry.name.startsWith('.'))continue; // No .htaccess, Finder metadata, or hidden files.
  const path=join(directory,entry.name),name=relative(browser,path);
  const info=await lstat(path);
  if(info.isSymbolicLink())throw new Error('Cannot package symbolic links.');
  if(info.isDirectory()){await walk(path);continue;}
  if(!info.isFile()||/[\r\n\x00-\x1f]/.test(name)||Buffer.byteLength(name)>240)throw new Error('Invalid upload filename: '+name);
  if(info.size>200*1024*1024)throw new Error('A file exceeds the itch.io limit: '+name);
  files.push(name);total+=info.size;
 }
}
await walk(browser);files.sort();
if(!files.includes('index.html'))throw new Error('index.html must be at the archive root.');
if(files.length>1000||total>500*1024*1024)throw new Error('Build exceeds itch.io HTML game upload limits.');
if(!(await readFile(join(browser,'index.html'),'utf8')).includes('<base href="./">'))throw new Error('Build first with npm run build:itch for relative assets.');
await mkdir(resolve(root,'dist'),{recursive:true});
const staging=await mkdtemp(resolve(root,'dist/.itch-package-'));
try{
 const archive=join(staging,'upload.zip');
 execFileSync('zip',['-q','-X',archive,'-@'],{cwd:browser,input:files.join('\n')+'\n'});
 const entries=execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n').sort();
 if(JSON.stringify(entries)!==JSON.stringify(files))throw new Error('ZIP contents do not match the approved frontend files.');
 execFileSync('unzip',['-tq',archive],{stdio:'pipe'});
 await rename(archive,output);
 const zipped=await lstat(output);
 console.log(`itch.io ZIP ready: ${output}`);
 console.log(`${files.length} files; ${(total/1024/1024).toFixed(2)} MB extracted; ${(zipped.size/1024/1024).toFixed(2)} MB ZIP. index.html is at the root.`);
}finally{await rm(staging,{recursive:true,force:true});}
