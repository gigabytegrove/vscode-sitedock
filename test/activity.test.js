'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ActivityQueue,ActivityTree}=require('../src/activity');
class EventEmitter{constructor(){this.event=()=>{};}fire(){}dispose(){}}
class ThemeIcon{constructor(id){this.id=id;}}
class TreeItem{constructor(label,state){this.label=label;this.collapsibleState=state;}}
const vscode={EventEmitter,TreeItem,ThemeIcon,TreeItemCollapsibleState:{None:0}};
function fixture(){const state=new Map();const context={globalState:{get:(k,d)=>state.get(k)??d,update:async(k,v)=>state.set(k,v)}};return {context,state,queue:new ActivityQueue(context,vscode)};}
test('files process FIFO and record completed transfers in recent history',async()=>{
 const {queue,state}=fixture();const order=[];
 queue.enqueue({label:'one',siteName:'A'},async()=>{order.push('one');});
 queue.enqueue({label:'two',siteName:'B'},async()=>{order.push('two');});
 await queue.idle();assert.deepEqual(order,['one','two']);assert.deepEqual(queue.all.map(j=>j.status),['completed','completed']);
 assert.equal(state.get('sitedock.activity.v1').length,2);
});
test('queued cancellation prevents running the cancelled upload',async()=>{
 const {queue}=fixture();let release;
 const hold=new Promise(r=>release=r);let ran=false;
 queue.enqueue({label:'first'},async()=>hold);
 const id=queue.enqueue({label:'second'},async()=>{ran=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(queue.cancel(id),true);
 release();await queue.idle();assert.equal(ran,false);
 assert.equal(queue.all.find(x=>x.id===id).status,'cancelled');
});
test('active transfer cannot be misreported as cancelled if it already sent the data',async()=>{
 const {queue}=fixture();let release;const p=new Promise(r=>release=r);
 const id=queue.enqueue({label:'transfer'},async report=>{report(5,10,'Transferring');await p;report(10,10,'Done');});
 await new Promise(r=>setImmediate(r));assert.equal(queue.cancel(id),false);
 release();await queue.idle();assert.equal(queue.all[0].status,'completed');assert.equal(queue.all[0].doneBytes,10);
});
test('failed upload is visible with error details and the queue continues',async()=>{
 const {queue}=fixture();let ran=false;
 queue.enqueue({label:'bad'},async()=>{throw new Error('disk full');});
 queue.enqueue({label:'good'},async()=>{ran=true;});
 await queue.idle();assert.equal(ran,true);
 assert.equal(queue.all.find(x=>x.label==='bad').status,'failed');
 assert.match(queue.all.find(x=>x.label==='bad').message,/disk full/);
});
test('remote edits recorded as completed or failed activity',async()=>{
 const {queue}=fixture();await queue.track({label:'Save index.php',kind:'upload'},async()=>{});
 await assert.rejects(queue.track({label:'Delete file',kind:'delete'},async()=>{throw new Error('Access denied');}));
 assert.deepEqual(queue.all.map(x=>x.status),['failed','completed']);
});
test('unfinished work becomes interrupted after restart, not silently retried',async()=>{
 const {context,state}=fixture();state.set('sitedock.activity.v1',[{id:'x',label:'Uploading',kind:'upload',status:'running',createdAt:1},{id:'y',label:'Queued',status:'queued',createdAt:2}]);
 const queue=new ActivityQueue(context,vscode);
 assert.deepEqual(queue.all.map(x=>x.status),['interrupted','interrupted']);
 assert.equal(queue.busy,0);
});
test('clear completed preserves any currently running or queued jobs',async()=>{
 const {queue}=fixture();let release;const p=new Promise(r=>release=r);
 queue.enqueue({label:'hold'},async()=>p);
 await new Promise(r=>setImmediate(r));
 queue.clearCompleted();assert.equal(queue.all.length,1);
 release();await queue.idle();queue.clearCompleted();assert.equal(queue.all.length,0);
});
test('activity tree exposes status, percentage and actionable IDs',async()=>{
 const {queue}=fixture();const id=queue.enqueue({label:'Upload file.php',siteName:'Site 1'},async report=>report(5,10,'Uploading'));
 await queue.idle();const tree=new ActivityTree(vscode,queue);const item=tree.getTreeItem(tree.getChildren()[0]);
 assert.equal(item.command.arguments[0],id);assert.match(item.tooltip,/Site 1/);
 assert.equal(item.contextValue,'sitedock.activity.completed');
});
test('failed queued operations can retry without losing the original failure record',async()=>{
 const {queue}=fixture();let attempts=0;
 const id=queue.enqueue({label:'retry upload'},async()=>{if(++attempts===1)throw new Error('temporary');});
 await queue.idle();assert.equal(queue.all[0].status,'failed');
 assert.equal(queue.retry(id),true);await queue.idle();
 assert.equal(attempts,2);assert.equal(queue.all[0].status,'completed');
 assert.equal(queue.all[1].status,'failed');
});
test('skipped file does not register a false success or error',async()=>{
 const {queue}=fixture();queue.enqueue({label:'skip'},async()=>({skipped:true,reason:'Exists'}));
 await queue.idle();assert.equal(queue.all[0].status,'skipped');
});
test('more than 200 waiting transfers are not dropped by history pruning',async()=>{
 const {queue}=fixture();let release;const lock=new Promise(r=>release=r);let counter=0;
 queue.batch(()=>{
  queue.enqueue({label:'hold'},async()=>{await lock;counter++;});
  for(let i=0;i<220;i++)queue.enqueue({label:`job ${i}`},async()=>{counter++;});
 });
 await new Promise(r=>setImmediate(r));assert.equal(queue.busy,221);
 release();await queue.idle();assert.equal(counter,221);assert.equal(queue.busy,0);
 assert.equal(queue.all.length,200,'only finished history is trimmed');
});
