'use strict';
// Transfer estimates from reported bytes only; not an assertion of server-side durability.
const SAMPLE_WINDOW_MS=6000,MIN_SAMPLE_MS=300;
function bytes(value){
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)return '0 B';
  if(n<1024)return Math.floor(n)+' B';
  const suffix=['KB','MB','GB','TB'];
  let scaled=n,idx=-1;
  do{scaled/=1024;idx++;}while(scaled>=1024&&idx<suffix.length-1);
  return (scaled>=10?scaled.toFixed(0):scaled.toFixed(1))+' '+suffix[idx];
}
function remainingTime(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return '';
  const value=Math.ceil(seconds);
  if(value<60)return value+'s';
  if(value<3600)return Math.floor(value/60)+'m '+(value%60)+'s';
  return Math.floor(value/3600)+'h '+Math.ceil(value%3600/60)+'m';
}
function isByteCount(n){return Number.isSafeInteger(n)&&n>=0;}
function recordProgress(job,done,total,now=Date.now()){
  const finished=isByteCount(done)?done:job.doneBytes;
  const size=isByteCount(total)?total:job.totalBytes;
  const nextDone=size>0?Math.min(finished,size):finished;
  const reset=nextDone<job.doneBytes||(nextDone===0&&size===0&&job.doneBytes>0);
  let samples=Array.isArray(job._progressSamples)?job._progressSamples:[];
  if(reset){samples=[];job.speedBytesPerSec=0;job.etaSeconds=null;}
  if(Number.isFinite(now)&&now>=0){
    samples.push({at:now,done:nextDone});
    while(samples.length>2&&now-samples[0].at>SAMPLE_WINDOW_MS)samples.shift();
    if(samples.length>1){
      const first=samples[0],delta=now-first.at,diff=nextDone-first.done;
      if(delta>=MIN_SAMPLE_MS&&diff>=0){
        const speed=diff*1000/delta;
        job.speedBytesPerSec=Number.isFinite(speed)?Math.max(0,Math.round(speed)):0;
      }
    }
  }
  job._progressSamples=samples;
  job.doneBytes=nextDone;
  job.totalBytes=size;
  job.etaSeconds=size>nextDone&&job.speedBytesPerSec>0
    ?Math.ceil((size-nextDone)/job.speedBytesPerSec):null;
  return job;
}
function progressSummary(job){
  const fraction=job.totalBytes>0?' · '+Math.min(100,Math.floor(job.doneBytes/job.totalBytes*100))+'%':'';
  if(job.status!=='running')return job.status+fraction;
  const speed=job.speedBytesPerSec>0?' · '+bytes(job.speedBytesPerSec)+'/s':'';
  const eta=job.etaSeconds!==null&&Number.isFinite(job.etaSeconds)&&job.etaSeconds>=0?
    ' · ~'+remainingTime(job.etaSeconds)+' left':'';
  return job.status+fraction+speed+eta;
}
module.exports={recordProgress,progressSummary,bytes,remainingTime};
