'use strict';
/**
 * SiteDock dependency preparation. Uses npm itself, rather than implementing
 * an npm registry client or tar parser. Dependencies are installed only once
 * into writable VS Code global storage and reused on all later activations.
 * Package lifecycle scripts and optional native dependencies are disabled.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');

const RUNTIME = Object.freeze({'basic-ftp':'6.2.3','ssh2-sftp-client':'12.1.1'});
const PACKAGES = Object.entries(RUNTIME).map(([name,version])=>`${name}@${version}`);
const MARKER_NAME = '.sitedock-runtime.json';
const PREP_TIMEOUT_MS = 90000;
let activeRoot = '';
let installPromise = null;
let pendingRoot = '';

function runNpm(cwd,log=()=>{},timeout=PREP_TIMEOUT_MS) {
  return new Promise((resolve,reject)=>{
    // All arguments are fixed in our source, not derived from server details.
    const args=['install','--no-save','--no-audit','--no-fund','--omit=optional',
      '--ignore-scripts','--prefer-offline','--loglevel=error',...PACKAGES];
    const windows=process.platform==='win32';
    const command=windows?'npm.cmd':'npm';
    let settled=false;
    let output='';
    const child=spawn(command,args,{
      cwd,
      shell:windows, // npm.cmd is a cmd script; argv contains literals only.
      windowsHide:true,
      env:{...process.env,npm_config_audit:'false',npm_config_fund:'false',npm_config_update_notifier:'false'},
      stdio:['ignore','pipe','pipe']
    });
    const done=(err)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      if(err)reject(err);else resolve();
    };
    const append=(data)=>{
      const chunk=String(data).replace(/\x1b\[[0-9;]*m/g,'');
      output=(output+chunk).slice(-7000);
      log(chunk);
    };
    const timer=setTimeout(()=>{
      child.kill();
      done(new Error('npm installation timed out after 90 seconds. Check your npm registry connection and the SiteDock output log.'));
    },timeout);
    child.stdout.on('data',append);
    child.stderr.on('data',append);
    child.on('error',err=>{
      done(err.code==='ENOENT' ? new Error('Node.js/npm is not available on PATH. Install Node.js LTS, restart VS Code, and try again.') : new Error(`Cannot run npm: ${err.message}`));
    });
    child.on('close',(code,signal)=>{
      if(code===0)done();
      else done(new Error(`npm install failed (${signal||`exit ${code}`}). ${output.trim().slice(-1300) || 'Check the SiteDock output log.'}`));
    });
  });
}

async function validRuntime(root,{marker=true}={}) {
  try {
    if(marker){
      const record=JSON.parse(await fs.readFile(path.join(root,MARKER_NAME),'utf8'));
      if(JSON.stringify(record.packages)!==JSON.stringify(RUNTIME))return false;
    }
    for(const [name,version] of Object.entries(RUNTIME)) {
      const info=require.resolve(`${name}/package.json`,{paths:[root]});
      if(JSON.parse(await fs.readFile(info,'utf8')).version!==version)return false;
      // Check dependency *loading*, including transitive dependencies.
      require(require.resolve(name,{paths:[root]}));
    }
    return true;
  }catch {return false;}
}

async function prepareRuntime(storageRoot,{installer=runNpm,log=()=>{},bundleRoot=path.resolve(__dirname,'..')}={}) {
  // Official VSIX builds bundle production dependencies. Prefer those libraries
  // to running npm on a customer's machine; legacy builds retain a fallback.
  if(await validRuntime(bundleRoot,{marker:false})) {
    activeRoot=bundleRoot;
    log('SiteDock: Using FTP/SFTP libraries bundled in the extension.\n');
    return {root:bundleRoot,installed:false,bundled:true};
  }
  if(!storageRoot || typeof storageRoot!=='string')throw new Error('SiteDock storage location is not available.');
  const root=path.resolve(storageRoot,'transport-v2');
  if(await validRuntime(root)) {activeRoot=root;return {root,installed:false};}
  // No partial installs are considered ready. Do not disturb saved sites and secrets.
  await fs.rm(root,{recursive:true,force:true});
  await fs.mkdir(root,{recursive:true});
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'sitedock-transport-runtime',version:'1.0.0',private:true}),{mode:0o600});
  try {
    log('SiteDock: Preparing FTP/SFTP libraries using npm (one-time).\n');
    await installer(root,log);
    for(const [name,version] of Object.entries(RUNTIME)) {
      const info=require.resolve(`${name}/package.json`,{paths:[root]});
      const actual=JSON.parse(await fs.readFile(info,'utf8')).version;
      if(actual!==version)throw new Error(`Expected ${name}@${version}, received ${actual}.`);
      require(require.resolve(name,{paths:[root]}));
    }
    await fs.writeFile(path.join(root,MARKER_NAME),JSON.stringify({packages:RUNTIME}),{mode:0o600});
    activeRoot=root;
    log('SiteDock: Libraries are ready. Later connections do not need npm.\n');
    return {root,installed:true};
  } catch(err) {
    activeRoot='';
    log(`SiteDock: Preparation failed: ${err.message}\n`);
    throw err;
  }
}

function ensureRuntime(storageRoot,options={}) {
  const canonical=path.resolve(storageRoot);
  if(installPromise && pendingRoot===canonical)return installPromise;
  if(installPromise && pendingRoot!==canonical)throw new Error('A different SiteDock runtime is already being prepared.');
  pendingRoot=canonical;
  installPromise=prepareRuntime(canonical,options).finally(()=>{installPromise=null;pendingRoot='';});
  return installPromise;
}
function loadLibrary(name) {
  if(!Object.hasOwn(RUNTIME,name))throw new Error(`Unsupported transport library: ${name}`);
  if(!activeRoot)throw new Error('Connection libraries have not been prepared. Use SiteDock: Install Connection Libraries.');
  return require(require.resolve(name,{paths:[activeRoot]}));
}
function diagnostics(){return {storage:activeRoot||'(not prepared)',packages:RUNTIME,installed:Boolean(activeRoot),bundled:Boolean(activeRoot && activeRoot===path.resolve(__dirname,'..'))};}
module.exports={ensureRuntime,prepareRuntime,loadLibrary,runNpm,diagnostics,RUNTIME};
