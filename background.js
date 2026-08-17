/**
 * background.js
 * Owns: current rule set (mirrored from storage), the live request log,
 * and the three webRequest listeners that do the actual interception.
 */

const MAX_LOG_ENTRIES = 300;
const LIVE_TIMEOUT_MS = 120000; // auto-release a paused request after 2 min

let pendingRequests = new Map(); // id -> { resolve, url, method, requestHeaders, ruleName, time, timer }
let liveQueueWindowId = null;

function uid() {
  return "p_" + Math.random().toString(36).slice(2, 10);
}

async function openOrFocusLiveQueue() {
  if (liveQueueWindowId != null) {
    try {
      await browser.windows.update(liveQueueWindowId, { focused: true });
      return;
    } catch (e) {
      liveQueueWindowId = null; // window was closed, fall through to recreate
    }
  }
  const win = await browser.windows.create({
    url: browser.runtime.getURL("live.html"),
    type: "popup",
    width: 480,
    height: 640,
  });
  liveQueueWindowId = win.id;
}

browser.windows.onRemoved.addListener((id) => {
  if (id === liveQueueWindowId) liveQueueWindowId = null;
});

function pauseForLiveEdit(details, rule) {
  return new Promise((resolve) => {
    const id = uid();
    const entry = {
      resolve,
      url: details.url,
      method: details.method,
      requestHeaders: (details.requestHeaders || []).map((h) => ({ ...h })),
      ruleName: rule.name || "(unnamed rule)",
      time: Date.now(),
    };
    entry.timer = setTimeout(() => {
      if (!pendingRequests.has(id)) return;
      pendingRequests.delete(id);
      pushLogEntry({
        time: Date.now(),
        url: details.url,
        method: details.method,
        ruleId: rule.id,
        ruleName: rule.name,
        actionType: "live-timeout (sent unchanged)",
      });
      resolve({ requestHeaders: entry.requestHeaders });
    }, LIVE_TIMEOUT_MS);
    pendingRequests.set(id, entry);
    openOrFocusLiveQueue();
    pushLogEntry({
      time: Date.now(),
      url: details.url,
      method: details.method,
      ruleId: rule.id,
      ruleName: rule.name,
      actionType: "live-paused",
    });
  });
}

let state = {
  globalEnabled: true,
  rules: [], // loaded from storage.local.rules
};

let requestLog = []; // most recent first

function pushLogEntry(entry) {
  requestLog.unshift(entry);
  if (requestLog.length > MAX_LOG_ENTRIES) requestLog.length = MAX_LOG_ENTRIES;
}

async function loadState() {
  const stored = await browser.storage.local.get(["globalEnabled", "rules"]);
  state.globalEnabled = stored.globalEnabled !== false; // default true
  state.rules = Array.isArray(stored.rules) ? stored.rules : [];
  // Force matchers to recompile on next use.
  state.rules.forEach((r) => delete r._matcher);
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.globalEnabled || changes.rules) {
    loadState();
  }
});

loadState();

// ---------- onBeforeRequest: block / redirect / mock ----------
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!state.globalEnabled) return {};
    if (details.tabId === -1) return {}; // ignore extension/background traffic

    const rule = findMatchingRule(state.rules, details.url, details.method);
    if (!rule) return {};

    // Live-capture rules only act at the header stage (see
    // onBeforeSendHeaders) — skip block/redirect/mock handling and the
    // duplicate log entry here.
    if (rule.mode === "live") return {};

    const result = applyBeforeRequest(rule);

    pushLogEntry({
      time: Date.now(),
      url: details.url,
      method: details.method,
      ruleId: rule.id,
      ruleName: rule.name,
      actionType: rule.action && rule.action.type,
    });

    if (rule.action && rule.action.type === "delay") {
      const ms = Number(rule.action.delayMs) || 0;
      return delayFor(ms).then(() => ({}));
    }

    return result || {};
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// ---------- onBeforeSendHeaders: modify request headers ----------
browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!state.globalEnabled) return {};
    if (details.tabId === -1) return {};

    const rule = findMatchingRule(state.rules, details.url, details.method);
    if (!rule) return {};

    if (rule.mode === "live") {
      return pauseForLiveEdit(details, rule);
    }

    const result = applyBeforeSendHeaders(rule, details.requestHeaders || []);
    return result || {};
  },
  { urls: ["<all_urls>"] },
  ["blocking", "requestHeaders"]
);

// ---------- onHeadersReceived: modify response headers ----------
browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!state.globalEnabled) return {};
    if (details.tabId === -1) return {};

    const rule = findMatchingRule(state.rules, details.url, details.method);
    if (!rule) return {};

    const result = applyHeadersReceived(rule, details.responseHeaders || []);
    return result || {};
  },
  { urls: ["<all_urls>"] },
  ["blocking", "responseHeaders"]
);

// ---------- Messaging API for popup / options page ----------
browser.runtime.onMessage.addListener((message) => {
  switch (message && message.type) {
    case "GET_LOG":
      return Promise.resolve({ log: requestLog, globalEnabled: state.globalEnabled });
    case "CLEAR_LOG":
      requestLog = [];
      return Promise.resolve({ ok: true });
    case "GET_RULE_COUNT":
      return Promise.resolve({
        total: state.rules.length,
        enabled: state.rules.filter((r) => r.enabled).length,
      });
    case "OPEN_LIVE_QUEUE":
      openOrFocusLiveQueue();
      return Promise.resolve({ ok: true });
    case "GET_PENDING":
      return Promise.resolve({
        pending: Array.from(pendingRequests.entries()).map(([id, e]) => ({
          id,
          url: e.url,
          method: e.method,
          requestHeaders: e.requestHeaders,
          ruleName: e.ruleName,
          time: e.time,
        })),
      });
    case "RESOLVE_PENDING": {
      const entry = pendingRequests.get(message.id);
      if (!entry) return Promise.resolve({ ok: false, reason: "not-found" });
      clearTimeout(entry.timer);
      pendingRequests.delete(message.id);
      if (message.action === "cancel") {
        entry.resolve({ cancel: true });
      } else {
        entry.resolve({ requestHeaders: message.requestHeaders || entry.requestHeaders });
      }
      return Promise.resolve({ ok: true });
    }
    default:
      return undefined;
  }
});
