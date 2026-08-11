// The whole pipeline: a page in, a finished document out, plus the message
// protocol the popup drives it through.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const { loadContent } = require('./helpers/env');
const fx = require('./helpers/fixtures');

let env;
afterEach(() => { if (env) { env.restore(); env = null; } });

function page() {
  return fx.twoExchangePage();
}

function send(request) {
  return new Promise(resolve => {
    const returned = env.content.handleMessage(request, null, resolve);
    // A listener returning true is keeping the channel open for an async reply.
    assert.ok(returned === true || returned === undefined);
  });
}

describe('buildExport', () => {
  test('numbers citations consecutively across the whole export', async () => {
    env = loadContent(page(), { settings: { autoExpand: false } });
    const result = await env.content.buildExport('none', null);
    assert.ok(result.chatText.includes('[^3]'), result.chatText);
    assert.ok(result.chatText.includes('[^4]'), result.chatText);
  });

  test('returns both flavors from one pass', async () => {
    env = loadContent(page(), { settings: { autoExpand: false } });
    const result = await env.content.buildExport('none', null);
    assert.ok(result.chatText.startsWith('# NotebookLM Export'));
    assert.ok(!result.plainText.includes('#'), result.plainText);
    assert.ok(result.plainText.includes('Q: What does he say about nonduality?'));
  });

  test('honours an exchange selection', async () => {
    env = loadContent(page(), { settings: { autoExpand: false } });
    const result = await env.content.buildExport('none', [1]);
    assert.ok(!result.chatText.includes('nonduality'), result.chatText);
    assert.ok(result.chatText.includes('ocean'), result.chatText);
    // Numbering restarts from 1 over the selection.
    assert.ok(result.chatText.includes('[^1]'));
    assert.ok(!result.chatText.includes('[^3]'));
  });

  test('treats an empty selection as everything', async () => {
    env = loadContent(page(), { settings: { autoExpand: false } });
    const result = await env.content.buildExport('none', []);
    assert.ok(result.chatText.includes('nonduality'));
    assert.ok(result.chatText.includes('ocean'));
  });

  test('returns null when the selection matches nothing', async () => {
    env = loadContent(page(), { settings: { autoExpand: false } });
    assert.equal(await env.content.buildExport('none', [99]), null);
  });

  test('falls back to "none" for an unknown style', async () => {
    env = loadContent(page(), { settings: { autoExpand: false } });
    const result = await env.content.buildExport('nonsense', null);
    assert.equal(result.style, 'none');
    // "none" never hovers, so nothing is harvested.
    assert.equal(result.stats.citations, 0);
  });

  test('skips the snippet harvest for the "none" style', async () => {
    env = loadContent(page(), { settings: { autoExpand: false } });
    await env.content.buildExport('none', null);
    assert.equal(env.chrome.sent.filter(m => m.action === 'harvestProgress').length, 0);
  });

  test('expands collapsed lists before collecting markers', async () => {
    // Collecting first would miss whatever the expansion reveals, which is how
    // hidden citations went missing from exports.
    const html = '<body>' + fx.question('Q') +
      fx.answer(fx.paragraph(fx.marker(1, 'A.epub') + fx.expander())) +
      fx.overlay() + '</body>';
    env = loadContent(html, { settings: { autoExpand: true } });
    const container = env.document.querySelector('.to-user-container .paragraph');
    const button = container.querySelector('mat-icon').parentElement;
    button.addEventListener('click', () => {
      button.remove();
      container.insertAdjacentHTML('beforeend', fx.marker(2, 'B.epub'));
    });

    const result = await env.content.buildExport('none', null);
    assert.ok(result.chatText.includes('[^2]'), result.chatText);
  });

  test('leaves collapsed lists alone when auto-expand is off', async () => {
    const html = '<body>' + fx.question('Q') +
      fx.answer(fx.paragraph(fx.marker(1, 'A.epub') + fx.expander())) +
      fx.overlay() + '</body>';
    env = loadContent(html, { settings: { autoExpand: false } });
    const result = await env.content.buildExport('none', null);
    assert.ok(!result.chatText.includes('[^2]'), result.chatText);
  });

  test('reports how many citations it read', async () => {
    env = loadContent(page(), { settings: { autoExpand: false } });
    const result = await env.content.buildExport('footnotes', null);
    assert.equal(result.stats.citations, 4);
    // Nothing is wired to answer a hover in this fixture.
    assert.equal(result.stats.missing, 4);
  });
});

describe('mapCitations', () => {
  test('lists every citation with the answer it belongs to', async () => {
    env = loadContent(page());
    const mappings = await env.content.mapCitations();
    assert.equal(mappings.length, 4);
    assert.deepEqual(mappings.map(m => m.citation), ['1', '2', '1', '2']);
    // Same local number, different answers - kept apart by the answer field.
    assert.notEqual(mappings[0].answer, mappings[2].answer);
  });

  test('names an unlabelled source rather than dropping it', async () => {
    const html = '<body>' + fx.answer(fx.paragraph(
      '<button class="citation-marker"><span>1</span></button>')) + '</body>';
    env = loadContent(html);
    const mappings = await env.content.mapCitations();
    assert.equal(mappings[0].filename, '(unknown source)');
  });
});

describe('message protocol', () => {
  test('getOutline describes each exchange', async () => {
    env = loadContent(page());
    const response = await send({ action: 'getOutline' });
    assert.equal(response.exchanges.length, 2);
    assert.deepEqual(response.exchanges.map(e => e.index), [0, 1]);
    assert.deepEqual(response.exchanges.map(e => e.citations), [2, 2]);
    assert.equal(response.exchanges[0].preview, 'What does he say about nonduality?');
  });

  test('getMappings returns the last scan', async () => {
    env = loadContent(page());
    await env.content.mapCitations();
    const response = await send({ action: 'getMappings' });
    assert.equal(response.mappings.length, 4);
  });

  test('rescan maps the page', async () => {
    env = loadContent(page(), { settings: { autoExpand: false } });
    const response = await send({ action: 'rescan' });
    assert.equal(response.mappings.length, 4);
  });

  test('getChatText returns a document', async () => {
    env = loadContent(page(), { settings: { autoExpand: false } });
    const response = await send({ action: 'getChatText', style: 'none', selection: null });
    assert.ok(response.chatText.includes('## Exchange 1'));
  });

  test('getChatText reports an empty page instead of throwing', async () => {
    env = loadContent('<body></body>', { settings: { autoExpand: false } });
    const response = await send({ action: 'getChatText', style: 'none', selection: null });
    assert.equal(response.chatText, null);
  });

  test('an unknown action is ignored', () => {
    env = loadContent(page());
    let called = false;
    env.content.handleMessage({ action: 'nope' }, null, () => { called = true; });
    assert.equal(called, false);
  });
});
