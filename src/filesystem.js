'use strict';
const {remotePath}=require('./paths');
function makeFilesystem(vscode,store,io,run,activity=null) {
  const changes=new vscode.EventEmitter();
  const snapshots=new Map();
  const key=uri=>uri.authority+':'+uri.path;
  const convert=st=>({type:(st.type==='directory'?vscode.FileType.Directory:st.type==='symlink'?vscode.FileType.SymbolicLink:vscode.FileType.File) | (st.symlink?vscode.FileType.SymbolicLink:0),
    ctime:st.mtime||0,mtime:st.mtime||0,size:st.size||0});
  const address=uri=>{
    const site=store.get(uri.authority);
    if (!site) throw vscode.FileSystemError.FileNotFound(uri);
    return remotePath(site,uri.path);
  };
  const doRun=(uri,method,...args)=>run(uri.authority,method,...args);
  const notify=(uri,type)=>changes.fire([{type,uri}]);
  const audited=(uri,kind,label,fn)=>activity?activity.track({kind,siteName:store.get(uri.authority)?.name||'',label},fn):fn(()=>{});
  async function getStat(uri) {return doRun(uri,'stat',address(uri));}
  return {
    onDidChangeFile:changes.event,
    watch(){return new vscode.Disposable(()=>{});},
    async stat(uri) {
      if(uri.path === '/') {address(uri);return {type:vscode.FileType.Directory,ctime:0,mtime:0,size:0};}
      const result=await getStat(uri);
      if (!result) throw vscode.FileSystemError.FileNotFound(uri);
      return convert(result);
    },
    async readDirectory(uri) {
      const items=await doRun(uri,'list',address(uri));
      return items.map(e=>[e.name,e.external&&!store.get(uri.authority)?.followExternalLinks?vscode.FileType.SymbolicLink:convert(e).type]);
    },
    async readFile(uri) {
      const path=address(uri);
      const before=await doRun(uri,'stat',path);
      if (!before) throw vscode.FileSystemError.FileNotFound(uri);
      if (before.type==='directory') throw vscode.FileSystemError.FileIsADirectory(uri);
      if (before.type==='symlink' && before.broken) throw vscode.FileSystemError.Unavailable('This symbolic link has no reachable target.');
      const result=await audited(uri,'download',`Open ${uri.path}`,()=>doRun(uri,'read',path));
      const after=await doRun(uri,'stat',path);
      if (!after || (before.mtime && after.mtime && before.mtime !== after.mtime) || before.size !== after.size) {
        throw vscode.FileSystemError.Unavailable('Remote file changed during download; reopen to get a consistent copy.');
      }
      snapshots.set(key(uri),{size:after.size,mtime:after.mtime});
      return Uint8Array.from(result);
    },
    async writeFile(uri,content,options) {
      const path=address(uri);
      const existing=await doRun(uri,'stat',path);
      if (uri.path === '/' || (existing && existing.type==='directory')) throw vscode.FileSystemError.FileIsADirectory(uri);
      if (!existing && !options.create) throw vscode.FileSystemError.FileNotFound(uri);
      if (existing && !options.overwrite) throw vscode.FileSystemError.FileExists(uri);
      const baseline=snapshots.get(key(uri));
      if (existing && baseline && ((baseline.mtime && existing.mtime && baseline.mtime!==existing.mtime) || baseline.size!==existing.size)) {
        throw vscode.FileSystemError.Unavailable('The remote file changed since you opened it. Reopen or compare it before saving to avoid overwriting changes.');
      }
      await audited(uri,'upload',`Save ${uri.path}`,()=>doRun(uri,store.get(uri.authority)?.protocol==='sftp'?'writeStaged':'write',path,content));
      const after=await getStat(uri).catch(()=>null);
      snapshots.set(key(uri),after ? {size:after.size,mtime:after.mtime}:{size:content.length,mtime:0});
      notify(uri,existing?vscode.FileChangeType.Changed:vscode.FileChangeType.Created);
    },
    async createDirectory(uri) {
      if(uri.path==='/') throw vscode.FileSystemError.FileExists(uri);
      if (await getStat(uri)) throw vscode.FileSystemError.FileExists(uri);
      await audited(uri,'mkdir',`Create folder ${uri.path}`,()=>doRun(uri,'mkdir',address(uri)));notify(uri,vscode.FileChangeType.Created);
    },
    async delete(uri,options) {
      if(uri.path==='/') throw vscode.FileSystemError.NoPermissions('Cannot delete a site root.');
      const st=await getStat(uri);
      if (!st) throw vscode.FileSystemError.FileNotFound(uri);
      if (st.type==='directory' && !st.symlink) {
        if (!options.recursive && (await this.readDirectory(uri)).length) throw vscode.FileSystemError.NoPermissions('Directory is not empty.');
        await audited(uri,'delete',`Delete folder ${uri.path}`,()=>doRun(uri,'rmdir',address(uri)));
      } else await audited(uri,'delete',`Delete ${st.symlink?'link ':'file '}${uri.path}`,()=>doRun(uri,'unlink',address(uri)));
      snapshots.delete(key(uri));notify(uri,vscode.FileChangeType.Deleted);
    },
    async rename(oldUri,newUri,options) {
      if(oldUri.path==='/' || newUri.path==='/') throw vscode.FileSystemError.NoPermissions('Cannot rename a site root.');
      if (oldUri.authority!==newUri.authority) throw vscode.FileSystemError.NoPermissions('Moving files between different servers is not supported.');
      const existing=await getStat(oldUri);
      if (!existing) throw vscode.FileSystemError.FileNotFound(oldUri);
      const destination=await getStat(newUri);
      if (destination && !options.overwrite) throw vscode.FileSystemError.FileExists(newUri);
      if (destination) throw vscode.FileSystemError.NoPermissions('For safety, rename cannot overwrite an existing remote file. Rename or remove that destination first.');
      await audited(oldUri,'rename',`Rename ${oldUri.path} → ${newUri.path}`,()=>doRun(oldUri,'rename',address(oldUri),address(newUri)));
      snapshots.delete(key(oldUri));snapshots.delete(key(newUri));
      notify(oldUri,vscode.FileChangeType.Deleted);notify(newUri,vscode.FileChangeType.Created);
    },
    notifyModified:(uri,created=false)=>notify(uri,created?vscode.FileChangeType.Created:vscode.FileChangeType.Changed),
    dispose(){snapshots.clear();changes.dispose();}
  };
}
module.exports={makeFilesystem};
