'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const posix=require('node:path').posix;
const {makeFilesystem}=require('../src/filesystem');
const FileType={File:1,Directory:2,SymbolicLink:64};
class FakeEmitter{constructor(){this.event=()=>{};}fire(){}dispose(){}}
class FakeDisposable{dispose(){}}
function fsError(code){return Object.assign(new Error(code),{code});}
const FileSystemError=Object.fromEntries(['FileNotFound','FileExists','FileIsADirectory','NoPermissions','Unavailable'].map(x=>[x,()=>fsError(x)]));
const vscode={EventEmitter:FakeEmitter,Disposable:FakeDisposable,FileType,FileSystemError,FileChangeType:{Created:1,Changed:2,Deleted:3}};
const uri=path=>({scheme:'sitedock',authority:'site-1',path});
function fixture(){
  const files=new Map([['/home/index.html',Buffer.from('original')],['/home/deep/file.txt',Buffer.from('nested')]]);
  const dirs=new Set(['/home','/home/deep']);const versions=new Map([...files].map(([k,v])=>[k,100]));
  const store={get:()=>({id:'site-1',root:'/home'})};
  async function run(id,method,...args){
    assert.equal(id,'site-1');const p=args[0];
    switch(method){
    case 'stat':return dirs.has(p)?{type:'directory',size:0,mtime:1}:files.has(p)?{type:'file',size:files.get(p).length,mtime:versions.get(p)}:null;
    case 'list':return [...dirs].filter(d=>posix.dirname(d)===p).map(d=>({name:posix.basename(d),type:'directory'})).concat([...files].filter(([f])=>posix.dirname(f)===p).map(([f])=>({name:posix.basename(f),type:'file'})));
    case 'read':if(!files.has(p))throw fsError('FileNotFound');return Buffer.from(files.get(p));
    case 'write':files.set(p,Buffer.from(args[1]));versions.set(p,(versions.get(p)||100)+10);return;
    case 'mkdir':dirs.add(p);return;
    case 'unlink':files.delete(p);return;
    case 'rmdir':for(const key of files.keys())if(key.startsWith(p+'/'))files.delete(key);for(const key of [...dirs])if(key===p||key.startsWith(p+'/'))dirs.delete(key);return;
    case 'rename':files.set(args[1],files.get(p));files.delete(p);return;
    default:throw new Error('No handler: '+method);
    }
  }
  return {fs:makeFilesystem(vscode,store,null,run),files,dirs,versions};
}
test('remote files open, edit, save directly and retain modified content',async()=>{
 const {fs,files}=fixture();assert.equal(Buffer.from(await fs.readFile(uri('/index.html'))).toString(),'original');
 await fs.writeFile(uri('/index.html'),Buffer.from('edited'),{create:true,overwrite:true});
 assert.equal(files.get('/home/index.html').toString(),'edited');
 assert.equal(Buffer.from(await fs.readFile(uri('/index.html'))).toString(),'edited');
});
test('conflict detection rejects remote edits since initial read',async()=>{
 const {fs,files,versions}=fixture();await fs.readFile(uri('/index.html'));
 files.set('/home/index.html',Buffer.from('outsider'));versions.set('/home/index.html',500);
 await assert.rejects(fs.writeFile(uri('/index.html'),Buffer.from('ours'),{create:true,overwrite:true}),e=>e.code==='Unavailable');
 assert.equal(files.get('/home/index.html').toString(),'outsider');
});
test('file create, folder create, rename, and recursive delete',async()=>{
 const {fs,files,dirs}=fixture();await fs.createDirectory(uri('/new'));
 assert(dirs.has('/home/new'));
 await fs.writeFile(uri('/new/hi.txt'),Buffer.from('hi'),{create:true,overwrite:false});
 assert.equal(files.get('/home/new/hi.txt').toString(),'hi');
 await fs.rename(uri('/new/hi.txt'),uri('/new/byebye.txt'),{overwrite:false});
 assert(files.has('/home/new/byebye.txt'));
 await assert.rejects(fs.delete(uri('/new'),{recursive:false}),e=>e.code==='NoPermissions');
 await fs.delete(uri('/new'),{recursive:true});assert(!dirs.has('/home/new'));assert(!files.has('/home/new/byebye.txt'));
});
test('does not allow overwrites without permission or destroying the site root',async()=>{
 const {fs}=fixture();
 await assert.rejects(fs.writeFile(uri('/index.html'),Buffer.from('x'),{create:true,overwrite:false}),e=>e.code==='FileExists');
 await assert.rejects(fs.delete(uri('/'),{recursive:true}),e=>e.code==='NoPermissions');
 await assert.rejects(fs.rename(uri('/'),uri('/foo'),{overwrite:false}),e=>e.code==='NoPermissions');
 assert.equal((await fs.stat(uri('/'))).type,FileType.Directory);
});
