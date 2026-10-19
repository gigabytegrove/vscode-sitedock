'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ensureRuntime,prepareRuntime,loadLibrary,diagnostics,runNpm,RUNTIME}=require('../src/runtime');

const makeRoot=()=>fs.mkdtemp(path.join(os.tmpdir(),'sitedock-transport-'));
async function fakeInstaller(root,log=()=>{}){
  for(const [name,version] of Object.entries(RUNTIME)){
    const loc=path.join(root,'node_modules',name);
    await fs.mkdir(loc,{recursive:true});
    await fs.writeFile(path.join(loc,'package.json'),JSON.stringify({name,version,main:'index.js'}));
    await fs.writeFile(path.join(loc,'index.js'),`module.exports={name:${JSON.stringify(name)},version:${JSON.stringify(version)}};`);
  }
  log('npm packages installed.\n');
}

test('prepared libraries load without a new installer run',async()=>{
  const root=await makeRoot();let installs=0;
  try {
    const first=await ensureRuntime(root,{installer:async(dir)=>{installs++;await fakeInstaller(dir);}});
    assert.equal(first.installed,true);
    assert.equal(loadLibrary('basic-ftp').name,'basic-ftp');
    assert.equal(loadLibrary('ssh2-sftp-client').name,'ssh2-sftp-client');
    assert.equal(diagnostics().installed,true);
    const second=await ensureRuntime(root,{installer:async()=>{throw new Error('installer must not rerun');}});
    assert.equal(second.installed,false);
    assert.equal(installs,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('simultaneous callers share one install',async()=>{
  const root=await makeRoot();let installs=0;
  try {
    const installer=async dir=>{installs++;await new Promise(resolve=>setTimeout(resolve,20));await fakeInstaller(dir);};
    const [a,b]=await Promise.all([ensureRuntime(root,{installer}),ensureRuntime(root,{installer})]);
    assert.equal(a.root,b.root);assert.equal(installs,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('failed installation does not write a ready marker and can retry',async()=>{
  const root=await makeRoot();
  try{
    await assert.rejects(ensureRuntime(root,{installer:async()=>{throw new Error('simulated npm failure');}}),/simulated npm failure/);
    await assert.rejects(fs.access(path.join(root,'transport-v2','.sitedock-runtime.json')));
    await ensureRuntime(root,{installer:fakeInstaller});
    assert.equal(loadLibrary('basic-ftp').name,'basic-ftp');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('invalid cached library version triggers reinstall',async()=>{
  const root=await makeRoot();
  try {
    await prepareRuntime(root,{installer:fakeInstaller});
    const p=path.join(root,'transport-v2','node_modules','basic-ftp','package.json');
    await fs.writeFile(p,JSON.stringify({name:'basic-ftp',version:'1.0.0',main:'index.js'}));
    const result=await prepareRuntime(root,{installer:fakeInstaller});
    assert.equal(result.installed,true);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('unsupported libraries cannot be loaded',()=>{
  assert.throws(()=>loadLibrary('arbitrary-dependency'),/Unsupported transport library/);
});

test('the obsolete npm archive parser and its error are absent from shipped runtime',async()=>{
  const code=await fs.readFile(path.join(__dirname,'../src/runtime.js'),'utf8');
  assert.doesNotMatch(code,/Invalid npm archive path prefix|unpackTarball|zlib\.gunzip/);
  assert.match(code,/spawn\(command,args/);
});


test('npm subprocess receives one safe, script-disabled installation request',async()=>{
  if(process.platform==='win32')return; // Windows npm.cmd uses cmd.exe
  const root=await makeRoot();
  const bin=path.join(root,'fake-bin');
  const oldPath=process.env.PATH;
  try {
    await fs.mkdir(bin);
    const script=path.join(bin,'npm');
    await fs.writeFile(script,'#!/bin/sh\nprintf "%s\\n" "$@" > npm-invocation.txt\necho "mock installer complete"\n');
    await fs.chmod(script,0o700);
    process.env.PATH=bin+path.delimiter+oldPath;
    let output='';
    await runNpm(root,s=>output+=s,2500);
    assert.match(output,/mock installer complete/);
    const flags=(await fs.readFile(path.join(root,'npm-invocation.txt'),'utf8')).split('\n');
    assert.ok(flags.includes('install'));
    for(const option of ['--ignore-scripts','--omit=optional','--no-audit','--no-fund'])assert.ok(flags.includes(option),option);
    for(const [name,version] of Object.entries(RUNTIME)) assert.ok(flags.includes(`${name}@${version}`));
  }finally{process.env.PATH=oldPath;await fs.rm(root,{recursive:true,force:true});}
});
