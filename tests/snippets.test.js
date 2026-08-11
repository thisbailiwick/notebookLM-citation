// Reading source snippets out of the CDK overlay.
//
// Hovering a citation renders its snippet into a single shared overlay. Nothing
// is fetched, so a synthetic hover is the only way to get at the text. The
// overlay being shared is what makes this delicate: the previous tooltip is
// still on screen when the next hover starts.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const { loadContent } = require('./helpers/env');
const fx = require('./helpers/fixtures');

let env;
afterEach(() => { if (env) { env.restore(); env = null; } });

// Makes markers behave like the real page: hovering swaps the overlay contents,
// unhovering clears it.
function wireTooltips(document, sources, options) {
  const opts = options || {};
  const overlay = document.querySelector('.cdk-overlay-container');
  document.querySelectorAll('.citation-marker').forEach(marker => {
    const number = marker.querySelector('span') && marker.querySelector('span').textContent.trim();
    const source = sources[number];
    marker.addEventListener('mouseover', () => {
      if (!source || opts.dead) return;
      overlay.innerHTML = '<div class="citation-tooltip">' +
        `<div class="citation-tooltip-header">${source.filename}</div>` +
        `<div class="citation-tooltip-text">${source.snippet}</div></div>`;
    });
    marker.addEventListener('mouseout', () => { overlay.innerHTML = ''; });
  });
}

describe('reading the overlay', () => {
  test('reads the filename and snippet', () => {
    env = loadContent('<body>' + fx.overlay('Book.epub', 'A passage.') + '</body>');
    assert.deepEqual(env.content.tooltipSnapshot(), {
      filename: 'Book.epub', snippet: 'A passage.'
    });
  });

  test('returns null with no tooltip open', () => {
    env = loadContent('<body>' + fx.overlay() + '</body>');
    assert.equal(env.content.tooltipSnapshot(), null);
  });

  test('returns null when the snippet body is empty', () => {
    // A tooltip mid-render has the elements but no text yet; treating that as a
    // real snippet would store an empty quote.
    env = loadContent('<body>' + fx.overlay('Book.epub', '   ') + '</body>');
    assert.equal(env.content.tooltipSnapshot(), null);
  });

  test('returns null when there is no overlay at all', () => {
    env = loadContent('<body></body>');
    assert.equal(env.content.tooltipSnapshot(), null);
  });
});

describe('hovering a marker', () => {
  test('reads the snippet a hover reveals', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(1, 'A.epub'))) + fx.overlay() + '</body>');
    wireTooltips(env.document, { 1: { filename: 'A.epub', snippet: 'First passage.' } });

    const snap = await env.content.readSnippet(env.document.querySelector('.citation-marker'), null);
    assert.deepEqual(snap, { filename: 'A.epub', snippet: 'First passage.' });
  });

  test('leaves no tooltip pinned open afterwards', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(1, 'A.epub'))) + fx.overlay() + '</body>');
    wireTooltips(env.document, { 1: { filename: 'A.epub', snippet: 'First.' } });
    await env.content.readSnippet(env.document.querySelector('.citation-marker'), null);
    assert.equal(env.content.tooltipSnapshot(), null);
  });

  test('distinguishes a repeated snippet from a tooltip that never opened', async () => {
    // The fast path waits for the text to change. When two citations quote the
    // same passage it cannot change, so the slow path has to confirm it.
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(1, 'A.epub'))) + fx.overlay() + '</body>');
    wireTooltips(env.document, { 1: { filename: 'A.epub', snippet: 'Same passage.' } });

    const snap = await env.content.readSnippet(
      env.document.querySelector('.citation-marker'), 'Same passage.');
    assert.deepEqual(snap, { filename: 'A.epub', snippet: 'Same passage.' });
  });

  test('gives up on a marker that never opens', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(1, 'A.epub'))) + fx.overlay() + '</body>');
    wireTooltips(env.document, {}, { dead: true });
    assert.equal(await env.content.readSnippet(env.document.querySelector('.citation-marker'), null), null);
  });
});

describe('harvesting a page', () => {
  function page() {
    return '<body>' +
      fx.question('Q1') +
      fx.answer(fx.paragraph(fx.marker(1, 'A.epub') + fx.marker(2, 'B.epub'))) +
      fx.overlay() + '</body>';
  }

  test('stores a snippet against every citation', async () => {
    env = loadContent(page());
    wireTooltips(env.document, {
      1: { filename: 'A.epub', snippet: 'First passage.' },
      2: { filename: 'B.epub', snippet: 'Second passage.' }
    });
    const messages = env.content.collectMessages();
    const result = await env.content.harvestSnippets(messages);

    assert.deepEqual(result, { total: 2, missing: 0 });
    assert.equal(messages[1].snippets.get('1').snippet, 'First passage.');
    assert.equal(messages[1].snippets.get('2').snippet, 'Second passage.');
  });

  test('counts citations it could not read', async () => {
    env = loadContent(page());
    wireTooltips(env.document, { 1: { filename: 'A.epub', snippet: 'Only this one.' } });
    const result = await env.content.harvestSnippets(env.content.collectMessages());
    assert.deepEqual(result, { total: 2, missing: 1 });
  });

  test('reports progress as it goes', async () => {
    env = loadContent(page());
    wireTooltips(env.document, {
      1: { filename: 'A.epub', snippet: 'One.' },
      2: { filename: 'B.epub', snippet: 'Two.' }
    });
    await env.content.harvestSnippets(env.content.collectMessages());

    const progress = env.chrome.sent.filter(m => m.action === 'harvestProgress');
    assert.deepEqual(progress.map(p => p.done), [0, 1, 2]);
    assert.ok(progress.every(p => p.total === 2));
  });

  test('reads a repeated passage correctly across citations', async () => {
    env = loadContent(page());
    wireTooltips(env.document, {
      1: { filename: 'A.epub', snippet: 'Shared passage.' },
      2: { filename: 'A.epub', snippet: 'Shared passage.' }
    });
    const messages = env.content.collectMessages();
    const result = await env.content.harvestSnippets(messages);

    assert.equal(result.missing, 0);
    assert.equal(messages[1].snippets.get('2').snippet, 'Shared passage.');
  });

  test('counts a page with no citations as nothing to do', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph('No citations here')) + fx.overlay() + '</body>');
    assert.deepEqual(await env.content.harvestSnippets(env.content.collectMessages()),
      { total: 0, missing: 0 });
  });
});
