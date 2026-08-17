# Catchpoint

A free, open-source Firefox extension for catching and rewriting HTTP requests
before they reach the origin server — no rule limits, no paywall.

Built on Firefox's blocking `webRequest` API (Manifest V2), which lets an
extension synchronously inspect and alter a request in flight.

## Two modes, per rule

Every rule picks one of two modes:

- **Request adjustment** (default) — the rule applies its action automatically,
  every time it matches: modify headers, redirect, mock a response, delay, or
  block.
- **Live capture** — the rule instead *pauses* a matching request right before
  it's sent, and opens a **Live Queue** window where you can inspect and edit
  its headers by hand, then choose **send** or **cancel**. Only the request
  side is editable this way (headers only) — Firefox's extension APIs don't
  allow rewriting the URL, method, or body of a request that's already in
  flight without a native messaging host. A paused request auto-releases
  after 2 minutes so it can't hang a page forever if you forget about it.

## Features

- **Modify headers** — set or remove request/response headers
- **Redirect** — rewrite a request to a different URL
- **Mock response** — short-circuit a request and return a fixed body (great for
  offline dev or testing error states)
- **Delay** — simulate slow networks
- **Block** — cancel a request outright
- **Live capture** — pause and hand-edit a request's headers before it sends
- Rules run in order, **first match wins** — reorder with the ▲▼ buttons
- Each rule has a clear on/off toggle switch, independent of the global breaker
- **Import/export** rules as plain JSON — share a "recipe" with your team,
  no account or cloud sync required
- A live popup log of every request a rule has touched

## Install (development mode)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` file in this folder

The extension will stay loaded until you restart Firefox. For a permanent
install, it needs to be signed by Mozilla (`web-ext sign`) or installed from
addons.mozilla.org once published.

## Usage

1. Click the Catchpoint icon → flip the breaker switch **ON**
2. Open **Open rule editor** to create a rule:
   - Pick a match mode (`contains`, `glob`, or `regex`) and a URL pattern
   - Pick an action (headers / redirect / mock / delay / block)
3. Browse — matching requests show up in the popup log in real time

## Known limitations (v0.1)

- Mock responses always return HTTP 200 — a data-URL is used to short-circuit
  the request, and data URLs don't support custom status codes. Fixing this
  properly requires either `filterResponseData` (streaming rewrite of a real
  response) or a native messaging host.
- No request/response **body** editing yet for real (non-mocked) requests.
- Manifest V2 only — this relies on *blocking* `webRequest`, which Firefox
  still supports but Chrome's Manifest V3 removed. Not a Chrome port (yet).

## Project layout

```
manifest.json         Extension manifest (MV2)
background.js          webRequest listeners, rule matching, request log, live-pause queue
rule-engine.js          Pure matching/action logic (no browser APIs)
options.html/js/css     Full rule editor UI (light theme)
popup.html/js/css        Quick toggle + live request log
live.html/js/css          Live Queue window: review/edit paused requests
```

## Contributing

Rule schema lives in `rule-engine.js` and is intentionally plain JSON so it's
easy to extend. PRs welcome for: body rewriting via `filterResponseData`,
per-tab rule scoping, and a Chromium build (would need to drop blocking
webRequest for `declarativeNetRequest`, which is a bigger rework).

## License

MIT
