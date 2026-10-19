'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path').posix;
const {SiteIO,insideRoot}=require('../src/connection');
const {SiteTree}=require('../src/tree');
const {validateSite}=require('../src/storage');

function mockServer(allow=false) {
  const site={id:'s1',name:'Server',protocol:'sftp',host:'example.invalid',port:22,user:'tester',root:'/var/www',auth:'password',followExternalLinks:allow};
  const visited=[];
  const file=Buffer.from('visible');
  const canonical=(p)=>{
    if(p==='/var/www')return '/srv/hosted';
    if(p.startsWith('/var/www/linked-root'))return '/'+p.slice('/var/www/linked-root'.length).replace(/^\//,'');
    if(p.startsWith('/var/www/other'))return '/srv/other'+p.slice('/var/www/other'.length);
    if(p.startsWith('/var/www/linked-site'))return '/srv/hosted/site'+p.slice('/var/www/linked-site'.length);
    if(p.startsWith('/var/www'))return '/srv/hosted'+p.slice('/var/www'.length);
    return p;
  };
  const exists=new Set(['/var/www','/var/www/linked-root','/var/www/linked-site','/var/www/other','/var/www/index.html','/var/www/linked-root/etc/passwd','/var/www/linked-site/index.html']);
  const client={
    realPath:async p=>exists.has(p)||p==='/var/www/linked-root' || p==='/var/www/linked-site' ? canonical(p):'',
    list:async p=>{visited.push(['list',p]);return p==='/var/www'?[{name:'linked-root',type:'l',size:0,modifyTime:1},{name:'linked-site',type:'l',size:0,modifyTime:1},{name:'index.html',type:'-',size:file.length,modifyTime:1}]:[{name:'index.html',type:'-',size:file.length,modifyTime:1}];},
    stat:async p=>({mode:p.endsWith('/linked-root')||p.endsWith('/linked-site')?0o040755:0o100644,size:7,modifyTime:1}),
    lstat:async p=>({mode:p.endsWith('/linked-root')||p.endsWith('/linked-site')?0o120777:0o100644,size:7,modifyTime:1}),
    get:async p=>{visited.push(['read',p]);return file;},
    put:async(_content,p)=>{visited.push(['write',p]);},
    delete:async p=>{visited.push(['delete',p]);},
    mkdir:async p=>{visited.push(['mkdir',p]);},
    rename:async(a,b)=>{visited.push(['rename',a,b]);},
  };
  const store={get:()=>site, password:async()=> 'secret',passphrase:async()=>undefined};
  const io=new SiteIO(store,async()=>{},async()=>({type:'sftp',client,close:async()=>{}}));
  return {site,visited,io,client};
}

test('canonical containment handles sibling-prefix bypasses and root correctly',()=>{
  assert.equal(insideRoot('/srv/hosted','/srv/hosted'),true);
  assert.equal(insideRoot('/srv/hosted','/srv/hosted/sub/index'),true);
  assert.equal(insideRoot('/srv/hosted','/srv/hosted-backup'),false);
  assert.equal(insideRoot('/srv/hosted','/etc/passwd'),false);
  assert.equal(insideRoot('/','/etc/passwd'),true);
  assert.equal(insideRoot('/srv/hosted','relative'),false);
});
test('existing sites do not implicitly opt in to external links',()=>{
 const a=validateSite({name:'Site',host:'example.invalid',protocol:'sftp',user:'tester',root:'/var/www'});
 assert.equal(a.followExternalLinks,false);
 assert.equal(validateSite({...a,followExternalLinks:true}).followExternalLinks,true);
 assert.equal(validateSite({...a,followExternalLinks:'true'}).followExternalLinks,false);
});
test('out-of-root symlink is visible but classified as external',async()=>{
 const f=mockServer();
 const entries=await f.io.run('s1','list','/var/www');
 assert.deepEqual(entries.map(e=>[e.name,Boolean(e.external)]),[['linked-root',true],['linked-site',false],['index.html',false]]);
 assert.equal(entries[0].target,'/');
 await f.io.dispose();
});
test('direct external root traversal blocked before listing',async()=>{
 const f=mockServer();
 await assert.rejects(f.io.run('s1','list','/var/www/linked-root'),/Access blocked/);
 assert.deepEqual(f.visited.filter(e=>e[0]==='list'),[]);
 await f.io.dispose();
});
test('direct external file opening blocked before reading bytes',async()=>{
 const f=mockServer();
 await assert.rejects(f.io.run('s1','read','/var/www/linked-root/etc/passwd'),/Access blocked/);
 assert.deepEqual(f.visited.filter(e=>e[0]==='read'),[]);
 await f.io.dispose();
});
test('normal file and internally linked website file remain readable',async()=>{
 const f=mockServer();
 assert.equal((await f.io.run('s1','read','/var/www/index.html')).toString(),'visible');
 assert.equal((await f.io.run('s1','read','/var/www/linked-site/index.html')).toString(),'visible');
 await f.io.dispose();
});
test('out-of-root writes, mkdir and uploads denied, without touching outside target',async()=>{
 const f=mockServer();
 await assert.rejects(f.io.run('s1','write','/var/www/linked-root/etc/passwd',Buffer.from('x')),/Access blocked/);
 await assert.rejects(f.io.run('s1','mkdir','/var/www/linked-root/newdir'),/Access blocked/);
 await assert.rejects(f.io.run('s1','uploadLocal','/tmp/file','/var/www/linked-root/etc/passwd',()=>{}),/Access blocked/);
 assert.equal(f.visited.length,0);
 await f.io.dispose();
});
test('removing external symlink operates on the link, never its target',async()=>{
 const f=mockServer();
 await f.io.run('s1','unlink','/var/www/linked-root');
 assert.deepEqual(f.visited,[['delete','/var/www/linked-root']]);
 await f.io.dispose();
});
test('explicit opt in follows external symlink',async()=>{
 const f=mockServer(true);
 assert.deepEqual(await f.io.run('s1','list','/var/www/linked-root'),[{name:'index.html',type:'file',size:7,mtime:1,symlink:false}]);
 await f.io.dispose();
});
test('VS Code tree marks out-of-root links as non-expandable and unopenable',async()=>{
 const f=mockServer();
 const vscode={EventEmitter:class{constructor(){this.event=()=>{};}fire(){}dispose(){}},TreeItem:class{constructor(label,state){this.label=label;this.collapsibleState=state;}},TreeItemCollapsibleState:{Collapsed:1,None:0},ThemeIcon:class{constructor(id){this.id=id;}},Uri:{from:o=>o}};
 const tree=new SiteTree(vscode,{get:()=>f.site,all:()=>[f.site]},(id,method,...args)=>f.io.run(id,method,...args));
 const nodes=await tree.getChildren({kind:'site',id:'s1'});
 const external=nodes.find(x=>x.name==='linked-root');
 assert.equal(external.external,true);
 const item=tree.getTreeItem(external);
 assert.equal(item.collapsibleState,0);
 assert.equal(item.description,'outside site root');
 assert.match(item.tooltip,/Target: \/\nBlocked:/);
 assert.equal(item.contextValue,'sitedock.outsideLink');
 assert.equal(item.command,undefined);
 assert.deepEqual(await tree.getChildren(external),[]);
 tree.dispose();await f.io.dispose();
});
test('blocked path does not drop the healthy SSH connection',async()=>{
 const f=mockServer();let initial=f.io.sessions.size;
 await assert.rejects(f.io.run('s1','list','/var/www/linked-root'),/Access blocked/);
 assert.equal(f.io.sessions.get('s1').session.client,f.client);
 assert.equal((await f.io.run('s1','read','/var/www/index.html')).toString(),'visible');
 assert.deepEqual(f.visited,[['read','/var/www/index.html']]);
 await f.io.dispose();
});
