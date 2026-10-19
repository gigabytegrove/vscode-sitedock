'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeRoot,remotePath,validName,safeChildPath}=require('../src/paths');
test('remote folder is normalized and site root is applied',()=>{
  assert.equal(normalizeRoot('/srv/www///site/'),'/srv/www/site/');
  assert.equal(remotePath({root:'/srv/www/site'},'/public/index.html'),'/srv/www/site/public/index.html');
  assert.equal(remotePath({root:'/'},'/a/b'),'/a/b');
});
test('rejects escapes, CRLF injection and invalid filenames',()=>{
  for(const root of ['../root','/var/../etc','/foo\nDELETE','C:\\temp'])assert.throws(()=>normalizeRoot(root));
  for(const path of ['/../passwd','/a/./b','/foo\r\nRMD /','/\\evil'])assert.throws(()=>remotePath({root:'/site'},path));
  for(const name of ['../other','a/b','a\\b','.', '..','', '\r\nRMD /'])assert.throws(()=>validName(name));
  assert.equal(safeChildPath('/dir','test.json'),'/dir/test.json');
});
