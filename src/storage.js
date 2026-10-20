'use strict';
const {randomUUID} = require('node:crypto');
const {isIP} = require('node:net');
const {normalizeRoot} = require('./paths');
const KEY = 'sitedock.sites.v1';
const protocols = new Set(['sftp','ftp','ftps','ftps-implicit']);

function validateSite(input, id) {
  if (!input || typeof input !== 'object') throw new Error('Missing server details.');
  const name = String(input.name || '').trim();
  const rawHost = String(input.host || '').trim();
  const host = rawHost.startsWith('[') && rawHost.endsWith(']') && isIP(rawHost.slice(1,-1))===6 ? rawHost.slice(1,-1) : rawHost;
  const protocol = String(input.protocol || 'sftp');
  const user = String(input.user || '').trim();
  const auth = protocol === 'sftp' && ['key','keyboard'].includes(input.auth) ? input.auth : 'password';
  if (!name || name.length > 80) throw new Error('Give this server a name (up to 80 characters).');
  if (!host || host.length > 253 || (!isIP(host) && /[\s/@:?#[\]\\\x00-\x1f]/.test(host))) throw new Error('Enter a hostname or IP address without a URL prefix.');
  if (!protocols.has(protocol)) throw new Error('Unsupported connection protocol.');
  if (!user) throw new Error('Enter a username.');
  const defaults = {sftp:22,ftp:21,ftps:21,'ftps-implicit':990};
  const port = input.port === '' || input.port == null ? defaults[protocol] : Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
  const keyPath = auth === 'key' ? String(input.keyPath || '').trim() : '';
  if (auth === 'key' && !keyPath) throw new Error('Choose a private key file.');
  const fingerprint = protocol === 'sftp' && typeof input.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.fingerprint) ? input.fingerprint : '';
  return {id: id || randomUUID(), name, host, protocol, port, user, auth, keyPath, root:normalizeRoot(String(input.root || '/')), followExternalLinks:protocol === 'sftp' && input.followExternalLinks === true, fingerprint};
}
class SiteStore {
  constructor(context) { this.context=context; }
  all() { return (this.context.globalState.get(KEY, []) || []).map(s=>({...s})).sort((a,b)=>a.name.localeCompare(b.name)); }
  get(id) { return this.all().find(s=>s.id===id); }
  secretKey(id, kind) { return `sitedock.${id}.${kind}`; }
  async password(id) { return this.context.secrets.get(this.secretKey(id,'password')); }
  async passphrase(id) { return this.context.secrets.get(this.secretKey(id,'passphrase')); }
  async save(input, secrets = {}, options = {}) {
    const site=validateSite(input, input.id || undefined);
    const old=this.get(site.id);
    const credentialKindChanged=Boolean(old && ((old.auth==='key') !== (site.auth==='key') || old.protocol !== site.protocol));
    const hostChanged=Boolean(old && (old.host !== site.host || old.port !== site.port));
    if (hostChanged && !options.verifiedForNewHost) site.fingerprint='';
    const password=typeof secrets.password === 'string' ? secrets.password : '';
    const passphrase=typeof secrets.passphrase === 'string' ? secrets.passphrase : '';
    const existingPassword=!credentialKindChanged && old ? await this.password(site.id) : '';
    if (site.auth !== 'key' && !password && !existingPassword) throw new Error('A password is required to save this server.');
    // Validate before changing any persisted secret or server setting.
    if (site.auth !== 'key') {
      if (password) await this.context.secrets.store(this.secretKey(site.id,'password'),password);
      await this.context.secrets.delete(this.secretKey(site.id,'passphrase'));
    } else {
      await this.context.secrets.delete(this.secretKey(site.id,'password'));
      if (passphrase) await this.context.secrets.store(this.secretKey(site.id,'passphrase'),passphrase);
      else if (credentialKindChanged) await this.context.secrets.delete(this.secretKey(site.id,'passphrase'));
    }
    const others=this.all().filter(s=>s.id!==site.id);
    await this.context.globalState.update(KEY,[...others,site]);
    return site;
  }
  async importProfiles(profiles) {
    if(!Array.isArray(profiles)||profiles.length>500)throw new Error('Invalid imported SiteDock profiles.');
    const existing=this.all();
    const used=new Set(existing.map(s=>s.id));
    const normalized=[];
    for(const site of profiles){
      if(!site||typeof site!=='object'||!site.id||used.has(site.id))throw new Error('Invalid or duplicated imported site ID.');
      used.add(site.id);
      // Revalidate all entries before writing anything to persistent storage.
      const cleaned=validateSite(site,site.id);
      if(cleaned.followExternalLinks||cleaned.fingerprint)throw new Error('Imported sites cannot implicitly trust an SSH host or external symlink.');
      normalized.push(cleaned);
    }
    await this.context.globalState.update(KEY,[...existing,...normalized]);
    return profiles.length;
  }
  async trustKey(id, fingerprint) {
    if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error('Invalid host fingerprint.');
    const site=this.get(id);
    if (!site) throw new Error('Server no longer exists.');
    await this.context.globalState.update(KEY,this.all().map(s=>s.id===id ? {...s,fingerprint} : s));
  }
  async remove(id) {
    await this.context.globalState.update(KEY,this.all().filter(s=>s.id!==id));
    await this.context.secrets.delete(this.secretKey(id,'password'));
    await this.context.secrets.delete(this.secretKey(id,'passphrase'));
  }
}
module.exports={SiteStore,validateSite};
