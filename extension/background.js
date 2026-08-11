// background.js - Background service worker for NotebookLM Citation Mapper

// Hosts NotebookLM is served from. Google moved the app from
// notebooklm.google.com to notebook.google.com; the old host now redirects,
// but keep it listed so older links/tabs still work.
const NOTEBOOKLM_HOSTS = ['notebook.google.com', 'notebooklm.google.com'];
const NOTEBOOKLM_URL_PATTERNS = NOTEBOOKLM_HOSTS.map(host => `https://${host}/*`);

function isNotebookLMUrl(url) {
  try {
    return NOTEBOOKLM_HOSTS.includes(new URL(url).hostname);
  } catch (e) {
    return false;
  }
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('NotebookLM Citation Mapper installed');

  // Set up context menu (optional)
  chrome.contextMenus.create({
    id: 'notebooklm-citation-mapper',
    title: 'Show Citation Mappings',
    contexts: ['page'],
    documentUrlPatterns: NOTEBOOKLM_URL_PATTERNS
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'notebooklm-citation-mapper') {
    // Send message to content script to show mappings
    chrome.tabs.sendMessage(tab.id, { action: 'showMappings' });
  }
});

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && isNotebookLMUrl(tab.url)) {
    // Content script should be automatically injected via manifest
    // This is just a fallback if needed
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(err => {
      // Script might already be injected
      console.log('Script injection skipped:', err.message);
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTabInfo') {
    sendResponse({ tabId: sender.tab.id, url: sender.tab.url });
  }
  return true;
});
