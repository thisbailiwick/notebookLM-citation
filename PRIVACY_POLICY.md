# Privacy Policy for NotebookLM Citation Mapper

**Last Updated:** August 11, 2026

## Overview

NotebookLM Citation Mapper is a Chrome extension that enhances your experience with Google NotebookLM by helping you preserve citation references when copying text.

## Data Collection

**We do not collect or transmit any user data.** Some data is stored on your
device so the extension can remember your settings and your copy history — see
[Data Storage](#data-storage) for exactly what and where.

### What the Extension Does:
- Scans the current NotebookLM page you're viewing for citation markers
- Extracts text content from the page when you click the copy button
- Processes all data locally in your browser
- Does not send any data to external servers

### What It Does Automatically:

The extension acts on the page without waiting for you to click anything, so it
is worth knowing what that involves:

- A content script runs on every NotebookLM page and watches it for changes, so
  citations are picked up as answers stream in
- Collapsed citation lists are expanded by clicking their "more" control, which
  is a real click on the page. Turn this off with **Auto-expand collapsed
  citation lists** in settings
- When an export needs source snippets, each citation is hovered in turn to
  reveal its tooltip. This only happens while an export is running

None of this contacts a server. Reading a snippet is a local DOM interaction —
the text is already on the page.

### Permissions Explained:

#### `activeTab`
- **Why we need it:** To read citation information and text content from the NotebookLM page you're currently viewing
- **What we access:** Only NotebookLM page content. Note that the content script reads the page as it loads, not just when you click something — see "What It Does Automatically" below
- **What we don't do:** We never access other tabs or websites

#### `clipboardWrite`
- **Why we need it:** To copy formatted text with citations to your clipboard when you click the copy button
- **What we access:** Permission to write text to your system clipboard
- **What we don't do:** We never read from your clipboard or access clipboard history

#### `storage`
- **Why we need it:** To remember your settings and export preferences, and to keep a history of what you have copied
- **What we access:** Chrome's extension storage, described under Data Storage below
- **What we don't do:** We never transmit any of it off your device

#### `host_permissions` for `https://notebook.google.com/*` and `https://notebooklm.google.com/*`
- **Why we need it:** To function specifically on Google NotebookLM pages
- **What we access:** Only pages on the notebook.google.com and notebooklm.google.com domains
- **What we don't do:** We never access any other websites or Google services

## Local Processing

All text extraction and citation mapping happens entirely within your browser. No data leaves your device.

## Third-Party Services

This extension does not use any third-party services, analytics, or tracking tools.

## Data Storage

The extension stores data on your device using Chrome's storage API. Nothing is
sent anywhere, but this is persistent storage, not memory that clears when you
close the tab.

In `chrome.storage.local`, which stays on this device:

- **Copy history** — the last 100 copies or exports, each holding the **full
  text** of what was copied along with its citation list. This is the notebook
  content itself, so if your notebooks are sensitive, so is this history.
- **Statistics** — counts of how often each source has been cited.

In `chrome.storage.sync`, which Chrome replicates to your other signed-in
devices through your Google account:

- **Settings** — theme, auto-expand, auto-rescan, and formatting preferences.
- **Snippet style** — which export format you last chose.

Citation mappings themselves are held in memory only and are discarded when you
close the tab.

You can clear the history and statistics at any time from the extension's
settings page, under History and Statistics.

## Updates

This privacy policy may be updated to reflect changes in the extension's functionality. The "Last Updated" date at the top of this document will be changed accordingly.

## Contact

If you have questions about this privacy policy or the extension's behavior:
- Open an issue on GitHub: https://github.com/thisbailiwick/notebookLM-citation/issues
- Repository: https://github.com/thisbailiwick/notebookLM-citation

## Your Rights

You have full control over this extension:
- You can disable or uninstall it at any time via Chrome's extension settings
- You can review the complete source code on our GitHub repository
- The extension is open source under an open license

## Compliance

This extension complies with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)

**We respect your privacy. This extension was built to help you work more efficiently, not to collect your data.**
