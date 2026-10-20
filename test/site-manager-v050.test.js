'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {SiteWorkspaces,normalize,KEY}=require('../src/workspaces');
const {SiteStore}=require('../src/storage');
const {searchRemoteFiles}=require('../src/search-remote');
const profiles=[
{id:'one',name:'Production',protocol:'sftp',port:22,user:'deploy',host:'prod.invalid',root:'/var/www',auth:'password',fingerprint:'a'.repeat(64),followExternalLinks:true},
{id:'two',name:'Staging',protocol:'ftps',port:21,user:'deploy',host:'stage.invalid',root:'/www',auth:'password'}
];
function fixture(){
 const values=new Map([['sitedock.sites.v1',structuredClone(profiles)]]),secrets=new Map([['sitedock.one.password','private-password']]);
 let secretChanges=0;
 const context={globalState:{get:(key,fallback)=>values.has(key)?structuredClone(values.get(key)):fallback,update:async(key,value)=>values.set(key,structuredClone(value))},
 secrets:{get:async key=>secrets.get(key),store:async()=>{secretChanges++;},delete:async()=>{secretChanges++;}}};
 const store=new SiteStore(context),workspaces=new SiteWorkspaces(context,store);
 return {store,workspaces,context,values,secrets,get secretChanges(){return secretChanges;}};
}
test('groups and sorting persist across VS Code workspace reload without changing credentials',async()=>{
 const f=fixture();await f.workspaces.group('one','Production');await f.workspaces.group('two','Clients');await f.workspaces.setSort('host');
 const reload=new SiteWorkspaces(f.context,f.store);
 assert.deepEqual(reload.snapshot.groups,{one:'Production',two:'Clients'});assert.equal(reload.snapshot.sort,'host');
 assert.equal(await f.store.password('one'),'private-password');assert.equal(f.secretChanges,0);
 await f.workspaces.group('two','');assert.equal(f.workspaces.snapshot.groups.two,undefined);
});
test('invalid groups are rejected; deleted sites lose their group association',async()=>{
 const f=fixture();for(const value of ['x'.repeat(41),'bad\nname',null])
   await assert.rejects(f.workspaces.group('one',value),/group/i);
 await f.workspaces.group('one','Production');await f.store.remove('one');await f.workspaces.sync();
 assert.deepEqual(f.workspaces.snapshot.groups,{});
 const scrub=normalize({groups:{two:'bad\nname',missing:'hidden'},sort:'unsupported'},f.store.all());
 assert.deepEqual(scrub.groups,{});assert.equal(scrub.sort,'smart');
});
test('duplicate preserves connection target while refusing credentials and SSH trust',async()=>{
 const f=fixture(),copy=await f.store.duplicate('one');
 assert.notEqual(copy.id,'one');assert.equal(copy.name,'Production (copy)');assert.equal(copy.host,'prod.invalid');
 assert.equal(copy.fingerprint,'');assert.equal(copy.followExternalLinks,false);
 assert.equal(await f.store.password(copy.id),undefined);assert.equal(await f.store.password('one'),'private-password');
 assert.equal(f.secretChanges,0);assert.equal(f.store.all().length,3);
});
test('duplicate of key authentication drops private key paths and requires credential setup',async()=>{
 const f=fixture();f.values.set('sitedock.sites.v1',[{...profiles[0],auth:'key',keyPath:'C:/private.pem'}]);
 const copy=await f.store.duplicate('one');assert.equal(copy.auth,'password');assert.equal(copy.keyPath,'');
 assert.equal(await f.store.password(copy.id),undefined);
});
test('remote filename search traverses regular folders but never follows links or unsafe paths',async()=>{
 const visited=[],tree={'/':[{name:'app',type:'directory'},{name:'assets',type:'directory'},{name:'out',type:'directory',symlink:true},{name:'../escape',type:'directory'},{name:'index.php',type:'file'}],
 '/app':[{name:'config.php',type:'file'},{name:'nested',type:'directory'},{name:'loop',type:'symlink'}],'/assets':[{name:'img.png',type:'file'}],'/app/nested':[{name:'other.php',type:'file'}]};
 const result=await searchRemoteFiles({query:'.PHP',list:async p=>{visited.push(p);return tree[p]||[];}});
 assert.deepEqual(result.matches.map(x=>x.path),['/index.php','/app/config.php','/app/nested/other.php']);
 assert.deepEqual(visited,['/','/app','/assets','/app/nested']);assert.equal(result.cancelled,false);
});
test('cancellation and configured limits halt remote directory walks',async()=>{
 const signal={isCancellationRequested:false};let calls=0;
 const stopped=await searchRemoteFiles({query:'match',signal,list:async()=>{calls++;signal.isCancellationRequested=true;return [{name:'match.txt',type:'file'}];}});
 assert.equal(stopped.cancelled,true);assert.equal(calls,1);
 const limited=await searchRemoteFiles({query:'x',list:async()=>Array.from({length:10},(_,i)=>({name:'x'+i,type:'file'})),limits:{maxDirectories:1,maxEntries:10,maxMatches:2,maxDepth:3}});
 assert.equal(limited.matches.length,2);assert.equal(limited.truncated,true);
});
test('invalid search queries and malformed listings are rejected',async()=>{
 for(const q of ['', '   ', 'x'.repeat(121), '\n'])await assert.rejects(searchRemoteFiles({query:q,list:async()=>[]}),/Search for/);
 await assert.rejects(searchRemoteFiles({query:'index',list:async()=>({wrong:'shape'})}),/invalid directory listing/);
});
test('v0.5 Site Manager exposes group, duplicate, search and sorting actions in visible UI',()=>{
 const manifest=require('../package.json');
 const html=fs.readFileSync(require('node:path').join(__dirname,'../ui/manager.html'),'utf8');
 const panel=fs.readFileSync(require('node:path').join(__dirname,'../src/manager-panel.js'),'utf8');
 const extension=fs.readFileSync(require('node:path').join(__dirname,'../src/extension.js'),'utf8');
 for(const name of ['groupSite','duplicateSite','searchRemote','setSiteSort']){
   assert.ok(manifest.contributes.commands.some(x=>x.command==='sitedock.'+name));
   assert.ok(panel.includes("'"+name+"'"));assert.ok(extension.includes("command('sitedock."+name+"'"));
 }
 for(const name of ['groupSite','duplicateSite','searchRemote'])assert.ok(html.includes("'"+name+"'"));
 assert.match(html,/id="groupFilter"/);assert.match(html,/data-action="setSiteSort"/);
 assert.match(html,/textContent=site\.group/);assert.doesNotMatch(html,/\.innerHTML\s*=/);
 assert.equal(manifest.version,'0.5.0');
});
