'use strict';
const vscode=require('vscode');
const posix=require('node:path').posix;
const {SiteStore}=require('./storage');
const {SiteIO}=require('./connection');
const {createSiteEditor}=require('./editor');
const {makeFilesystem}=require('./filesystem');
const {SiteTree}=require('./tree');
const {SiteWorkspaces}=require('./workspaces');
const {ManagerTree}=require('./manager-tree');
const {createManagerPanel}=require('./manager-panel');
const {ActivityQueue,ActivityTree}=require('./activity');
const {remotePath}=require('./paths');
const {planUploadFolder,planDownloadFolder}=require('./bulk');
const {validName,safeChildPath}=require('./paths');
const {ensureRuntime,diagnostics}=require('./runtime');
const manifest=require('../package.json');
const {openRemoteFile,openInDesktopApp}=require('./opening');
const {createUpdater}=require('./updates');

let disposeIO;
function uriFor(node) {return vscode.Uri.from({scheme:'sitedock',authority:node.id,path:node.kind==='site'?'/':node.path});}
function parentUri(node) {return uriFor(node).with({path:node.kind==='site'?'/':node.type==='directory'?node.path:posix.dirname(node.path)});}
function errorMessage(err){return err?.message || String(err);}

async function activate(context) {
  // Register the sidebar and every command immediately. Network access must never
  // prevent users from opening the server manager or changing saved connections.
  let ready;
  const channel=vscode.window.createOutputChannel('SiteDock');
  context.subscriptions.push(channel);
  const runtimeLocation=context.globalStorageUri?.fsPath || require('node:path').join(context.extensionPath,'runtime-storage');
  const prepareConnections=()=>{
    if (!ready) {
      ready=vscode.window.withProgress({
        location:vscode.ProgressLocation.Notification,
        title:'SiteDock: Preparing connection libraries',
        cancellable:false
      },()=>ensureRuntime(runtimeLocation,{log:message=>channel.append(message)})).catch(err=>{
        ready=undefined; // permit retry after proxy/network errors
        channel.show(true);
        throw new Error(`Unable to prepare connection libraries. ${errorMessage(err)}`);
      });
    }
    return ready;
  };
  const activity=new ActivityQueue(context,vscode);
  const store=new SiteStore(context);
  const workspaces=new SiteWorkspaces(context,store);
  const io=new SiteIO(store,prepareConnections);disposeIO=()=>io.dispose();
  let tree,explorer,managerPanel;
  const managerTree=new ManagerTree(vscode,workspaces);
  const managerView=vscode.window.createTreeView('sitedock.managerSites',{treeDataProvider:managerTree});
  const refreshViews=()=>{tree?.refresh();managerTree.refresh();managerPanel?.update();};
  const changed=()=>{refreshViews();void workspaces.sync().catch(err=>channel.appendLine('SiteDock workspace sync: '+errorMessage(err)));};
  const editor=createSiteEditor(vscode,context,store,io,changed);
  const doRemote=(siteId,op,...args)=>editor.perform(siteId,op,...args);
  tree=new SiteTree(vscode,store,doRemote,workspaces);
  const filesystem=makeFilesystem(vscode,store,io,doRemote,activity);
  explorer=vscode.window.createTreeView('sitedock.sites',{treeDataProvider:tree,showCollapseAll:true});
  const activityTree=new ActivityTree(vscode,activity);
  const transfers=vscode.window.createTreeView('sitedock.activity',{treeDataProvider:activityTree});
  transfers.message='Recent transfers and remote edits. Click an item for details.';
  const updateExplorerMessage=()=>{
    const state=workspaces.snapshot;
    explorer.message=!store.all().length?'No saved servers. Open Site Manager to add one.':
      state.mode==='manager'&&!state.open.length?'No open sites. Choose a server in Site Manager.':
      state.mode==='manager'&&state.scope==='active'?`Showing active site. ${state.open.length} open · Switch Site to change.`:'';
    managerView.message=!store.all().length?'No saved sites yet. Use Site Manager to add your first server.':'';
  };
  updateExplorerMessage();
  const status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,60);
  status.command='sitedock.refresh';
  const updateStatus=()=>{
    const uri=vscode.window.activeTextEditor?.document.uri;
    if(uri?.scheme==='sitedock'){
      const site=store.get(uri.authority);
      status.text=`$(cloud) ${site?.name || 'Remote file'}`;
      status.tooltip=`Live server editing · ${uri.path}\nCtrl+S uploads this file to the server.`;
      status.show();
    }else status.hide();
  };
  const workspaceStatus=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,61);
  workspaceStatus.command='sitedock.switchSite';
  const updateWorkspaceStatus=()=>{
    const state=workspaces.snapshot;const current=store.get(state.active);
    workspaceStatus.text=state.mode==='all'?'$(server) SiteDock: All Sites':`$(folder-active) ${current?.name||'SiteDock: No Active Site'}`;
    workspaceStatus.tooltip=`SiteDock ${state.mode==='all'?'All Sites':'Site Manager'} · ${state.open.length} open · Click to switch`;
    workspaceStatus.show();updateExplorerMessage();
  };
  context.subscriptions.push(workspaces.onChange(()=>{refreshViews();updateWorkspaceStatus();}),workspaceStatus);
  updateWorkspaceStatus();
  const activityStatus=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,59);
  activityStatus.command='sitedock.showActivity';
  function updateActivityStatus(){
    const active=activity.busy;
    const failed=activity.all.filter(x=>x.status==='failed').length;
    activityStatus.text=active?`$(sync~spin) SiteDock ${active} active`:failed?`$(warning) SiteDock ${failed} failed`:'$(history) SiteDock Activity';
    transfers.badge=active?{value:Math.min(99,active),tooltip:`${active} queued or running transfer(s)`}:undefined;
    activityStatus.tooltip='Open SiteDock transfer and activity queue';
    activityStatus.show();
  }
  context.subscriptions.push(activity.onDidChange(updateActivityStatus),activityStatus);
  updateActivityStatus();
  const command=(name,action)=>context.subscriptions.push(vscode.commands.registerCommand(name,async(...args)=>{
    try {await action(...args);}catch(err){vscode.window.showErrorMessage(`SiteDock: ${errorMessage(err)}`);}
  }));
  const updater=createUpdater(vscode,context,channel);
  context.subscriptions.push(updater);
  command('sitedock.checkUpdates',()=>updater.check({manual:true}));
  command('sitedock.updateSettings',()=>vscode.commands.executeCommand('workbench.action.openSettings','sitedock.updates'));
  command('sitedock.viewReleases',()=>{
    const repository=vscode.workspace.getConfiguration('sitedock.updates').get('repository','gigabytegrove/vscode-sitedock');
    const {releaseRepository}=require('./update-utils');
    return vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${releaseRepository(repository)}/releases`));
  });
  const refresh=()=>{tree.refresh();managerTree.refresh();managerPanel?.update();};
  function siteId(node){return typeof node==='string'?node:node?.id;}
  async function getSelected(node){const id=siteId(node);return id?store.get(id):chooseSite();}
  async function openSite(id){if(!store.get(id))throw new Error('Site no longer exists.');await workspaces.open(id);await vscode.commands.executeCommand('sitedock.sites.focus');}
  async function openWindow(id){
    const site=store.get(id);if(!site)throw new Error('Site no longer exists.');
    const choice=await vscode.window.showInformationMessage(`Open “${site.name}” in a new VS Code window?`,{modal:true},'Open Workspace');
    if(choice==='Open Workspace')await vscode.commands.executeCommand('vscode.openFolder',vscode.Uri.from({scheme:'sitedock',authority:site.id,path:'/'}),{forceNewWindow:true});
  }
  managerPanel=createManagerPanel(vscode,context,workspaces,store,{
    add:()=>editor.open(),edit:id=>editor.open(id),open:openSite,focus:openSite,
    close:id=>workspaces.close(id),favorite:id=>workspaces.favorite(id),
    test:async id=>vscode.commands.executeCommand('sitedock.test',{id}),
    window:openWindow,openMany:async ids=>{await workspaces.openMany(ids);await vscode.commands.executeCommand('sitedock.sites.focus');},
    closeOthers:id=>workspaces.closeOthers(id),closeAll:()=>workspaces.closeAll(),
    mode:value=>workspaces.setMode(value),scope:value=>workspaces.setScope(value),
    updateStatus:()=>updater.status(),onUpdateChange:listener=>updater.onStatusChange(listener),
    checkUpdate:()=>updater.check({manual:true,prompt:false}),
    installUpdate:()=>updater.installAvailable(),
    updateSettings:()=>vscode.commands.executeCommand('workbench.action.openSettings','sitedock.updates'),
    viewReleases:()=>vscode.commands.executeCommand('sitedock.viewReleases')
  });
  command('sitedock.manager',()=>managerPanel.open());
  command('sitedock.openSite',async node=>{const site=await getSelected(node);if(site)await openSite(site.id);});
  command('sitedock.focusSite',async node=>{const site=await getSelected(node);if(site)await openSite(site.id);});
  command('sitedock.closeSite',async node=>{const site=await getSelected(node);if(site)await workspaces.close(site.id);});
  command('sitedock.closeOthers',async node=>{const site=await getSelected(node);if(site)await workspaces.closeOthers(site.id);});
  command('sitedock.closeAllSites',()=>workspaces.closeAll());
  command('sitedock.toggleFavorite',async node=>{const site=await getSelected(node);if(site)await workspaces.favorite(site.id);});
  command('sitedock.openSiteWindow',async node=>{const site=await getSelected(node);if(site)await openWindow(site.id);});
  command('sitedock.switchSite',async()=>{
    const opened=workspaces.snapshot.open.map(id=>store.get(id)).filter(Boolean);
    if(!opened.length){managerPanel.open();return;}
    const choice=await vscode.window.showQuickPick(opened.map(s=>({label:s.name,description:`${s.protocol.toUpperCase()} · ${s.host}`,site:s})),{placeHolder:'Choose an open SiteDock site'});
    if(choice)await openSite(choice.site.id);
  });
  command('sitedock.openMultiple',async()=>{
    const sites=store.all();if(!sites.length){managerPanel.open();return;}
    const selected=await vscode.window.showQuickPick(sites.map(s=>({label:s.name,description:`${s.protocol.toUpperCase()} · ${s.host}`,picked:workspaces.snapshot.open.includes(s.id),site:s})),{canPickMany:true,placeHolder:'Select sites to open together'});
    if(selected?.length){await workspaces.openMany(selected.map(x=>x.site.id));await vscode.commands.executeCommand('sitedock.sites.focus');}
  });
  command('sitedock.setViewMode',async()=>{
    const options=[
      {label:'Site Manager · Active Site',description:'Focus on just one site, switch without closing others',mode:'manager',scope:'active'},
      {label:'Site Manager · All Open Sites',description:'Only sites you have opened are shown',mode:'manager',scope:'open'},
      {label:'All Sites',description:'Original explorer showing every saved server',mode:'all',scope:'active'}
    ];
    const choice=await vscode.window.showQuickPick(options,{placeHolder:'Choose how SiteDock displays your servers'});
    if(choice){await workspaces.setScope(choice.scope);await workspaces.setMode(choice.mode);}
  });
  command('sitedock.add',()=>editor.open());
  command('sitedock.showActivity',()=>vscode.commands.executeCommand('sitedock.activity.focus'));
  command('sitedock.clearActivity',()=>activity.clearCompleted());
  command('sitedock.cancelActivity',node=>{if(node?.id)activity.cancel(node.id);});
  command('sitedock.retryActivity',node=>{if(!node?.id||!activity.retry(node.id))throw new Error('This transfer cannot be retried after a restart. Start it again from the server.');});
  command('sitedock.activityDetails',id=>{
    const job=activity.all.find(x=>x.id===id);
    if(!job)return;
    channel.appendLine(`[${new Date(job.createdAt).toLocaleString()}] ${job.siteName}: ${job.label}: ${job.status} ${job.message||''}`);
    channel.show(true);
  });
  command('sitedock.installLibraries',async()=>{
    await prepareConnections();
    vscode.window.showInformationMessage('SiteDock connection libraries are ready.');
  });
  command('sitedock.diagnostics',()=>{
    const state=diagnostics();
    channel.appendLine(`SiteDock ${manifest.version}`);
    channel.appendLine(`Extension path: ${context.extensionPath}`);
    channel.appendLine(`Transport directory: ${state.storage}`);
    channel.appendLine(`Transport ready: ${state.installed}`);
    channel.appendLine(`Bundled libraries: ${state.bundled}`);
    channel.appendLine(`Explorer: ${workspaces.snapshot.mode} / ${workspaces.snapshot.scope}; open: ${workspaces.snapshot.open.length}`);
    channel.appendLine(`Node: ${process.version} | Platform: ${process.platform}`);
    channel.show(true);
  });
  command('sitedock.edit',async node=>editor.open(node?.id || (await chooseSite())?.id));
  command('sitedock.refresh',refresh);
  async function chooseSite(){
    const list=store.all();
    if(!list.length){editor.open();return null;}
    const picked=await vscode.window.showQuickPick(list.map(s=>({label:s.name,description:`${s.protocol.toUpperCase()} · ${s.host}`,site:s})),{placeHolder:'Choose a saved server'});
    return picked?.site;
  }
  command('sitedock.authDiagnostics',async node=>{
    const site=store.get(node?.id || (await chooseSite())?.id);
    if(!site)return;
    if(site.protocol!=='sftp')throw new Error('SSH authentication diagnostics require an SFTP connection.');
    const check=async()=>io.probe(store.get(site.id));
    let report;
    try {report=await check();}
    catch(err) {
      if(!(err instanceof require('./connection').HostKeyError))throw err;
      await editor.handleHostKey(site.id,err);
      report=await check();
    }
    const offered=report.methods.length?report.methods.join(', '):'none reported';
    channel.appendLine(`SSH method diagnostic for ${site.name} (${site.user}@${site.host}:${site.port}): ${offered}`);
    channel.appendLine('The authentication method list does not guarantee that an individual account can use any method.');
    channel.appendLine('No password, passphrase, or private key was sent in this diagnostic.');
    channel.show(true);
    vscode.window.showInformationMessage(`${site.name}: SSH methods: ${offered}. See Output → SiteDock.`);
  });
  command('sitedock.test',async node=>{
    const site=store.get(node?.id || (await chooseSite())?.id);
    if(!site)return;
    await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:`Testing ${site.name}…`,cancellable:false},async()=>{
      try{await io.test(site);}catch(err){
        if(err.name!=='HostKeyError')throw err;
        await editor.handleHostKey(site.id,err);
        await io.test(store.get(site.id));
      }
    });
    vscode.window.showInformationMessage(`${site.name}: connection successful.`);
  });
  command('sitedock.remove',async node=>{
    const site=store.get(node?.id || (await chooseSite())?.id);if(!site)return;
    const answer=await vscode.window.showWarningMessage(`Remove ${site.name} from SiteDock?`,{modal:true,detail:'Only the saved connection and credentials are removed. Remote files are not affected.'},'Remove Server');
    if(answer!=='Remove Server')return;
    await io.invalidate(site.id);await store.remove(site.id);await workspaces.sync();refresh();updateStatus();
  });
  command('sitedock.open',async node=>{
    if(!node || node.kind!=='entry' || node.type==='directory')return;
    await openRemoteFile(vscode,uriFor(node),node.name || posix.basename(node.path));
  });
  command('sitedock.openAsText',async node=>{
    if(!node || node.kind!=='entry' || node.type==='directory')return;
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uriFor(node)),{preview:false});
  });
  command('sitedock.openExternal',async node=>{
    if(!node || node.kind!=='entry' || node.type==='directory')return;
    await openInDesktopApp(vscode,uriFor(node),node.name || posix.basename(node.path));
  });
  command('sitedock.openRoot',async node=>{const site=await getSelected(node);if(site)await openWindow(site.id);});
  command('sitedock.newFile',async node=>{
    if(!node)return;
    const folder=parentUri(node); const name=await vscode.window.showInputBox({title:'New remote file',prompt:'File name',placeHolder:'index.html',validateInput:s=>{try{validName(s);return null;}catch(e){return e.message;}}});
    if(name===undefined)return;
    const uri=folder.with({path:safeChildPath(folder.path,name)});
    await vscode.workspace.fs.writeFile(uri,new Uint8Array());
    refresh();await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri),{preview:false});
  });
  command('sitedock.newFolder',async node=>{
    if(!node)return;
    const folder=parentUri(node);const name=await vscode.window.showInputBox({title:'New remote folder',prompt:'Folder name',placeHolder:'assets',validateInput:s=>{try{validName(s);return null;}catch(e){return e.message;}}});
    if(name===undefined)return;
    await vscode.workspace.fs.createDirectory(folder.with({path:safeChildPath(folder.path,name)}));refresh();
  });
  command('sitedock.rename',async node=>{
    if(!node || node.kind!=='entry')return;
    const original=uriFor(node);
    const name=await vscode.window.showInputBox({title:'Rename remote item',value:node.name,validateInput:s=>{try{validName(s);return null;}catch(e){return e.message;}}});
    if(name===undefined || name===node.name)return;
    const destination=original.with({path:safeChildPath(posix.dirname(node.path),name)});
    await vscode.workspace.fs.rename(original,destination,{overwrite:false});refresh();
  });
  command('sitedock.delete',async node=>{
    if(!node || node.kind!=='entry')return;
    const isLink=Boolean(node.symlink)||node.type==='symlink';
    const isDir=node.type==='directory'&&!isLink;
    const response=await vscode.window.showWarningMessage(`Permanently delete ${isLink?'symbolic link':isDir?'folder':'file'} “${node.name}” from the server?`,
      {modal:true,detail:isDir?'This recursively removes the folder and everything inside it. There is no server-side recycle bin.':'There is no server-side recycle bin.'},'Delete');
    if(response!=='Delete')return;
    await vscode.workspace.fs.delete(uriFor(node),{recursive:isDir,useTrash:false});refresh();
  });
  command('sitedock.upload',async node=>{
    if(!node)return;
    if(node.kind==='entry' && node.type!=='directory')throw new Error('Select a folder or server for uploads.');
    const folder=parentUri(node);
    const site=store.get(folder.authority);
    if(!site)throw new Error('Server was removed.');
    const sources=await vscode.window.showOpenDialog({canSelectFiles:true,canSelectFolders:false,canSelectMany:true,title:'Choose files to upload'});
    if(!sources?.length)return;
    for(const source of sources){
      const name=posix.basename(source.path);validName(name);
      const target=folder.with({path:safeChildPath(folder.path,name)});
      let exists=false;
      try{await vscode.workspace.fs.stat(target);exists=true;}
      catch(err){if(err.code!=='FileNotFound')throw err;}
      if(exists){
        const replace=await vscode.window.showWarningMessage(`Replace “${name}” on ${site.name}?`,{modal:true},'Replace');
        if(replace!=='Replace')continue;
      }
      activity.enqueue({kind:'upload',label:`Upload ${target.path}`,siteName:site.name},async(report,signal)=>{
        if(signal.aborted)return;
        report(0,0,'Checking destination');
        const remoteFile=remotePath(site,target.path);
        const current=await doRemote(site.id,'stat',remoteFile);
        if(current && current.type==='directory')throw new Error('The remote destination is a directory.');
        if(current && !exists)throw new Error('A remote file appeared at this path after the upload was queued. It was not overwritten.');
        if(signal.aborted)return;
        report(0,0,'Reading local file');
        if(source.scheme==='file'&&source.fsPath){
          await doRemote(site.id,'uploadLocal',source.fsPath,remotePath(site,target.path),report);
        }else{
          const bytes=await vscode.workspace.fs.readFile(source);
          if(signal.aborted)return;
          report(0,bytes.byteLength,'Uploading to server');
          await doRemote(site.id,'write',remotePath(site,target.path),bytes);
          report(bytes.byteLength,bytes.byteLength,'Uploaded');
        }
        filesystem.notifyModified(target,!exists);
        refresh();
      });
    }
    vscode.window.showInformationMessage('Files added to the SiteDock transfer queue.');
  });
  command('sitedock.download',async node=>{
    if(!node || node.kind!=='entry' || node.type==='directory' || node.broken)return;
    const site=store.get(node.id);
    if(!site)throw new Error('Server was removed.');
    const dest=await vscode.window.showSaveDialog({title:`Download ${node.name}`,saveLabel:'Download'});
    if(!dest)return;
    activity.enqueue({kind:'download',label:`Download ${node.path}`,siteName:site.name},async(report,signal)=>{
      if(signal.aborted)return;
      report(0,0,'Downloading remote file');
      if(dest.scheme==='file'&&dest.fsPath){
        await doRemote(site.id,'downloadLocal',remotePath(site,node.path),dest.fsPath,report);
      }else{
        const bytes=await doRemote(site.id,'read',remotePath(site,node.path));
        if(signal.aborted)return;
        report(0,bytes.length,'Saving downloaded file');
        await vscode.workspace.fs.writeFile(dest,bytes);
        report(bytes.length,bytes.length,'Downloaded');
      }
    });
    vscode.window.showInformationMessage('Download added to SiteDock transfer queue.');
  });
  command('sitedock.uploadFolder',async node=>{
    if(!node || (node.kind==='entry' && node.type!=='directory'))return;
    const site=store.get(node.id);if(!site)throw new Error('Server was removed.');
    const picked=await vscode.window.showOpenDialog({canSelectFiles:false,canSelectFolders:true,canSelectMany:false,title:'Choose a folder to upload'});
    if(!picked?.length)return;
    const local=picked[0];const parent=parentUri(node);
    const folderName=posix.basename(local.path.replace(/\/+$/,''));validName(folderName);
    const remoteFolder=safeChildPath(parent.path,folderName);
    const policy=await vscode.window.showWarningMessage(`Upload “${folderName}” to ${site.name}?`,
      {modal:true,detail:'Folders will be merged. Local directory symlinks will not be followed.'},'Replace Existing Files','Skip Existing Files');
    if(!policy)return;
    const replace=policy==='Replace Existing Files';
    const plan=await planUploadFolder(vscode,local,remoteFolder);
    activity.batch(()=>{for(const entry of plan){
      if(entry.kind==='mkdir'){
        activity.enqueue({kind:'mkdir',label:`Create folder ${entry.remote}`,siteName:site.name},async()=>{
          const target=remotePath(site,entry.remote);
          const st=await doRemote(site.id,'stat',target);
          if(st){if(st.type!=='directory')throw new Error('Remote destination exists and is not a folder.');return;}
          await doRemote(site.id,'mkdir',target);refresh();
        });continue;
      }
      activity.enqueue({kind:'upload',label:`Upload ${entry.remote}`,siteName:site.name},async(report,signal)=>{
        if(signal.aborted)return;
        const target=remotePath(site,entry.remote);
        const st=await doRemote(site.id,'stat',target);
        if(st && st.type==='directory')throw new Error('Destination is a directory.');
        if(st && !replace)return {skipped:true,reason:'Existing remote file skipped'};
        if(entry.local.scheme==='file' && entry.local.fsPath)
          await doRemote(site.id,'uploadLocal',entry.local.fsPath,target,report);
        else{
          const bytes=await vscode.workspace.fs.readFile(entry.local);
          if(signal.aborted)return;
          report(0,bytes.length,'Uploading');await doRemote(site.id,'write',target,bytes);
          report(bytes.length,bytes.length,'Uploaded');
        }
        const remoteUri=vscode.Uri.from({scheme:'sitedock',authority:site.id,path:entry.remote});
        filesystem.notifyModified(remoteUri,!st);refresh();
      });
    }});
    vscode.window.showInformationMessage(`${plan.length} folder entries added to the SiteDock transfer queue.`);
  });
  command('sitedock.downloadFolder',async node=>{
    if(!node || node.kind!=='entry' || node.type!=='directory')return;
    const site=store.get(node.id);if(!site)throw new Error('Server was removed.');
    const picked=await vscode.window.showOpenDialog({canSelectFiles:false,canSelectFolders:true,canSelectMany:false,title:'Choose destination folder'});
    if(!picked?.length)return;
    validName(node.name);
    const destination=vscode.Uri.joinPath(picked[0],node.name);
    const policy=await vscode.window.showWarningMessage(`Download “${node.name}” into the selected folder?`,
      {modal:true,detail:'Existing files can be replaced or skipped. Linked subdirectories are skipped to prevent loops.'},'Replace Existing Files','Skip Existing Files');
    if(!policy)return;
    const replace=policy==='Replace Existing Files';
    const plan=await planDownloadFolder(vscode,doRemote,site,node.path,destination);
    activity.batch(()=>{for(const entry of plan){
      if(entry.kind==='mkdir'){
        activity.enqueue({kind:'mkdir',label:`Create local folder ${entry.local.path}`,siteName:site.name},async()=>vscode.workspace.fs.createDirectory(entry.local));continue;
      }
      activity.enqueue({kind:'download',label:`Download ${entry.remote}`,siteName:site.name},async(report,signal)=>{
        if(signal.aborted)return;
        try{await vscode.workspace.fs.stat(entry.local);if(!replace)return {skipped:true,reason:'Existing local file skipped'};}
        catch(err){if(err.code!=='FileNotFound'&&err.code!=='ENOENT')throw err;}
        if(entry.local.scheme==='file' && entry.local.fsPath)
          await doRemote(site.id,'downloadLocal',remotePath(site,entry.remote),entry.local.fsPath,report);
        else{
          const bytes=await doRemote(site.id,'read',remotePath(site,entry.remote));
          if(signal.aborted)return;
          report(0,bytes.length,'Saving local file');await vscode.workspace.fs.writeFile(entry.local,bytes);
          report(bytes.length,bytes.length,'Downloaded');
        }
      });
    }});
    vscode.window.showInformationMessage(`${plan.length} folder entries added to the SiteDock transfer queue.`);
  });
  const saved=()=>{refresh();updateStatus();};
  context.subscriptions.push(vscode.workspace.registerFileSystemProvider('sitedock',filesystem,{isCaseSensitive:true}),
    explorer,managerView,managerTree,managerPanel,workspaces,transfers,activity,tree,editor,filesystem,status,vscode.window.onDidChangeActiveTextEditor(updateStatus),
    vscode.workspace.onDidSaveTextDocument(doc=>{if(doc.uri.scheme==='sitedock')saved();}));
  updateStatus();
}
function deactivate(){if(disposeIO)return disposeIO();}
module.exports={activate,deactivate};
