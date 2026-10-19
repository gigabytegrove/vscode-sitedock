'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {operation,sftpStat}=require('../src/connection');
const {makeFilesystem}=require('../src/filesystem');
const {SiteTree}=require('../src/tree');
class EventEmitter {constructor(){this.event=()=>{};}fire(){}dispose(){}}
const FileType={Unknown:0,File:1,Directory:2,SymbolicLink:64};
const FileSystemError=Object.fromEntries(['FileNotFound','FileExists','FileIsADirectory','NoPermissions','Unavailable'].map(n=>[n,()=>Object.assign(new Error(n),{code:n})]));
const vscode={EventEmitter,FileType,FileSystemError,FileChangeType:{Created:1,Changed:2,Deleted:3},Disposable:class{dispose(){}},TreeItem:class{constructor(label,state){this.label=label;this.collapsibleState=state;}},TreeItemCollapsibleState:{None:0,Collapsed:1},ThemeIcon:class{constructor(id){this.id=id;}},Uri:{from:opts=>opts}};
function fixture(){
  const file=Buffer.from('website html');const deleted=[];
  const st=(type,size=0)=>({mode:type==='directory'?0o040755:type==='symlink'?0o120777:0o100644,size,modifyTime:1234});
  const client={
    list:async p=>{
      if(p==='/var/www')return [{name:'site-link',type:'l',size:9},{name:'file-link',type:'l',size:9},{name:'broken',type:'l',size:9},{name:'index.html',type:'-',size:12}];
      if(p==='/var/www/site-link')return [{name:'index.html',type:'-',size:file.length}];
      return [];
    },
    lstat:async p=>{
      if(p.endsWith('/site-link')||p.endsWith('/file-link')||p.endsWith('/broken'))return st('symlink');
      if(p.endsWith('.html'))return st('file',file.length);
      return st('directory');
    },
    stat:async p=>{
      if(p.endsWith('/site-link'))return st('directory');
      if(p.endsWith('/file-link'))return st('file',file.length);
      if(p.endsWith('/broken'))throw Object.assign(new Error('No such file'),{code:2});
      return p.endsWith('.html')?st('file',file.length):st('directory');
    },
    get:async()=>file,
    realPath:async p=>p==='/var/www/site-link'?'/srv/sites/web1':p==='/var/www/site-link/up'?'/var/www':'/var/www',
    delete:async p=>{deleted.push(p);},
    rmdir:async()=>{throw new Error('A directory link must never be recursively removed');}
  };
  const session={type:'sftp',client};
  const store={get:id=>id==='site1'?{id:'site1',root:'/var/www',protocol:'sftp',name:'Test'}:null,all:()=>[{id:'site1',root:'/var/www',protocol:'sftp',name:'Test'}]};
  const run=async(_site,method,...args)=>operation(session,method,...args);
  const fs=makeFilesystem(vscode,store,null,run);
  const uri=path=>({scheme:'sitedock',authority:'site1',path});
  return {file,client,deleted,session,store,run,fs,uri};
}
test('SFTP lstat follows an existing directory link for browsing, preserving the link bit',async()=>{
 const f=fixture();const st=await f.fs.stat(f.uri('/site-link'));
 assert.equal(st.type,FileType.Directory|FileType.SymbolicLink);
 assert.deepEqual(await f.fs.readDirectory(f.uri('/site-link')),[['index.html',FileType.File]]);
 assert.equal(Buffer.from(await f.fs.readFile(f.uri('/site-link/index.html'))).toString(),'website html');
});
test('linked regular file can open in VS Code with the symbolic-link bit',async()=>{
 const f=fixture();assert.equal((await f.fs.stat(f.uri('/file-link'))).type,FileType.File|FileType.SymbolicLink);
 assert.equal(Buffer.from(await f.fs.readFile(f.uri('/file-link'))).toString(),'website html');
});
test('dangling link stays visible and refuses file opening',async()=>{
 const f=fixture();const result=await f.fs.stat(f.uri('/broken'));
 assert.equal(result.type,FileType.SymbolicLink);
 await assert.rejects(f.fs.readFile(f.uri('/broken')),e=>e.code==='Unavailable');
});
test('delete on a symlinked directory unlinks the link without deleting its destination',async()=>{
 const f=fixture();await f.fs.delete(f.uri('/site-link'),{recursive:true});
 assert.deepEqual(f.deleted,['/var/www/site-link']);
});
test('recursive deletion of a real folder unlinks symbolic links inside it',async()=>{
 const f=fixture();f.client.list=async p=>p==='/var/www'? [{name:'site-link',type:'l'}]:[];
 f.client.rmdir=async()=>{};
 await operation(f.session,'rmdir','/var/www');
 assert.deepEqual(f.deleted,['/var/www/site-link']);
});
test('site tree presents directory links as expandable and linked files as openable',async()=>{
 const f=fixture();const tree=new SiteTree(vscode,f.store,f.run);
 const children=await tree.getChildren({kind:'site',id:'site1'});
 const folder=children.find(x=>x.name==='site-link');
 const file=children.find(x=>x.name==='file-link');
 assert.equal(folder.type,'directory');assert.equal(folder.symlink,true);
 assert.equal(tree.getTreeItem(folder).collapsibleState,1);
 assert.equal(tree.getTreeItem(file).command.command,'sitedock.open');
 assert.equal(tree.getTreeItem(folder).contextValue,'sitedock.directoryLink');
 assert.equal(tree.getTreeItem(children.find(x=>x.name==='broken')).command,undefined);
});
test('tree blocks loops when a symbolic link resolves back to an ancestor',async()=>{
 const f=fixture();f.client.list=async p=>p==='/var/www'?[{name:'back',type:'l'}]:[];
 f.client.stat=async()=>({mode:0o040755,size:0,modifyTime:1});
 f.client.lstat=async()=>({mode:0o120777,size:0,modifyTime:1});
 f.client.realPath=async()=>'/var/www';
 const tree=new SiteTree(vscode,f.store,f.run);
 const site={kind:'site',id:'site1'};
 const children=await tree.getChildren(site);
 assert.equal(children.length,1);
 assert.deepEqual(await tree.getChildren(children[0]),[]);
});
test('missing symlink targets do not masquerade as directories',async()=>{
 const f=fixture();assert.deepEqual(await sftpStat(f.client,'/var/www/broken'),{type:'symlink',size:0,mtime:1234,symlink:true,broken:true});
});
test('one inaccessible symlink does not prevent listing other files',async()=>{
 const f=fixture();
 f.client.stat=async p=>{if(p.endsWith('/site-link'))throw new Error('Permission denied');return {mode:0o100644,size:1,modifyTime:1};};
 const entries=await operation(f.session,'list','/var/www');
 assert.equal(entries.find(x=>x.name==='site-link').unresolved,true);
 assert.equal(entries.find(x=>x.name==='index.html').type,'file');
});
