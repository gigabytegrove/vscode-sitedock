'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {openConnection,HostKeyError}=require('../src/connection');
const {SiteStore,validateSite}=require('../src/storage');

const fingerprint='a'.repeat(64);
const site=(auth,extras={})=>({id:'site-1',name:'Local Test',protocol:'sftp',auth,
  host:'example.invalid',port:22,user:'test-user',root:'/',fingerprint,...extras});

function clientHarness(prompts=[{prompt:'Password:',echo:false}]) {
  let observed;
  class FakeClient extends EventEmitter {
    constructor() {super(); observed=this;}
    async connect(options) {
      this.options=options;
      if (!options.hostVerifier(fingerprint)) throw new Error('Host key rejected');
      if (options.tryKeyboard) {
        await new Promise(resolve=>this.emit('keyboard-interactive','server','','en',prompts,answers=>{this.answers=answers;resolve();}));
        if (this.answers.length!==1 || this.answers[0]!=='correct secret') throw new Error('All configured authentication methods failed');
      } else if (options.password!=='correct secret') throw new Error('All configured authentication methods failed');
    }
    async end() {this.closed=true;}
  }
  return {load:()=>FakeClient,instance:()=>observed};
}

test('SFTP password mode uses password auth without keyboard prompts',async()=>{
  const mock=clientHarness();
  const session=await openConnection(site('password'),'correct secret','',mock.load);
  assert.equal(mock.instance().options.password,'correct secret');
  assert.equal(mock.instance().options.tryKeyboard,undefined);
  assert.equal(mock.instance().listenerCount('keyboard-interactive'),0);
  await session.close();
  assert.equal(mock.instance().closed,true);
});

test('SFTP keyboard mode requests only keyboard-interactive and answers one masked password prompt',async()=>{
  const mock=clientHarness();
  const session=await openConnection(site('keyboard'),'correct secret','',mock.load);
  assert.equal(mock.instance().options.tryKeyboard,true);
  assert.equal(typeof mock.instance().options.authHandler,'function');
  assert.equal(mock.instance().options.password,undefined);
  assert.deepEqual(mock.instance().answers,['correct secret']);
  await session.close();
});

test('SFTP keyboard mode refuses to send stored password in an OTP prompt',async()=>{
  const mock=clientHarness([{prompt:'One-time verification code',echo:false}]);
  await assert.rejects(openConnection(site('keyboard'),'correct secret','',mock.load),/unsupported challenge/);
  assert.deepEqual(mock.instance().answers,[]);
});

test('SFTP keyboard mode refuses multi-factor prompts without leaking password',async()=>{
  const mock=clientHarness([{prompt:'Password:',echo:false},{prompt:'OTP:',echo:false}]);
  await assert.rejects(openConnection(site('keyboard'),'correct secret','',mock.load),/multiple authentication factors/);
  assert.deepEqual(mock.instance().answers,[]);
});

test('SFTP keyboard mode requires a password before connection attempt',async()=>{
  const mock=clientHarness();
  await assert.rejects(openConnection(site('keyboard'),'','',mock.load),/needs a password/);
  assert.equal(mock.instance().options,undefined);
});

test('SFTP authentication refusal identifies which method failed',async()=>{
  const mock=clientHarness();
  await assert.rejects(openConnection(site('password'),'bad password','',mock.load),/rejected \(password\)/);
});

test('SFTP host identity is checked before keyboard-interactive password challenge',async()=>{
  const mock=clientHarness();
  await assert.rejects(openConnection(site('keyboard',{fingerprint:'b'.repeat(64)}),'correct secret','',mock.load),HostKeyError);
  assert.equal(mock.instance().answers,undefined);
});

test('password and keyboard authentication share existing secret without losing it',async()=>{
  const globalData=new Map();const secrets=new Map();
  const context={globalState:{get:(k,f)=>globalData.get(k)??f,update:async(k,v)=>globalData.set(k,v)},
    secrets:{get:async k=>secrets.get(k),store:async(k,v)=>secrets.set(k,v),delete:async k=>secrets.delete(k)}};
  const store=new SiteStore(context);
  const passwordSite=await store.save(site('password',{fingerprint:''}),{password:'correct secret'});
  const switched=await store.save({...passwordSite,auth:'keyboard'},{password:''});
  assert.equal(switched.auth,'keyboard');
  assert.equal(await store.password('site-1'),'correct secret');
  const back=await store.save({...switched,auth:'password'},{password:''});
  assert.equal(back.auth,'password');
  assert.equal(await store.password('site-1'),'correct secret');
});

test('only SFTP permits keyboard-interactive and key authentication',()=>{
  assert.equal(validateSite(site('keyboard')).auth,'keyboard');
  assert.equal(validateSite({...site('keyboard'),protocol:'ftp',port:21}).auth,'password');
});
