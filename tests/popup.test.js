// Popup helpers: the rich-text document, and the grouping the citation list
// and history are built from.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadPopup } = require('./helpers/env');

const popup = loadPopup();

function citation(number, filename, snippet) {
  return { citation: String(number), filename, snippet: snippet || null };
}

describe('escaping', () => {
  test('neutralises markup', () => {
    assert.equal(popup.escapeHTML('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
  });

  test('escapes the ampersand first, so entities are not double-decoded', () => {
    assert.equal(popup.escapeHTML('&lt;'), '&amp;lt;');
  });
});

describe('source grouping', () => {
  test('mirrors the content script: same file and passage is one source', () => {
    assert.equal(
      popup.sourceKey(citation(1, 'A.epub', 'passage')),
      popup.sourceKey(citation(2, 'A.epub', 'passage')));
  });

  test('collects every number that cites a passage', () => {
    const grouped = popup.dedupeSources([
      { citations: [citation(1, 'A.epub', 'one'), citation(2, 'B.epub', 'two')] },
      { citations: [citation(3, 'A.epub', 'one')] }
    ]);
    assert.equal(grouped.length, 2);
    assert.deepEqual(grouped[0].numbers, ['1', '3']);
  });

  test('copes with answers carrying no citations', () => {
    assert.deepEqual(popup.dedupeSources([{ role: 'question' }]), []);
    assert.deepEqual(popup.dedupeSources(null), []);
  });
});

describe('rich text', () => {
  function response(style) {
    return {
      style: style,
      answers: [
        { role: 'question', plain: 'A question?', citations: [] },
        {
          role: 'answer',
          plain: 'An answer [1] and another [2].',
          citations: [citation(1, 'A.epub', 'one'), citation(2, 'A.epub', 'one')]
        }
      ]
    };
  }

  test('emits one sources list at the end', () => {
    const html = popup.generateRichHTML(response('footnotes'));
    assert.equal(html.split('Sources:').length - 1, 1);
    assert.ok(html.indexOf('Sources:') > html.indexOf('An answer'));
  });

  test('groups repeated sources under all their numbers', () => {
    const html = popup.generateRichHTML(response('footnotes'));
    assert.ok(html.includes('[1] [2]</strong> A.epub'), html);
  });

  test('uses the plain flavor so asterisks do not leak through', () => {
    const html = popup.generateRichHTML({
      style: 'none',
      answers: [{ role: 'answer', plain: 'plain text', text: '**markdown**', citations: [] }]
    });
    assert.ok(html.includes('plain text'));
    assert.ok(!html.includes('**'), html);
  });

  test('escapes a filename that looks like markup', () => {
    const html = popup.generateRichHTML({
      style: 'footnotes',
      answers: [{ role: 'answer', plain: 'x', citations: [citation(1, '<img src=x>.pdf', 's')] }]
    });
    assert.ok(!html.includes('<img'), html);
    assert.ok(html.includes('&lt;img'));
  });

  test('escapes snippet text too', () => {
    const html = popup.generateRichHTML({
      style: 'footnotes',
      answers: [{ role: 'answer', plain: 'x', citations: [citation(1, 'A.epub', '<script>')] }]
    });
    assert.ok(!html.includes('<script>'), html);
  });

  test('omits the sources list for the inline style', () => {
    assert.ok(!popup.generateRichHTML(response('inline')).includes('Sources:'));
  });

  test('omits snippets for a style that does not carry them', () => {
    const html = popup.generateRichHTML(response('none'));
    assert.ok(html.includes('A.epub'));
    assert.ok(!html.includes('font-style: italic'), html);
  });

  test('marks up questions and answers differently', () => {
    const html = popup.generateRichHTML(response('none'));
    assert.ok(html.includes('font-weight: bold; margin: 16px 0 8px;'));
  });

  test('produces a document even with no answers', () => {
    const html = popup.generateRichHTML({ answers: [] });
    assert.ok(html.startsWith('<div'));
    assert.ok(html.endsWith('</div>'));
  });
});

describe('flattening for history and statistics', () => {
  test('collects citations from every answer', () => {
    const flat = popup.flattenCitations({
      answers: [{ citations: [citation(1, 'A')] }, { citations: [citation(2, 'B')] }]
    }, []);
    assert.equal(flat.length, 2);
  });

  test('falls back to the page mappings when an export carried none', () => {
    const fallback = [citation(9, 'Z')];
    assert.deepEqual(popup.flattenCitations({ answers: [] }, fallback), fallback);
    assert.deepEqual(popup.flattenCitations(null, fallback), fallback);
  });

  test('returns an empty list when there is no fallback either', () => {
    assert.deepEqual(popup.flattenCitations({ answers: [] }), []);
  });
});

describe('grouping the citation list by answer', () => {
  test('keeps each answer separate', () => {
    const grouped = popup.groupByAnswer([
      { citation: '1', filename: 'A', answer: 1 },
      { citation: '1', filename: 'B', answer: 2 },
      { citation: '2', filename: 'C', answer: 1 }
    ]);
    assert.deepEqual(Array.from(grouped.keys()), [1, 2]);
    assert.equal(grouped.get(1).length, 2);
  });

  test('treats a mapping with no answer as the first one', () => {
    const grouped = popup.groupByAnswer([{ citation: '1', filename: 'A' }]);
    assert.deepEqual(Array.from(grouped.keys()), [1]);
  });
});

describe('host list', () => {
  test('covers both the new and old NotebookLM addresses', () => {
    assert.ok(popup.NOTEBOOKLM_HOSTS.includes('notebook.google.com'));
    assert.ok(popup.NOTEBOOKLM_HOSTS.includes('notebooklm.google.com'));
  });
});
