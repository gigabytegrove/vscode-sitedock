'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const posix=path.posix;
const {validName,remotePath,safeChildPath}=require('./paths');
const {withoutNested}=require('./batch-operations');
const {planDownloadFolder}=require('./bulk');

const MAX_ITEMS=3000;
const MAX_DEPTH=32;
function destinationPath(site,folder,name){
  if(typeof folder!=='string'||!folder.startsWith('/')||folder.includes('\\')||folder.split('/').some(x=>x==='.'||x==='..'))throw new Error('Destination must be a safe absolute SiteDock path.');
  validName(name);
  const dest=safeChildPath(posix.normalize(folder),name);
  remotePath(site,dest);
  return dest;
}
function snapshotItems(batch){
  if(!batch||!Array.isArray(batch.items)||!batch.items.length||!batch.siteId)throw new Error('Copy or select some remote items first.');
  const items=withoutNested(batch.items);
  if(items.some(x=>x.symlink||!['file','directory'].includes(x.type)))throw new Error('Copying symbolic links is not supported; select ordinary files or folders.');
  return {siteId:batch.siteId,items:items.map(x=>({...x}))};
}
async function planRemoteCopy({snapshot,site,folder,list,stat,maxEntries=MAX_ITEMS,maxDepth=MAX_DEPTH}){
  if(!snapshot||snapshot.siteId!==site.id)throw new Error('Remote copy and paste must stay within one site.');
  if(typeof list!=='function'||typeof stat!=='function')throw new Error('Copy requires remote listing and stat support.');
  const selected=snapshotItems(snapshot).items;
  if(selected.some(x=>x.path===folder||folder.startsWith(x.path+'/')))throw new Error('Cannot copy a folder into itself or its descendants.');
  const output=[];
  const targets=new Set();
  function push(entry){
    if(output.length>=maxEntries)throw new Error(`Remote copy exceeds ${maxEntries} entries. Nothing was queued.`);
    if(targets.has(entry.remote))throw new Error('Selected paths map to the same copy destination.');
    targets.add(entry.remote);output.push(entry);
  }
  async function walk(source,target,depth){
    if(depth>maxDepth)throw new Error(`Remote copy exceeds ${maxDepth} directory levels. Nothing was queued.`);
    const meta=await stat(source);
    if(!meta)throw new Error(`Source disappeared: ${source}`);
    if(meta.symlink||meta.broken||meta.external||meta.unresolved)throw new Error(`Cannot copy a symbolic or external path: ${source}`);
    if(meta.type==='directory'){
      push({kind:'mkdir',source,remote:target});
      const entries=await list(source);
      if(!Array.isArray(entries))throw new Error('Invalid remote directory listing.');
      for(const child of entries){
        validName(child.name);
        if(child.symlink||child.broken||child.external||child.unresolved)continue;
        if(child.type!=='file'&&child.type!=='directory')continue;
        await walk(safeChildPath(source,child.name),destinationPath(site,target,child.name),depth+1);
      }
    }else if(meta.type==='file')push({kind:'copy',source,remote:target});
    else throw new Error(`Unsupported remote file type: ${source}`);
  }
  const names=new Set();
  for(const item of selected){
    if(names.has(item.name))throw new Error(`Two selected items share the filename ${item.name}. Choose a different destination.`);
    names.add(item.name);
    const target=destinationPath(site,folder,item.name);
    if(item.path===target)throw new Error('Cannot paste onto the original item.');
    if(item.isDirectory&&(target===item.path||target.startsWith(item.path+'/')))throw new Error('Cannot copy a folder into itself.');
    await walk(item.path,target,0);
  }
  // Only the top-level targets can already exist: descendants will be
  // created under those new folders. Stat'ing their missing parents is unsafe
  // for FTP adapters, which must LIST the parent to determine existence.
  for(const item of selected){
    const top=destinationPath(site,folder,item.name);
    if(await stat(top))throw new Error(`Destination already exists: ${top}. No files were copied.`);
  }
  return output;
}
async function copyRemoteFile({source,target,download,upload,signal,report=()=>{}}){
  if(typeof download!=='function'||typeof upload!=='function')throw new Error('Remote copy needs download/upload handlers.');
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-copy-'));
  const file=path.join(temporary,'payload');
  try{
    if(signal?.aborted)throw new Error('Copy cancelled before download.');
    await download(source,file,(done,total)=>report(done,total,'Copying from server'));
    if(signal?.aborted)throw new Error('Copy cancelled before upload.');
    const size=(await fs.stat(file)).size;
    await upload(file,target,(done,total)=>report(done,total||size,'Copying to server'));
    report(size,size,'Copied');
    return size;
  }finally{
    await fs.rm(temporary,{recursive:true,force:true});
  }
}
async function planBatchDownload({vscode,batch,localRoot,site,list,maxEntries=MAX_ITEMS}){
  if(batch.siteId!==site.id)throw new Error('Download selection and destination site do not match.');
  const selected=snapshotItems(batch).items;
  const names=new Set(),result=[];
  for(const item of selected){
    if(names.has(item.name))throw new Error(`Multiple selected items have filename ${item.name}; cannot download them together.`);
    names.add(item.name);
    const destination=vscode.Uri.joinPath(localRoot,item.name);
    let chunk;
    if(item.isDirectory)chunk=await planDownloadFolder(vscode,async(_id,op,remote)=>{
      if(op!=='list')throw new Error('Unexpected remote listing operation.');
      return (await list(remote)).filter(entry=>!entry.symlink&&!entry.external&&!entry.unresolved&&!entry.broken);
    },site,item.path,destination,{limit:maxEntries,maxDepth:MAX_DEPTH});
    else chunk=[{kind:'download',local:destination,remote:item.path}];
    result.push(...chunk);
    if(result.length>maxEntries)throw new Error(`Download exceeds ${maxEntries} entries; nothing was queued.`);
  }
  const targets=new Set();
  for(const item of result){
    const key=item.local.toString();
    if(targets.has(key))throw new Error('Selected downloads have conflicting local destinations.');
    targets.add(key);
  }
  return result;
}
module.exports={MAX_ITEMS,MAX_DEPTH,snapshotItems,destinationPath,planRemoteCopy,copyRemoteFile,planBatchDownload};
