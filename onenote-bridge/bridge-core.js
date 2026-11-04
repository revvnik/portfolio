/* OneNote to Obsidian access test v0.1.0. MIT. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('turndown'), require('turndown-plugin-gfm'));
  } else {
    root.OneNoteBridgeCore = factory(root.TurndownService, root.turndownPluginGfm);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TurndownService, gfm) {
  'use strict';
  const MAX_URI_LENGTH = 16000; // Conservative test safeguard, not an iOS platform guarantee.
  function cleanLabel(value) {
    return String(value || '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim();
  }
  function safeLink(href) {
    return /^(https?:|mailto:|onenote:)/i.test(String(href || '').trim());
  }
  function createConverter() {
    const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    converter.use(gfm.gfm);
    converter.remove(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input']);
    converter.addRule('safeLinks', {
      filter: 'a',
      replacement: function (content, node) {
        const href = (node.getAttribute('href') || '').trim();
        return safeLink(href) ? '[' + content + '](<' + href.replace(/[<>\r\n]/g, '') + '>)' : content;
      }
    });
    converter.addRule('omittedImages', {
      filter: 'img',
      replacement: function () { return '[Image omitted from this text-only test]'; }
    });
    converter.addRule('omittedAttachments', {
      filter: function (node) { return node.nodeName === 'A' && /^data:/i.test(node.getAttribute('href') || ''); },
      replacement: function (content) { return content + ' [Attachment omitted from this test]'; }
    });
    return converter;
  }
  function toMarkdown(snapshot) {
    if (!snapshot || !snapshot.page || !Array.isArray(snapshot.blocks)) throw new Error('No page snapshot to convert.');
    const converter = createConverter();
    const warnings = new Set(snapshot.warnings || []);
    let paragraphCount = 0;
    function omitted(type) {
      const label = /^(Image|Ink)$/i.test(type) ? type : 'Unsupported object';
      warnings.add('Images, handwriting and attachments are omitted in this text-only test.');
      return '[' + label + ' omitted from this test]';
    }
    function paragraph(node) {
      paragraphCount++;
      let text = '';
      if (node.type === 'RichText') {
        if (/<img\b|<object\b|<embed\b|href\s*=\s*["']?data:/i.test(node.html || '')) {
          warnings.add('Images, handwriting and attachments are omitted in this text-only test.');
        }
        text = converter.turndown(String(node.html || ''));
      } else if (node.type === 'Table') {
        const rows = node.rows || [];
        const width = rows.reduce(function (n, row) { return Math.max(n, row.length); }, 0);
        if (width) {
          function row(values) { return '| ' + values.join(' | ') + ' |'; }
          const lines = [row(Array(width).fill('')), row(Array(width).fill('---'))];
          rows.forEach(function (cells) {
            const values = Array.from({ length: width }, function (_, i) {
              return (cells[i] || []).map(paragraph).join('\n\n').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
            });
            lines.push(row(values));
          });
          text = lines.join('\n');
        }
      } else { text = omitted(node.type); }
      const children = (node.children || []).map(paragraph).filter(Boolean);
      return [text].concat(children).filter(Boolean).join('\n\n');
    }
    const content = snapshot.blocks.map(function (block) {
      return block.type === 'Outline' ? block.paragraphs.map(paragraph).join('\n\n') : omitted(block.type);
    }).filter(Boolean).join('\n\n');
    const metadata = [
      '---', 'source: OneNote', 'import_kind: read-only-access-test',
      'onenote_page_id: ' + JSON.stringify(String(snapshot.page.id || '')),
      'onenote_notebook: ' + JSON.stringify(String(snapshot.notebook.name || '')),
      'onenote_section: ' + JSON.stringify(String(snapshot.section.name || '')),
      '---', '', '# ' + converter.escape(cleanLabel(snapshot.page.title) || 'Untitled OneNote page'), ''
    ];
    const warningText = warnings.size ? '> Test limitations: ' + Array.from(warnings).join(' ') + '\n\n' : '';
    return { markdown: metadata.join('\n') + '\n' + warningText + (content || '_No supported page text found._') + '\n',
      warnings: Array.from(warnings), paragraphCount: paragraphCount, hasContent: Boolean(content) };
  }
  function fileBase(title) {
    return cleanLabel(title).replace(/[\\/:*?"<>|#^\[\]]/g, '-').replace(/^\.+|\.+$/g, '').slice(0, 80).trim() || 'Untitled page';
  }
  function buildHandoff(options) {
    const vault = String(options.vault || '').trim();
    if (!vault) return { uri: null, reason: 'Enter the exact Obsidian vault name first.' };
    if (!String(options.markdown || '').trim()) return { uri: null, reason: 'Read a page first.' };
    const suffix = cleanLabel(options.suffix || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!suffix) throw new Error('A unique test note suffix is required.');
    const name = 'OneNote Test/' + fileBase(options.title) + ' ' + suffix;
    const query = new URLSearchParams({ vault: vault, name: name, content: options.markdown });
    const uri = 'obsidian://new?' + query.toString();
    if (uri.length > MAX_URI_LENGTH) return { uri: null, name: name,
      reason: 'This page is too large for the test link. Use Copy Markdown or Save / share .md.' };
    return { uri: uri, name: name, reason: '' };
  }
  return { toMarkdown: toMarkdown, buildHandoff: buildHandoff, fileBase: fileBase, MAX_URI_LENGTH: MAX_URI_LENGTH };
});
