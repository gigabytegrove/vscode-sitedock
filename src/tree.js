'use strict';
function formatBytes(n){
  if(n<1024)return `${n} B`;
  const units=['KB','MB','GB','TB'];let unit=-1;
  do{n/=1024;unit++;}while(n>=1024&&unit<units.length-1);
  return `${n>=10?n.toFixed(0):n.toFixed(1)} ${units[unit]}`;
}
class SiteTree {
  constructor(vscode,store,run,workspaces=null) {this.vscode=vscode;this.store=store;this.run=run;this.workspaces=workspaces;this.events=new vscode.EventEmitter();this.onDidChangeTreeData=this.events.event;}
  refresh(target) {this.events.fire(target);}
  getTreeItem(node) {
    const v=this.vscode;
    if (node.kind==='site') {
      const site=this.store.get(node.id);
      const item=new v.TreeItem(site?.name || 'Removed server',v.TreeItemCollapsibleState.Collapsed);
      item.id=`site:${node.id}`;
      const active=this.workspaces?.snapshot.active===node.id&&this.workspaces?.snapshot.mode==='manager';
      item.description=site?`${active?'ACTIVE · ':''}${site.protocol.toUpperCase()} · ${site.host}`:'';
      item.tooltip=site?`${site.name}\n${site.protocol.toUpperCase()}://${site.host}:${site.port}${site.root}\nRight-click for server actions`:undefined;
      item.contextValue='sitedock.site'; item.iconPath=new v.ThemeIcon('server');return item;
    }
    const isDir=node.type==='directory';
    const isLink=Boolean(node.symlink) || node.type==='symlink';
    const blocked=Boolean(node.external) && !this.store.get(node.id)?.followExternalLinks;
    const item=new v.TreeItem(node.name,isDir&&!blocked?v.TreeItemCollapsibleState.Collapsed:v.TreeItemCollapsibleState.None);
    item.id=`entry:${node.id}:${node.path}`;
    item.contextValue=blocked?'sitedock.outsideLink':isLink?((node.broken||node.unresolved)?'sitedock.brokenLink':isDir?'sitedock.directoryLink':'sitedock.fileLink'):isDir?'sitedock.directory':'sitedock.file';
    item.resourceUri=v.Uri.from({scheme:'sitedock',authority:node.id,path:node.path});
    item.iconPath=new v.ThemeIcon(isLink?(isDir?'file-symlink-directory':'file-symlink-file'):isDir?'folder':'file');
    if(isLink)item.description=blocked?'outside site root':node.broken?'broken link':node.unresolved?'unresolved link':'';
    else if(!isDir && Number.isFinite(node.size) && node.size>=0)item.description=formatBytes(node.size);
    item.tooltip=node.path+(isLink?'\nSymbolic link'+(node.broken?' (target unavailable)':''):'')+(node.target?'\nTarget: '+node.target:'')+(blocked?'\nBlocked: target is outside the selected site root. Edit Server to allow external links.':'')+
      (Number.isFinite(node.size)?`\nSize: ${formatBytes(node.size)}`:'')+
      (node.mtime?`\nModified: ${new Date(node.mtime).toLocaleString()}`:'');
    if (!isDir && !node.broken && !node.unresolved && !blocked) item.command={command:'sitedock.open',title:'Open on server',arguments:[node]};
    return item;
  }
  async getChildren(element) {
    if (!element) return (this.workspaces?this.workspaces.visibleSites():this.store.all()).map(site=>({kind:'site',id:site.id}));
    const id=element.id;
    const path=element.kind==='site'?'/':element.path;
    const site=this.store.get(id);
    if (!site) return [];
    if(element.external && !site.followExternalLinks) return [];
    const {remotePath}=require('./paths');
    // Detect a symlink loop before asking the server to list the same target again.
    // A link may intentionally resolve outside the chosen display root; that is
    // allowed for browsing, but an ancestor cycle must not expand indefinitely.
    const chain=Array.isArray(element.resolvedAncestors)?element.resolvedAncestors:[];
    let physical;
    if(path.split('/').length>66)throw new Error('This folder is too deep to expand safely; check for a symbolic-link loop.');
    if(site.protocol==='sftp') {
      try{physical=await this.run(id,'realpath',remotePath(site,path));}
      catch(err){
        // Some SFTP servers do not support REALPATH for every accessible path.
        // We can still browse, bounded by the virtual-depth limit above.
        physical=undefined;
      }
      if(typeof physical==='string' && chain.includes(physical))return [];
    }
    const visited=physical?[...chain,physical]:chain;
    const entries=await this.run(id,'list',remotePath(site,path));
    return entries.filter(e=>e.name && e.name!=='.' && e.name!=='..' && !e.name.includes('/') && !e.name.includes('\\')).sort((a,b)=>{
      if ((a.type==='directory') !== (b.type==='directory')) return a.type==='directory'?-1:1;
      return a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});
    }).map(e=>({kind:'entry',id,path:require('node:path').posix.join(path,e.name),name:e.name,type:e.type,symlink:Boolean(e.symlink),broken:Boolean(e.broken),unresolved:Boolean(e.unresolved),external:Boolean(e.external),target:e.target||'',size:e.size,mtime:e.mtime,resolvedAncestors:visited}));
  }
  getParent(node) {
    if (node.kind==='site') return null;
    const posix=require('node:path').posix;
    const parent=posix.dirname(node.path);
    return parent==='/'?{kind:'site',id:node.id}:{kind:'entry',id:node.id,path:parent,name:posix.basename(parent),type:'directory'};
  }
  dispose(){this.events.dispose();}
}
module.exports={SiteTree};
