'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {exportProfiles,previewImport,EXPORT_FORMAT,MAX_BYTES}=require('../src/site-profiles');
const {SiteStore}=require('../src/storage');
const profile={id:'original',name:'Primary',host:'site.example.invalid',protocol:'sftp',port:22,user:'deploy',root:'/srv/www',auth:'password',fingerprint:'a'.repeat(64),followExternalLinks:true,password:'secret',passphrase:'also secret',privateKey:'KEY'};
const encoded=data=>Buffer.from(JSON.stringify(data),'utf8');
test('export whitelists only portable nonsecret metadata and disables unsafe link access',()=>{
  const value=exportProfiles([profile]);const result=JSON.parse(value);
  assert.equal(result.format,EXPORT_FORMAT);
  assert.equal(result.version,1);
  assert.equal(result.sites.length,1);
  for(const forbidden of ['id','password','privateKey','passphrase','fingerprint','keyPath'])assert.equal(Object.hasOwn(result.sites[0],forbidden),false,`leaked ${forbidden}`);
  assert.equal(value.includes('secret'),false);assert.equal(value.includes('KEY'),false);
  assert.equal(result.sites[0].followExternalLinks,false);
});
test('import skips matching saved sites and duplicates within the same backup',()=>{
  const exportData=JSON.parse(exportProfiles([{...profile,host:'other.example.invalid'},profile,profile]));
  const result=previewImport(encoded(exportData),[profile]);
  assert.equal(result.total,3);assert.equal(result.imports.length,1);assert.equal(result.skipped,2);
  assert.notEqual(result.imports[0].id,'original');assert.equal(result.imports[0].fingerprint,'');assert.equal(result.imports[0].followExternalLinks,false);
});
test('imported SSH key sites require reconnection setup but never export key paths',()=>{
  const result=previewImport(Buffer.from(exportProfiles([{...profile,auth:'key',keyPath:'/private/key'}])),[]);
  assert.equal(result.imports.length,1);assert.equal(result.imports[0].auth,'password');assert.equal(result.imports[0].keyPath,'');
});
test('reject malformed, oversized and privilege-changing imports before any mutation',()=>{
  const clean=JSON.parse(exportProfiles([profile]));
  const rejects=(raw,rx)=>assert.throws(()=>previewImport(encoded(raw),[]),rx);
  rejects({...clean,version:99},/Unsupported/);
  rejects({...clean,sites:[{...clean.sites[0],password:'injected'}]},/Unexpected field/);
  rejects({...clean,sites:[{...clean.sites[0],followExternalLinks:true}]},/external symlink/);
  rejects({...clean,sites:[{...clean.sites[0],fingerprint:'a'.repeat(64)}]},/Unexpected field/);
  assert.throws(()=>previewImport(Buffer.alloc(MAX_BYTES+1),[]),/1 MB/);
  assert.throws(()=>previewImport(Buffer.from('{bad'),[]),/not a valid/);
  assert.throws(()=>previewImport('not bytes',[]),/1 MB/);
  assert.throws(()=>exportProfiles(new Array(501).fill(profile)),/Too many/);
});
test('importProfiles validates all entries first and does not touch SecretStorage',async()=>{
  let writes=0,deleted=0;
  const state={sites:[{...profile}]};
  const context={globalState:{get:(_key,otherwise)=>state.sites||otherwise,update:async(_key,value)=>{writes++;state.sites=value;}},secrets:{delete:async()=>{deleted++;},get:async()=>undefined,store:async()=>{}}};
  const store=new SiteStore(context);
  const candidate=previewImport(Buffer.from(exportProfiles([{...profile,host:'new.example.invalid'}])),store.all()).imports[0];
  await assert.rejects(store.importProfiles([candidate,{...candidate,id:'original'}]),/duplicated/);
  assert.equal(writes,0);
  assert.equal(await store.importProfiles([candidate]),1);assert.equal(writes,1);assert.equal(deleted,0);
  assert.equal(store.all().length,2);
  assert.equal(store.get(candidate.id).fingerprint,'');
});
