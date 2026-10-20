#!/usr/bin/env node
'use strict';
// Create a GitHub Release with an official checksum-verified VSIX. Does not use CI.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {releaseRepository,versionParts}=require('../src/update-utils');
const pkg=require('../package.json');
const args=process.argv.slice(2);
function option(flag,fallback){const at=args.indexOf(flag);return at<0?fallback:args[at+1];}
function invoke(commands,{json=false}={}){
  const r=spawnSync(process.platform==='win32'?'gh.exe':'gh',commands,{encoding:'utf8',shell:false,maxBuffer:3e6});
  if(r.error)throw r.error;
  if(r.status!==0)throw new Error(`gh ${commands[0]} failed: ${(r.stderr||'').trim().slice(0,700)}`);
  return json?JSON.parse(r.stdout):r.stdout.trim();
}
async function main(){
  const repo=releaseRepository(option('--repo','gigabytegrove/vscode-sitedock'));
  const tag=`v${pkg.version}`;
  const prerelease=Boolean(versionParts(pkg.version).pre.length);
  const vsix=path.resolve(__dirname,'..','dist',`sitedock-v${pkg.version}.vsix`);
  const checksum=vsix+'.sha256';
  if(!fs.existsSync(vsix)||!fs.existsSync(checksum))throw new Error('Build official VSIX and checksum first: npm run release:build');
  const {sha256,validateVSIX}=require('../src/update-vsix');
  const {parseChecksum}=require('../src/update-utils');
  const actual=await sha256(vsix);
  const expected=parseChecksum(fs.readFileSync(checksum,'utf8'),path.basename(vsix));
  if(actual!==expected)throw new Error('Release checksum verification failed.');
  await validateVSIX(vsix,{version:pkg.version});
  const metadata=invoke(['repo','view',repo,'--json','visibility,isPrivate,defaultBranchRef'],{json:true});
  if(metadata.isPrivate||metadata.visibility==='PRIVATE')throw new Error(`Repository ${repo} is private. Anonymous VS Code clients cannot download releases. Use a PUBLIC release repository.`);
  const branch=metadata.defaultBranchRef?.name;
  if(!branch)throw new Error('The public release repository must have an initialized default branch.');
  const notes=path.resolve(__dirname,'..','RELEASE_NOTES.md');
  const releaseArgs=['release','create',tag,vsix,checksum,'--repo',repo,'--title',`SiteDock ${pkg.version}`];
  // Tag must already exist and point to the exact approved source build.
  releaseArgs.push('--target',branch); // gh creates a release tag at this repository's default branch if absent.
  if(prerelease)releaseArgs.push('--prerelease');
  if(fs.existsSync(notes))releaseArgs.push('--notes-file',notes);
  else releaseArgs.push('--notes',`SiteDock ${pkg.version}. SHA-256 verified GitHub-only VSIX distribution.`);
  const result=invoke(releaseArgs);
  console.log('PUBLISHED:',result);
}
main().catch(err=>{console.error(`RELEASE PUBLISH FAILED: ${err.message}`);process.exitCode=1;});
