// NotebookLM Citation Source Mapper Content Script (v4)

(function () {
  // A notebook page is a list of chat-message elements, alternating questions
  // (.from-user-container) and answers (.to-user-container). Citation numbering
  // restarts at 1 inside every answer, so a page-wide number -> source map
  // collides across answers. Everything below is scoped per message.
  const MESSAGE_SELECTOR = 'chat-message';
  const MESSAGE_FALLBACK = '.message-text-content';
  const MARKER_SELECTOR = 'button.citation-marker, .citation-marker';
  const PARAGRAPH_SELECTOR = '.paragraph.normal, .paragraph, div[class*="text"], p';

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
      snippets: new Map()
    }));
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

  function renderMarker(number, info, style) {
    if (!info || style === 'none' || style === 'footnotes') return `[${number}]`;
    if (style === 'inline') return `[${number}: ${info.filename} — "${info.snippet}"]`;
    if (style === 'inline-short') {
      return `[${number}: "${truncate(info.snippet, INLINE_SNIPPET_CHARS)}"]`;
    }
    return `[${number}]`;
  }

  function tidy(text) {
    return text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+\[/g, ' [')
      .replace(/\]\s+/g, '] ')
      .trim();
  }

  function messageText(message, style) {
    const clone = message.element.cloneNode(true);
    clone.querySelectorAll(NOISE_SELECTOR).forEach(el => el.remove());

    clone.querySelectorAll(MARKER_SELECTOR).forEach(marker => {
      const number = citationNumber(marker);
      if (!number) return;
      const info = message.snippets.get(number) || null;
      marker.replaceWith(document.createTextNode(renderMarker(number, info, style)));
    });

    const paragraphs = paragraphsOf(clone);
    let text = '';
    if (paragraphs.length) {
      paragraphs.forEach(p => {
        const value = p.textContent.trim();
        if (value) text += value + '\n\n';
      });
    } else {
      text = clone.textContent;
    }
    return tidy(text);
  }

  function citationsOf(message) {
    return Array.from(message.markers.keys())
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map(number => {
        const snap = message.snippets.get(number);
        return {
          citation: number,
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

  function footnoteBlock(citations, style) {
    const lines = ['--- Sources ---'];
    citations.forEach(c => {
      lines.push(`[${c.citation}] ${c.filename}`);
      if (footnoteHasSnippet(style) && c.snippet) lines.push(`    "${c.snippet}"`);
    });
    return lines.join('\n');
  }

  function buildPlainText(answers, style) {
    const parts = [];
    answers.forEach(answer => {
      if (!answer.text) return;
      parts.push(answer.role === 'question' ? `Q: ${answer.text}` : answer.text);
      if (needsFootnotes(style) && answer.citations.length) {
        parts.push(footnoteBlock(answer.citations, style));
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

  async function buildExport(style) {
    const chosen = ['none', 'footnotes', 'inline', 'inline-short'].includes(style)
      ? style : 'none';
    const messages = collectMessages();
    if (!messages.length) return null;

    let harvest = { total: 0, missing: 0 };
    if (needsSnippets(chosen)) harvest = await harvestSnippets(messages);

    const answers = messages
      .map(message => ({
        role: message.role,
        text: messageText(message, chosen),
        citations: citationsOf(message)
      }))
      .filter(answer => answer.text);

    return {
      chatText: buildPlainText(answers, chosen),
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
      mapCitations().then(mappings => sendResponse({ mappings: mappings }));
      return true;
    } else if (request.action === 'getChatText') {
      buildExport(request.style)
        .then(result => sendResponse(result || { chatText: null }))
        .catch(err => sendResponse({ chatText: null, error: err.message }));
      return true;
    }
  });

  setTimeout(mapCitations, 2000);
  observeCitations();
})();
