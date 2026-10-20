'use strict';
class ManagerTree {
  constructor(vscode,workspaces){this.vscode=vscode;this.workspaces=workspaces;this.emitter=new vscode.EventEmitter();this.onDidChangeTreeData=this.emitter.event;}
  refresh(){this.emitter.fire(undefined);}
  getChildren(element){if(element)return [];return this.workspaces.managerSites().map(site=>({kind:'managedSite',id:site.id,...site}));}
  getTreeItem(site){
    const v=this.vscode;
    const item=new v.TreeItem(site.name,v.TreeItemCollapsibleState.None);
    item.id=`managed:${site.id}`;
    item.contextValue=site.isOpen?'sitedock.managedOpen':'sitedock.managedClosed';
    item.description=site.isActive?'ACTIVE · OPEN':site.isOpen?'OPEN':`${site.protocol.toUpperCase()} · ${site.host}`;
    item.tooltip=`${site.name}\n${site.protocol.toUpperCase()}://${site.host}:${site.port}${site.root}\n${site.isOpen?'Click to focus this site':'Click to open this site'}${site.isFavorite?'\n★ Favorite':''}`;
    item.iconPath=new v.ThemeIcon(site.isFavorite?'star-full':site.isActive?'folder-active':site.isOpen?'folder-opened':'server');
    item.command={command:site.isOpen?'sitedock.focusSite':'sitedock.openSite',title:site.isOpen?'Focus site':'Open site',arguments:[site]};
    return item;
  }
  dispose(){this.emitter.dispose();}
}
module.exports={ManagerTree};
