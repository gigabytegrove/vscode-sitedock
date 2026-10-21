'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const {SiteTree}=require('../src/tree');
const {SiteWorkspaces}=require('../src/workspaces');

class EventEmitter{
 constructor(){this.listeners=[];this.event=handler=>{this.listeners.push(handler);return {dispose(){}};};}
 fire(value){for(const fn of this.listeners)fn(value);}
 dispose(){this.listeners=[];}
}
class TreeItem{constructor(label,state){this.label=label;this.collapsibleState=state;}}
class ThemeIcon{constructor(id){this.id=id;}}
const tv={EventEmitter,TreeItem,ThemeIcon,TreeItemCollapsibleState:{None:0,Collapsed:1},Uri:{from:x=>x}};
const newSite={id:'new',name:'GG Test',host:'mail.example.test',root:'/',protocol:'sftp',port:22,auth:'password',user:'user'};
function fixture(){
 const sites=[newSite,{...newSite,id:'old',name:'Gigabyte Grove'}];
 const state=new Map([['sitedock.workspace.v1',{mode:'manager',scope:'open',open:['old'],active:'old'}]]);
 const context={globalState:{get:(k,d)=>state.get(k)??d,update:async(k,v)=>state.set(k,v)}};
 const store={all:()=>sites.slice(),get:id=>sites.find(s=>s.id===id)};
 const workspaces=new SiteWorkspaces(context,store);
 const tree=new SiteTree(tv,store,async()=>[],workspaces);
 return {sites,state,store,tree,workspaces};
}
test('deleted connection disappears from My Servers roots',async()=>{
 const f=fixture(),[old]=await f.tree.getChildren();
 const previous=f.tree.getTreeItem(old).id;
 let fired=0;f.tree.onDidChangeTreeData(()=>fired++);
 f.sites.splice(f.sites.findIndex(s=>s.id==='old'),1);
 await f.workspaces.sync();f.tree.reset();
 assert.deepEqual(await f.tree.getChildren(),[]);
 assert.notEqual(f.tree.getTreeItem(old).id,previous);
 assert.match(f.tree.getTreeItem(old).description,/no longer saved/);
 assert.ok(fired>0);f.tree.dispose();
});
test('cached file from deleted server is never offered as a live remote editor',async()=>{
 const f=fixture(),node={kind:'entry',id:'old',name:'index.php',path:'/web/index.php',type:'file'};
 assert.equal(f.tree.getTreeItem(node).command.command,'sitedock.open');
 f.sites.splice(f.sites.findIndex(s=>s.id==='old'),1);
 const stale=f.tree.getTreeItem(node);
 assert.match(stale.label,/Outdated file entry/);
 assert.equal(stale.command.command,'sitedock.refresh');
 assert.equal(stale.resourceUri,undefined);
 assert.deepEqual(await f.tree.getChildren(node),[]);
 f.tree.dispose();
});
test('ordinary file refresh preserves stable tree identity',()=>{
 const f=fixture(),node={kind:'site',id:'new'};
 const original=f.tree.getTreeItem(node).id;
 f.tree.refresh();assert.equal(f.tree.getTreeItem(node).id,original);
 f.tree.reset();assert.notEqual(f.tree.getTreeItem(node).id,original);f.tree.dispose();
});
test('obsolete Remove Server and Open File actions do not touch surviving site',async()=>{
 const values=new Map([['sitedock.sites.v1',[newSite]],['sitedock.workspace.v1',{mode:'manager',scope:'open',open:[],active:null}]]);
 const disposable=()=>({dispose(){}}),commands=new Map(),views=new Map(),notices=[],errors=[],serverViews=[];
 let deletes=0,opens=0;
 const ctx={extension:{packageJSON:{version:'0.7.0'}},extensionPath:path.resolve(__dirname,'..'),globalStorageUri:{fsPath:'/tmp/sitedock-stale-test'},subscriptions:[],
  globalState:{get:(k,d)=>values.has(k)?structuredClone(values.get(k)):d,update:async(k,v)=>values.set(k,structuredClone(v))},
  secrets:{get:async()=>undefined,store:async()=>{},delete:async()=>{deletes++;}}};
 const fake={...tv,StatusBarAlignment:{Left:1},ViewColumn:{Active:1},ProgressLocation:{Notification:15},
  FileType:{File:1,Directory:2,SymbolicLink:64},FileChangeType:{Changed:1,Created:2,Deleted:3},
  window:{createOutputChannel:()=>({append(){},appendLine(){},show(){},dispose(){}}),
   createTreeView:(id,o)=>{views.set(id,o.treeDataProvider);const view={message:'',disposed:false,dispose(){this.disposed=true;}};if(id==='sitedock.sites')serverViews.push(view);return view;},
   createStatusBarItem:()=>({text:'',show(){},hide(){},dispose(){}}),
   createWebviewPanel:()=>({webview:{cspSource:'vscode-resource:',html:'',postMessage:async()=>true,onDidReceiveMessage:disposable},onDidDispose:disposable,reveal(){},dispose(){}}),
   onDidChangeActiveTextEditor:disposable,activeTextEditor:null,
   showErrorMessage:s=>errors.push(s),showInformationMessage:async s=>{notices.push(s);},
   showQuickPick:async()=>undefined,showWarningMessage:async()=>undefined,showSaveDialog:async()=>undefined,showOpenDialog:async()=>undefined},
  workspace:{getConfiguration:()=>({get:(_k,d)=>d}),onDidChangeConfiguration:disposable,onDidSaveTextDocument:disposable,registerFileSystemProvider:disposable,
   fs:{stat:async()=>({size:100}),readFile:async()=>Buffer.from('hi')}},
  Uri:{from:x=>x,file:p=>({scheme:'file',path:p,fsPath:p})},
  commands:{registerCommand:(name,cb)=>{commands.set(name,cb);return disposable();},executeCommand:async(cmd)=>{if(cmd==='vscode.open')opens++;}}};
 const original=Module._load;
 try{
  Module._load=function(name,parent,isMain){
   if(name==='vscode')return fake;
   return original.call(this,name,parent,isMain);
  };
  delete require.cache[require.resolve('../src/extension')];
  const ext=require('../src/extension');await ext.activate(ctx);
  assert.deepEqual(await views.get('sitedock.sites').getChildren(),[]);
  await commands.get('sitedock.remove')({kind:'site',id:'old'});
  assert.equal(serverViews.length,2,'stale connection removal must remount the My Servers view');
  assert.equal(serverViews[0].disposed,true,'previous TreeView must be disposed, not merely refreshed');
  assert.equal(serverViews[1].disposed,false);
  assert.deepEqual(await views.get('sitedock.sites').getChildren(),[]);
  assert.equal(values.get('sitedock.sites.v1').length,1);
  assert.equal(deletes,0);
  assert.match(notices.at(-1),/already removed/);
  await commands.get('sitedock.open')({kind:'entry',id:'old',name:'index.php',path:'/web/index.php',type:'file'});
  assert.match(errors.at(-1),/connection that is no longer saved/);
  assert.equal(serverViews.length,3,'attempted stale file open also remounts the explorer');
  assert.equal(serverViews[1].disposed,true);
  assert.equal(opens,0);
  await ext.deactivate();
 }finally{Module._load=original;}
});

test('a forced My Servers refresh remounts its view without altering profiles',async()=>{
 const f=fixture(),prior=f.sites.map(s=>({...s}));
 let refreshEvents=0;f.tree.onDidChangeTreeData(()=>refreshEvents++);
 f.tree.reset();assert.equal(refreshEvents,1);
 assert.deepEqual(f.sites,prior);
 f.tree.dispose();
});
