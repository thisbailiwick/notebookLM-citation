// settings.js - Settings page for NotebookLM Citation Mapper

document.addEventListener('DOMContentLoaded', function() {
  // Default settings
  const defaultSettings = {
    theme: 'light',
    autoRescan: true,
    // On by default: collapsed citation lists are otherwise dropped silently
    // from exports.
    autoExpand: true,
    showNotifications: true,
    citationStyle: 'brackets',
    sourceHeader: 'Sources:',
    sourceFormat: 'arrow',
    separator: '─────────────────────'
  };

  let settings = {...defaultSettings};

  // Theme management
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

  // Listen for system theme changes (for auto mode)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (settings.theme === 'auto') {
      document.body.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });

  // Initialize
  loadSettings();
  setupTabs();
  setupEventListeners();
  loadStatistics();
  loadHistory();
  updateFormatPreview();

  // Tab Switching
  function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');

        // Update active states
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(tabName).classList.add('active');
      });
    });
  }

  // Event Listeners
  function setupEventListeners() {
    // Back button
    document.getElementById('back-btn').addEventListener('click', () => {
      window.close();
    });

    // General Settings
    document.getElementById('save-general').addEventListener('click', saveGeneralSettings);

    // Theme selection
    document.querySelectorAll('.theme-option').forEach(option => {
      option.addEventListener('click', function() {
        document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
        settings.theme = this.getAttribute('data-theme');

        // Apply theme immediately
        applyTheme(settings.theme);

        // Save to storage
        chrome.storage.sync.set({settings}, () => {
          showNotification('Theme updated!', 'success');
        });
      });
    });

    // Format Settings
    document.getElementById('save-format').addEventListener('click', saveFormatSettings);
    document.getElementById('reset-format').addEventListener('click', resetFormatSettings);

    // Update preview when format options change
    ['citation-style', 'source-header', 'source-format', 'separator'].forEach(id => {
      document.getElementById(id).addEventListener('change', updateFormatPreview);
      document.getElementById(id).addEventListener('input', updateFormatPreview);
    });

    // Export/Import
    document.getElementById('export-json').addEventListener('click', exportData);
    document.getElementById('copy-export').addEventListener('click', copyExportData);
    document.getElementById('import-json').addEventListener('click', importData);
    document.getElementById('backup-settings').addEventListener('click', backupSettings);
    document.getElementById('restore-settings').addEventListener('click', restoreSettings);
    document.getElementById('clear-all').addEventListener('click', clearAllData);

    // History
    document.getElementById('clear-history').addEventListener('click', clearHistory);
    document.getElementById('refresh-history').addEventListener('click', loadHistory);

    // Statistics
    document.getElementById('reset-stats').addEventListener('click', resetStatistics);

    // About
    document.getElementById('view-readme').addEventListener('click', () => {
      window.open('https://github.com/nicremo/notebookLM-citation/blob/main/README.md', '_blank');
    });
    document.getElementById('report-issue').addEventListener('click', () => {
      window.open('https://github.com/nicremo/notebookLM-citation/issues', '_blank');
    });
  }

  // Load Settings from Storage
  function loadSettings() {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        settings = {...defaultSettings, ...result.settings};
      }
      applySettingsToUI();
      applyTheme(settings.theme);
    });
  }

  // Apply settings to UI
  function applySettingsToUI() {
    // General
    document.getElementById('auto-rescan').checked = settings.autoRescan;
    document.getElementById('auto-expand').checked = settings.autoExpand;
    document.getElementById('show-notifications').checked = settings.showNotifications;

    // Theme
    document.querySelectorAll('.theme-option').forEach(option => {
      if (option.getAttribute('data-theme') === settings.theme) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });

    // Format
    document.getElementById('citation-style').value = settings.citationStyle;
    document.getElementById('source-header').value = settings.sourceHeader;
    document.getElementById('source-format').value = settings.sourceFormat;
    document.getElementById('separator').value = settings.separator;
  }

  // Save General Settings
  function saveGeneralSettings() {
    settings.autoRescan = document.getElementById('auto-rescan').checked;
    settings.autoExpand = document.getElementById('auto-expand').checked;
    settings.showNotifications = document.getElementById('show-notifications').checked;

    chrome.storage.sync.set({settings}, () => {
      showNotification('Settings saved successfully!', 'success');
    });
  }

  // Save Format Settings
  function saveFormatSettings() {
    settings.citationStyle = document.getElementById('citation-style').value;
    settings.sourceHeader = document.getElementById('source-header').value;
    settings.sourceFormat = document.getElementById('source-format').value;
    settings.separator = document.getElementById('separator').value;

    chrome.storage.sync.set({settings}, () => {
      showNotification('Format settings saved successfully!', 'success');
    });
  }

  // Reset Format Settings
  function resetFormatSettings() {
    if (confirm('Reset all format settings to defaults?')) {
      settings.citationStyle = defaultSettings.citationStyle;
      settings.sourceHeader = defaultSettings.sourceHeader;
      settings.sourceFormat = defaultSettings.sourceFormat;
      settings.separator = defaultSettings.separator;

      applySettingsToUI();
      updateFormatPreview();

      chrome.storage.sync.set({settings}, () => {
        showNotification('Format settings reset to defaults!', 'success');
      });
    }
  }

  // Update Format Preview
  function updateFormatPreview() {
    const citationStyle = document.getElementById('citation-style').value;
    const sourceHeader = document.getElementById('source-header').value;
    const sourceFormat = document.getElementById('source-format').value;
    const separator = document.getElementById('separator').value;

    // Sample text with citations
    let preview = 'According to the research ';

    switch(citationStyle) {
      case 'brackets':
        preview += '[1]';
        break;
      case 'parens':
        preview += '(1)';
        break;
      case 'superscript':
        preview += '^1';
        break;
      case 'footnote':
        preview += '1.';
        break;
    }

    preview += ', the findings suggest ';

    switch(citationStyle) {
      case 'brackets':
        preview += '[2]';
        break;
      case 'parens':
        preview += '(2)';
        break;
      case 'superscript':
        preview += '^2';
        break;
      case 'footnote':
        preview += '2.';
        break;
    }

    preview += ' that this approach is effective.\n\n';
    preview += separator + '\n';
    preview += sourceHeader + '\n';

    // Add source list based on format
    for (let i = 1; i <= 2; i++) {
      const filename = i === 1 ? 'research_paper.pdf' : 'study_results.docx';

      switch(sourceFormat) {
        case 'arrow':
          preview += `[${i}] → ${filename}\n`;
          break;
        case 'colon':
          preview += `[${i}]: ${filename}\n`;
          break;
        case 'dash':
          preview += `[${i}] - ${filename}\n`;
          break;
        case 'numbered':
          preview += `${i}. ${filename}\n`;
          break;
      }
    }

    document.getElementById('format-preview').textContent = preview;
  }

  // Export Data
  function exportData() {
    chrome.storage.local.get(['citationHistory', 'statistics'], (result) => {
      const exportObj = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        settings: settings,
        history: result.citationHistory || [],
        statistics: result.statistics || {}
      };

      const jsonString = JSON.stringify(exportObj, null, 2);
      document.getElementById('export-data').value = jsonString;
      showNotification('Data exported successfully!', 'success');
    });
  }

  // Copy Export Data
  function copyExportData() {
    const textarea = document.getElementById('export-data');
    if (!textarea.value) {
      showNotification('Please export data first!', 'error');
      return;
    }

    textarea.select();
    document.execCommand('copy');
    showNotification('Copied to clipboard!', 'success');
  }

  // Import Data
  function importData() {
    const importText = document.getElementById('import-data').value.trim();

    if (!importText) {
      showNotification('Please paste data to import!', 'error');
      return;
    }

    try {
      const importObj = JSON.parse(importText);

      if (importObj.settings) {
        settings = {...defaultSettings, ...importObj.settings};
        chrome.storage.sync.set({settings});
        applySettingsToUI();
      }

      if (importObj.history) {
        chrome.storage.local.set({citationHistory: importObj.history});
      }

      if (importObj.statistics) {
        chrome.storage.local.set({statistics: importObj.statistics});
      }

      showNotification('Data imported successfully!', 'success');
      setTimeout(() => {
        loadHistory();
        loadStatistics();
      }, 500);

    } catch (e) {
      showNotification('Invalid JSON data!', 'error');
    }
  }

  // Backup Settings
  function backupSettings() {
    chrome.storage.sync.get(['settings'], (syncResult) => {
      chrome.storage.local.get(['citationHistory', 'statistics'], (localResult) => {
        const backup = {
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          settings: syncResult.settings || defaultSettings,
          history: localResult.citationHistory || [],
          statistics: localResult.statistics || {}
        };

        const dataStr = JSON.stringify(backup, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `notebooklm-citations-backup-${Date.now()}.json`;
        link.click();

        showNotification('Backup downloaded!', 'success');
      });
    });
  }

  // Restore Settings
  function restoreSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';

    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const backup = JSON.parse(event.target.result);

          if (backup.settings) {
            chrome.storage.sync.set({settings: backup.settings});
            settings = {...defaultSettings, ...backup.settings};
            applySettingsToUI();
          }

          if (backup.history) {
            chrome.storage.local.set({citationHistory: backup.history});
          }

          if (backup.statistics) {
            chrome.storage.local.set({statistics: backup.statistics});
          }

          showNotification('Settings restored successfully!', 'success');
          setTimeout(() => {
            loadHistory();
            loadStatistics();
          }, 500);

        } catch (err) {
          showNotification('Invalid backup file!', 'error');
        }
      };

      reader.readAsText(file);
    };

    input.click();
  }

  // Clear All Data
  function clearAllData() {
    if (confirm('This will clear ALL data including settings, history, and statistics. Are you sure?')) {
      chrome.storage.sync.clear();
      chrome.storage.local.clear();

      settings = {...defaultSettings};
      applySettingsToUI();
      loadHistory();
      loadStatistics();

      showNotification('All data cleared!', 'success');
    }
  }

  // Load History
  function loadHistory() {
    chrome.storage.local.get(['citationHistory'], (result) => {
      const history = result.citationHistory || [];
      const historyList = document.getElementById('history-list');

      if (history.length === 0) {
        historyList.innerHTML = `
          <div class="alert alert-info">
            No history available yet. Start copying citations to see them here!
          </div>
        `;
        return;
      }

      historyList.innerHTML = '';
      // History is already in reverse order (newest first), take first 50
      history.slice(0, 50).forEach((item, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';

        // Determine type badge
        const typeEmoji = item.type === 'chat' ? '💬' : '📋';
        const typeLabel = item.type === 'chat' ? 'Chat' : 'Mappings';

        historyItem.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
            <div class="timestamp">${new Date(item.timestamp).toLocaleString()}</div>
            <div style="background: #e8f0fe; color: #4285f4; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">
              ${typeEmoji} ${typeLabel}
            </div>
          </div>
          <div class="preview">${item.preview || 'Citation copied'}</div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">
            ${item.count || 0} citation${item.count !== 1 ? 's' : ''}
          </div>
        `;

        // Add click to view full text
        historyItem.style.cursor = 'pointer';
        historyItem.title = 'Click to view full text';
        historyItem.addEventListener('click', () => {
          showHistoryDetail(item);
        });

        historyList.appendChild(historyItem);
      });
    });
  }

  // Show history detail in modal/alert
  function showHistoryDetail(item) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 24px;
      border-radius: 8px;
      max-width: 800px;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    `;

    content.innerHTML = `
      <h2 style="margin-top: 0;">History Detail</h2>
      <div style="margin-bottom: 16px;">
        <strong>Time:</strong> ${new Date(item.timestamp).toLocaleString()}<br>
        <strong>Type:</strong> ${item.type === 'chat' ? '💬 Chat' : '📋 Mappings'}<br>
        <strong>Citations:</strong> ${item.count}
      </div>
      <div style="margin-bottom: 16px;">
        <strong>Full Text:</strong>
        <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-size: 13px; max-height: 400px; overflow-y: auto;">${item.fullText || 'No text available'}</pre>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-primary" id="copy-history-text">📋 Copy Text</button>
        <button class="btn btn-secondary" id="close-modal">Close</button>
      </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Close modal
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    content.querySelector('#close-modal').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // Copy text
    content.querySelector('#copy-history-text').addEventListener('click', () => {
      const textarea = document.createElement('textarea');
      textarea.value = item.fullText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showNotification('Text copied from history!', 'success');
    });
  }

  // Clear History
  function clearHistory() {
    if (confirm('Clear all copy history?')) {
      chrome.storage.local.set({citationHistory: []}, () => {
        loadHistory();
        showNotification('History cleared!', 'success');
      });
    }
  }

  // Load Statistics
  function loadStatistics() {
    chrome.storage.local.get(['statistics'], (result) => {
      const stats = result.statistics || {
        totalCitations: 0,
        totalCopies: 0,
        uniqueDocs: 0,
        sessions: 0
      };

      document.getElementById('stat-total').textContent = stats.totalCitations || 0;
      document.getElementById('stat-copies').textContent = stats.totalCopies || 0;
      document.getElementById('stat-docs').textContent = stats.uniqueDocs || 0;
      document.getElementById('stat-sessions').textContent = stats.sessions || 0;

      // Load top sources if available
      if (stats.topSources && stats.topSources.length > 0) {
        const topSourcesDiv = document.getElementById('top-sources');
        topSourcesDiv.innerHTML = '';

        stats.topSources.slice(0, 5).forEach((source, index) => {
          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = `
            <h3>#${index + 1} ${source.filename}</h3>
            <p>Referenced ${source.count} times</p>
          `;
          topSourcesDiv.appendChild(card);
        });
      }
    });
  }

  // Reset Statistics
  function resetStatistics() {
    if (confirm('Reset all statistics? This cannot be undone.')) {
      const resetStats = {
        totalCitations: 0,
        totalCopies: 0,
        uniqueDocs: 0,
        sessions: 0,
        topSources: []
      };

      chrome.storage.local.set({statistics: resetStats}, () => {
        loadStatistics();
        showNotification('Statistics reset!', 'success');
      });
    }
  }

  // Show Notification
  function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type}`;
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '10000';
    notification.style.minWidth = '250px';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.transition = 'opacity 0.3s';
      notification.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }
});
