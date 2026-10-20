#!/usr/bin/env node
'use strict';
// Create official VSIX and SHA-256 sidecar for GitHub Releases (no GitHub Actions).
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {sha256,validateVSIX}=require('../src/update-vsix');
const pkg=require('../package.json');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const filename=`sitedock-v${pkg.version}.vsix`;
function exec(program,args){
  const result=spawnSync(program,args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${program} failed with exit code ${result.status}.`);
}
async function main(){
  if(!fs.existsSync(path.join(root,'node_modules','.bin',process.platform==='win32'?'vsce.cmd':'vsce'))){
    throw new Error('Install the local dependencies first: npm install --include=dev');
  }
  exec(process.platform==='win32'?'npm.cmd':'npm',['run','check']);
  fs.mkdirSync(dist,{recursive:true});
  const output=path.join(dist,filename);
  if(fs.existsSync(output))fs.unlinkSync(output);
  exec(path.join(root,'node_modules','.bin',process.platform==='win32'?'vsce.cmd':'vsce'),['package','--allow-missing-repository','--out',output]);
  await validateVSIX(output,{version:pkg.version});
  const hash=await sha256(output);
  fs.writeFileSync(output+'.sha256',`${hash}  ${filename}\n`,{mode:0o600});
  console.log(`\nOFFICIAL VSIX VERIFIED: ${output}`);
  console.log(`SHA-256: ${hash}`);
  console.log(`Checksum: ${output}.sha256`);
  console.log('Publish both assets together using npm run release:publish -- --repo OWNER/REPOSITORY');
}
main().catch(err=>{console.error(`RELEASE BUILD FAILED: ${err.message}`);process.exitCode=1;});
