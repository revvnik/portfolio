# OneNote to Obsidian: document API access test

Read-only Office.js task pane for OneNote on the web. The first test reads one active page from an already-open shared notebook, converts its text and tables to Markdown in the browser, and offers Obsidian's built-in `obsidian://new` action plus clipboard/file fallbacks.

Production setup: https://revvnik.com/onenote-bridge/

The static public assets are deployed in `revvnik/portfolio` under `onenote-bridge/`. There is no backend, OAuth registration, Graph access token, API key or notebook content in this repository. Office.js is loaded from Microsoft's canonical hosted URL. The manifest GUID is an Office add-in ID, not an Entra app registration.

## Important limits

- This is a manual access and handoff test, not automatic or bidirectional sync.
- The user must upload the XML manifest inside OneNote on the web. Their organization may prohibit custom add-ins, and the iPad web editor may not expose the sideload menu.
- OneNote's APIs require `ReadWriteDocument` even for read operations. This implementation only uses document read methods. It never calls document mutation APIs.
- Only the active page is read. It must stay open during the read. Supported text is converted with Turndown 7.2.2 and turndown-plugin-gfm 1.0.2, vendored with their licenses.
- Images, handwriting and attachments are not exported. Visible markers identify omitted objects. Freeform placement and nested list formatting do not round-trip.
- Reads fail explicitly past 500 paragraphs or 12 levels of nesting instead of silently exporting a truncated page.
- Obsidian handoff is limited to 16,000 URI characters as a conservative test safeguard. Larger pages can be copied or saved as `.md`. The actual working URI size and custom-scheme navigation depend on the browser and Office iframe sandbox.
- No page content is logged, persisted or sent to a bridge endpoint. A chosen `obsidian://new` link carries Markdown locally to Obsidian. The bridge creates unique note names without the overwrite option.
- The host mock tests are not proof of real Microsoft tenant, shared notebook or iPad compatibility.

## Verification

From this project directory: `npm ci` then `npm test`.

Tests exercise client-result synchronization, read-only extraction, nested paragraphs and table cells, active-page changes, truncation failure, Markdown conversion, unsafe links, Unicode handoff encoding and UI failure states. The UI can also be inspected as a normal static page; outside Office it must not claim document access.

Run Microsoft's official manifest validator with `npx office-addin-manifest validate OneNote-Obsidian-Test.xml`.

## Documentation

- https://learn.microsoft.com/en-us/office/dev/add-ins/onenote/onenote-add-ins-programming-overview
- https://learn.microsoft.com/en-us/office/dev/add-ins/onenote/onenote-add-ins-page-content
- https://learn.microsoft.com/en-us/office/dev/add-ins/develop/requesting-permissions-for-api-use-in-content-and-task-pane-add-ins
- https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-office-add-ins-for-testing
- https://help.obsidian.md/Extending+Obsidian/Obsidian+URI

Custom bridge code: MIT license. Third-party licenses are in `vendor/`.
