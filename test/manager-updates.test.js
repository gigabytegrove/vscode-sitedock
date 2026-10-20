'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createManagerPanel}=require('../src/manager-panel');
const {createUpdater}=require('../src/updates');

function fakeManager(){
  let webviewHandler=null,updatesListener=null,changes=0;
  const posted=[];const handlers=[];
  const panel={webview:{cspSource:'vscode-resource:',html:'',postMessage:message=>{posted.push(message);return Promise.resolve(true);},onDidReceiveMessage:fn=>{webviewHandler=fn;return {dispose(){}};}},reveal(){},onDidDispose:fn=>({dispose(){}}),dispose(){}};
  const vscode={ViewColumn:{Active:1},window:{createWebviewPanel:()=>panel,showErrorMessage:m=>{throw new Error(m);}}};
  const context={extensionPath:path.resolve(__dirname,'..')};
  const workspaces={snapshot:{mode:'manager',scope:'active',open:[],active:null},managerSites:()=>[],onChange:fn=>({dispose(){}})};
  let installed=0,checks=0,settings=0,releases=0;
  let status={installedVersion:'0.3.1',phase:'idle',channel:'stable',repository:'gigabytegrove/sitedock-releases'};
  const actions={
    updateStatus:()=>status,
    onUpdateChange:fn=>{updatesListener=fn;return {dispose(){updatesListener=null;}};},
    checkUpdate:async()=>{checks++;status={...status,phase:'available',latestVersion:'0.3.2'};updatesListener?.();},
    installUpdate:async()=>{installed++;},
    updateSettings:async()=>{settings++;},
    viewReleases:async()=>{releases++;}
  };
  const manager=createManagerPanel(vscode,context,workspaces,{get:()=>undefined},actions);
  return {manager,panel,posted,dispatch:async x=>webviewHandler(x),totals:()=>({checks,installed,settings,releases}),changeStatus:x=>{status=x;updatesListener?.();}};
}

test('site manager shows the installed version and controls without requiring a selected site',async()=>{
  const ui=fakeManager();ui.manager.open();await ui.dispatch({type:'ready'});
  const first=ui.posted.at(-1);
  assert.equal(first.updates.installedVersion,'0.3.1');
  assert.equal(first.updates.channel,'stable');
  assert.equal(first.updates.repository,'gigabytegrove/sitedock-releases');
  await ui.dispatch({type:'checkUpdate'});
  assert.equal(ui.totals().checks,1);
  assert.equal(ui.posted.at(-1).updates.phase,'available');
  assert.equal(ui.posted.at(-1).updates.latestVersion,'0.3.2');
  await ui.dispatch({type:'installUpdate'});
  await ui.dispatch({type:'updateSettings'});
  await ui.dispatch({type:'viewReleases'});
  assert.deepEqual(ui.totals(),{checks:1,installed:1,settings:1,releases:1});
  ui.manager.dispose();
});

test('site manager publishes failed update checks to the view and keeps failures visible',async()=>{
  const ui=fakeManager();ui.manager.open();await ui.dispatch({type:'ready'});
  ui.changeStatus({installedVersion:'0.3.1',phase:'error',error:'GitHub returned HTTP 404 (private or unavailable)',channel:'stable',repository:'gigabytegrove/vscode-sitedock'});
  assert.equal(ui.posted.at(-1).updates.phase,'error');
  assert.match(ui.posted.at(-1).updates.error,/404/);
  ui.manager.dispose();
});

test('manager HTML has visible updater controls wired to safe webview messages',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','ui','manager.html'),'utf8');
  for(const id of ['updateInfo','updateState','checkUpdate','installUpdate','viewReleases','updateSettings']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/renderUpdates\(msg\.updates\)/);
  assert.match(html,/\.textContent=messages\[u\.phase\]/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/u\.phase==='available'/);
  assert.match(html,/nonce-%%NONCE%%/);
});
