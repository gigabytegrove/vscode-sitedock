'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {
  authenticationHandler,probeSftpAuthentication,openConnection,HostKeyError,methodGuidance
}=require('../src/connection');

const SHA='d'.repeat(64);
const SITE={id:'diagnostic-site',name:'Example site',host:'example.invalid',port:22000,
  user:'testaccount',root:'/var/www',protocol:'sftp',auth:'password',fingerprint:SHA};

function fakeTransport({methods=['publickey','keyboard-interactive'],serverHash=SHA,failEarly=false,
  acceptedNone=false,allowMethod=null}={}) {
  const instances=[];
  class FakeClient extends EventEmitter {
    constructor(){super();this.events=[];instances.push(this);}
    async connect(opts){
      this.config=opts;
      this.events.push('connected');
      if(!opts.hostVerifier(serverHash))throw new Error('SSH host verification failed');
      if(failEarly)throw new Error('SSH handshake ended before user authentication');
      const select=(available,partial=false)=>new Promise(resolve=>{
        opts.authHandler(available,partial,choice=>resolve(choice));
      });
      const first=await select(null);
      this.events.push(first);
      assert.equal(first,'none','The SSH client must first send a credential-free none request');
      if(acceptedNone)return;
      const second=await select(methods);
      this.events.push(second);
      if(second===false)throw new Error('All configured authentication methods failed');
      if(second==='keyboard-interactive'){
        assert.equal(opts.password,undefined);
        assert.equal(opts.tryKeyboard,true);
        let reply;
        this.emit('keyboard-interactive','', '', 'en', [{prompt:'Password:',echo:false}],answers=>{reply=answers;});
        this.events.push(reply);
      }
      if(second===allowMethod)return;
      const stop=await select(methods);
      this.events.push(stop);
      assert.equal(stop,false,'Do not send a second credential attempt after rejection');
      throw new Error('All configured authentication methods failed');
    }
    async end(){this.closed=true;}
  }
  return {library:()=>FakeClient,instances};
}

test('SSH diagnostic probes advertised methods without sending a password, key, or passphrase',async()=>{
  const h=fakeTransport();
  const report=await probeSftpAuthentication(SITE,h.library);
  assert.deepEqual(report,{methods:['publickey','keyboard-interactive'],partialSuccess:false,acceptedNone:false});
  assert.deepEqual(h.instances[0].events,['connected','none',false]);
  assert.equal(h.instances[0].config.password,undefined);
  assert.equal(h.instances[0].config.privateKey,undefined);
  assert.equal(h.instances[0].config.passphrase,undefined);
  assert.equal(h.instances[0].closed,true);
});

test('diagnostic refuses changed host key before accepting any authentication state',async()=>{
  const h=fakeTransport({serverHash:'e'.repeat(64)});
  await assert.rejects(probeSftpAuthentication(SITE,h.library),HostKeyError);
  assert.deepEqual(h.instances[0].events,['connected']);
  assert.equal(h.instances[0].closed,true);
});

test('diagnostic does not invent authentication methods when SSH negotiation was interrupted',async()=>{
  const h=fakeTransport({failEarly:true});
  await assert.rejects(probeSftpAuthentication(SITE,h.library),/Could not retrieve SSH authentication methods/);
});

test('diagnostic can report no-auth SSH login without sending credentials',async()=>{
  const h=fakeTransport({acceptedNone:true});
  const result=await probeSftpAuthentication(SITE,h.library);
  assert.deepEqual(result,{methods:[],partialSuccess:false,acceptedNone:true});
  assert.equal(h.instances[0].config.password,undefined);
});

test('password login sends at most one password attempt and reports server-advertised methods',async()=>{
  const h=fakeTransport({methods:['password','publickey']});
  await assert.rejects(openConnection(SITE,'not-the-correct-password','',h.library),err=>{
    assert.match(err.message,/rejected \(password\)/);
    assert.match(err.message,/password, publickey/);
    assert.equal(err.message.includes('not-the-correct-password'),false);
    return true;
  });
  assert.deepEqual(h.instances[0].events,['connected','none','password',false]);
  assert.equal(h.instances[0].config.password,'not-the-correct-password');
});

test('does not submit password when server does not advertise password authentication',async()=>{
  const h=fakeTransport({methods:['publickey','keyboard-interactive']});
  await assert.rejects(openConnection(SITE,'secret','',h.library),err=>{
    assert.match(err.message,/did not advertise password/);
    assert.match(err.message,/Try Keyboard-interactive/);
    assert.equal(err.message.includes('secret'),false);
    return true;
  });
  assert.deepEqual(h.instances[0].events,['connected','none',false]);
});

test('keyboard-interactive flow never falls back to password and submits at most one answer',async()=>{
  const h=fakeTransport({methods:['keyboard-interactive']});
  await assert.rejects(openConnection({...SITE,auth:'keyboard'},'the-secret','',h.library),/rejected \(keyboard-interactive\)/);
  assert.deepEqual(h.instances[0].events,['connected','none','keyboard-interactive',['the-secret'],false]);
  assert.equal(h.instances[0].config.password,undefined);
});

test('when the server permits the selected auth method, the connection stays open for file operations',async()=>{
  const h=fakeTransport({methods:['password'],allowMethod:'password'});
  const conn=await openConnection(SITE,'right-password','',h.library);
  assert.equal(conn.type,'sftp');
  assert.deepEqual(h.instances[0].events,['connected','none','password']);
  await conn.close();
  assert.equal(h.instances[0].closed,true);
});

test('auth selection stops after one attempted method even if server repeats it as available',async()=>{
  const choices=[];const handler=authenticationHandler('password',methods=>choices.push(methods));
  const selected=[];
  handler(null,null,x=>selected.push(x));
  handler(['password','publickey'],false,x=>selected.push(x));
  handler(['password','publickey'],false,x=>selected.push(x));
  assert.deepEqual(selected,['none','password',false]);
  assert.deepEqual(choices,[['password','publickey'],['password','publickey']]);
});

test('unsupported auth methods are identified without asserting account-wide permissions',()=>{
  assert.match(methodGuidance('password',['keyboard-interactive']),/Try Keyboard-interactive/);
  assert.match(methodGuidance('key',['publickey']),/does not guarantee/);
  assert.match(methodGuidance('password',[]),/did not report/);
});

test('Test Connection retrieves unchanged password from SecretStorage when editor field is blank',async()=>{
  const {SiteIO}=require('../src/connection');
  const {SiteStore}=require('../src/storage');
  const settings=new Map(),keys=new Map();
  const context={
    globalState:{get:(key,defaultValue)=>settings.get(key)??defaultValue,update:async(key,value)=>settings.set(key,value)},
    secrets:{get:async key=>keys.get(key),store:async(key,value)=>keys.set(key,value),delete:async key=>keys.delete(key)}
  };
  const store=new SiteStore(context);
  const saved=await store.save(SITE,{password:'saved-secret'});
  await store.save({...saved,name:'Updated connection name'},{password:''});
  const calls=[];
  const connect=async(site,password,passphrase)=>{
    calls.push({user:site.user,password,passphrase});
    return {type:'sftp',client:{list:async()=>[],realPath:async p=>p},close:async()=>{}};
  };
  const io=new SiteIO(store,async()=>{},connect);
  await io.test(store.get(saved.id),{password:'',passphrase:''});
  assert.deepEqual(calls,[{user:'testaccount',password:'saved-secret',passphrase:undefined}]);
  assert.equal(JSON.stringify(store.all()).includes('saved-secret'),false);
  await io.dispose();
});

test('Opening saved site retrieves SecretStorage password on a normal folder-browse operation',async()=>{
  const {SiteIO}=require('../src/connection');
  let received;
  const remote={id:'saved-id',name:'Saved Site',protocol:'sftp',host:'example.invalid',port:22,user:'root',root:'/',auth:'password'};
  const store={get:id=>id==='saved-id'?remote:undefined,password:async()=> 'persisted-password',passphrase:async()=>undefined};
  const io=new SiteIO(store,async()=>{},async(site,password)=>{
    received=password;
    return {type:'sftp',client:{list:async()=>[],realPath:async p=>p},close:async()=>{}};
  });
  assert.deepEqual(await io.run('saved-id','list','/'),[]);
  assert.equal(received,'persisted-password');
  await io.dispose();
});

test('webview diagnostic button exists, is SFTP-only, and does not send secrets',()=>{
  const fs=require('node:fs');const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','ui','editor.html'),'utf8');
  assert.match(html,/id="diagnose"/);
  assert.match(html,/protocol!==\x27sftp\x27/);
  assert.match(html,/password:type===\x27diagnose\x27\?\x27\x27/);
  const contents=html.match(/<script nonce="%%NONCE%%">([\s\S]*?)<\/script>/)[1];
  new (require('node:vm').Script)(contents);
});

test('a missing SecretStorage password is identified before sending an SSH authentication attempt',async()=>{
  const h=fakeTransport({methods:['password']});
  await assert.rejects(openConnection(SITE,undefined,'',h.library),/No saved password is available/);
  assert.equal(h.instances[0].config,undefined);
});
