'use strict';
const {randomUUID}=require('node:crypto');
const posix=require('node:path').posix;
/**
 * SFTP same-directory staged replacement with backup/rollback.
 * This is NOT POSIX atomic overwrite on servers lacking posix-rename@openssh.com:
 * between backup rename and final rename the destination may briefly be absent.
 * We never silently fall back to direct overwrite after a failed stage.
 */
async function stagedReplace({destination,stat,put,rename,remove,chmod,expectedBytes}){
  if(typeof destination!=='string'||!destination.startsWith('/')||destination==='/'||destination.includes('\\')||posix.normalize(destination)!==destination)
    throw new Error('Unsafe staged upload destination.');
  if(![stat,put,rename,remove].every(fn=>typeof fn==='function'))throw new Error('Missing staged-upload operation.');
  if(!Number.isSafeInteger(expectedBytes)||expectedBytes<0)throw new Error('Invalid staged-upload size.');
  const parent=posix.dirname(destination);
  const uuid=randomUUID();
  const stage=posix.join(parent,`.sitedock-${uuid}.part`);
  const backup=posix.join(parent,`.sitedock-${uuid}.backup`);
  const original=await stat(destination);
  if(original && (original.type!=='file'||original.symlink))throw new Error('Refusing to replace a remote directory or symbolic link.');
  if(await stat(stage)||await stat(backup))throw new Error('Temporary upload path unexpectedly exists; refusing to overwrite.');
  let originalMoved=false, committed=false;
  try{
    await put(stage);
    const staged=await stat(stage);
    if(!staged||staged.type!=='file'||staged.symlink||staged.size!==expectedBytes)
      throw new Error('Staged upload did not match expected file size; original preserved.');
    const current=await stat(destination);
    const unchanged=(!original&&!current)||(original&&current&&current.type==='file'&&!current.symlink&&
      original.size===current.size&&(!original.mtime||!current.mtime||original.mtime===current.mtime));
    if(!unchanged)throw new Error('Remote destination changed during upload; original preserved.');
    if(original){
      if(typeof chmod!=='function'||!Number.isInteger(original.mode))throw new Error('Cannot preserve existing SFTP permissions; original preserved.');
      await chmod(stage,original.mode & 0o7777);
      await rename(destination,backup);
      originalMoved=true;
    }
    try{
      await rename(stage,destination);
      committed=true;
    }catch(err){
      if(originalMoved){
        try{await rename(backup,destination);originalMoved=false;}
        catch(restoreError){throw new Error(`Staged commit failed; original backup retained at ${backup}. Restore it manually. Commit: ${err.message}; rollback: ${restoreError.message}`);}
      }
      throw err;
    }
    if(originalMoved){
      try{await remove(backup);originalMoved=false;}
      catch(err){throw new Error(`New file saved, but old-version backup at ${backup} could not be removed: ${err.message}`);}
    }
    return {path:destination,bytes:expectedBytes,staged:true};
  }finally{
    if(!committed)await remove(stage).catch(()=>{});
  }
}
module.exports={stagedReplace};
