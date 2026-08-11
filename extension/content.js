// NotebookLM Citation Source Mapper Content Script (v4)

(function () {
  // A notebook page is a list of chat-message elements, alternating questions
  // (.from-user-container) and answers (.to-user-container). Citation numbering
  // restarts at 1 inside every answer, so a page-wide number -> source map
  // collides across answers. Everything below is scoped per message.
  const MESSAGE_SELECTOR = 'chat-message';
  const MESSAGE_FALLBACK = '.message-text-content';
  const MARKER_SELECTOR = 'button.citation-marker, .citation-marker';
  const PARAGRAPH_SELECTOR = '.paragraph.normal, .paragraph, div[class*="text"], p, hr';

  // Hovering a citation marker renders its source snippet into the shared CDK
  // overlay. Nothing is fetched - the text is already client side - so this is
  // the only way to read it without reverse engineering Angular's internals.
  const OVERLAY_ROOT = '.cdk-overlay-container';
  const TOOLTIP = '.citation-tooltip';
  const TOOLTIP_HEADER = '.citation-tooltip-header';
  const TOOLTIP_TEXT = '.citation-tooltip-text';

  // Page furniture that should never reach an export. thinking-chain-view is
  // the collapsed "Thoughts" block, mat-card-actions the per-message buttons,
  // and mat-icon holds ligature text ("more_horiz", "thumb_up") that otherwise
  // lands mid-sentence.
  const NOISE_SELECTOR = [
    'script', 'style', 'thinking-chain-view', 'mat-card-actions', 'mat-icon',
    'button:not(.citation-marker)', '[class*="input"]', '[class*="footer"]',
    '[class*="toolbar"]'
  ].join(', ');

  const APPEAR_MS = 1500;
  const DISMISS_MS = 1200;
  const POLL_MS = 15;
  const INLINE_SNIPPET_CHARS = 120;
  const EXPAND_MS = 2000;
  const MAX_EXPAND_PASSES = 10;

  let isMapping = false;
  let currentMappings = [];

  // ---------------------------------------------------------------- messages

  function messageElements() {
    let list = Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
    if (!list.length) list = Array.from(document.querySelectorAll(MESSAGE_FALLBACK));
    return list.filter(el => el.textContent.trim().length > 0);
  }

  function roleOf(el) {
    if (el.querySelector('.from-user-container')) return 'question';
    if (el.querySelector('.to-user-container')) return 'answer';
    return 'message';
  }

  function citationNumber(marker) {
    const text = marker.querySelector('span') &&
      marker.querySelector('span').textContent.trim();
    return /^\d+$/.test(text) ? text : null;
  }

  // Each marker's span carries aria-label="N: filename", so the source name is
  // available without hovering. Only the snippet body needs the overlay.
  function citationFilename(marker) {
    const span = marker.querySelector('span[aria-label]');
    const label = span && span.getAttribute('aria-label');
    const match = label && label.match(/^(\d+):\s*(.+)$/);
    return match ? match[2].trim() : null;
  }

  // First marker for each citation number, in document order. One hover per
  // entry is enough - repeats of the same number in a message share a source.
  function markersByNumber(messageEl) {
    const byNumber = new Map();
    messageEl.querySelectorAll(MARKER_SELECTOR).forEach(marker => {
      const number = citationNumber(marker);
      if (number && !byNumber.has(number)) byNumber.set(number, marker);
    });
    return byNumber;
  }

  function collectMessages() {
    return messageElements().map(el => ({
      element: el,
      role: roleOf(el),
      markers: markersByNumber(el),
      snippets: new Map(),
      numbering: new Map()
    }));
  }

  // Group into question/answer exchanges so whole exchanges can be selected.
  // Anything before the first question becomes exchange 0.
  function collectExchanges(messages) {
    const exchanges = [];
    messages.forEach(message => {
      if (message.role === 'question' || !exchanges.length) {
        exchanges.push({ index: exchanges.length, question: null, messages: [] });
      }
      const current = exchanges[exchanges.length - 1];
      if (message.role === 'question' && !current.question) current.question = message;
      current.messages.push(message);
    });
    return exchanges;
  }

  function exchangePreview(exchange) {
    const source = exchange.question || exchange.messages[0];
    if (!source) return 'Untitled';
    const text = source.element.textContent.replace(/\s+/g, ' ').trim();
    return truncate(text, 90) || 'Untitled';
  }

  // -------------------------------------------------------------- expanding

  // Citation lists longer than a few entries collapse behind a "more_horiz"
  // icon button. It used to be a "..." text span, which is what the old
  // auto-expand looked for - hence the citations missing from exports.
  function expanderButtons(root) {
    return Array.from(root.querySelectorAll(MARKER_SELECTOR)).filter(button => {
      const icon = button.querySelector('mat-icon');
      return icon && icon.textContent.trim() === 'more_horiz';
    });
  }

  async function expandCitationLists(root) {
    let clicked = 0;
    for (let pass = 0; pass < MAX_EXPAND_PASSES; pass++) {
      const buttons = expanderButtons(root);
      if (!buttons.length) break;
      const before = root.querySelectorAll(MARKER_SELECTOR).length;
      buttons.forEach(button => button.click());
      clicked += buttons.length;
      // Expanding one list can reveal another, so loop until nothing grows.
      const grew = await waitUntil(
        () => root.querySelectorAll(MARKER_SELECTOR).length !== before, EXPAND_MS);
      if (!grew) break;
    }
    return clicked;
  }

  function loadSettings() {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.get(['settings'], result => {
          resolve((result && result.settings) || {});
        });
      } catch (e) {
        resolve({});
      }
    });
  }

  // ---------------------------------------------------------------- tooltips

  function fire(el, type, Ctor) {
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, view: window }));
  }

  function hoverOn(el) {
    fire(el, 'pointerenter', PointerEvent);
    fire(el, 'mouseenter', MouseEvent);
    fire(el, 'mouseover', MouseEvent);
  }

  function hoverOff(el) {
    fire(el, 'pointerleave', PointerEvent);
    fire(el, 'mouseleave', MouseEvent);
    fire(el, 'mouseout', MouseEvent);
  }

  function tooltipSnapshot() {
    const root = document.querySelector(OVERLAY_ROOT);
    const tip = root && root.querySelector(TOOLTIP);
    if (!tip) return null;
    const header = tip.querySelector(TOOLTIP_HEADER);
    const body = tip.querySelector(TOOLTIP_TEXT);
    const snippet = body ? body.textContent.trim() : '';
    if (!snippet) return null;
    return { filename: header ? header.textContent.trim() : null, snippet: snippet };
  }

  function waitUntil(test, timeout) {
    return new Promise(resolve => {
      const started = Date.now();
      (function poll() {
        if (test()) return resolve(true);
        if (Date.now() - started >= timeout) return resolve(false);
        setTimeout(poll, POLL_MS);
      })();
    });
  }

  // The overlay is reused between markers, so waiting for the snippet text to
  // turn over is much faster than waiting for the previous tooltip to close
  // (~65ms vs ~340ms). When the text does not change we cannot tell "this
  // citation repeats the previous snippet" from "the tooltip never opened", so
  // fall back to a full dismiss-and-retry and let that answer it.
  async function readSnippet(marker, previousSnippet) {
    hoverOn(marker);
    const turnedOver = await waitUntil(() => {
      const snap = tooltipSnapshot();
      return !!snap && snap.snippet !== previousSnippet;
    }, APPEAR_MS);

    if (turnedOver) {
      const snap = tooltipSnapshot();
      hoverOff(marker);
      return snap;
    }

    hoverOff(marker);
    await waitUntil(() => !tooltipSnapshot(), DISMISS_MS);
    hoverOn(marker);
    const opened = await waitUntil(() => !!tooltipSnapshot(), APPEAR_MS);
    const snap = opened ? tooltipSnapshot() : null;
    hoverOff(marker);
    return snap;
  }

  function reportProgress(done, total) {
    try {
      chrome.runtime.sendMessage(
        { action: 'harvestProgress', done: done, total: total },
        () => void chrome.runtime.lastError
      );
    } catch (e) {
      // Popup closed mid-harvest; nothing to report to.
    }
  }

  async function harvestSnippets(messages) {
    const total = messages.reduce((sum, m) => sum + m.markers.size, 0);
    let done = 0;
    let missing = 0;
    let previousSnippet = null;

    reportProgress(0, total);
    for (const message of messages) {
      for (const [number, marker] of message.markers) {
        const snap = await readSnippet(marker, previousSnippet);
        if (snap) {
          message.snippets.set(number, snap);
          previousSnippet = snap.snippet;
        } else {
          missing++;
        }
        reportProgress(++done, total);
      }
    }
    // Never leave a tooltip pinned open over the page.
    await waitUntil(() => !tooltipSnapshot(), DISMISS_MS);
    return { total: total, missing: missing };
  }

  // ------------------------------------------------------------- extraction

  // The selectors overlap: div[class*="text"] also matches the wrappers that
  // hold .paragraph elements, so a naive pass emits every paragraph twice.
  // Keep the innermost matches only - taking the wrapper instead would dedupe
  // just as well but concatenate its children's textContent, running headings
  // into the paragraph that follows them.
  function paragraphsOf(root) {
    const matches = Array.from(root.querySelectorAll(PARAGRAPH_SELECTOR));
    return matches.filter(el => !matches.some(other => other !== el && el.contains(other)));
  }

  function truncate(text, limit) {
    return text.length <= limit ? text : text.slice(0, limit).trimEnd() + '…';
  }

  // Markdown uses real footnote references ([^3]) so the marker links to its
  // definition. The inline style carries the whole snippet in the body and has
  // no definition to point at, so it stays a plain bracket.
  function renderMarker(number, info, style, flavor) {
    const markdown = flavor === 'markdown';
    const ref = markdown ? `[^${number}]` : `[${number}]`;

    if (!info || style === 'none' || style === 'footnotes') return ref;

    if (style === 'inline') {
      const name = markdown ? `*${info.filename}*` : info.filename;
      return `[${number}: ${name} — "${info.snippet}"]`;
    }
    if (style === 'inline-short') {
      const quote = truncate(info.snippet, INLINE_SNIPPET_CHARS);
      return markdown ? `${ref} ("${quote}")` : `[${number}: "${quote}"]`;
    }
    return ref;
  }

  // Inline formatting the page carries as real elements: <b>/<i> inside answer
  // paragraphs. Emphasis is only re-emitted for the markdown flavor.
  const EMPHASIS = { B: '**', STRONG: '**', I: '*', EM: '*', CODE: '`' };

  function inlineText(node, flavor) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return '';
    let inner = '';
    node.childNodes.forEach(child => { inner += inlineText(child, flavor); });
    if (flavor !== 'markdown') return inner;
    const wrap = EMPHASIS[node.tagName];
    if (!wrap || !inner.trim()) return inner;
    // Keep the surrounding spaces outside the markers, or the emphasis does
    // not render ("** bold **" is literal text in most parsers).
    const lead = inner.match(/^\s*/)[0];
    const tail = inner.match(/\s*$/)[0];
    return lead + wrap + inner.trim() + wrap + tail;
  }

  function listDepth(el) {
    let depth = 0;
    let node = el.parentElement;
    while (node) {
      if (node.tagName === 'UL' || node.tagName === 'OL') depth++;
      node = node.parentElement;
    }
    return depth;
  }

  // One page block -> one markdown block. Paragraph roles are carried in the
  // class list (heading3, list-item, blockquote), not in the tag name.
  function blockFor(el, flavor) {
    if (el.tagName === 'HR') return { kind: 'rule', text: flavor === 'markdown' ? '---' : '─────' };

    const text = inlineText(el, flavor).replace(/[ \t]+/g, ' ').trim();
    if (!text) return null;
    if (flavor !== 'markdown') return { kind: 'text', text: text };

    const cls = el.getAttribute('class') || '';
    const heading = /heading(\d)/.exec(cls);
    if (heading) {
      // Page headings sit under the "## Exchange N" level, so never shallower
      // than h3.
      const level = Math.min(6, Math.max(3, parseInt(heading[1], 10)));
      return { kind: 'heading', text: '#'.repeat(level) + ' ' + text };
    }
    if (/\blist-item\b/.test(cls)) {
      const indent = '  '.repeat(Math.max(0, listDepth(el) - 1));
      const bullet = el.closest('ol') ? '1. ' : '- ';
      return { kind: 'list', text: indent + bullet + text };
    }
    if (/\bblockquote\b/.test(cls)) return { kind: 'quote', text: '> ' + text };
    return { kind: 'text', text: text };
  }

  function joinBlocks(blocks) {
    let out = '';
    blocks.forEach((block, i) => {
      if (i > 0) {
        const previous = blocks[i - 1];
        // Consecutive list items belong to one list, so keep them tight.
        const tight = block.kind === 'list' && previous.kind === 'list';
        out += tight ? '\n' : '\n\n';
      }
      out += block.text;
    });
    return out.trim();
  }

  function messageText(message, style, flavor) {
    const clone = message.element.cloneNode(true);
    clone.querySelectorAll(NOISE_SELECTOR).forEach(el => el.remove());

    clone.querySelectorAll(MARKER_SELECTOR).forEach(marker => {
      const number = citationNumber(marker);
      if (!number) return;
      const info = message.snippets.get(number) || null;
      const display = message.numbering.get(number) || number;
      marker.replaceWith(document.createTextNode(renderMarker(display, info, style, flavor)));
    });

    const paragraphs = paragraphsOf(clone);
    if (!paragraphs.length) {
      return clone.textContent.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }
    const blocks = paragraphs.map(p => blockFor(p, flavor)).filter(Boolean);
    return joinBlocks(blocks)
      .replace(/ +\[/g, ' [')
      .replace(/\] +/g, '] ');
  }

  function localNumbers(message) {
    return Array.from(message.markers.keys())
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }

  // Citation numbers restart at 1 in every answer. Since the export puts every
  // answer in one document, renumber them consecutively across the selection so
  // footnote references stay unique.
  function assignGlobalNumbers(messages) {
    let next = 0;
    messages.forEach(message => {
      message.numbering = new Map();
      localNumbers(message).forEach(local => {
        message.numbering.set(local, String(++next));
      });
    });
    return next;
  }

  function citationsOf(message) {
    return localNumbers(message).map(number => {
      const snap = message.snippets.get(number);
      return {
        citation: message.numbering.get(number) || number,
        original: number,
        filename: (snap && snap.filename) ||
          citationFilename(message.markers.get(number)) || '(unknown source)',
        snippet: snap ? snap.snippet : null
      };
    });
  }

  // ---------------------------------------------------------------- styles

  const needsSnippets = style => style !== 'none';
  const needsFootnotes = style => style !== 'inline';
  const footnoteHasSnippet = style => style === 'footnotes' || style === 'inline-short';

  function indentLines(text, prefix) {
    return text.split('\n').map(line => prefix + line).join('\n');
  }

  function footnoteBlock(citations, style, flavor) {
    if (flavor !== 'markdown') {
      const lines = ['--- Sources ---'];
      citations.forEach(c => {
        lines.push(`[${c.citation}] ${c.filename}`);
        if (footnoteHasSnippet(style) && c.snippet) {
          lines.push(indentLines(`"${c.snippet}"`, '    '));
        }
      });
      return lines.join('\n');
    }

    // Real markdown footnote definitions, so [^3] in the body resolves here.
    // Continuation lines are indented four spaces to stay inside the note.
    const lines = [];
    citations.forEach(c => {
      lines.push(`[^${c.citation}]: ${c.filename}`);
      if (footnoteHasSnippet(style) && c.snippet) {
        lines.push(indentLines(c.snippet, '    > '));
      }
    });
    return lines.join('\n');
  }

  function buildDocument(answers, style, flavor, meta) {
    const parts = [];
    let exchange = 0;

    if (flavor === 'markdown') {
      parts.push('# NotebookLM Export');
      const bits = [`Exported ${new Date().toISOString().slice(0, 10)}`];
      if (meta.exchanges) bits.push(`${meta.exchanges} exchange${meta.exchanges > 1 ? 's' : ''}`);
      if (meta.citations) bits.push(`${meta.citations} citation${meta.citations > 1 ? 's' : ''}`);
      parts.push(`*${bits.join(' · ')}*`);
    }

    answers.forEach(answer => {
      if (!answer.text) return;

      if (flavor !== 'markdown') {
        parts.push(answer.role === 'question' ? `Q: ${answer.text}` : answer.text);
      } else if (answer.role === 'question') {
        parts.push('---');
        parts.push(`## Exchange ${++exchange}`);
        parts.push('**Question**');
        parts.push(indentLines(answer.text, '> '));
      } else {
        parts.push('**Answer**');
        parts.push(answer.text);
      }

      if (needsFootnotes(style) && answer.citations.length) {
        parts.push(footnoteBlock(answer.citations, style, flavor));
      }
    });

    return parts.join('\n\n');
  }

  // ---------------------------------------------------------------- actions

  async function mapCitations() {
    if (isMapping) return currentMappings;
    isMapping = true;
    try {
      const mappings = [];
      collectMessages().forEach((message, index) => {
        message.markers.forEach((marker, number) => {
          mappings.push({
            citation: number,
            filename: citationFilename(marker) || '(unknown source)',
            answer: index + 1
          });
        });
      });
      currentMappings = mappings;
      return mappings;
    } finally {
      isMapping = false;
    }
  }

  async function buildExport(style, selection) {
    const chosen = ['none', 'footnotes', 'inline', 'inline-short'].includes(style)
      ? style : 'none';

    // Expand before collecting: revealing a collapsed list adds markers, and
    // anything still hidden would silently drop out of the export.
    const settings = await loadSettings();
    if (settings.autoExpand !== false) await expandCitationLists(document);

    const exchanges = collectExchanges(collectMessages());
    const wanted = Array.isArray(selection) && selection.length
      ? exchanges.filter(ex => selection.indexOf(ex.index) !== -1)
      : exchanges;
    const messages = wanted.reduce((all, ex) => all.concat(ex.messages), []);
    if (!messages.length) return null;

    assignGlobalNumbers(messages);

    let harvest = { total: 0, missing: 0 };
    if (needsSnippets(chosen)) harvest = await harvestSnippets(messages);

    // Both flavors are built from one harvest: markdown for copy/export, plain
    // for the PDF, where markdown syntax would just be literal noise.
    const answers = messages
      .map(message => ({
        role: message.role,
        text: messageText(message, chosen, 'markdown'),
        plain: messageText(message, chosen, 'plain'),
        citations: citationsOf(message)
      }))
      .filter(answer => answer.text);

    const meta = {
      exchanges: answers.filter(a => a.role === 'question').length,
      citations: answers.reduce((sum, a) => sum + a.citations.length, 0)
    };
    const plainAnswers = answers.map(a => ({
      role: a.role, text: a.plain, citations: a.citations
    }));

    return {
      chatText: buildDocument(answers, chosen, 'markdown', meta),
      plainText: buildDocument(plainAnswers, chosen, 'plain', meta),
      answers: answers,
      style: chosen,
      stats: {
        messages: answers.length,
        citations: harvest.total,
        missing: harvest.missing
      }
    };
  }

  function observeCitations() {
    const observer = new MutationObserver(mutations => {
      const shouldRun = mutations.some(m =>
        Array.from(m.addedNodes).some(n => n.nodeType === 1));
      if (!shouldRun) return;
      if (window.__notebooklmCitationLegendTimeout) {
        clearTimeout(window.__notebooklmCitationLegendTimeout);
      }
      window.__notebooklmCitationLegendTimeout = setTimeout(() => {
        if (!isMapping) mapCitations();
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getMappings') {
      sendResponse({ mappings: currentMappings });
    } else if (request.action === 'rescan' || request.action === 'showMappings') {
      loadSettings()
        .then(settings =>
          settings.autoExpand !== false ? expandCitationLists(document) : null)
        .then(() => mapCitations())
        .then(mappings => sendResponse({ mappings: mappings }));
      return true;
    } else if (request.action === 'getChatText') {
      buildExport(request.style, request.selection)
        .then(result => sendResponse(result || { chatText: null }))
        .catch(err => sendResponse({ chatText: null, error: err.message }));
      return true;
    } else if (request.action === 'getOutline') {
      const exchanges = collectExchanges(collectMessages());
      sendResponse({
        exchanges: exchanges.map(ex => ({
          index: ex.index,
          preview: exchangePreview(ex),
          citations: ex.messages.reduce((sum, m) => sum + m.markers.size, 0)
        }))
      });
    }
  });

  setTimeout(mapCitations, 2000);
  observeCitations();
})();
