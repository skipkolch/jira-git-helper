# Jira Git Helper

Chrome extension that adds a small floating panel to Jira issue pages
(`https://cloud.atlassian.net/browse/*`) with two buttons:

- **Copy branch name** — `feature/{KEY}-{summary-slug}`
- **Copy commit message** — `{KEY} {summary}`

Example for [PRODUCT]
(summary: `[PRODUCT] Create APIs`):

- Branch: `feature/RMS-85-create-apis`
- Commit: `RMS-85 [BAF] Create APIs`

## Install (unpacked, dev mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open any issue on `cloud.atlassian.net` — the panel appears in the
   bottom-right corner.

## How it works

The content script reads the issue key from the URL and fetches the summary
via Jira's own REST API (`/rest/api/3/issue/{key}?fields=summary`), using the
existing browser session — no extra permissions or auth needed. It re-checks
the URL every 500ms so the panel also updates when navigating between issues
inside Jira's single-page app (no full reload).

## Notes

- Scoped to `serenitycloud.atlassian.net` only.
- If the summary starts with a `[TAG]`, it's kept as-is in the
  commit message but stripped from the branch slug.
- Branch names are capped at 72 characters; long summaries are truncated at a
  word boundary so the branch name stays usable in git/CI.
- Drag the panel by its header to move it anywhere on screen, and use the
  `−` / `▢` button to hide or show it. Position and hidden state are saved
  in `localStorage` and restored on every Jira page you open.
