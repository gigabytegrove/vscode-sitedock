'use strict';
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {compareVersions,versionParts}=require('./update-utils');

async function sha256(filename){
  const hash=crypto.createHash('sha256');
  const file=await fs.open(filename,'r');
  try{for await(const chunk of file.createReadStream({autoClose:false}))hash.update(chunk);}
  finally{await file.close();}
  return hash.digest('hex');
}
function entry(buffer,target){
  if(buffer.length<22)throw new Error('Invalid VSIX: ZIP footer missing.');
  let end=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){
    if(buffer.readUInt32LE(i)===0x06054b50&&i+22+buffer.readUInt16LE(i+20)===buffer.length){end=i;break;}
  }
  if(end<0)throw new Error('Invalid VSIX: ZIP directory missing.');
  const count=buffer.readUInt16LE(end+10),start=buffer.readUInt32LE(end+16);
  if(count>12000||start>=end)throw new Error('Invalid VSIX: unexpected ZIP structure.');
  let pos=start,found=null;
  for(let i=0;i<count;i++){
    if(pos+46>buffer.length||buffer.readUInt32LE(pos)!==0x02014b50)throw new Error('Invalid VSIX: corrupt file index.');
    const method=buffer.readUInt16LE(pos+10),compressed=buffer.readUInt32LE(pos+20),uncompressed=buffer.readUInt32LE(pos+24);
    const namelen=buffer.readUInt16LE(pos+28),extra=buffer.readUInt16LE(pos+30),comment=buffer.readUInt16LE(pos+32),offset=buffer.readUInt32LE(pos+42);
    const next=pos+46+namelen+extra+comment;
    if(next>buffer.length)throw new Error('Invalid VSIX: bad entry name.');
    const name=buffer.subarray(pos+46,pos+46+namelen).toString('utf8');
    if(name===target){
      if(found||uncompressed>262144||compressed>262144||![0,8].includes(method))throw new Error('Invalid VSIX: unsafe or duplicated manifest.');
      if(offset+30>buffer.length||buffer.readUInt32LE(offset)!==0x04034b50)throw new Error('Invalid VSIX: bad manifest offset.');
      const contentOffset=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28);
      if(contentOffset+compressed>buffer.length)throw new Error('Invalid VSIX: truncated manifest.');
      const bytes=buffer.subarray(contentOffset,contentOffset+compressed);
      const decoded=method===8?zlib.inflateRawSync(bytes,{maxOutputLength:262145}):bytes;
      if(decoded.length!==uncompressed)throw new Error('Invalid VSIX: manifest length mismatch.');
      found=decoded.toString('utf8');
    }
    pos=next;
  }
  if(found===null)throw new Error('Invalid VSIX: extension/package.json is missing.');
  return found;
}
function identityFromXML(xml){
  const found=[...xml.matchAll(/<(?:\w+:)?Identity\b([^>]*)\/?\s*>/gi)];
  if(found.length!==1)throw new Error('Invalid VSIX: required identity metadata is missing or ambiguous.');
  const attrs={};
  for(const item of found[0][1].matchAll(/([A-Za-z][A-Za-z0-9]*)\s*=\s*[\"']([^\"']*)[\"']/g))attrs[item[1]]=item[2];
  return attrs;
}
async function validateVSIX(file,{version,publisher='GigabyteGrove',name='sitedock'}={}){
  if(!versionParts(version))throw new Error('Invalid requested update version.');
  const stat=await fs.stat(file);
  if(stat.size<100||stat.size>120*1024*1024)throw new Error('Invalid VSIX size.');
  const content=await fs.readFile(file);
  let manifest;
  try{manifest=JSON.parse(entry(content,'extension/package.json'));}
  catch(err){if(err.message.startsWith('Invalid VSIX:'))throw err;throw new Error('Invalid VSIX: package.json cannot be parsed.');}
  if(manifest.publisher!==publisher||manifest.name!==name)throw new Error('VSIX publisher or extension ID does not match the installed SiteDock extension.');
  if(compareVersions(manifest.version,version)!==0)throw new Error('VSIX version does not match its GitHub release tag.');
  if(!manifest.engines||typeof manifest.engines.vscode!=='string')throw new Error('VSIX lacks VS Code engine requirements.');
  const identity=identityFromXML(entry(content,'extension.vsixmanifest'));
  if(identity.Publisher!==publisher||identity.Id!==name||identity.Version!==manifest.version)
    throw new Error('VSIX Marketplace identity does not match the expected publisher, name and version.');
  return {publisher:manifest.publisher,name:manifest.name,version:manifest.version};
}
module.exports={sha256,entry,validateVSIX};
