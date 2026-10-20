'use strict';
const {randomUUID}=require('node:crypto');
const {validateSite}=require('./storage');

const EXPORT_FORMAT='gigabytegrove.sitedock.profiles';
const MAX_SITES=500;
const MAX_BYTES=1024*1024;
function publicSite(site){
  // Intentionally do not export record IDs, passwords, passphrases, host fingerprints,
  // local private-key paths, or keys from imported/untrusted data.
  return {name:site.name,protocol:site.protocol,host:site.host,port:site.port,
    user:site.user,root:site.root,auth:site.auth,followExternalLinks:false};
}
function exportProfiles(sites){
  if(!Array.isArray(sites)||sites.length>MAX_SITES)throw new Error('Too many SiteDock profiles to export.');
  return JSON.stringify({format:EXPORT_FORMAT,version:1,sites:sites.map(publicSite)},null,2)+'\n';
}
function profileKey(site){return [site.protocol,site.host.toLowerCase(),site.port,site.user,site.root].join('\u0000');}
function previewImport(bytes,existing=[]){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_BYTES)throw new Error('SiteDock profile file exceeds 1 MB.');
  let data;
  try{data=JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{throw new Error('This is not a valid SiteDock profile JSON file.');}
  if(!data||data.format!==EXPORT_FORMAT||data.version!==1||!Array.isArray(data.sites)||data.sites.length>MAX_SITES)
    throw new Error('Unsupported or oversized SiteDock profile export.');
  const seen=new Set(existing.map(profileKey));
  const imports=[];
  let skipped=0;
  for(let item of data.sites){
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid profile entry.');
    // Reject injected config rather than silently storing unsafe or secret values.
    const fields=['name','protocol','host','port','user','root','auth','followExternalLinks'];
    if(Object.keys(item).some(k=>!fields.includes(k)))throw new Error('Unexpected field in imported profile. Only connection details are accepted.');
    if(item.followExternalLinks!==false)throw new Error('Imported profiles must not enable external symlink access.');
    if(item.auth==='key'){
      // A private-key path is local machine state, never exported. Import with a
      // credential-unconfigured placeholder; users must select a key in Edit.
      item={...item,keyPath:''};
    }
    const validated=validateSite({...item,auth:item.auth==='key'?'password':item.auth});
    const key=profileKey(validated);
    if(seen.has(key)){skipped++;continue;}
    seen.add(key);
    imports.push({...validated,id:randomUUID(),fingerprint:'',followExternalLinks:false});
  }
  return {imports,skipped,total:data.sites.length};
}
module.exports={exportProfiles,previewImport,EXPORT_FORMAT,MAX_BYTES};
