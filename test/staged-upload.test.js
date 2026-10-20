'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {stagedReplace}=require('../src/staged-upload');
const {operation}=require('../src/connection');
function harness({existing=true,failCommit=false,failBackupRemoval=false,alterDestination=false,shortWrite=false}={}){
 const data=new Map(existing?[['/web/index.html',{bytes:Buffer.from('before'),mode:0o100640,mtime:100}]]:[]);
 const calls=[];
 const adapter={
  stat:async p=>{const x=data.get(p);return x?{type:'file',size:x.bytes.length,mode:x.mode,mtime:x.mtime}:null;},
  put:async p=>{data.set(p,{bytes:Buffer.from(shortWrite?'shor':'after!'),mode:0o100644,mtime:200});calls.push(['put',p]);if(alterDestination&&existing)data.set('/web/index.html',{bytes:Buffer.from('edited'),mode:0o100600,mtime:300});},
  rename:async(a,b)=>{calls.push(['rename',a,b]);if(failCommit&&a.endsWith('.part'))throw new Error('simulated rename failure');const x=data.get(a);if(!x)throw new Error('missing');if(data.has(b))throw new Error('destination exists');data.delete(a);data.set(b,x);},
  remove:async p=>{calls.push(['remove',p]);if(failBackupRemoval&&p.endsWith('.backup'))throw new Error('no delete permission');data.delete(p);},
  chmod:async(p,mode)=>{calls.push(['chmod',p,mode]);data.get(p).mode=mode;}
 };
 return {data,calls,run:()=>stagedReplace({destination:'/web/index.html',expectedBytes:6,...adapter})};
}
test('staged replacement preserves original permissions and cleans backup',async()=>{
 const h=harness(),r=await h.run();
 assert.equal(r.staged,true);
 assert.equal(h.data.size,1);assert.equal(h.data.get('/web/index.html').bytes.toString(),'after!');
 assert.equal(h.data.get('/web/index.html').mode,0o640);
 assert.equal(h.calls.filter(x=>x[0]==='rename').length,2);
});
test('new file is created without changing another file',async()=>{
 const h=harness({existing:false});await h.run();
 assert.equal(h.data.size,1);assert.equal(h.calls.some(x=>x[0]==='chmod'),false);
});
test('partial upload preserves original and cleans temporary file',async()=>{
 const h=harness({shortWrite:true});await assert.rejects(h.run(),/expected file size/);
 assert.equal(h.data.get('/web/index.html').bytes.toString(),'before');assert.equal(h.data.size,1);
});
test('concurrent external edit prevents replacement',async()=>{
 const h=harness({alterDestination:true});await assert.rejects(h.run(),/changed during upload/);
 assert.equal(h.data.get('/web/index.html').bytes.toString(),'edited');assert.equal(h.data.size,1);
});
test('commit failure rolls back to original remote content',async()=>{
 const h=harness({failCommit:true});await assert.rejects(h.run(),/simulated rename failure/);
 assert.equal(h.data.get('/web/index.html').bytes.toString(),'before');assert.equal(h.data.size,1);
});
test('a failed backup cleanup is clearly reported, not silently ignored',async()=>{
 const h=harness({failBackupRemoval:true});await assert.rejects(h.run(),/New file saved, but old-version backup/);
 assert.equal(h.data.size,2);assert.equal(h.data.get('/web/index.html').bytes.toString(),'after!');
});
test('symlinks, directories, root paths and invalid sizes are refused',async()=>{
 for(const type of ['directory','file']){
  let uploads=0;
  await assert.rejects(stagedReplace({destination:'/web/index.html',expectedBytes:3,stat:async()=>({type,symlink:type==='file'}),put:async()=>uploads++,rename:async()=>{},remove:async()=>{}}),/directory or symbolic link/);
  assert.equal(uploads,0);
 }
 for(const destination of ['/','relative/file','/web/../x','/web\\x'])await assert.rejects(stagedReplace({destination,expectedBytes:4,stat:async()=>null,put:async()=>{},rename:async()=>{},remove:async()=>{}}),/Unsafe/);
});
test('SFTP operation dispatch writes staged bytes and preserves mode',async()=>{
 const files=new Map([['/srv/site/index.html',{body:Buffer.from('before'),mode:0o100600,mtime:1}]]);
 const file=p=>{if(!files.has(p))throw Object.assign(new Error('not found'),{code:2});return files.get(p);};
 const client={
  lstat:async p=>{const x=file(p);return {mode:x.mode,size:x.body.length,modifyTime:x.mtime};},
  stat:async p=>{const x=file(p);return {mode:x.mode,size:x.body.length,modifyTime:x.mtime};},
  put:async(b,p)=>{files.set(p,{body:Buffer.from(b),mode:0o100644,mtime:2});},
  chmod:async(p,mode)=>{file(p).mode=mode;},
  rename:async(a,b)=>{const x=file(a);assert.equal(files.has(b),false);files.delete(a);files.set(b,x);},
  delete:async p=>{files.delete(p);}
 };
 const r=await operation({type:'sftp',client},'writeStaged','/srv/site/index.html',Buffer.from('changed'));
 assert.equal(r.staged,true);assert.equal(files.size,1);
 assert.equal(files.get('/srv/site/index.html').body.toString(),'changed');
 assert.equal(files.get('/srv/site/index.html').mode,0o600);
});
test('FTP/FTPS are not silently given unverified atomic upload behavior',async()=>{
 await assert.rejects(operation({type:'ftp',client:{}},'writeStaged','/a',Buffer.from('x')),/require SFTP/);
});
