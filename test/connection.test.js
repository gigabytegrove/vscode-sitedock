'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {operation,sameHash,fileType,HostKeyError}=require('../src/connection');
test('SSH fingerprint matching requires equal SHA-256 hashes',()=>{
  assert.equal(sameHash('a'.repeat(64),'a'.repeat(64)),true);
  assert.equal(sameHash('a'.repeat(64),'b'.repeat(64)),false);
  assert.equal(sameHash('invalid','invalid'),false);
  assert.equal(new HostKeyError('a'.repeat(64)).name,'HostKeyError');
});
test('SFTP mode distinguishes folders, symlinks and regular files',()=>{
  assert.equal(fileType(0o040755),'directory');
  assert.equal(fileType(0o100644),'file');
  assert.equal(fileType(0o120777),'symlink');
});
test('recursive remote deletion never traverses symlinks',async()=>{
  const nodes=new Map([['/data','d'],['/data/a','d'],['/data/a/regular','-'],['/data/link','l'],['/outside','d'],['/outside/private','-']]);
  const client={
    list:async p=>[...nodes.keys()].filter(k=>k!==p && require('node:path').posix.dirname(k)===p).map(k=>({name:require('node:path').posix.basename(k),type:nodes.get(k),size:0,modifyTime:0})),
    delete:async p=>{assert.notEqual(p,'/outside/private');nodes.delete(p);},
    rmdir:async p=>{nodes.delete(p);},
    lstat:async p=>({mode:nodes.get(p)==='d'?0o040755:nodes.get(p)==='l'?0o120777:0o100644,size:0,modifyTime:1}),
    stat:async p=>({mode:nodes.get(p)==='l'?0o040755:nodes.get(p)==='d'?0o040755:0o100644,size:0,modifyTime:1})
  };
  const session={type:'sftp',client};
  assert.deepEqual({type:(await operation(session,'stat','/data/link')).type,symlink:(await operation(session,'stat','/data/link')).symlink},{type:'directory',symlink:true});
  await operation(session,'rmdir','/data');
  assert.equal(nodes.size,2);
  assert.equal(nodes.get('/outside'),'d');
  assert.equal(nodes.get('/outside/private'),'-');
});
