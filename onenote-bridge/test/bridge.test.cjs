const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const core = require('../bridge-core');
const reader = require('../onenote-reader');

function rich(id, html, children = []) { return { id, type: 'RichText', html, children }; }
function sampleSnapshot() {
  return { notebook: { id: 'nb', name: 'Shared notebook' }, section: { id: 's', name: 'IT' },
    page: { id: 'p', title: 'Übung & Netzwerk 👋' }, warnings: [], blocks: [
      { type: 'Outline', paragraphs: [rich('a', '<p><strong>Hallo</strong> &amp; grüße 👋</p>', [rich('b', '<p>Child paragraph</p>')]),
        { type: 'Table', rows: [[[rich('c', '<p>first | cell</p>')], [rich('d', '<p>second</p><p>line</p>')]],
          [[rich('e', '<p>third</p>')], [rich('f', '<p>fourth</p>')]]] }] }, { type: 'Ink' }
    ] };
}

test('rich text, nested content, all table rows and omission markers survive conversion', () => {
  const converted = core.toMarkdown(sampleSnapshot());
  assert.match(converted.markdown, /\*\*Hallo\*\* & grüße 👋/);
  assert.match(converted.markdown, /Child paragraph/);
  assert.match(converted.markdown, /first &#124; cell/);
  assert.match(converted.markdown, /second<br><br>line/);
  assert.match(converted.markdown, /third \| fourth/);
  assert.match(converted.markdown, /Ink omitted/);
  assert.equal(converted.warnings.length, 1);
  assert.equal(converted.paragraphCount, 7);
});

test('HTML scripts, dangerous links and embedded images do not reach Markdown as active content', () => {
  const snapshot = sampleSnapshot();
  snapshot.blocks = [{ type: 'Outline', paragraphs: [rich('a',
    '<p><a href="javascript:alert(1)">bad link</a> <a href="https://example.com?q=ü">good</a></p><script>malicious()</script><img src="https://example.com/private.png" alt="private"><iframe src="https://example.com"></iframe>')] }];
  const result = core.toMarkdown(snapshot);
  assert.match(result.markdown, /bad link/);
  assert.match(result.markdown, /\[good\]\(<https:\/\/example.com\?q=ü>\)/);
  assert.doesNotMatch(result.markdown, /javascript:|malicious|private\.png|iframe/);
  assert.match(result.markdown, /Image omitted/);
});

test('Obsidian handoff preserves exact Unicode text and never enables overwrite', () => {
  const markdown = core.toMarkdown(sampleSnapshot()).markdown + '\n# literal & + ? % ü 👋\n';
  const result = core.buildHandoff({ vault: 'Nikita & Übung 👋', markdown, title: '../Übung: A/B 👋', suffix: '20261104-abcdef' });
  const uri = new URL(result.uri);
  assert.equal(uri.protocol, 'obsidian:');
  assert.equal(uri.hostname, 'new');
  assert.equal(uri.searchParams.get('vault'), 'Nikita & Übung 👋');
  assert.equal(uri.searchParams.get('content'), markdown);
  assert.equal(uri.searchParams.has('overwrite'), false);
  assert.match(uri.searchParams.get('name'), /^OneNote Test\/[^/]+ 20261104-abcdef$/);
  assert.equal(core.buildHandoff({ vault: '', markdown, suffix: 'abc' }).uri, null);
  const large = core.buildHandoff({ vault: 'A', markdown: 'ü'.repeat(10000), title: 'Large', suffix: 'abc' });
  assert.equal(large.uri, null);
  assert.match(large.reason, /too large/);
});

// These mocks enforce Office's queued loads and ClientResult timing. They expose
// only read methods, so an attempted document mutation fails this test.
function mockRuntime({ switchPage = false, failSync = false } = {}) {
  const pending = [];
  const loaded = new WeakMap();
  let pageCalls = 0;
  let syncs = 0;
  function proxy(scalars, navigation = {}) {
    const target = {};
    const fields = new Set(); loaded.set(target, fields);
    Object.keys(scalars).forEach(key => Object.defineProperty(target, key, { get() {
      if (!fields.has(key)) throw new Error('Property read before context.sync: ' + key);
      return scalars[key];
    } }));
    Object.assign(target, navigation);
    target.load = fieldsToLoad => {
      pending.push(() => String(fieldsToLoad).split(',').forEach(field => fields.add(field.trim())));
      return target;
    };
    return Object.freeze(target);
  }
  function collection(items) {
    let available = false;
    return Object.freeze({ load(fields) {
      pending.push(() => { available = true; });
      if (fields !== 'items') items.forEach(item => item.load(fields));
      return this;
    }, get items() { if (!available) throw new Error('Collection read before sync'); return items; } });
  }
  function paragraph(data) {
    const navigation = { paragraphs: collection((data.children || []).map(paragraph)) };
    if (data.type === 'RichText') navigation.richText = Object.freeze({ getHtml() {
      let resolved = false;
      pending.push(() => { resolved = true; });
      return { get value() { if (!resolved) throw new Error('ClientResult read before sync'); return data.html; } };
    } });
    if (data.type === 'Table') navigation.table = { rows: collection(data.rows.map(row => ({ cells: collection(row.map(cell => ({ paragraphs: collection(cell.map(paragraph)) }))) }))) };
    return proxy({ id: data.id, type: data.type }, navigation);
  }
  const input = sampleSnapshot();
  input.blocks[0].paragraphs[1].id = 'table';
  const blocks = input.blocks.map((block, i) => proxy({ id: 'block' + i, type: block.type, top: i * 100, left: 0 },
    block.type === 'Outline' ? { outline: { paragraphs: collection(block.paragraphs.map(paragraph)) } } : {}));
  const page = proxy({ id: 'page-original', title: input.page.title }, { contents: collection(blocks) });
  const changed = proxy({ id: 'page-changed', title: 'Other' });
  const notebook = proxy({ id: 'nb', name: input.notebook.name });
  const section = proxy({ id: 's', name: input.section.name });
  const context = { application: Object.freeze({ getActiveNotebook: () => notebook, getActiveSection: () => section,
    getActivePage: () => (++pageCalls > 1 && switchPage ? changed : page) }),
    async sync() { syncs++; if (failSync) throw Object.assign(new Error('Host denied read'), { code: 'AccessDenied' });
      const queue = pending.splice(0); queue.forEach(fn => fn()); } };
  return { async run(callback) { return callback(context); }, get syncs() { return syncs; } };
}

test('reader traverses loaded Office objects and returns a plain nested snapshot', async () => {
  const runtime = mockRuntime();
  const snapshot = await reader.readActivePage(runtime);
  assert.equal(snapshot.notebook.name, 'Shared notebook');
  assert.equal(snapshot.page.id, 'page-original');
  assert.equal(snapshot.blocks[0].paragraphs[0].children[0].html, '<p>Child paragraph</p>');
  assert.equal(snapshot.blocks[0].paragraphs[1].rows[1][1][0].html, '<p>fourth</p>');
  assert.equal(snapshot.blocks[1].type, 'Ink');
  assert.ok(runtime.syncs > 3);
  assert.doesNotMatch(JSON.stringify(snapshot), /load|context|richText/);
  assert.match(core.toMarkdown(snapshot).markdown, /fourth/);
});

test('changed active page, host errors and size limits fail instead of producing partial success', async () => {
  await assert.rejects(reader.readActivePage(mockRuntime({ switchPage: true })), /active page changed/);
  await assert.rejects(reader.readActivePage(mockRuntime({ failSync: true })), { code: 'AccessDenied' });
  await assert.rejects(reader.readActivePage(mockRuntime(), { maxParagraphs: 2 }), /No partial export/);
  await assert.rejects(reader.readActivePage(null), /not available/);
});

function uiFixture(read) {
  const html = fs.readFileSync(path.join(__dirname, '../taskpane.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://revvnik.com/onenote-bridge/taskpane.html', pretendToBeVisual: true });
  const win = dom.window;
  win.Office = { onReady: async () => ({ host: 'OneNote', platform: 'OfficeOnline' }), context: { requirements: { isSetSupported: () => true } } };
  win.OneNote = { run: () => {} };
  win.OneNoteBridgeCore = core;
  win.OneNoteBridgeReader = { readActivePage: read };
  win.eval(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'));
  return dom;
}
async function settle() { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); }

test('UI shows real success only after a read and removes stale results on subsequent failure', async () => {
  let calls = 0;
  const dom = uiFixture(async () => { if (++calls === 2) throw Object.assign(new Error('Denied by host'), { code: 'AccessDenied' }); return sampleSnapshot(); });
  try {
    await settle();
    const doc = dom.window.document;
    assert.equal(doc.getElementById('result').hidden, true);
    doc.getElementById('read-page').click(); await settle();
    assert.equal(doc.getElementById('result').hidden, false);
    assert.equal(doc.getElementById('host-label').textContent, 'OneNote access works');
    assert.equal(doc.getElementById('open-obsidian').hasAttribute('href'), false);
    doc.getElementById('vault').value = 'Test Vault';
    doc.getElementById('vault').dispatchEvent(new dom.window.Event('input'));
    assert.match(doc.getElementById('open-obsidian').href, /^obsidian:\/\/new\?/);
    doc.getElementById('read-page').click(); await settle();
    assert.equal(doc.getElementById('result').hidden, true);
    assert.equal(doc.getElementById('markdown').value, '');
    assert.equal(doc.getElementById('open-obsidian').hasAttribute('href'), false);
    assert.equal(doc.getElementById('host-label').textContent, 'Could not read page');
    assert.match(doc.getElementById('diagnostics').textContent, /AccessDenied/);
    assert.doesNotMatch(doc.getElementById('diagnostics').textContent, /Shared notebook|Übung/);
  } finally { dom.window.close(); }
});

test('outside Office, the UI never enables document access', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../taskpane.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/' });
  try {
    dom.window.eval(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'));
    assert.equal(dom.window.document.getElementById('read-page').disabled, true);
    assert.match(dom.window.document.getElementById('host-label').textContent, /Open inside OneNote/);
  } finally { dom.window.close(); }
});

test('vendored browser builds expose the same working conversion as the Node build', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  try {
    for (const file of ['vendor/turndown.js', 'vendor/turndown-plugin-gfm.js', 'bridge-core.js']) {
      dom.window.eval(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
    }
    const converted = dom.window.OneNoteBridgeCore.toMarkdown(sampleSnapshot());
    assert.equal(converted.markdown, core.toMarkdown(sampleSnapshot()).markdown);
    const handoff = dom.window.OneNoteBridgeCore.buildHandoff({ vault: 'ü', title: 'Test', markdown: converted.markdown, suffix: 'abc' });
    assert.equal(new URL(handoff.uri).searchParams.get('vault'), 'ü');
  } finally { dom.window.close(); }
});
