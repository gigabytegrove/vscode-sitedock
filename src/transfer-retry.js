'use strict';
// Only replay explicitly idempotent transfer reads; never replay delete, rename,
// FTP uploads or other live remote mutations as a side effect of a timeout.
const TRANSIENT=new Set(['ECONNRESET','ECONNABORTED','ETIMEDOUT','EPIPE','ENETRESET','ENETUNREACH','EHOSTUNREACH','EAI_AGAIN']);
function interrupted(signal){return signal?.aborted||signal?.isCancellationRequested;}
function isTransient(error){
  for(let current=error,depth=0;current&&depth<4;current=current.cause,depth++){
    if(TRANSIENT.has(String(current.code||'').toUpperCase()))return true;
  }
  return false;
}
function cancellableDelay(ms,signal){
  if(interrupted(signal))return Promise.reject(new Error('Transfer cancelled.'));
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(done,ms);
    function cancel(){clearTimeout(timer);signal?.removeEventListener?.('abort',cancel);reject(new Error('Transfer cancelled.'));}
    function done(){signal?.removeEventListener?.('abort',cancel);resolve();}
    signal?.addEventListener?.('abort',cancel,{once:true});
  });
}
async function retryDownload(operation,{signal,report=()=>{},wait=cancellableDelay,maxAttempts=3}={}){
  if(typeof operation!=='function')throw new Error('Download operation is required.');
  if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>4)throw new Error('Invalid retry limit.');
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    if(interrupted(signal))throw new Error('Transfer cancelled.');
    try{return await operation(attempt);}catch(err){
      if(interrupted(signal))throw new Error('Transfer cancelled.');
      if(!isTransient(err)||attempt===maxAttempts)throw err;
      report(0,0,`Connection interrupted; retrying download (${attempt}/${maxAttempts-1})`);
      await wait(350*Math.pow(3,attempt-1),signal);
    }
  }
}
module.exports={retryDownload,isTransient,cancellableDelay};
