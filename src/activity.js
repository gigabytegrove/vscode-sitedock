'use strict';
const {randomUUID}=require('node:crypto');

// A bounded, credential-free journal of remote work, plus a FIFO transfer queue.
// A restart marks unfinished work as interrupted; tasks cannot safely be replayed.
const STORAGE_KEY='sitedock.activity.v1';
const MAX_HISTORY=200;
const STATES=new Set(['queued','running','completed','failed','cancelled','interrupted','skipped']);
function safeMessage(err) {
  const value=String(err?.message||err||'Unknown error');
  // Never store credentials/URLs in history. Errors are for display only.
  return value.replace(/(password|passphrase|token|secret)\s*[:=]\s*\S+/ig,'$1=[redacted]').slice(0,500);
}
class ActivityQueue {
  constructor(context,vscode) {
    this.context=context;
    this.vscode=vscode;
    this.events=new vscode.EventEmitter();
    this.onDidChange=this.events.event;
    this.tasks=new Map();
    this.retryHandlers=new Map();
    this.draining=false;
    this.scheduled=false;
    this.batchDepth=0;
    this.persistTimer=null;
    const historic=context.globalState.get(STORAGE_KEY,[]);
    this.jobs=(Array.isArray(historic)?historic:[]).filter(x=>x && STATES.has(x.status)).slice(0,MAX_HISTORY)
      .map(x=>({id:String(x.id),label:String(x.label).slice(0,200),siteName:String(x.siteName||''),kind:String(x.kind||'operation'),
        status:['queued','running'].includes(x.status)?'interrupted':x.status,createdAt:Number(x.createdAt)||Date.now(),
        finishedAt:Number(x.finishedAt)||Date.now(),doneBytes:Number(x.doneBytes)||0,totalBytes:Number(x.totalBytes)||0,
        message:x.status==='running'||x.status==='queued'?'Interrupted by VS Code restart. Please retry manually.':String(x.message||'').slice(0,500)}));
    this.persistTail=Promise.resolve();
  }
  get all(){return this.jobs.map(x=>({...x}));}
  get busy(){return this.jobs.filter(x=>x.status==='queued'||x.status==='running').length;}
  _changed(){
    // Keep queued/running jobs regardless of quantity: pruning them loses work.
    // Keep only a bounded history of finished jobs.
    let completed=0;
    this.jobs=this.jobs.filter(job=>{
      if(job.status==='queued'||job.status==='running')return true;
      if(++completed<=MAX_HISTORY)return true;
      this.retryHandlers.delete(job.id);return false;
    });
    if(this.batchDepth)return;
    this.events.fire();
    if(!this.persistTimer){
      this.persistTimer=setTimeout(()=>{this.persistTimer=null;this.flush().catch(()=>{});},350);
    }
  }
  batch(fn){
    this.batchDepth++;
    try{return fn();}
    finally{if(!--this.batchDepth)this._changed();}
  }
  async flush(){
    if(this.persistTimer){clearTimeout(this.persistTimer);this.persistTimer=null;}
    // Do not put thousands of waiting tasks into global settings. On restart,
    // all in-progress work is explicitly interrupted, never replayed silently.
    const record=this.jobs.filter(x=>x.status!=='queued'&&x.status!=='running').slice(0,MAX_HISTORY)
      .concat(this.jobs.filter(x=>x.status==='queued'||x.status==='running').slice(0,100))
      .map(({_lastEmit,...rest})=>({...rest}));
    this.persistTail=this.persistTail.catch(()=>{}).then(()=>this.context.globalState.update(STORAGE_KEY,record));
    await this.persistTail.catch(()=>{});
  }
  _insert(info,status){
    const job={id:randomUUID(),label:String(info.label||'Remote operation').slice(0,200),
      siteName:String(info.siteName||'').slice(0,80),kind:String(info.kind||'operation'),status,
      createdAt:Date.now(),finishedAt:0,doneBytes:0,totalBytes:Number(info.totalBytes)||0,message:''};
    this.jobs.unshift(job);this._changed();return job;
  }
  _update(job,status,fields={}){
    if(status)job.status=status;
    Object.assign(job,fields);
    if(['completed','failed','cancelled','interrupted','skipped'].includes(status))job.finishedAt=Date.now();
    this._changed();
  }
  _report(job,doneBytes,totalBytes,message){
    if(job.status!=='running')return;
    const total=Number.isFinite(totalBytes)&&totalBytes>=0?totalBytes:job.totalBytes;
    const done=Number.isFinite(doneBytes)&&doneBytes>=0?doneBytes:job.doneBytes;
    if(done===job.doneBytes && total===job.totalBytes && message===job.message)return;
    const before=job.doneBytes;
    const oldTotal=job.totalBytes;
    const previousMessage=job.message;
    job.doneBytes=done;job.totalBytes=total;if(message!==undefined)job.message=String(message).slice(0,200);
    const now=Date.now();
    if(now-(job._lastEmit||0)>=250 || (total && done>=total) || previousMessage!==job.message || (!oldTotal && total) || Math.abs(done-before)>1024*1024){
      job._lastEmit=now;this._changed();
    }
  }
  async track(info,callback){
    const job=this._insert(info,'running');
    const report=(done,total,msg)=>this._report(job,done,total,msg);
    try{
      const result=await callback(report);
      this._update(job,'completed',{doneBytes:job.totalBytes||job.doneBytes,message:job.message||'Completed'});
      return result;
    }catch(err){this._update(job,'failed',{message:safeMessage(err)});throw err;}
  }
  enqueue(info,callback){
    const job=this._insert(info,'queued');
    this.tasks.set(job.id,{callback,controller:new AbortController()});
    if(!this.scheduled){
      this.scheduled=true;
      queueMicrotask(()=>{this.scheduled=false;this._drain().catch(()=>{});});
    }
    return job.id;
  }
  async _drain(){
    if(this.draining)return;
    this.draining=true;
    try{
      while(true){
        const next=[...this.jobs].reverse().find(j=>j.status==='queued'&&this.tasks.has(j.id));
        if(!next)break;
        const task=this.tasks.get(next.id);
        if(task.controller.signal.aborted){this._update(next,'cancelled',{message:'Cancelled before starting'});this.tasks.delete(next.id);continue;}
        this._update(next,'running',{message:'Starting…'});
        try{
          const result=await task.callback((done,total,msg)=>this._report(next,done,total,msg),task.controller.signal);
          if(result && result.skipped)this._update(next,'skipped',{message:String(result.reason||'Existing file skipped').slice(0,200)});
          else this._update(next,'completed',{doneBytes:next.totalBytes||next.doneBytes,message:'Completed'});
        }catch(err){
          const status=task.controller.signal.aborted?'cancelled':'failed';
          this._update(next,status,{message:task.controller.signal.aborted?'Cancelled':safeMessage(err)});
          if(status==='failed')this.retryHandlers.set(next.id,task.callback);
        }finally{this.tasks.delete(next.id);}
      }
    }finally{this.draining=false;}
  }
  cancel(id){
    const job=this.jobs.find(x=>x.id===id);
    if(!job||job.status!=='queued')return false;
    this.tasks.get(id)?.controller.abort();
    if(job.status==='queued'){this.tasks.delete(id);this._update(job,'cancelled',{message:'Cancelled before starting'});}
    return true;
  }
  retry(id){
    const original=this.jobs.find(x=>x.id===id);
    const callback=this.retryHandlers.get(id);
    if(!original||original.status!=='failed'||!callback)return false;
    this.enqueue(original,callback);
    return true;
  }
  clearCompleted(){
    for(const job of this.jobs)if(!['queued','running'].includes(job.status))this.retryHandlers.delete(job.id);
    this.jobs=this.jobs.filter(x=>!['completed','failed','cancelled','interrupted','skipped'].includes(x.status));
    this._changed();
  }
  async idle(){while(this.draining||this.jobs.some(x=>x.status==='queued'))await new Promise(r=>setTimeout(r,10));await this.flush();}
  dispose(){if(this.persistTimer)clearTimeout(this.persistTimer);this.retryHandlers.clear();for(const j of this.jobs)if(j.status==='queued'||j.status==='running')this.cancel(j.id);this.events.dispose();}
}
class ActivityTree {
  constructor(vscode,queue){this.vscode=vscode;this.queue=queue;this.onDidChangeTreeData=queue.onDidChange;}
  getChildren(){return this.queue.all.map(job=>({...job,retryable:this.queue.retryHandlers.has(job.id)}));}
  getTreeItem(job){
    const v=this.vscode;
    const item=new v.TreeItem(job.label,v.TreeItemCollapsibleState.None);
    const icons={queued:'clock',running:'sync~spin',completed:'check',failed:'error',cancelled:'circle-slash',interrupted:'warning',skipped:'circle-slash'};
    item.iconPath=new v.ThemeIcon(icons[job.status]||'history');
    item.contextValue=job.retryable?'sitedock.activity.failedRetry':`sitedock.activity.${job.status}`;
    item.id=`activity:${job.id}`;
    const percentage=job.totalBytes>0?` · ${Math.min(100,Math.floor(job.doneBytes/job.totalBytes*100))}%`:'';
    item.description=`${job.status}${percentage}`;
    item.tooltip=`${job.label}\nServer: ${job.siteName||'—'}\nStatus: ${job.status}\n${job.message||''}\n${new Date(job.createdAt).toLocaleString()}`;
    item.command={command:'sitedock.activityDetails',title:'Activity Details',arguments:[job.id]};
    return item;
  }
}
module.exports={ActivityQueue,ActivityTree,safeMessage};
