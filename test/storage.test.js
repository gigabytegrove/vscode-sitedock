'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SiteStore,validateSite}=require('../src/storage');
function context(){
  const state=new Map(),secrets=new Map();
  return {state,secrets,globalState:{get:(k,d)=>state.get(k)??d,update:async(k,v)=>state.set(k,v)},
    secretsApi:null,
    secretMethods:{get:async k=>secrets.get(k),store:async(k,v)=>secrets.set(k,v),delete:async k=>secrets.delete(k)}};
}
function storeFixture(){const ctx=context();ctx.secrets=ctx.secretMethods;return {store:new SiteStore(ctx),ctx};}
const base={name:'Production',host:'example.com',protocol:'sftp',port:22,user:'alice',root:'/srv/www',auth:'password'};
test('normalizes sites and refuses malformed details',()=>{
  assert.equal(validateSite(base).root,'/srv/www');
  assert.equal(validateSite({...base,protocol:'ftps-implicit',port:''}).port,990);
  assert.throws(()=>validateSite({...base,host:'ftp://example.com'}));
  assert.throws(()=>validateSite({...base,port:65536}));
  assert.throws(()=>validateSite({...base,protocol:'unknown'}));
});
test('stores secrets separately, retains passwords on editing, and deletes them on remove',async()=>{
  const {store,ctx}=storeFixture();
  let site=await store.save(base,{password:'strong-credential'});
  assert.equal(store.all().length,1);
  assert.equal(JSON.stringify(store.all()).includes('strong-credential'),false);
  assert.equal(await store.password(site.id),'strong-credential');
  site=await store.save({...site,name:'Renamed'},{});
  assert.equal(await store.password(site.id),'strong-credential');
  await store.remove(site.id);
  assert.equal(store.all().length,0);
  assert.equal(await store.password(site.id),undefined);
});
test('failed auth switch does not destroy credentials',async()=>{
  const {store}=storeFixture();
  const site=await store.save(base,{password:'unchanged'});
  await assert.rejects(store.save({...site,protocol:'ftp',password:''},{}),/password is required/);
  assert.equal(await store.password(site.id),'unchanged');
  assert.equal(store.get(site.id).protocol,'sftp');
});
test('fingerprint is invalidated when server address changes',async()=>{
  const {store}=storeFixture();
  let site=await store.save(base,{password:'password'});
  await store.trustKey(site.id,'a'.repeat(64));
  site=await store.save({...store.get(site.id),host:'other.example.com'},{});
  assert.equal(site.fingerprint,'');
});
test('host key may be retained after an independently approved test of new host',async()=>{
  const {store}=storeFixture();let site=await store.save(base,{password:'pw'});
  site=await store.save({...site,host:'other.example.com',fingerprint:'b'.repeat(64)},{},{verifiedForNewHost:true});
  assert.equal(site.fingerprint,'b'.repeat(64));
});
