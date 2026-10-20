'use strict';
const posix=require('node:path').posix;
const {validName,remotePath}=require('./paths');
const MAX_BATCH=100;
function itemsForAction(trigger,selection=[]){
  if(Array.isArray(trigger))return trigger;
  if(trigger?.kind==='entry'){
    return Array.isArray(selection)&&selection.some(s=>s?.kind==='entry'&&s.id===trigger.id&&s.path===trigger.path)?selection:[trigger];
  }
  return Array.isArray(selection)?selection:[];
}
function planBatch(nodes,store){
  if(!Array.isArray(nodes)||!nodes.length)throw new Error('Select one or more remote files or folders first.');
  if(nodes.length>MAX_BATCH)throw new Error(`Select no more than ${MAX_BATCH} items per batch.`);
  const paths=new Set(),items=[];
  let siteId;
  for(const node of nodes){
    if(!node||node.kind!=='entry'||typeof node.id!=='string'||typeof node.path!=='string')throw new Error('Select remote file or folder entries, not site roots.');
    if(siteId===undefined)siteId=node.id;
    if(node.id!==siteId)throw new Error('Batch operations cannot span multiple sites. Select one site at a time.');
    const site=store.get(node.id);
    if(!site)throw new Error('The selected server no longer exists.');
    if(node.path==='/'||!node.path.startsWith('/')||posix.normalize(node.path)!==node.path||node.path.split('/').includes('..'))throw new Error('A selected path is unsafe or is a site root.');
    const basename=posix.basename(node.path);validName(basename);
    remotePath(site,node.path);
    if(!['file','directory','symlink'].includes(node.type))throw new Error('Unsupported selected item type.');
    if(node.external&&!node.symlink)throw new Error('An external item cannot be changed in a batch.');
    if(paths.has(node.path))continue;
    paths.add(node.path);
    items.push({id:node.id,path:node.path,name:basename,type:node.type,symlink:Boolean(node.symlink),isDirectory:node.type==='directory'&&!node.symlink});
  }
  return {siteId,items:items.sort((a,b)=>a.path.localeCompare(b.path))};
}
function withoutNested(items){
  return items.filter(item=>!items.some(other=>other!==item&&item.path.startsWith(other.path+'/')&&other.isDirectory));
}
function movePlan(batch,destination,site){
  if(typeof destination!=='string'||!destination.startsWith('/')||destination.includes('\\')||destination.split('/').includes('..')||destination.split('/').includes('.'))throw new Error('Destination must be an absolute SiteDock path without dot segments.');
  const folder=posix.normalize(destination);
  remotePath(site,folder);
  if(withoutNested(batch.items).length!==batch.items.length)throw new Error('Select a folder OR its children, not both, when moving files.');
  const moves=batch.items.map(item=>{
    if(item.path===folder||folder.startsWith(item.path+'/'))throw new Error('Cannot move a folder into itself or one of its descendants.');
    const target=posix.join(folder,item.name);
    if(target===item.path)throw new Error('An item is already in the destination folder.');
    if(target==='/'||target.startsWith(item.path+'/'))throw new Error('Invalid move destination.');
    remotePath(site,target);
    return {item,destination:target};
  });
  if(new Set(moves.map(x=>x.destination)).size!==moves.length)throw new Error('Several selected items would have the same destination name.');
  return moves;
}
module.exports={MAX_BATCH,itemsForAction,planBatch,withoutNested,movePlan};
