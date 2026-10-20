'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');

test('activation registers commands without attempting a network library download',async()=>{
  const commands=new Map();
  const editorOpens=[];
  let progressCalls=0;
  let panelCalls=0;
  const noop=()=>({dispose(){}});
  const emitter=()=>({event:()=>noop(),fire(){},dispose(){}});
  const mock={
    EventEmitter:class{constructor(){Object.assign(this,emitter());}},
    StatusBarAlignment:{Left:1},
    ViewColumn:{Active:1},
    ProgressLocation:{Notification:15},
    window:{
      createTreeView:()=>({message:'',dispose(){}}),
      createOutputChannel:()=>({append(){},appendLine(){},show(){},dispose(){}}),
      createWebviewPanel:()=>{
        panelCalls++;
        return {
          webview:{cspSource:'vscode-resource:',html:'',onDidReceiveMessage:noop,postMessage:async()=>true},
          onDidDispose:noop,reveal(){},dispose(){}
        };
      },
      createStatusBarItem:()=>({hide(){},show(){},dispose(){}}),
      showErrorMessage:msg=>{throw new Error(msg);},
      showTextDocument:async(...args)=>{editorOpens.push(['showTextDocument',...args]);},
      onDidChangeActiveTextEditor:noop,
      withProgress:async(_opts,action)=>{progressCalls++;return action();},
      activeTextEditor:null
    },
    workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback}),onDidChangeConfiguration:noop,registerFileSystemProvider:noop,onDidSaveTextDocument:noop,openTextDocument:async u=>({uri:u})},
    Uri:{from:x=>x,file:x=>({scheme:'file',fsPath:x,path:x})},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return noop();},executeCommand:async(...args)=>{editorOpens.push(args);}},
    FileType:{Directory:2,File:1,SymbolicLink:64},
    FileChangeType:{Changed:1,Created:2,Deleted:3},
    FileSystemError:{FileNotFound:()=>new Error('not found')}
  };
  const extensionPath=path.resolve(__dirname,'..');
  const ctx={extension:{packageJSON:{version:'0.3.0'}},extensionPath,globalStorageUri:{fsPath:path.join(extensionPath,'.test-global-storage')},subscriptions:[],globalState:{get:()=>[],update:async()=>{}},secrets:{get:async()=>undefined,store:async()=>{},delete:async()=>{}}};
  const original=Module._load;
  let extension;
  try{
    Module._load=function(specifier,parent,isMain){if(specifier==='vscode')return mock;return original.call(this,specifier,parent,isMain);};
    delete require.cache[require.resolve('../src/extension')];
    extension=require('../src/extension');
  } finally {Module._load=original;}
  try{
    await extension.activate(ctx);
    for(const id of ['sitedock.add','sitedock.edit','sitedock.test','sitedock.open','sitedock.refresh','sitedock.diagnostics','sitedock.installLibraries']) {
      assert.equal(typeof commands.get(id),'function',id);
    }
    assert.equal(progressCalls,0,'npm libraries must not download on activation');
    await commands.get('sitedock.refresh')();
    await commands.get('sitedock.add')();
    assert.equal(panelCalls,1,'Add Server should open its connection form');
    assert.equal(progressCalls,0);
    assert.equal(typeof commands.get('sitedock.openAsText'),'function');
    assert.equal(typeof commands.get('sitedock.openExternal'),'function');
    await commands.get('sitedock.open')({kind:'entry',type:'file',name:'preview.png',path:'/preview.png',id:'server-id'});
    assert.equal(editorOpens[0][0],'vscode.openWith');
    assert.equal(editorOpens[0][2],'imagePreview.previewEditor');
    assert.equal(editorOpens[0][1].scheme,'sitedock');
    await commands.get('sitedock.open')({kind:'entry',type:'file',name:'index.php',path:'/index.php',id:'server-id'});
    assert.equal(editorOpens[1][0],'vscode.open');
    await commands.get('sitedock.openAsText')({kind:'entry',type:'file',name:'icon.svg',path:'/icon.svg',id:'server-id'});
    assert.equal(editorOpens[2][0],'showTextDocument');
    assert.equal(editorOpens[2][1].uri.path,'/icon.svg');
    assert.equal(progressCalls,0);
  }finally{await extension.deactivate();}
});
