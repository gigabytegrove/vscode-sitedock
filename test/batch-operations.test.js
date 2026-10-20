'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {MAX_BATCH,itemsForAction,planBatch,withoutNested,movePlan}=require('../src/batch-operations');
const site={id:'site-A',root:'/srv/www',name:'Production',protocol:'sftp'};
const store={get:id=>id===site.id?site:null};
const node=(p,type='file',extra={})=>({kind:'entry',id:site.id,path:p,name:path.posix.basename(p),type,...extra});
test('native selection favors the clicked entry if it is not selected',()=>{
 const a=node('/a.txt'),b=node('/b.txt'),c=node('/c.txt');
 assert.deepEqual(itemsForAction(c,[a,b]),[c]);
 assert.deepEqual(itemsForAction(a,[a,b]),[a,b]);
 assert.deepEqual(itemsForAction(undefined,[a,b]),[a,b]);
});
test('site roots, excessive batches, mixed sites, and unsafe names are rejected',()=>{
 for(const bad of [[],[{kind:'site',id:site.id}],[node('/')],[node('/foo/../bar')],Array.from({length:MAX_BATCH+1},(_,i)=>node('/file-'+i))])assert.throws(()=>planBatch(bad,store));
 assert.throws(()=>planBatch([node('/one'),{...node('/two'),id:'another'}],store),/span multiple sites/);
 assert.throws(()=>planBatch([{...node('/one'),id:'deleted'}],store),/no longer exists/);
 assert.throws(()=>planBatch([node('/a\nb')],store),/filename/);
});
test('external folder contents cannot be batch-managed; symlink itself can be unlinked',()=>{
 assert.throws(()=>planBatch([node('/outside','directory',{external:true})],store),/external item/);
 assert.equal(planBatch([node('/link','directory',{external:true,symlink:true})],store).items[0].isDirectory,false);
});
test('recursive delete collapses nested selections without duplicate operations',()=>{
 const batch=planBatch([node('/assets','directory'),node('/assets/a.png'),node('/z.txt'),node('/z.txt')],store);
 assert.deepEqual(withoutNested(batch.items).map(i=>i.path),['/assets','/z.txt']);
});
test('move rejects parent/child pairs, descendants, collisions, no-ops and traversal',()=>{
 assert.throws(()=>movePlan(planBatch([node('/dir','directory'),node('/dir/a')],store),'/archive',site),/folder OR its children/);
 assert.throws(()=>movePlan(planBatch([node('/dir','directory')],store),'/dir/sub',site),/descendants/);
 assert.throws(()=>movePlan(planBatch([node('/a/x'),node('/b/x')],store),'/archive',site),/same destination name/);
 assert.throws(()=>movePlan(planBatch([node('/a/x')],store),'/a',site),/already in/);
 for(const dest of ['archive','/bad/../archive','/bad/./archive','/bad\\path'])assert.throws(()=>movePlan(planBatch([node('/a/x')],store),dest,site),/Destination/);
});
test('valid move plan preserves basenames and stays under configured remote site',()=>{
 const batch=planBatch([node('/css/a.css'),node('/js/b.js')],store);
 assert.deepEqual(movePlan(batch,'/archive',site).map(x=>x.destination),['/archive/a.css','/archive/b.js']);
});
test('native explorer exposes multi-select batch actions in context and toolbar',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/extension.js'),'utf8');
 const pkg=require('../package.json');
 assert.match(src,/canSelectMany:true/);
 for(const name of ['batchMove','batchDelete']){
  assert.match(src,new RegExp("command\\('sitedock\\."+name+"'"));
  const cmd='sitedock.'+name;
  assert.ok(pkg.contributes.commands.some(c=>c.command===cmd));
  assert.ok(pkg.contributes.menus['view/title'].some(c=>c.command===cmd));
  assert.ok(pkg.contributes.menus['view/item/context'].some(c=>c.command===cmd));
 }
});
