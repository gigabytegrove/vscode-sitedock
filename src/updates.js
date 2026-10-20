'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const {chooseRelease,parseChecksum}=require('./update-utils');
const network=require('./update-network');
const {sha256,validateVSIX}=require('./update-vsix');

const DEFAULT_REPOSITORY='gigabytegrove/vscode-sitedock';
const CHECK_INTERVAL_MINUTES=60;

/** No server, agent, service or background process: timers only run in the VS Code extension host. */
function createUpdater(vscode,context,channel,{api=network,checksum=sha256,validate=validateVSIX,now=()=>Date.now(),timer=setInterval,startTimer=setTimeout}={}){
  let checking=null,installing=false,disposed=false,periodic=null,initial=null,lastNotice='';
  let selectedRelease=null;
  const observers=new Set();
  let updateState={phase:'idle',latestVersion:null,releaseUrl:null,error:null,lastCheckedAt:null};
  function status(){
    const opts=settings();
    return {...updateState,installedVersion:context.extension.packageJSON.version,
      repository:opts.repository,channel:opts.channel,enabled:opts.enabled,autoInstall:opts.autoInstall};
  }
  function report(phase,changes={}){
    updateState={...updateState,...changes,phase};
    const snapshot=status();
    for(const observer of [...observers]){
      try{observer(snapshot);}catch(err){log(`Update status listener failed: ${err.message}`);}
    }
  }
  function onStatusChange(listener){
    if(typeof listener!=='function')throw new TypeError('Listener must be a function.');
    observers.add(listener);return {dispose(){observers.delete(listener);}};
  }

  const config=()=>vscode.workspace.getConfiguration('sitedock.updates');
  const settings=()=>({
    enabled:config().get('enabled',true),channel:config().get('channel','stable'),
    repository:config().get('repository',DEFAULT_REPOSITORY),
    intervalHours:Math.min(168,Math.max(1,Number(config().get('checkIntervalHours',12))||12)),
    autoInstall:config().get('autoInstall',false)
  });
  const log=message=>channel.appendLine(`[updates] ${message}`);
  async function check({manual=false,prompt=true}={}){
    if(disposed)throw new Error('SiteDock updater has been disposed.');
    if(checking)return checking;
    checking=(async()=>{
      const opts=settings();
      if(!manual&&!opts.enabled)return null;
      if(!manual){
        const previous=context.globalState.get('sitedock.updates.lastCheck',null);
        if(previous?.repository===opts.repository&&previous?.channel===opts.channel&&now()-previous.at<Math.max(CHECK_INTERVAL_MINUTES,opts.intervalHours*60)*60000)return null;
      }
      report('checking',{error:null});
      let selected;
      try{
        const releases=await api.listReleases(opts.repository);
        selected=chooseRelease(releases,{currentVersion:context.extension.packageJSON.version,channel:opts.channel,repository:opts.repository});
        await context.globalState.update('sitedock.updates.lastCheck',{at:now(),repository:opts.repository,channel:opts.channel});
        selectedRelease=selected;
        report(selected?'available':'current',{lastCheckedAt:now(),latestVersion:selected?.version||null,
          releaseUrl:selected?.releaseUrl||null,error:null});
      }catch(err){
        selectedRelease=null;
        report('error',{error:err.message,latestVersion:null,releaseUrl:null});
        log(`Update check failed: ${err.message}`);if(manual)throw err;return null;
      }
      if(!selected){if(manual&&prompt)void vscode.window.showInformationMessage('SiteDock is up to date for the selected release channel.');return null;}
      if(manual&&!prompt)return selected;
      if(!manual&&lastNotice===selected.version)return selected;
      lastNotice=selected.version;
      if(opts.autoInstall&&!manual){
        try{await install(selected);}
        catch(err){log(`Automatic installation failed: ${err.message}`);void vscode.window.showWarningMessage(`SiteDock update ${selected.version} could not be installed: ${err.message}`);}
        return selected;
      }
      const choice=await vscode.window.showInformationMessage(`SiteDock ${selected.version}${selected.prerelease?' (beta)':''} is available on GitHub. Installed: ${context.extension.packageJSON.version}.`,'Install Update','Release Notes','Later');
      if(choice==='Install Update')await install(selected);
      else if(choice==='Release Notes')await vscode.env.openExternal(vscode.Uri.parse(selected.releaseUrl));
      return selected;
    })().finally(()=>{checking=null;});
    return checking;
  }
  async function installAvailable(){
    if(!selectedRelease)throw new Error('No verified update is available. Use Check for Updates first.');
    return install(selectedRelease);
  }
  async function install(selected){
    if(installing)throw new Error('An update installation is already in progress.');
    installing=true;
    report('installing',{error:null});
    let dir;
    try{
      const repository=settings().repository;
      const root=context.globalStorageUri?.fsPath;
      if(!root)throw new Error('VS Code global storage is unavailable.');
      await fs.mkdir(root,{recursive:true,mode:0o700});
      dir=await fs.mkdtemp(path.join(root,'sitedock-update-'));
      const location=path.join(dir,'update.vsix');
      const expected=selected.digest||await (async()=>{
        if(!selected.checksum)throw new Error('Release has no checksum; installation refused.');
        const expectedUrl=`https://github.com/${repository}/releases/download/${encodeURIComponent(selected.tag)}/${encodeURIComponent(selected.name)}.sha256`;
        if(selected.checksum.browser_download_url!==expectedUrl)throw new Error('Unexpected checksum URL.');
        return parseChecksum(await api.readChecksum(expectedUrl),selected.name);
      })();
      const reported=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:`SiteDock: Downloading ${selected.version}`,cancellable:false},async()=>{
        await api.downloadFile(selected.asset.browser_download_url,location);
        const actual=await checksum(location);
        if(actual.toLowerCase()!==expected.toLowerCase())throw new Error('SHA-256 mismatch: downloaded update was not installed.');
        await validate(location,{version:selected.version,publisher:'GigabyteGrove',name:'sitedock'});
        log(`Verified GitHub VSIX ${selected.version}; SHA-256 ${actual}.`);
        return vscode.commands.executeCommand('workbench.extensions.installExtension',vscode.Uri.file(location));
      });
      log(`Installed SiteDock ${selected.version} through VS Code. ${reported?'Installation command returned a result.':''}`);
      selectedRelease=null;
      report('installed',{latestVersion:selected.version,releaseUrl:selected.releaseUrl,error:null});
      const choice=await vscode.window.showInformationMessage(`SiteDock ${selected.version} installed. Reload VS Code to activate the new version.`,'Reload Window','Later');
      if(choice==='Reload Window')await vscode.commands.executeCommand('workbench.action.reloadWindow');
      return true;
    }catch(err){
      report('error',{error:err.message});
      throw err;
    }finally{
      installing=false;
      // VS Code's install command finishes before removal; no existing extension data is touched.
      if(dir)await fs.rm(dir,{recursive:true,force:true}).catch(err=>log(`Could not remove temporary VSIX: ${err.message}`));
    }
  }
  function resetSchedule(){
    if(initial)clearTimeout(initial);if(periodic)clearInterval(periodic);
    initial=null;periodic=null;
    if(disposed||!settings().enabled)return;
    initial=startTimer(()=>{initial=null;void check().catch(err=>log(err.message));},9000);
    // Poll only inside the live VS Code extension host, with a bounded minimum.
    periodic=timer(()=>{void check().catch(err=>log(err.message));},60*60*1000);
    initial.unref?.();periodic.unref?.();
  }
  function onSettingsChanged(event){
    if(event?.affectsConfiguration('sitedock.updates')){
      lastNotice='';selectedRelease=null;
      report('idle',{latestVersion:null,releaseUrl:null,error:null,lastCheckedAt:null});
      resetSchedule();
    }
  }
  const changes=vscode.workspace.onDidChangeConfiguration(onSettingsChanged);
  const instance={check,install,installAvailable,status,onStatusChange,resetSchedule,
    dispose(){disposed=true;observers.clear();clearTimeout(initial);clearInterval(periodic);changes.dispose();}};
  resetSchedule();
  return instance;
}
module.exports={createUpdater,DEFAULT_REPOSITORY};
