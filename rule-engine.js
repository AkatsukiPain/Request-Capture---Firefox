/**
 * rule-engine.js
 * Pure logic for matching requests against rules and computing the
 * webRequest response. Loaded before background.js into the same
 * background page scope (no bundler needed).
 */

const HTTP_METHODS_ANY = "ANY";

/**
 * Turn a rule's pattern + matchMode into a fast test(url) function.
 * matchMode: "contains" | "glob" | "regex"
 */
function compileMatcher(rule) {
  const { pattern, matchMode } = rule;
  if (!pattern) return () => false;

  try {
    if (matchMode === "regex") {
      const re = new RegExp(pattern);
      return (url) => re.test(url);
    }
    if (matchMode === "glob") {
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      const re = new RegExp("^" + escaped + "$");
      return (url) => re.test(url);
    }
    // default: contains
    return (url) => url.includes(pattern);
  } catch (e) {
    // Bad regex from the user shouldn't crash the whole engine.
    console.warn("[Catchpoint] Invalid pattern, rule disabled:", rule.name, e);
    return () => false;
  }
}

function ruleMatches(rule, url, method) {
  if (!rule.enabled) return false;
  if (rule.method && rule.method !== HTTP_METHODS_ANY && rule.method !== method) {
    return false;
  }
  const test = rule._matcher || (rule._matcher = compileMatcher(rule));
  return test(url);
}

/** Find the first enabled rule matching this request, in list order. */
function findMatchingRule(rules, url, method) {
  for (const rule of rules) {
    if (ruleMatches(rule, url, method)) return rule;
  }
  return null;
}

/**
 * onBeforeRequest handling: block / redirect / mock response.
 * Returns a BlockingResponse object, or null if nothing to do here
 * (header-only rules are handled in onBeforeSendHeaders instead).
 */
function applyBeforeRequest(rule) {
  const action = rule.action;
  if (!action) return null;

  switch (action.type) {
    case "block":
      return { cancel: true };

    case "redirect":
      if (action.redirectUrl) {
        return { redirectUrl: action.redirectUrl };
      }
      return null;

    case "mockResponse": {
      const mock = action.mock || {};
      const contentType = mock.contentType || "application/json";
      const body = mock.body != null ? mock.body : "";
      // Data URLs are the only way to fully short-circuit a request
      // (with a body) from onBeforeRequest without a native messaging
      // host. Status code is always 200 in this mode -- documented
      // limitation of the "quick mock" action.
      const dataUrl =
        "data:" + contentType + ";charset=utf-8," + encodeURIComponent(body);
      return { redirectUrl: dataUrl };
    }

    default:
      return null;
  }
}

/** Apply header add/remove ops to an array of {name, value} headers. */
function applyHeaderOps(headers, ops) {
  if (!ops || !ops.length) return headers;
  let result = headers.slice();
  for (const op of ops) {
    const lower = (op.name || "").toLowerCase();
    result = result.filter((h) => h.name.toLowerCase() !== lower);
    if (op.op === "set" && op.name) {
      result.push({ name: op.name, value: op.value || "" });
    }
  }
  return result;
}

function applyBeforeSendHeaders(rule, requestHeaders) {
  const action = rule.action;
  if (!action || action.type !== "modifyHeaders") return null;
  if (!action.requestHeaders || !action.requestHeaders.length) return null;
  return { requestHeaders: applyHeaderOps(requestHeaders, action.requestHeaders) };
}

function applyHeadersReceived(rule, responseHeaders) {
  const action = rule.action;
  if (!action || action.type !== "modifyHeaders") return null;
  if (!action.responseHeaders || !action.responseHeaders.length) return null;
  return { responseHeaders: applyHeaderOps(responseHeaders, action.responseHeaders) };
}

/** Async delay helper for the "delay" action, used as a blocking Promise. */
function delayFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
