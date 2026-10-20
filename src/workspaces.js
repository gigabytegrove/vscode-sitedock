'use strict';
const KEY='sitedock.workspace.v1';
const MODES=new Set(['manager','all']);
const SCOPES=new Set(['active','open']);
const limit=1000;
function ids(values,valid){
  const out=[];
  for(const id of Array.isArray(values)?values:[]){
    if(typeof id==='string' && valid.has(id) && !out.includes(id))out.push(id);
    if(out.length>=limit)break;
  }
  return out;
}
function normalize(raw,sites){
  const valid=new Set(sites.map(x=>x.id));
  const open=ids(raw?.open,valid);
  const favorites=ids(raw?.favorites,valid);
  const recent=ids(raw?.recent,valid).slice(0,30);
  const active=open.includes(raw?.active)?raw.active:(open[0]||null);
  return {mode:MODES.has(raw?.mode)?raw.mode:'all',scope:SCOPES.has(raw?.scope)?raw.scope:'active',open,active,favorites,recent};
}
class SiteWorkspaces{
  constructor(context,store){
    this.context=context;this.store=store;
    this.state=normalize(context.globalState.get(KEY,{}),store.all());
    this.listeners=new Set();this.pending=Promise.resolve();
  }
  get snapshot(){return {...this.state,open:[...this.state.open],favorites:[...this.state.favorites],recent:[...this.state.recent]};}
  onChange(listener){this.listeners.add(listener);return {dispose:()=>this.listeners.delete(listener)};}
  _emit(){for(const fn of [...this.listeners])fn(this.snapshot);}
  _update(fn){
    const task=this.pending.then(async()=>{
      const before=this.state;
      const next=normalize(fn(this.snapshot),this.store.all());
      if(JSON.stringify(before)===JSON.stringify(next))return this.snapshot;
      await this.context.globalState.update(KEY,next);
      this.state=next;this._emit();return this.snapshot;
    });
    this.pending=task.catch(()=>{});
    return task;
  }
  ensure(siteId){if(!this.store.get(siteId))throw new Error('That saved site no longer exists.');return siteId;}
  async sync(){return this._update(s=>s);}
  async setMode(mode){if(!MODES.has(mode))throw new Error('Invalid explorer mode.');return this._update(s=>({...s,mode}));}
  async setScope(scope){if(!SCOPES.has(scope))throw new Error('Invalid workspace scope.');return this._update(s=>({...s,mode:'manager',scope}));}
  async open(siteId,{focus=true}={}){
    this.ensure(siteId);
    return this._update(s=>({...s,mode:'manager',open:s.open.includes(siteId)?s.open:[...s.open,siteId],active:focus?siteId:s.active||siteId,recent:[siteId,...s.recent.filter(x=>x!==siteId)].slice(0,30)}));
  }
  async openMany(siteIds,{focus=true}={}){
    const unique=[...new Set(siteIds.map(x=>this.ensure(x)))];
    if(!unique.length)return this.snapshot;
    return this._update(s=>({...s,mode:'manager',open:[...new Set([...s.open,...unique])],active:focus?unique[0]:s.active||unique[0],recent:[...unique,...s.recent.filter(x=>!unique.includes(x))].slice(0,30)}));
  }
  async focus(siteId){return this.open(siteId,{focus:true});}
  async close(siteId){return this._update(s=>({...s,open:s.open.filter(x=>x!==siteId),active:s.active===siteId?s.open.find(x=>x!==siteId)||null:s.active}));}
  async closeOthers(siteId){this.ensure(siteId);return this._update(s=>({...s,mode:'manager',open:[siteId],active:siteId}));}
  async closeAll(){return this._update(s=>({...s,mode:'manager',open:[],active:null}));}
  async favorite(siteId){this.ensure(siteId);return this._update(s=>({...s,favorites:s.favorites.includes(siteId)?s.favorites.filter(x=>x!==siteId):[...s.favorites,siteId]}));}
  visibleSites(){const sites=this.store.all();const {mode,scope,open,active}=this.state;
    if(mode==='all')return sites;
    if(scope==='active')return sites.filter(s=>s.id===active);
    return sites.filter(s=>open.includes(s.id));
  }
  managerSites(){const {open,active,favorites,recent}=this.state;
    return this.store.all().map(s=>({...s,isOpen:open.includes(s.id),isActive:active===s.id,isFavorite:favorites.includes(s.id),lastPosition:recent.indexOf(s.id)})).sort((a,b)=>{
      if(a.isOpen!==b.isOpen)return a.isOpen?-1:1;
      if(a.isFavorite!==b.isFavorite)return a.isFavorite?-1:1;
      const ai=a.lastPosition<0?999:a.lastPosition,bi=b.lastPosition<0?999:b.lastPosition;
      if(a.isOpen&&ai!==bi)return ai-bi;
      return a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});
    });
  }
  dispose(){this.listeners.clear();}
}
module.exports={SiteWorkspaces,normalize,KEY};
