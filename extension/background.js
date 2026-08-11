// background.js - Background service worker for NotebookLM Citation Mapper

// The content script is injected declaratively via the manifest and the popup
// talks to it directly, so there is nothing for the service worker to do
// beyond this. Do not add chrome.contextMenus or chrome.scripting calls
// without also declaring the matching permission in manifest.json - an
// undefined namespace throws during evaluation and kills the whole worker.

chrome.runtime.onInstalled.addListener(() => {
  console.log('NotebookLM Citation Mapper installed');
});
