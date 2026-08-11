// Expanding collapsed citation lists. The control is a citation-marker holding
// a "more_horiz" ligature; the old code looked for a "..." text span, never
// matched, and those citations were dropped from exports without a word.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const { loadContent } = require('./helpers/env');
const fx = require('./helpers/fixtures');

let env;
afterEach(() => { if (env) { env.restore(); env = null; } });

// Wires a "more" button that reveals hidden markers when clicked, the way the
// page does.
function makeExpandable(document, container, hidden) {
  const button = container.querySelector('.citation-marker mat-icon').parentElement;
  button.addEventListener('click', () => {
    button.remove();
    container.insertAdjacentHTML('beforeend', hidden);
  });
  return button;
}

describe('finding the control', () => {
  test('matches a marker holding the more_horiz ligature', () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.expander())) + '</body>');
    assert.equal(env.content.expanderButtons(env.document).length, 1);
  });

  test('ignores ordinary citation markers', () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(1, 'A.epub'))) + '</body>');
    assert.equal(env.content.expanderButtons(env.document).length, 0);
  });

  test('ignores a different icon', () => {
    const html = '<button class="citation-marker"><mat-icon>thumb_up</mat-icon></button>';
    env = loadContent('<body>' + fx.answer(fx.paragraph(html)) + '</body>');
    assert.equal(env.content.expanderButtons(env.document).length, 0);
  });
});

describe('expanding', () => {
  test('clicks the control and picks up the revealed citations', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(1, 'A.epub') + fx.expander())) + '</body>');
    const container = env.document.querySelector('.paragraph');
    makeExpandable(env.document, container, fx.marker(2, 'B.epub') + fx.marker(3, 'C.epub'));

    const clicked = await env.content.expandCitationLists(env.document);

    assert.equal(clicked, 1);
    const message = env.document.querySelector('chat-message');
    assert.deepEqual(Array.from(env.content.markersByNumber(message).keys()), ['1', '2', '3']);
  });

  test('keeps going when one expansion reveals another', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.expander())) + '</body>');
    const container = env.document.querySelector('.paragraph');
    makeExpandable(env.document, container, fx.marker(1, 'A.epub') + fx.expander());
    // The second control appears only after the first click, so it has to be
    // wired when it shows up.
    const observer = new env.window.MutationObserver(() => {
      const icon = container.querySelector('.citation-marker mat-icon');
      if (icon && !icon.parentElement.dataset.wired) {
        icon.parentElement.dataset.wired = '1';
        makeExpandable(env.document, container, fx.marker(2, 'B.epub'));
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    const clicked = await env.content.expandCitationLists(env.document);
    observer.disconnect();

    assert.ok(clicked >= 2, `expected at least 2 clicks, got ${clicked}`);
    assert.equal(env.document.querySelectorAll('.citation-marker mat-icon').length, 0);
  });

  test('does nothing when there is nothing collapsed', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(1, 'A.epub'))) + '</body>');
    assert.equal(await env.content.expandCitationLists(env.document), 0);
  });

  test('gives up rather than looping when a click reveals nothing', async () => {
    // A dead control would otherwise be clicked forever.
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.expander())) + '</body>');
    const clicked = await env.content.expandCitationLists(env.document);
    assert.equal(clicked, 1);
  });
});

describe('the auto-expand setting', () => {
  test('expands on the page when enabled', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.expander())) + '</body>',
      { settings: { autoExpand: true } });
    const container = env.document.querySelector('.paragraph');
    makeExpandable(env.document, container, fx.marker(1, 'A.epub'));

    assert.equal(await env.content.autoExpandMessages(), 1);
    assert.equal(env.document.querySelectorAll('.citation-marker mat-icon').length, 0);
  });

  test('does nothing when switched off', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.expander())) + '</body>',
      { settings: { autoExpand: false } });
    assert.equal(await env.content.autoExpandMessages(), 0);
    assert.equal(env.document.querySelectorAll('.citation-marker mat-icon').length, 1);
  });

  test('defaults to expanding when the setting is absent', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.expander())) + '</body>',
      { settings: {} });
    const container = env.document.querySelector('.paragraph');
    makeExpandable(env.document, container, fx.marker(1, 'A.epub'));
    assert.equal(await env.content.autoExpandMessages(), 1);
  });

  test('leaves a list the reader collapsed by hand alone', async () => {
    // The observer re-runs on every mutation. Acting on anything but growth
    // would re-expand a list the moment the reader closed it.
    env = loadContent('<body>' + fx.answer(fx.paragraph(
      fx.marker(1, 'A.epub') + fx.marker(2, 'B.epub') + fx.expander())) + '</body>',
      { settings: { autoExpand: true } });
    const container = env.document.querySelector('.paragraph');
    makeExpandable(env.document, container, fx.marker(3, 'C.epub'));

    await env.content.autoExpandMessages();
    assert.equal(env.document.querySelectorAll('.citation-marker').length, 3);

    // Reader collapses it again: fewer markers, plus a fresh control.
    container.innerHTML = fx.marker(1, 'A.epub') + fx.expander();
    assert.equal(await env.content.autoExpandMessages(), 0);
    assert.equal(env.document.querySelectorAll('.citation-marker mat-icon').length, 1);
  });

  test('acts again when a message gains citations', async () => {
    env = loadContent('<body>' + fx.answer(fx.paragraph(fx.marker(1, 'A.epub'))) + '</body>',
      { settings: { autoExpand: true } });
    assert.equal(await env.content.autoExpandMessages(), 0);

    // A new answer streams in with a collapsed list.
    const container = env.document.querySelector('.paragraph');
    container.insertAdjacentHTML('beforeend', fx.marker(2, 'B.epub') + fx.expander());
    makeExpandable(env.document, container, fx.marker(3, 'C.epub'));

    assert.equal(await env.content.autoExpandMessages(), 1);
  });
});
