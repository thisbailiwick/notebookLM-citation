// Turning page elements into Markdown: inline emphasis, block roles, and the
// citation markers spliced into the text.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const { loadContent } = require('./helpers/env');
const fx = require('./helpers/fixtures');

let env;
afterEach(() => { if (env) { env.restore(); env = null; } });

function withBody(html) {
  env = loadContent('<body>' + html + '</body>');
  return env.content;
}

describe('inline emphasis', () => {
  test('re-emits bold and italic for markdown', () => {
    const content = withBody('<p id="t">a <b>bold</b> and <i>italic</i></p>');
    const el = env.document.getElementById('t');
    assert.equal(content.inlineText(el, 'markdown'), 'a **bold** and *italic*');
  });

  test('drops emphasis for the plain flavor', () => {
    const content = withBody('<p id="t">a <b>bold</b> one</p>');
    const el = env.document.getElementById('t');
    assert.equal(content.inlineText(el, 'plain'), 'a bold one');
  });

  test('keeps surrounding spaces outside the markers', () => {
    // "** bold **" is literal text in most parsers, so the padding has to move out.
    const content = withBody('<p id="t">x<b> bold </b>y</p>');
    assert.equal(content.inlineText(env.document.getElementById('t'), 'markdown'), 'x **bold** y');
  });

  test('leaves a whitespace-only element alone', () => {
    const content = withBody('<p id="t">a<b>   </b>b</p>');
    assert.equal(content.inlineText(env.document.getElementById('t'), 'markdown'), 'a   b');
  });

  test('nests emphasis', () => {
    const content = withBody('<p id="t"><b>bold <i>and italic</i></b></p>');
    assert.equal(content.inlineText(env.document.getElementById('t'), 'markdown'), '**bold *and italic***');
  });

  test('maps strong/em/code as well', () => {
    const content = withBody('<p id="t"><strong>s</strong><em>e</em><code>c</code></p>');
    assert.equal(content.inlineText(env.document.getElementById('t'), 'markdown'), '**s***e*`c`');
  });
});

describe('block roles', () => {
  test('renders a heading at its class level, floored at h3', () => {
    const content = withBody(fx.heading(3, 'Title') + fx.heading(1, 'Shallow'));
    const els = env.document.querySelectorAll('.paragraph');
    assert.equal(content.blockFor(els[0], 'markdown').text, '### Title');
    // Page headings sit under "## Exchange N", so h1 is pushed down to h3.
    assert.equal(content.blockFor(els[1], 'markdown').text, '### Shallow');
  });

  test('caps a heading at h6', () => {
    const content = withBody('<div class="paragraph heading9">Deep</div>');
    const el = env.document.querySelector('.paragraph');
    assert.equal(content.blockFor(el, 'markdown').text, '###### Deep');
  });

  test('renders a list item as a bullet', () => {
    const content = withBody(fx.listItem('Point'));
    const el = env.document.querySelector('.list-item');
    assert.equal(content.blockFor(el, 'markdown').text, '- Point');
  });

  test('indents a nested list item', () => {
    const content = withBody('<ul><li class="paragraph list-item">Outer' +
      '<ul><li class="paragraph list-item" id="inner">Inner</li></ul></li></ul>');
    const el = env.document.getElementById('inner');
    assert.equal(content.blockFor(el, 'markdown').text, '  - Inner');
  });

  test('numbers an ordered list item', () => {
    const content = withBody('<ol><li class="paragraph list-item">Step</li></ol>');
    const el = env.document.querySelector('.list-item');
    assert.equal(content.blockFor(el, 'markdown').text, '1. Step');
  });

  test('renders a blockquote', () => {
    const content = withBody(fx.blockquote('Quoted'));
    const el = env.document.querySelector('.blockquote');
    assert.equal(content.blockFor(el, 'markdown').text, '> Quoted');
  });

  test('renders a horizontal rule per flavor', () => {
    const content = withBody('<hr>');
    const el = env.document.querySelector('hr');
    assert.equal(content.blockFor(el, 'markdown').text, '---');
    assert.equal(content.blockFor(el, 'plain').text, '─────');
  });

  test('drops an empty block', () => {
    const content = withBody('<div class="paragraph normal">   </div>');
    assert.equal(content.blockFor(env.document.querySelector('.paragraph'), 'markdown'), null);
  });

  test('ignores block roles for the plain flavor', () => {
    const content = withBody(fx.heading(3, 'Title'));
    const el = env.document.querySelector('.paragraph');
    assert.equal(content.blockFor(el, 'plain').text, 'Title');
  });
});

describe('joining blocks', () => {
  test('keeps consecutive list items tight and separates everything else', () => {
    const content = withBody('<div></div>');
    const joined = content.joinBlocks([
      { kind: 'heading', text: '### H' },
      { kind: 'list', text: '- a' },
      { kind: 'list', text: '- b' },
      { kind: 'text', text: 'After' }
    ]);
    assert.equal(joined, '### H\n\n- a\n- b\n\nAfter');
  });
});

describe('citation markers in text', () => {
  const info = { filename: 'Book.epub', snippet: 'A quoted passage.' };

  test('renders a footnote reference for markdown and a bracket for plain', () => {
    const content = withBody('<div></div>');
    assert.equal(content.renderMarker('3', info, 'footnotes', 'markdown'), '[^3]');
    assert.equal(content.renderMarker('3', info, 'footnotes', 'plain'), '[3]');
  });

  test('renders a bare reference when there is no snippet', () => {
    const content = withBody('<div></div>');
    assert.equal(content.renderMarker('3', null, 'inline', 'markdown'), '[^3]');
  });

  test('splices the whole snippet inline', () => {
    const content = withBody('<div></div>');
    assert.equal(
      content.renderMarker('3', info, 'inline', 'markdown'),
      '[3: *Book.epub* — "A quoted passage."]');
  });

  test('shortens the inline quote and keeps the reference', () => {
    const content = withBody('<div></div>');
    const long = { filename: 'Book.epub', snippet: 'x'.repeat(200) };
    const out = content.renderMarker('3', long, 'inline-short', 'markdown');
    assert.ok(out.startsWith('[^3] ("'), out);
    assert.ok(out.includes('…'), 'expected the quote to be truncated');
    assert.ok(out.length < 150, `marker was ${out.length} chars`);
  });

  test('style "none" never carries snippet text', () => {
    const content = withBody('<div></div>');
    assert.equal(content.renderMarker('3', info, 'none', 'markdown'), '[^3]');
  });
});

describe('message text', () => {
  test('replaces markers with references and keeps block structure', () => {
    const body = fx.heading(3, 'On Nonduality') +
      fx.paragraph(`It is <b>ordinary</b>${fx.marker(1, 'A.epub')}.`) +
      fx.listItem(`A point${fx.marker(2, 'B.epub')}`);
    const content = withBody(fx.answer(body));
    const message = content.collectMessages()[0];
    message.numbering = new Map([['1', '1'], ['2', '2']]);
    assert.equal(
      content.messageText(message, 'footnotes', 'markdown'),
      '### On Nonduality\n\nIt is **ordinary**[^1].\n\n- A point[^2]');
  });

  test('applies the renumbering when writing markers out', () => {
    const content = withBody(fx.answer(fx.paragraph(`Text${fx.marker(1, 'A.epub')}`)));
    const message = content.collectMessages()[0];
    message.numbering = new Map([['1', '42']]);
    assert.equal(content.messageText(message, 'footnotes', 'markdown'), 'Text[^42]');
  });

  test('strips page furniture', () => {
    // mat-icon ligatures ("thumb_up") used to land mid-sentence, and the
    // collapsed Thoughts block used to be copied wholesale.
    const body = fx.paragraph('Real text') +
      '<thinking-chain-view>Internal reasoning</thinking-chain-view>' +
      '<mat-card-actions><button><mat-icon>thumb_up</mat-icon></button></mat-card-actions>';
    const content = withBody(fx.answer(body));
    const out = content.messageText(content.collectMessages()[0], 'none', 'markdown');
    assert.equal(out, 'Real text');
  });

  test('does not duplicate a paragraph inside a matching wrapper', () => {
    const body = '<div class="response-text">' + fx.paragraph('Only once') + '</div>';
    const content = withBody(fx.answer(body));
    const out = content.messageText(content.collectMessages()[0], 'none', 'markdown');
    assert.equal(out, 'Only once');
  });

  test('falls back to textContent when nothing matches a paragraph selector', () => {
    const content = withBody('<chat-message><span>Bare text</span></chat-message>');
    const out = content.messageText(content.collectMessages()[0], 'none', 'markdown');
    assert.equal(out, 'Bare text');
  });
});
