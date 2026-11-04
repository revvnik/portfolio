/* Read-only Office.js access. No Graph API, authentication tokens or document mutation calls. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OneNoteBridgeReader = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  async function readActivePage(runtime, limits) {
    if (!runtime || typeof runtime.run !== 'function') throw new Error('OneNote runtime is not available. Open this add-in inside OneNote on the web.');
    const maxParagraphs = limits && limits.maxParagraphs || 500;
    const maxDepth = limits && limits.maxDepth || 12;
    return runtime.run(async function (context) {
      const app = context.application;
      const notebook = app.getActiveNotebook();
      const section = app.getActiveSection();
      const page = app.getActivePage();
      notebook.load('id,name'); section.load('id,name'); page.load('id,title');
      const contents = page.contents;
      contents.load('id,type,top,left');
      await context.sync();
      const snapshot = { notebook: { id: notebook.id, name: notebook.name },
        section: { id: section.id, name: section.name }, page: { id: page.id, title: page.title },
        blocks: [], warnings: [] };
      let count = 0;
      const seen = new Set();
      async function readTable(table, depth) {
        const rows = table.rows;
        rows.load('items');
        await context.sync();
        rows.items.forEach(function (row) { row.cells.load('items'); });
        await context.sync();
        const output = [];
        for (const row of rows.items) {
          const cells = [];
          for (const cell of row.cells.items) cells.push(await readParagraphs(cell.paragraphs, depth + 1));
          output.push(cells);
        }
        return output;
      }
      async function readParagraphs(collection, depth, alreadyLoaded) {
        if (depth > maxDepth) throw new Error('This page exceeds the test nesting limit. Try a smaller page. No partial export was produced.');
        if (!alreadyLoaded) { collection.load('id,type'); await context.sync(); }
        const pending = [];
        for (const item of collection.items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          if (++count > maxParagraphs) throw new Error('This page exceeds the ' + maxParagraphs + '-paragraph test limit. Try a smaller page. No partial export was produced.');
          const entry = { item: item, node: { type: String(item.type), children: [] } };
          if (entry.node.type === 'RichText') entry.html = item.richText.getHtml();
          if (entry.node.type !== 'Table') { entry.children = item.paragraphs; entry.children.load('id,type'); }
          pending.push(entry);
        }
        await context.sync();
        const output = [];
        for (const entry of pending) {
          if (entry.html) entry.node.html = entry.html.value;
          if (entry.node.type === 'Table') entry.node.rows = await readTable(entry.item.table, depth);
          if (entry.children && entry.children.items.length) entry.node.children = await readParagraphs(entry.children, depth + 1, true);
          output.push(entry.node);
        }
        return output;
      }
      const ordered = contents.items.slice().sort(function (a, b) { return (a.top - b.top) || (a.left - b.left); });
      for (const item of ordered) {
        if (String(item.type) === 'Outline') snapshot.blocks.push({ type: 'Outline', paragraphs: await readParagraphs(item.outline.paragraphs, 0) });
        else snapshot.blocks.push({ type: String(item.type) });
      }
      const currentPage = app.getActivePage();
      currentPage.load('id');
      await context.sync();
      if (currentPage.id !== snapshot.page.id) throw new Error('The active page changed while reading. Keep the same page open and try again.');
      return snapshot;
    });
  }
  return { readActivePage: readActivePage };
});
