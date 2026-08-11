// Builders for the NotebookLM DOM shapes content.js relies on.
//
// These mirror the real page as observed on notebook.google.com: chat-message
// wrappers carrying .from-user-container / .to-user-container, citation markers
// whose span holds both the number and an aria-label of "N: filename", and
// paragraph roles carried in the class list rather than the tag name.

function marker(number, filename) {
  return `<button class="citation-marker">` +
    `<span aria-label="${number}: ${filename}">${number}</span>` +
    `</button>`;
}

// The collapsed-list control is a citation-marker holding a "more_horiz"
// ligature instead of a number.
function expander() {
  return `<button class="citation-marker"><mat-icon>more_horiz</mat-icon></button>`;
}

function question(text) {
  return `<chat-message><div class="from-user-container">` +
    `<div class="paragraph normal">${text}</div>` +
    `</div></chat-message>`;
}

// `body` is raw HTML so a test can drop in headings, lists and markers.
function answer(body) {
  return `<chat-message><div class="to-user-container">${body}</div></chat-message>`;
}

function paragraph(html) {
  return `<div class="paragraph normal">${html}</div>`;
}

function heading(level, text) {
  return `<div class="paragraph heading${level}">${text}</div>`;
}

function listItem(text) {
  return `<ul><li class="paragraph list-item">${text}</li></ul>`;
}

function blockquote(text) {
  return `<div class="paragraph blockquote">${text}</div>`;
}

// The shared CDK overlay a hovered marker renders its tooltip into.
function overlay(filename, snippet) {
  if (!filename && !snippet) return `<div class="cdk-overlay-container"></div>`;
  return `<div class="cdk-overlay-container"><div class="citation-tooltip">` +
    `<div class="citation-tooltip-header">${filename}</div>` +
    `<div class="citation-tooltip-text">${snippet}</div>` +
    `</div></div>`;
}

// A two-exchange page: 2 citations in the first answer, 2 in the second, with
// numbering restarting at 1 the way NotebookLM does it.
function twoExchangePage() {
  return '<body>' +
    question('What does he say about nonduality?') +
    answer(
      heading(3, 'On Nonduality') +
      paragraph(`He calls it ordinary${marker(1, 'Deepest.epub')} and ` +
        `ever-present${marker(2, 'Falling.epub')}.`)
    ) +
    question('And the ocean metaphor?') +
    answer(
      paragraph(`Waves are not separate from the ocean${marker(1, 'Falling.epub')}.`) +
      listItem(`A wave cannot drown${marker(2, 'Deepest.epub')}`)
    ) +
    overlay() +
    '</body>';
}

module.exports = {
  marker, expander, question, answer, paragraph, heading, listItem,
  blockquote, overlay, twoExchangePage
};
