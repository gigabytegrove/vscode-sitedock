'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const posix=require('node:path').posix;
const {planUploadFolder,planDownloadFolder}=require('../src/bulk');
const vscode={FileType:{File:1,Directory:2,SymbolicLink:64},Uri:{joinPath:(p,n)=>({scheme:'file',fsPath:posix.join(p.fsPath,n),path:posix.join(p.path,n)})},workspace:{fs:{readDirectory:async()=>[]}}};
const local=path=>({scheme:'file',fsPath:path,path});
test('upload folder plan preserves file paths and skips local links',async()=>{
 const mock={...vscode,workspace:{fs:{readDirectory:async folder=>({
 '/root':[['assets',2],['index.html',1],['back',2|64]],
 '/root/assets':[['css.txt',1]]}[folder.path]||[])}}};
 const plan=await planUploadFolder(mock,local('/root'),'/var/www/site');
 assert.deepEqual(plan.map(x=>[x.kind,x.remote]),[
 ['mkdir','/var/www/site'],['mkdir','/var/www/site/assets'],
 ['upload','/var/www/site/assets/css.txt'],['upload','/var/www/site/index.html']]);
});
test('upload planner fails before enqueue on too many entries',async()=>{
 const mock={...vscode,workspace:{fs:{readDirectory:async()=>[['a',1],['b',1],['c',1]]}}};
 await assert.rejects(planUploadFolder(mock,local('/root'),'/srv/root',{limit:2}),/No operations were queued/);
});
test('download plan skips broken links and linked subdirectories',async()=>{
 const run=async(_id,method,dir)=>{
  assert.equal(method,'list');
  if(dir==='/srv/www')return [{name:'folder',type:'directory'},{name:'loop',type:'directory',symlink:true},{name:'broken',type:'symlink',broken:true},{name:'index.html',type:'file'}];
  return [{name:'a.js',type:'file'}];
 };
 const plan=await planDownloadFolder(vscode,run,{id:'site',root:'/srv/www'},'/',local('/home/output'));
 assert.deepEqual(plan.map(x=>[x.kind,x.remote]),[
 ['mkdir','/'],['mkdir','/folder'],['download','/folder/a.js'],['download','/index.html']]);
});
test('download planner rejects dangerous remote filenames',async()=>{
 await assert.rejects(planDownloadFolder(vscode,async()=>[{name:'../escape',type:'file'}],{id:'site',root:'/'},'/',local('/out')),/filename/);
});
test('depth limit detects excessively nested folders in preflight',async()=>{
 const mock={...vscode,workspace:{fs:{readDirectory:async()=>[['child',2]]}}};
 await assert.rejects(planUploadFolder(mock,local('/root'),'/dest',{maxDepth:2}),/exceeds 2 levels/);
});
