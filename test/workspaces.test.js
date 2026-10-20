'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SiteWorkspaces,normalize,KEY}=require('../src/workspaces');
const {ManagerTree}=require('../src/manager-tree');
const {SiteTree}=require('../src/tree');
const fs=require('node:fs');
const path=require('node:path');
const sites=[
 {id:'alpha',name:'Alpha',host:'alpha.invalid',port:22,root:'/www',protocol:'sftp'},
 {id:'beta',name:'Beta',host:'beta.invalid',port:21,root:'/htdocs',protocol:'ftps'},
 {id:'gamma',name:'Gamma',host:'gamma.invalid',port:22,root:'/srv',protocol:'sftp'}
];
function fixture(initial={}){
 const values=new Map([[KEY,initial]]);let writes=0;let fails=false;
 const context={globalState:{get:(key,fallback)=>values.has(key)?structuredClone(values.get(key)):fallback,
   update:async(key,value)=>{if(fails)throw new Error('storage offline');writes++;values.set(key,structuredClone(value));}}};
 const store={all:()=>sites.map(x=>({...x})),get:id=>sites.find(s=>s.id===id)};
 const manager=new SiteWorkspaces(context,store);
 return {manager,context,store,values,get writes(){return writes;},set fails(value){fails=value;}};
}
test('all sites is the safe backwards-compatible default',()=>{
 const f=fixture();assert.equal(f.manager.snapshot.mode,'all');assert.equal(f.manager.snapshot.active,null);
 assert.deepEqual(f.manager.visibleSites().map(x=>x.id),['alpha','beta','gamma']);
});
test('opening a saved site focuses it without changing saved profiles',async()=>{
 const f=fixture();await f.manager.open('beta');assert.deepEqual(f.manager.snapshot.open,['beta']);
 assert.equal(f.manager.snapshot.active,'beta');assert.equal(f.manager.snapshot.mode,'manager');
 assert.deepEqual(f.manager.visibleSites().map(x=>x.id),['beta']);assert.equal(f.store.all().length,3);
});
test('opening multiple sites preserves previous sessions while changing active focus',async()=>{
 const f=fixture();await f.manager.open('gamma');await f.manager.openMany(['beta','alpha']);
 assert.deepEqual(f.manager.snapshot.open,['gamma','beta','alpha']);assert.equal(f.manager.snapshot.active,'beta');
 await f.manager.setScope('open');assert.deepEqual(f.manager.visibleSites().map(x=>x.id),['alpha','beta','gamma']);
 await f.manager.focus('gamma');assert.deepEqual(f.manager.snapshot.open,['gamma','beta','alpha']);
 assert.equal(f.manager.snapshot.active,'gamma');
});
test('focus mode shows one site without closing the others',async()=>{
 const f=fixture();await f.manager.openMany(['alpha','beta']);await f.manager.setScope('active');
 assert.deepEqual(f.manager.visibleSites().map(s=>s.id),['alpha']);
 await f.manager.focus('beta');assert.deepEqual(f.manager.visibleSites().map(s=>s.id),['beta']);
 assert.deepEqual(f.manager.snapshot.open,['alpha','beta']);
});
test('switching to all mode retains open sites and selected focus',async()=>{
 const f=fixture();await f.manager.open('beta');await f.manager.setMode('all');
 assert.deepEqual(f.manager.visibleSites().map(x=>x.id),['alpha','beta','gamma']);
 await f.manager.setMode('manager');assert.deepEqual(f.manager.visibleSites().map(x=>x.id),['beta']);
});
test('closing a site only removes its open state, not saved credentials',async()=>{
 const f=fixture();await f.manager.openMany(['alpha','beta']);await f.manager.close('alpha');
 assert.deepEqual(f.manager.snapshot.open,['beta']);assert.equal(f.manager.snapshot.active,'beta');
 assert.equal(f.store.get('alpha').name,'Alpha');
});
test('closing an inactive site preserves active selection',async()=>{
 const f=fixture();await f.manager.openMany(['alpha','beta']);await f.manager.close('beta');
 assert.equal(f.manager.snapshot.active,'alpha');
});
test('closeOthers and closeAll do not touch profile records',async()=>{
 const f=fixture();await f.manager.openMany(['alpha','beta','gamma']);await f.manager.closeOthers('gamma');
 assert.deepEqual(f.manager.snapshot.open,['gamma']);await f.manager.closeAll();
 assert.equal(f.manager.snapshot.active,null);assert.equal(f.store.all().length,3);
});
test('favorites persist independently of whether a site is open',async()=>{
 const f=fixture();await f.manager.favorite('beta');assert.deepEqual(f.manager.snapshot.favorites,['beta']);
 assert.equal(f.manager.managerSites().find(x=>x.id==='beta').isFavorite,true);
 await f.manager.favorite('beta');assert.deepEqual(f.manager.snapshot.favorites,[]);
});
test('state survives reload and filters deleted sites',async()=>{
 const f=fixture();await f.manager.openMany(['beta','alpha']);await f.manager.favorite('gamma');
 const second=new SiteWorkspaces(f.context,f.store);assert.deepEqual(second.snapshot,f.manager.snapshot);
 const scrubbed=normalize({open:['alpha','deleted','beta','alpha'],favorites:['deleted','gamma'],active:'deleted',recent:['deleted','beta'],scope:'bad'},f.store.all());
 assert.deepEqual(scrubbed.open,['alpha','beta']);assert.equal(scrubbed.active,'alpha');
 assert.deepEqual(scrubbed.favorites,['gamma']);assert.equal(scrubbed.scope,'active');
});
test('rapid concurrent open calls serialize without losing updates',async()=>{
 const f=fixture();await Promise.all(['alpha','beta','gamma'].map(id=>f.manager.open(id)));
 assert.deepEqual(f.manager.snapshot.open,['alpha','beta','gamma']);assert.equal(f.manager.snapshot.active,'gamma');
 assert.equal(f.writes,3);
});
test('storage failure does not publish or persist a state mutation',async()=>{
 const f=fixture();f.fails=true;
 await assert.rejects(f.manager.open('alpha'),/storage offline/);
 assert.deepEqual(f.manager.snapshot.open,[]);assert.equal(f.writes,0);
 f.fails=false;await f.manager.open('alpha');assert.equal(f.manager.snapshot.active,'alpha');
});
test('unrecognized site ids and modes are rejected',async()=>{
 const f=fixture();await assert.rejects(f.manager.open('ghost'),/no longer exists/);
 await assert.rejects(f.manager.openMany(['alpha','ghost']),/no longer exists/);
 await assert.rejects(f.manager.setScope('everything'),/Invalid workspace scope/);
 await assert.rejects(f.manager.setMode('unknown'),/Invalid explorer mode/);
 assert.equal(f.writes,0);
});
test('change listeners update when state actually changes and can unsubscribe',async()=>{
 const f=fixture();const updates=[];const handle=f.manager.onChange(s=>updates.push(s));
 await f.manager.open('alpha');await f.manager.open('alpha');assert.equal(updates.length,1);
 handle.dispose();await f.manager.close('alpha');assert.equal(updates.length,1);
});
test('manager tree shows open and saved sites with distinct commands',async()=>{
 const f=fixture();await f.manager.open('beta');await f.manager.favorite('alpha');
 const vscode={EventEmitter:class{constructor(){this.event=()=>{};}fire(){}dispose(){}},
   TreeItem:class{constructor(label,state){this.label=label;this.collapsibleState=state;}},
   TreeItemCollapsibleState:{None:0},ThemeIcon:class{constructor(id){this.id=id;}}};
 const tree=new ManagerTree(vscode,f.manager);const entries=tree.getChildren();
 assert.deepEqual(entries.map(x=>x.id),['beta','alpha','gamma']);
 assert.equal(tree.getTreeItem(entries[0]).command.command,'sitedock.focusSite');
 assert.equal(tree.getTreeItem(entries[1]).command.command,'sitedock.openSite');
 assert.equal(tree.getTreeItem(entries[1]).iconPath.id,'star-full');tree.dispose();
});
test('existing explorer filters roots without changing child lookup behavior',async()=>{
 const f=fixture();const mock={EventEmitter:class{constructor(){this.event=()=>{};}fire(){}dispose(){}}};
 const tree=new SiteTree(mock,f.store,async()=>[],f.manager);
 assert.deepEqual((await tree.getChildren()).map(x=>x.id),['alpha','beta','gamma']);
 await f.manager.openMany(['beta','gamma']);
 assert.deepEqual((await tree.getChildren()).map(x=>x.id),['beta']);
 await f.manager.setScope('open');assert.deepEqual((await tree.getChildren()).map(x=>x.id),['beta','gamma']);
 await f.manager.setMode('all');assert.equal((await tree.getChildren()).length,3);
});
test('manager webview uses nonce CSP and no untrusted HTML injection',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../ui/manager.html'),'utf8');
 assert.match(text,/Content-Security-Policy/);assert.match(text,/script nonce="%%NONCE%%"/);
 assert.match(text,/textContent=site\.name/);assert.doesNotMatch(text,/innerHTML\s*=/);
});
test('manifest contributes all site-management controls',()=>{
 const manifest=require('../package.json');const list=new Set(manifest.contributes.commands.map(x=>x.command));
 for(const id of ['manager','openSite','closeSite','focusSite','switchSite','openMultiple','openSiteWindow','setViewMode','toggleFavorite','closeOthers','closeAllSites'])
   assert.ok(list.has('sitedock.'+id),id);
 assert.ok(manifest.contributes.views.sitedock.some(v=>v.id==='sitedock.managerSites'));
});
