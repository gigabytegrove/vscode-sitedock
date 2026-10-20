'use strict';
const {validName,safeChildPath,remotePath}=require('./paths');
const {planUploadFolder}=require('./bulk');
const posix=require('node:path').posix;
const MAX_DROP_ROOTS=100;
const MAX_INLINE_FILE=16*1024*1024;
const MAX_INLINE_TOTAL=32*1024*1024;
const MAX_PLAN_ENTRIES=3000;

/** Only accept local file URIs or VS Code's explicitly surfaced DataTransferFile objects. */
async function dropSources(vscode,transfer,token){
  const candidates=[];
  const uris=transfer.get('text/uri-list');
  if(uris){
    const text=await uris.asString();
    if(text.length>100000)throw new Error('The dropped file list is too large.');
    for(const line of text.split(/\r?\n/)){
      const value=line.trim();if(!value||value.startsWith('#'))continue;
      let uri;
      try{uri=vscode.Uri.parse(value,true);}catch{throw new Error('Drag only local files and folders into SiteDock.');}
      if(uri.scheme!=='file'||uri.query||uri.fragment)throw new Error('Only local files and folders can be uploaded by dropping them.');
      candidates.push({kind:'uri',uri,name:posix.basename(uri.path)});
    }
  }
  // Dragging from the operating system may deliver file objects instead of URI lists.
  if(!candidates.length){
    transfer.forEach((item)=>{
      const file=item.asFile?.();
      if(file)candidates.push({kind:'file',file,name:file.name});
    });
  }
  if(!candidates.length)throw new Error('Drop local files or folders from your computer or VS Code Explorer.');
  if(candidates.length>MAX_DROP_ROOTS)throw new Error(`Only ${MAX_DROP_ROOTS} items may be dropped at once.`);
  const names=new Set(),result=[];let inlineBytes=0;
  for(const item of candidates){
    if(token?.isCancellationRequested)return [];
    validName(item.name);
    if(names.has(item.name))throw new Error(`More than one dropped item is named ${item.name}.`);
    names.add(item.name);
    if(item.kind==='uri'){
      const stat=await vscode.workspace.fs.stat(item.uri);
      if(stat.type & vscode.FileType.SymbolicLink)throw new Error('Local symbolic links cannot be dropped into SiteDock.');
      if(!(stat.type & (vscode.FileType.File|vscode.FileType.Directory)))throw new Error('Only ordinary files and folders can be uploaded.');
      result.push({...item,isDirectory:Boolean(stat.type&vscode.FileType.Directory)});
    }else if(item.file.uri){
      if(item.file.uri.scheme!=='file')throw new Error('Dragged file must use a local file URI.');
      const stat=await vscode.workspace.fs.stat(item.file.uri);
      if(stat.type & vscode.FileType.SymbolicLink)throw new Error('Local symbolic links cannot be uploaded.');
      if(!(stat.type & vscode.FileType.File))throw new Error('Drop folders from VS Code Explorer to upload directories.');
      result.push({kind:'uri',uri:item.file.uri,name:item.name,isDirectory:false});
    }else{
      const bytes=await item.file.data();
      if(bytes.byteLength>MAX_INLINE_FILE)throw new Error(`Dragged file ${item.name} exceeds 16 MiB. Use Upload Files for larger files.`);
      inlineBytes+=bytes.byteLength;
      if(inlineBytes>MAX_INLINE_TOTAL)throw new Error('Dropped in-memory files exceed the 32 MiB total limit. Use Upload Files.');
      result.push({kind:'inline',name:item.name,bytes});
    }
  }
  return result;
}
async function planDroppedUploads(vscode,site,folder,items){
  if(!site||!Array.isArray(items)||!items.length)throw new Error('No files to upload.');
  if(typeof folder!=='string'||!folder.startsWith('/')||folder.split('/').some(x=>x==='..'||x==='.'))throw new Error('Invalid SiteDock destination folder.');
  const plan=[];
  for(const item of items){
    validName(item.name);
    const dest=safeChildPath(folder,item.name);
    remotePath(site,dest);
    if(item.isDirectory){
      const entries=await planUploadFolder(vscode,item.uri,dest,{limit:MAX_PLAN_ENTRIES-plan.length});
      plan.push(...entries);
    }else plan.push({kind:'upload',local:item.uri,bytes:item.bytes,remote:dest});
    if(plan.length>MAX_PLAN_ENTRIES)throw new Error('Drag-and-drop upload exceeds 3,000 entries. Nothing was queued.');
  }
  return plan;
}
module.exports={dropSources,planDroppedUploads,MAX_PLAN_ENTRIES,MAX_INLINE_FILE};
