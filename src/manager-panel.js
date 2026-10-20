'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');

function createManagerPanel(vscode,context,workspaces,store,actions){
  let panel=null;
  const subscriptions=[];
  const safeState=()=>({state:workspaces.snapshot,sites:workspaces.managerSites().map(s=>({
    id:s.id,name:s.name,host:s.host,port:s.port,protocol:s.protocol,root:s.root,
    isOpen:s.isOpen,isActive:s.isActive,isFavorite:s.isFavorite
  }))});
  function update(){if(panel)void panel.webview.postMessage({type:'state',...safeState()});}
  subscriptions.push(workspaces.onChange(update));
  async function handle(message){
    if(!message||typeof message!=='object'||typeof message.type!=='string')return;
    const commands=new Set(['open','focus','close','favorite','edit','test','window','openMany','closeOthers','mode','scope','add','closeAll']);
    if(!commands.has(message.type))return;
    if(message.type==='openMany'){
      if(!Array.isArray(message.ids)||message.ids.length>1000)throw new Error('Invalid multiple-site selection.');
      if(message.ids.some(x=>typeof x!=='string'||!store.get(x)))throw new Error('An included site no longer exists.');
      await actions.openMany(message.ids);return;
    }
    if(['mode','scope'].includes(message.type)){
      const allowed=message.type==='mode'?['all','manager']:['active','open'];
      if(!allowed.includes(message.value))throw new Error('Invalid view selection.');
      await actions[message.type](message.value);return;
    }
    if(message.type==='add'||message.type==='closeAll'){await actions[message.type]();return;}
    if(typeof message.id!=='string'||!store.get(message.id))throw new Error('The selected site no longer exists.');
    await actions[message.type](message.id);
  }
  function open(){
    if(panel){panel.reveal(vscode.ViewColumn.Active);update();return;}
    const nonce=randomBytes(16).toString('base64');
    panel=vscode.window.createWebviewPanel('sitedock.manager','SiteDock · Site Manager',vscode.ViewColumn.Active,{
      enableScripts:true,retainContextWhenHidden:true
    });
    const template=fs.readFileSync(path.join(context.extensionPath,'ui','manager.html'),'utf8');
    panel.webview.html=template.replaceAll('%%NONCE%%',nonce).replaceAll('%%CSP%%',panel.webview.cspSource);
    panel.webview.onDidReceiveMessage(async message=>{
      if(message?.type==='ready'){update();return;}
      try{await handle(message);update();}
      catch(err){const detail=err?.message||String(err);vscode.window.showErrorMessage(`SiteDock Manager: ${detail}`);
        void panel?.webview.postMessage({type:'error',detail});}
    },null,subscriptions);
    panel.onDidDispose(()=>{panel=null;});
    update();
  }
  return {open,update,dispose(){panel?.dispose();for(const subscription of subscriptions)subscription.dispose();}};
}
module.exports={createManagerPanel};
