'use strict';
const {safeChildPath,validName}=require('./paths');
const DEFAULT_LIMIT=3000;
/** Build complete, side-effect-free plans before queueing anything. */
async function planUploadFolder(vscode,localRoot,remoteRoot,{limit=DEFAULT_LIMIT,maxDepth=32}={}) {
  const result=[];
  async function visit(local,remote,depth){
    if(depth>maxDepth)throw new Error(`Folder upload exceeds ${maxDepth} levels.`);
    result.push({kind:'mkdir',local,remote});
    if(result.length>limit)throw new Error(`Folder upload exceeds ${limit} entries. No operations were queued.`);
    const entries=await vscode.workspace.fs.readDirectory(local);
    for(const [name,type] of entries){
      validName(name);
      if((type&vscode.FileType.SymbolicLink)!==0)continue; // do not escape local folder via links
      const childLocal=vscode.Uri.joinPath(local,name);
      const childRemote=safeChildPath(remote,name);
      if((type&vscode.FileType.Directory)!==0)await visit(childLocal,childRemote,depth+1);
      else if((type&vscode.FileType.File)!==0){
        result.push({kind:'upload',local:childLocal,remote:childRemote});
        if(result.length>limit)throw new Error(`Folder upload exceeds ${limit} entries. No operations were queued.`);
      }
    }
  }
  await visit(localRoot,remoteRoot,0);
  return result;
}
async function planDownloadFolder(vscode,run,site,remoteRoot,localRoot,{limit=DEFAULT_LIMIT,maxDepth=32}={}) {
  const {remotePath}=require('./paths');
  const result=[];
  async function visit(remote,local,depth){
    if(depth>maxDepth)throw new Error(`Folder download exceeds ${maxDepth} levels.`);
    result.push({kind:'mkdir',local,remote});
    if(result.length>limit)throw new Error(`Folder download exceeds ${limit} entries. No operations were queued.`);
    const entries=await run(site.id,'list',remotePath(site,remote));
    for(const entry of entries){
      validName(entry.name);
      if(entry.broken||(entry.symlink&&entry.type==='directory'))continue;
      const childRemote=safeChildPath(remote,entry.name);
      const childLocal=vscode.Uri.joinPath(local,entry.name);
      if(entry.type==='directory')await visit(childRemote,childLocal,depth+1);
      else if(entry.type==='file'){
        result.push({kind:'download',local:childLocal,remote:childRemote});
        if(result.length>limit)throw new Error(`Folder download exceeds ${limit} entries. No operations were queued.`);
      }
    }
  }
  await visit(remoteRoot,localRoot,0);
  return result;
}
module.exports={planUploadFolder,planDownloadFolder};
