'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {Readable}=require('node:stream');
const {listReleases,readChecksum,downloadFile,readLimited}=require('../src/update-network');
function fakeGet(handler){return (uri,_options,onResponse)=>{
  const request={setTimeout(_ms,cb){this.ontimeout=cb;},on(event,callback){if(event==='error')this.onerror=callback;return this;},destroy(err){this.onerror?.(err);}};
  queueMicrotask(()=>{try{const [status,headers,body]=handler(uri.href);const res=Readable.from([Buffer.from(body)]);res.statusCode=status;res.headers=headers;onResponse(res);}catch(err){request.onerror?.(err);}});
  return request;
};}
test('release-list HTTP request uses bounded GitHub JSON',async()=>{
  const get=fakeGet(u=>{assert.match(u,/^https:\/\/api\.github\.com\/repos\/gigabytegrove\/vscode-sitedock\/releases\?per_page=50$/);return [200,{},'[{"tag_name":"v0.3.1"}]'];});
  assert.deepEqual(await listReleases('gigabytegrove/vscode-sitedock',{get}),[{tag_name:'v0.3.1'}]);
});
test('private repository 404 is reported clearly',async()=>{
  const get=fakeGet(()=>[404,{},'Not Found']);
  await assert.rejects(listReleases('gigabytegrove/vscode-sitedock',{get}),/404.*private/);
});
test('oversized metadata, error responses, and unsafe redirects abort downloads',async()=>{
  await assert.rejects(readLimited('https://github.com/a',10,'asset',{get:fakeGet(()=>[200,{},'x'.repeat(20)])}),/exceeds/);
  await assert.rejects(readChecksum('https://github.com/release',{get:fakeGet(()=>[302,{location:'https://evil.invalid/trap'},''])}),/Unexpected GitHub asset host/);
  await assert.rejects(readChecksum('https://github.com/release',{get:fakeGet(()=>[301,{location:'http://github.com/old'},''])}),/HTTPS/);
  await assert.rejects(readChecksum('https://github.com/release',{get:fakeGet(()=>[302,{location:'/same'},'']),redirects:0}),/redirect limit/);
});
test('downloaded assets stream to temporary files and enforce size limit',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-net-test-'));
  try{
    const file=path.join(dir,'first.vsix');
    await downloadFile('https://github.com/download',file,{get:fakeGet(()=>[200,{},'package-bytes']),maxBytes:100});
    assert.equal(await fs.readFile(file,'utf8'),'package-bytes');
    const blocked=path.join(dir,'second.vsix');
    await assert.rejects(downloadFile('https://github.com/download',blocked,{get:fakeGet(()=>[200,{},'oversized']),maxBytes:4}),/exceeds/);
    await assert.rejects(fs.access(blocked));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
