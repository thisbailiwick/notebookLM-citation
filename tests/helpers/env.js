// Loads content.js the way a browser would, minus the page bootstrap.
//
// content.js is an IIFE that reads `document` and `chrome` from the global
// scope, so those have to exist before it is required. Each call builds a fresh
// jsdom window and a fresh module instance, keeping the module-level state in
// content.js (isMapping, autoExpandState) from leaking between tests.

const { JSDOM } = require('jsdom');
const path = require('path');

const CONTENT = path.join(__dirname, '..', '..', 'extension', 'content.js');
const POPUP = path.join(__dirname, '..', '..', 'extension', 'popup.js');

// Chrome API surface content.js touches. `settings` is what the auto-expand
// switch is read from; the rest just has to not throw.
function fakeChrome(settings) {
  const sent = [];
  return {
    sent,
    storage: {
      sync: {
        get: (_keys, cb) => cb({ settings: settings || {} }),
        set: (_items, cb) => cb && cb()
      },
      local: {
        get: (_keys, cb) => cb({}),
        set: (_items, cb) => cb && cb()
      },
      onChanged: { addListener: () => {} }
    },
    tabs: {
      query: (_q, cb) => cb([]),
      create: () => {},
      sendMessage: (_id, _msg, cb) => cb && cb({})
    },
    runtime: {
      lastError: null,
      sendMessage: (message, cb) => { sent.push(message); if (cb) cb(); },
      onMessage: { addListener: () => {} }
    }
  };
}

function loadContent(html, options) {
  const opts = options || {};
  const dom = new JSDOM(html || '<body></body>', { url: 'https://notebook.google.com/' });

  // jsdom has no PointerEvent. hoverOn/hoverOff only need something that
  // constructs and dispatches, and MouseEvent carries the same fields.
  if (!dom.window.PointerEvent) dom.window.PointerEvent = dom.window.MouseEvent;

  const previous = {
    window: global.window,
    document: global.document,
    chrome: global.chrome,
    MouseEvent: global.MouseEvent,
    PointerEvent: global.PointerEvent,
    MutationObserver: global.MutationObserver
  };

  global.window = dom.window;
  global.document = dom.window.document;
  global.MouseEvent = dom.window.MouseEvent;
  global.PointerEvent = dom.window.PointerEvent;
  global.MutationObserver = dom.window.MutationObserver;
  global.chrome = fakeChrome(opts.settings);

  delete require.cache[require.resolve(CONTENT)];
  const content = require(CONTENT);

  return {
    content,
    dom,
    window: dom.window,
    document: dom.window.document,
    chrome: global.chrome,
    restore() {
      Object.keys(previous).forEach(key => {
        if (previous[key] === undefined) delete global[key];
        else global[key] = previous[key];
      });
      dom.window.close();
    }
  };
}

// popup.js only needs a document to exist so its DOMContentLoaded registration
// does not throw; the exported helpers are pure.
function loadPopup() {
  const dom = new JSDOM('<body></body>');
  const previousDocument = global.document;
  const previousChrome = global.chrome;
  global.document = dom.window.document;
  global.chrome = fakeChrome({});
  delete require.cache[require.resolve(POPUP)];
  const popup = require(POPUP);
  global.document = previousDocument;
  global.chrome = previousChrome;
  if (previousDocument === undefined) delete global.document;
  if (previousChrome === undefined) delete global.chrome;
  return popup;
}

module.exports = { loadContent, loadPopup, fakeChrome };
