'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {dropSources,planDroppedUploads,MAX_INLINE_FILE}=require('../src/drop-uploads');
const site={id:'a',root:'/srv/www',protocol:'sftp'};
const FileType={File:1,Directory:2,SymbolicLink:64};
const mock={FileType,Uri:{parse(value){const url=new URL(value);return {scheme:url.protocol.slice(0,-1),path:decodeURIComponent(url.pathname),query:url.search.slice(1),fragment:url.hash.slice(1),fsPath:decodeURIComponent(url.pathname)};},joinPath:(uri,name)=>({...uri,path:path.posix.join(uri.path,name)})},workspace:{fs:{stat:async uri=>({type:uri.path.endsWith('/folder')?FileType.Directory:FileType.File}),readDirectory:async uri=>uri.path.endsWith('/folder')?[['image.png',FileType.File],['link',FileType.SymbolicLink]]:[]}}};
function dt(uri,files=[]){return {get:k=>k==='text/uri-list'&&uri?{asString:async()=>uri}:undefined,forEach:fn=>files.forEach(f=>fn({asFile:()=>f},'files'))};}
test('local URI drag supports ordinary files and folders, skips URI-list comments',async()=>{
 const items=await dropSources(mock,dt('# Ignore\r\nfile:///work/a.html\r\nfile:///work/folder'));
 assert.deepEqual(items.map(x=>[x.name,x.isDirectory]),[['a.html',false],['folder',true]]);
 const plan=await planDroppedUploads(mock,site,'/assets',items);
 assert.deepEqual(plan.map(x=>[x.kind,x.remote]),[['upload','/assets/a.html'],['mkdir','/assets/folder'],['upload','/assets/folder/image.png']]);
});
test('dragging multiple same-name files cannot overwrite one another silently',async()=>{
 await assert.rejects(dropSources(mock,dt('file:///a/shared.txt\nfile:///b/shared.txt')),/More than one/);
});
test('remote URIs, malformed URIs and forbidden traversal are rejected',async()=>{
 await assert.rejects(dropSources(mock,dt('https://example.com/a')),/Only local/);
 await assert.rejects(dropSources(mock,dt('sitedock://foo/index.html')),/Only local/);
 await assert.rejects(dropSources(mock,dt('file:///work/bad%5Cname')),/filename|local/);
 await assert.rejects(planDroppedUploads(mock,site,'/../../etc',[{name:'a',kind:'uri',uri:{path:'/a'}}]),/Invalid|outside|path|folder/);
});
test('dragging local symbolic links is blocked before queueing work',async()=>{
 const fake={...mock,workspace:{fs:{...mock.workspace.fs,stat:async()=>({type:FileType.SymbolicLink|FileType.File})}}};
 await assert.rejects(dropSources(fake,dt('file:///work/link')),/symbolic links/);
});
test('dropped in-memory OS files are accepted only with bounded content',async()=>{
 const data=dt('',[{name:'small.txt',data:async()=>new Uint8Array([1,2,3])}]);
 const result=await dropSources(mock,data);
 assert.deepEqual([...result[0].bytes],[1,2,3]);
 const plan=await planDroppedUploads(mock,site,'/',result);
 assert.deepEqual(plan.map(x=>x.remote),['/small.txt']);
 await assert.rejects(dropSources(mock,dt('',[{name:'large.bin',data:async()=>new Uint8Array(MAX_INLINE_FILE+1)}])),/16 MiB/);
});
test('cancelled drag never returns executable upload sources',async()=>{
 const result=await dropSources(mock,dt('file:///work/a.html'),{isCancellationRequested:true});
 assert.deepEqual(result,[]);
});
test('unsupported drag payloads and oversized roots fail visibly',async()=>{
 await assert.rejects(dropSources(mock,dt('')),/Drop local/);
 await assert.rejects(dropSources(mock,dt(Array.from({length:101},(_,i)=>`file:///work/f${i}.txt`).join('\n'))),/Only 100/);
});
test('drop integration has a tree controller with cancel, confirmation, and activity feedback',async()=>{
 const fs=require('node:fs/promises');
 const code=await fs.readFile(path.join(__dirname,'../src/extension.js'),'utf8');
 assert.match(code,/dragAndDropController/);
 assert.match(code,/dropMimeTypes:\['text\/uri-list','files'\]/);
 assert.match(code,/async handleDrop\(target,transfer,token\)/);
 assert.match(code,/planDroppedUploads\(vscode,site,folder,sources\)/);
 assert.match(code,/await vscode\.window\.showWarningMessage\(`Upload/);
 assert.match(code,/activity\.enqueue\(\{kind:'upload',label:`Dropped file/);
});
