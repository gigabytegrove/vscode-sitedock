'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {recordProgress,progressSummary,bytes,remainingTime}=require('../src/transfer-progress');
const {ActivityQueue,ActivityTree,safeMessage}=require('../src/activity');
function job(){return {status:'running',doneBytes:0,totalBytes:0,speedBytesPerSec:0,etaSeconds:null};}
class EventEmitter{constructor(){this.event=()=>{};}fire(){}dispose(){}}
class ThemeIcon{constructor(id){this.id=id;}}
class TreeItem{constructor(label,state){this.label=label;this.collapsibleState=state;}}
const vscode={EventEmitter,TreeItem,ThemeIcon,TreeItemCollapsibleState:{None:0}};
function fixture(state=new Map()){
 const context={globalState:{get:(k,d)=>state.get(k)??d,update:async(k,v)=>state.set(k,v)}};
 return {state,queue:new ActivityQueue(context,vscode)};
}
test('transfer speed and ETA are calculated from byte progress',()=>{
 const j=job();recordProgress(j,0,10*1024*1024,1000);recordProgress(j,1024*1024,10*1024*1024,2000);
 assert.equal(j.speedBytesPerSec,1024*1024);assert.equal(j.etaSeconds,9);
 assert.match(progressSummary(j),/10% · 1\.0 MB\/s · ~9s left/);
});
test('retry resets previous rate and ETA',()=>{
 const j=job();recordProgress(j,0,1000,100);recordProgress(j,900,1000,1100);
 recordProgress(j,0,0,1500);assert.equal(j.speedBytesPerSec,0);assert.equal(j.etaSeconds,null);
 recordProgress(j,100,1000,2000);assert.equal(j.speedBytesPerSec,200);assert.equal(j.etaSeconds,5);
});
test('unknown totals do not fabricate ETA',()=>{
 const j=job();recordProgress(j,1000,0,1000);recordProgress(j,2000,0,2000);
 assert.equal(j.speedBytesPerSec,1000);assert.equal(j.etaSeconds,null);assert.doesNotMatch(progressSummary(j),/left/);
});
test('invalid byte values and over-reports are bounded',()=>{
 const j=job();recordProgress(j,800,400,1000);recordProgress(j,Infinity,-20,2000);
 assert.equal(j.doneBytes,400);assert.equal(j.totalBytes,400);
 assert.match(progressSummary(j),/100%/);assert.doesNotMatch(progressSummary(j),/NaN|Infinity/);
});
test('stalls decay estimated throughput',()=>{
 const j=job();recordProgress(j,100,1000,1000);recordProgress(j,200,1000,2000);
 assert.equal(j.speedBytesPerSec,100);recordProgress(j,200,1000,10000);
 assert.equal(j.speedBytesPerSec,0);assert.equal(j.etaSeconds,null);
});
test('duration and byte formatting handle edge values',()=>{
 assert.equal(bytes(0),'0 B');assert.equal(bytes(1024),'1.0 KB');assert.equal(bytes(12*1024*1024),'12 MB');
 assert.equal(remainingTime(59),'59s');assert.equal(remainingTime(61),'1m 1s');assert.equal(remainingTime(3601),'1h 1m');
 assert.equal(remainingTime(NaN),'');
});
test('finished transfers do not display an obsolete ETA or rate',()=>{
 const j=job();recordProgress(j,100,1000,1000);recordProgress(j,200,1000,2000);
 j.status='completed';assert.doesNotMatch(progressSummary(j),/left|\/s/);
});
test('activity error redaction handles FTP, FTPS, SFTP, HTTP and basic auth',()=>{
 const msg=safeMessage('ftps://alice:password@host/path Authorization: Basic dXNlcjpwYXNz password=xyz api_key=abc Bearer token123');
 for(const secret of ['alice:password','dXNlcjpwYXNz','xyz','abc','token123','ftps://'])assert.equal(msg.includes(secret),false);
 assert.match(msg,/redacted/);
});
test('activity tree exposes running speed, ETA and byte counts',async()=>{
 const {queue}=fixture();let release;const hold=new Promise(r=>release=r);const original=Date.now;
 try{
  let now=1000;Date.now=()=>now;
  queue.enqueue({label:'Download',siteName:'Test'},async report=>{report(100,1000,'Working');await hold;});
  await new Promise(r=>setImmediate(r));now=2000;queue._report(queue.jobs[0],200,1000,'Working');
  const item=new ActivityTree(vscode,queue).getTreeItem(queue.all[0]);
  assert.match(item.description,/running · 20% · 100 B\/s · ~8s left/);
  assert.match(item.tooltip,/Transferred: 200 B \/ 1000 B/);
 }finally{Date.now=original;release?.();await queue.idle();queue.dispose();}
});
test('restart marks incomplete work interrupted without persisting rate samples',async()=>{
 const {queue,state}=fixture();let release;const hold=new Promise(r=>release=r);
 try{
  queue.enqueue({kind:'download',label:'Read index.php'},async report=>{report(1024,8192,'Downloading');await hold;});
  await new Promise(r=>setImmediate(r));await queue.flush();
  const [saved]=state.get('sitedock.activity.v1');assert.equal(saved._progressSamples,undefined);
  assert.equal(saved._lastEmit,undefined);
  const after=fixture(state).queue;assert.equal(after.all[0].status,'interrupted');
  assert.equal(after.all[0].speedBytesPerSec,0);assert.equal(after.all[0].etaSeconds,null);
  assert.equal(after.retry(saved.id),false);after.dispose();
 }finally{release?.();await queue.idle();queue.dispose();}
});
test('previously saved errors are redacted again on reload',()=>{
 const data=new Map([['sitedock.activity.v1',[{id:'x',label:'old',status:'failed',message:'Bearer secret-123 password=plain',createdAt:1}]]]);
 const q=fixture(data).queue;assert.doesNotMatch(q.all[0].message,/secret-123|plain/);q.dispose();
});
test('status bar exposes throughput without breaking activity navigation',async()=>{
 const fs=require('node:fs/promises'),path=require('node:path');
 const source=await fs.readFile(path.join(__dirname,'../src/extension.js'),'utf8');
 assert.match(source,/running\.reduce\(/);assert.match(source,/formatTransferBytes\(throughput\)/);
 assert.match(source,/activityStatus\.command='sitedock\.showActivity'/);
});
