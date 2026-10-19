'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {validateSite}=require('./storage');
const {HostKeyError}=require('./connection');

function createSiteEditor(vscode,context,store,io,changed) {
  const panels=new Map();
  const askHostKey=async(err,siteName)=>{
    const isChanged=Boolean(err.previous);
    const choice=await vscode.window.showWarningMessage(
      `${siteName}: ${isChanged?'SSH host key changed! Verify this fingerprint independently before continuing.':'SSH host key needs approval. Verify the fingerprint with your server administrator.'}\nSHA-256 (hex): ${err.fingerprint}`,
      {modal:true,detail:isChanged?`Previous SHA-256 (hex): ${err.previous}\nIf you did not expect the change, cancel and investigate.`:'This is the server identity, not a password.'},
      isChanged?'Trust Changed Key':'Trust This Key','Cancel');
    return choice==='Trust Changed Key' || choice==='Trust This Key' ? err.fingerprint:null;
  };
  async function handleHostKey(siteId,err) {
    if (!(err instanceof HostKeyError)) throw err;
    const site=store.get(siteId);
    const fingerprint=await askHostKey(err,site?.name || 'Server');
    if (!fingerprint) throw new Error('SSH host key not trusted; connection cancelled.');
    await store.trustKey(siteId,fingerprint);
    await io.invalidate(siteId);
  }
  async function perform(siteId,method,...args) {
    try {return await io.run(siteId,method,...args);}
    catch(err) {
      if (!(err instanceof HostKeyError)) throw err;
      await handleHostKey(siteId,err);
      return io.run(siteId,method,...args);
    }
  }
  function open(siteId) {
    const panelId=siteId || 'new';
    if(panels.has(panelId)){panels.get(panelId).reveal();return;}
    const old=siteId?store.get(siteId):null;
    if(siteId && !old) {vscode.window.showErrorMessage('That server was removed.');return;}
    const panel=vscode.window.createWebviewPanel('sitedock.editor',old?`Edit ${old.name}`:'Add a server',vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true});
    panels.set(panelId,panel);
    let lastTestedIdentity='';
    const nonce=randomBytes(20).toString('hex');
    const source=fs.readFileSync(path.join(context.extensionPath,'ui','editor.html'),'utf8');
    panel.webview.html=source.replaceAll('%%NONCE%%',nonce).replaceAll('%%CSP%%',panel.webview.cspSource);
    const send=message=>panel.webview.postMessage(message);
    panel.onDidDispose(()=>panels.delete(panelId));
    panel.webview.onDidReceiveMessage(async msg=>{
      if(!msg || !['ready','test','diagnose','save','chooseKey','remove'].includes(msg.type)) return;
      if(msg.type==='ready') {send({type:'init',site:old||null,editing:Boolean(old)});return;}
      if(msg.type==='chooseKey') {
        const selected=await vscode.window.showOpenDialog({canSelectFiles:true,canSelectFolders:false,canSelectMany:false,title:'Choose an SSH private key'});
        if(selected?.length) send({type:'key',path:selected[0].fsPath});
        return;
      }
      if(msg.type==='remove') {
        if(!old) return;
        const agree=await vscode.window.showWarningMessage(`Remove ${old.name} from SiteDock?`,{modal:true,detail:'No remote files will be deleted.'},'Remove Server');
        if(agree==='Remove Server') {await io.invalidate(old.id);await store.remove(old.id);changed();panel.dispose();}
        return;
      }
      try {
        const draft={...msg.site,id:old?.id};
        let site=validateSite(draft,old?.id);
        if(old && (site.host!==old.host || site.port!==old.port)) site.fingerprint='';
        const creds={password:msg.password||'',passphrase:msg.passphrase||''};
        if(msg.type==='diagnose') {
          if(site.protocol!=='sftp') throw new Error('Authentication diagnostics are only available for SFTP.');
          let report;
          try {report=await io.probe(site);}
          catch(err) {
            if (!(err instanceof HostKeyError)) throw err;
            const fp=await askHostKey(err,site.name);
            if (!fp) {send({type:'result',action:'diagnose',ok:false,error:'SSH host key was not trusted.'});return;}
            site={...site,fingerprint:fp};
            report=await io.probe(site);
          }
          const listed=report.methods.length?report.methods.join(', '):'none reported';
          const summary=report.acceptedNone
            ? 'The server accepted unauthenticated SSH access. Verify your server configuration.'
            : `SSH advertised authentication methods for ${site.user}: ${listed}. This list does not guarantee login is permitted for the account. No saved password or private key was sent.`;
          send({type:'result',action:'diagnose',ok:true,details:summary,fingerprint:site.fingerprint});
          return;
        }
        if(msg.type==='test') {
          try{await io.test(site,creds);}
          catch(err) {
            if(!(err instanceof HostKeyError)) throw err;
            const fp=await askHostKey(err,site.name);
            if(!fp){send({type:'result',action:'test',ok:false,error:'SSH host key not trusted.'});return;}
            site={...site,fingerprint:fp};
            await io.test(site,creds);
          }
          lastTestedIdentity=`${site.host}:${site.port}:${site.protocol}:${site.fingerprint}`;
          send({type:'result',action:'test',ok:true,fingerprint:site.fingerprint});
          return;
        }
        if(msg.type==='save') {
          site=await store.save(site,creds,{verifiedForNewHost:lastTestedIdentity===`${site.host}:${site.port}:${site.protocol}:${site.fingerprint}`});
          await io.invalidate(site.id);
          changed();send({type:'result',action:'save',ok:true});
          vscode.window.showInformationMessage(`Server “${site.name}” saved. Expand it in the SiteDock sidebar to browse files.`);
          panel.dispose();
        }
      } catch(err) {send({type:'result',action:msg.type,ok:false,error:err.message || 'Operation failed.'});}
    });
  }
  return {open,perform,handleHostKey,dispose:()=>{for(const p of panels.values())p.dispose();}};
}
module.exports={createSiteEditor};
