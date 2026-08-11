# NotebookLM Citation Mapper

> **This is a fork of [nicremo/notebookLM-citation](https://github.com/nicremo/notebookLM-citation).**
> It restores the extension on Google's new `notebook.google.com` address and
> adds Markdown export with the quoted source text behind each citation. See
> [What This Fork Changes](#what-this-fork-changes) for the full list.

A Chrome extension that automatically maps citation numbers to source filenames in Google NotebookLM and allows you to copy chat text with preserved citations.

## Features

- **Automatic Citation Mapping**: Scans NotebookLM pages and creates a mapping between citation numbers and source documents
- **Markdown Export**: Copies as Markdown, preserving headings, lists, and bold/italic from the page
- **Source Snippets**: Pulls the quoted passage behind each citation into your copies and exports
- **Real Footnotes**: Citations export as `[^1]` references resolving to `[^1]:` definitions
- **Single Sources Block**: All sources collected at the end of the export rather than repeated after every answer
- **Select What to Export**: Choose which exchanges to include; all are selected by default
- **Copy Chat with Citations**: Extract the full chat text with citation numbers preserved
- **Citation Mapping Export**: Copy just the citation mappings to clipboard
- **Rich Text and PDF Export**: Copy as HTML or download the conversation as a PDF
- **Smart Page Scanning**: Automatically detects new citations as they appear
- **Manual Rescan**: Refresh the citation mappings on demand

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/thisbailiwick/notebookLM-citation.git
   cd notebookLM-citation
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right corner)

4. Click "Load unpacked" and select the `extension` folder from this repository

## Usage

1. Navigate to [notebook.google.com](https://notebook.google.com) (the old
   notebooklm.google.com address still works and redirects here)

2. The extension will automatically:
   - Scan for citations in the current notebook
   - Update citations as new content loads

3. Click the extension icon in Chrome to see:
   - **Citation Mappings**: List of all detected citations, grouped by answer
   - **Questions to include**: Tick the exchanges you want (all are on by default)
   - **Source snippets in exports**: Choose how the quoted source text appears
   - **📄 Copy Text with Sources**: Copies the conversation as Markdown
   - **📝 Copy Rich Text**: Copies as HTML for pasting into a document
   - **📑 Export PDF**: Downloads the conversation as a PDF
   - **📋 Copy Citation Mappings**: Copies just the citation legend
   - **🔄 Rescan Page**: Manually refresh the citation mappings

### Copy Format

"Copy Text with Sources" produces Markdown:

```markdown
# NotebookLM Export

*Exported 2026-08-11 · 8 exchanges · 96 citations*

---

## Exchange 1

**Question**

> How does he present nonduality?

**Answer**

### How He Presents Nonduality

He presents it as **an ordinary, ever-present reality**[^1].

- **The Ocean and the Waves:** his foundational metaphor[^4][^5].

---

## Sources

[^1]: The Deepest Acceptance - Jeff Foster.epub
> The spiritual awakening I talk about in this book is not about
> protecting yourself more.

[^2]: Falling in Love with Where You Are.epub
> You are the ocean, not just the wave.
```

The snippet under each footnote is the passage NotebookLM shows when you hover a
citation. How much of it appears is up to the **Source snippets in exports**
setting, which ranges from filenames only to the full passage spliced inline.

Sources are collected into one block at the end of the export rather than
repeated after every answer. Every number gets its own definition, so a passage
cited from three answers appears three times. Grouping the numbers under one
definition is tidier to read, but leaves the other labels undefined and an
editor that resolves footnotes then has nothing to jump to.

## How It Works

The extension uses three main components:

- **content.js**: Scans the page for citation markers (using `aria-label` attributes) and extracts chat text
- **popup.js**: Provides the popup interface when clicking the extension icon
- **background.js**: Service worker; the popup talks to the content script directly

### Technical Details

- Built for **Manifest V3** (latest Chrome Extension API)
- Uses **MutationObserver** to detect dynamic content changes
- Automatically expands collapsed citation lists (the "more" control)
- Reads source snippets from the CDK overlay, with no network requests
- Smart fallback mechanisms for text extraction

## What This Fork Changes

### Fixes

- **Works on `notebook.google.com`.** Google moved NotebookLM off
  `notebooklm.google.com`, and the extension matched only the old hostname, so
  the content script was never injected and the popup refused to run. Both hosts
  are now matched.
- **Collapsed citations are no longer dropped.** Auto-expand looked for a `...`
  text span, but collapsed lists now hide behind a "more" icon button, so it
  never fired and those citations vanished from exports silently. On a test
  notebook this was 12 of 96 citations. Lists now expand on the page as it
  loads, and again before an export.
- **Citation numbers no longer collide between answers.** Numbering restarts at
  1 in every answer, and the old page-wide map overwrote entries across them —
  four answers numbering 1-42, 1-18, 1-27 and 1-9 collapsed into 40 entries.
  Citations are now scoped per answer, and renumbered consecutively on export.
- **Copied text is no longer duplicated.** Overlapping paragraph selectors
  matched both a wrapper and the paragraphs inside it, so every paragraph was
  emitted twice.
- **Headings no longer run into the following paragraph**, and Material icon
  ligatures (`more_horiz`, `thumb_up`) no longer land mid-sentence.
- **The service worker no longer throws on load.** It called
  `chrome.contextMenus` and `chrome.scripting` without either permission
  declared, so both were `undefined` and the error aborted the script.

### New Features

- **Source snippets.** The passage NotebookLM reveals when you hover a citation
  is now pulled into copies and exports.
- **Markdown output**, preserving the page's headings, lists, blockquotes, and
  bold/italic instead of flattening everything into plain paragraphs.
- **Real Markdown footnotes** — `[^1]` in the body resolving to `[^1]:`
  definitions.
- **Four snippet styles**, chosen at export time and remembered: filenames only,
  footnotes per answer, full snippet inline, or a short inline quote plus
  footnotes.
- **Exchange selection.** Pick which questions to include; all by default.
- **A single sources block** at the end of the export, instead of one after
  every answer.
- **Per-answer grouping** in the popup's citation list.

## Known Limitations

- The citation mapping relies on NotebookLM's DOM structure, `aria-label`
  attributes, and the class names on its citation tooltip
- May break if Google significantly changes NotebookLM's interface
- Chat text extraction uses heuristics and may occasionally miss content
- Reading source snippets requires revealing each citation in turn, which takes
  a few seconds on a long notebook (about 20 seconds for 84 citations)

## Contributing

Contributions are welcome! If you encounter issues or have ideas for improvements:

1. Open an issue describing the problem or feature request
2. Submit a pull request with your changes

## Credits

- Original concept and implementation: [@nicremo](https://github.com/nicremo)
- Major refactoring and improvements: [@DerSchiman](https://github.com/DerSchiman) (Ron Schimanski) - Huge thanks for making this project possible by completely rewriting the citation extraction logic and making it actually work!
- This fork: [@thisbailiwick](https://github.com/thisbailiwick) — see [What This Fork Changes](#what-this-fork-changes)

## License

This project is open source and available for anyone to use and modify.
