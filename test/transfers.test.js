'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {operation}=require('../src/connection');
const {Readable}=require('node:stream');
async function temporary(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-stream-'));try{return await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
function clientFixture(){
 const remote=new Map();
 const client={
   put:async(readable,dest)=>{let data=[];for await(const chunk of readable)data.push(Buffer.from(chunk));remote.set(dest,Buffer.concat(data));},
   get:async(src,writable)=>{
     if(!remote.has(src))throw new Error('Missing remote file');
     if(writable){
       for await(const chunk of Readable.from([remote.get(src)]))writable.write(chunk);
       writable.end();return;
     }
     return Buffer.from(remote.get(src));
   }
 };
 return {remote,client,session:{type:'sftp',client}};
}
test('uploadLocal streams actual bytes, does not need a whole-file Buffer',async()=>temporary(async dir=>{
 const file=path.join(dir,'large.bin');const content=Buffer.alloc(800000,0x31);await fs.writeFile(file,content);
 const f=clientFixture();let reports=[];
 await operation(f.session,'uploadLocal',file,'/remote/large.bin',(done,total)=>reports.push([done,total]));
 assert.deepEqual(f.remote.get('/remote/large.bin'),content);
 assert.equal(reports.at(-1)[0],content.length);
 assert.equal(reports.at(-1)[1],content.length);
 assert.ok(reports.some(([n])=>n>0&&n<content.length),'must report intermediate byte progress');
}));
test('downloadLocal uses temporary file and reports actual byte progress',async()=>temporary(async dir=>{
 const f=clientFixture();const data=Buffer.alloc(800000,0x56);f.remote.set('/remote/data.bin',data);
 const pathOut=path.join(dir,'data.bin');let progress=[];
 await operation(f.session,'downloadLocal','/remote/data.bin',pathOut,(n)=>progress.push(n));
 assert.deepEqual(await fs.readFile(pathOut),data);
 assert.equal(progress.at(-1),data.length);
 assert.deepEqual((await fs.readdir(dir)).sort(),['data.bin']);
}));
test('failed download leaves existing file intact and cleans partial downloads',async()=>temporary(async dir=>{
 const f=clientFixture();const target=path.join(dir,'existing.txt');await fs.writeFile(target,'safe original');
 f.client.get=async(_src,writable)=>{writable.write(Buffer.from('incomplete'));throw new Error('connection reset');};
 await assert.rejects(operation(f.session,'downloadLocal','/broken',target,()=>{}),/connection reset/);
 assert.equal((await fs.readFile(target,'utf8')),'safe original');
 assert.deepEqual(await fs.readdir(dir),['existing.txt']);
}));
test('failed upload records error from transport rather than pretending success',async()=>temporary(async dir=>{
 const f=clientFixture();const file=path.join(dir,'upload.txt');await fs.writeFile(file,'upload');
 f.client.put=async stream=>{for await(const _part of stream){}throw new Error('disk quota exceeded');};
 await assert.rejects(operation(f.session,'uploadLocal',file,'/remote/thing',()=>{}),/disk quota exceeded/);
 assert.equal(f.remote.has('/remote/thing'),false);
}));
