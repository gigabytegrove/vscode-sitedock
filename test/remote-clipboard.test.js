'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {snapshotItems,destinationPath,planRemoteCopy,copyRemoteFile,planBatchDownload,MAX_ITEMS}=require('../src/remote-clipboard');
const site={id:'primary',root:'/srv/web',protocol:'sftp'};
const item=(p,type='file',extra={})=>({id:site.id,path:p,name:path.posix.basename(p),type,isDirectory:type==='directory',...extra});
const batch=(...items)=>({siteId:site.id,items});
const tree={
 '/index.html':{type:'file'},'/assets':{type:'directory'},'/assets/css':{type:'directory'},'/assets/css/site.css':{type:'file'},
 '/assets/logo.png':{type:'file'},'/assets/escape':{type:'directory',symlink:true},'/target':{type:'directory'}
};
const children={'/assets':[{name:'css',type:'directory'},{name:'logo.png',type:'file'},{name:'escape',type:'directory',symlink:true}],'/assets/css':[{name:'site.css',type:'file'}]};
const stat=async virtual=>tree[virtual]||null;
const list=async virtual=>children[virtual]||[];
const opts=(snapshot,extra={})=>({snapshot,site,folder:'/target',list,stat,...extra});
test('copy snapshots drop nested selections and reject symlinks, external entries and missing selection',()=>{
 const data=snapshotItems(batch(item('/assets','directory'),item('/assets/logo.png')));
 assert.deepEqual(data.items.map(x=>x.path),['/assets']);
 assert.throws(()=>snapshotItems(batch(item('/assets/escape','directory',{symlink:true}))),/symbolic links/);
 assert.throws(()=>snapshotItems(null),/Copy or select/);
});
test('same-site file and directory copies preserve layout and skip link traversal',async()=>{
 const plan=await planRemoteCopy(opts(batch(item('/assets','directory'),item('/index.html'))));
 assert.deepEqual(plan.map(x=>[x.kind,x.source,x.remote]),[
  ['mkdir','/assets','/target/assets'],['mkdir','/assets/css','/target/assets/css'],
  ['copy','/assets/css/site.css','/target/assets/css/site.css'],
  ['copy','/assets/logo.png','/target/assets/logo.png'],
  ['copy','/index.html','/target/index.html']]);
});
test('FTP-like stat cannot inspect children under a not-yet-created destination folder',async()=>{
 const strict=async p=>{if(p.startsWith('/target/assets/'))throw new Error('FTP cannot list missing parent');return tree[p]||null;};
 const result=await planRemoteCopy(opts(batch(item('/assets','directory')),{stat:strict}));
 assert.equal(result.length,4);
});
test('copy refuses existing destinations before performing mutations',async()=>{
 const occupied=async p=>p==='/target/index.html'?{type:'file'}:tree[p]||null;
 await assert.rejects(planRemoteCopy(opts(batch(item('/index.html')),{stat:occupied})),/already exists/);
});
test('copy refuses cross-site, same-folder, descendant folder, and duplicate filenames',async()=>{
 await assert.rejects(planRemoteCopy(opts({...batch(item('/index.html')),siteId:'another'})),/one site/);
 await assert.rejects(planRemoteCopy(opts(batch(item('/assets','directory')),{folder:'/assets/css'})),/into itself/);
 await assert.rejects(planRemoteCopy(opts(batch(item('/index.html')),{folder:'/'})),/onto the original/);
 await assert.rejects(planRemoteCopy(opts(batch(item('/index.html'),item('/more/index.html')))),/share the filename/);
});
test('copy refuses traversal and bounded size/depth',async()=>{
 assert.throws(()=>destinationPath(site,'/target/../tmp','foo'),/safe absolute/);
 assert.throws(()=>destinationPath(site,'/target','bad\\name'),/filename/);
 await assert.rejects(planRemoteCopy(opts(batch(item('/assets','directory')),{maxEntries:2})),/exceeds 2/);
 await assert.rejects(planRemoteCopy(opts(batch(item('/assets','directory')),{maxDepth:0})),/directory levels/);
});
test('copy staging transfers byte content and deletes its temporary workspace on success',async()=>{
 let seenTmp, bytes, message=[];
 const result=await copyRemoteFile({source:'/a',target:'/b',report:(...x)=>message.push(x),
  download:async(_source,p)=>{seenTmp=p;await fs.writeFile(p,'hello');},
  upload:async(p)=>{bytes=await fs.readFile(p,'utf8');}});
 assert.equal(bytes,'hello');assert.equal(result,5);
 assert.equal(message.at(-1)[2],'Copied');
 await assert.rejects(fs.access(seenTmp));
});
test('copy failure and cancellation never upload or leak local staging files',async()=>{
 let name,uploads=0;
 await assert.rejects(copyRemoteFile({source:'/a',target:'/b',download:async(_src,p)=>{name=p;await fs.writeFile(p,'x');throw new Error('network failed');},upload:async()=>{uploads++;}}),/network failed/);
 assert.equal(uploads,0);await assert.rejects(fs.access(name));
 await assert.rejects(copyRemoteFile({source:'/a',target:'/b',signal:{aborted:true},download:async()=>{throw Error('download should not run');},upload:async()=>{uploads++;}}),/cancelled/);
 assert.equal(uploads,0);
});
function fakeVscode(){return {Uri:{joinPath:(u,n)=>({scheme:'file',path:path.posix.join(u.path,n),fsPath:path.posix.join(u.path,n),toString(){return `file:${this.path}`}})}};}
test('batch download merges selected file and folder plans without flattening',async()=>{
 const plan=await planBatchDownload({vscode:fakeVscode(),batch:batch(item('/index.html'),item('/assets','directory')),
  site,localRoot:{scheme:'file',path:'/local'},list:async address=>{
   const virtual=address.replace('/srv/web','')||'/';return list(virtual);
  }});
 assert.equal(plan.filter(x=>x.kind==='download').length,3);
 assert.ok(plan.some(x=>x.local.path==='/local/assets/css/site.css'));
 assert.ok(plan.some(x=>x.local.path==='/local/index.html'));
 assert.equal(plan.some(x=>x.remote==='/assets/escape'),false);
});
test('batch downloads preflight collisions, crossed sites, and limits',async()=>{
 const vscode=fakeVscode(),localRoot={path:'/local'};
 const base={vscode,site,localRoot,list:async()=>[]};
 await assert.rejects(planBatchDownload({...base,batch:batch(item('/a/file.txt'),item('/b/file.txt'))}),/filename/);
 await assert.rejects(planBatchDownload({...base,batch:{...batch(item('/index.html')),siteId:'wrong'}}),/do not match/);
 await assert.rejects(planBatchDownload({...base,batch:batch(item('/index.html'),item('/assets','directory')),maxEntries:1}),/exceeds 1/);
 assert.equal(MAX_ITEMS,3000);
});
test('commands are visible in explorer menus and do not rely on hidden palette only',async()=>{
 const manifest=require('../package.json');
 const code=await fs.readFile(path.join(__dirname,'..','src','extension.js'),'utf8');
 for(const command of ['copyRemote','pasteRemote','downloadSelected']){
  const name='sitedock.'+command;
  assert.ok(manifest.contributes.commands.some(c=>c.command===name),name+' missing declaration');
  for(const menu of ['view/title','view/item/context'])assert.ok(manifest.contributes.menus[menu].some(c=>c.command===name),name+' missing '+menu);
  assert.ok(code.includes(`command('${name}'`),name+' missing handler');
 }
 assert.match(code,/copyRemoteFile\(/);
 assert.match(code,/planBatchDownload\(/);
 assert.match(code,/activity\.batch\(/);
});
