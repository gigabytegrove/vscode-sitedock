'use strict';

// Small dependency-free semver implementation for the release channel contract.
// Four-segment versions, moving backwards, and non-semver tags are rejected.
const VERSION=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-.]+)?$/;
const REPOSITORY=/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[-A-Za-z0-9_.]{1,100}$/;
const HASH=/^[a-f0-9]{64}$/i;
function versionParts(input){
  const match=VERSION.exec(String(input||''));
  if(!match)return null;
  const pre=match[4]?match[4].split('.'):[];
  if(match.slice(1,4).some(x=>!Number.isSafeInteger(Number(x))))return null;
  if(pre.some(part=>/^\d+$/.test(part)&&part.length>1&&part[0]==='0'))return null;
  return {core:match.slice(1,4).map(Number),pre};
}
function compareVersions(a,b){
  const left=versionParts(a),right=versionParts(b);
  if(!left||!right)throw new Error('Invalid semantic version.');
  for(let i=0;i<3;i++)if(left.core[i]!==right.core[i])return left.core[i]>right.core[i]?1:-1;
  if(!left.pre.length&&!right.pre.length)return 0;
  if(!left.pre.length)return 1;
  if(!right.pre.length)return -1;
  for(let i=0;i<Math.min(left.pre.length,right.pre.length);i++){
    const x=left.pre[i],y=right.pre[i];if(x===y)continue;
    const nx=/^\d+$/.test(x),ny=/^\d+$/.test(y);
    if(nx&&ny){const bx=BigInt(x),by=BigInt(y);return bx>by?1:-1;}
    if(nx!==ny)return nx?-1:1;
    return x>y?1:-1;
  }
  return Math.sign(left.pre.length-right.pre.length);
}
function releaseRepository(value){
  if(typeof value!=='string'||!REPOSITORY.test(value)||value.includes('..'))throw new Error('Invalid GitHub release repository. Expected owner/repository.');
  return value;
}
function releaseAsset(release){
  const assets=Array.isArray(release?.assets)?release.assets:[];
  // Reject ambiguous distributions. A release must contain one SiteDock VSIX.
  const vsix=assets.filter(x=>x?.state==='uploaded'&&/^sitedock[-_.].*\.vsix$/i.test(x.name||'')&&x.size>0);
  if(vsix.length!==1)return null;
  const artifact=vsix[0];
  if(!Number.isSafeInteger(artifact.size)||artifact.size>120*1024*1024)return null;
  const name=artifact.name;
  const parsedDigest=typeof artifact.digest==='string'&&artifact.digest.startsWith('sha256:')?artifact.digest.slice(7).toLowerCase():null;
  const checksum=assets.find(x=>x?.state==='uploaded'&&x.name===`${name}.sha256`);
  if(parsedDigest&&!HASH.test(parsedDigest))return null;
  // Every update must be hash-verified; no unverified legacy VSIX fallback.
  if(!parsedDigest&&!checksum)return null;
  const expectedPrefix=`https://github.com/${releaseRepository(release.repo)}/releases/download/`;
  if(typeof artifact.browser_download_url!=='string'||!artifact.browser_download_url.startsWith(expectedPrefix))return null;
  return {name,asset:artifact,digest:parsedDigest,checksum};
}
function chooseRelease(releases,{currentVersion,channel='stable',repository='gigabytegrove/sitedock-releases'}={}){
  if(!versionParts(currentVersion))throw new Error('The installed SiteDock version is invalid.');
  if(channel!=='stable'&&channel!=='beta')throw new Error('Unknown update channel.');
  releaseRepository(repository);
  if(!Array.isArray(releases))throw new Error('GitHub returned an invalid releases list.');
  let selected=null;
  for(const candidate of releases){
    if(!candidate||candidate.draft||typeof candidate.tag_name!=='string'||!versionParts(candidate.tag_name))continue;
    if(channel==='stable'&&(candidate.prerelease||versionParts(candidate.tag_name).pre.length))continue;
    if(compareVersions(candidate.tag_name,currentVersion)<=0)continue;
    if(typeof candidate.html_url!=='string'||!candidate.html_url.startsWith(`https://github.com/${repository}/releases/tag/`))continue;
    const found=releaseAsset({...candidate,repo:repository});
    if(!found)continue;
    if(!selected||compareVersions(candidate.tag_name,selected.version)>0){
      selected={version:candidate.tag_name.replace(/^v/,''),tag:candidate.tag_name,prerelease:Boolean(candidate.prerelease),notes:typeof candidate.body==='string'?candidate.body.slice(0,20000):'',releaseUrl:candidate.html_url,...found};
    }
  }
  return selected;
}
function parseChecksum(content,filename){
  if(typeof content!=='string'||content.length>4096)throw new Error('Invalid checksum file.');
  const matches=[];
  for(const line of content.trim().split(/\r?\n/)){
    const match=/^([a-f0-9]{64})\s+\*?(.+)$/.exec(line.trim());
    if(match&&match[2]===filename)matches.push(match[1].toLowerCase());
  }
  if(matches.length!==1)throw new Error('Missing or ambiguous matching SHA-256 checksum.');
  return matches[0];
}
module.exports={versionParts,compareVersions,releaseRepository,releaseAsset,chooseRelease,parseChecksum};
