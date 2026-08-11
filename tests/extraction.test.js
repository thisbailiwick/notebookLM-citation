// Reading the page: which elements are messages, what role they play, and
// which citation markers they carry.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const { loadContent } = require('./helpers/env');
const fx = require('./helpers/fixtures');

let env;
afterEach(() => { if (env) { env.restore(); env = null; } });

describe('message discovery', () => {
  test('finds chat-message elements and skips empty ones', () => {
    env = loadContent('<body>' + fx.question('Hi') + '<chat-message>  </chat-message>' + '</body>');
    assert.equal(env.content.messageElements().length, 1);
  });

  test('falls back to .message-text-content when chat-message is absent', () => {
    env = loadContent('<body><div class="message-text-content">Something</div></body>');
    assert.equal(env.content.messageElements().length, 1);
  });

  test('reads role from the container class', () => {
    env = loadContent(fx.twoExchangePage());
    const roles = env.content.collectMessages().map(m => m.role);
    assert.deepEqual(roles, ['question', 'answer', 'question', 'answer']);
  });

  test('reports an unrecognised container as a plain message', () => {
    env = loadContent('<body><chat-message><div>Loose text</div></chat-message></body>');
    assert.equal(env.content.collectMessages()[0].role, 'message');
  });
});

describe('citation markers', () => {
  test('reads the number from the marker span', () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(7, 'A.pdf'))) + '</body>');
    const button = env.document.querySelector('.citation-marker');
    assert.equal(env.content.citationNumber(button), '7');
  });

  test('ignores a marker whose span is not a number', () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.expander())) + '</body>');
    const button = env.document.querySelector('.citation-marker');
    assert.equal(env.content.citationNumber(button), null);
  });

  test('reads the filename out of the aria-label', () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(3, 'The Deepest Acceptance.epub'))) + '</body>');
    const button = env.document.querySelector('.citation-marker');
    assert.equal(env.content.citationFilename(button), 'The Deepest Acceptance.epub');
  });

  test('handles a filename containing a colon', () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(3, 'Book: A Subtitle.epub'))) + '</body>');
    const button = env.document.querySelector('.citation-marker');
    assert.equal(env.content.citationFilename(button), 'Book: A Subtitle.epub');
  });

  test('keeps only the first marker for a repeated number', () => {
    const body = fx.paragraph(fx.marker(1, 'A.pdf') + ' text ' + fx.marker(1, 'A.pdf') + fx.marker(2, 'B.pdf'));
    env = loadContent('<body>' + fx.answer(body) + '</body>');
    const message = env.document.querySelector('chat-message');
    const markers = env.content.markersByNumber(message);
    assert.deepEqual(Array.from(markers.keys()), ['1', '2']);
  });

  test('scopes markers to their own message', () => {
    env = loadContent(fx.twoExchangePage());
    const messages = env.content.collectMessages();
    assert.deepEqual(Array.from(messages[1].markers.keys()), ['1', '2']);
    assert.deepEqual(Array.from(messages[3].markers.keys()), ['1', '2']);
    // Same local numbers, different sources - the bug that made a page-wide map wrong.
    assert.equal(env.content.citationFilename(messages[1].markers.get('1')), 'Deepest.epub');
    assert.equal(env.content.citationFilename(messages[3].markers.get('1')), 'Falling.epub');
  });
});

describe('exchange grouping', () => {
  test('pairs each question with the answers that follow it', () => {
    env = loadContent(fx.twoExchangePage());
    const exchanges = env.content.collectExchanges(env.content.collectMessages());
    assert.equal(exchanges.length, 2);
    assert.equal(exchanges[0].messages.length, 2);
    assert.equal(exchanges[0].index, 0);
    assert.equal(exchanges[1].index, 1);
  });

  test('puts content before the first question in its own exchange', () => {
    const html = '<body>' + fx.answer(fx.paragraph('Orphan answer')) +
      fx.question('Q') + fx.answer(fx.paragraph('A')) + '</body>';
    env = loadContent(html);
    const exchanges = env.content.collectExchanges(env.content.collectMessages());
    assert.equal(exchanges.length, 2);
    assert.equal(exchanges[0].question, null);
  });

  test('previews an exchange from its question text', () => {
    env = loadContent(fx.twoExchangePage());
    const exchanges = env.content.collectExchanges(env.content.collectMessages());
    assert.equal(env.content.exchangePreview(exchanges[0]), 'What does he say about nonduality?');
  });

  test('truncates a long preview', () => {
    env = loadContent('<body>' + fx.question('x'.repeat(200)) + '</body>');
    const exchanges = env.content.collectExchanges(env.content.collectMessages());
    const preview = env.content.exchangePreview(exchanges[0]);
    assert.ok(preview.length <= 91, `preview was ${preview.length} chars`);
    assert.ok(preview.endsWith('…'));
  });
});

describe('paragraph selection', () => {
  test('keeps the innermost match when selectors overlap', () => {
    // div[class*="text"] matches the wrapper, .paragraph matches its children.
    // Emitting both is what duplicated every paragraph in copied output.
    const html = '<body><div class="text-wrapper">' +
      '<div class="paragraph normal">One</div>' +
      '<div class="paragraph normal">Two</div>' +
      '</div></body>';
    env = loadContent(html);
    const found = env.content.paragraphsOf(env.document.body);
    assert.deepEqual(found.map(el => el.textContent), ['One', 'Two']);
  });

  test('keeps a wrapper that has no matching children', () => {
    env = loadContent('<body><div class="text-only">Alone</div></body>');
    const found = env.content.paragraphsOf(env.document.body);
    assert.deepEqual(found.map(el => el.textContent), ['Alone']);
  });
});
