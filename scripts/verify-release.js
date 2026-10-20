#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const pkg=require('../package.json');
const {sha256,validateVSIX}=require('../src/update-vsix');
const {parseChecksum}=require('../src/update-utils');
(async()=>{
  const file=path.resolve(process.argv[2]||path.join(__dirname,'..','dist',`sitedock-v${pkg.version}.vsix`));
  const sidecar=await fs.readFile(file+'.sha256','utf8');
  const expected=parseChecksum(sidecar,path.basename(file));
  const actual=await sha256(file);
  if(expected!==actual)throw new Error('SHA-256 mismatch! Do not distribute this file.');
  await validateVSIX(file,{version:pkg.version});
  console.log(`PASS: ${path.basename(file)} (${pkg.publisher}.${pkg.name} ${pkg.version})`);
  console.log(`SHA-256: ${actual}`);
})().catch(err=>{console.error('FAILED:',err.message);process.exitCode=1;});
