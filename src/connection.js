'use strict';
const fs = require('node:fs/promises');
const fsNative=require('node:fs');
const {randomUUID}=require('node:crypto');
const {Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const posix = require('node:path').posix;
const {Readable,Writable} = require('node:stream');
const {timingSafeEqual} = require('node:crypto');
const {loadLibrary} = require('./runtime');

class HostKeyError extends Error {
  constructor(fingerprint,previous='') {
    super(previous ? 'The SSH host key has changed. This could indicate a security problem.' : 'The SSH host key has not been trusted yet.');
    this.name='HostKeyError'; this.fingerprint=fingerprint; this.previous=previous;
  }
}
function sameHash(a,b) {
  if (!a || !b || a.length !== b.length || !/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function fileType(mode) {
  if ((mode & 0o170000) === 0o040000) return 'directory';
  if ((mode & 0o170000) === 0o120000) return 'symlink';
  return 'file';
}
/**
 * Observe the SSH server's advertised USERAUTH methods. Never infer from the
 * advertised list that an account is authorized for any particular method.
 * This handler sends `none` once, then at most one configured credential method.
 */
function authenticationHandler(method, observer=()=>{}) {
  let sentNone=false;
  let sentCredential=false;
  return (methodsLeft,partialSuccess,finish)=>{
    if (Array.isArray(methodsLeft)) observer([...new Set(methodsLeft.filter(x=>typeof x==='string'))],Boolean(partialSuccess));
    if (!sentNone) {sentNone=true;finish('none');return;}
    if (method!=='none' && !sentCredential && Array.isArray(methodsLeft) && methodsLeft.includes(method) && !partialSuccess) {
      sentCredential=true;finish(method);return;
    }
    finish(false);
  };
}
function methodGuidance(auth,methods) {
  if (!methods.length) return 'The server did not report usable authentication methods.';
  const intended=auth==='key'?'publickey':auth==='keyboard'?'keyboard-interactive':'password';
  if (!methods.includes(intended)) {
    const alternate=methods.includes('keyboard-interactive') && intended==='password'
      ? ' Try Keyboard-interactive (password prompt) instead.' : '';
    return `The server did not advertise ${intended} authentication.${alternate}`;
  }
  return 'The server advertises this method, but that does not guarantee the account is allowed to use it. Check server-side SSH authentication policy and account access.';
}
async function probeSftpAuthentication(site,library=loadLibrary) {
  if (site.protocol!=='sftp') throw new Error('SSH authentication diagnostics are available only for SFTP servers.');
  const SftpClient=library('ssh2-sftp-client');
  const client=new SftpClient('SiteDock authentication diagnostic');
  let observed='';
  let methods=null;
  let partialSuccess=false;
  let acceptedNone=false;
  const options={host:site.host,port:site.port,username:site.user,readyTimeout:15000,
    hostHash:'sha256',hostVerifier:(hash)=>{observed=hash;return sameHash(hash,site.fingerprint);},
    authHandler:authenticationHandler('none',(list,partial)=>{methods=list;partialSuccess=partial;})};
  let problem;
  try {await client.connect(options);acceptedNone=true;}
  catch(err) {problem=err;}
  finally {try{await client.end();}catch{/* ignore close errors */}}
  if (observed && !sameHash(observed,site.fingerprint)) throw new HostKeyError(observed,site.fingerprint);
  if (!acceptedNone && methods===null) {
    throw new Error(`Could not retrieve SSH authentication methods: ${problem?.message || 'server disconnected before authentication negotiation'}`);
  }
  return {methods:methods||[],partialSuccess,acceptedNone};
}
async function openConnection(site, password, passphrase, library=loadLibrary) {
  if (site.protocol === 'sftp') {
    const SftpClient=library('ssh2-sftp-client');
    const client=new SftpClient('SiteDock');
    let observed='';
    const options={host:site.host,port:site.port,username:site.user,readyTimeout:20000,
      hostHash:'sha256',hostVerifier:(hash)=>{observed=hash;return sameHash(hash,site.fingerprint);} };
    let unsupportedPrompt=false;
    let advertised=[];
    const requestedMethod=site.auth==='key'?'publickey':site.auth==='keyboard'?'keyboard-interactive':'password';
    options.authHandler=authenticationHandler(requestedMethod,(methods)=>{advertised=methods;});
    if (site.auth === 'key') {
      try { options.privateKey=await fs.readFile(site.keyPath); }
      catch (err) { throw new Error(`Cannot read private key file: ${err.message}`); }
      if (passphrase) options.passphrase=passphrase;
    } else if(site.auth === 'keyboard') {
      // The ssh2 default auth order does not attempt keyboard-interactive unless
      // explicitly enabled. Use *only* this method to avoid unnecessary login
      // attempts against servers enforcing account lockout thresholds.
      if (!password) throw new Error('This connection needs a password for keyboard-interactive authentication.');
      options.tryKeyboard=true;
      client.on('keyboard-interactive',(_name,_instructions,_lang,prompts,finish)=>{
        // Do not blindly transmit the stored password into a 2FA/OTP question.
        const acceptable=Array.isArray(prompts) && prompts.length === 1 &&
          prompts[0] && prompts[0].echo === false &&
          !/(?:otp|one.time|verification|token|authenticator|2fa|code)/i.test(String(prompts[0].prompt || ''));
        if (acceptable) finish([password]);
        else { unsupportedPrompt=true; finish([]); }
      });
    } else {
      if (!password) throw new Error('No saved password is available for this connection. Open Edit Server and enter the password again.');
      options.password=password;
    }
    try { await client.connect(options); }
    catch (err) {
      try { await client.end(); } catch { /* ignored on failed handshake */ }
      if (observed && !sameHash(observed,site.fingerprint)) throw new HostKeyError(observed,site.fingerprint);
      if (unsupportedPrompt) throw new Error('The server requested multiple authentication factors or an unsupported challenge. SiteDock cannot answer that prompt automatically.');
      if (/all configured authentication methods failed/i.test(String(err.message))) {
        throw new Error(`SFTP authentication was rejected (${site.auth==='keyboard'?'keyboard-interactive':site.auth==='key'?'SSH key':'password'}). SSH methods advertised: ${advertised.length?advertised.join(', '):'not determined'}. ${methodGuidance(site.auth,advertised)}`,{cause:err});
      }
      throw err;
    }
    return {type:'sftp',client,close:()=>client.end()};
  }
  const {Client}=library('basic-ftp');
  const client=new Client(20000);
  try {
    await client.access({host:site.host,port:site.port,user:site.user,password,
      secure:site.protocol === 'ftps-implicit' ? 'implicit' : site.protocol === 'ftps',
      secureOptions:{rejectUnauthorized:true,servername:site.host}});
  } catch(err) {client.close();throw err;}
  return {type:'ftp',client,close:async()=>client.close()};
}
async function ftpFind(session,path) {
  if (path === '/') return {type:'directory',size:0,mtime:0};
  const items=await session.client.list(posix.dirname(path));
  const found=items.find(x=>x.name===posix.basename(path));
  if (!found) return null;
  const {FileType}=loadLibrary('basic-ftp');
  return {type:found.type===FileType.Directory ? 'directory' : found.type === FileType.SymbolicLink ? 'symlink' : 'file',
    symlink:found.type===FileType.SymbolicLink,size:found.size || 0, mtime:found.modifiedAt?.getTime() || 0};
}
class PathBoundaryError extends Error {constructor(message) {super(message);this.name='PathBoundaryError';}}
function insideRoot(root, target) {
  if (typeof root!=='string'||typeof target!=='string'||!root.startsWith('/')||!target.startsWith('/')) return false;
  const a=posix.normalize(root), b=posix.normalize(target);
  return a==='/' || b===a || b.startsWith(a+'/');
}
async function verifiedRealpath(client,path) {
  const result=await client.realPath(path);
  if (result==='') throw Object.assign(new Error(`No such file: ${path}`),{code:2});
  if (typeof result!=='string'||!result.startsWith('/')) throw new Error(`Unable to verify the real server path: ${path}. Remote access stopped for safety.`);
  return posix.normalize(result);
}
async function requireContained(session,site,method,args) {
  if (session.type!=='sftp'||site.followExternalLinks===true) return;
  const c=session.client;
  if (!session.canonicalRoot) session.canonicalRoot=await verifiedRealpath(c,site.root);
  // Metadata inspection is allowed so users can rename/remove the link itself.
  // Actual traversal and file contents are checked below.
  if (method==='stat'||method==='realpath') return;
  let paths=[];
  const parentOnly=['unlink','mkdir'];
  if (['list','read','downloadLocal','rmdir'].includes(method)) paths=[[args[0],false]];
  else if(['write','uploadLocal'].includes(method)) paths=[[method==='write'?args[0]:args[1],true]];
  else if(parentOnly.includes(method)) paths=[[args[0],true,true]];
  else if(method==='rename') paths=[[args[0],true,true],[args[1],true,true]];
  for(const [path,allowMissing,parentOnlyMode] of paths){
    if(typeof path!=='string'||!path.startsWith('/')) throw new Error('Unsafe remote path.');
    const parent=posix.dirname(path);
    const checkPath=parentOnlyMode?parent:path;
    let physical;
    try {physical=await verifiedRealpath(c,checkPath);} catch(err) {
      if(!allowMissing||parentOnlyMode||!missingRemote(err)) throw err;
      physical=await verifiedRealpath(c,parent);
    }
    if (!insideRoot(session.canonicalRoot,physical)) {
      throw new PathBoundaryError(`Access blocked: ${path} resolves outside the starting directory (${site.root}) to ${physical}. Edit this server and explicitly allow external symbolic links only if that destination is trusted.`);
    }
    if (allowMissing&&!parentOnlyMode) {
      const resolvedParent=await verifiedRealpath(c,parent);
      if(!insideRoot(session.canonicalRoot,resolvedParent))throw new PathBoundaryError(`Access blocked: parent of ${path} resolves outside the starting directory.`);
    }
  }
}
function missingRemote(err){return err?.code===2||err?.code==='ENOENT'||/no such file|not found/i.test(String(err?.message||''));}
function statDetails(st){return {type:fileType(st.mode),size:st.size||0,mtime:st.modifyTime||0};}
async function sftpStat(client,path) {
  let raw;
  try{raw=await client.lstat(path);}catch(err){if(missingRemote(err))return null;throw err;}
  const details=statDetails(raw);
  if(details.type!=='symlink')return {...details,symlink:false};
  try {
    const target=await client.stat(path); // follows symbolic links; lstat intentionally does not
    return {...statDetails(target),symlink:true};
  } catch(err) {
    // Dangling links remain visible as links, but cannot be opened as files.
    if(missingRemote(err)||/too many levels|ELOOP/i.test(String(err?.message||'')))
      return {...details,symlink:true,broken:true};
    throw err;
  }
}
async function sftpList(client,path,session=null) {
  const entries=await client.list(path);
  const result=entries.filter(e=>e.name!=='.'&&e.name!=='..').map(e=>({
    name:e.name,type:e.type==='d'?'directory':e.type==='l'?'symlink':'file',
    size:e.size||0,mtime:e.modifyTime||0,symlink:e.type==='l'
  }));
  // The listing already identifies a link. A single stat (not lstat+stat)
  // resolves its target; bound concurrency avoids overwhelming the server.
  const links=result.map((entry,i)=>({entry,i})).filter(({entry})=>entry.symlink);
  let cursor=0;
  async function worker(){
    while(cursor<links.length){
      const {entry,i}=links[cursor++];
      if(!entry.name||entry.name.includes('/')||entry.name.includes('\\')||entry.name==='..'){
        result[i]={...entry,broken:true};continue;
      }
      try{
        const target=await client.stat(posix.join(path,entry.name));
        let resolved;
        if(session?.sitePolicy?.followExternalLinks!==true && session?.canonicalRoot) {
          try{resolved=await verifiedRealpath(client,posix.join(path,entry.name));}
          catch {result[i]={...entry,unresolved:true};continue;}
        }
        result[i]={...entry,...statDetails(target),symlink:true,
          ...(resolved?{target:resolved,external:!insideRoot(session.canonicalRoot,resolved)}:{})};
      }catch(err){
        if(missingRemote(err)||/too many levels|ELOOP/i.test(String(err?.message||'')))result[i]={...entry,broken:true};
        else result[i]={...entry,unresolved:true}; // inaccessible links must not hide the rest of the directory
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(8,links.length)},()=>worker()));
  return result;
}
async function operation(session,method,...args) {
  const c=session.client;
  if (method==='list') {
    if(session.type==='sftp')return sftpList(c,args[0],session);
    const entries=await c.list(args[0]);
    const {FileType}=loadLibrary('basic-ftp');
    return entries.filter(e=>e.name!=='.' && e.name!=='..').map(e=>({name:e.name,type:e.type===FileType.Directory?'directory':e.type===FileType.SymbolicLink?'symlink':'file',size:e.size||0,mtime:e.modifiedAt?.getTime()||0}));
  }
  if(method==='realpath') {
    if(session.type==='sftp') return c.realPath(args[0]);
    return posix.normalize(args[0]); // FTP does not offer SSH realpath
  }
  if (method==='stat') {
    if (session.type==='ftp') return ftpFind(session,args[0]);
    return sftpStat(c,args[0]);
  }
  if(method==='uploadLocal') {
    const [local,remote,progress]=args;
    const stat=await fs.stat(local);
    if(!stat.isFile())throw new Error('Only regular local files can be uploaded.');
    let completed=0;
    const input=fsNative.createReadStream(local);
    const counted=new Transform({transform(chunk,_encoding,callback){
      completed+=chunk.length;
      if(typeof progress==='function')progress(completed,stat.size,'Uploading');
      callback(null,chunk);
    }});
    const pumping=pipeline(input,counted);
    try {
      if(session.type==='sftp')await c.put(counted,remote);
      else await c.uploadFrom(counted,remote);
      await pumping;
      if(typeof progress==='function')progress(stat.size,stat.size,'Uploaded');
    }catch(err){input.destroy();counted.destroy();await pumping.catch(()=>{});throw err;}
    return;
  }
  if(method==='downloadLocal') {
    const [remote,local,progress]=args;
    // A temp file in the same directory keeps an existing local file intact
    // if a download is interrupted, cancelled, or fails partway through.
    const tmp=local+`.sitedock-${randomUUID()}.part`;
    let count=0;
    const destination=fsNative.createWriteStream(tmp,{flags:'wx',mode:0o600});
    const counted=new Transform({transform(chunk,_encoding,callback){
      count+=chunk.length;
      if(typeof progress==='function')progress(count,0,'Downloading');
      callback(null,chunk);
    }});
    const pumping=pipeline(counted,destination);
    try {
      if(session.type==='sftp')await c.get(remote,counted);
      else await c.downloadTo(counted,remote);
      await pumping;
      await fs.rename(tmp,local);
      if(typeof progress==='function')progress(count,count,'Downloaded');
    }catch(err){counted.destroy();destination.destroy();await pumping.catch(()=>{});await fs.rm(tmp,{force:true}).catch(()=>{});throw err;}
    return;
  }
  if (method==='read') {
    if (session.type==='sftp') {
      const data=await c.get(args[0]);
      return Buffer.isBuffer(data)?data:Buffer.from(data);
    }
    const chunks=[];
    const dest=new Writable({write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));callback();}});
    await c.downloadTo(dest,args[0]);
    return Buffer.concat(chunks);
  }
  if (method==='write') {
    if (session.type==='sftp') return c.put(Buffer.from(args[1]),args[0]);
    return c.uploadFrom(Readable.from([Buffer.from(args[1])]),args[0]);
  }
  if (method==='mkdir') {
    if (session.type==='sftp') return c.mkdir(args[0],false);
    return c.send(`MKD ${args[0]}`);
  }
  if (method==='unlink') return session.type==='sftp'?c.delete(args[0]):c.remove(args[0]);
  if (method==='rmdir') {
    // Do not recurse through directory symlinks: a link may lead outside the selected root.
    const removeTree=async(path,depth=0)=>{
      if(depth>64) throw new Error('Maximum directory depth exceeded while deleting.');
      const items=await operation(session,'list',path);
      const posix=require('node:path').posix;
      for(const item of items) {
        if (!item.name || item.name==='.' || item.name==='..' || item.name.includes('/') || item.name.includes('\\') || /[\x00-\x1f\x7f]/.test(item.name)) {
          throw new Error('Unsafe filename encountered; deletion stopped.');
        }
        const child=posix.join(path,item.name);
        if(item.type==='directory' && !item.symlink) await removeTree(child,depth+1);
        else await operation(session,'unlink',child);
      }
      if(session.type==='sftp') await c.rmdir(path,false);
      else await c.send(`RMD ${path}`);
    };
    return removeTree(args[0]);
  }
  if (method==='rename') return session.type==='sftp'?c.rename(args[0],args[1]):c.rename(args[0],args[1]);
  throw new Error(`Unsupported remote operation: ${method}`);
}

class SiteIO {
  constructor(store,prepare=async()=>{},connector=openConnection) {this.store=store;this.prepare=prepare;this.connector=connector;this.sessions=new Map();this.disposed=false;}
  async test(site,secrets={}) {
    await this.prepare();
    const password=secrets.password || (site.id ? await this.store.password(site.id):'');
    const passphrase=secrets.passphrase || (site.id ? await this.store.passphrase(site.id):'');
    const session=await this.connector(site,password,passphrase);
    try {await operation(session,'list',site.root);}
    finally {await session.close().catch(()=>{});}
  }
  async probe(site) {
    await this.prepare();
    return probeSftpAuthentication(site);
  }
  async run(siteId,method,...args) {
    if (this.disposed) throw new Error('SiteDock has been deactivated.');
    await this.prepare();
    let state=this.sessions.get(siteId);
    if (!state) {state={tail:Promise.resolve(),session:null,timer:null};this.sessions.set(siteId,state);}
    const action=async()=>{
      const site=this.store.get(siteId);
      if (!site) throw new Error('This server was removed.');
      clearTimeout(state.timer);
      if (!state.session || (state.session.type==='ftp' && state.session.client.closed)) {
        state.session=await this.connector(site,await this.store.password(siteId),await this.store.passphrase(siteId));
      }
      try {state.session.sitePolicy=site;await requireContained(state.session,site,method,args);return await operation(state.session,method,...args);}
      catch(err) {
        if (err instanceof PathBoundaryError) throw err; // A rejected path is not a broken connection.
        await this._close(state);
        const recoverable=['stat','list','read'].includes(method) &&
          /(?:ECONNRESET|EPIPE|ETIMEDOUT|connection (?:lost|closed)|not connected|no sftp connection|socket (?:closed|ended))/i.test(`${err.code || ''} ${err.message || ''}`);
        if (!recoverable) throw err;
        state.session=await this.connector(site,await this.store.password(siteId),await this.store.passphrase(siteId));
        try {state.session.sitePolicy=site;await requireContained(state.session,site,method,args);return await operation(state.session,method,...args);}
        catch(retryError) {await this._close(state);throw retryError;}
      }
      finally {state.timer=setTimeout(()=>{state.tail=state.tail.then(()=>this._close(state)).catch(()=>{});},60000);state.timer.unref?.();}
    };
    const result=state.tail.then(action,action);
    state.tail=result.then(()=>{},()=>{});
    return result;
  }
  async _close(state) {
    clearTimeout(state.timer);
    const session=state.session;state.session=null;
    if (session) try {await session.close();} catch {/* discard broken connection */}
  }
  async invalidate(siteId) {
    const state=this.sessions.get(siteId);
    if (state) {await state.tail; await this._close(state);this.sessions.delete(siteId);}
  }
  async dispose() {
    this.disposed=true;
    await Promise.all([...this.sessions.keys()].map(id=>this.invalidate(id)));
  }
}
module.exports={SiteIO,HostKeyError,operation,sameHash,fileType,sftpStat,sftpList,openConnection,authenticationHandler,probeSftpAuthentication,methodGuidance,insideRoot,requireContained,PathBoundaryError};
