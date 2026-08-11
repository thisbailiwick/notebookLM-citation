// The manifest is where two of the fixed bugs actually lived: the content
// script matched only the old hostname, and the service worker called APIs
// whose permissions were never declared.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));

const HOSTS = ['https://notebook.google.com/*', 'https://notebooklm.google.com/*'];

// background.js names chrome.contextMenus in a comment warning against it, so
// these checks have to read code rather than prose. Only whole-line comments
// are stripped, which leaves URLs in string literals intact.
function readCode(file) {
  return fs.readFileSync(path.join(root, 'extension', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .join('\n');
}

describe('manifest', () => {
  test('runs on both the new and old NotebookLM hosts', () => {
    HOSTS.forEach(host => {
      assert.ok(manifest.host_permissions.includes(host), `missing host permission ${host}`);
      assert.ok(manifest.content_scripts[0].matches.includes(host), `missing content script match ${host}`);
    });
  });

  test('declares a permission for every chrome API the scripts use', () => {
    // chrome.contextMenus and chrome.scripting were called without either
    // permission declared, so both were undefined and the service worker threw
    // on load, taking the whole extension with it.
    const declared = new Set(manifest.permissions);
    const optional = new Set(['runtime', 'storage', 'tabs', 'downloads']);
    const files = ['content.js', 'popup.js', 'background.js', 'settings.js'];

    files.forEach(file => {
      const source = readCode(file);
      const used = new Set((source.match(/chrome\.([a-zA-Z]+)/g) || [])
        .map(match => match.slice('chrome.'.length)));
      used.forEach(api => {
        // runtime and tabs.create need no permission; storage does.
        if (api === 'runtime' || api === 'tabs') return;
        assert.ok(declared.has(api) || !optional.has(api),
          `${file} uses chrome.${api} but the manifest does not declare it`);
        if (api === 'storage') assert.ok(declared.has('storage'), `${file} needs the storage permission`);
      });
    });
  });

  test('does not use chrome APIs it has no permission for', () => {
    const declared = new Set(manifest.permissions);
    const needsPermission = ['contextMenus', 'scripting', 'bookmarks', 'history', 'cookies'];
    ['content.js', 'popup.js', 'background.js', 'settings.js'].forEach(file => {
      const source = readCode(file);
      needsPermission.forEach(api => {
        if (declared.has(api)) return;
        assert.ok(!source.includes('chrome.' + api),
          `${file} calls chrome.${api} without declaring the permission`);
      });
    });
  });

  test('is manifest v3 with a service worker', () => {
    assert.equal(manifest.manifest_version, 3);
    assert.ok(manifest.background.service_worker);
  });

  test('version matches package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(manifest.version, pkg.version);
  });
});
