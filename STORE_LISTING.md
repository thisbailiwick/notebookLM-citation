# Chrome Web Store Listing

## Extension Name
**NotebookLM Citation Mapper**

## Short Description (132 characters max)
Export NotebookLM chats as Markdown with real footnotes, carrying the quoted source passage behind every citation.

## Detailed Description

**Never lose track of your sources again when copying from Google NotebookLM!**

NotebookLM Citation Mapper helps you preserve citation references when copying text from your NotebookLM conversations. Instead of losing all citation numbers, this extension automatically extracts them, pulls in the source passage behind each one, and hands you a Markdown document with working footnotes.

### ✨ Key Features

**📄 Markdown Export with Real Footnotes**
- Extract full chat responses with citations preserved as [^1] footnote references
- Headings, lists, blockquotes, and bold/italic survive the copy
- Collects every source into one block at the end
- Perfect for research papers, reports, and documentation

**💬 Source Snippets**
- Pulls the quoted passage NotebookLM shows when you hover a citation
- Choose how much appears: filenames only, footnotes, or the full quote inline
- Read straight from the page, with no network requests

**✅ Choose What to Export**
- Tick the questions you want; all are included by default
- Citation numbers renumber consecutively across whatever you pick

**🔍 Smart Citation Mapping**
- Automatically scans NotebookLM pages for citation references
- Maps citation numbers to full source filenames
- Updates automatically as new content loads

**📋 Citation Legend Export**
- Copy just the citation mappings if you prefer
- Clean, formatted output ready to paste anywhere

**📝 Rich Text and PDF**
- Copy as HTML for pasting straight into a document
- Or download the whole conversation as a PDF

**🔄 Manual Rescan**
- Refresh citation mappings on demand
- Ensures you always have the latest source information

### 🎯 How It Works

1. Open any notebook in Google NotebookLM (notebook.google.com)
2. The extension automatically scans for citations
3. Click the extension icon to see all detected citations
4. Click "Copy Text with Sources" to get your formatted Markdown

### 📊 Output Format

Your copied text will look like this:

```markdown
## Exchange 1

**Question**

> What does the research show?

**Answer**

The research shows significant improvement[^1]. Multiple studies confirm
this finding[^2][^3].

---

## Sources

[^1]: Research_Paper_2024.pdf
> Subjects improved by a mean of 34% over the twelve week trial.

[^2]: Study_Results.docx
> The effect held across all three cohorts.
```

### 🔒 Privacy First

- **No data collection**: Everything processes locally in your browser
- **No external servers**: Nothing is ever transmitted anywhere
- **Stored on your device**: Settings, and a history of your last 100 copies, which you can clear from the settings page at any time
- **Open source**: Full code available on GitHub
- Read our complete privacy policy: https://github.com/thisbailiwick/notebookLM-citation/blob/main/PRIVACY_POLICY.md

### 💪 Perfect For

- Students writing research papers
- Researchers tracking sources
- Content creators citing references
- Anyone who needs to preserve citation information

### 🛠️ Technical Details

- Built with Manifest V3 (latest Chrome extension standard)
- Works on both notebook.google.com and the older notebooklm.google.com
- Works seamlessly with NotebookLM's interface
- Reading source snippets takes a few seconds on a long notebook, since each
  citation has to be revealed in turn

### 📝 Requirements

- Google Chrome or Chromium-based browser
- Access to Google NotebookLM
- That's it!

### 🤝 Open Source

This extension is open source and welcomes contributions:
GitHub: https://github.com/thisbailiwick/notebookLM-citation

### 💬 Support

Having issues? Need a feature?
- Report bugs on GitHub: https://github.com/thisbailiwick/notebookLM-citation/issues
- View source code and documentation

### ⭐ Credits

Created by the NotebookLM community to make research and citation management
easier. This is a fork of nicremo/notebookLM-citation.

---

**Note:** This is an independent extension and is not affiliated with, endorsed by, or officially connected with Google or NotebookLM.

## Category
**Productivity**

## Language
English (Deutsch optional)

## Tags/Keywords
- notebooklm
- citations
- research
- clipboard
- productivity
- sources
- references
- academic
- note-taking

## Promotional Images Required

### Small Tile (440x280)
- Extension icon with "NotebookLM Citation Mapper" text
- Clean design showing citation numbers

### Large Tile (920x680)
- Before/After comparison
- Show text without citations vs. with citations preserved

### Marquee (1400x560)
- Full feature showcase
- Show the extension in action within NotebookLM

### Screenshots (1280x800 or 640x400) - Need 1-5
1. **Main popup interface** - Show the citation mappings list
2. **Copied output example** - Show formatted text with sources
3. **NotebookLM integration** - Show extension working in NotebookLM
4. **Citation legend** - Show the mapping display
5. **Settings/options** (if any)

## Version
1.3.0

## What's New in This Version
- Works on Google's new notebook.google.com address
- Markdown export with real footnotes ([^1] resolving to [^1]:)
- Source snippets: the quoted passage behind each citation, in four styles
- Pick which questions to export
- Citation numbers renumber consecutively instead of restarting each answer
- Collapsed citation lists now expand, so hidden citations stop being dropped
- Fixed duplicated text when copying

## Developer Information
- **Developer Name:** Your Name/Organization
- **Website:** https://github.com/thisbailiwick/notebookLM-citation
- **Email:** Your support email
- **Privacy Policy URL:** https://github.com/thisbailiwick/notebookLM-citation/blob/main/PRIVACY_POLICY.md
