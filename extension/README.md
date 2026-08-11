# NotebookLM Citation Mapper

> Fork of [nicremo/notebookLM-citation](https://github.com/nicremo/notebookLM-citation).
> The full list of changes is in the [root README](../README.md#what-this-fork-changes).

A Chrome extension that preserves citation references when copying chat text from Google NotebookLM.

## Overview

When you copy text from NotebookLM's chat interface, the citation numbers (like [1], [2], etc.) are included, but without context about which sources they refer to. This extension automatically maps those citation numbers to their corresponding source filenames, making your copied text complete and useful.

## Features

- **Automatic Citation Mapping**: Automatically detects and maps citation numbers to source document names
- **Markdown Output**: Copies as Markdown, preserving headings, lists, and bold/italic from the page
- **Source Snippets**: Pulls the quoted passage behind each citation into your copies and exports
- **Consecutive Numbering**: Citation numbers run consecutively across the export, not restarting at 1 in every answer
- **Deduplicated Sources**: One sources block per export, each passage listed once with every number citing it
- **Copy with Sources**: Copy chat text with citation sources appended at the bottom
- **Draggable Legend Window**: Shows a real-time citation map directly on the NotebookLM page
- **Smart Citation Expansion**: Clicks the "more" control on collapsed citation lists so hidden citations are captured
- **Select What to Export**: Choose which exchanges to include; all are selected by default
- **Popup Interface**: Quick access to citation mappings and controls
- **Auto-Rescan**: Monitors page changes and updates mappings automatically
- **Customizable Formatting**: Configure how citations and sources appear in copied text
- **Export/Import**: Save and restore citation mappings
- **Statistics & History**: Track your citation usage and copy history
- **Theme Support**: Light, dark, and auto themes available

## How It Works

1. The extension injects a content script into NotebookLM pages
2. It scans the page for citation references and source documents
3. A mapping is created between citation numbers and source filenames
4. When you copy text, the extension adds the source list at the bottom
5. The mapping updates automatically as you interact with NotebookLM

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `extension` folder
5. The extension is now installed and ready to use

## Usage

### Basic Usage

1. Navigate to Google NotebookLM (https://notebook.google.com — the old
   https://notebooklm.google.com address redirects here)
2. Open a notebook and start a chat
3. Click the extension icon to see current citation mappings
4. Copy text from the chat - citations will be automatically included

### Markdown Output

Copied text is Markdown. The page's own structure is preserved rather than
flattened: headings stay headings, bulleted lists stay lists, and **bold** and
*italic* runs survive. Each exchange is labelled so it is clear what is what:

```markdown
# NotebookLM Export

*Exported 2026-08-11 · 8 exchanges · 84 citations*

---

## Exchange 1

**Question**

> How does he deal with nonduality?

**Answer**

### How He Presents Nonduality

Jeff Foster presents nonduality as **an ordinary, ever-present reality**[^1].

- **The Ocean and the Waves:** his foundational metaphor[^4][^5].

---

## Sources

[^1]: The Deepest Acceptance - Jeff Foster.epub — also [^18], [^43]
> The spiritual awakening I talk about in this book is not about
> protecting yourself more.

[^18]: See [^1].
[^43]: See [^1].
```

Citations are real Markdown footnotes: `[^1]` in the body resolves to a
`[^1]:` definition. Because footnote labels have to be unique across a
document, citation numbers are renumbered consecutively over whatever you
export — NotebookLM restarts them at 1 in every answer, so the second answer
picks up where the first left off rather than colliding with it.

Sources are gathered into one block at the end of the export. Every occurrence
in the body keeps its own number, but a passage cited from several answers is
written out once, carrying all of its numbers. Since Markdown allows only one
definition per label, the first number holds the source and the rest get a
one-line stub pointing at it, so every reference in the body still resolves.

PDF export uses a plain-text version of the same document, since Markdown
syntax would only be literal noise on the page.

### Choosing What to Export

When a notebook has more than one exchange, the popup lists them with
checkboxes. Everything is selected by default; uncheck an exchange to leave it
out. Citation numbering and the snippet harvest both follow the selection, so
exporting one exchange numbers its citations from 1.

### Source Snippets

NotebookLM shows the quoted source passage when you hover a citation number. That
text is already in the page, so the extension can read it without any network
request. Pick how it appears using **Source snippets in exports** in the popup:

| Option | Body text | Sources block |
| --- | --- | --- |
| Citation numbers only | `[1]` | filename only |
| Footnotes at the end | `[1]` | filename + full snippet |
| Full snippet inline | `[1: file — "…"]` | none |
| Short inline + footnotes | `[1: "…"]` | filename + full snippet |

The choice is remembered and applies to plain copy, rich text copy, and PDF
export alike. Anything other than "Citation numbers only" has to reveal every
citation on the page to read its snippet, which takes a few seconds on a long
notebook; progress is shown in the popup while it runs.

### Legend Window

- A draggable window appears on the page showing the citation map
- Click and drag to reposition it
- Minimize/maximize using the controls
- Resize by dragging the corners
- Copy the entire mapping with one click

### Settings Page

Access advanced features through the settings icon:

- **Theme Settings**: Choose light, dark, or auto theme
- **Auto-Features**: Configure auto-rescan and notifications
- **Format Options**: Customize citation and source formatting
- **Export/Import**: Save and restore your citation mappings
- **History**: View your copy history
- **Statistics**: See usage statistics and most referenced sources

## Privacy

All citation processing happens locally in your browser. No data is sent to external servers. Your citation mappings and settings are stored locally using Chrome's storage API.

## Technical Details

- **Manifest Version**: 3
- **Permissions**: activeTab, clipboardWrite, storage
- **Host Permissions**: https://notebook.google.com/*, https://notebooklm.google.com/*
- **Background**: Service worker for state management
- **Content Scripts**: Injected at document_idle

## Support

For issues, feature requests, or questions, please visit the GitHub repository.

## License

This project is provided as-is for personal and educational use.
