// Renumbering citations across answers, and the sources block they resolve to.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const { loadContent } = require('./helpers/env');
const fx = require('./helpers/fixtures');

let env;
afterEach(() => { if (env) { env.restore(); env = null; } });

function citation(number, filename, snippet) {
  return { citation: String(number), original: String(number), filename, snippet: snippet || null };
}

describe('global renumbering', () => {
  test('renumbers consecutively across answers', () => {
    // NotebookLM restarts at 1 in every answer, so without this the second
    // answer's [1] collides with the first answer's [1].
    env = loadContent(fx.twoExchangePage());
    const messages = env.content.collectMessages();
    const total = env.content.assignGlobalNumbers(messages);

    assert.equal(total, 4);
    assert.deepEqual(Array.from(messages[1].numbering.entries()), [['1', '1'], ['2', '2']]);
    assert.deepEqual(Array.from(messages[3].numbering.entries()), [['1', '3'], ['2', '4']]);
  });

  test('walks local numbers in numeric, not lexical, order', () => {
    const body = fx.paragraph(fx.marker(10, 'A') + fx.marker(2, 'B') + fx.marker(1, 'C'));
    env = loadContent('<body>' + fx.answer(body) + '</body>');
    const messages = env.content.collectMessages();
    env.content.assignGlobalNumbers(messages);
    // 2 sorts before 10; a string sort would have put "10" first.
    assert.deepEqual(Array.from(messages[0].numbering.entries()),
      [['1', '1'], ['2', '2'], ['10', '3']]);
  });

  test('is stable when re-run', () => {
    env = loadContent(fx.twoExchangePage());
    const messages = env.content.collectMessages();
    env.content.assignGlobalNumbers(messages);
    const first = Array.from(messages[3].numbering.entries());
    env.content.assignGlobalNumbers(messages);
    assert.deepEqual(Array.from(messages[3].numbering.entries()), first);
  });

  test('numbers only the messages it is given', () => {
    env = loadContent(fx.twoExchangePage());
    const messages = env.content.collectMessages();
    // Exporting just the second exchange numbers its citations from 1.
    const total = env.content.assignGlobalNumbers(messages.slice(2));
    assert.equal(total, 2);
    assert.deepEqual(Array.from(messages[3].numbering.entries()), [['1', '1'], ['2', '2']]);
  });

  test('citationsOf reports both the global and original number', () => {
    env = loadContent(fx.twoExchangePage());
    const messages = env.content.collectMessages();
    env.content.assignGlobalNumbers(messages);
    const citations = env.content.citationsOf(messages[3]);
    assert.deepEqual(citations.map(c => [c.original, c.citation]), [['1', '3'], ['2', '4']]);
    assert.equal(citations[0].filename, 'Falling.epub');
  });

  test('citationsOf falls back to the aria-label when no snippet was read', () => {
    env = loadContent(fx.twoExchangePage());
    const messages = env.content.collectMessages();
    env.content.assignGlobalNumbers(messages);
    assert.equal(env.content.citationsOf(messages[1])[0].snippet, null);
    assert.equal(env.content.citationsOf(messages[1])[0].filename, 'Deepest.epub');
  });
});

describe('source identity', () => {
  test('treats the same passage of the same file as one source', () => {
    env = loadContent('<body></body>');
    const a = citation(1, 'Book.epub', 'A passage.');
    const b = citation(2, 'Book.epub', 'A  passage.');
    assert.equal(env.content.sourceKey(a), env.content.sourceKey(b));
  });

  test('treats different passages of one file as different sources', () => {
    env = loadContent('<body></body>');
    assert.notEqual(
      env.content.sourceKey(citation(1, 'Book.epub', 'First.')),
      env.content.sourceKey(citation(2, 'Book.epub', 'Second.')));
  });

  test('falls back to the filename when there is no snippet', () => {
    env = loadContent('<body></body>');
    assert.equal(
      env.content.sourceKey(citation(1, 'Book.epub')),
      env.content.sourceKey(citation(9, 'Book.epub')));
  });

  test('groups every number that cites a passage', () => {
    env = loadContent('<body></body>');
    const grouped = env.content.dedupeSources([
      citation(1, 'A.epub', 'one'),
      citation(2, 'B.epub', 'two'),
      citation(3, 'A.epub', 'one')
    ]);
    assert.equal(grouped.length, 2);
    assert.deepEqual(grouped[0].numbers, ['1', '3']);
    assert.deepEqual(grouped[1].numbers, ['2']);
  });
});

describe('sources block', () => {
  const citations = [
    citation(1, 'A.epub', 'First passage.'),
    citation(2, 'B.epub', 'Shared passage.'),
    citation(3, 'B.epub', 'Shared passage.')
  ];

  test('gives every number its own markdown definition', () => {
    // A grouped definition would leave [^3] undefined, and an editor that
    // resolves footnotes then has nothing to jump to.
    env = loadContent('<body></body>');
    const block = env.content.sourcesBlock(citations, 'footnotes', 'markdown');
    const labels = (block.match(/^\[\^(\d+)\]:/gm) || []).map(s => s.replace(/\D/g, ''));
    assert.deepEqual(labels, ['1', '2', '3']);
  });

  test('never emits a pointer to another footnote', () => {
    env = loadContent('<body></body>');
    const block = env.content.sourcesBlock(citations, 'footnotes', 'markdown');
    assert.ok(!/See \[\^/.test(block), 'stub definitions are not usable in Bear');
  });

  test('puts the snippet in a flush-left blockquote', () => {
    env = loadContent('<body></body>');
    const block = env.content.sourcesBlock(citations, 'footnotes', 'markdown');
    assert.ok(block.includes('[^1]: A.epub\n> First passage.'), block);
    assert.ok(!/^ +> /m.test(block), 'blockquote should not be indented');
  });

  test('indents a multi-line snippet on every line', () => {
    env = loadContent('<body></body>');
    const block = env.content.sourcesBlock(
      [citation(1, 'A.epub', 'Line one\nLine two')], 'footnotes', 'markdown');
    assert.equal(block, '[^1]: A.epub\n> Line one\n> Line two');
  });

  test('omits snippets for styles that do not carry them', () => {
    env = loadContent('<body></body>');
    const block = env.content.sourcesBlock(citations, 'none', 'markdown');
    assert.ok(!block.includes('>'), block);
    assert.ok(block.includes('[^1]: A.epub'));
  });

  test('groups repeated sources in the plain flavor', () => {
    // Plain text has no footnote linking to preserve, so it can compact.
    env = loadContent('<body></body>');
    const block = env.content.sourcesBlock(citations, 'footnotes', 'plain');
    assert.ok(block.includes('[2] [3] B.epub'), block);
    assert.ok(block.startsWith('--- Sources ---'));
  });

  test('orders citations numerically', () => {
    env = loadContent('<body></body>');
    const answers = [{ citations: [citation(10, 'J'), citation(2, 'B'), citation(1, 'A')] }];
    const flat = env.content.allCitations(answers);
    assert.deepEqual(flat.map(c => c.citation), ['1', '2', '10']);
  });
});

describe('document assembly', () => {
  function answers() {
    return [
      { role: 'question', text: 'First question?', citations: [] },
      { role: 'answer', text: 'First answer[^1].', citations: [citation(1, 'A.epub', 'one')] },
      { role: 'question', text: 'Second question?', citations: [] },
      { role: 'answer', text: 'Second answer[^2].', citations: [citation(2, 'A.epub', 'one')] }
    ];
  }

  test('emits one sources block at the end, not one per answer', () => {
    env = loadContent('<body></body>');
    const doc = env.content.buildDocument(answers(), 'footnotes', 'markdown',
      { exchanges: 2, citations: 2 });
    assert.equal(doc.split('## Sources').length - 1, 1);
    assert.ok(doc.indexOf('## Sources') > doc.indexOf('Second answer'));
  });

  test('labels exchanges and quotes the question', () => {
    env = loadContent('<body></body>');
    const doc = env.content.buildDocument(answers(), 'footnotes', 'markdown',
      { exchanges: 2, citations: 2 });
    assert.ok(doc.includes('## Exchange 1\n\n**Question**\n\n> First question?'), doc);
    assert.ok(doc.includes('## Exchange 2'));
  });

  test('writes a title and a summary line', () => {
    env = loadContent('<body></body>');
    const doc = env.content.buildDocument(answers(), 'footnotes', 'markdown',
      { exchanges: 2, citations: 2 });
    assert.ok(doc.startsWith('# NotebookLM Export'));
    assert.ok(/\*Exported \d{4}-\d{2}-\d{2} · 2 exchanges · 2 citations\*/.test(doc), doc);
  });

  test('skips the sources block entirely for the inline style', () => {
    env = loadContent('<body></body>');
    const doc = env.content.buildDocument(answers(), 'inline', 'markdown', {});
    assert.ok(!doc.includes('## Sources'), doc);
  });

  test('uses no markdown syntax in the plain flavor', () => {
    env = loadContent('<body></body>');
    const doc = env.content.buildDocument(answers(), 'footnotes', 'plain',
      { exchanges: 2, citations: 2 });
    assert.ok(!doc.includes('#'), doc);
    assert.ok(doc.includes('Q: First question?'));
    assert.ok(doc.includes('--- Sources ---'));
  });

  test('drops answers with no text', () => {
    env = loadContent('<body></body>');
    const doc = env.content.buildDocument(
      [{ role: 'answer', text: '', citations: [] }], 'footnotes', 'markdown', {});
    assert.ok(!doc.includes('**Answer**'), doc);
  });

  test('emphasis markers stay balanced', () => {
    env = loadContent('<body></body>');
    const doc = env.content.buildDocument(
      [{ role: 'answer', text: 'A **bold** run and *italic*.', citations: [] }],
      'footnotes', 'markdown', {});
    assert.equal((doc.match(/\*\*/g) || []).length % 2, 0);
  });
});
