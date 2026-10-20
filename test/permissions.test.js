'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {operation,SiteIO}=require('../src/connection');
test('SFTP permission reads return Unix bits, writes require safe octal range',async()=>{
 const seen=[];
 const client={stat:async p=>{seen.push(['stat',p]);return {mode:0o100644}},chmod:async(p,n)=>{seen.push(['chmod',p,n]);}};
 const connection={type:'sftp',client};
 assert.equal(await operation(connection,'getPermissions','/srv/site/index.html'),0o644);
 await operation(connection,'setPermissions','/srv/site/index.html',0o755);
 assert.deepEqual(seen,[['stat','/srv/site/index.html'],['chmod','/srv/site/index.html',0o755]]);
 await assert.rejects(operation(connection,'setPermissions','/srv/site/index.html',0o10000),/octal/);
 await assert.rejects(operation(connection,'setPermissions','/srv/site/index.html', '644'),/octal/);
 await assert.rejects(operation(connection,'getPermissions','relative'),/path/);
});
test('FTP permission editing explicitly fails instead of sending unsafe raw commands',async()=>{
 await assert.rejects(operation({type:'ftp',client:{}},'getPermissions','/test'),/SFTP only/);
 await assert.rejects(operation({type:'ftp',client:{}},'setPermissions','/test',0o600),/SFTP only/);
});
test('SFTP permissions cannot traverse an outside-root symlink',async()=>{
 let modified=false;
 const site={id:'s1',protocol:'sftp',root:'/srv/site',followExternalLinks:false};
 const io=new SiteIO({get:()=>site,password:async()=>'',passphrase:async()=>''},async()=>{},async()=>({type:'sftp',close:async()=>{},client:{
   realPath:async p=>p.startsWith('/srv/site/external')?'/etc/passwd':p,
   stat:async()=>({mode:0o100600}),chmod:async()=>{modified=true;}
 }}));
 await assert.rejects(io.run('s1','setPermissions','/srv/site/external',0o644),/Access blocked/);
 await assert.rejects(io.run('s1','getPermissions','/srv/site/external'),/Access blocked/);
 assert.equal(modified,false);
 await io.dispose();
});
