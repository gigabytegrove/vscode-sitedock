'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {retryDownload,isTransient}=require('../src/transfer-retry');
const fail=(code)=>Object.assign(new Error('network'),{code});
test('only transient network failures qualify for download retries',()=>{
 for(const code of ['ECONNRESET','ETIMEDOUT','EPIPE','ENETUNREACH','EAI_AGAIN'])assert.equal(isTransient(fail(code)),true);
 for(const code of ['EACCES','ENOENT','AUTH','CONFLICT'])assert.equal(isTransient(fail(code)),false);
 assert.equal(isTransient(new Error('permission denied')),false);
 assert.equal(isTransient(new Error('SHA-256 mismatch')),false);
 assert.equal(isTransient(new Error('outer',{cause:fail('ETIMEDOUT')})),true);
});
test('transient download error recovers within bounded attempts and reports progress',async()=>{
 let called=0;const reports=[],waits=[];
 const answer=await retryDownload(async()=>{called++;if(called<3)throw fail('ECONNRESET');return 'ok';},{wait:async n=>waits.push(n),report:(...args)=>reports.push(args)});
 assert.equal(answer,'ok');assert.equal(called,3);assert.deepEqual(waits,[350,1050]);assert.equal(reports.length,2);
});
test('persistent transient download fails after final attempt without silent success',async()=>{
 let called=0;
 await assert.rejects(retryDownload(async()=>{called++;throw fail('ETIMEDOUT');},{wait:async()=>{}}),/network/);
 assert.equal(called,3);
});
test('permission, auth and conflict failures are never automatically replayed',async()=>{
 for(const code of ['EACCES','AUTH','CONFLICT']){
  let attempts=0;
  await assert.rejects(retryDownload(async()=>{attempts++;throw fail(code);},{wait:async()=>{throw new Error('must not wait');}}),/network/);
  assert.equal(attempts,1);
 }
});
test('retry respects cancellation before first attempt and between attempts',async()=>{
 let calls=0;
 await assert.rejects(retryDownload(async()=>{calls++;},{signal:{aborted:true}}),/cancelled/);
 assert.equal(calls,0);
 const controller=new AbortController();
 await assert.rejects(retryDownload(async()=>{calls++;throw fail('EPIPE');},{signal:controller.signal,wait:async()=>controller.abort()}),/cancelled/);
 assert.equal(calls,1);
});
test('retry bounds reject invalid settings and are explicitly download-only in extension code',async()=>{
 await assert.rejects(retryDownload(async()=>{}, {maxAttempts:100}),/limit/);
 const fs=require('node:fs/promises'),path=require('node:path');
 const code=await fs.readFile(path.join(__dirname,'../src/extension.js'),'utf8');
 assert.match(code,/retryDownload\(\(\)=>doRemote\(site\.id,'downloadLocal'/);
 assert.doesNotMatch(code,/retryDownload\(\(\)=>doRemote\(site\.id,'delete'/);
});
