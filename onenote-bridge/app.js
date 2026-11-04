(function () {
  'use strict';
  const byId = function (id) { return document.getElementById(id); };
  const readButton = byId('read-page');
  const hostLabel = byId('host-label');
  const statusText = byId('status-text');
  const diagnostics = { version: '0.1.0', host: 'waiting', platform: '', api: 'unknown', lastRead: 'not run' };
  let snapshot = null;
  let exported = null;
  let suffix = '';
  let ready = false;
  function showDiagnostics() { byId('diagnostics').textContent = Object.keys(diagnostics).map(function (key) { return key + ': ' + diagnostics[key]; }).join('\n'); }
  function setStatus(label, text) { hostLabel.textContent = label; statusText.textContent = text; }
  function newSuffix() {
    const bytes = new Uint8Array(6);
    window.crypto.getRandomValues(bytes);
    return new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + '-' + Array.from(bytes, function (n) { return n.toString(16).padStart(2, '0'); }).join('');
  }
  function updateHandoff() {
    const link = byId('open-obsidian');
    if (!exported) return;
    const handoff = window.OneNoteBridgeCore.buildHandoff({ vault: byId('vault').value, markdown: exported.markdown, title: snapshot.page.title, suffix: suffix });
    link.setAttribute('aria-disabled', String(!handoff.uri));
    if (handoff.uri) link.setAttribute('href', handoff.uri); else link.removeAttribute('href');
    byId('handoff-hint').textContent = handoff.reason || 'Creates a new note in OneNote Test. If Office blocks opening Obsidian, use Copy Markdown or Save / share .md.';
  }
  function clearExport() {
    snapshot = null; exported = null;
    byId('result').hidden = true;
    byId('markdown').value = '';
    byId('open-obsidian').removeAttribute('href');
    byId('action-status').textContent = '';
  }
  readButton.addEventListener('click', async function () {
    if (!ready || readButton.disabled) return;
    clearExport(); readButton.disabled = true;
    readButton.textContent = 'Reading page…';
    setStatus('Reading current page', 'Keep this OneNote page open until the read finishes. Nothing is being changed.');
    try {
      const current = await window.OneNoteBridgeReader.readActivePage(window.OneNote);
      const converted = window.OneNoteBridgeCore.toMarkdown(current);
      snapshot = current; exported = converted; suffix = newSuffix();
      byId('markdown').value = converted.markdown;
      byId('page-info').textContent = [current.notebook.name, current.section.name, current.page.title || 'Untitled page'].join(' / ');
      byId('export-warning').hidden = !converted.warnings.length;
      byId('export-warning').textContent = converted.warnings.join(' ');
      byId('result').hidden = false;
      diagnostics.lastRead = 'success (' + converted.paragraphCount + ' paragraphs)';
      delete diagnostics.errorCode;
      setStatus('OneNote access works', converted.hasContent ? 'The current page was read. Review the Markdown, then try the Obsidian handoff.' : 'The page was read, but no supported text was found. Try a page with typed text.');
      updateHandoff();
    } catch (error) {
      diagnostics.lastRead = 'failed'; diagnostics.errorCode = error.code || error.name || 'Error';
      setStatus('Could not read page', String(error.message || error));
    } finally {
      showDiagnostics(); readButton.disabled = !ready; readButton.textContent = 'Read current page';
    }
  });
  byId('vault').addEventListener('input', updateHandoff);
  byId('open-obsidian').addEventListener('click', function (event) {
    if (!this.hasAttribute('href')) { event.preventDefault(); return; }
    byId('action-status').textContent = 'Handoff requested. Check Obsidian for the new note. Return here if it did not open.';
    // Every subsequent handoff gets a new name and cannot replace an earlier test note.
    window.setTimeout(function () { suffix = newSuffix(); updateHandoff(); }, 0);
  });
  byId('copy-markdown').addEventListener('click', async function () {
    if (!exported) return;
    try {
      await navigator.clipboard.writeText(exported.markdown);
      byId('action-status').textContent = 'Markdown copied. Paste it into a new Obsidian note.';
    } catch (_) {
      byId('markdown').focus(); byId('markdown').select();
      byId('markdown').setSelectionRange(0, byId('markdown').value.length);
      byId('action-status').textContent = 'Clipboard access is blocked here. The Markdown is selected; use Copy, then paste it into Obsidian.';
    }
  });
  byId('save-markdown').addEventListener('click', async function () {
    if (!exported) return;
    const filename = window.OneNoteBridgeCore.fileBase(snapshot.page.title) + '.md';
    const file = new File([exported.markdown], filename, { type: 'text/markdown;charset=utf-8' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        byId('action-status').textContent = 'Share action finished. Check the destination you selected.';
      } else {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        byId('action-status').textContent = 'Download requested. If Office blocks it, use Copy Markdown.';
      }
    } catch (error) {
      byId('action-status').textContent = error.name === 'AbortError' ? 'Sharing cancelled.' : 'Sharing is blocked here. Use Copy Markdown instead.';
    }
  });
  function officeReady(info) {
    diagnostics.host = String(info.host || 'unknown'); diagnostics.platform = String(info.platform || 'unknown');
    const isOneNote = diagnostics.host.toLowerCase() === 'onenote';
    const requirements = window.Office.context && window.Office.context.requirements;
    const supported = Boolean(requirements && requirements.isSetSupported('OneNoteApi', '1.1'));
    diagnostics.api = supported ? 'OneNoteApi 1.1 available' : 'OneNoteApi 1.1 unavailable';
    ready = isOneNote && supported && Boolean(window.OneNote && window.OneNote.run);
    readButton.disabled = !ready;
    setStatus(ready ? 'Connected to OneNote' : 'Open inside OneNote on the web', ready ? 'Open your shared notebook and choose a page with a little typed text, then tap Read current page.' : 'Install the XML manifest from the setup page in OneNote. Opening this task pane as a normal website does not give it notebook access.');
    showDiagnostics();
  }
  showDiagnostics();
  if (window.Office && typeof window.Office.onReady === 'function') {
    window.Office.onReady().then(officeReady).catch(function (error) {
      diagnostics.errorCode = error.code || error.name || 'OfficeInitError'; showDiagnostics();
      setStatus('Office could not connect', 'Try reopening the add-in in OneNote on the web.');
    });
  } else {
    diagnostics.host = 'Office.js not loaded'; showDiagnostics();
    setStatus('Open inside OneNote on the web', 'This pane needs the Microsoft Office runtime. Use the setup instructions below to install the XML manifest.');
  }
  window.setTimeout(function () {
    if (diagnostics.host === 'waiting') setStatus('Waiting for OneNote', 'If this is a normal Safari tab, open the setup instructions below. If this is inside OneNote, reopen the add-in and check Diagnostics.');
  }, 8000);
})();
