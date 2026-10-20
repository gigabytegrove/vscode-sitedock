'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {versionParts,compareVersions,releaseRepository,chooseRelease,parseChecksum}=require('../src/update-utils');
const {entry,validateVSIX,sha256}=require('../src/update-vsix');
const {createUpdater}=require('../src/updates');
const {approved}=require('../src/update-network');
const repo='gigabytegrove/vscode-sitedock';
const base=`https://github.com/${repo}/releases/`;
function release(version,options={}){
  const tag='v'+version,name=`sitedock-v${version}.vsix`;
  const expected='a'.repeat(64);
  return {tag_name:tag,html_url:base+'tag/'+tag,prerelease:version.includes('-'),draft:false,body:'Release summary',assets:[
    {name,state:'uploaded',size:1024,digest:`sha256:${expected}`,browser_download_url:base+`download/${tag}/${name}`},
    {name:name+'.sha256',state:'uploaded',size:100,browser_download_url:base+`download/${tag}/${name}.sha256`}
  ],...options};
}
// Minimal valid ZIP built using only Node. Used to exercise actual manifest parser.
function zip(entries){
  const local=[],directory=[];let off=0;
  for(const [name,text] of Object.entries(entries)){
    const n=Buffer.from(name),data=Buffer.from(text);
    const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt32LE(0,14);
    lh.writeUInt32LE(data.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(n.length,26);
    local.push(lh,n,data);
    const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);
    cd.writeUInt32LE(data.length,20);cd.writeUInt32LE(data.length,24);cd.writeUInt16LE(n.length,28);cd.writeUInt32LE(off,42);
    directory.push(cd,n);off+=lh.length+n.length+data.length;
  }
  const count=Object.keys(entries).length,size=directory.reduce((a,b)=>a+b.length,0);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(size,12);end.writeUInt32LE(off,16);
  return Buffer.concat([...local,...directory,end]);
}
const vsix=(version='0.3.1',publisher='GigabyteGrove',name='sitedock',identityPublisher=publisher)=>zip({
  'extension/package.json':JSON.stringify({name,publisher,version,engines:{vscode:'^1.100.0'}}),
  'extension.vsixmanifest':`<?xml version=\"1.0\"?><PackageManifest><Metadata><Identity Publisher=\"${identityPublisher}\" Id=\"${name}\" Version=\"${version}\" /></Metadata></PackageManifest>`
});
test('semver comparison correctly orders stable, beta and numeric pre-releases',()=>{
  assert.ok(compareVersions('0.3.1','0.3.0')>0);
  assert.ok(compareVersions('v0.3.1-beta.10','0.3.1-beta.2')>0);
  assert.ok(compareVersions('0.3.1','0.3.1-rc.9')>0);
  assert.ok(compareVersions('0.3.1-alpha.1','0.3.1-alpha')>0);
  assert.equal(compareVersions('v1.2.3+build.42','1.2.3'),0);
  assert.equal(versionParts('1.2.3-01'),null);
  assert.equal(versionParts('1.2.3.4'),null);
  assert.throws(()=>compareVersions('invalid','1.0.0'));
});
test('stable channel ignores prereleases, beta includes them but neither downgrades',()=>{
  const items=[release('0.3.1-beta.2'),release('0.3.0'),release('0.2.9')];
  assert.equal(chooseRelease(items,{currentVersion:'0.2.0',repository:repo,channel:'stable'}).version,'0.3.0');
  assert.equal(chooseRelease(items,{currentVersion:'0.2.0',repository:repo,channel:'beta'}).version,'0.3.1-beta.2');
  assert.equal(chooseRelease(items,{currentVersion:'0.3.1',repository:repo,channel:'beta'}),null);
  assert.equal(chooseRelease([release('0.3.1-beta.1')],{currentVersion:'0.3.1-beta.2',repository:repo,channel:'beta'}),null);
});
test('invalid releases, missing integrity, draft releases and ambiguous VSIX are rejected',()=>{
  const ambiguous=release('0.3.1');ambiguous.assets.push({...ambiguous.assets[0],name:'sitedock-other.vsix'});
  const noHash=release('0.3.1');noHash.assets[0].digest=null;noHash.assets.pop();
  const hijack=release('0.3.1');hijack.assets[0].browser_download_url='https://attacker.invalid/sitedock.vsix';
  const untrusted=release('0.3.1');untrusted.html_url='https://attacker.invalid/release';
  for(const item of [ambiguous,noHash,hijack,untrusted,release('0.3.1',{draft:true})])
    assert.equal(chooseRelease([item],{currentVersion:'0.3.0',repository:repo}),null);
  assert.equal(chooseRelease([release('0.3.1')],{currentVersion:'0.3.0',repository:repo}).version,'0.3.1');
});
test('repository and download URLs reject non-GitHub origins, credentials, ports and HTTP',()=>{
  for(const input of ['http://github.com/x','https://github.com:8443/x','https://evil.com','https://u:p@github.com/x'])
    assert.throws(()=>approved(input,'asset'));
  assert.throws(()=>approved('https://github.com/x','api'));
  assert.throws(()=>releaseRepository('https://github.com/a/b'));
  assert.throws(()=>releaseRepository('a/b/../c'));
  assert.equal(releaseRepository(repo),repo);
  assert.equal(approved('https://release-assets.githubusercontent.com/something','asset').hostname,'release-assets.githubusercontent.com');
});
test('checksum parser requires exactly one matching SHA-256 for the exact VSIX filename',()=>{
  const name='sitedock-v0.3.1.vsix',hash='f'.repeat(64);
  assert.equal(parseChecksum(`${hash}  ${name}\n`,name),hash);
  assert.throws(()=>parseChecksum(`${hash}  other.vsix`,name));
  assert.throws(()=>parseChecksum(`${hash}  ${name}\n${hash}  ${name}`,name));
});
test('VSIX validation rejects incorrect publisher, name, version, and malformed payload',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-vsix-test-'));
  const dest=path.join(dir,'sample.vsix');
  try{
    const expected=vsix();await fs.writeFile(dest,expected);
    assert.equal(entry(expected,'extension/package.json').includes('GigabyteGrove'),true);
    assert.equal((await validateVSIX(dest,{version:'0.3.1'})).name,'sitedock');
    assert.equal(await sha256(dest),crypto.createHash('sha256').update(expected).digest('hex'));
    for(const [data,match] of [[vsix('0.3.1','fakePublisher'),/publisher/],[vsix('0.3.1','GigabyteGrove','other'),/publisher/],[vsix('0.3.0'),/version/],[vsix('0.3.1','GigabyteGrove','sitedock','evilPublisher'),/Marketplace identity/],[Buffer.from('notzip'),/size|ZIP/]]){
      await fs.writeFile(dest,data);
      await assert.rejects(validateVSIX(dest,{version:'0.3.1'}),match);
    }
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
function mockClient(temp,opts={}){
  const callbacks=[];const events=[];const saved=new Map();const settings={enabled:true,channel:'stable',repository:repo,checkIntervalHours:12,autoInstall:false,...opts.settings};
  const vscode={
    ProgressLocation:{Notification:1},Uri:{file:x=>({fsPath:x,scheme:'file'}),parse:x=>({value:x})},
    workspace:{getConfiguration:()=>({get:(key,otherwise)=>settings[key]??otherwise}),onDidChangeConfiguration:fn=>{callbacks.push(fn);return {dispose(){}};}},
    env:{openExternal:async uri=>{events.push(['notes',uri]);return true;}},
    commands:{executeCommand:async(id,uri)=>{events.push(['command',id,uri]);return true;}},
    window:{showInformationMessage:async(...args)=>{events.push(['message',...args]);return opts.responses?.shift()||undefined;},showWarningMessage:async text=>{events.push(['warning',text]);},withProgress:async(o,run)=>run()}
  };
  const ctx={extension:{packageJSON:{version:'0.3.0'}},globalStorageUri:{fsPath:temp},globalState:{get:(id,fallback)=>saved.get(id)??fallback,update:async(id,val)=>saved.set(id,val)}};
  return {vscode,ctx,settings,events,saved,callbacks};
}
function updaterWith(api,client,extra={}){
  return createUpdater(client.vscode,client.ctx,{appendLine(){}},{api,now:()=>100000000,timer:()=>({unref(){}}),startTimer:()=>({unref(){}}),...extra});
}
test('manual check downloads, verifies digest, inspects VSIX, installs and prompts reload',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-update-integration-'));
  try{
    const bytes=vsix();const hash=crypto.createHash('sha256').update(bytes).digest('hex');const available=release('0.3.1');available.assets[0].digest='sha256:'+hash;
    const client=mockClient(dir,{responses:['Install Update','Reload Window']});
    const api={listReleases:async()=>[available],downloadFile:async(_url,file)=>fs.writeFile(file,bytes)};
    const updater=updaterWith(api,client);
    await updater.check({manual:true});
    assert.ok(client.events.some(e=>e[0]==='command'&&e[1]==='workbench.extensions.installExtension'));
    assert.ok(client.events.some(e=>e[0]==='command'&&e[1]==='workbench.action.reloadWindow'));
    assert.deepEqual(await fs.readdir(dir),[],'download staging must be cleaned');
    updater.dispose();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('a bad GitHub digest blocks installation and removes temporary files',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-update-failed-'));
  try{
    const client=mockClient(dir,{responses:['Install Update']});
    const api={listReleases:async()=>[release('0.3.1')],downloadFile:async(_url,file)=>fs.writeFile(file,vsix())};
    const updater=updaterWith(api,client);
    await assert.rejects(updater.check({manual:true}),/SHA-256 mismatch/);
    assert.equal(client.events.some(e=>e[1]==='workbench.extensions.installExtension'),false);
    assert.deepEqual(await fs.readdir(dir),[]);updater.dispose();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('manual private-repository error is actionable and disabled automatic checks do not call GitHub',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-update-disabled-'));
  try{
    const client=mockClient(dir,{settings:{enabled:false}});let count=0;
    const api={listReleases:async()=>{count++;throw new Error('GitHub returned HTTP 404 (repository/release unavailable or private).');}};
    const updater=updaterWith(api,client);
    await updater.check();assert.equal(count,0);
    await assert.rejects(updater.check({manual:true}),/404/);
    updater.dispose();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('checksum sidecar fallback verifies release without GitHub asset digest',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-update-sidecar-'));
  try{
    const bytes=vsix(), hash=crypto.createHash('sha256').update(bytes).digest('hex');
    const available=release('0.3.1');available.assets[0].digest=null;
    const client=mockClient(dir,{responses:['Install Update','Later']});
    const api={listReleases:async()=>[available],readChecksum:async()=>`${hash}  sitedock-v0.3.1.vsix`,downloadFile:async(_url,file)=>fs.writeFile(file,bytes)};
    const updater=updaterWith(api,client);
    await updater.check({manual:true});
    assert.ok(client.events.some(e=>e[1]==='workbench.extensions.installExtension'));
    updater.dispose();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('automatic checks honor selected interval and do not repeat notifications in session',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-update-throttle-'));
  try{
    const client=mockClient(dir);let count=0;
    const api={listReleases:async()=>{count++;return [release('0.3.1')];}};
    const updater=updaterWith(api,client);
    await updater.check();await updater.check();
    assert.equal(count,1);
    assert.equal(client.events.filter(e=>e[0]==='message').length,1);
    updater.dispose();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('embedded Site Manager check reports actionable status without a duplicate VS Code popup',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-ui-check-'));
  try{
    const bytes=vsix(),hash=crypto.createHash('sha256').update(bytes).digest('hex');
    const item=release('0.3.1');item.assets[0].digest='sha256:'+hash;
    const client=mockClient(dir,{responses:['Later']});
    const api={listReleases:async()=>[item],downloadFile:async(_url,file)=>fs.writeFile(file,bytes)};
    const updater=updaterWith(api,client);
    const statuses=[];const subscription=updater.onStatusChange(status=>statuses.push(status));
    assert.equal(updater.status().phase,'idle');
    await updater.check({manual:true,prompt:false});
    assert.deepEqual(statuses.map(s=>s.phase),['checking','available']);
    assert.equal(updater.status().latestVersion,'0.3.1');
    assert.equal(client.events.some(e=>e[0]==='message'),false);
    await updater.installAvailable();
    assert.equal(updater.status().phase,'installed');
    assert.equal(client.events.some(e=>e[1]==='workbench.extensions.installExtension'),true);
    await assert.rejects(updater.installAvailable(),/No verified update/);
    subscription.dispose();updater.dispose();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('private release feed reports an error status, not falsely up-to-date',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-ui-error-'));
  try{
    const client=mockClient(dir);
    const updater=updaterWith({listReleases:async()=>{throw new Error('GitHub returned HTTP 404 (repository unavailable or private)');}},client);
    await assert.rejects(updater.check({manual:true,prompt:false}),/404/);
    assert.equal(updater.status().phase,'error');
    assert.match(updater.status().error,/404/);
    await assert.rejects(updater.installAvailable(),/No verified update/);
    updater.dispose();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('update settings change clears stale install choices and publishes idle state',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sitedock-ui-settings-'));
  try{
    const client=mockClient(dir);
    const updater=updaterWith({listReleases:async()=>[release('0.3.1')]},client);
    await updater.check({manual:true,prompt:false});
    assert.equal(updater.status().phase,'available');
    client.callbacks[0]({affectsConfiguration:key=>key==='sitedock.updates'});
    assert.equal(updater.status().phase,'idle');
    await assert.rejects(updater.installAvailable(),/No verified update/);
    updater.dispose();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('v0.3.1 clients can discover newer releases in the original public repo',()=>{
  const {DEFAULT_REPOSITORY}=require('../src/updates');
  assert.equal(DEFAULT_REPOSITORY,'gigabytegrove/vscode-sitedock');
  const pkg=require('../package.json');
  assert.equal(pkg.contributes.configuration.properties['sitedock.updates.repository'].default,DEFAULT_REPOSITORY);
  const next=chooseRelease([release('0.4.0')],{currentVersion:'0.3.1',repository:DEFAULT_REPOSITORY,channel:'stable'});
  assert.equal(next.version,'0.4.0');
  assert.equal(next.releaseUrl,`https://github.com/${DEFAULT_REPOSITORY}/releases/tag/v0.4.0`);
});
