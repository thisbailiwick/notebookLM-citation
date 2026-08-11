// Loading the scripts the way Chrome does.
//
// The other suites require content.js and popup.js as Node modules, which takes
// the test-only branch. These run them as plain scripts against a real popup
// document with no `module` in scope, so the browser path is exercised too -
// including the service worker, which once threw on load and took the whole
// extension down with it.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'extension');

function chromeStub(onMessageListener) {
  return {
    storage: {
      sync: { get: (_k, cb) => cb({ settings: {} }), set: (_i, cb) => cb && cb() },
      local: { get: (_k, cb) => cb({}), set: (_i, cb) => cb && cb() },
      onChanged: { addListener: () => {} }
    },
    runtime: {
      lastError: null,
      sendMessage: (_m, cb) => cb && cb(),
      onMessage: { addListener: fn => onMessageListener && onMessageListener(fn) },
      onInstalled: { addListener: () => {} }
    },
    tabs: {
      query: (_q, cb) => cb([]),
      create: () => {},
      sendMessage: (_id, _m, cb) => cb && cb({})
    }
  };
}

function runScript(file, html, onMessageListener) {
  const dom = new JSDOM(html, {
    url: 'https://notebook.google.com/', runScripts: 'outside-only'
  });
  const errors = [];
  dom.virtualConsole.on('jsdomError', err => errors.push(err));
  dom.window.chrome = chromeStub(onMessageListener);
  // Neither is implemented by jsdom; both exist in the browser the extension
  // actually runs in. matchMedia backs the "auto" theme.
  if (!dom.window.PointerEvent) dom.window.PointerEvent = dom.window.MouseEvent;
  if (!dom.window.matchMedia) {
    dom.window.matchMedia = () => ({ matches: false, addEventListener: () => {}, addListener: () => {} });
  }
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), dom.getInternalVMContext());
  return { dom, errors };
}

describe('content script', () => {
  test('evaluates as a page script and registers its listener', () => {
    let listener = null;
    const { errors } = runScript('content.js', '<body></body>', fn => { listener = fn; });
    assert.deepEqual(errors, []);
    assert.equal(typeof listener, 'function', 'no onMessage listener registered');
  });

  test('answers a message once loaded in the browser path', () => {
    let listener = null;
    runScript('content.js', '<body></body>', fn => { listener = fn; });
    const replies = [];
    listener({ action: 'getMappings' }, null, r => replies.push(r));
    assert.deepEqual(replies, [{ mappings: [] }]);
  });

  test('does not leak a module export into the page', () => {
    // The export shim must stay invisible to the browser, or the bootstrap is
    // skipped and the extension silently does nothing.
    const { dom } = runScript('content.js', '<body></body>');
    assert.equal(typeof dom.window.module, 'undefined');
  });
});

describe('popup', () => {
  test('runs against the real popup.html without throwing', () => {
    const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
    const { dom, errors } = runScript('popup.js', html);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    assert.deepEqual(errors.map(String), []);
  });

  test('finds every element it reaches for by id', () => {
    // getElementById returning null is the usual way a popup rewiring breaks,
    // and it fails at click time rather than at load.
    const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
    const source = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
    const dom = new JSDOM(html);
    const ids = (source.match(/getElementById\('([^']+)'\)/g) || [])
      .map(m => m.replace(/.*\('|'\)$/g, ''));
    assert.ok(ids.length > 5, 'expected the popup to look up several elements');
    const missing = ids.filter(id => !dom.window.document.getElementById(id));
    assert.deepEqual(missing, [], `popup.html is missing: ${missing.join(', ')}`);
  });

  test('every button popup.js binds exists in the markup', () => {
    const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
    const dom = new JSDOM(html);
    ['copy-btn', 'copy-chat-btn', 'copy-rich-btn', 'export-pdf-btn', 'rescan-btn',
      'settings-btn', 'citation-style', 'select-all-btn', 'select-none-btn']
      .forEach(id => assert.ok(dom.window.document.getElementById(id), `#${id} missing`));
  });
});

describe('settings page', () => {
  test('finds every element it reaches for by id', () => {
    const html = fs.readFileSync(path.join(root, 'settings.html'), 'utf8');
    const source = fs.readFileSync(path.join(root, 'settings.js'), 'utf8');
    const dom = new JSDOM(html);
    const ids = (source.match(/getElementById\('([^']+)'\)/g) || [])
      .map(m => m.replace(/.*\('|'\)$/g, ''));
    const missing = ids.filter(id => !dom.window.document.getElementById(id));
    assert.deepEqual(missing, [], `settings.html is missing: ${missing.join(', ')}`);
  });
});

describe('service worker', () => {
  test('loads without throwing', () => {
    // It called chrome.contextMenus and chrome.scripting with neither
    // permission declared; both were undefined and the error killed the worker.
    const { errors } = runScript('background.js', '<body></body>');
    assert.deepEqual(errors.map(String), []);
  });
});
