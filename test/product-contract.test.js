'use strict';

// Product surface contracts: these tests catch features added to an API or
// package manifest without the corresponding discoverable VS Code UI route.
// They intentionally complement (not replace) desktop end-to-end testing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const file = name => fs.readFileSync(path.join(root, name), 'utf8');
const manifest = JSON.parse(file('package.json'));
const extension = file('src/extension.js');
const managerController = file('src/manager-panel.js');
const managerPage = file('ui/manager.html');

function collect(re, content, group = 1) {
  return [...content.matchAll(re)].map(match => match[group]);
}

test('every user-facing command is registered and every contributed menu command exists', () => {
  const declared = manifest.contributes.commands.map(entry => entry.command);
  const registered = collect(/\bcommand\(['"](sitedock\.[^'"]+)['"]/g, extension);
  assert.ok(declared.length >= 35, 'unexpected loss of core user commands');
  assert.equal(new Set(declared).size, declared.length, 'duplicate extension command declarations');
  assert.deepEqual(declared.filter(command => !registered.includes(command)), [], 'contributed but not registered');
  assert.deepEqual(registered.filter(command => !declared.includes(command)), [], 'registered but undiscoverable');
  for (const [menu, items] of Object.entries(manifest.contributes.menus)) {
    assert.deepEqual(items.filter(item => !declared.includes(item.command)), [], `invalid menu command in ${menu}`);
  }
});

test('core navigation, site editing, transfers and updates have discoverable surfaces', () => {
  const allViews = Object.values(manifest.contributes.views).flat().map(view => view.id);
  for (const view of ['sitedock.managerSites', 'sitedock.sites', 'sitedock.activity']) {
    assert.ok(allViews.includes(view), `missing sidebar view: ${view}`);
    assert.ok(extension.includes(`createTreeView('${view}'`), `sidebar not wired: ${view}`);
  }
  for (const command of ['manager','add','openSite','focusSite','switchSite','showActivity','checkUpdates','updateSettings','viewReleases']) {
    assert.ok(manifest.contributes.commands.some(x => x.command === `sitedock.${command}`), `${command} not discoverable`);
  }
  assert.match(managerPage, /<h1>Site Manager<\/h1>/);
  assert.match(managerPage, /id="opened"/);
  assert.match(managerPage, /id="saved"/);
  assert.match(managerPage, /id="mode"/);
  assert.match(managerPage, /id="scope"/);
  assert.match(managerPage, /id="filter"/);
});

test('every Site Manager toolbar and updater button has a corresponding message handler', () => {
  const allowed = new Set(collect(/const commands=new Set\(\[([\s\S]*?)\]\)/g, managerController)
    .flatMap(chunk => collect(/'([^']+)'/g, chunk)));
  assert.ok(allowed.size >= 17, 'site manager action whitelist unexpectedly reduced');
  const actions = collect(/<button\b[^>]*data-action="([^"]+)"/g, managerPage);
  assert.ok(actions.includes('add') && actions.includes('closeAll') && actions.includes('openSelected'));
  for (const action of actions) {
    if (action === 'openSelected') {
      assert.match(managerPage, /send\('openMany',\{ids:valid\}\)/, 'Open selected button must submit a multi-site operation');
    } else {
      assert.ok(allowed.has(action), `unhandled manager toolbar action: ${action}`);
    }
  }
  const updateActions = ['checkUpdate', 'installUpdate', 'viewReleases', 'updateSettings'];
  for (const action of updateActions) {
    assert.match(managerPage, new RegExp(`<button[^>]*id="${action}"`), `missing visible ${action} button`);
    assert.ok(allowed.has(action), `manager controller does not allow ${action}`);
    assert.match(managerController, new RegExp(`actions\\[message\\.type\\]`), 'action dispatch must call supplied controller');
    assert.match(extension, new RegExp(`${action}:\\(\\)=>`), `extension does not provide ${action} action`);
  }
  assert.match(managerPage, /for\(const key of \['checkUpdate','installUpdate','viewReleases','updateSettings'\]\)/);
  assert.match(managerPage, /renderUpdates\(msg\.updates\)/);
  assert.match(managerController, /updates:actions\.updateStatus\?\.\(\)/);
  assert.match(managerController, /actions\.onUpdateChange\(update\)/);
});

test('version and update settings agree with presented user experience', () => {
  const readme = file('README.md');
  assert.ok(readme.includes(`version-${manifest.version}-`), 'README release badge does not match package.json');
  assert.ok(readme.includes('(QUALITY_GATES.md)'), 'acceptance criteria not discoverable from README');
  for (const key of ['enabled', 'channel', 'repository', 'checkIntervalHours', 'autoInstall']) {
    assert.ok(manifest.contributes.configuration.properties[`sitedock.updates.${key}`], `missing updater setting: ${key}`);
  }
  assert.match(managerPage, /id="updateInfo"/);
  assert.match(managerPage, /id="updateState"[^>]*role="status"/);
  assert.match(managerPage, /Installed v/);
  assert.match(managerPage, /u\.phase==='error'/);
  assert.match(managerPage, /u\.phase==='available'/);
});
