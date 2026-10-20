'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const SITES_KEY='sitedock.sites.v1';
const WORK_KEY='sitedock.workspace.v1';

test('Site Manager commands integrate with native explorer and keep existing credentials',async()=>{
 const profile=[{id:'one',name:'Main Site',host:'main.example.invalid',protocol:'sftp',port:22,root:'/var/www',auth:'password',user:'tester'},
 {id:'two',name:'Stage Site',host:'stage.example.invalid',protocol:'sftp',port:22,root:'/var/www',auth:'password',user:'tester'}];
 const values=new Map([[SITES_KEY,profile]]);
 let deletedSecrets=0;
 const ctx={extension:{packageJSON:{version:'0.3.0'}},extensionPath:path.resolve(__dirname,'..'),globalStorageUri:{fsPath:'/tmp/sitedock-manager-tests'},subscriptions:[],
 globalState:{get:(key,fallback)=>values.has(key)?structuredClone(values.get(key)):fallback,update:async(key,value)=>values.set(key,structuredClone(value))},
 secrets:{get:async()=>undefined,store:async()=>{},delete:async()=>{deletedSecrets++;}}};
 const commands=new Map(),views=new Map(),disposable=()=>({dispose(){}}),ui=[];
 let backup=null,importData=null;
 const fake={
 EventEmitter:class{constructor(){this.event=()=>disposable();}fire(){}dispose(){}},
 TreeItem:class{constructor(label,collapsibleState){this.label=label;this.collapsibleState=collapsibleState;}},
 TreeItemCollapsibleState:{None:0,Collapsed:1},ThemeIcon:class{constructor(id){this.id=id;}},
 StatusBarAlignment:{Left:1},ViewColumn:{Active:1},ProgressLocation:{Notification:15},
 window:{
 createOutputChannel:()=>({append(){},appendLine(){},show(){},dispose(){}}),
 createTreeView:(id,options)=>{views.set(id,options.treeDataProvider);return {message:'',dispose(){}};},
 createStatusBarItem:()=>({text:'',show(){},hide(){},dispose(){}}),
 createWebviewPanel:()=>({webview:{cspSource:'vscode-resource:',html:'',postMessage:async()=>true,onDidReceiveMessage:disposable},onDidDispose:disposable,reveal(){},dispose(){}}),
 onDidChangeActiveTextEditor:disposable,activeTextEditor:null,
 showErrorMessage:message=>{throw new Error(message);},showInformationMessage:async()=>undefined,showQuickPick:async()=>undefined,
 showWarningMessage:async message=>String(message).startsWith('Export')?'Export Profiles':String(message).startsWith('Import')?'Import Profiles':undefined,
 showSaveDialog:async()=>({scheme:'file',path:'/safe/export.json'}),
 showOpenDialog:async opts=>opts.title.startsWith('Import')?[{scheme:'file',path:'/safe/import.json'}]:[{scheme:'file',path:'/safe/local.css'}]
 },
 workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback}),onDidChangeConfiguration:disposable,registerFileSystemProvider:disposable,onDidSaveTextDocument:disposable,
 fs:{writeFile:async(_uri,buf)=>{backup=buf;},stat:async()=>({size:importData?.byteLength||0}),readFile:async()=>importData}},
 Uri:{from:x=>x,file:x=>({scheme:'file',path:x,fsPath:x})},
 commands:{registerCommand:(name,handler)=>{commands.set(name,handler);return disposable();},executeCommand:async(...args)=>{ui.push(args);}},
 FileType:{File:1,Directory:2,SymbolicLink:64},FileChangeType:{Changed:1,Created:2,Deleted:3}
 };
 const original=Module._load;
 try{
   Module._load=function(name,parent,isMain){if(name==='vscode')return fake;return original.call(this,name,parent,isMain);};
   delete require.cache[require.resolve('../src/extension')];
   const extension=require('../src/extension');
   await extension.activate(ctx);
   assert.ok(commands.has('sitedock.manager'));assert.ok(views.has('sitedock.managerSites'));
   assert.deepEqual((await views.get('sitedock.sites').getChildren()).map(x=>x.id),['one','two']);
   await commands.get('sitedock.openSite')({id:'one'});
   assert.deepEqual(values.get(WORK_KEY).open,['one']);
   assert.deepEqual((await views.get('sitedock.sites').getChildren()).map(x=>x.id),['one']);
   await commands.get('sitedock.openSite')({id:'two'});
   assert.deepEqual(values.get(WORK_KEY).open,['one','two']);
   assert.equal(values.get(WORK_KEY).active,'two');
   await commands.get('sitedock.closeSite')({id:'two'});
   assert.deepEqual(values.get(WORK_KEY).open,['one']);
   assert.equal(values.get(WORK_KEY).active,'one');
   assert.equal(deletedSecrets,0);
   assert.equal(values.get(SITES_KEY).length,2);
   await commands.get('sitedock.setViewMode')(); // No pick => no change
   assert.ok(ui.some(x=>x[0]==='sitedock.sites.focus'));
   await commands.get('sitedock.compareLocal')({kind:'entry',id:'one',name:'style.css',path:'/style.css',type:'file'});
   const diff=ui.find(call=>call[0]==='vscode.diff');
   assert.ok(diff,'Compare with Local File must invoke VS Code diff');
   assert.equal(diff[1].path,'/safe/local.css');assert.equal(diff[2].scheme,'sitedock');
   assert.equal(diff[2].authority,'one');
   await commands.get('sitedock.exportSites')();
   assert.ok(backup instanceof Uint8Array);
   const exported=JSON.parse(backup.toString('utf8'));
   assert.equal(exported.sites.length,2);
   assert.equal(Object.hasOwn(exported.sites[0],'fingerprint'),false);
   importData=Buffer.from(JSON.stringify({...exported,sites:[{...exported.sites[0],host:'new.example.invalid'}]}));
   await commands.get('sitedock.importSites')();
   assert.equal(values.get(SITES_KEY).length,3);
   assert.equal(deletedSecrets,0,'import/export must not alter credentials');
   await extension.deactivate();
 }finally{Module._load=original;}
});
