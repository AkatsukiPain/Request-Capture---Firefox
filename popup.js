async function refreshRuleCount() {
  const res = await browser.runtime.sendMessage({ type: "GET_RULE_COUNT" });
  document.getElementById("ruleCount").textContent =
    `${res.enabled} of ${res.total} rule${res.total === 1 ? "" : "s"} active`;
}

function renderLog(entries) {
  const container = document.getElementById("log");
  if (!entries.length) {
    container.innerHTML =
      '<div class="empty-state">No requests caught yet. Browse somewhere and matching rules will show up here.</div>';
    return;
  }
  container.innerHTML = entries
    .slice(0, 30)
    .map((e) => {
      const time = new Date(e.time).toLocaleTimeString();
      return `
        <div class="log-row">
          <div class="log-row-top">
            <span class="log-method">${escapeHtml(e.method)}</span>
            <span class="log-url" title="${escapeHtml(e.url)}">${escapeHtml(e.url)}</span>
          </div>
          <div class="log-meta">${time} · ${escapeHtml(e.ruleName || "rule")} · ${escapeHtml(e.actionType || "")}</div>
        </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function refreshLog() {
  const res = await browser.runtime.sendMessage({ type: "GET_LOG" });
  renderLog(res.log || []);
  setBreaker(res.globalEnabled);
}

function setBreaker(on) {
  const el = document.getElementById("breaker");
  const label = document.getElementById("breakerLabel");
  el.classList.toggle("on", !!on);
  label.textContent = on ? "ON" : "OFF";
}

document.getElementById("breaker").addEventListener("click", async () => {
  const stored = await browser.storage.local.get("globalEnabled");
  const next = !(stored.globalEnabled !== false);
  await browser.storage.local.set({ globalEnabled: next });
  setBreaker(next);
});

document.getElementById("clearLog").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "CLEAR_LOG" });
  renderLog([]);
});

document.getElementById("openOptions").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

document.getElementById("openLiveQueue").addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "OPEN_LIVE_QUEUE" });
});

refreshRuleCount();
refreshLog();
setInterval(refreshLog, 1500);
