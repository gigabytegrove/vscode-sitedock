'use strict';
const https=require('node:https');
const fs=require('node:fs');
const {pipeline}=require('node:stream/promises');

const MAX_JSON=2*1024*1024;
const MAX_VSIX=120*1024*1024;
function approved(url,purpose){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port)throw new Error('Update URL must be HTTPS without credentials or a custom port.');
  if(purpose==='api'&&parsed.hostname!=='api.github.com')throw new Error('Unexpected GitHub API host.');
  if(purpose==='asset'&&!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname))throw new Error('Unexpected GitHub asset host.');
  return parsed;
}
function response(url,kind,{get=https.get,timeoutMs=15000,redirects=5}={}){
  return new Promise((resolve,reject)=>{
    let parsed;
    try{parsed=approved(url,kind);}catch(err){reject(err);return;}
    const request=get(parsed,{headers:{'User-Agent':'GigabyteGrove-SiteDock-Updater','Accept':kind==='api'?'application/vnd.github+json':'application/octet-stream','X-GitHub-Api-Version':'2022-11-28'}},async res=>{
      const status=res.statusCode||0;
      if([301,302,303,307,308].includes(status)){
        res.resume();
        if(redirects===0){reject(new Error('GitHub update redirect limit exceeded.'));return;}
        try{const next=new URL(res.headers.location,parsed).href;
          resolve(await response(next,kind==='api'?'api':'asset',{get,timeoutMs,redirects:redirects-1}));
        }catch(err){reject(err);}return;
      }
      if(status!==200){res.resume();reject(new Error(`GitHub returned HTTP ${status}${status===404?' (repository/release unavailable or private)':status===403?' (rate limited or forbidden)':''}.`));return;}
      resolve(res);
    });
    request.setTimeout?.(timeoutMs,()=>request.destroy(new Error('GitHub update request timed out.')));
    request.on('error',reject);
  });
}
async function readLimited(url,limit,kind,opts={}){
  const res=await response(url,kind,opts);
  const declared=Number(res.headers['content-length']);
  if(declared>limit){res.destroy();throw new Error('GitHub response exceeds the download limit.');}
  const chunks=[];let size=0;
  for await(const chunk of res){size+=chunk.length;if(size>limit){res.destroy();throw new Error('GitHub response exceeds the download limit.');}chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
}
async function listReleases(repository,opts={}){
  const {releaseRepository}=require('./update-utils');
  const text=await readLimited(`https://api.github.com/repos/${releaseRepository(repository)}/releases?per_page=50`,MAX_JSON,'api',opts);
  try{return JSON.parse(text);}catch{throw new Error('GitHub returned invalid release JSON.');}
}
async function readChecksum(url,opts={}){return readLimited(url,4096,'asset',opts);}
async function downloadFile(url,file,{maxBytes=MAX_VSIX,...opts}={}){
  const res=await response(url,'asset',opts);
  const declared=Number(res.headers['content-length']);
  if(declared>maxBytes){res.destroy();throw new Error('GitHub VSIX exceeds size limit.');}
  let bytes=0;
  const out=fs.createWriteStream(file,{flags:'wx',mode:0o600});
  try{
    const {Transform}=require('node:stream');
    const limited=new Transform({transform(chunk,_enc,callback){bytes+=chunk.length;
      if(bytes>maxBytes)callback(new Error('GitHub VSIX exceeds size limit.'));
      else callback(null,chunk);
    }});
    await pipeline(res,limited,out);
    if(!bytes)throw new Error('GitHub returned an empty VSIX.');
    return bytes;
  }catch(err){await fs.promises.rm(file,{force:true});throw err;}
}
module.exports={approved,response,readLimited,listReleases,readChecksum,downloadFile,MAX_VSIX};
