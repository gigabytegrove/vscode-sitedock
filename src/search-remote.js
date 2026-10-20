'use strict';
const posix=require('node:path').posix;
const {validName}=require('./paths');
const DEFAULT_LIMITS=Object.freeze({maxDirectories:350,maxEntries:3000,maxMatches:200,maxDepth:12});
async function searchRemoteFiles({list,query,signal,onProgress=()=>{},limits={}}){
  if(typeof list!=='function')throw new Error('A remote directory lister is required.');
  const term=String(query||'').trim().toLocaleLowerCase();
  if(!term||term.length>120||/[\x00-\x1f\x7f]/.test(term))throw new Error('Search for 1–120 valid filename characters.');
  const bounds={...DEFAULT_LIMITS,...limits};
  for(const [key,value] of Object.entries(bounds))if(!Number.isSafeInteger(value)||value<1||value>10000)throw new Error('Invalid search limit: '+key);
  const queue=[{path:'/',depth:0}],matches=[];
  let directories=0,entriesSeen=0,truncated=false;
  while(queue.length){
    if(signal?.isCancellationRequested||signal?.aborted)return {matches,directories,entriesSeen,cancelled:true,truncated};
    if(directories>=bounds.maxDirectories){truncated=true;break;}
    const current=queue.shift(),entries=await list(current.path);
    if(!Array.isArray(entries))throw new Error('Remote server returned an invalid directory listing.');
    directories++;
    for(const item of entries){
      if(signal?.isCancellationRequested||signal?.aborted)return {matches,directories,entriesSeen,cancelled:true,truncated};
      if(entriesSeen>=bounds.maxEntries||matches.length>=bounds.maxMatches){truncated=true;break;}
      try{validName(item?.name);}catch{continue;}
      const name=item.name;
      if(item.symlink||item.type==='symlink'||item.external||item.unresolved||item.broken)continue;
      if(item.type!=='file'&&item.type!=='directory')continue;
      const virtualPath=posix.join(current.path,name);entriesSeen++;
      if(name.toLocaleLowerCase().includes(term))matches.push({path:virtualPath,name,type:item.type});
      if(item.type==='directory'&&current.depth<bounds.maxDepth)queue.push({path:virtualPath,depth:current.depth+1});
      else if(item.type==='directory')truncated=true;
    }
    onProgress({directories,entriesSeen,matches:matches.length});
    if(truncated&&(entriesSeen>=bounds.maxEntries||matches.length>=bounds.maxMatches))break;
  }
  return {matches,directories,entriesSeen,cancelled:false,truncated};
}
module.exports={searchRemoteFiles,DEFAULT_LIMITS};
