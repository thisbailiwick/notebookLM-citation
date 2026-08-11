// popup.js - Popup script for NotebookLM Citation Mapper

// Hosts NotebookLM is served from. Google moved the app from
// notebooklm.google.com to notebook.google.com; the old host now redirects,
// but keep it listed so older links/tabs still work.
const NOTEBOOKLM_HOSTS = ['notebook.google.com', 'notebooklm.google.com'];

document.addEventListener('DOMContentLoaded', function() {
  const statusText = document.getElementById('status-text');
  const mappingsContainer = document.getElementById('mappings-container');
  const copyBtn = document.getElementById('copy-btn');
  const copyChatBtn = document.getElementById('copy-chat-btn');
  const copyRichBtn = document.getElementById('copy-rich-btn');
  const exportPdfBtn = document.getElementById('export-pdf-btn');
  const rescanBtn = document.getElementById('rescan-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const errorMessage = document.getElementById('error-message');
  const styleSelect = document.getElementById('citation-style');
  const styleHint = document.getElementById('citation-style-hint');
  const progressText = document.getElementById('progress-text');

  let currentMappings = [];

  // Snippet styles. Anything other than 'none' has to hover every citation on
  // the page to read its source text out of the tooltip overlay, which is why
  // the hint warns about it.
  const STYLE_HINTS = {
    'none': 'Fastest. Sources are listed by filename after each answer.',
    'footnotes': 'Full snippet listed once per citation, after each answer.',
    'inline': 'Full snippet spliced in at every citation. Longest output.',
    'inline-short': 'Short quote at each citation, full snippet in the footnotes.'
  };

  function currentStyle() {
    return styleSelect ? styleSelect.value : 'none';
  }

  function updateStyleHint() {
    if (!styleHint) return;
    const hint = STYLE_HINTS[currentStyle()] || '';
    const slow = currentStyle() !== 'none'
      ? ' Reading snippets takes a few seconds.' : '';
    styleHint.textContent = hint + slow;
  }

  // Remember the last choice so exports are repeatable without re-picking.
  chrome.storage.sync.get(['citationStyle'], (result) => {
    if (result.citationStyle && styleSelect) styleSelect.value = result.citationStyle;
    updateStyleHint();
  });

  if (styleSelect) {
    styleSelect.addEventListener('change', () => {
      chrome.storage.sync.set({ citationStyle: currentStyle() });
      updateStyleHint();
    });
  }

  // Exchange picker. Everything is selected by default; an empty selection is
  // sent as "all" so the export never silently produces nothing.
  function loadOutline() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || tabs.length === 0) return;
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getOutline' }, function (response) {
        if (chrome.runtime.lastError || !response || !response.exchanges) return;
        renderOutline(response.exchanges);
      });
    });
  }

  function renderOutline(exchanges) {
    const list = document.getElementById('exchange-list');
    const section = document.getElementById('exchange-section');
    if (!list || !section) return;

    list.textContent = '';
    if (exchanges.length < 2) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';

    exchanges.forEach(exchange => {
      const row = document.createElement('label');
      row.className = 'exchange-item';

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = true;
      box.value = String(exchange.index);
      box.className = 'exchange-checkbox';

      const label = document.createElement('span');
      const count = exchange.citations
        ? ` (${exchange.citations} citation${exchange.citations > 1 ? 's' : ''})`
        : '';
      label.textContent = `${exchange.index + 1}. ${exchange.preview}${count}`;

      row.appendChild(box);
      row.appendChild(label);
      list.appendChild(row);
    });
  }

  function selectedExchanges() {
    const boxes = Array.from(document.querySelectorAll('.exchange-checkbox'));
    if (!boxes.length) return null;
    const checked = boxes.filter(b => b.checked).map(b => parseInt(b.value, 10));
    return checked.length === boxes.length ? null : checked;
  }

  function setAllExchanges(checked) {
    document.querySelectorAll('.exchange-checkbox').forEach(b => { b.checked = checked; });
  }

  const selectAllBtn = document.getElementById('select-all-btn');
  const selectNoneBtn = document.getElementById('select-none-btn');
  if (selectAllBtn) selectAllBtn.addEventListener('click', () => setAllExchanges(true));
  if (selectNoneBtn) selectNoneBtn.addEventListener('click', () => setAllExchanges(false));

  function showProgress(message) {
    if (!progressText) return;
    progressText.textContent = message;
    progressText.style.display = message ? 'block' : 'none';
  }

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'harvestProgress') {
      showProgress(request.total
        ? `Reading source snippets… ${request.done}/${request.total}`
        : 'Reading source snippets…');
    }
  });

  // Single path to the content script for all three export buttons.
  function requestExport(onDone, onFail) {
    const boxes = Array.from(document.querySelectorAll('.exchange-checkbox'));
    if (boxes.length && !boxes.some(b => b.checked)) {
      onFail('Select at least one question to export.');
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || tabs.length === 0) {
        showProgress('');
        onFail('No active tab found.');
        return;
      }
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'getChatText', style: currentStyle(), selection: selectedExchanges() },
        function (response) {
          showProgress('');
          if (chrome.runtime.lastError || !response) {
            onFail('Error extracting chat text. Please refresh the page.');
            return;
          }
          if (!response.chatText) {
            onFail(response.error || 'No chat text found.');
            return;
          }
          if (response.stats && response.stats.missing) {
            showError(`${response.stats.missing} snippet(s) could not be read.`);
          }
          onDone(response);
        }
      );
    });
  }

  // Flat citation list for history/statistics, which predate per-answer scoping.
  function flattenCitations(response) {
    const flat = [];
    (response.answers || []).forEach(answer => {
      (answer.citations || []).forEach(c => flat.push(c));
    });
    return flat.length ? flat : currentMappings;
  }

  // Storage helper functions
  function saveToHistory(text, mappings, type) {
    chrome.storage.local.get(['citationHistory'], (result) => {
      const history = result.citationHistory || [];

      // Create preview (first 100 characters)
      const preview = text.substring(0, 100).replace(/\n/g, ' ');

      const historyItem = {
        timestamp: new Date().toISOString(),
        preview: preview,
        count: mappings.length,
        type: type, // 'chat' or 'mappings'
        fullText: text,
        mappings: mappings
      };

      // Add to beginning of array
      history.unshift(historyItem);

      // Keep only last 100 entries
      const trimmedHistory = history.slice(0, 100);

      chrome.storage.local.set({ citationHistory: trimmedHistory });
    });
  }

  function updateStatistics(mappings) {
    chrome.storage.local.get(['statistics'], (result) => {
      const stats = result.statistics || {
        totalCitations: 0,
        totalCopies: 0,
        uniqueDocs: 0,
        sessions: 0,
        topSources: []
      };

      // Update counts
      stats.totalCitations += mappings.length;
      stats.totalCopies += 1;

      // Track unique documents
      const docSet = new Set();
      mappings.forEach(m => docSet.add(m.filename));

      // Update top sources
      const sourceCount = {};
      mappings.forEach(m => {
        sourceCount[m.filename] = (sourceCount[m.filename] || 0) + 1;
      });

      // Merge with existing top sources
      const existingTopSources = stats.topSources || [];
      existingTopSources.forEach(source => {
        sourceCount[source.filename] = (sourceCount[source.filename] || 0) + source.count;
      });

      // Convert to array and sort
      stats.topSources = Object.entries(sourceCount).map(([filename, count]) => ({
        filename,
        count
      })).sort((a, b) => b.count - a.count);

      // Update unique docs (all time)
      const allDocs = new Set(stats.topSources.map(s => s.filename));
      stats.uniqueDocs = allDocs.size;

      chrome.storage.local.set({ statistics: stats });
    });
  }

  function incrementSessionCount() {
    chrome.storage.local.get(['statistics'], (result) => {
      const stats = result.statistics || {
        totalCitations: 0,
        totalCopies: 0,
        uniqueDocs: 0,
        sessions: 0,
        topSources: []
      };

      stats.sessions += 1;
      chrome.storage.local.set({ statistics: stats });
    });
  }

  // Increment session count on popup open
  incrementSessionCount();

  // Load and apply theme
  function applyTheme(theme) {
    if (theme === 'auto') {
      // Use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else if (theme === 'dark') {
      document.body.setAttribute('data-theme', 'dark');
    } else {
      document.body.removeAttribute('data-theme');
    }
  }

  // Load theme from storage
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || { theme: 'light' };
    applyTheme(settings.theme);
  });

  // Listen for theme changes from settings page
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.settings) {
      const newSettings = changes.settings.newValue;
      if (newSettings && newSettings.theme) {
        applyTheme(newSettings.theme);
      }
    }
  });

  // Listen for system theme changes (for auto mode)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    chrome.storage.sync.get(['settings'], (result) => {
      const settings = result.settings || { theme: 'light' };
      if (settings.theme === 'auto') {
        document.body.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  });

  // Check if we're on NotebookLM
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || tabs.length === 0) {
      statusText.textContent = 'No active tab found';
      statusText.style.color = '#d93025';
      return;
    }

    const currentTab = tabs[0];

    // Secure URL validation
    let isNotebookLM = false;
    try {
      const url = new URL(currentTab.url);
      isNotebookLM = NOTEBOOKLM_HOSTS.includes(url.hostname);
    } catch (e) {
      isNotebookLM = false;
    }

    if (!isNotebookLM) {
      statusText.textContent = 'Please open Google NotebookLM';
      statusText.style.color = '#d93025';
      mappingsContainer.innerHTML = '<div class="loading">This extension only works on notebook.google.com</div>';
      copyBtn.disabled = true;
      copyChatBtn.disabled = true;
      copyRichBtn.disabled = true;
      exportPdfBtn.disabled = true;
      rescanBtn.disabled = true;
      return;
    }

    // Request mappings from content script
    loadMappings();
    loadOutline();
  });

  // Load mappings from content script
  function loadMappings() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) return;
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getMappings'}, function(response) {
        if (chrome.runtime.lastError) {
          statusText.textContent = 'Error connecting to page';
          statusText.style.color = '#d93025';
          mappingsContainer.innerHTML = '<div class="loading">Could not connect to NotebookLM. Please refresh the page.</div>';
          return;
        }

        if (response && response.mappings) {
          currentMappings = response.mappings;
          displayMappings(response.mappings);
        }
      });
    });
  }

  // Display mappings in the popup
  function displayMappings(mappings) {
    if (mappings.length === 0) {
      statusText.textContent = 'No citations found';
      statusText.style.color = '#ea8600';
      mappingsContainer.innerHTML = '<div class="loading">No citations detected on the page yet.</div>';
      copyBtn.disabled = true;
      copyRichBtn.disabled = true;
      exportPdfBtn.disabled = true;
      return;
    }

    // Citation numbers restart in every answer, so group by answer instead of
    // sorting into one list where [1] would appear several times over.
    const byAnswer = new Map();
    mappings.forEach(mapping => {
      const key = mapping.answer || 1;
      if (!byAnswer.has(key)) byAnswer.set(key, []);
      byAnswer.get(key).push(mapping);
    });

    const answerCount = byAnswer.size;
    statusText.textContent =
      `Found ${mappings.length} citation${mappings.length > 1 ? 's' : ''}` +
      (answerCount > 1 ? ` across ${answerCount} answers` : '');
    statusText.style.color = '#188038';

    // Built as DOM rather than innerHTML: filenames come from the page and can
    // contain characters that would otherwise be parsed as markup.
    mappingsContainer.textContent = '';
    Array.from(byAnswer.keys()).sort((a, b) => a - b).forEach(key => {
      if (answerCount > 1) {
        const heading = document.createElement('div');
        heading.className = 'mapping-item';
        heading.style.fontWeight = 'bold';
        heading.style.opacity = '0.7';
        heading.textContent = `Answer ${key}`;
        mappingsContainer.appendChild(heading);
      }

      byAnswer.get(key)
        .sort((a, b) => parseInt(a.citation, 10) - parseInt(b.citation, 10))
        .forEach(mapping => {
          const row = document.createElement('div');
          row.className = 'mapping-item';
          const num = document.createElement('span');
          num.className = 'citation-num';
          num.textContent = `Citation ${mapping.citation}`;
          row.appendChild(num);
          row.appendChild(document.createTextNode(` → ${mapping.filename}`));
          mappingsContainer.appendChild(row);
        });
    });
    copyBtn.disabled = false;
    copyChatBtn.disabled = false;
    copyRichBtn.disabled = false;
    exportPdfBtn.disabled = false;
  }

  // Copy mappings to clipboard
  copyBtn.addEventListener('click', function() {
    if (currentMappings.length === 0) return;

    let text = 'NotebookLM Citation Mappings\n';
    text += '===========================\n\n';

    currentMappings.forEach(mapping => {
      text += `Citation ${mapping.citation} → ${mapping.filename}\n`;
    });

    // Use Chrome API to copy to clipboard
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);

    // Save to history and update statistics
    saveToHistory(text, currentMappings, 'mappings');
    updateStatistics(currentMappings);

    // Show feedback
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    copyBtn.style.background = '#188038';

    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.background = '#4285f4';
    }, 2000);
  });

  // Rescan the page
  rescanBtn.addEventListener('click', function() {
    rescanBtn.disabled = true;
    rescanBtn.textContent = 'Rescanning...';

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        showError('No active tab found.');
        rescanBtn.disabled = false;
        rescanBtn.textContent = 'Rescan Page';
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, {action: 'rescan'}, function(response) {
        if (chrome.runtime.lastError) {
          showError('Failed to rescan. Please refresh the page.');
          rescanBtn.disabled = false;
          rescanBtn.textContent = 'Rescan Page';
          return;
        }

        // Reload mappings after rescan
        setTimeout(() => {
          loadMappings();
          rescanBtn.disabled = false;
          rescanBtn.textContent = 'Rescan Page';
        }, 500);
      });
    });
  });

  // Copy chat text with citations. The content script already applied the
  // selected snippet style, so chatText is ready to use as-is.
  copyChatBtn.addEventListener('click', function() {
    copyChatBtn.disabled = true;
    copyChatBtn.textContent = 'Extracting text...';

    const restore = () => {
      copyChatBtn.textContent = '📄 Copy Text with Sources';
      copyChatBtn.style.background = '#34a853';
      copyChatBtn.disabled = false;
    };

    requestExport(function(response) {
      copyToClipboard(response.chatText);

      const citations = flattenCitations(response);
      saveToHistory(response.chatText, citations, 'chat');
      updateStatistics(citations);

      copyChatBtn.textContent = '✓ Copied!';
      copyChatBtn.style.background = '#188038';
      setTimeout(restore, 2000);
    }, function(message) {
      showError(message);
      restore();
    });
  });

  function copyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }

  // Show error message
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';

    setTimeout(() => {
      errorMessage.style.display = 'none';
    }, 5000);
  }

  // Open settings page
  settingsBtn.addEventListener('click', function() {
    chrome.tabs.create({ url: 'settings.html' });
  });

  function escapeHTML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Generate Rich HTML per answer, so each answer keeps its own citation
  // numbering instead of being flattened into one page-wide list.
  function generateRichHTML(response) {
    const style = response.style || 'none';
    const withSnippets = style === 'footnotes' || style === 'inline-short';
    let html = '<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">';

    (response.answers || []).forEach(answer => {
      // The plain flavor, not the markdown one - "**bold**" would render as
      // literal asterisks once this is pasted as HTML.
      let body = escapeHTML(answer.plain || answer.text)
        .replace(/\[(\d+)\]/g, '<strong style="color: #4285f4;">[$1]</strong>')
        .replace(/\n/g, '<br>');
      if (answer.role === 'question') {
        html += `<p style="font-weight: bold; margin: 16px 0 8px;">${body}</p>`;
      } else {
        html += `<p style="margin: 0 0 12px;">${body}</p>`;
      }

      if (style !== 'inline' && answer.citations && answer.citations.length) {
        html += '<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;">';
        html += '<p style="font-weight: bold; margin-bottom: 8px;">Sources:</p>';
        html += '<ul style="margin: 0 0 16px; padding-left: 20px;">';
        answer.citations.forEach(c => {
          html += `<li><strong style="color: #4285f4;">[${c.citation}]</strong> ${escapeHTML(c.filename)}`;
          if (withSnippets && c.snippet) {
            html += `<div style="color: #555; font-style: italic; margin: 4px 0 8px;">“${escapeHTML(c.snippet)}”</div>`;
          }
          html += '</li>';
        });
        html += '</ul>';
      }
    });

    return html + '</div>';
  }

  // Copy Rich Text (HTML) to clipboard
  copyRichBtn.addEventListener('click', function() {
    copyRichBtn.disabled = true;
    copyRichBtn.textContent = 'Extracting text...';

    const restore = () => {
      copyRichBtn.textContent = '📝 Copy Rich Text';
      copyRichBtn.style.background = '#4285f4';
      copyRichBtn.disabled = false;
    };

    requestExport(async function(response) {
      const richHTML = generateRichHTML(response);

      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([richHTML], {type: 'text/html'}),
            'text/plain': new Blob([response.chatText], {type: 'text/plain'})
          })
        ]);
      } catch (err) {
        showError('Failed to copy rich text. Try plain copy instead.');
        restore();
        return;
      }

      const citations = flattenCitations(response);
      saveToHistory(response.chatText, citations, 'rich');
      updateStatistics(citations);

      copyRichBtn.textContent = '✓ Copied!';
      copyRichBtn.style.background = '#188038';
      setTimeout(restore, 2000);
    }, function(message) {
      showError(message);
      restore();
    });
  });

  // Export PDF. chatText already carries the per-answer Sources blocks in the
  // selected style, so there is no separate page-wide source list to append.
  exportPdfBtn.addEventListener('click', function() {
    exportPdfBtn.disabled = true;
    exportPdfBtn.textContent = 'Generating PDF...';

    const restore = () => {
      exportPdfBtn.textContent = '📑 Export PDF';
      exportPdfBtn.style.background = '#4285f4';
      exportPdfBtn.disabled = false;
    };

    requestExport(function(response) {
      try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
          showError('PDF library failed to load. Please try again.');
          restore();
          return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('NotebookLM Export', 20, 20);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100);
        doc.text(new Date().toLocaleString(), 20, 28);
        doc.setTextColor(0);

        doc.setFontSize(11);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const maxWidth = pageWidth - (margin * 2);
        const lineHeight = 6;

        // Plain flavor: markdown syntax would be literal noise in a PDF.
        const lines = doc.splitTextToSize(response.plainText || response.chatText, maxWidth);
        let yPosition = 40;

        lines.forEach(line => {
          if (yPosition > pageHeight - 20) {
            doc.addPage();
            yPosition = 20;
          }
          doc.text(line, margin, yPosition);
          yPosition += lineHeight;
        });

        const timestamp = new Date().toISOString().slice(0, 10);
        doc.save(`notebooklm-export-${timestamp}.pdf`);

        const citations = flattenCitations(response);
        saveToHistory(response.plainText || response.chatText, citations, 'pdf');
        updateStatistics(citations);

        exportPdfBtn.textContent = '✓ Downloaded!';
        exportPdfBtn.style.background = '#188038';
        setTimeout(restore, 2000);

      } catch (err) {
        console.error('PDF export error:', err);
        showError('Failed to generate PDF. Please try again.');
        restore();
      }
    }, function(message) {
      showError(message);
      restore();
    });
  });
});
